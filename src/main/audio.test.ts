import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AudioFilter } from '@shared/audio'
import { headroomDb } from '@shared/audio'

/*
 * The audio engine's rules — the ones that keep SoundCloud safe: it runs only while asked, never
 * in safe mode, and steps aside rather than retrying what keeps failing. Electron's view is a fake
 * here; the capture itself was measured in the real app (CLAUDE.md §21).
 */

class FakeContents extends EventEmitter {
  session = {}
  destroyed = false
  loadURL = vi.fn(() => Promise.resolve())
  send = vi.fn()
  close = vi.fn(() => {
    this.destroyed = true
  })
  isDestroyed = () => this.destroyed
}

const mocks = vi.hoisted(() => ({
  views: [] as { webPreferences: Record<string, unknown>; webContents: FakeContents }[],
  expectTabAudioCapture: vi.fn(),
  nowPlaying: null as ((np: unknown) => void) | null
}))

vi.mock('electron', () => ({
  WebContentsView: class {
    webContents = new FakeContents()
    constructor(options: { webPreferences: Record<string, unknown> }) {
      mocks.views.push({
        webPreferences: options.webPreferences,
        webContents: this.webContents
      })
    }
  }
}))
vi.mock('./session', () => ({
  hardenSession: vi.fn(),
  routeNewWindowsToBrowser: vi.fn(),
  expectTabAudioCapture: mocks.expectTabAudioCapture
}))
vi.mock('./now-playing', () => ({
  onNowPlayingChange: (listener: (np: unknown) => void) => {
    mocks.nowPlaying = listener
    return () => undefined
  }
}))
vi.mock('./env', () => ({ isDev: false }))

const BOOST: AudioFilter[] = [{ type: 'peaking', frequency: 1000, gain: 6, q: 1 }]
const CUT: AudioFilter[] = [{ type: 'lowshelf', frequency: 100, gain: -4, q: 1 }]
const FLAT: AudioFilter[] = [{ type: 'peaking', frequency: 1000, gain: 0, q: 1 }]

const content = {
  getMediaSourceId: vi.fn(() => 'source-1'),
  isDestroyed: () => false
}

async function load(options = { safeMode: false, window: true }) {
  vi.resetModules()
  const audio = await import('./audio')
  const statuses: { state: string; message: string }[] = []
  audio.onAudioStatusChange((status) => statuses.push(status))
  audio.startAudioEngine({ safeMode: options.safeMode })
  if (options.window) {
    audio.attachAudioEngine({
      content: content as unknown as Electron.WebContents,
      identity: {} as never,
      url: 'file:///renderer/audio/index.html'
    })
  }
  return { ...audio, statuses, last: () => statuses.at(-1) }
}

/** The latest audio view, after it finished loading. */
function loaded() {
  const view = mocks.views.at(-1)!
  view.webContents.emit('did-finish-load')
  return view
}

