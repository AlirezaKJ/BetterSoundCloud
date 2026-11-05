import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runPlugin } from './plugin-sandbox'
import type { Bridge } from './plugin-sandbox'
import type { NowPlaying } from '@shared/now-playing'
import type { PluginStatus } from '@shared/plugin-api'

/*
 * The bundled Last.fm plugin — the real file in resources/plugins/lastfm — run through the real
 * sandbox against a fake Last.fm. What it pins is Last.fm's own rules: when a play counts, how a
 * request is signed, and what happens when Last.fm is down or signs us out.
 */

const DIR = join(import.meta.dirname, '../../resources/plugins/lastfm')
const CODE = readFileSync(join(DIR, 'index.js'), 'utf8')
/** The same script as a build without BetterSoundCloud's key would have it. */
const CODE_WITHOUT_KEY = CODE.replace(/(const BUILT_IN_\w+ = )'[^']*'/g, "$1''")
const MANIFEST = JSON.parse(readFileSync(join(DIR, 'plugin.json'), 'utf8')) as {
  permissions: string[]
}

type Request = { http: 'GET' | 'POST'; params: Record<string, string> }
type Answer = { status?: number; body: unknown }

function fakeLastFm(answer: (params: Record<string, string>) => Answer = () => ({ body: {} })) {
  const requests: Request[] = []
  const storage = new Map<string, unknown>()
  const secrets = new Map<string, string>()
  const opened: string[] = []
  const statuses: (PluginStatus | null)[] = []
  const actions: string[][] = []
  const logs: string[] = []
  let respond = answer

  const bridge: Bridge = {
    call: (method, args) => {
      const key = String(args[0])
      switch (method) {
        case 'storage.get':
          return Promise.resolve(storage.get(key) ?? null)
        case 'storage.set':
          storage.set(key, args[1])
          return Promise.resolve(null)
        case 'secrets.get':
          return Promise.resolve(secrets.get(key) ?? null)
        case 'secrets.set':
          secrets.set(key, String(args[1]))
          return Promise.resolve(null)
        case 'secrets.delete':
          secrets.delete(key)
          return Promise.resolve(null)
        case 'settings.secret':
          return Promise.resolve(key === 'apiSecret' ? 'test-secret' : '')
        case 'openInBrowser':
          opened.push(key)
          return Promise.resolve(null)
        default:
          return Promise.resolve(null)
      }
    },
    status: (status) => statuses.push(status),
    actions: (list) => actions.push(list.map((a) => a.id)),
    log: (level, message) => logs.push(`${level}: ${message}`),
    fetch: (url, init) => {
      const http = init.method === 'POST' ? 'POST' : 'GET'
      const query = http === 'POST' ? (init.body ?? '') : (new URL(url).search.slice(1) ?? '')
      const params = Object.fromEntries(new URLSearchParams(query))
      requests.push({ http, params })
      const { status = 200, body } = respond(params)
      return Promise.resolve({ status, body: JSON.stringify(body) })
    }
  }

  return {
    bridge,
    requests,
    storage,
    secrets,
    opened,
    logs,
    status: () => statuses.at(-1) ?? null,
    actions: () => actions.at(-1) ?? [],
    calls: (method: string) => requests.filter((r) => r.params['method'] === method),
    answer: (next: typeof answer) => (respond = next)
  }
}

async function start(
  lastfm: ReturnType<typeof fakeLastFm>,
  settings: Record<string, boolean | string> = {},
  code = CODE
) {
  const running = await runPlugin(
    {
      id: 'lastfm',
      version: '1.0.0',
      code,
      filename: 'lastfm/index.js',
      permissions: MANIFEST.permissions,
      settings: { nowPlaying: true, splitTitles: true, apiKey: 'test-key', ...settings }
    },
    lastfm.bridge
  )
  await settle()
  return running
}

/** Let the plugin's promise chains run, without moving the (fake) clock. */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve))
}

const TRACK: NowPlaying = {
  title: 'Birahe',
  artist: 'Ali Sorena',
  url: 'https://soundcloud.com/first-programmer/birahe',
  artwork: '',
  elapsed: 0,
  duration: 200,
  playing: true,
  liked: false
}

/** Play `track` from `from` to `to` seconds, one reading a second, as SoundCloud's clock ticks. */
async function listen(
  running: Awaited<ReturnType<typeof start>>,
  track: NowPlaying,
  from: number,
  to: number
) {
  for (let elapsed = from; elapsed <= to; elapsed++) running.nowPlaying({ ...track, elapsed })
  await settle()
}

