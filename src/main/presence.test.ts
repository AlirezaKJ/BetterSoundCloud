import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NowPlaying } from '@shared/now-playing'
import type { Activity } from '@shared/presence'
import type { ConnectOptions } from './discord-ipc'

/*
 * When presence connects, what it sends and when, and how it keeps trying. The pipe client is
 * faked (its own tests talk to a real pipe); the clock is fake so the spacing rules can be
 * checked to the millisecond. Each test loads a fresh copy, since the service keeps state.
 */

type FakeConnection = {
  options: ConnectOptions
  setActivity: ReturnType<typeof vi.fn<(activity: Activity | null) => void>>
  close: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({ connections: [] as FakeConnection[] }))

vi.mock('./discord-ipc', () => ({
  connectDiscord: (options: ConnectOptions) => {
    const connection = { options, setActivity: vi.fn(), close: vi.fn() }
    mocks.connections.push(connection)
    return connection
  }
}))
vi.mock('./env', () => ({ isDev: false }))

const NOW = 1_800_000_000_000

const TRACK: NowPlaying = {
  title: 'Birahe',
  artist: 'Ali Sorena',
  url: 'https://soundcloud.com/first-programmer/birahe',
  artwork: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
  elapsed: 80,
  duration: 188,
  playing: true,
  liked: false
}

async function load() {
  vi.resetModules()
  const presence = await import('./presence')
  const nowPlaying = await import('./now-playing')
  return { ...presence, ...nowPlaying }
}

const latest = () => mocks.connections.at(-1)!
const sent = () => latest().setActivity.mock.calls.map(([activity]) => activity)

beforeEach(() => {
  mocks.connections.length = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('presence', () => {
  it('connects as BetterSoundCloud’s Discord app, and shows the track once Discord is ready', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })

    expect(mocks.connections).toHaveLength(1)
    expect(latest().options.clientId).toBe('1054636117284106270')
    expect(sent()).toEqual([])

    latest().options.onReady()
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toMatchObject({ details: 'Birahe', state: 'Ali Sorena' })
  })

  it('ignores the clock ticking, and spaces real changes at least 4s apart', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })
    latest().options.onReady()

    // A second of ordinary playback: nothing to tell Discord.
    vi.advanceTimersByTime(1_000)
    setNowPlaying({ ...TRACK, elapsed: 81 })
    expect(sent()).toHaveLength(1)

    // A seek, then a skip, inside the same 4s: one update, carrying the skip.
    vi.advanceTimersByTime(1_000)
    setNowPlaying({ ...TRACK, elapsed: 150 })
    setNowPlaying({ ...TRACK, title: 'Next one', elapsed: 0 })
    vi.advanceTimersByTime(1_999)
    expect(sent()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sent()).toHaveLength(2)
    expect(sent()[1]).toMatchObject({ details: 'Next one' })

    // After a quiet spell the next change goes out at once.
    vi.advanceTimersByTime(10_000)
    setNowPlaying({ ...TRACK, title: 'Third', elapsed: 0 })
    expect(sent()).toHaveLength(3)
  })

  it('clears the card on pause, unless asked to keep it', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })
    latest().options.onReady()

    vi.advanceTimersByTime(5_000)
    setNowPlaying({ ...TRACK, playing: false })
    expect(sent().at(-1)).toBeNull()

    vi.advanceTimersByTime(5_000)
    setPresenceOptions({ enabled: true, showWhenPaused: true })
    expect(sent().at(-1)).toMatchObject({ state: 'Ali Sorena · Paused' })
  })

  it('clears the card when nothing is loaded any more', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })
    latest().options.onReady()
    vi.advanceTimersByTime(5_000)
    setNowPlaying(null)
    expect(sent().at(-1)).toBeNull()
  })

  it('turned off, clears the card, lets go of Discord, and stops trying', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })
    latest().options.onReady()

    setPresenceOptions({ enabled: false, showWhenPaused: false })
    expect(sent().at(-1)).toBeNull()
    expect(latest().close).toHaveBeenCalledOnce()

    // Its own close arriving late must not bring it back.
    latest().options.onClose('closed')
    vi.advanceTimersByTime(600_000)
    expect(mocks.connections).toHaveLength(1)
  })

  it('keeps trying while Discord is not running, backing off to once a minute', async () => {
    const { setPresenceOptions } = await load()
    setPresenceOptions({ enabled: true, showWhenPaused: false })

    for (const delay of [5_000, 15_000, 30_000, 60_000, 60_000]) {
      const before = mocks.connections.length
      latest().options.onClose('Discord is not running')
      vi.advanceTimersByTime(delay - 1)
      expect(mocks.connections).toHaveLength(before)
      vi.advanceTimersByTime(1)
      expect(mocks.connections).toHaveLength(before + 1)
    }

    // Once it gets through, the next outage starts from the short wait again.
    latest().options.onReady()
    latest().options.onClose('Discord closed the connection')
    vi.advanceTimersByTime(5_000)
    expect(mocks.connections).toHaveLength(7)
  })

  it('ignores a connection it has already replaced', async () => {
    const { setPresenceOptions, setNowPlaying } = await load()
    setNowPlaying(TRACK)
    setPresenceOptions({ enabled: true, showWhenPaused: false })
    const first = latest()
    setPresenceOptions({ enabled: false, showWhenPaused: false })
    setPresenceOptions({ enabled: true, showWhenPaused: false })

    // The old pipe finally answering must not make the new one think it is ready.
    first.options.onReady()
    expect(latest().setActivity).not.toHaveBeenCalled()
  })
})
