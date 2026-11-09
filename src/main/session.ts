import { shell } from 'electron'
import type { Session, WebContents } from 'electron'
import type { Identity } from '@shared/identity'

/**
 * Permissions we grant. Everything else is denied.
 *
 * `mediaKeySystem` is load-bearing: it is Widevine. v0.7.x installed no permission
 * handler at all, so Electron granted it by default and DRM playback depended on that
 * accident. Adding a default-deny handler and forgetting this string reintroduces a
 * failure visually identical to an unsigned VMP build — greyed-out, auto-skipping
 * tracks — and it will be misdiagnosed. The test in session.test.ts guards it.
 */
const ALLOWED_PERMISSIONS = new Set<string>([
  'mediaKeySystem',
  'fullscreen',
  'clipboard-sanitized-write'
])

export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

/**
 * Capturing a view's audio, for the audio engine (src/main/audio.ts). Electron attributes that
 * request to the view being CAPTURED — SoundCloud's — not to the view asking: measured 2026-11-09
 * in this Electron, the handler gets the content view, `media` with no media types, and our own
 * renderer's origin (`file:///`). So nothing standing is granted, to that view or any other.
 * Main arms one grant just before it makes a capture id, for that one view, as long as the id
 * lives; the first request that matches it in every respect uses it up. Permission checks stay
 * denied: the capture does not need them (measured the same day).
 */
const CAPTURE_ID_LIFETIME_MS = 10_000
let armed: { contentsId: number; until: number } | null = null

export function expectTabAudioCapture(captured: WebContents, now = Date.now()): void {
  armed = { contentsId: captured.id, until: now + CAPTURE_ID_LIFETIME_MS }
}

export function mayCaptureAudio(
  contents: WebContents | null,
  permission: string,
  request: { mediaTypes?: readonly string[] | undefined; securityOrigin?: string | undefined },
  now = Date.now()
): boolean {
  if (!armed || !contents || now > armed.until) return false
  if (permission !== 'media' || contents.id !== armed.contentsId) return false
  // A tab capture names no camera or microphone; a request that does is something else.
  if ((request.mediaTypes ?? []).length > 0) return false
  // From one of our renderers, never from SoundCloud's page.
  if (!isOwnRendererOrigin(request.securityOrigin)) return false
  armed = null
  return true
}

/** Our renderers: `file:` in a packaged app, the dev server on this machine while developing. */
function isOwnRendererOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'file:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    )
  } catch {
    return false
  }
}

/** Origins the content view is allowed to navigate to in-place. */
const ALLOWED_HOSTS = [
  'soundcloud.com',
  'secure.soundcloud.com',
  'checkout.soundcloud.com',
  'sndcdn.com'
]

export function isInternalUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return ALLOWED_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  )
}

/**
 * Harden a session.
 *
 * IMPORTANT: callers must pass the session taken BY REFERENCE off the view they just
 * created (`view.webContents.session`), never `session.defaultSession` and never a
 * partition string. In v0.7.x `app/index.html:19` wrote `persist:webviewsession` as a
 * bare valueless attribute, so Electron ignored it and the guest silently fell back to
 * `defaultSession` — which is what the UA rewrite, the preloads, the cookie import and
 * the ad blocker were all attached to. "Fixing" that attribute would have detached all
 * four with no error. Holding the object removes the whole class of bug.
 *
 * Note what this function does NOT do: it does not register `onBeforeSendHeaders`, and
 * it does not touch `sec-ch-ua`. The user agent is set once on `app.userAgentFallback`
 * before `whenReady()`. Chromium then emits client hints that agree with it.
 *
 * The language list goes in through the same call, as Electron's own setting rather than a
 * rewritten header: Chromium then generates `Accept-Language` from it, q-values included, on
 * every request from every context in the session. See `acceptLanguages` in
 * src/shared/identity.ts for why the list is what it is.
 */
export function hardenSession(sess: Session, identity: Identity): void {
  sess.setUserAgent(identity.userAgent, identity.acceptLanguages)

  sess.setPermissionRequestHandler((wc, permission, callback, details) => {
    const request = {
      mediaTypes: 'mediaTypes' in details ? details.mediaTypes : undefined,
      securityOrigin: 'securityOrigin' in details ? details.securityOrigin : undefined
    }
    callback(isPermissionAllowed(permission) || mayCaptureAudio(wc, permission, request))
  })

  sess.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission))
}

/**
 * Route anything that wants a new window to the real browser.
 *
 * This is why Google sign-in fails in v0.7.x with `disallowed_useragent`: OAuth
 * providers refuse embedded webviews on purpose, and the correct flow for a native app
 * is the system browser (RFC 8252). v0.7.x set `allowpopups` on the webview and
 * registered no `setWindowOpenHandler` anywhere, leaving the sign-in popup completely
 * ungoverned. This is compliance with how OAuth is meant to work, not a workaround.
 */
export function routeNewWindowsToBrowser(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url)
    return { action: 'deny' }
  })

  // Off-site top-level navigation leaves the app too.
  contents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault()
      openInBrowser(url)
    }
  })
}

/**
 * Open a URL in the user's real browser — and only an http(s) one. `shell.openExternal`
 * would happily hand `file:` or a custom scheme to the OS, which is how a page gets to launch
 * programs, so the scheme is checked here rather than trusted at each call site.
 */
export function openInBrowser(rawUrl: string): void {
  if (/^https?:$/.test(safeProtocol(rawUrl))) void shell.openExternal(rawUrl)
}

function safeProtocol(rawUrl: string): string {
  try {
    return new URL(rawUrl).protocol
  } catch {
    return ''
  }
}
