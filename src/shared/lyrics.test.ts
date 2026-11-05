import { describe, it, expect } from 'vitest'
import {
  bestMatch,
  currentLineIndex,
  lyricsFromRecord,
  lyricsQueries,
  parseLrc,
  plainLines,
  playbackPosition,
  readLrclibRecord
} from './lyrics'
import type { LrclibRecord } from './lyrics'

describe('parseLrc', () => {
  it('keeps the fractions of a second', () => {
    // v0.7.x cut every timestamp to whole seconds, so lines changed up to a second late.
    expect(parseLrc('[00:30.64] Like the legend of the phoenix\n[01:02.5] Ours')).toEqual([
      { time: 30.64, text: 'Like the legend of the phoenix' },
      { time: 62.5, text: 'Ours' }
    ])
    expect(parseLrc('[02:03.456]Three digits')[0]?.time).toBe(123.456)
    expect(parseLrc('[02:03]No fraction')[0]?.time).toBe(123)
  })

  it('turns a line with several timestamps into one line per timestamp, in time order', () => {
    expect(parseLrc('[00:10.00][00:50.00]Chorus\n[00:30.00]Verse')).toEqual([
      { time: 10, text: 'Chorus' },
      { time: 30, text: 'Verse' },
      { time: 50, text: 'Chorus' }
    ])
  })

  it('skips metadata, applies [offset], and keeps empty lines as gaps', () => {
    const lines = parseLrc(
      '[ar:Someone]\n[ti:Song]\n[offset:+500]\n[00:10.00]One\n[00:20.00]\n'
    )
    expect(lines).toEqual([
      { time: 9.5, text: 'One' },
      { time: 19.5, text: '' }
    ])
  })

  it('takes a line as text, whatever it contains', () => {
    // v0.7.x wrote each line with innerHTML +=. Here markup is just characters.
    expect(parseLrc('[00:01.00]<img src=x onerror=alert(1)>')[0]?.text).toBe(
      '<img src=x onerror=alert(1)>'
    )
  })

  it('reads nothing from text that has no timestamps', () => {
    expect(parseLrc('Just words\nand more words')).toEqual([])
    expect(parseLrc('')).toEqual([])
  })
})

describe('plainLines', () => {
  it('keeps verses apart but never stacks blank lines', () => {
    expect(plainLines('One\nTwo\n\n\n\nThree\n\n')).toEqual(['One', 'Two', '', 'Three'])
  })
})

describe('currentLineIndex', () => {
  const lines = [
    { time: 10, text: 'a' },
    { time: 20, text: 'b' },
    { time: 30, text: 'c' }
  ]

  it('is the last line that has started', () => {
    expect(currentLineIndex(lines, 0)).toBe(-1)
    expect(currentLineIndex(lines, 10)).toBe(0)
    expect(currentLineIndex(lines, 29.99)).toBe(1)
    expect(currentLineIndex(lines, 30)).toBe(2)
    expect(currentLineIndex(lines, 999)).toBe(2)
    expect(currentLineIndex([], 5)).toBe(-1)
  })
})

describe('playbackPosition', () => {
  it('runs on between SoundCloud’s whole-second ticks', () => {
    const anchor = { elapsed: 65, at: 1000, playing: true }
    expect(playbackPosition(anchor, 1000)).toBe(65)
    expect(playbackPosition(anchor, 1400)).toBeCloseTo(65.4)
  })

  it('waits, rather than running ahead, when the ticks stop arriving', () => {
    const anchor = { elapsed: 65, at: 1000, playing: true }
    expect(playbackPosition(anchor, 9000)).toBeCloseTo(66.25)
  })

  it('stands still while paused', () => {
    expect(playbackPosition({ elapsed: 65, at: 1000, playing: false }, 5000)).toBe(65)
  })
})

