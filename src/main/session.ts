import { shell } from 'electron'
import type { Session, WebContents } from 'electron'

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
 */
export function hardenSession(sess: Session, userAgent: string): void {
  sess.setUserAgent(userAgent)

  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isPermissionAllowed(permission))
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
    if (/^https?:$/.test(safeProtocol(url))) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Off-site top-level navigation leaves the app too.
  contents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault()
      if (/^https?:$/.test(safeProtocol(url))) void shell.openExternal(url)
    }
  })
}

function safeProtocol(rawUrl: string): string {
  try {
    return new URL(rawUrl).protocol
  } catch {
    return ''
  }
}
