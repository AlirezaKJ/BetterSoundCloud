import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UpdateStatus } from '@shared/updates'

/*
 * The updater against a fake electron-updater. updater.ts keeps its state at module level and
 * reads how it was installed once, so every test loads a fresh copy (`load`) for its platform.
 */

type Handler = (arg: unknown) => void
type FakeNotification = { title: string; body: string; click?: () => void; shown: boolean }

const mocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  relaunch: vi.fn(),
  openInBrowser: vi.fn(),
  handlers: new Map<string, Handler>(),
  notifications: [] as FakeNotification[],
  isPackaged: true,
  /** How often anything read `autoUpdater`, which builds the platform's real updater. */
  updaterReads: 0,
  /** The fake electron-updater, set by its mock below, so tests can read what was configured. */
  fake: Object.create(null) as Record<string, unknown>
}))

vi.mock('electron-updater', () => {
  const fake = {
    autoDownload: true,
    allowPrerelease: true,
    autoInstallOnAppQuit: true,
    logger: undefined as unknown,
    on: (event: string, handler: Handler) => {
      mocks.handlers.set(event, handler)
      return fake
    },
    once: (event: string, handler: Handler) => {
      mocks.handlers.set(event, handler)
      return fake
    },
    checkForUpdates: mocks.checkForUpdates,
    downloadUpdate: mocks.downloadUpdate,
    quitAndInstall: mocks.quitAndInstall
  }
  mocks.fake = fake
  return {
    default: {
      get autoUpdater() {
        mocks.updaterReads++
        return fake
      }
    }
  }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    },
    getVersion: () => '0.8.0'
  },
  nativeImage: { createFromPath: () => ({}) },
  Notification: class {
    static isSupported(): boolean {
      return true
    }
    private record: FakeNotification
    constructor(options: { title: string; body: string }) {
      this.record = { title: options.title, body: options.body, shown: false }
      mocks.notifications.push(this.record)
    }
    on(_event: 'click', callback: () => void): void {
      this.record.click = callback
    }
    show(): void {
      this.record.shown = true
    }
  }
}))
vi.mock('./session', () => ({ openInBrowser: mocks.openInBrowser }))
vi.mock('./env', () => ({ isDev: false }))
// relaunch.test.ts covers how; here only whether, and which file.
vi.mock('./relaunch', () => ({ relaunchAfterQuit: mocks.relaunch }))

const realPlatform = process.platform
const ENV_KEYS = ['APPIMAGE', 'PORTABLE_EXECUTABLE_DIR', 'CHROME_DESKTOP'] as const
// An installed copy's resources folder: the Windows installer writes app-update.yml there.
const RESOURCES = mkdtempSync(join(tmpdir(), 'bsc-updater-test-'))
writeFileSync(join(RESOURCES, 'app-update.yml'), 'provider: github\n')

async function load(
  platform: NodeJS.Platform,
  env: Partial<Record<(typeof ENV_KEYS)[number], string>>
) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, env)
  vi.resetModules()
  const updater = await import('./updater')
  const seen: UpdateStatus[] = []
  updater.onUpdateStatusChange((status) => {
    seen.push(status)
  })
  return { updater, seen }
}

const options = (over: Partial<{ auto: boolean; isSettingsOpen: () => boolean }> = {}) => ({
  auto: true,
  isSettingsOpen: () => false,
  showSettings: vi.fn(),
  ...over
})

const found = (version: string) => ({ isUpdateAvailable: true, updateInfo: { version } })
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.checkForUpdates.mockReset()
  mocks.downloadUpdate.mockReset().mockResolvedValue([])
  mocks.quitAndInstall.mockReset()
  mocks.relaunch.mockReset()
  mocks.openInBrowser.mockReset()
  mocks.handlers.clear()
  mocks.notifications.length = 0
  mocks.isPackaged = true
  mocks.updaterReads = 0
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('an AppImage with automatic updates on', () => {
  it('checks after Widevine, downloads in the background, and says so once', async () => {
    const { updater, seen } = await load('linux', {
      APPIMAGE: '/home/a/BetterSoundCloud.AppImage'
    })
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    mocks.downloadUpdate.mockImplementation(() => {
      mocks.handlers.get('download-progress')?.({ percent: 41.7 })
      return Promise.resolve([])
    })
    const start = options()
    updater.startUpdater(start)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settle()

    expect(mocks.downloadUpdate).toHaveBeenCalledOnce()
    expect(seen.map((s) => s.state)).toEqual([
      'checking',
      'downloading',
      'downloading',
      'ready'
    ])
    expect(seen.find((s) => s.state === 'downloading' && s.percent === 41)).toBeTruthy()
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'ready',
      version: '0.8.1',
      auto: true
    })

    // We decide when to download; it installs on quit while updates are on.
    expect(mocks.fake).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: true })

    expect(mocks.notifications).toEqual([
      expect.objectContaining({ title: 'BetterSoundCloud 0.8.1 is ready', shown: true })
    ])
    mocks.notifications[0]!.click?.()
    expect(start.showSettings).toHaveBeenCalledOnce()
  })

  it('swaps the file, then lets Electron start the new one once this copy has quit', async () => {
    const { updater } = await load('linux', {
      APPIMAGE: '/home/a/BetterSoundCloud-0.8.0-linux-x86_64.AppImage'
    })
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    updater.runUpdateAction('check')
    await settle()

    // Electron sets it as the app starts; the Castlabs build dies at startup while it is set.
    process.env['CHROME_DESKTOP'] = 'bettersoundcloud.desktop'
    let atInstall: string | undefined = 'not called'
    mocks.quitAndInstall.mockImplementation(() => {
      atInstall = process.env['CHROME_DESKTOP']
      // electron-updater renames the file when its name carries the version.
      mocks.handlers.get('appimage-filename-updated')?.(
        '/home/a/BetterSoundCloud-0.8.1-linux-x86_64.AppImage'
      )
    })
    updater.runUpdateAction('install')

    expect(atInstall).toBeUndefined()
    // Not force-run: the new AppImage would start while this copy still holds the
    // single-instance lock, and exit (measured).
    expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, false)
    expect(mocks.relaunch).toHaveBeenCalledWith(
      '/home/a/BetterSoundCloud-0.8.1-linux-x86_64.AppImage'
    )
  })

  it('stays quiet while the settings panel already shows it', async () => {
    const { updater } = await load('linux', { APPIMAGE: '/a.AppImage' })
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    updater.startUpdater(options({ isSettingsOpen: () => true }))
    updater.runUpdateAction('check')
    await settle()

    expect(updater.getUpdateStatus().state).toBe('ready')
    expect(mocks.notifications).toEqual([])
  })
})