describe('lyricsQueries', () => {
  it('reads "Artist - Title" uploads with the real artist first, then the uploader', () => {
    expect(lyricsQueries('Daft Punk - Get Lucky (Official Audio)', 'Some Label')).toEqual([
      { artist: 'Daft Punk', track: 'Get Lucky' },
      { artist: 'Some Label', track: 'Daft Punk - Get Lucky' }
    ])
  })

  it('takes packaging out of the title but keeps what can change the lyrics', () => {
    expect(lyricsQueries('Get Lucky [Free Download] (prod. X)', 'Daft Punk')[0]).toEqual({
      artist: 'Daft Punk',
      track: 'Get Lucky'
    })
    expect(lyricsQueries('Get Lucky (Remix)', 'Daft Punk')[0]?.track).toBe('Get Lucky (Remix)')
    expect(lyricsQueries('Song | My Channel Tagline', 'Artist')[0]?.track).toBe('Song')
  })

  it('also tries without a featured artist, which LRCLIB often files separately', () => {
    expect(lyricsQueries('Get Lucky (feat. Pharrell Williams)', 'Daft Punk')).toEqual([
      { artist: 'Daft Punk', track: 'Get Lucky (feat. Pharrell Williams)' },
      { artist: 'Daft Punk', track: 'Get Lucky' }
    ])
  })

  it('splits on an en dash too, and passes characters like & and # through as text', () => {
    // v0.7.x put these in the URL unencoded, so "&" started a new query parameter.
    expect(lyricsQueries('Simon & Garfunkel – #1 Song', 'uploader')[0]).toEqual({
      artist: 'Simon & Garfunkel',
      track: '#1 Song'
    })
  })

  it('never asks for an empty artist or title', () => {
    expect(lyricsQueries('Title', '')).toEqual([])
    expect(lyricsQueries('', 'Artist')).toEqual([])
  })
})

describe('readLrclibRecord', () => {
  it('reads a record and refuses anything that is not one', () => {
    const record = readLrclibRecord({
      id: 986804,
      trackName: 'Get Lucky',
      artistName: 'Daft Punk',
      duration: 248,
      instrumental: false,
      plainLyrics: 'Like the legend',
      syncedLyrics: '[00:30.64] Like the legend',
      somethingNew: 'ignored'
    })
    expect(record).toMatchObject({ id: 986804, trackName: 'Get Lucky', duration: 248 })
    // v0.7.x ran JSON.parse on whatever came back and used it, error pages included.
    expect(readLrclibRecord(null)).toBeNull()
    expect(readLrclibRecord('Not Found')).toBeNull()
    expect(readLrclibRecord({ message: 'Failed to find specified track' })).toBeNull()
    expect(readLrclibRecord([{ id: 1 }])).toBeNull()
  })
})

describe('bestMatch', () => {
  const record = (id: number, duration: number, synced: boolean): LrclibRecord => ({
    id,
    trackName: 'T',
    artistName: 'A',
    duration,
    instrumental: false,
    plainLyrics: 'words',
    syncedLyrics: synced ? '[00:01.00]words' : ''
  })

  it('times the lyrics only when the recording is the same length', () => {
    // LRCLIB returned Get Lucky at 370s, 368s, 248s, 32s… (measured): only 248s is the single.
    const results = [record(1, 370, true), record(2, 32, true), record(3, 248, true)]
    expect(bestMatch(results, 249)).toEqual({ record: results[2], synced: true })
  })

  it('falls back to the words alone when only another edit has timing', () => {
    const results = [record(1, 260, true)]
    expect(bestMatch(results, 248)).toEqual({ record: results[0], synced: false })
  })

  it('finds nothing when no result is anywhere near the length', () => {
    expect(bestMatch([record(1, 600, true)], 248)).toBeNull()
    expect(bestMatch([], 248)).toBeNull()
  })

  it('takes the first timed result when SoundCloud gave no duration', () => {
    const results = [record(1, 100, false), record(2, 200, true)]
    expect(bestMatch(results, 0)).toEqual({ record: results[1], synced: true })
  })
})

describe('lyricsFromRecord', () => {
  const track = { key: 'k', title: 'Get Lucky', artist: 'Daft Punk' }
  const base: LrclibRecord = {
    id: 7,
    trackName: 'Get Lucky',
    artistName: 'Daft Punk',
    duration: 248,
    instrumental: false,
    plainLyrics: 'One\nTwo',
    syncedLyrics: '[00:01.00]One\n[00:02.00]Two'
  }

  it('is timed when it can be, words when it cannot, and says when there are none', () => {
    expect(lyricsFromRecord(track, base, true, 0).state).toBe('synced')
    expect(lyricsFromRecord(track, base, false, 0)).toMatchObject({
      state: 'plain',
      lines: ['One', 'Two']
    })
    expect(lyricsFromRecord(track, { ...base, plainLyrics: '' }, false, 0)).toMatchObject({
      state: 'plain',
      lines: ['One', 'Two']
    })
    expect(lyricsFromRecord(track, { ...base, instrumental: true }, true, 0).state).toBe(
      'instrumental'
    )
    expect(
      lyricsFromRecord(track, { ...base, plainLyrics: '', syncedLyrics: '' }, true, 0).state
    ).toBe('none')
  })
})
