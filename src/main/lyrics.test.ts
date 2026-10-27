import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NowPlaying } from '@shared/now-playing'
import type { Fetcher } from './lyrics'

vi.mock('./env', () => ({ isDev: false }))

const lyrics = await import('./lyrics')

/*
 * The lyrics service against a fake LRCLIB: every request is recorded, and the answers are
 * whatever the test says. What is tested is what we ask for and what we do with the answers.
 */

const GET_LUCKY = {
  id: 986804,
  trackName: 'Get Lucky',
  artistName: 'Daft Punk',
  duration: 248,
  instrumental: false,
  plainLyrics: 'Like the legend of the phoenix',
  syncedLyrics: '[00:30.64] Like the legend of the phoenix'
}

type Answer = { status: number; body: unknown } | 'offline'

/** A fake LRCLIB. `answer` decides each reply from the request's path and parameters. */
function fakeLrclib(answer: (path: string, params: URLSearchParams) => Answer) {
  const requests: { path: string; params: URLSearchParams; headers: Record<string, string> }[] =
    []
  const fetcher: Fetcher = (url, init) => {
    const parsed = new URL(url)
    const path = parsed.pathname.replace('/api/', '')
    requests.push({ path, params: parsed.searchParams, headers: init.headers })
    const reply = answer(path, parsed.searchParams)
    if (reply === 'offline') return Promise.reject(new TypeError('fetch failed'))
    return Promise.resolve({
      status: reply.status,
      json: () =>
        typeof reply.body === 'string'
          ? Promise.reject(new SyntaxError('Unexpected token'))
          : Promise.resolve(reply.body)
    })
  }
  return { fetcher, requests }
}

