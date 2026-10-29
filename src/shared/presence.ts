import type { NowPlaying } from './now-playing'

/**
 * What BetterSoundCloud shows on the user's Discord profile: the "Listening to" card.
 *
 * Pure, so the rules are tested rather than discovered on someone's profile. src/main/presence.ts
 * decides when to send it; src/main/discord-ipc.ts carries it to the Discord app on the same
 * computer.
 *
 * The card, top to bottom: "Listening to BetterSoundCloud" (the Discord application's name),
 * the track title, the artist, a progress bar Discord draws itself from the two timestamps, the
 * artwork with our logo in its corner, and two buttons for everyone else: "Listen on SoundCloud"
 * for the track, and "Get BetterSoundCloud".
 */

/**
 * One activity in Discord's own field names, as sent with `SET_ACTIVITY` over the local RPC
 * pipe. Only the fields we use.
 */
export type Activity = {
  /** 2 is "Listening". */
  type: 2
  /**
   * Which line the member list shows after "Listening to": 2 is `details`, the track title.
   * Without it, everyone in a server would read "Listening to BetterSoundCloud" — true, and
   * useless.
   */
  status_display_type: 2
  details: string
  state?: string
  /** Unix milliseconds. Discord draws the progress bar from these; there is no progress API. */
  timestamps?: { start: number; end?: number }
  assets: {
    large_image: string
    large_text?: string
    small_image?: string
    small_text?: string
  }
  buttons?: { label: string; url: string }[]
  instance: false
}

export type PresenceOptions = {
  /** Keep the card while a track is paused, without the progress bar. Off clears it. */
  showWhenPaused: boolean
}

/**
 * Art uploaded to the BetterSoundCloud application on Discord. Keys, not URLs: Discord looks
 * them up. This is the one v0.7.x used for the same corner badge, so the card looks the same.
 */
export const PRESENCE_LOGO = 'bw-icon-bordered-white'

/**
 * The second button: where to get the app, the project's landing page (from 2026-10-29). It
 * replaced the old site, which stopped answering on 2026-10-27.
 */
const PROJECT_BUTTON = {
  label: 'Get BetterSoundCloud',
  url: 'https://bsc.akjstud.io/'
}

/** Discord rejects a text field shorter than 2 or longer than 128 characters. */
const MIN_TEXT = 2
/** Pads a one-character field to Discord's minimum without showing anything. */
const ZERO_WIDTH_SPACE = '\u200b'
const MAX_TEXT = 128

/**
 * Two cards are the same if they differ only by this much in their timestamps.
 *
 * The start time is worked out from SoundCloud's clock, which counts whole seconds and reaches
 * us about once a second, so on every tick it lands up to a second away from where it was. A
 * difference bigger than that is a real seek.
 */
const TIMESTAMP_TOLERANCE_MS = 2_500

/**
 * The card for what is playing, or null for no card at all.
 *
 * `now` is passed in rather than read, so the timestamps can be tested.
 */
export function buildActivity(
  nowPlaying: NowPlaying | null,
  options: PresenceOptions,
  now: number
): Activity | null {
  if (!nowPlaying) return null
  if (!nowPlaying.playing && !options.showWhenPaused) return null

  const { title, artist, url, artwork, elapsed, duration, playing } = nowPlaying

  const activity: Activity = {
    type: 2,
    status_display_type: 2,
    details: fit(title),
    // Artwork when there is some, with our logo in the corner; our logo alone when there is not.
    // Never the logo twice.
    assets: artwork
      ? { large_image: artwork, small_image: PRESENCE_LOGO, small_text: 'BetterSoundCloud' }
      : { large_image: PRESENCE_LOGO, large_text: 'BetterSoundCloud' },
    instance: false
  }

  // A paused track has no position worth drawing: a bar that does not move reads as wrong.
  const state = playing ? artist : artist ? `${artist} · Paused` : 'Paused'
  if (state) activity.state = fit(state)

  if (playing) {
    const start = now - elapsed * 1000
    activity.timestamps = duration > 0 ? { start, end: start + duration * 1000 } : { start }
  }

  // Shown to everyone looking at the profile — Discord hides buttons from the user themselves.
  // Two is Discord's limit. The track comes first: it is what someone looking at the card most
  // likely wants. `url` is already a clean https soundcloud.com link (see readNowPlaying).
  activity.buttons = url
    ? [{ label: 'Listen on SoundCloud', url }, PROJECT_BUTTON]
    : [PROJECT_BUTTON]

  return activity
}

