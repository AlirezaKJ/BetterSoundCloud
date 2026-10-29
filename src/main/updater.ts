import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, Notification } from 'electron'
// CommonJS, and its `autoUpdater` is a getter that picks the platform's updater the moment it is
// read, so it is taken off the default export, and only read once this copy can update.
import electronUpdater from 'electron-updater'
import type { AppUpdater, ProgressInfo } from 'electron-updater'
import {
  installKind,
  readUpdateError,
  releasePageUrl,
  updateNotification,
  updateReach
} from '@shared/updates'
import type { InstallKind, UpdateAction, UpdateState, UpdateStatus } from '@shared/updates'
import { isDev } from './env'
import { relaunchAfterQuit } from './relaunch'
import { openInBrowser } from './session'

/*
 * The auto-updater: checks GitHub Releases, downloads in the background where this copy can
 * install itself, and installs on "Restart now" or when the app quits.
 *
 * What a copy can do depends on how it was installed (src/shared/updates.ts, `updateReach`):
 * the Windows setup .exe and the AppImage install themselves; the portable .exe, the .deb and the
 * .rpm only say a new version exists and link to it (the portable build cannot replace itself,
 * and installing our unsigned packages would mean root with signature checks off); a copy run
 * from source, or installed by Nix or a distro, does nothing.
 *
 * The feed is `latest.yml` / `latest-linux.yml`, which the release workflow attaches to every
 * release. electron-updater checks each download's sha512 against it, so a differential download
 * (Windows fetches only the changed blocks) is byte-identical to the VMP-signed installer.
 */

/**
 * The first check waits this long after Widevine settles: never before, so a first launch's
 * Widevine download is not sharing the line with ours, and SoundCloud gets the start to itself.
 */
const FIRST_CHECK_MS = 10_000
/** A music app stays open for days; look again twice a day. Each look fetches one small file. */
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000

export type UpdaterOptions = {
  /** The "Update automatically" setting at startup. Later changes come through `setAutoUpdate`. */
  auto: boolean
  /** A notification is redundant while the settings panel shows the same line. */
  isSettingsOpen: () => boolean
  /** Bring the window up with Settings open: where a click on the notification goes. */
  showSettings: () => void
}

let kind: InstallKind | null = null
let state: UpdateState = { state: 'idle' }
let auto = true
let options: UpdaterOptions | null = null
let updater: AppUpdater | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** The user pressed "Download and install" while automatic updates were off. */
let downloadWanted = false
const notified = new Set<string>()
// Held, or the notification can be collected before anyone clicks it.
let notification: Notification | null = null
const listeners = new Set<(status: UpdateStatus) => void>()

function currentKind(): InstallKind {
  kind ??= installKind({
    platform: process.platform,
    isPackaged: app.isPackaged,
    portableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
    appImage: process.env['APPIMAGE'],
    packageType: readPackageType(),
    updateConfig: hasUpdateConfig()
  })
  return kind
}

/** electron-builder writes this file when it builds the Windows installer, and not with `--dir`. */
function hasUpdateConfig(): boolean {
  try {
    return existsSync(join(process.resourcesPath, 'app-update.yml'))
  } catch {
    return false
  }
}

/** electron-builder writes `deb` or `rpm` into this file in those packages, and nowhere else. */
function readPackageType(): string | null {
  try {
    const file = join(process.resourcesPath, 'package-type')
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null
  } catch {
    return null
  }
}

const reach = () => updateReach(currentKind())

export function getUpdateStatus(): UpdateStatus {
  const shown: UpdateState = reach() === 'none' ? { state: 'not-here' } : state
  return { ...shown, current: app.getVersion(), auto, kind: currentKind() }
}

/** Run `listener` whenever the status changes; about once a second while downloading. */
export function onUpdateStatusChange(listener: (status: UpdateStatus) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setState(next: UpdateState): void {
  const before = state.state
  state = next
  const status = getUpdateStatus()
  // One line per change of state, not per percent.
  if (next.state !== before) console.log(`[updates] ${describeForLog(status)}`)
  for (const listener of listeners) listener(status)
  notify(status)
}

function describeForLog(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
    case 'downloading':
    case 'ready':
      return `${status.state} ${status.version} (have ${status.current}, ${status.kind})`
    case 'failed':
      return `${status.during} failed: ${status.failure.kind === 'offline' ? 'offline' : status.failure.message}`
    default:
      return `${status.state} (have ${status.current}, ${status.kind})`
  }
}

/** One notification per version, and none while the settings panel already says it. */
function notify(status: UpdateStatus): void {
  const words = updateNotification(status)
  if (!words || !('version' in status)) return
  if (notified.has(status.version) || options?.isSettingsOpen()) return
  notified.add(status.version)
  if (!Notification.isSupported()) return

  notification = new Notification({
    ...words,
    // The tray's file. Windows draws the app's own icon from its ID anyway.
    icon: nativeImage.createFromPath(join(import.meta.dirname, '../../resources/icon.png'))
  })
  notification.on('click', () => options?.showSettings())
  notification.show()
}

