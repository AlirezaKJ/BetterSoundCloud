/**
 * What BetterSoundCloud says while SoundCloud's page cannot be shown.
 *
 * v0.7.x said nothing. A failed load left a blank window (#50), an offline first launch quit
 * with no message (#96), and a stuck loading overlay stranded people with no way forward
 * (#109, #55). The users this rewrite is for "cannot inspect it; the app has to tell them"
 * (docs/PRODUCT.md), so every one of those moments now has words and, where something can be
 * done, a button.
 *
 * Main decides WHICH status applies (src/main/page-status.ts) and sends it to a view of our
 * own drawn over the content area (src/renderer/status). This file turns a status into the
 * words and buttons that view shows. It is pure so that the wording rules can be tested, and
 * so the Svelte component has no judgement in it.
 */

export type PageStatus =
  /** Widevine is being installed. Only shown once that takes long enough to notice. */
  | { kind: 'setting-up'; slow: boolean }
  /** Widevine is ready and SoundCloud's first page has not arrived yet. */
  | { kind: 'loading' }
  /** Widevine could not be installed. SoundCloud stays closed unless the user goes on without it. */
  | { kind: 'setup-failed'; detail: string }
  /** SoundCloud's page did not load. `code` and `error` are Chromium's, e.g. -106 ERR_INTERNET_DISCONNECTED. */
  | { kind: 'load-failed'; code: number; error: string; retrying: boolean }
  /** The page's renderer process ended. `reason` is Electron's `render-process-gone` reason. */
  | { kind: 'crashed'; reason: string }
  /** The page stopped responding. It may recover by itself. */
  | { kind: 'unresponsive' }

/**
 * The verbs the status view can send back. Main checks the current status before acting on
 * one, so a stale button press does nothing rather than something surprising.
 */
export const PAGE_STATUS_ACTIONS = [
  'retry',
  'reload',
  'wait',
  'restart',
  'continue',
  'quit'
] as const
export type PageStatusAction = (typeof PAGE_STATUS_ACTIONS)[number]

export function isPageStatusAction(value: unknown): value is PageStatusAction {
  return PAGE_STATUS_ACTIONS.some((action) => action === value)
}

/**
 * Whether the status takes the place of SoundCloud's page, rather than floating over it.
 *
 * Only a hang leaves the page on screen: it is still there, frozen, and may come back, so the
 * question is asked in a dialog over it. Everything else means there is no page to look at.
 */
export function hidesPage(status: PageStatus): boolean {
  return status.kind !== 'unresponsive'
}

export type StatusButton = { action: PageStatusAction; label: string; disabled: boolean }

export type StatusMessage = {
  title: string
  body: string
  /** A technical line for bug reports — an error code, a reason. Empty when there is none. */
  detail: string
  /** First is the default: it gets focus, so Enter does the expected thing. */
  buttons: StatusButton[]
  /** Something is in progress, so the view shows that it is working rather than stuck. */
  waiting: boolean
}

const WIDEVINE = 'Widevine, which SoundCloud needs to play protected tracks'

const RESTART: StatusButton = {
  action: 'restart',
  label: 'Restart BetterSoundCloud',
  disabled: false
}
const QUIT: StatusButton = { action: 'quit', label: 'Quit', disabled: false }
/**
 * For networks that block Google's component updater (a firewall, a proxy, a region), where
 * Restart can never succeed. It brings back the auto-skip bug on purpose, for this launch only,
 * so the body above it must say so.
 */
const CONTINUE: StatusButton = {
  action: 'continue',
  label: 'Continue without Widevine',
  disabled: false
}
const RELOAD: StatusButton = { action: 'reload', label: 'Reload', disabled: false }

