import { buildActivity, sameActivity } from '@shared/presence'
import type {
  Activity,
  DiscordCloseReason,
  PresenceOptions,
  PresenceStatus
} from '@shared/presence'
import type { NowPlaying } from '@shared/now-playing'
import { connectDiscord } from './discord-ipc'
import type { DiscordConnection } from './discord-ipc'
import { getNowPlaying, onNowPlayingChange } from './now-playing'
import { isDev } from './env'

/**
 * Discord Rich Presence: the "Listening to BetterSoundCloud" card on the user's profile.
 *
 * Main-side, like every consumer of now-playing (CLAUDE.md §8): it reads `getNowPlaying` and
 * listens to `onNowPlayingChange`, and never goes near SoundCloud's page. v0.7.x ran this in the
 * renderer and rebuilt the connection on a five-second loop.
 *
 * It belongs to the app, not to a window — so a card survives the window being recreated, and
 * one connection is all there ever is.
 */

/**
 * BetterSoundCloud's own application on Discord, the same one v0.7.x used. Reusing it keeps
 * its name and the art already uploaded to it (decided 2026-10-27; see docs/TODO.md). Public by
 * design — every Rich Presence app ships its id.
 */
const CLIENT_ID = '1054636117284106270'

/**
 * Discord accepts about five activity updates per twenty seconds and quietly drops the rest, so
 * updates are spaced at least this far apart. The first change after a quiet spell still goes
 * out at once; only a burst — skipping through tracks — waits, and the wait sends the latest.
 */
const MIN_SEND_INTERVAL_MS = 4_000

/**
 * How long to wait before trying Discord again: after it closes, or while it is not running.
 * Backs off to once a minute, which costs nothing — it is a local pipe, not the network.
 */
const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

let enabled = false
let options: PresenceOptions = { showWhenPaused: false }
let subscribed = false

let connection: DiscordConnection | null = null
let ready = false
let failures = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

/** What Discord is showing right now, as far as we know — and the track it was built from. */
let shown: Activity | null = null
let shownTrack: NowPlaying | null = null
let lastSentAt = 0
let sendTimer: ReturnType<typeof setTimeout> | null = null

/** Why the last connection ended, until one succeeds. Null on the first attempt. */
let lastClose: DiscordCloseReason | null = null
/** Discord's reason for refusing the last update, or '' when it accepted it. */
let refused = ''

type StatusListener = (status: PresenceStatus) => void
const statusListeners = new Set<StatusListener>()
let lastStatusJson = ''

/**
 * Whether it is working, for the settings panel. `getPresenceStatus` reads it once;
 * `onPresenceStatusChange` follows it. It changes on connecting, on losing Discord, and when the
 * card does — at most every few seconds.
 */
export function getPresenceStatus(): PresenceStatus {
  if (!enabled) return { state: 'off' }
  if (ready) {
    const playing = getNowPlaying()
    return {
      state: 'connected',
      showing:
        shown && shownTrack
          ? { title: shownTrack.title, artist: shownTrack.artist, paused: !shownTrack.playing }
          : null,
      hiddenWhilePaused:
        !shown && playing !== null && !playing.playing && !options.showWhenPaused,
      refused
    }
  }
  // While retrying after a failure, keep saying what the failure was. Flipping to "looking"
  // and back on every attempt would make the line flicker once a minute for nothing.
  return lastClose ? { state: 'unavailable', reason: lastClose } : { state: 'connecting' }
}

