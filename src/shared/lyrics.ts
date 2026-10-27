/**
 * Synced lyrics: everything about them that can be decided without a network or a window.
 *
 * Main fetches from LRCLIB (src/main/lyrics.ts) and the lyrics pane draws (src/renderer/lyrics);
 * the judgement in between lives here, pure and tested — how a timed line is read, which line is
 * current at a given moment, what to ask LRCLIB for when SoundCloud's title is an uploader's
 * "Artist - Title (Official Video) [Free DL]", and which of LRCLIB's answers is the same
 * recording.
 *
 * v0.7.x got four of these wrong, and each is pinned by a test here or in main: it did not
 * URL-encode the query, so a title with `&` or `#` broke the request; it ran `JSON.parse` on
 * whatever came back, so a 404 page threw; it cut every timestamp to whole seconds; and it wrote
 * each line with `innerHTML +=`, from text nobody had checked. Here every line is plain text and
 * the pane renders it as text.
 */

/** One timed line. `time` is in seconds, fractions kept: `[01:02.34]` is 62.34. */
export type LyricLine = { readonly time: number; readonly text: string }

/** The track the lyrics belong to, as the pane shows it. `key` tells one track from the next. */
export type LyricsTrack = {
  readonly key: string
  readonly title: string
  readonly artist: string
}

/** What LRCLIB matched, for the pane's credit line. */
export type LyricsMatch = {
  readonly artist: string
  readonly track: string
  readonly id: number
}

/**
 * Everything the lyrics pane can be showing. Sent by main whenever it changes; the pane keeps
 * no state of its own beyond where it has scrolled.
 *
 * `offset` is the listener's nudge for this track, in seconds: positive shows each line later.
 * SoundCloud uploads are not always the exact recording LRCLIB timed, and its clock only gives
 * whole seconds, so being able to move the lyrics half a second is part of the feature.
 */
export type LyricsState =
  | { readonly state: 'idle' }
  | { readonly state: 'loading'; readonly track: LyricsTrack }
  | {
      readonly state: 'synced'
      readonly track: LyricsTrack
      readonly lines: readonly LyricLine[]
      readonly match: LyricsMatch
      readonly offset: number
    }
  | {
      readonly state: 'plain'
      readonly track: LyricsTrack
      readonly lines: readonly string[]
      readonly match: LyricsMatch
    }
  | { readonly state: 'instrumental'; readonly track: LyricsTrack; readonly match: LyricsMatch }
  | {
      readonly state: 'none'
      readonly track: LyricsTrack
      readonly searched: { readonly artist: string; readonly track: string }
    }
  | { readonly state: 'error'; readonly track: LyricsTrack }

/** One lookup to try, most likely first. */
export type LyricsQuery = { readonly artist: string; readonly track: string }

/** A record from LRCLIB, after checking. Anything that is not one becomes null. */
export type LrclibRecord = {
  readonly id: number
  readonly trackName: string
  readonly artistName: string
  /** Seconds, 0 when LRCLIB does not say. */
  readonly duration: number
  readonly instrumental: boolean
  readonly plainLyrics: string
  readonly syncedLyrics: string
}

/** Lyrics longer than this are not a song. Generous: the longest real ones are ~20k. */
const MAX_LYRICS = 100_000
const MAX_NAME = 300
/** How far apart two durations can be and still be the same recording, for timed lyrics. */
const SYNCED_TOLERANCE = 5
/** The same for untimed lyrics, which survive an edit or a longer intro. */
const PLAIN_TOLERANCE = 30

/*
 * ── Reading LRC ──────────────────────────────────────────────────────────────────────────
 */

