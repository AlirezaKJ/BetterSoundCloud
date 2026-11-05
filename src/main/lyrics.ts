import { version } from '../../package.json'
import { isDev } from './env'
import { bestMatch, lyricsFromRecord, lyricsQueries, readLrclibRecord } from '@shared/lyrics'
import type { LrclibRecord, LyricsQuery, LyricsState, LyricsTrack } from '@shared/lyrics'
import type { NowPlaying } from '@shared/now-playing'

/**
 * Synced lyrics, from LRCLIB (https://lrclib.net), a free and open lyrics database.
 *
 * Main asks, so the lyrics pane never touches the network itself: v0.7.x ran `https.get` from a
 * renderer with full Node access. It only asks while the pane or the full-screen showcase is
 * open, which is what makes looking a track up something the listener chose — LRCLIB learns the title, artist and length
 * of a track only when they asked for its lyrics. Answers are kept for the session, keyed by
 * track, so a track heard twice is looked up once, and a lookup waits until a track has been
 * playing for a moment, so skipping through a playlist does not fire a request per skip.
 *
 * All the judgement — what to ask for, which answer is the same recording — is in
 * src/shared/lyrics.ts, tested. This file is the network and the bookkeeping.
 */

const API = 'https://lrclib.net/api'
/**
 * LRCLIB asks every client to say who it is. This is the only request the app makes that names
 * itself: SoundCloud only ever sees the browser's own user agent (CLAUDE.md §10). The version is
 * read from package.json at build time; it was once typed here by hand and fell out of date.
 */
const USER_AGENT = `BetterSoundCloud/${version} (https://github.com/AlirezaKJ/BetterSoundCloud)`
const TIMEOUT_MS = 10_000
/** How long a track must stay current before it is looked up. */
const SETTLE_MS = 400
/** Tracks remembered for the session. Each is a few kilobytes of text. */
const CACHE_LIMIT = 200
/** At most this many lookups for one track, so a track LRCLIB lacks costs it four requests. */
const MAX_REQUESTS = 4

export type Fetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{
  status: number
  json(): Promise<unknown>
}>

/** What one lookup found. `null` record: LRCLIB has nothing for this track. */
export type Lookup = {
  record: LrclibRecord | null
  synced: boolean
  searched: LyricsQuery | null
}

/**
 * Find a track's lyrics. Exact lookups first (LRCLIB's `/get` matches the length within a couple
 * of seconds, so its timing fits), then a search for the most likely name, choosing among the
 * results by length (`bestMatch`). Every query is built with URLSearchParams, so a title with
 * `&` or `#` is a title, not a broken URL. Throws only when LRCLIB cannot be reached at all.
 */