/** Run `listener` whenever the status changes. Returns a function that stops it. */
export function onPresenceStatusChange(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/**
 * Try Discord now rather than at the next scheduled attempt — for "Try now" in settings, and
 * for the moment the Discord section opens. Does nothing while connected or switched off.
 */
export function retryPresenceNow(): void {
  if (!enabled || connection) return
  lastClose = null
  connect()
  notifyStatus()
}

function notifyStatus(): void {
  const status = getPresenceStatus()
  const json = JSON.stringify(status)
  if (json === lastStatusJson) return
  lastStatusJson = json
  for (const listener of statusListeners) {
    try {
      listener(status)
    } catch (error) {
      console.error('[discord] status listener failed:', error)
    }
  }
}

/**
 * Follow the settings. Called from `applyLiveSettings`, so at startup and on every change.
 */
export function setPresenceOptions(next: { enabled: boolean } & PresenceOptions): void {
  if (!subscribed) {
    subscribed = true
    onNowPlayingChange(update)
  }

  options = { showWhenPaused: next.showWhenPaused }
  if (next.enabled !== enabled) {
    enabled = next.enabled
    if (enabled) connect()
    else disconnect()
  }
  update()
  notifyStatus()
}

/** Bring the card in line with what is playing, if it is out of line. */
function update(): void {
  if (!enabled || !ready) return
  const wanted = buildActivity(getNowPlaying(), options, Date.now())
  // A reading arrives every second while a track plays. Almost all of them change nothing
  // Discord shows, and must not cost an update.
  if (!sameActivity(wanted, shown)) scheduleSend()
  // "Hidden while paused" follows the track, not the card, so it can change without a send.
  notifyStatus()
}

function scheduleSend(): void {
  if (sendTimer) return // already due; it will send whatever is current by then
  const wait = Math.max(0, lastSentAt + MIN_SEND_INTERVAL_MS - Date.now())
  if (wait === 0) send()
  else sendTimer = setTimeout(send, wait)
}

function send(): void {
  sendTimer = null
  if (!enabled || !ready || !connection) return
  // Built fresh rather than kept from when the send was scheduled, so a delayed update carries
  // the latest track and up-to-date timestamps.
  const wanted = buildActivity(getNowPlaying(), options, Date.now())
  if (sameActivity(wanted, shown)) return

  connection.setActivity(wanted)
  shown = wanted
  shownTrack = wanted ? getNowPlaying() : null
  lastSentAt = Date.now()
  // Cleared on every send; Discord's answer arrives after it, and sets it again if it refused.
  refused = ''
  notifyStatus()
  if (isDev) {
    console.log(
      wanted
        ? `[discord] showing ${wanted.state ?? ''} — ${wanted.details}`
        : '[discord] cleared'
    )
  }
}

function connect(): void {
  clearReconnect()
  const mine: DiscordConnection = connectDiscord({
    clientId: CLIENT_ID,
    onReady: () => {
      if (connection !== mine) return
      ready = true
      failures = 0
      lastClose = null
      // A fresh connection starts with no card, whatever the last one showed.
      shown = null
      shownTrack = null
      if (isDev) console.log('[discord] connected')
      update()
      notifyStatus()
    },
    onClose: (reason) => {
      if (connection !== mine) return
      connection = null
      ready = false
      shown = null
      shownTrack = null
      lastClose = reason
      failures += 1
      // Once per outage, not once a minute while Discord stays closed.
      if (isDev && failures === 1) {
        const why = reason.kind === 'not-running' ? 'Discord is not running' : reason.message
        console.log(`[discord] ${why} — will keep trying`)
      }
      if (enabled) scheduleReconnect()
      notifyStatus()
    },
    // An activity Discord refused is a bug in what we built, so it is logged in every build —
    // and shown in settings, so it is not only a line in a log nobody reads.
    onError: (message) => {
      if (connection !== mine) return
      console.warn(`[discord] Discord refused the update: ${message}`)
      refused = message
      notifyStatus()
    }
  })
  connection = mine
}

function disconnect(): void {
  clearReconnect()
  if (sendTimer) clearTimeout(sendTimer)
  sendTimer = null
  if (connection) {
    // Closing alone clears the card; saying so first does not depend on that.
    connection.setActivity(null)
    connection.close()
    if (isDev) console.log('[discord] off')
  }
  connection = null
  ready = false
  shown = null
  shownTrack = null
  lastClose = null
  refused = ''
  failures = 0
}

function scheduleReconnect(): void {
  clearReconnect()
  const delay =
    RECONNECT_DELAYS_MS[Math.min(failures - 1, RECONNECT_DELAYS_MS.length - 1)] ?? 60_000
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (enabled && !connection) connect()
  }, delay)
}

function clearReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
}
