import { describe, it, expect } from 'vitest'
import { buildUserAgent, leaksAppIdentity } from './identity'

describe('buildUserAgent', () => {
  it('produces a stock Chromium UA for the running Chromium major', () => {
    expect(buildUserAgent('143.0.7204.100', 'win32')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/143.0.0.0 Safari/537.36'
    )
  })

  it('reports Intel on macOS, as real Chrome does even on Apple Silicon', () => {
    expect(buildUserAgent('143.0.0.0', 'darwin')).toContain('Intel Mac OS X 10_15_7')
  })

  it('falls back to the Linux token for unknown platforms', () => {
    expect(buildUserAgent('143.0.0.0', 'aix')).toContain('X11; Linux x86_64')
  })

  it('rejects a version string it cannot read rather than emitting a broken UA', () => {
    expect(() => buildUserAgent('', 'win32')).toThrow()
    expect(() => buildUserAgent('not-a-version', 'win32')).toThrow()
  })

  // This is the #106 regression: "the User-Agent still contains Electron too".
  it('never leaks the Electron or app token', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      expect(leaksAppIdentity(buildUserAgent('143.0.0.0', platform))).toBe(false)
    }
  })
})

describe('leaksAppIdentity', () => {
  it('catches the v0.7.1 default Electron UA', () => {
    expect(
      leaksAppIdentity(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'BetterSoundCloud/0.7.1 Chrome/146.0.0.0 Electron/41.1.1 Safari/537.36'
      )
    ).toBe(true)
  })
})
