import { describe, it, expect } from 'vitest'
import { acceptLanguages, buildUserAgent, leaksAppIdentity, pageLanguages } from './identity'

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

describe('pageLanguages', () => {
  it('builds the list the way Electron reports it to pages', () => {
    // Measured on Windows: this locale and these system languages gave exactly this
    // `navigator.languages`.
    expect(pageLanguages('en-US', ['en-AU', 'en-US', 'fa'])).toEqual(['en-US', 'en-AU', 'fa'])
  })

  it('skips anything empty', () => {
    expect(pageLanguages('', ['de-DE', ''])).toEqual(['de-DE'])
  })
})

describe('acceptLanguages', () => {
  /**
   * Each pair is a language list set in a fresh real-Chrome profile, and the Accept-Language
   * header that Chrome then sent. Chromium adds the q-values itself, so they are stripped
   * before comparing — what we produce is the list that goes in front of them.
   */
  const MEASURED_ON_CHROME_155: [string[], string][] = [
    [['en-US', 'en'], 'en-US,en;q=0.9'],
    [['en-US', 'en-AU', 'fa'], 'en-US,en-AU;q=0.9,en;q=0.8,fa;q=0.7'],
    [
      ['en-AU', 'fr-FR', 'fr-CA', 'de-DE'],
      'en-AU,en;q=0.9,fr-FR;q=0.8,fr-CA;q=0.7,fr;q=0.6,de-DE;q=0.5,de;q=0.4'
    ],
    [['en-US', 'fa', 'en'], 'en-US,en;q=0.9,fa;q=0.8'],
    [
      ['fa', 'en-US', 'zh-CN', 'zh-TW'],
      'fa,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh-TW;q=0.6,zh;q=0.5'
    ]
  ]

  it.each(MEASURED_ON_CHROME_155)('matches real Chrome for %j', (languages, header) => {
    expect(acceptLanguages(languages)).toBe(header.replace(/;q=[\d.]+/g, ''))
  })

  it('adds a base language once, after the last of its regional variants', () => {
    expect(acceptLanguages(['en-US', 'en-AU', 'fa'])).toBe('en-US,en-AU,en,fa')
  })

  it('leaves a list of bare languages alone', () => {
    expect(acceptLanguages(['fa', 'de'])).toBe('fa,de')
  })
})