export function describePageStatus(status: PageStatus): StatusMessage {
  switch (status.kind) {
    case 'setting-up':
      return {
        title: 'Setting up playback',
        body: status.slow
          ? `Still downloading ${WIDEVINE}. A slow connection or a proxy can make this take ` +
            'a few minutes. SoundCloud opens by itself as soon as it finishes.'
          : `Downloading ${WIDEVINE}. This normally happens only on the first launch.`,
        detail: '',
        // Restarting throws the download away, so it is offered only once waiting has stopped
        // looking normal — never as the first thing a user sees.
        buttons: status.slow ? [RESTART] : [],
        waiting: true
      }

    case 'loading':
      return {
        title: 'Loading SoundCloud',
        body: 'Waiting for soundcloud.com to answer.',
        detail: '',
        buttons: [],
        waiting: true
      }

    case 'setup-failed':
      return {
        title: 'Couldn’t set up playback',
        body:
          `BetterSoundCloud has to download ${WIDEVINE}, and the download failed. Check your ` +
          'connection: BetterSoundCloud keeps trying, and SoundCloud opens by itself once the ' +
          'download finishes. If your network blocks it, you can continue without Widevine, ' +
          'but protected tracks will be greyed out and skip until it arrives.',
        detail: status.detail,
        // Restart first: it is the fix. Continuing is the way on when the fix cannot work.
        buttons: [RESTART, CONTINUE, QUIT],
        waiting: false
      }

    case 'load-failed': {
      const failure = describeLoadFailure(status.code)
      return {
        title: failure.title,
        body: failure.body,
        detail: status.error,
        buttons: [
          {
            action: 'retry',
            label: status.retrying ? 'Trying again…' : 'Try again',
            disabled: status.retrying
          }
        ],
        waiting: status.retrying
      }
    }

    case 'crashed':
      return {
        title: 'SoundCloud’s page stopped working',
        body: `${crashCause(status.reason)}Reloading usually brings it back.`,
        detail: status.reason,
        buttons: [RELOAD],
        waiting: false
      }

    case 'unresponsive':
      return {
        title: 'SoundCloud isn’t responding',
        body: 'It may recover if you wait a moment, or you can reload the page.',
        detail: '',
        // Wait first: it is the choice that cannot lose anything.
        buttons: [{ action: 'wait', label: 'Wait', disabled: false }, RELOAD],
        waiting: false
      }
  }
}

export type LoadFailure = {
  title: string
  body: string
  /**
   * Whether main retries on its own. True for failures that fix themselves when the network
   * does. False where retrying cannot help until the user changes something — a certificate
   * problem does not go away by asking again.
   */
  autoRetry: boolean
}

/**
 * What a Chromium net error means to someone who just wants SoundCloud to open.
 *
 * Codes are Chromium's `net/base/net_error_list.h`. Only main-frame failures reach this; a
 * blocked page from SoundCloud's bot check is an HTTP 200 and never does.
 */
export function describeLoadFailure(code: number): LoadFailure {
  if (code === -106 /* INTERNET_DISCONNECTED */) {
    return {
      title: 'You’re offline',
      body: 'Check your internet connection. SoundCloud loads as soon as you’re back online.',
      autoRetry: true
    }
  }

  if (code === -105 /* NAME_NOT_RESOLVED */ || code === -137 /* NAME_RESOLUTION_FAILED */) {
    return {
      title: 'Can’t find soundcloud.com',
      body:
        'Your network couldn’t look up SoundCloud’s address. Check your connection, or a ' +
        'VPN, firewall or DNS filter that might be blocking it. BetterSoundCloud keeps trying.',
      autoRetry: true
    }
  }

  if (code === -7 /* TIMED_OUT */ || code === -118 /* CONNECTION_TIMED_OUT */) {
    return {
      title: 'SoundCloud took too long to answer',
      body:
        'Your connection may be slow, or SoundCloud may be having trouble. ' +
        'BetterSoundCloud keeps trying.',
      autoRetry: true
    }
  }

  if (
    code === -111 /* TUNNEL_CONNECTION_FAILED */ ||
    code === -115 /* PROXY_AUTH_UNSUPPORTED */ ||
    code === -120 /* SOCKS_CONNECTION_FAILED */ ||
    code === -121 /* SOCKS_CONNECTION_HOST_UNREACHABLE */ ||
    code === -130 /* PROXY_CONNECTION_FAILED */
  ) {
    return {
      title: 'Can’t reach the proxy',
      body:
        'BetterSoundCloud uses your system’s proxy settings, and the proxy server didn’t ' +
        'answer. Check those settings or your network. BetterSoundCloud keeps trying.',
      autoRetry: true
    }
  }

  if (
    (code <= -200 && code > -300) /* every CERT_ error */ ||
    code === -107 /* SSL_PROTOCOL_ERROR */ ||
    code === -113 /* SSL_VERSION_OR_CIPHER_MISMATCH */ ||
    code === -501 /* INSECURE_RESPONSE */
  ) {
    return {
      title: 'Can’t connect securely',
      body:
        'Something interfered with the secure connection to SoundCloud. Antivirus software ' +
        'and work or school networks are the usual causes.',
      autoRetry: false
    }
  }

  if (
    code === -22 /* BLOCKED_BY_ADMINISTRATOR */ ||
    code === -138 /* NETWORK_ACCESS_DENIED */
  ) {
    return {
      title: 'The connection was blocked',
      body:
        'A firewall or security setting on this computer stopped BetterSoundCloud from ' +
        'reaching SoundCloud.',
      autoRetry: false
    }
  }

  if (
    code === -21 /* NETWORK_CHANGED */ ||
    (code <= -100 &&
      code >= -104) /* CONNECTION_CLOSED, _RESET, _REFUSED, _ABORTED, _FAILED */ ||
    code === -109 /* ADDRESS_UNREACHABLE */ ||
    code === -324 /* EMPTY_RESPONSE */
  ) {
    return {
      title: 'Can’t connect to SoundCloud',
      body: 'The connection dropped before the page loaded. BetterSoundCloud keeps trying.',
      autoRetry: true
    }
  }

  return {
    title: 'SoundCloud didn’t load',
    body: 'Something went wrong while loading the page.',
    autoRetry: false
  }
}