beforeEach(() => {
  mocks.views.length = 0
  mocks.expectTabAudioCapture.mockClear()
  content.getMediaSourceId.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the audio engine', () => {
  it('does nothing at all while nobody asks for a change, or every change is flat', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', FLAT)
    engine.setAudioFilters('other', [])
    expect(mocks.views).toHaveLength(0)
    expect(engine.getAudioStatus()).toEqual({ state: 'off', message: '' })
  })

  it('captures SoundCloud from a view of its own, and lets go when nothing is asked', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    expect(mocks.views).toHaveLength(1)
    expect(engine.last()?.state).toBe('starting')
    const view = loaded()
    // The session is told to expect exactly this capture of SoundCloud's view, just before it.
    expect(mocks.expectTabAudioCapture).toHaveBeenCalledWith(content)
    expect(mocks.expectTabAudioCapture.mock.invocationCallOrder[0]).toBeLessThan(
      content.getMediaSourceId.mock.invocationCallOrder[0] ?? 0
    )
    // Never throttled, never waiting for a gesture.
    expect(view.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    })
    expect(content.getMediaSourceId).toHaveBeenCalledWith(view.webContents)
    expect(view.webContents.send).toHaveBeenLastCalledWith('audio:configure', {
      sourceId: 'source-1',
      pitch: 0,
      filters: BOOST,
      preampDb: -headroomDb(BOOST)
    })
    engine.handleAudioReport({ kind: 'running' })
    expect(engine.last()?.state).toBe('running')
    expect(engine.isAudioView(view.webContents as unknown as Electron.WebContents)).toBe(true)

    // A new curve goes to the same view; asking for nothing closes it, which ends the capture.
    engine.setAudioFilters('equaliser', CUT)
    expect(mocks.views).toHaveLength(1)
    expect(view.webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ filters: CUT, preampDb: -0 })
    )
    engine.clearAudio('equaliser')
    expect(view.webContents.close).toHaveBeenCalled()
    expect(engine.last()?.state).toBe('off')
  })

  it('applies every plugin’s filters in plugin order, whoever asked first', async () => {
    const engine = await load()
    engine.setAudioFilters('zz-second', CUT)
    engine.setAudioFilters('aa-first', BOOST)
    const view = loaded()
    expect(view.webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ filters: [...BOOST, ...CUT] })
    )
  })

  it('never runs in safe mode, and says so', async () => {
    const engine = await load({ safeMode: true, window: true })
    engine.setAudioFilters('equaliser', BOOST)
    expect(mocks.views).toHaveLength(0)
    expect(engine.last()).toEqual({
      state: 'stopped',
      message: expect.stringContaining('safe mode')
    })
  })

  it('waits for a window, and lets go of the view when the window closes', async () => {
    const engine = await load({ safeMode: false, window: false })
    engine.setAudioFilters('equaliser', BOOST)
    expect(mocks.views).toHaveLength(0)
    expect(engine.last()?.state).toBe('starting')
    engine.attachAudioEngine({
      content: content as unknown as Electron.WebContents,
      identity: {} as never,
      url: 'file:///audio'
    })
    const view = loaded()
    engine.detachAudioEngine()
    expect(view.webContents.close).toHaveBeenCalled()
  })

  it('steps aside when the capture is refused, and tries again only once nothing is asked', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    const view = loaded()
    engine.handleAudioReport({ kind: 'failed', message: 'NotAllowedError' })
    expect(view.webContents.close).toHaveBeenCalled()
    expect(engine.last()?.state).toBe('stopped')
    expect(engine.last()?.message).toContain('NotAllowedError')

    // Moving a band does not retry over and over…
    engine.setAudioFilters('equaliser', CUT)
    expect(mocks.views).toHaveLength(1)
    // …turning the plugin off and on does.
    engine.clearAudio('equaliser')
    engine.setAudioFilters('equaliser', BOOST)
    expect(mocks.views).toHaveLength(2)
  })

  it('makes a crashed view again once, then steps aside', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    loaded().webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(mocks.views).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    expect(mocks.views).toHaveLength(2)
    loaded().webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    vi.advanceTimersByTime(5_000)
    expect(mocks.views).toHaveLength(2)
    expect(engine.last()?.message).toContain('stopped unexpectedly twice')
  })

  it('steps aside when SoundCloud plays on and the capture hears nothing', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    const view = loaded()
    engine.handleAudioReport({ kind: 'running' })
    engine.handleAudioReport({ kind: 'silence', silent: true })
    for (let elapsed = 10; elapsed <= 17; elapsed++) {
      mocks.nowPlaying?.({ url: 'u', title: 't', artist: 'a', elapsed, playing: true })
    }
    expect(view.webContents.close).toHaveBeenCalled()
    expect(engine.last()?.message).toContain('No sound reached it')
  })

  it('runs for a key shift alone, and lets go when the shift is back to 0', async () => {
    const engine = await load()
    engine.setAudioPitch('pitch', 0)
    expect(mocks.views).toHaveLength(0)
    engine.setAudioPitch('pitch', 3)
    const view = loaded()
    expect(view.webContents.send).toHaveBeenLastCalledWith('audio:configure', {
      sourceId: 'source-1',
      pitch: 3,
      filters: [],
      preampDb: -0
    })
    engine.setAudioPitch('pitch', 0)
    expect(view.webContents.close).toHaveBeenCalled()
    expect(engine.last()?.state).toBe('off')
  })

  it('shifts and equalises in one capture, each plugin’s part going when it stops', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    engine.setAudioPitch('pitch', -2)
    const view = loaded()
    expect(view.webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ pitch: -2, filters: BOOST })
    )
    engine.clearAudio('pitch')
    expect(mocks.views).toHaveLength(1)
    expect(view.webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ pitch: 0, filters: BOOST })
    )
    engine.clearAudio('equaliser')
    expect(view.webContents.close).toHaveBeenCalled()
  })

  it('adds every plugin’s shift, within an octave', async () => {
    const engine = await load()
    engine.setAudioPitch('a', 8)
    engine.setAudioPitch('b', 7)
    const view = loaded()
    expect(view.webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ pitch: 12 })
    )
  })

  it('steps aside when the shifter fails, until nothing asks for a shift', async () => {
    const engine = await load()
    engine.setAudioFilters('equaliser', BOOST)
    engine.setAudioPitch('pitch', 5)
    const view = loaded()
    engine.handleAudioReport({ kind: 'pitch-failed', message: 'CompileError' })
    expect(view.webContents.close).toHaveBeenCalled()
    expect(engine.last()).toEqual({
      state: 'stopped',
      message: expect.stringContaining('pitch shifter couldn’t start (CompileError)')
    })
    // Moving the key does not retry…
    engine.setAudioPitch('pitch', 4)
    expect(mocks.views).toHaveLength(1)
    // …but turning Pitch off lets the Equaliser work again, with no shift.
    engine.clearAudio('pitch')
    expect(mocks.views).toHaveLength(2)
    expect(loaded().webContents.send).toHaveBeenLastCalledWith(
      'audio:configure',
      expect.objectContaining({ pitch: 0, filters: BOOST })
    )
  })
})
