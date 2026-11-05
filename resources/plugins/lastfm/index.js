// @ts-check
/**
 * Last.fm scrobbling, as a BetterSoundCloud plugin.
 *
 * Written exactly as anyone's plugin would be — plain JavaScript, only the `bsc` API, nothing
 * else — so it doubles as the reference plugin. docs/CUSTOM_PLUGINS.md walks through it.
 *
 * WHAT IT DOES
 *   - Connects a Last.fm account with Last.fm's desktop flow: get a token, open last.fm in the
 *     user's browser to approve it, then trade the token for a session key. The key is kept
 *     with `bsc.secrets`, encrypted by the operating system.
 *   - Tells Last.fm "Scrobbling now" when a track starts, and scrobbles it once it has really
 *     been heard: longer than 30 seconds, and played for half its length or four minutes,
 *     whichever comes first (Last.fm's own rule). Seeking forward and pausing do not count as
 *     listening; a track that loops counts again.
 *   - Keeps scrobbles Last.fm could not take — offline, Last.fm down — and sends them later.
 *
 * WHAT IT DOES NOT DO: touch SoundCloud's page. Everything comes from `bsc.nowPlaying`, which
 * main already reads; v0.7.x ran this inside the page with its secret in the page's storage.
 */

/** @typedef {import('../../../src/shared/plugin-api').PluginApi} PluginApi */
/** @typedef {import('../../../src/shared/now-playing').NowPlaying} NowPlaying */
/** @typedef {{ artist: string, track: string, timestamp: number, duration: number }} Scrobble */

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/'
const AUTH_PAGE = 'https://www.last.fm/api/auth/'

/**
 * BetterSoundCloud's own Last.fm API account. Readable by anyone who looks, as in every
 * open-source scrobbler: Last.fm's desktop flow has no way to keep it secret from the user's
 * own machine. If Last.fm ever stops accepting it, the plugin's settings take your own.
 */
const BUILT_IN_API_KEY = '64480956d5eb7e4c7e03e1a4f75c2d7a'
const BUILT_IN_SHARED_SECRET = 'e86d1a6593fd03e6be0a78340b5d7b2c'

/** Last.fm's rules for when a play counts. */
const MIN_TRACK_SECONDS = 30
const MAX_WAIT_SECONDS = 240

/** While the user approves in their browser, ask Last.fm this often, for at most this long. */
const APPROVAL_POLL_MS = 3_000
const APPROVAL_TIMEOUT_MS = 5 * 60_000

/** Scrobbles kept while Last.fm cannot take them; it accepts them up to two weeks late. */
const QUEUE_LIMIT = 200
const QUEUE_RETRY_MS = 2 * 60_000
const BATCH_SIZE = 50

/**
 * Last.fm error codes we act on (https://www.last.fm/api/errorcodes).
 *   Worth trying again later: 8 operation failed, 11 service offline, 16 temporarily
 *   unavailable, 29 rate limit — and our own -1, for a request that never got an answer.
 */
const TRY_AGAIN_LATER = new Set([-1, 8, 11, 16, 29])
const INVALID_SESSION = 9
const NOT_APPROVED_YET = 14
const BAD_API_KEY = new Set([10, 13, 26])

/** @type {PluginApi} */
let bsc
/** @type {{ key: string, name: string } | null} */
let session = null
/**
 * The play in progress: one listen of one track. A loop of the same track is a new play.
 * @type {{ id: string, artist: string, track: string, duration: number, startedAt: number,
 *          heard: number, lastElapsed: number, wasPlaying: boolean, announced: boolean,
 *          scrobbled: boolean } | null}
 */
let play = null
/** @type {{ token: string, deadline: number, timer: unknown } | null} */
let approval = null
/** @type {{ artist: string, track: string } | null} */
let lastScrobble = null
/** @type {Scrobble[]} */
let queue = []
/** @type {unknown} */
let queueTimer = null
/** Something wrong worth its own line, or ''. */
let problem = ''

class LastFmError extends Error {
  /** @param {number} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

module.exports = {
  /** @param {PluginApi} api */
  async activate(api) {
    bsc = api
    bsc.actions.onPress(onAction)

    const key = await bsc.secrets.get('session')
    const name = await bsc.storage.get('username')
    session = key ? { key, name: typeof name === 'string' ? name : '' } : null

    const saved = await bsc.storage.get('queue')
    queue = Array.isArray(saved) ? saved.filter(isScrobble).slice(-QUEUE_LIMIT) : []

    bsc.nowPlaying.onChange(onNowPlaying)
    render()
    if (queue.length > 0) scheduleQueue(5_000)
  },

