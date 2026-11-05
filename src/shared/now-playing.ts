/**
 * What is playing in SoundCloud right now.
 *
 * The content preload reads SoundCloud's player bar and sends what it found as a
 * `PlayerReading`: raw strings, exactly as they appear in the page. Main turns that into a
 * `NowPlaying` with `readNowPlaying`. Every judgement call lives here, in one pure module
 * with tests — which field wins when two disagree, what counts as a track link, how "3:33"
 * becomes seconds — so the preload stays a plain reader.
 *
 * The reading comes from soundcloud.com's renderer, the one process we run that also runs
 * code we did not write. So it is treated as hostile input: every string is cleaned and
 * capped, every URL is re-parsed and checked, and anything that does not fit is dropped
 * rather than passed on. The limits follow soundcloud-rpc's `validation.ts`.
 */

/** Raw text and flags from SoundCloud's player bar, unprocessed. */
export type PlayerReading = {
  /** The title link's `title` attribute. */
  title: string
  /** The artwork's `aria-label`, which SoundCloud sets to the track title. A fallback. */
  artworkLabel: string
  artist: string
  /** The title link's resolved `href`. */
  href: string
  /** The artwork link's resolved `href`, the track's page too. */
  artworkHref: string
  /** The uploader name's resolved `href`, the uploader's page. */
  uploaderHref: string
  /** The artwork's inline `background-image`, e.g. `url("https://i1.sndcdn.com/…-t50x50.jpg")`. */
  artworkStyle: string
  /** The visible clock text, e.g. `1:05`. */
  elapsed: string
  duration: string
  playing: boolean
  liked: boolean
}

/** A track, cleaned up and ready for anything that wants to show or report it. */
export type NowPlaying = {
  title: string
  /** Empty if it could not be read. */
  artist: string
  /** The track's page, `https://soundcloud.com/artist/track`, with no query. Empty if unreadable. */
  url: string
  /** The artwork at 500×500 on SoundCloud's image host. Empty if there is none. */
  artwork: string
  /** Whole seconds. 0 if unreadable. */
  elapsed: number
  /** Whole seconds. 0 if unreadable. */
  duration: number
  playing: boolean
  liked: boolean
}

const MAX_TITLE = 300
const MAX_ARTIST = 200
const MAX_URL = 2048
/** Ten hours. Longer than any real upload, so anything past it is a misread. */
const MAX_SECONDS = 10 * 60 * 60

/**
 * Turn a reading from the page into a track, or null when nothing is loaded.
 *
 * Null is the normal answer before anything has been played: SoundCloud's player bar is
 * empty until then. It is also the answer to anything that is not a reading at all.
 */
export function readNowPlaying(input: unknown): NowPlaying | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>

  const title = cleanText(raw['title'], MAX_TITLE) || cleanText(raw['artworkLabel'], MAX_TITLE)
  if (!title) return null

  return {
    title,
    artist: cleanText(raw['artist'], MAX_ARTIST),
    url: trackLink(raw),
    artwork: artworkUrl(raw['artworkStyle']),
    elapsed: clockToSeconds(raw['elapsed']),
    duration: clockToSeconds(raw['duration']),
    // `=== true`, not truthiness: the string "false" must not count as playing.
    playing: raw['playing'] === true,
    liked: raw['liked'] === true
  }
}

/**
 * A string fit to show: control characters become spaces, the ends are trimmed, and it is
 * capped at `maxLength` characters. Anything that is not a string becomes ''.
 */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const printable = Array.from(value)
    .map((char) => (isControlCharacter(char) ? ' ' : char))
    .join('')
    .trim()
  // Capped by character rather than by UTF-16 unit, so the cap never splits an emoji.
  return Array.from(printable).slice(0, maxLength).join('')
}

function isControlCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code < 32 || code === 127
}

/** True for an https page on soundcloud.com or one of its subdomains. */
export function isSoundCloudUrl(raw: string): boolean {
  const url = parseHttpsUrl(raw)
  return url !== null && isOnHost(url, 'soundcloud.com')
}

