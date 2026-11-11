/**
 * Which of a browser's SoundCloud cookies are its sign-in, for Settings → Advanced → "Import
 * browser sign-in" (src/main/cookie-import.ts). Pure, so the choice is tested on its own.
 *
 * ONLY THE SIGN-IN. A signed-in browser holds about fifty SoundCloud cookies (52 measured on
 * 2026-11-11): ads, analytics, consent, A/B tests, SoundCloud's preferences, and `datadome`, the
 * bot check's own cookie. Three of them are the sign-in. The rest are the browser's business; the
 * app has its own, and `datadome` above all must stay the app's own: DataDome issues it to one
 * client, and a cookie earned by another is exactly the mismatch a bot check looks for.
 */

/**
 * SoundCloud's sign-in, as a signed-in session holds it (measured 2026-11-11, names and flags
 * only). Each is host-only (no leading dot), secure and without a SameSite attribute, which is
 * how the import sets it again.
 */
export const SIGN_IN_COOKIES = [
  /** The sign-in itself: SoundCloud's page reads it and sends it with every API call. */
  { name: 'oauth_token', host: 'soundcloud.com', httpOnly: false, required: true },
  /** Renews the token when it expires. */
  { name: 'oauth_refresh_token', host: 'soundcloud.com', httpOnly: true, required: false },
  /** The sign-in service's own session. A tab's cookie export rarely includes it. */
  {
    name: '_soundcloud_session',
    host: 'api-auth.soundcloud.com',
    httpOnly: true,
    required: false
  }
] as const

/** A cookie ready for Electron's `session.cookies.set`: no `domain`, so it stays host-only. */
export type SignInCookie = {
  url: string
  name: string
  value: string
  path: '/'
  secure: true
  httpOnly: boolean
  sameSite: 'unspecified'
  expirationDate?: number
}

export type SignInImport =
  { ok: true; cookies: SignInCookie[]; ignored: number } | { ok: false; error: string }

/** Longer than any token SoundCloud issues; anything past it is not a cookie value. */
const MAX_VALUE_LENGTH = 4096
/** What a cookie value may hold: no whitespace, quotes, separators or control characters. */
const COOKIE_VALUE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/

/**
 * The sign-in cookies in a parsed cookie export: a JSON array of `{ domain, name, value, path,
 * expirationDate, … }`, as Cookie-Editor (and EditThisCookie) write it. `now` is in seconds.
 * Every other cookie is counted in `ignored` and goes no further.
 */
export function readSignInCookies(parsed: unknown, now: number): SignInImport {
  if (!Array.isArray(parsed)) {
    return { ok: false, error: NOT_AN_EXPORT }
  }

  const cookies: SignInCookie[] = []
  let expired = false
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const raw = entry as Record<string, unknown>
    const name = raw['name']
    const domain = raw['domain']
    if (typeof name !== 'string' || typeof domain !== 'string') continue

    const host = domain.replace(/^\./, '').toLowerCase()
    const wanted = SIGN_IN_COOKIES.find((c) => c.name === name && c.host === host)
    if (!wanted || cookies.some((c) => c.name === name)) continue

    const value = raw['value']
    if (
      typeof value !== 'string' ||
      value.length > MAX_VALUE_LENGTH ||
      !COOKIE_VALUE.test(value)
    )
      continue

    // A browser cookie without an expiry ends with the browser's session; keep it that way.
    const expires = raw['expirationDate']
    const expiry = typeof expires === 'number' && Number.isFinite(expires) ? expires : null
    if (expiry !== null && expiry <= now) {
      expired = true
      continue
    }

    cookies.push({
      url: `https://${wanted.host}/`,
      name,
      value,
      path: '/',
      secure: true,
      httpOnly: wanted.httpOnly,
      sameSite: 'unspecified',
      ...(expiry !== null ? { expirationDate: expiry } : {})
    })
  }

  const required = SIGN_IN_COOKIES.filter((c) => c.required)
  if (!required.every((r) => cookies.some((c) => c.name === r.name))) {
    return { ok: false, error: expired ? EXPIRED : NO_SIGN_IN }
  }
  return { ok: true, cookies, ignored: parsed.length - cookies.length }
}

export const NOT_AN_EXPORT =
  'That file isn’t a cookie export. In Cookie-Editor on soundcloud.com, choose Export, then JSON.'
export const NO_SIGN_IN =
  'That file has no SoundCloud sign-in in it. Sign in on soundcloud.com in your browser, then export its cookies again.'
export const EXPIRED =
  'The sign-in in that file has expired. Sign in on soundcloud.com in your browser, then export its cookies again.'