  deactivate() {
    // A play still in progress has not been heard long enough to count, so nothing to send.
    // Queued scrobbles are already saved and go out on the next start.
    stopApproval()
  }
}

/* ── Listening ───────────────────────────────────────────────────────────────────────────── */

/** @param {NowPlaying | null} now */
function onNowPlaying(now) {
  if (!now) {
    play = null
    return
  }

  const id = now.url || `${now.artist}\n${now.title}`
  // Back near the start of the same track after being further in: it looped.
  const looped =
    play !== null && play.id === id && now.elapsed <= 3 && play.lastElapsed > now.elapsed + 3

  if (!play || play.id !== id || looped) {
    const { artist, track } = names(now)
    play = {
      id,
      artist,
      track,
      duration: now.duration,
      startedAt: Math.floor(Date.now() / 1000) - now.elapsed,
      heard: 0,
      lastElapsed: now.elapsed,
      wasPlaying: now.playing,
      announced: false,
      scrobbled: false
    }
  } else {
    // Count only real listening: a step of a second or two while playing. A seek forward is a
    // jump, and a paused clock does not move, so neither counts.
    const step = now.elapsed - play.lastElapsed
    if (now.playing && play.wasPlaying && step > 0 && step <= 2) play.heard += step
    play.lastElapsed = now.elapsed
    play.wasPlaying = now.playing
    if (now.duration > 0) play.duration = now.duration
  }

  if (!session || !play.artist || !play.track) return
  const current = play

  if (now.playing && !current.announced && bsc.settings.get()['nowPlaying'] !== false) {
    current.announced = true
    void announce(current)
  }

  const needed = Math.min(current.duration / 2, MAX_WAIT_SECONDS)
  if (!current.scrobbled && current.duration > MIN_TRACK_SECONDS && current.heard >= needed) {
    current.scrobbled = true
    void scrobble({
      artist: current.artist,
      track: current.track,
      timestamp: current.startedAt,
      duration: current.duration
    })
  }
}

/**
 * The artist and title Last.fm should see. SoundCloud only knows who uploaded a track, which for
 * a label or a fan upload is not the artist — so "Artist - Title" names are split, unless the
 * user turned that off.
 * @param {NowPlaying} now
 */
function names(now) {
  if (bsc.settings.get()['splitTitles'] !== false) {
    const match = /^(.+?)\s+[-\u2013\u2014\u2015]\s+(.+)$/.exec(now.title)
    if (match && match[1] && match[2])
      return { artist: match[1].trim(), track: match[2].trim() }
  }
  return { artist: now.artist.trim(), track: now.title.trim() }
}

/** "Scrobbling now". Best effort: if it fails, the scrobble itself still happens later. */
async function announce(/** @type {NonNullable<typeof play>} */ current) {
  if (!session) return
  try {
    /** @type {Record<string, string>} */
    const params = { artist: current.artist, track: current.track, sk: session.key }
    if (current.duration > 0) params['duration'] = String(current.duration)
    await call('track.updateNowPlaying', params, true)
  } catch (error) {
    handle(error)
  }
}

/** @param {Scrobble} item */
async function scrobble(item) {
  queue.push(item)
  if (queue.length > QUEUE_LIMIT) queue = queue.slice(-QUEUE_LIMIT)
  await saveQueue()
  await flushQueue()
}

/** Send what is queued, oldest first, up to fifty at a time. */
async function flushQueue() {
  if (!session || queue.length === 0) return
  const batch = queue.slice(0, BATCH_SIZE)
  /** @type {Record<string, string>} */
  const params = { sk: session.key }
  batch.forEach((item, i) => {
    params[`artist[${i}]`] = item.artist
    params[`track[${i}]`] = item.track
    params[`timestamp[${i}]`] = String(item.timestamp)
    if (item.duration > 0) params[`duration[${i}]`] = String(item.duration)
  })

  try {
    await call('track.scrobble', params, true)
  } catch (error) {
    handle(error)
    const code = error instanceof LastFmError ? error.code : -1
    if (TRY_AGAIN_LATER.has(code)) {
      scheduleQueue(QUEUE_RETRY_MS)
    } else if (code !== INVALID_SESSION && !BAD_API_KEY.has(code)) {
      // Refused for good: drop this batch rather than let it block everything queued behind it.
      // A signed-out session or a bad key keeps the queue, to send once that is fixed.
      bsc.warn(`Last.fm refused ${batch.length} scrobble(s) for good:`, messageOf(error))
      queue = queue.slice(batch.length)
      await saveQueue()
    }
    render()
    return
  }

  queue = queue.slice(batch.length)
  const last = batch[batch.length - 1]
  if (last) lastScrobble = { artist: last.artist, track: last.track }
  problem = ''
  await saveQueue()
  render()
  if (queue.length > 0) void flushQueue()
}