/** `[mm:ss]`, `[mm:ss.x]`, `[mm:ss.xx]` or `[mm:ss.xxx]`, and the `:` variant some files use. */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/**
 * Timed lines from LRC text, earliest first. A line may carry several timestamps (a chorus
 * written once), and each becomes a line of its own. Metadata tags (`[ar:…]`, `[ti:…]`) are
 * skipped, and `[offset:±ms]` is applied: positive means the lyrics come earlier. A line with a
 * timestamp and no words is kept, as an instrumental gap.
 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  let offsetSeconds = 0
  for (const raw of text.slice(0, MAX_LYRICS).split(/\r?\n/)) {
    const offset = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i.exec(raw)
    if (offset?.[1]) {
      offsetSeconds = Number(offset[1]) / 1000
      continue
    }
    const stamps: number[] = []
    let rest = raw.trim()
    // Timestamps lead the line; take them off the front one at a time.
    for (;;) {
      STAMP.lastIndex = 0
      const match = STAMP.exec(rest)
      if (!match || match.index !== 0) break
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      stamps.push(minutes * 60 + seconds + fraction)
      rest = rest.slice(match[0].length)
    }
    if (stamps.length === 0) continue
    const words = cleanLine(rest)
    for (const time of stamps) lines.push({ time, text: words })
  }
  return lines
    .map((line) => ({ time: Math.max(0, round(line.time - offsetSeconds)), text: line.text }))
    .sort((a, b) => a.time - b.time)
}

/** Untimed lyrics as lines, with runs of blank lines kept to one. */
export function plainLines(text: string): string[] {
  const out: string[] = []
  for (const raw of text.slice(0, MAX_LYRICS).split(/\r?\n/)) {
    const line = cleanLine(raw)
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue
    out.push(line)
  }
  while (out[out.length - 1] === '') out.pop()
  return out
}

/** Control characters out, whitespace collapsed. Text only ever reaches the pane as text. */
function cleanLine(text: string): string {
  return text
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

/**
 * The line being sung at `position` seconds: the last one that has started. -1 before the
 * first. A binary search, because the pane asks on every frame.
 */
export function currentLineIndex(lines: readonly LyricLine[], position: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const line = lines[middle]
    if (line && line.time <= position) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/*
 * ── Where the music is ───────────────────────────────────────────────────────────────────
 */

/**
 * Where in the track playback is, between SoundCloud's whole-second clock ticks.
 *
 * The page reports `elapsed` as whole seconds, about once a second, so on its own the current
 * line would jump a second at a time. `anchor` is the last reading and when it arrived; while
 * playing, the position runs on from it, but never more than `MAX_RUN` past it — if the clock
 * stops arriving (a stall, a hidden page) the lyrics wait rather than run ahead.
 */
export type ClockAnchor = {
  readonly elapsed: number
  readonly at: number
  readonly playing: boolean
}

/** Seconds the estimate may run past the last reading before it stops and waits. */
const MAX_RUN = 1.25

export function playbackPosition(anchor: ClockAnchor, now: number): number {
  if (!anchor.playing) return anchor.elapsed
  const run = Math.min(Math.max(0, (now - anchor.at) / 1000), MAX_RUN)
  return anchor.elapsed + run
}

/*
 * ── What to ask LRCLIB for ───────────────────────────────────────────────────────────────
 */

/**
 * Words that mark a bracketed part of a SoundCloud title as packaging, not as part of the song:
 * "(Official Video)", "[Free Download]", "(prod. Someone)". Remixes, live versions and
 * features stay — they can be different lyrics.
 */
const PACKAGING =
  /\b(official|video|audio|lyrics?|visuali[sz]er|music video|hd|hq|4k|free\s*(download|dl)|out now|premiere|explicit|clean|prod\.?|produced by|remaster(ed)?|full song|extended)\b/i

/**
 * The lookups to try for a track, most likely first, without duplicates.
 *
 * SoundCloud's "artist" is the uploader, often a label or a channel, and its title is whatever
 * they typed. When the title reads "Artist - Title", the left side is almost always the real
 * artist, so that pair goes first; the uploader with the whole title follows. Each pair is also
 * tried without its "feat." part, which LRCLIB often files separately.
 */
export function lyricsQueries(title: string, uploader: string): LyricsQuery[] {
  const queries: LyricsQuery[] = []
  const add = (artist: string, track: string): void => {
    const a = tidy(artist)
    const t = tidy(track)
    if (!a || !t) return
    for (const candidate of [
      { artist: a, track: t },
      { artist: withoutFeature(a), track: withoutFeature(t) }
    ]) {
      if (!candidate.artist || !candidate.track) continue
      const seen = queries.some(
        (q) =>
          q.artist.toLowerCase() === candidate.artist.toLowerCase() &&
          q.track.toLowerCase() === candidate.track.toLowerCase()
      )
      if (!seen) queries.push(candidate)
    }
  }

  const split = /^(.+?)\s+[-–—―]\s+(.+)$/.exec(stripPackaging(title))
  if (split?.[1] && split[2]) add(split[1], split[2])
  add(uploader, stripPackaging(title))
  return queries.slice(0, 4)
}

/** Bracketed packaging out, and whatever follows a " | " (a channel's tagline). */
function stripPackaging(title: string): string {
  return title
    .replace(/\s*[([{【][^)\]}】]*[)\]}】]/g, (part) => (PACKAGING.test(part) ? '' : part))
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+-\s*$/, '')
}

