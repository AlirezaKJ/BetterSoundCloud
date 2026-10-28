import { describe, it, expect } from 'vitest'
import { pageToRemember, startPageUrl, START_PAGE_URLS } from './start-page'
import { SETTINGS } from './settings-schema'

describe('startPageUrl', () => {
  it('opens each fixed choice on its own page, whatever was last open', () => {
    const last = 'https://soundcloud.com/some-artist/some-track'
    expect(startPageUrl('discover', last)).toBe('https://soundcloud.com/discover')
    expect(startPageUrl('stream', last)).toBe('https://soundcloud.com/feed')
    expect(startPageUrl('library', last)).toBe('https://soundcloud.com/you/library')
  })

  it('has a page for every choice in the setting', () => {
    // A choice added to the schema without a page here would open `undefined`.
    for (const choice of SETTINGS['general.startupUrl'].options) {
      expect(startPageUrl(choice, null), choice).toMatch(/^https:\/\/soundcloud\.com\//)
    }
  })

  it('reopens the last page for "Where you left off"', () => {
    const last = 'https://soundcloud.com/some-artist/some-track?in=some-artist/sets/a-playlist'
    expect(startPageUrl('lastVisited', last)).toBe(last)
  })

  it('falls back to Home when there is no last page, or one it must not reopen', () => {
    for (const last of [
      null,
      undefined,
      '',
      42,
      { url: 'x' },
      'https://soundcloud.com/logout'
    ]) {
      expect(startPageUrl('lastVisited', last)).toBe(START_PAGE_URLS.discover)
    }
  })
})

describe('pageToRemember', () => {
  it('keeps SoundCloud pages, including a playlist carried in the query', () => {
    expect(pageToRemember('https://soundcloud.com/discover')).toBe(
      'https://soundcloud.com/discover'
    )
    expect(pageToRemember('https://soundcloud.com/search?q=daft%20punk')).toBe(
      'https://soundcloud.com/search?q=daft%20punk'
    )
    expect(pageToRemember('https://soundcloud.com/a/b?in=a/sets/c')).toBe(
      'https://soundcloud.com/a/b?in=a/sets/c'
    )
  })

  it('drops tracking parameters and the fragment', () => {
    expect(
      pageToRemember(
        'https://soundcloud.com/a/b?si=123&utm_source=clipboard&utm_medium=text#t=1:00'
      )
    ).toBe('https://soundcloud.com/a/b')
  })

  it('never keeps the sign-out page, or a step in signing in', () => {
    // Reopening /logout at startup would sign the user out every time the app opened.
    for (const path of ['/logout', '/LOGOUT', '/signin', '/signup', '/connect?client_id=x']) {
      expect(pageToRemember(`https://soundcloud.com${path}`), path).toBeNull()
    }
  })

  it('keeps only soundcloud.com itself, over https', () => {
    for (const url of [
      'http://soundcloud.com/discover',
      'https://secure.soundcloud.com/web-auth',
      'https://checkout.soundcloud.com/',
      'https://m.soundcloud.com/discover',
      'https://soundcloud.com.example.com/discover',
      'https://example.com/?u=https://soundcloud.com/',
      'https://soundcloud.com:8443/discover',
      'https://someone@soundcloud.com/discover',
      'file:///C:/soundcloud.com/discover',
      'javascript:alert(1)'
    ]) {
      expect(pageToRemember(url), url).toBeNull()
    }
  })

  it('rejects anything that is not a URL, or is far too long to be a page', () => {
    for (const value of [
      null,
      undefined,
      7,
      {},
      [],
      '',
      'not a url',
      'soundcloud.com/discover'
    ]) {
      expect(pageToRemember(value)).toBeNull()
    }
    expect(pageToRemember(`https://soundcloud.com/${'a'.repeat(3000)}`)).toBeNull()
  })
})