/** @param {number} ms */
function scheduleQueue(ms) {
  if (queueTimer) return
  queueTimer = setTimeout(() => {
    queueTimer = null
    void flushQueue()
  }, ms)
}

async function saveQueue() {
  try {
    await bsc.storage.set('queue', queue)
  } catch (error) {
    bsc.warn('could not save the scrobble queue:', error)
  }
}

/* ── Connecting an account ───────────────────────────────────────────────────────────────── */

/** @param {string} id */
function onAction(id) {
  if (id === 'connect') void connect()
  else if (id === 'cancel') {
    stopApproval()
    render()
  } else if (id === 'disconnect') void disconnect()
}

async function connect() {
  stopApproval()
  problem = ''
  const keys = await credentials()
  if (!keys) {
    render()
    return
  }
  try {
    const data = /** @type {{ token?: unknown }} */ (await call('auth.getToken', {}, false))
    const token = typeof data.token === 'string' ? data.token : ''
    if (!token) throw new LastFmError(-1, 'Last.fm sent no token')
    await bsc.openInBrowser(
      `${AUTH_PAGE}?api_key=${encodeURIComponent(keys.key)}&token=${encodeURIComponent(token)}`
    )
    approval = { token, deadline: Date.now() + APPROVAL_TIMEOUT_MS, timer: null }
    render()
    waitForApproval()
  } catch (error) {
    problem = `Couldn’t start connecting: ${messageOf(error)}`
    render()
  }
}

/** Ask Last.fm whether the user has approved yet; it says "not authorised" until they do. */
function waitForApproval() {
  if (!approval) return
  approval.timer = setTimeout(() => void checkApproval(), APPROVAL_POLL_MS)
}

async function checkApproval() {
  const waiting = approval
  if (!waiting) return
  if (Date.now() > waiting.deadline) {
    stopApproval()
    problem = 'Last.fm didn’t hear back in time. Try connecting again.'
    render()
    return
  }
  try {
    const data = /** @type {{ session?: { key?: unknown, name?: unknown } }} */ (
      await call('auth.getSession', { token: waiting.token }, false)
    )
    const key = data.session?.key
    const name = data.session?.name
    if (typeof key !== 'string' || typeof name !== 'string')
      throw new LastFmError(-1, 'Last.fm sent no session')
    await bsc.secrets.set('session', key)
    await bsc.storage.set('username', name)
    session = { key, name }
    stopApproval()
    problem = ''
    render()
    void flushQueue()
  } catch (error) {
    if (approval !== waiting) return
    if (error instanceof LastFmError && error.code === NOT_APPROVED_YET) {
      waitForApproval()
      return
    }
    stopApproval()
    problem = `Couldn’t connect: ${messageOf(error)}`
    render()
  }
}

function stopApproval() {
  if (approval?.timer) clearTimeout(approval.timer)
  approval = null
}

async function disconnect() {
  session = null
  lastScrobble = null
  problem = ''
  await bsc.secrets.delete('session')
  await bsc.storage.set('username', null)
  render()
}

/* ── Talking to Last.fm ──────────────────────────────────────────────────────────────────── */

/** The API key and secret to use: the user's own if they set one, otherwise ours. */
async function credentials() {
  const own = String(bsc.settings.get()['apiKey'] ?? '').trim()
  if (own) {
    const secret = await bsc.settings.secret('apiSecret')
    return secret ? { key: own, secret } : null
  }
  return BUILT_IN_API_KEY && BUILT_IN_SHARED_SECRET
    ? { key: BUILT_IN_API_KEY, secret: BUILT_IN_SHARED_SECRET }
    : null
}