/**
 * Whether Discord already shows `b` when it shows `a`. Used to send only real changes: a
 * reading arrives every second while a track plays, and Discord accepts about five updates in
 * twenty seconds.
 */
export function sameActivity(a: Activity | null, b: Activity | null): boolean {
  if (a === null || b === null) return a === b

  const { timestamps: aTime, ...aRest } = a
  const { timestamps: bTime, ...bRest } = b
  if (JSON.stringify(aRest) !== JSON.stringify(bRest)) return false

  if (!aTime || !bTime) return aTime === bTime
  return near(aTime.start, bTime.start) && near(aTime.end, bTime.end)
}

function near(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return Math.abs(a - b) <= TIMESTAMP_TOLERANCE_MS
}

/**
 * Make text fit Discord's limits, which reject the whole update rather than trimming it.
 *
 * Cut by whole characters, so an emoji is never split into half a surrogate pair, and padded
 * with a zero-width space when one character is all there is.
 */
function fit(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length > MAX_TEXT) {
    let cut = ''
    for (const character of trimmed) {
      if (cut.length + character.length > MAX_TEXT - 1) break
      cut += character
    }
    return `${cut}…`
  }
  return trimmed.length < MIN_TEXT ? trimmed.padEnd(MIN_TEXT, ZERO_WIDTH_SPACE) : trimmed
}

/*
 * ── Whether it is working ─────────────────────────────────────────────────────────────────
 *
 * The settings panel shows this under the Discord toggle. Without it, a user with Discord
 * closed sees a ticked box and no card — a control that silently does nothing, which is the
 * one thing this app has promised not to ship (docs/PRODUCT.md, "Say what does not work").
 */

/** Why the connection to Discord is not up. Set by src/main/discord-ipc.ts. */
export type DiscordCloseReason =
  /** Nothing is listening on any of Discord's pipes: the desktop app is closed or not installed. */
  | { kind: 'not-running' }
  /** Discord answered and turned us away, with its own message (e.g. "Invalid Client ID"). */
  | { kind: 'refused'; message: string }
  /** It was up, or half up, and went away: Discord quit, or stopped answering. */
  | { kind: 'lost'; message: string }

/** What the card on Discord is right now, as far as BetterSoundCloud knows. */
export type PresenceStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | {
      state: 'connected'
      /** The track on the card, or null when there is no card. */
      showing: { title: string; artist: string; paused: boolean } | null
      /** No card because the track is paused and the setting says to clear it. */
      hiddenWhilePaused: boolean
      /** Discord's reason for refusing the last update, or '' when it took it. */
      refused: string
    }
  | { state: 'unavailable'; reason: DiscordCloseReason }

export type PresenceStatusMessage = {
  /** The state in two or three words, drawn stronger than the rest. */
  lead: string
  /** The rest of the sentence: what that means, or what to do. */
  detail: string
  /** A problem worth its own line — Discord refusing an update. Empty when there is none. */
  problem: string
  /** Offer "Try now". Only where trying again can have a different result. */
  canRetry: boolean
}

/** The words for a status, or null for nothing to show — presence switched off says so itself. */
export function describePresenceStatus(status: PresenceStatus): PresenceStatusMessage | null {
  switch (status.state) {
    case 'off':
      return null

    case 'connecting':
      return { lead: 'Looking for Discord…', detail: '', problem: '', canRetry: false }

    case 'connected': {
      const problem = status.refused
        ? `Discord didn’t accept the last update: ${status.refused}`
        : ''
      if (status.showing) {
        const { title, artist, paused } = status.showing
        const by = artist ? ` by ${artist}` : ''
        return {
          lead: 'Connected',
          detail: `Showing “${title}”${by}${paused ? ', paused' : ''}.`,
          problem,
          canRetry: false
        }
      }
      return {
        lead: 'Connected',
        detail: status.hiddenWhilePaused
          ? 'Your status is hidden while the track is paused.'
          : 'Nothing is playing, so nothing is shown.',
        problem,
        canRetry: false
      }
    }

    case 'unavailable':
      switch (status.reason.kind) {
        case 'not-running':
          return {
            lead: 'Discord isn’t running',
            detail:
              'Open the Discord desktop app on this computer. BetterSoundCloud connects by itself ' +
              'within a minute.',
            problem: '',
            canRetry: true
          }
        case 'refused':
          return {
            lead: 'Discord refused the connection',
            detail: `It said: ${status.reason.message}`,
            problem: '',
            canRetry: true
          }
        case 'lost':
          return {
            lead: 'Lost the connection to Discord',
            detail: 'Trying again by itself.',
            problem: '',
            canRetry: true
          }
      }
  }
}
