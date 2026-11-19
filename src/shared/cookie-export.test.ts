import { describe, it, expect } from 'vitest'
import { parseCookieExport, readSignInCookies } from './sign-in-cookies'

const NOW = 1_800_000_000
const LATER = NOW + 86_400 * 30

/** A cookies.txt line, tab-separated, the way the Netscape format writes it. Values are made up. */
const line = (...fields: (string | number)[]): string => fields.join('\t')

const cookiesTxt = [
  '# Netscape HTTP Cookie File',
  '# https://curl.haxx.se/rfc/cookie_spec.html',
  '',
  line('.soundcloud.com', 'TRUE', '/', 'TRUE', LATER, 'oauth_token', '2-123456-abcdef'),
  line(
    '#HttpOnly_.soundcloud.com',
    'TRUE',
    '/',
    'TRUE',
    LATER,
    'oauth_refresh_token',
    'r3fresh'
  ),
  line('.soundcloud.com', 'TRUE', '/', 'TRUE', 0, 'sc_session', 'abc'),
  line('.soundcloud.com', 'TRUE', '/', 'TRUE', LATER, 'datadome', 'bot-check')
].join('\r\n')

describe('parseCookieExport', () => {
  it('reads a cookies.txt export, which the import used to ignore', () => {
    const entries = parseCookieExport(cookiesTxt)
    expect(entries).toHaveLength(4)
    const result = readSignInCookies(entries, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookies.map((c) => c.name).sort()).toEqual([
      'oauth_refresh_token',
      'oauth_token'
    ])
    // sc_session and, above all, datadome stay behind.
    expect(result.ignored).toBe(2)
  })

  it('keeps a cookies.txt expiry and HttpOnly, and gives a session cookie no expiry', () => {
    const entries = parseCookieExport(cookiesTxt) as Record<string, unknown>[]
    expect(entries[0]).toMatchObject({ name: 'oauth_token', expirationDate: LATER })
    expect(entries[1]).toMatchObject({ name: 'oauth_refresh_token', httpOnly: true })
    expect(entries[2]).not.toHaveProperty('expirationDate')
  })

  it('still reads Cookie-Editor JSON, with a byte-order mark in front too', () => {
    const json = JSON.stringify([
      { domain: '.soundcloud.com', name: 'oauth_token', value: 'x', path: '/' }
    ])
    expect(parseCookieExport(json)).toHaveLength(1)
    expect(parseCookieExport('﻿' + json)).toHaveLength(1)
  })

  it('is null for anything else, so the row can say it is not an export', () => {
    expect(parseCookieExport('')).toBeNull()
    expect(parseCookieExport('{"not":"an array"}')).toBeNull()
    expect(parseCookieExport('[broken json')).toBeNull()
    expect(parseCookieExport('hello\nthis is a text file')).toBeNull()
    expect(parseCookieExport('# only comments\n# here')).toBeNull()
  })
})
