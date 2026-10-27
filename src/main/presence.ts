import { buildActivity, sameActivity } from '@shared/presence'
import type { Activity, PresenceOptions } from '@shared/presence'
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

/** What Discord is showing right now, as far as we know. */
let shown: Activity | null = null
let lastSentAt = 0
let sendTimer: ReturnType<typeof setTimeout> | null = null

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
}

/** Bring the card in line with what is playing, if it is out of line. */
function update(): void {
  if (!enabled || !ready) return
  const wanted = buildActivity(getNowPlaying(), options, Date.now())
  // A reading arrives every second while a track plays. Almost all of them change nothing
  // Discord shows, and must not cost an update.
  if (sameActivity(wanted, shown)) return
  scheduleSend()
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
  lastSentAt = Date.now()
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
      // A fresh connection starts with no card, whatever the last one showed.
      shown = null
      if (isDev) console.log('[discord] connected')
      update()
    },
    onClose: (reason) => {
      if (connection !== mine) return
      connection = null
      ready = false
      shown = null
      failures += 1
      // Once per outage, not once a minute while Discord stays closed.
      if (isDev && failures === 1) console.log(`[discord] ${reason} — will keep trying`)
      if (enabled) scheduleReconnect()
    },
    // An activity Discord refused is a bug in what we built, so it is logged in every build.
    onError: (message) => console.warn(`[discord] Discord refused the update: ${message}`)
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