function getUpdater(): AppUpdater {
  if (updater) return updater
  const next = electronUpdater.autoUpdater
  // We decide when to download: at once while updates are on, on request while they are off.
  next.autoDownload = false
  next.allowPrerelease = false
  next.autoInstallOnAppQuit = auto && reach() === 'install'
  next.logger = isDev ? console : null
  next.on('download-progress', (progress: ProgressInfo) => {
    if (state.state !== 'downloading') return
    const percent = Math.floor(progress.percent)
    if (percent !== state.percent) setState({ ...state, percent })
  })
  // Every failure also rejects the promise that caused it, which is where it is handled; an
  // emitter's 'error' event with no listener would throw instead.
  next.on('error', () => undefined)
  updater = next
  return next
}

/**
 * Start checking: called once, after Widevine has settled. Before it, the status says a check is
 * coming, and "Check now" works.
 */
export function startUpdater(start: UpdaterOptions): void {
  if (options) return
  options = start
  auto = start.auto
  if (reach() === 'none') return
  schedule(FIRST_CHECK_MS)
}

/** The "Update automatically" setting changed. Off: no checks, no downloads, no install on quit. */
export function setAutoUpdate(on: boolean): void {
  if (on === auto) return
  auto = on
  if (updater) updater.autoInstallOnAppQuit = on && reach() === 'install'
  if (on) {
    if (options) schedule(FIRST_CHECK_MS)
  } else {
    clearSchedule()
  }
  // The words depend on it: "or it installs the next time you quit" holds only while it is on.
  setState(state)
}

function clearSchedule(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

/** The next automatic check. A `setTimeout` chain rather than an interval (ESLint bans those). */
function schedule(delay: number): void {
  clearSchedule()
  if (!auto || reach() === 'none') return
  timer = setTimeout(() => {
    timer = null
    void check().finally(() => schedule(CHECK_EVERY_MS))
  }, delay)
}

async function check(): Promise<void> {
  if (reach() === 'none') return
  // Busy, or already holding a downloaded update: checking again could only find the same one.
  if (state.state === 'checking' || state.state === 'downloading' || state.state === 'ready') {
    return
  }
  setState({ state: 'checking' })

  try {
    const result = await getUpdater().checkForUpdates()
    if (!result?.isUpdateAvailable) {
      setState({ state: 'current' })
      return
    }
    const { version } = result.updateInfo
    if (reach() === 'install' && (auto || downloadWanted)) {
      await download(version)
    } else {
      setState({ state: 'available', version })
    }
  } catch (error) {
    const read = readUpdateError(error)
    setState(
      read.kind === 'no-update'
        ? { state: 'current' }
        : { state: 'failed', during: 'check', failure: read }
    )
  }
}

async function download(version: string): Promise<void> {
  setState({ state: 'downloading', version, percent: null })
  try {
    await getUpdater().downloadUpdate()
    downloadWanted = false
    setState({ state: 'ready', version })
  } catch (error) {
    const read = readUpdateError(error)
    setState({
      state: 'failed',
      during: 'download',
      version,
      failure:
        read.kind === 'no-update'
          ? { kind: 'other', message: 'The release has no file for this copy.' }
          : read
    })
  }
}

/** A button in the settings panel. Anything the current status does not offer is ignored. */
export function runUpdateAction(action: UpdateAction): void {
  switch (action) {
    case 'check':
      void check()
      return

    case 'download': {
      if (reach() !== 'install') return
      const version =
        state.state === 'available' || (state.state === 'failed' && state.during === 'download')
          ? state.version
          : undefined
      if (!version) return
      downloadWanted = true
      // A failed download is retried by checking again first: electron-updater downloads only
      // what its last check found.
      if (state.state === 'failed') void check()
      else void download(version)
      return
    }

    case 'install':
      if (state.state === 'ready') installNow()
      return

    case 'open-release':
      if (state.state === 'available') openInBrowser(releasePageUrl(state.version))
      return
  }
}

function installNow(): void {
  // Electron sets CHROME_DESKTOP in this process as it starts, the new version starts with this
  // environment, and the Castlabs build dies at startup on Linux whenever it is set: the update
  // would install and then never open (CLAUDE.md §1, castlabs#165).
  delete process.env['CHROME_DESKTOP']
  const update = getUpdater()

  if (currentKind() === 'appimage') {
    // Left to electron-updater, the new AppImage starts BEFORE this copy quits, finds the
    // single-instance lock still held, and exits: the update installed and nothing came back
    // (measured 2026-10-28). So it only swaps the file here, and relaunch.ts starts the new one
    // once this copy has exited. The file is renamed when its name carries the version.
    let newFile = process.env['APPIMAGE']
    update.once('appimage-filename-updated', (path: string) => {
      newFile = path
    })
    update.quitAndInstall(true, false)
    relaunchAfterQuit(newFile)
    return
  }

  // Windows: the installer waits for this copy to close, installs without its wizard (silent),
  // then opens the new version itself.
  update.quitAndInstall(true, true)
}
