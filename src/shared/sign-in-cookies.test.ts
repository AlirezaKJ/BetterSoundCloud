import { describe, it, expect } from 'vitest'
import { EXPIRED, NOT_AN_EXPORT, NO_SIGN_IN, readSignInCookies } from './sign-in-cookies'

const NOW = 1_800_000_000
const LATER = NOW + 86_400 * 30

/** One entry the way Cookie-Editor exports it. Values here are made up. */
function cookie(name: string, domain: string, extra: Record<string, unknown> = {}) {
  return {
    domain,
    expirationDate: LATER,
    hostOnly: !domain.startsWith('.'),
    httpOnly: false,
    name,
    path: '/',
    sameSite: 'unspecified',
    secure: true,
    session: false,
    storeId: '0',
    value: `value-of-${name}`,
    ...extra
  }
}

/** A signed-in soundcloud.com tab's export: the sign-in among the rest (names measured 2026-11-11). */
const EXPORT = [
  cookie('oauth_token', 'soundcloud.com'),
  cookie('oauth_refresh_token', 'soundcloud.com', { httpOnly: true }),
  cookie('datadome', '.soundcloud.com'),
  cookie('sc_anonymous_id', '.soundcloud.com'),
  cookie('OptanonConsent', '.soundcloud.com'),
  cookie('_ga', '.soundcloud.com'),
  cookie('moe_uuid', '.soundcloud.com'),
  cookie('sc_theme', '.soundcloud.com'),
  cookie('connectId', '.soundcloud.com')
]

describe('readSignInCookies', () => {
  it('takes the sign-in and nothing else, never the bot check’s cookie', () => {
    const result = readSignInCookies(EXPORT, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookies.map((c) => c.name)).toEqual(['oauth_token', 'oauth_refresh_token'])
    expect(result.ignored).toBe(EXPORT.length - 2)
    expect(JSON.stringify(result.cookies)).not.toContain('datadome')
  })

  it('sets each one the way SoundCloud does: host-only, secure, its own httpOnly', () => {
    const result = readSignInCookies(EXPORT, NOW)
    if (!result.ok) throw new Error(result.error)
    expect(result.cookies[0]).toEqual({
      url: 'https://soundcloud.com/',
      name: 'oauth_token',
      value: 'value-of-oauth_token',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'unspecified',
      expirationDate: LATER
    })
    // No `domain`: Electron then keeps the cookie host-only, as SoundCloud set it. A `domain`
    // would make it `.soundcloud.com`, and a sign-out would leave that copy behind.
    expect(result.cookies.every((c) => !('domain' in c))).toBe(true)
    expect(result.cookies[1]?.httpOnly).toBe(true)
  })

  it('takes the sign-in service’s session too, when the export has it', () => {
    const result = readSignInCookies(
      [...EXPORT, cookie('_soundcloud_session', 'api-auth.soundcloud.com', { httpOnly: true })],
      NOW
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.cookies.at(-1)).toMatchObject({
      url: 'https://api-auth.soundcloud.com/',
      name: '_soundcloud_session',
      httpOnly: true
    })
  })

  it('matches name and host together, so a look-alike on another host is left alone', () => {
    const result = readSignInCookies(
      [
        cookie('oauth_token', 'evilsoundcloud.com'),
        cookie('oauth_token', 'secure.soundcloud.com'),
        cookie('_soundcloud_session', '.soundcloud.com')
      ],
      NOW
    )
    expect(result).toEqual({ ok: false, error: NO_SIGN_IN })
  })

  it('keeps a session cookie a session cookie, and skips an expired sign-in', () => {
    const session = readSignInCookies(
      [cookie('oauth_token', 'soundcloud.com', { expirationDate: undefined, session: true })],
      NOW
    )
    if (!session.ok) throw new Error(session.error)
    expect('expirationDate' in (session.cookies[0] ?? {})).toBe(false)

    expect(
      readSignInCookies(
        [cookie('oauth_token', 'soundcloud.com', { expirationDate: NOW - 1 })],
        NOW
      )
    ).toEqual({ ok: false, error: EXPIRED })
  })

  it('refuses values that are not cookie values, rather than passing them on', () => {
    for (const value of ['', 'a b', 'a;b', 'x'.repeat(5000), 42]) {
      const result = readSignInCookies(
        [cookie('oauth_token', 'soundcloud.com', { value })],
        NOW
      )
      expect(result.ok, String(value).slice(0, 10)).toBe(false)
    }
  })

  it('says plainly when the file is not an export, or has no sign-in in it', () => {
    expect(readSignInCookies({ cookies: [] }, NOW)).toEqual({ ok: false, error: NOT_AN_EXPORT })
    expect(readSignInCookies([], NOW)).toEqual({ ok: false, error: NO_SIGN_IN })
    expect(readSignInCookies([cookie('_ga', '.soundcloud.com'), null, 'x'], NOW)).toEqual({
      ok: false,
      error: NO_SIGN_IN
    })
  })
})