/** Last.fm's signature: parameters sorted by name, run together, then the secret, as MD5. */
function expectedSignature(params: Record<string, string>): string {
  const base = Object.keys(params)
    .filter((k) => k !== 'format' && k !== 'api_sig')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  return createHash('md5').update(`${base}test-secret`, 'utf8').digest('hex')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the Last.fm plugin', () => {
  it('says so when there is no API key to use, instead of offering a Connect that cannot work', async () => {
    expect(CODE_WITHOUT_KEY).not.toBe(CODE)
    const lastfm = fakeLastFm()
    await start(lastfm, { apiKey: '' }, CODE_WITHOUT_KEY)
    expect(lastfm.status()).toMatchObject({ lead: 'No API key' })
    expect(lastfm.actions()).toEqual([])
  })

  it('uses BetterSoundCloud’s own key unless the user set one', async () => {
    const lastfm = fakeLastFm(() => ({ body: { token: 'tok' } }))
    const running = await start(lastfm, { apiKey: '' })
    expect(lastfm.status()).toMatchObject({ lead: 'Not connected' })
    running.action('connect')
    await settle()
    const builtIn = /const BUILT_IN_API_KEY = '(\w+)'/.exec(CODE)?.[1]
    expect(builtIn).toMatch(/^[0-9a-f]{32}$/)
    expect(lastfm.calls('auth.getToken')[0]?.params['api_key']).toBe(builtIn)
  })

  it('connects through Last.fm’s desktop flow and keeps the session encrypted', async () => {
    let approved = false
    const lastfm = fakeLastFm((params) => {
      if (params['method'] === 'auth.getToken') return { body: { token: 'tok' } }
      if (params['method'] === 'auth.getSession') {
        return approved
          ? { body: { session: { key: 'sk', name: 'akj' } } }
          : { status: 403, body: { error: 14, message: 'Unauthorized Token' } }
      }
      return { body: {} }
    })
    const running = await start(lastfm)
    expect(lastfm.status()).toMatchObject({ lead: 'Not connected' })
    expect(lastfm.actions()).toEqual(['connect'])

    running.action('connect')
    await settle()
    const [token] = lastfm.calls('auth.getToken')
    expect(token?.http).toBe('GET')
    expect(token?.params['api_sig']).toBe(expectedSignature(token?.params ?? {}))
    expect(lastfm.opened).toEqual(['https://www.last.fm/api/auth/?api_key=test-key&token=tok'])
    expect(lastfm.status()).toMatchObject({ lead: 'Waiting for you on last.fm' })

    // Not approved yet: it keeps asking.
    await vi.advanceTimersByTimeAsync(3_000)
    await settle()
    expect(lastfm.calls('auth.getSession')).toHaveLength(1)
    expect(lastfm.status()).toMatchObject({ lead: 'Waiting for you on last.fm' })

    approved = true
    await vi.advanceTimersByTimeAsync(3_000)
    await settle()
    expect(lastfm.secrets.get('session')).toBe('sk')
    expect(lastfm.storage.get('username')).toBe('akj')
    expect(lastfm.status()).toMatchObject({ lead: 'Connected as akj' })
    expect(lastfm.actions()).toEqual(['disconnect'])
  })

  it('announces a track, then scrobbles it once half of it has really played', async () => {
    const lastfm = fakeLastFm()
    lastfm.secrets.set('session', 'sk')
    lastfm.storage.set('username', 'akj')
    const running = await start(lastfm)

    await listen(running, TRACK, 0, 98)
    expect(lastfm.calls('track.updateNowPlaying')).toHaveLength(1)
    const [announce] = lastfm.calls('track.updateNowPlaying')
    expect(announce).toMatchObject({
      http: 'POST',
      params: { artist: 'Ali Sorena', track: 'Birahe', duration: '200', sk: 'sk' }
    })
    expect(announce?.params['api_sig']).toBe(expectedSignature(announce?.params ?? {}))
    expect(lastfm.calls('track.scrobble')).toHaveLength(0)

    // The hundredth second heard: half of 200.
    await listen(running, TRACK, 99, 100)
    const [scrobble] = lastfm.calls('track.scrobble')
    expect(scrobble?.params).toMatchObject({
      'artist[0]': 'Ali Sorena',
      'track[0]': 'Birahe',
      'duration[0]': '200'
    })
    // When it started, in Unix seconds.
    const started = Number(scrobble?.params['timestamp[0]'])
    expect(Math.abs(started - Math.floor(Date.now() / 1000))).toBeLessThan(5)
    expect(lastfm.status()).toMatchObject({
      lead: 'Connected as akj',
      detail: 'Last scrobbled “Birahe” by Ali Sorena.'
    })

    // Once per play, however much longer it plays.
    await listen(running, TRACK, 101, 199)
    expect(lastfm.calls('track.scrobble')).toHaveLength(1)
  })

  it('does not count seeking forward or time spent paused as listening', async () => {
    const lastfm = fakeLastFm()
    lastfm.secrets.set('session', 'sk')
    const running = await start(lastfm)

    await listen(running, TRACK, 0, 10)
    // Jump to near the end, and sit paused there for a while.
    running.nowPlaying({ ...TRACK, elapsed: 180 })
    for (let i = 0; i < 50; i++) running.nowPlaying({ ...TRACK, elapsed: 180, playing: false })
    await listen(running, TRACK, 180, 199)
    await settle()
    // 10 + 19 seconds heard: nowhere near the 100 needed.
    expect(lastfm.calls('track.scrobble')).toHaveLength(0)
  })

  it('never scrobbles a track of 30 seconds or less', async () => {
    const lastfm = fakeLastFm()
    lastfm.secrets.set('session', 'sk')
    const running = await start(lastfm)
    await listen(running, { ...TRACK, duration: 25 }, 0, 25)
    expect(lastfm.calls('track.scrobble')).toHaveLength(0)
  })

  it('counts a loop of the same track as a second play', async () => {
    const lastfm = fakeLastFm()
    lastfm.secrets.set('session', 'sk')
    const short = { ...TRACK, duration: 60 }
    const running = await start(lastfm)
    await listen(running, short, 0, 60)
    await listen(running, short, 0, 40)
    expect(lastfm.calls('track.scrobble')).toHaveLength(2)
  })

  it('splits "Artist - Title" uploads, unless told not to', async () => {
    const upload = {
      ...TRACK,
      title: 'Daft Punk – One More Time',
      artist: 'Some Label',
      duration: 60
    }

    const split = fakeLastFm()
    split.secrets.set('session', 'sk')
    await listen(await start(split), upload, 0, 30)
    expect(split.calls('track.scrobble')[0]?.params).toMatchObject({
      'artist[0]': 'Daft Punk',
      'track[0]': 'One More Time'
    })

    const asIs = fakeLastFm()
    asIs.secrets.set('session', 'sk')
    await listen(await start(asIs, { splitTitles: false }), upload, 0, 30)
    expect(asIs.calls('track.scrobble')[0]?.params).toMatchObject({
      'artist[0]': 'Some Label',
      'track[0]': 'Daft Punk – One More Time'
    })
  })

  it('keeps scrobbles Last.fm could not take, says so, and sends them together later', async () => {
    let down = true
    const lastfm = fakeLastFm((params) =>
      down && params['method'] === 'track.scrobble'
        ? { status: 503, body: { error: 11, message: 'Service Offline' } }
        : { body: {} }
    )
    lastfm.secrets.set('session', 'sk')
    const running = await start(lastfm)
    const short = { ...TRACK, duration: 60 }

    await listen(running, short, 0, 30)
    expect(lastfm.storage.get('queue')).toHaveLength(1)
    expect(lastfm.status()?.problem).toMatch(/1 scrobble is waiting/)

    down = false
    await listen(
      running,
      { ...short, url: 'https://soundcloud.com/a/second', title: 'Second' },
      0,
      30
    )
    const last = lastfm.calls('track.scrobble').at(-1)
    // Both in one request, oldest first.
    expect(last?.params).toMatchObject({ 'track[0]': 'Birahe', 'track[1]': 'Second' })
    expect(lastfm.storage.get('queue')).toEqual([])
    expect(lastfm.status()?.problem ?? '').toBe('')
  })

  it('drops a session Last.fm no longer accepts, and asks to connect again', async () => {
    const lastfm = fakeLastFm((params) =>
      params['method'] === 'track.scrobble' || params['method'] === 'track.updateNowPlaying'
        ? { status: 403, body: { error: 9, message: 'Invalid session key' } }
        : { body: {} }
    )
    lastfm.secrets.set('session', 'sk')
    const running = await start(lastfm)
    await listen(running, { ...TRACK, duration: 60 }, 0, 30)

    expect(lastfm.secrets.has('session')).toBe(false)
    expect(lastfm.status()).toMatchObject({
      lead: 'Not connected',
      problem: 'Last.fm signed BetterSoundCloud out. Connect again to keep scrobbling.'
    })
    expect(lastfm.actions()).toEqual(['connect'])
  })
})