/**
 * One signed call to Last.fm. Writes are POSTed, reads are GETs; every method used here needs a
 * signature: an MD5 of the parameters, sorted by name and run together, plus the secret.
 * @param {string} method
 * @param {Record<string, string>} params
 * @param {boolean} write
 * @returns {Promise<unknown>}
 */
async function call(method, params, write) {
  const keys = await credentials()
  if (!keys) throw new LastFmError(0, 'there is no API key to use')

  /** @type {Record<string, string>} */
  const signed = { ...params, method, api_key: keys.key }
  signed['api_sig'] = signature(signed, keys.secret)
  signed['format'] = 'json'
  const query = new URLSearchParams(signed).toString()

  let response
  try {
    response = write
      ? await bsc.fetch(API_ROOT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: query
        })
      : await bsc.fetch(`${API_ROOT}?${query}`)
  } catch (error) {
    throw new LastFmError(-1, `no answer from Last.fm (${messageOf(error)})`)
  }

  /** @type {unknown} */
  let data
  try {
    data = await response.json()
  } catch {
    throw new LastFmError(-1, `Last.fm answered ${response.status}`)
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const { error, message } = /** @type {{ error: unknown, message?: unknown }} */ (data)
    throw new LastFmError(Number(error), String(message ?? 'unknown error'))
  }
  if (!response.ok) throw new LastFmError(-1, `Last.fm answered ${response.status}`)
  return data
}

/**
 * @param {Record<string, string>} params
 * @param {string} secret
 */
function signature(params, secret) {
  const base = Object.keys(params)
    .filter((name) => name !== 'format' && name !== 'callback')
    .sort()
    .map((name) => `${name}${params[name]}`)
    .join('')
  return bsc.hash.md5(base + secret)
}

/** React to a failed call in the ways that need more than a retry. @param {unknown} error */
function handle(error) {
  if (!(error instanceof LastFmError)) {
    bsc.warn('unexpected error:', error)
    return
  }
  if (error.code === INVALID_SESSION) {
    session = null
    void bsc.secrets.delete('session')
    problem = 'Last.fm signed BetterSoundCloud out. Connect again to keep scrobbling.'
  } else if (BAD_API_KEY.has(error.code)) {
    problem = `Last.fm refused the API key: ${error.message}`
  } else if (!TRY_AGAIN_LATER.has(error.code)) {
    problem = `Last.fm said: ${error.message}`
  }
  render()
}

/* ── The status line ─────────────────────────────────────────────────────────────────────── */

function render() {
  if (!BUILT_IN_API_KEY && !String(bsc.settings.get()['apiKey'] ?? '').trim()) {
    bsc.status.set({
      lead: 'No API key',
      detail: 'This build has none built in. Enter your own Last.fm API key and secret below.'
    })
    bsc.actions.set([])
    return
  }

  if (approval) {
    bsc.status.set({
      lead: 'Waiting for you on last.fm',
      detail: 'Approve BetterSoundCloud on the page that opened in your browser.',
      problem
    })
    bsc.actions.set([{ id: 'cancel', label: 'Cancel' }])
    return
  }

  if (!session) {
    bsc.status.set({
      lead: 'Not connected',
      detail: 'Connect your Last.fm account to start scrobbling.',
      problem
    })
    bsc.actions.set([{ id: 'connect', label: 'Connect Last.fm account' }])
    return
  }

  const waiting =
    queue.length === 0
      ? ''
      : `${queue.length} ${queue.length === 1 ? 'scrobble is' : 'scrobbles are'} waiting for ` +
        'Last.fm to answer. They’ll be sent by themselves.'
  bsc.status.set({
    lead: `Connected as ${session.name || 'your account'}`,
    detail: lastScrobble
      ? `Last scrobbled “${lastScrobble.track}” by ${lastScrobble.artist}.`
      : 'Nothing scrobbled yet since BetterSoundCloud started.',
    problem: problem || waiting
  })
  bsc.actions.set([{ id: 'disconnect', label: 'Disconnect' }])
}

/** @param {unknown} value @returns {value is Scrobble} */
function isScrobble(value) {
  if (typeof value !== 'object' || value === null) return false
  const item = /** @type {Record<string, unknown>} */ (value)
  return (
    typeof item['artist'] === 'string' &&
    typeof item['track'] === 'string' &&
    typeof item['timestamp'] === 'number' &&
    typeof item['duration'] === 'number'
  )
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
