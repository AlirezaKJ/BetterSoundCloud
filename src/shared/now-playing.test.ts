import { describe, it, expect } from 'vitest'
import {
  artworkUrl,
  cleanText,
  clockToSeconds,
  isSoundCloudUrl,
  readNowPlaying,
  trackUrl
} from './now-playing'
import type { PlayerReading } from './now-playing'

/** A reading as the content preload sends it while a track is playing. */
const READING: PlayerReading = {
  title: 'Flickermood',
  artworkLabel: 'Flickermood',
  artist: 'Forss',
  href: 'https://soundcloud.com/forss/flickermood?in=forss/sets/soulhack',
  artworkStyle: 'url("https://i1.sndcdn.com/artworks-000000000001-abcdef-t50x50.jpg")',
  elapsed: '1:05',
  duration: '3:33',
  playing: true,
  liked: false
}

describe('readNowPlaying', () => {
  it('turns a full reading into a track', () => {
    expect(readNowPlaying(READING)).toEqual({
      title: 'Flickermood',
      artist: 'Forss',
      url: 'https://soundcloud.com/forss/flickermood',
      artwork: 'https://i1.sndcdn.com/artworks-000000000001-abcdef-t500x500.jpg',
      elapsed: 65,
      duration: 213,
      playing: true,
      liked: false
    })
  })

  it('says nothing is loaded when the player bar is still empty', () => {
    // Before the first play, SoundCloud's sound badge is an empty div, so every field is ''.
    const empty: PlayerReading = {
      title: '',
      artworkLabel: '',
      artist: '',
      href: '',
      artworkStyle: '',
      elapsed: '',
      duration: '',
      playing: false,
      liked: false
    }
    expect(readNowPlaying(empty)).toBeNull()
  })

  it('falls back to the artwork label when the title link has no title', () => {
    expect(
      readNowPlaying({ ...READING, title: '', artworkLabel: 'From the artwork' })?.title
    ).toBe('From the artwork')
  })

  it('rejects anything that is not a reading', () => {
    for (const junk of [null, undefined, 'Flickermood', 42, [READING], () => READING]) {
      expect(readNowPlaying(junk)).toBeNull()
    }
  })

  it('counts only a real `true` as playing or liked', () => {
    // The sender is the least trusted process we run. "false" is a truthy string.
    const track = readNowPlaying({ ...READING, playing: 'false', liked: 1 })
    expect(track?.playing).toBe(false)
    expect(track?.liked).toBe(false)
  })

  it('keeps the track when one field is unreadable, and leaves that field empty', () => {
    // A stale selector should cost one field, not the whole track.
    const track = readNowPlaying({ ...READING, artworkStyle: '', duration: undefined })
    expect(track?.title).toBe('Flickermood')
    expect(track?.artwork).toBe('')
    expect(track?.duration).toBe(0)
  })
})

describe('cleanText', () => {
  it('turns control characters into spaces and trims', () => {
    expect(cleanText('  Artist\u0000Name\n', 100)).toBe('Artist Name')
    expect(cleanText('a\u007fb', 100)).toBe('a b')
  })

  it('caps by character, so an emoji is never cut in half', () => {
    expect(cleanText('ab🎵cd', 3)).toBe('ab🎵')
  })

  it('returns an empty string for anything that is not a string', () => {
    expect(cleanText(undefined, 10)).toBe('')
    expect(cleanText({ toString: () => 'x' }, 10)).toBe('')
  })
})

describe('trackUrl', () => {
  it('drops the query and fragment, which describe where it was played from', () => {
    expect(trackUrl('https://soundcloud.com/forss/flickermood?in=x&si=y#t=1:00')).toBe(
      'https://soundcloud.com/forss/flickermood'
    )
  })

  it('accepts only https links on soundcloud.com', () => {
    expect(trackUrl('http://soundcloud.com/forss/flickermood')).toBe('')
    expect(trackUrl('https://soundcloud.com.example.com/forss')).toBe('')
    expect(trackUrl('https://example.com/forss/flickermood')).toBe('')
    expect(trackUrl('javascript:alert(1)')).toBe('')
    expect(trackUrl('/forss/flickermood')).toBe('')
  })

  it('refuses an absurdly long link rather than parsing it', () => {
    expect(trackUrl('https://soundcloud.com/' + 'a'.repeat(5000))).toBe('')
  })
})

describe('artworkUrl', () => {
  it('unwraps the CSS and asks for the 500px image', () => {
    const big = 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg'
    expect(artworkUrl('url("https://i1.sndcdn.com/artworks-abc-t50x50.jpg")')).toBe(big)
    expect(artworkUrl("url('https://i1.sndcdn.com/artworks-abc-t50x50.jpg')")).toBe(big)
    expect(artworkUrl('url(https://i1.sndcdn.com/artworks-abc-t120x120.jpg)')).toBe(big)
  })

  it('accepts only SoundCloud’s image host, over https', () => {
    expect(artworkUrl('url("https://example.com/artworks-abc-t50x50.jpg")')).toBe('')
    expect(artworkUrl('url("http://i1.sndcdn.com/artworks-abc-t50x50.jpg")')).toBe('')
  })

  it('reads no artwork as empty, not as an error', () => {
    expect(artworkUrl('')).toBe('')
    expect(artworkUrl('none')).toBe('')
    expect(artworkUrl('linear-gradient(135deg, #846170, #e6846e)')).toBe('')
  })
})

describe('clockToSeconds', () => {
  it('reads m:ss and h:mm:ss', () => {
    expect(clockToSeconds('0:00')).toBe(0)
    expect(clockToSeconds('3:33')).toBe(213)
    expect(clockToSeconds('59:59')).toBe(3599)
    expect(clockToSeconds('1:02:03')).toBe(3723)
  })

  it('ignores whitespace around the clock', () => {
    expect(clockToSeconds(' 3:33\n')).toBe(213)
  })

  it('reads anything else as 0', () => {
    for (const junk of ['', 'Duration', '3:5', '-1:00', '1:2:3', '3:33 left', undefined, 213]) {
      expect(clockToSeconds(junk)).toBe(0)
    }
  })

  it('refuses a time longer than any real upload', () => {
    expect(clockToSeconds('999:00:00')).toBe(0)
  })
})

describe('isSoundCloudUrl', () => {
  it('is true only for https pages on soundcloud.com', () => {
    expect(isSoundCloudUrl('https://soundcloud.com/discover')).toBe(true)
    expect(isSoundCloudUrl('https://secure.soundcloud.com/web-auth')).toBe(true)
    expect(isSoundCloudUrl('http://soundcloud.com/discover')).toBe(false)
    expect(isSoundCloudUrl('https://evilsoundcloud.com/')).toBe(false)
    expect(isSoundCloudUrl('about:blank')).toBe(false)
  })
})