/**
 * The track's page, without the `?in=…` query SoundCloud adds to say where it was played
 * from — that describes the listening, not the track. '' for anything not on soundcloud.com,
 * and for a link SoundCloud built from a missing value: its player bar linked Blinding Lights
 * to `/undefined/blinding-lights` (seen 2026-10-29), a page that does not exist, which the
 * Discord card's "Listen on SoundCloud" button would then have opened.
 */
export function trackUrl(value: unknown): string {
  const url = parseHttpsUrl(value)
  if (!url || !isOnHost(url, 'soundcloud.com')) return ''
  const segments = url.pathname.split('/')
  if (segments.includes('undefined') || segments.includes('null')) return ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * The track's page, from the best of the player bar's three links: the title's, then the
 * artwork's, and when both are broken, the uploader's page joined to the rest of the title's.
 *
 * The title's link is almost always sound. Once, on 2026-10-29, it was
 * `/undefined/blinding-lights`, which `trackUrl` refuses, and the Discord card lost its
 * "Listen on SoundCloud" button with it. On 2026-10-30, across 27 readings of about 20 tracks,
 * the artwork's link was always the title's and the uploader's link always the first part of
 * it, so those two stand in for it. The dev log prints all three when the title's is broken.
 */
export function trackLink(raw: Record<string, unknown>): string {
  return (
    trackUrl(raw['href']) ||
    trackUrl(raw['artworkHref']) ||
    joinUploader(raw['uploaderHref'], raw['href'])
  )
}

/** A SoundCloud permalink: what its user and track addresses are made of. */
const PERMALINK = /^[A-Za-z0-9_-]+$/

/**
 * `https://soundcloud.com/<uploader>/<the rest>`, from a track link missing only its first
 * part (`/undefined/blinding-lights`) and the uploader's own link (`/theweeknd`). '' unless
 * both are plain soundcloud.com addresses made of permalinks.
 */
function joinUploader(uploaderHref: unknown, brokenHref: unknown): string {
  const uploader = parseHttpsUrl(uploaderHref)
  const broken = parseHttpsUrl(brokenHref)
  if (!uploader || !broken) return ''
  if (!isOnHost(uploader, 'soundcloud.com') || !isOnHost(broken, 'soundcloud.com')) return ''

  const user = uploader.pathname.split('/').filter(Boolean)
  const [first, ...rest] = broken.pathname.split('/').filter(Boolean)
  if (user.length !== 1 || (first !== 'undefined' && first !== 'null') || rest.length === 0) {
    return ''
  }
  const parts = [...user, ...rest]
  const sound = parts.every(
    (part) => PERMALINK.test(part) && part !== 'undefined' && part !== 'null'
  )
  return sound ? `https://soundcloud.com/${parts.join('/')}` : ''
}

/**
 * The artwork URL out of an inline `background-image`, at 500×500.
 *
 * The player bar shows a 50px thumbnail, `…-t50x50.jpg`. SoundCloud serves the same image
 * at other sizes by name, and every consumer — Discord, the full-screen view — wants the
 * large one. Only SoundCloud's image host is accepted, so a reading can never point us at
 * an arbitrary server.
 */
export function artworkUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  // `url("https://…")`, `url('…')` or `url(…)`.
  const inner = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(value)?.[1]
  const url = parseHttpsUrl(inner)
  if (!url || !isOnHost(url, 'sndcdn.com')) return ''
  url.pathname = url.pathname.replace(/-t\d+x\d+\./, '-t500x500.')
  return url.toString()
}

/**
 * SoundCloud's clock text in whole seconds: "3:33" is 213 and "1:02:03" is 3723.
 * Anything else, including an implausibly long time, is 0.
 */
export function clockToSeconds(value: unknown): number {
  if (typeof value !== 'string') return 0
  const text = value.trim()
  // m:ss, or h:mm:ss past the hour.
  if (!/^\d{1,3}(:\d{2}){1,2}$/.test(text)) return 0

  let seconds = 0
  for (const part of text.split(':')) {
    seconds = seconds * 60 + Number(part)
  }
  return seconds <= MAX_SECONDS ? seconds : 0
}

function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > MAX_URL) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function isOnHost(url: URL, host: string): boolean {
  return url.hostname === host || url.hostname.endsWith(`.${host}`)
}