describe('lookUpLyrics', () => {
  it('asks for the exact track first, with the length, properly encoded', async () => {
    const lrclib = fakeLrclib(() => ({ status: 200, body: GET_LUCKY }))
    const found = await lyrics.lookUpLyrics(
      'Daft Punk - Get Lucky',
      'label',
      248,
      lrclib.fetcher
    )
    expect(found.record?.id).toBe(986804)
    expect(lrclib.requests).toHaveLength(1)
    const [request] = lrclib.requests
    expect(request?.path).toBe('get')
    expect(request?.params.get('artist_name')).toBe('Daft Punk')
    expect(request?.params.get('track_name')).toBe('Get Lucky')
    expect(request?.params.get('duration')).toBe('248')
    // LRCLIB asks clients to say who they are.
    expect(request?.headers['User-Agent']).toMatch(/^BetterSoundCloud\//)
  })

  it('keeps & and # inside the parameter they belong to', async () => {
    // v0.7.x pasted the title into the URL, so "&" began a new parameter and "#" ended the URL.
    const lrclib = fakeLrclib(() => ({ status: 200, body: GET_LUCKY }))
    await lyrics.lookUpLyrics('Simon & Garfunkel - #1 Song', 'x', 0, lrclib.fetcher)
    expect(lrclib.requests[0]?.params.get('artist_name')).toBe('Simon & Garfunkel')
    expect(lrclib.requests[0]?.params.get('track_name')).toBe('#1 Song')
  })

  it('searches when the exact lookup finds nothing, and picks the recording by length', async () => {
    const lrclib = fakeLrclib((path) =>
      path === 'get'
        ? { status: 404, body: { message: 'Failed to find specified track' } }
        : {
            status: 200,
            body: [
              { ...GET_LUCKY, id: 1, duration: 370 },
              { ...GET_LUCKY, id: 2, duration: 248 }
            ]
          }
    )
    const found = await lyrics.lookUpLyrics('Get Lucky', 'Daft Punk', 249, lrclib.fetcher)
    expect(found).toMatchObject({ record: { id: 2 }, synced: true })
    expect(lrclib.requests.map((r) => r.path)).toEqual(['get', 'search'])
  })

  it('treats a 503 and a body that is not JSON as nothing there, not as lyrics', async () => {
    const lrclib = fakeLrclib((path) =>
      path === 'get' ? { status: 503, body: 'Service Unavailable' } : { status: 200, body: [] }
    )
    const found = await lyrics.lookUpLyrics('Unknown - Song', 'x', 200, lrclib.fetcher)
    expect(found.record).toBeNull()
    expect(found.searched).toEqual({ artist: 'Unknown', track: 'Song' })
  })

  it('never asks more than four times for one track', async () => {
    const lrclib = fakeLrclib(() => ({ status: 404, body: null }))
    await lyrics.lookUpLyrics('A - B (feat. C)', 'D', 100, lrclib.fetcher)
    expect(lrclib.requests.length).toBeLessThanOrEqual(4)
  })

  it('throws when LRCLIB cannot be reached, so the pane can say so', async () => {
    const lrclib = fakeLrclib(() => 'offline')
    await expect(lyrics.lookUpLyrics('A - B', 'x', 100, lrclib.fetcher)).rejects.toThrow()
  })
})

describe('the lyrics service', () => {
  const track = (title: string, url = `https://soundcloud.com/x/${title}`): NowPlaying => ({
    title,
    artist: 'Daft Punk',
    url,
    artwork: '',
    elapsed: 0,
    duration: 248,
    playing: true,
    liked: false
  })
  let lrclib: ReturnType<typeof fakeLrclib>
  let states: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    lyrics.resetLyricsForTests()
    lrclib = fakeLrclib(() => ({ status: 200, body: GET_LUCKY }))
    vi.stubGlobal('fetch', lrclib.fetcher)
    states = []
    lyrics.onLyricsChange((s) => states.push(s.state))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks LRCLIB nothing while the pane is closed', async () => {
    lyrics.noticeNowPlaying(track('get-lucky'))
    await vi.runAllTimersAsync()
    expect(lrclib.requests).toHaveLength(0)
    expect(lyrics.getLyricsState().state).toBe('idle')
  })

  it('looks the track up when the pane opens, and shows timed lyrics', async () => {
    lyrics.noticeNowPlaying(track('get-lucky'))
    lyrics.setLyricsOpen(true)
    expect(lyrics.getLyricsState().state).toBe('loading')
    await vi.runAllTimersAsync()
    const state = lyrics.getLyricsState()
    expect(state.state).toBe('synced')
    if (state.state === 'synced') expect(state.lines[0]?.time).toBe(30.64)
  })

  it('waits for a skipped-through track to settle, and asks only for the one that stays', async () => {
    lyrics.setLyricsOpen(true)
    for (const title of ['one', 'two', 'three']) {
      lyrics.noticeNowPlaying(track(title))
      await vi.advanceTimersByTimeAsync(100)
    }
    await vi.runAllTimersAsync()
    expect(lrclib.requests).toHaveLength(1)
  })

  it('does not ask again for a track it already looked up', async () => {
    lyrics.setLyricsOpen(true)
    lyrics.noticeNowPlaying(track('a'))
    await vi.runAllTimersAsync()
    lyrics.noticeNowPlaying(track('b'))
    await vi.runAllTimersAsync()
    lyrics.noticeNowPlaying(track('a'))
    await vi.runAllTimersAsync()
    expect(lrclib.requests).toHaveLength(2)
  })

  it('ignores the clock ticking: only a different track starts a lookup', async () => {
    lyrics.setLyricsOpen(true)
    lyrics.noticeNowPlaying(track('a'))
    await vi.runAllTimersAsync()
    for (let second = 1; second < 10; second++) {
      lyrics.noticeNowPlaying({ ...track('a'), elapsed: second })
    }
    await vi.runAllTimersAsync()
    expect(lrclib.requests).toHaveLength(1)
  })

  it('says it could not reach LRCLIB, and tries again when asked', async () => {
    vi.stubGlobal('fetch', fakeLrclib(() => 'offline').fetcher)
    lyrics.setLyricsOpen(true)
    lyrics.noticeNowPlaying(track('a'))
    await vi.runAllTimersAsync()
    expect(lyrics.getLyricsState().state).toBe('error')
    vi.stubGlobal('fetch', lrclib.fetcher)
    lyrics.retryLyrics()
    await vi.runAllTimersAsync()
    expect(lyrics.getLyricsState().state).toBe('synced')
  })

  it('moves the lyrics by half a second at a time, and remembers it for the track', async () => {
    lyrics.setLyricsOpen(true)
    lyrics.noticeNowPlaying(track('a'))
    await vi.runAllTimersAsync()
    lyrics.nudgeLyrics(0.5)
    lyrics.nudgeLyrics(0.5)
    lyrics.nudgeLyrics(-0.5)
    const nudged = lyrics.getLyricsState()
    expect(nudged.state === 'synced' && nudged.offset).toBe(0.5)
    // Closed and opened again on the same track, the nudge is still there.
    lyrics.setLyricsOpen(false)
    lyrics.setLyricsOpen(true)
    const again = lyrics.getLyricsState()
    expect(again.state === 'synced' && again.offset).toBe(0.5)
  })

  it('shows nothing playing when nothing is', () => {
    lyrics.setLyricsOpen(true)
    expect(lyrics.getLyricsState().state).toBe('idle')
    expect(states).toContain('idle')
  })
})
