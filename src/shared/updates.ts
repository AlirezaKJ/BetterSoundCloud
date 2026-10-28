/**
 * Updating BetterSoundCloud: what kind of install this is, what the updater is doing, and every
 * word the user sees about it. Pure, so main and the settings panel share one copy and it is
 * tested without Electron. main/updater.ts drives electron-updater; this file decides.
 */

/** How this copy was installed, which decides what updating can mean for it. */
export type InstallKind =
  /** Windows, from the setup .exe: downloads and installs itself. */
  | 'installer'
  /** Linux AppImage: replaces its own file. */
  | 'appimage'
  /** Windows portable .exe: runs from a temporary folder and cannot replace itself. */
  | 'portable'
  /** Linux packages. Installing them needs root, and ours are unsigned, so the app only tells. */
  | 'deb'
  | 'rpm'
  /** macOS. Not shipped until notarization is funded; an unsigned app cannot update itself. */
  | 'mac'
  /** Run from source (`npm run dev`, `electron .`). */
  | 'source'
  /** Packaged, but not by a BetterSoundCloud release: an unpacked folder, Nix, a distro build. */
  | 'other'

/** What main knows about the running copy. Read by main, judged here. */
export type InstallFacts = {
  platform: string
  isPackaged: boolean
  /** `PORTABLE_EXECUTABLE_DIR`, which the portable build's launcher sets. */
  portableDir: string | undefined
  /** `APPIMAGE`, which the AppImage runtime sets to the file being run. */
  appImage: string | undefined
  /** `resources/package-type`, which electron-builder writes into the .deb and .rpm only. */
  packageType: string | null
}

export function installKind(facts: InstallFacts): InstallKind {
  if (!facts.isPackaged) return 'source'
  if (facts.platform === 'win32') return facts.portableDir ? 'portable' : 'installer'
  if (facts.platform === 'darwin') return 'mac'
  if (facts.platform === 'linux') {
    if (facts.appImage) return 'appimage'
    if (facts.packageType === 'deb') return 'deb'
    if (facts.packageType === 'rpm') return 'rpm'
  }
  return 'other'
}

/** What updating means for a kind: install itself, only say a new version exists, or nothing. */
export type UpdateReach = 'install' | 'tell' | 'none'

export function updateReach(kind: InstallKind): UpdateReach {
  switch (kind) {
    case 'installer':
    case 'appimage':
      return 'install'
    case 'portable':
    case 'deb':
    case 'rpm':
    case 'mac':
      return 'tell'
    case 'source':
    case 'other':
      return 'none'
  }
}

/** Why a check or a download failed, in the two ways the panel words differently. */
export type UpdateFailure = { kind: 'offline' } | { kind: 'other'; message: string }

/** Where the updater is. `current`, `auto` and `kind` ride along so the words need nothing else. */
export type UpdateState =
  /** This copy does not update itself (`source`, `other`). */
  | { state: 'not-here' }
  /** Nothing checked yet: automatic updates are off, or the first check has not run. */
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current' }
  /** A newer version exists and is not downloading: only told, or waiting for "Download". */
  | { state: 'available'; version: string }
  /** `percent` is null until the first progress report. */
  | { state: 'downloading'; version: string; percent: number | null }
  /** Downloaded and verified; installs on "Restart now", or on quit while updates are on. */
  | { state: 'ready'; version: string }
  | {
      state: 'failed'
      during: 'check' | 'download'
      failure: UpdateFailure
      /** The version that failed to download; absent for a failed check. */
      version?: string
    }

export type UpdateStatus = UpdateState & {
  /** The running version, `app.getVersion()`. */
  current: string
  /** The "Update automatically" setting. */
  auto: boolean
  kind: InstallKind
}

/** What the settings panel can ask main to do. Main ignores one the status does not offer. */
export const UPDATE_ACTIONS = ['check', 'download', 'install', 'open-release'] as const
export type UpdateAction = (typeof UPDATE_ACTIONS)[number]

export function isUpdateAction(value: unknown): value is UpdateAction {
  return typeof value === 'string' && (UPDATE_ACTIONS as readonly string[]).includes(value)
}

/** The words for a status line, and the one button it offers, if any. */
export type UpdateMessage = {
  lead: string
  detail: string
  problem: string
  action: { action: UpdateAction; label: string } | null
}

const CHECK_NOW = { action: 'check', label: 'Check now' } as const

/** How a copy that can only be told should get the new version. */
function howToGet(kind: InstallKind): string {
  switch (kind) {
    case 'portable':
      return 'This portable copy can’t replace itself, so download the new one.'
    case 'deb':
      return 'Download the new .deb and install it the way you installed this one.'
    case 'rpm':
      return 'Download the new .rpm and install it the way you installed this one.'
    default:
      return 'Download it from GitHub.'
  }
}

