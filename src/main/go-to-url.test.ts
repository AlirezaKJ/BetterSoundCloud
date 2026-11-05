import { describe, it, expect, vi } from 'vitest'

// `session.ts` imports `shell` from electron, which does not exist in a plain node test process.
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const { resolveGoToUrl } = await import('./go-to-url')

describe('resolveGoToUrl', () => {
  it('loads SoundCloud links in place, with or without a scheme', () => {
    expect(resolveGoToUrl('https://soundcloud.com/discover')).toEqual({
      kind: 'internal',
      url: 'https://soundcloud.com/discover'
    })
    expect(resolveGoToUrl('soundcloud.com/sleeptoken')).toEqual({
      kind: 'internal',
      url: 'https://soundcloud.com/sleeptoken'
    })
  })

  it('takes a bare path as a path on SoundCloud', () => {
    expect(resolveGoToUrl('sleeptoken/sets/take-me-back-to-eden')).toEqual({
      kind: 'internal',
      url: 'https://soundcloud.com/sleeptoken/sets/take-me-back-to-eden'
    })
    expect(resolveGoToUrl('/discover').url).toBe('https://soundcloud.com/discover')
  })

  it('hands other sites to the system browser', () => {
    expect(resolveGoToUrl('https://accounts.google.com/').kind).toBe('external')
    expect(resolveGoToUrl('example.org/page').kind).toBe('external')
  })

  it('refuses what cannot be a link', () => {
    const inputs = [
      '',
      '   ',
      'sleep token',
      'javascript:alert(1)',
      'ftp://x.y/z',
      'file:///etc'
    ]
    for (const input of inputs) {
      expect(resolveGoToUrl(input).kind, JSON.stringify(input)).toBe('invalid')
    }
  })
})