export async function lookUpLyrics(
  title: string,
  uploader: string,
  duration: number,
  fetcher: Fetcher
): Promise<Lookup> {
  const queries = lyricsQueries(title, uploader)
  const first = queries[0]
  if (!first) return { record: null, synced: false, searched: null }

  let requests = 0
  const ask = async (path: string, params: Record<string, string>): Promise<unknown> => {
    requests++
    const url = `${API}/${path}?${new URLSearchParams(params).toString()}`
    const response = await fetcher(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    // LRCLIB answers a track it does not know with 404, and sometimes 503 (measured): either
    // way there is nothing here, and a body that is not JSON is never parsed blindly.
    if (response.status !== 200) return null
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  // Exact lookups, for the two most likely names.
  for (const query of queries.slice(0, 2)) {
    const params: Record<string, string> = {
      artist_name: query.artist,
      track_name: query.track
    }
    if (duration > 0) params['duration'] = String(duration)
    const record = readLrclibRecord(await ask('get', params))
    if (record && (record.instrumental || record.syncedLyrics || record.plainLyrics)) {
      return { record, synced: true, searched: query }
    }
  }

  // Then a search, for each remaining name while requests are left.
  for (const query of queries) {
    if (requests >= MAX_REQUESTS) break
    const results = await ask('search', { track_name: query.track, artist_name: query.artist })
    const records = Array.isArray(results)
      ? results.slice(0, 20).flatMap((r) => readLrclibRecord(r) ?? [])
      : []
    const best = bestMatch(records, duration)
    if (best) return { ...best, searched: query }
  }
  return { record: null, synced: false, searched: first }
}

/*
 * ── The service: what the pane is showing ────────────────────────────────────────────────
 */

type Cached = Lookup

/** The two views that show lyrics. */
export type LyricsViewer = 'pane' | 'showcase'

/** Who has lyrics on screen. LRCLIB is only asked while someone does. */
const wantedBy = new Set<LyricsViewer>()
let playing: NowPlaying | null = null
let state: LyricsState = { state: 'idle' }
let settleTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0
const cache = new Map<string, Cached>()
const offsets = new Map<string, number>()
const listeners = new Set<(state: LyricsState) => void>()

/** Which track a reading is. The page link when there is one, as it survives retitling. */
function trackOf(nowPlaying: NowPlaying): LyricsTrack {
  return {
    key: nowPlaying.url || `${nowPlaying.artist}\n${nowPlaying.title}`,
    title: nowPlaying.title,
    artist: nowPlaying.artist
  }
}

function setState(next: LyricsState): void {
  state = next
  for (const listener of listeners) listener(state)
}

export function getLyricsState(): LyricsState {
  return state
}

/** Hear every change to what the pane should show. Returns the unsubscribe. */
export function onLyricsChange(listener: (state: LyricsState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The pane or the showcase opened or closed. The first to open looks up whatever is playing;
 * once the last has closed, no lookup is started, and one in flight finishes into the cache
 * without being shown.
 */
export function setLyricsWanted(viewer: LyricsViewer, wanted: boolean): void {
  const before = wantedBy.size > 0
  if (wanted) wantedBy.add(viewer)
  else wantedBy.delete(viewer)
  const now = wantedBy.size > 0
  if (now && !before) show(playing, 0)
  if (!now && before) cancelSettle()
}

/**
 * What is playing, from now-playing. Called about once a second while a track plays; only a
 * different track does anything, because the clock ticking is the pane's business.
 */
export function noticeNowPlaying(nowPlaying: NowPlaying | null): void {
  const before = playing ? trackOf(playing).key : ''
  playing = nowPlaying
  const after = nowPlaying ? trackOf(nowPlaying).key : ''
  if (before !== after && wantedBy.size > 0) show(nowPlaying, SETTLE_MS)
}

/** Look the current track up again, after a failure. */
export function retryLyrics(): void {
  if (!playing) return
  cache.delete(trackOf(playing).key)
  show(playing, 0)
}

/** Move this track's lyrics by `seconds` (±0.5 from the pane's buttons). Positive is later. */
export function nudgeLyrics(seconds: number): void {
  if (state.state !== 'synced' || !Number.isFinite(seconds)) return
  const key = state.track.key
  const offset =
    Math.round(Math.min(Math.max((offsets.get(key) ?? 0) + seconds, -30), 30) * 10) / 10
  offsets.set(key, offset)
  setState({ ...state, offset })
}

function cancelSettle(): void {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = null
}

function show(nowPlaying: NowPlaying | null, settleMs: number): void {
  cancelSettle()
  const ticket = ++generation
  if (!nowPlaying) {
    setState({ state: 'idle' })
    return
  }
  const track = trackOf(nowPlaying)
  const known = cache.get(track.key)
  if (known) {
    setState(stateFor(track, known))
    return
  }
  setState({ state: 'loading', track })
  settleTimer = setTimeout(() => {
    settleTimer = null
    void fetchFor(nowPlaying, track, ticket)
  }, settleMs)
}

async function fetchFor(
  reading: NowPlaying,
  track: LyricsTrack,
  ticket: number
): Promise<void> {
  // The freshest reading of the same track: its length is sometimes read a tick after its title,
  // and the length is what tells LRCLIB's recordings apart.
  const nowPlaying = playing && trackOf(playing).key === track.key ? playing : reading
  let found: Lookup
  try {
    found = await lookUpLyrics(nowPlaying.title, nowPlaying.artist, nowPlaying.duration, fetch)
  } catch (error) {
    if (isDev) console.log(`[lyrics] LRCLIB unreachable: ${String(error)}`)
    if (ticket === generation) setState({ state: 'error', track })
    return
  }
  remember(track.key, found)
  if (isDev) {
    const what = found.record
      ? `${found.synced && found.record.syncedLyrics ? 'timed' : 'words only'} (LRCLIB ${found.record.id})`
      : 'none'
    console.log(`[lyrics] ${what} | ${nowPlaying.artist} — ${nowPlaying.title}`)
  }
  // A newer track, or every view closed and one opened on another: no longer wanted.
  if (ticket === generation && wantedBy.size > 0) setState(stateFor(track, found))
}

function remember(key: string, found: Cached): void {
  cache.delete(key)
  cache.set(key, found)
  // A Map keeps insertion order, so the first key is the one used longest ago.
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function stateFor(track: LyricsTrack, found: Cached): LyricsState {
  if (!found.record) {
    const searched = found.searched ?? { artist: track.artist, track: track.title }
    return { state: 'none', track, searched }
  }
  return lyricsFromRecord(track, found.record, found.synced, offsets.get(track.key) ?? 0)
}

/** For tests: forget everything. */
export function resetLyricsForTests(): void {
  cancelSettle()
  wantedBy.clear()
  playing = null
  state = { state: 'idle' }
  generation = 0
  cache.clear()
  offsets.clear()
  listeners.clear()
}