describe('with automatic updates off', () => {
  it('checks and downloads only when asked, and does not install on quit', async () => {
    const { updater } = await load('win32', {})
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    updater.startUpdater(options({ auto: false }))

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()

    updater.runUpdateAction('check')
    await settle()
    expect(updater.getUpdateStatus()).toMatchObject({ state: 'available', version: '0.8.1' })
    expect(mocks.downloadUpdate).not.toHaveBeenCalled()

    updater.runUpdateAction('download')
    await settle()
    expect(updater.getUpdateStatus()).toMatchObject({ state: 'ready', auto: false })
    expect(mocks.fake['autoInstallOnAppQuit']).toBe(false)

    // Windows' installer waits for this copy to close, then opens the new version itself.
    updater.runUpdateAction('install')
    expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(mocks.relaunch).not.toHaveBeenCalled()
  })

  it('cancels the coming check, and the install on quit, when switched off', async () => {
    const { updater } = await load('win32', {})
    updater.startUpdater(options())
    updater.setAutoUpdate(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus().auto).toBe(false)
  })
})

describe('a copy that cannot install itself', () => {
  it('says a new version exists and links to it, and never downloads', async () => {
    const { updater } = await load('win32', {
      PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\a\\Downloads'
    })
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    updater.startUpdater(options())
    await vi.advanceTimersByTimeAsync(10_000)
    await settle()

    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'available',
      version: '0.8.1',
      kind: 'portable'
    })
    expect(mocks.notifications.map((n) => n.title)).toEqual([
      'BetterSoundCloud 0.8.1 is available'
    ])

    updater.runUpdateAction('download')
    await settle()
    expect(mocks.downloadUpdate).not.toHaveBeenCalled()

    updater.runUpdateAction('open-release')
    expect(mocks.openInBrowser).toHaveBeenCalledWith(
      'https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/v0.8.1'
    )
  })

  it('does nothing at all when run from source', async () => {
    mocks.isPackaged = false
    const { updater } = await load('linux', {})
    updater.startUpdater(options())
    await vi.advanceTimersByTimeAsync(60_000)
    updater.runUpdateAction('check')
    await settle()

    expect(updater.getUpdateStatus()).toMatchObject({ state: 'not-here', kind: 'source' })
    expect(mocks.updaterReads).toBe(0)
    expect(mocks.checkForUpdates).not.toHaveBeenCalled()
  })
})

describe('failures', () => {
  it('reads a newest release without an update feed as up to date', async () => {
    const { updater } = await load('win32', {})
    mocks.checkForUpdates.mockRejectedValue(
      Object.assign(new Error('Cannot find latest.yml'), {
        code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
      })
    )
    updater.runUpdateAction('check')
    await settle()
    expect(updater.getUpdateStatus().state).toBe('current')
  })

  it('says it is offline, and checks again on Try again', async () => {
    const { updater } = await load('win32', {})
    mocks.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))
    updater.runUpdateAction('check')
    await settle()
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'failed',
      during: 'check',
      failure: { kind: 'offline' }
    })

    mocks.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: false })
    updater.runUpdateAction('check')
    await settle()
    expect(updater.getUpdateStatus().state).toBe('current')
  })

  it('retries a failed download by checking again first', async () => {
    const { updater } = await load('win32', {})
    mocks.checkForUpdates.mockResolvedValue(found('0.8.1'))
    mocks.downloadUpdate.mockRejectedValueOnce(new Error('sha512 checksum mismatch'))
    updater.runUpdateAction('check')
    await settle()
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'failed',
      during: 'download',
      version: '0.8.1'
    })

    updater.runUpdateAction('download')
    await settle()
    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(updater.getUpdateStatus().state).toBe('ready')
  })
})