function describeFailure(failure: UpdateFailure): string {
  return failure.kind === 'offline'
    ? 'You seem to be offline.'
    : `The updater said: ${failure.message}`
}

export function describeUpdateStatus(status: UpdateStatus): UpdateMessage {
  const { current } = status
  switch (status.state) {
    case 'not-here':
      return status.kind === 'source'
        ? {
            lead: 'Running from source',
            detail: 'Only the installed app updates itself.',
            problem: '',
            action: null
          }
        : {
            lead: 'Updated elsewhere',
            detail:
              'This copy wasn’t installed from a BetterSoundCloud release, so whatever installed it keeps it up to date.',
            problem: '',
            action: null
          }

    case 'idle':
      return status.auto
        ? {
            lead: `You have ${current}`,
            detail: 'It looks for a newer version shortly after starting.',
            problem: '',
            action: CHECK_NOW
          }
        : {
            lead: `You have ${current}`,
            detail: 'Nothing is checked until you ask.',
            problem: '',
            action: CHECK_NOW
          }

    case 'checking':
      return { lead: 'Checking…', detail: '', problem: '', action: null }

    case 'current':
      return {
        lead: 'Up to date',
        detail: `${current} is the newest version.`,
        problem: '',
        action: CHECK_NOW
      }

    case 'available':
      return updateReach(status.kind) === 'install'
        ? {
            lead: `${status.version} is available`,
            detail: `You have ${current}.`,
            problem: '',
            action: { action: 'download', label: 'Download and install' }
          }
        : {
            lead: `${status.version} is available`,
            detail: howToGet(status.kind),
            problem: '',
            action: { action: 'open-release', label: 'Open download page' }
          }

    case 'downloading':
      return {
        // The ellipsis, as in "Checking…", also keeps the line from reading "0.8.1. 42%".
        lead: `Downloading ${status.version}…`,
        detail: status.percent === null ? '' : `${status.percent}%`,
        problem: '',
        action: null
      }

    case 'ready':
      return {
        lead: `${status.version} is ready`,
        detail: status.auto
          ? 'Restart now, or it installs the next time you quit.'
          : 'Restart now to install it.',
        problem: '',
        action: { action: 'install', label: 'Restart now' }
      }

    case 'failed':
      return status.during === 'download'
        ? {
            lead: `Couldn’t download ${status.version ?? 'the update'}`,
            detail: '',
            problem: describeFailure(status.failure),
            action: { action: 'download', label: 'Try again' }
          }
        : {
            lead: 'Couldn’t check for updates',
            detail: '',
            problem: describeFailure(status.failure),
            action: { action: 'check', label: 'Try again' }
          }
  }
}

/**
 * The system notification for a status, or null when it deserves none. Only two moments do:
 * an update downloaded and ready, and a new version this copy can only be told about.
 */
export function updateNotification(
  status: UpdateStatus
): { title: string; body: string } | null {
  if (status.state === 'ready') {
    return {
      title: `BetterSoundCloud ${status.version} is ready`,
      body: status.auto
        ? 'Restart to update, or it installs the next time you quit.'
        : 'Restart to update.'
    }
  }
  if (status.state === 'available' && updateReach(status.kind) === 'tell') {
    return {
      title: `BetterSoundCloud ${status.version} is available`,
      body: howToGet(status.kind)
    }
  }
  return null
}

/** Codes electron-updater uses when the newest release simply has no update feed. */
const NO_FEED_CODES = [
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
]

/** Chromium and Node network failures that mean "not reachable", not "something is broken". */
const OFFLINE =
  /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION_(?:REFUSED|RESET|TIMED_OUT|CLOSED)|ERR_PROXY_CONNECTION_FAILED|ERR_TIMED_OUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/

/**
 * What an error from electron-updater means here. `no-update` is the newest published release
 * having no `latest.yml` at all — true of every release before 0.8.0, which were made before
 * this updater existed — so it is "nothing newer", not a failure to show.
 */
export function readUpdateError(error: unknown): { kind: 'no-update' } | UpdateFailure {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)

  if (NO_FEED_CODES.includes(code)) return { kind: 'no-update' }
  if (OFFLINE.test(message)) return { kind: 'offline' }
  // electron-updater's messages run to stack traces and whole XML feeds; the first line is the
  // part a person can read.
  const firstLine = message.split('\n')[0]?.trim() ?? ''
  return { kind: 'other', message: firstLine.slice(0, 200) || 'An unknown error.' }
}

const REPO = 'https://github.com/AlirezaKJ/BetterSoundCloud'
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** The GitHub page for a release, or the releases list for anything that is not a version. */
export function releasePageUrl(version: string): string {
  return VERSION.test(version) ? `${REPO}/releases/tag/v${version}` : `${REPO}/releases`
}