function withoutFeature(text: string): string {
  return text
    .replace(/\s*[([]\s*(feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, '')
    .trim()
}

function tidy(text: string): string {
  return cleanLine(text)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
    .slice(0, MAX_NAME)
}

/*
 * ── What LRCLIB said ─────────────────────────────────────────────────────────────────────
 */

/** One record from LRCLIB's JSON, checked field by field, or null if it is not one. */
export function readLrclibRecord(value: unknown): LrclibRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const id = raw['id']
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return null
  const text = (key: string, max: number): string => {
    const v = raw[key]
    return typeof v === 'string' ? v.slice(0, max) : ''
  }
  const duration = raw['duration']
  return {
    id,
    trackName: cleanLine(text('trackName', MAX_NAME)),
    artistName: cleanLine(text('artistName', MAX_NAME)),
    duration:
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0,
    instrumental: raw['instrumental'] === true,
    plainLyrics: text('plainLyrics', MAX_LYRICS),
    syncedLyrics: text('syncedLyrics', MAX_LYRICS)
  }
}

/**
 * The best of LRCLIB's search results for a track `duration` seconds long, or null.
 *
 * Timed lyrics only when the lengths agree within a few seconds: a different edit with the same
 * title would put every line in the wrong place, which is worse than no timing at all. Untimed
 * lyrics tolerate more. With no duration to go on, the first result with timed lyrics wins.
 */
export function bestMatch(
  records: readonly LrclibRecord[],
  duration: number
): { record: LrclibRecord; synced: boolean } | null {
  const usable = records.filter((r) => r.instrumental || r.syncedLyrics || r.plainLyrics)
  if (usable.length === 0) return null
  if (duration <= 0) {
    const timed = usable.find((r) => r.syncedLyrics)
    const first = timed ?? usable[0]
    return first ? { record: first, synced: !!timed } : null
  }
  const distance = (r: LrclibRecord): number =>
    r.duration > 0 ? Math.abs(r.duration - duration) : Number.POSITIVE_INFINITY
  const byDistance = [...usable].sort((a, b) => distance(a) - distance(b))
  const timed = byDistance.find((r) => r.syncedLyrics && distance(r) <= SYNCED_TOLERANCE)
  if (timed) return { record: timed, synced: true }
  const close = byDistance.find((r) => distance(r) <= PLAIN_TOLERANCE)
  return close ? { record: close, synced: false } : null
}

/** The pane's state for a record LRCLIB returned for this track. */
export function lyricsFromRecord(
  track: LyricsTrack,
  record: LrclibRecord,
  useTiming: boolean,
  offset: number
): LyricsState {
  const match = { artist: record.artistName, track: record.trackName, id: record.id }
  if (record.instrumental) return { state: 'instrumental', track, match }
  const timed = useTiming && record.syncedLyrics ? parseLrc(record.syncedLyrics) : []
  if (timed.length > 0) return { state: 'synced', track, lines: timed, match, offset }
  const plain = plainLines(record.plainLyrics || stripTimestamps(record.syncedLyrics))
  if (plain.length > 0) return { state: 'plain', track, lines: plain, match }
  return { state: 'none', track, searched: { artist: track.artist, track: track.title } }
}

/** Timed lyrics read as untimed ones, for when the timing belongs to a different edit. */
function stripTimestamps(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '')
}
