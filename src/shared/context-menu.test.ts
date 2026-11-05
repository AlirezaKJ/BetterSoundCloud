import { describe, it, expect } from 'vitest'
import { cleanUrl, shortUrl, elide, isContextMenuAction } from './context-menu'

describe('cleanUrl', () => {
  it('strips what SoundCloud’s share button appends (#49)', () => {
    expect(
      cleanUrl(
        'https://soundcloud.com/sleeptoken/the-summoning?si=abc123&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing'
      )
    ).toBe('https://soundcloud.com/sleeptoken/the-summoning')
  })

  it('strips the older ref/p/c form on SoundCloud only', () => {
    expect(cleanUrl('https://soundcloud.com/a/b?ref=clipboard&p=i&c=1')).toBe(
      'https://soundcloud.com/a/b'
    )
    // On another site those keys could be anything — a page number, a category.
    expect(cleanUrl('https://example.org/forum?p=12&c=music')).toBe(
      'https://example.org/forum?p=12&c=music'
    )
  })

  it('keeps parameters that mean something', () => {
    // `in` is the playlist a track was opened from; dropping it changes where the link goes.
    expect(cleanUrl('https://soundcloud.com/a/b?in=someone/sets/mix&si=x')).toBe(
      'https://soundcloud.com/a/b?in=someone%2Fsets%2Fmix'
    )
  })

  it('leaves a link with nothing to strip exactly as it was', () => {
    expect(cleanUrl('https://soundcloud.com/discover')).toBe('https://soundcloud.com/discover')
  })

  it('returns non-URLs unchanged rather than throwing', () => {
    expect(cleanUrl('')).toBe('')
    expect(cleanUrl('not a url')).toBe('not a url')
  })
})

describe('shortUrl', () => {
  it('reads like a person would say it', () => {
    expect(shortUrl('https://www.soundcloud.com/sleeptoken/sets/take-me-back/?si=1')).toBe(
      'soundcloud.com/sleeptoken/sets/take-me-back'
    )
    expect(shortUrl('https://soundcloud.com/')).toBe('soundcloud.com')
  })

  it('falls back to the raw text', () => {
    expect(shortUrl('nope')).toBe('nope')
  })
})

describe('elide', () => {
  it('collapses whitespace and cuts with an ellipsis', () => {
    expect(elide('  hello\n  world ', 20)).toBe('hello world')
    expect(elide('the quick brown fox jumps', 10)).toBe('the quick…')
  })

  it('never leaves a space before the ellipsis', () => {
    expect(elide('abcd efgh', 6)).toBe('abcd…')
  })
})

describe('isContextMenuAction', () => {
  it('accepts the list and nothing else', () => {
    expect(isContextMenuAction('copy-clean-link')).toBe(true)
    expect(isContextMenuAction('rm -rf')).toBe(false)
    expect(isContextMenuAction(42)).toBe(false)
    expect(isContextMenuAction(undefined)).toBe(false)
  })
})