/**
 * How long to wait before retrying a failed load by itself, after `attempt` failures in a row.
 *
 * Chrome's own schedule for auto-reloading a network error page
 * (components/error_page/content/browser/net_error_auto_reloader.cc). Parity, not invention:
 * this is exactly how often a browser tab left on the same error would ask SoundCloud again,
 * and it backs off to once every half hour rather than hammering a host that is down.
 */
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 60_000, 300_000, 600_000, 1_800_000]

export function retryDelay(attempt: number): number {
  const index = Math.min(Math.max(0, Math.floor(attempt)), RETRY_DELAYS_MS.length - 1)
  return RETRY_DELAYS_MS[index] ?? 1_800_000
}

/** One plain sentence about why the page's process ended, or nothing when the reason says nothing useful. */
function crashCause(reason: string): string {
  switch (reason) {
    case 'oom':
    case 'memory-eviction':
      return 'It ran out of memory. '
    case 'killed':
      return 'Something outside BetterSoundCloud closed it. '
    case 'launch-failed':
      return 'It couldn’t start. '
    case 'integrity-failure':
      return 'Windows code integrity checks stopped it. '
    default:
      return ''
  }
}

/**
 * The reason Castlabs' `components.whenReady()` gave for failing, as one line.
 *
 * It rejects with a `ComponentsError` whose `errors` each carry a message — measured offline
 * on a fresh profile: `Failed to install required components`, with one error reading
 * `Update check error`. Typed as `unknown` because a rejection can be anything.
 */
export function describeComponentsError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)

  const errors: unknown = 'errors' in error ? error.errors : undefined
  if (Array.isArray(errors)) {
    const messages = errors.map(messageOf).filter((message) => message !== '')
    if (messages.length > 0) return [...new Set(messages)].join('; ')
  }

  return messageOf(error) || 'Unknown error'
}

/**
 * The Widevine version Castlabs' `components.status()` reports as installed, or null while there
 * is none. `id` is Widevine's key in that record (`components.WIDEVINE_CDM_ID`). Measured after a
 * failed install, 2026-10-28: the entry reads `{ status: 'not-installed', version: null }` until
 * Chromium's updater finishes by itself, then `{ status: 'updated', version: '4.10.3112.0' }`.
 */
export function installedWidevineVersion(status: unknown, id: string): string | null {
  if (typeof status !== 'object' || status === null) return null
  const entry: unknown = (status as Record<string, unknown>)[id]
  if (typeof entry !== 'object' || entry === null || !('version' in entry)) return null
  return typeof entry.version === 'string' && entry.version !== '' ? entry.version : null
}

function messageOf(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('message' in value)) return ''
  return typeof value.message === 'string' ? value.message : ''
}
