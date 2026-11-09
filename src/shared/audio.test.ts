import { describe, it, expect } from 'vitest'
import {
  AUDIO_LIMITS,
  NOT_STARVED,
  chainResponseDb,
  describeAudioStop,
  filterResponseDb,
  headroomDb,
  isFlat,
  isStarved,
  noteCaptureClock,
  noteCaptureSilence,
  readAudioFilters,
  readAudioReport
} from './audio'
import type { AudioFilter, Starvation } from './audio'

const peak = (frequency: number, gain: number, q = 1): AudioFilter => ({
  type: 'peaking',
  frequency,
  gain,
  q
})

describe('filter responses, as Web Audio computes them', () => {
  it('peaks by exactly its gain at its own frequency, and leaves far frequencies alone', () => {
    expect(filterResponseDb(peak(1000, 6), 1000)).toBeCloseTo(6, 5)
    expect(filterResponseDb(peak(1000, -9), 1000)).toBeCloseTo(-9, 5)
    expect(Math.abs(filterResponseDb(peak(1000, 6), 30))).toBeLessThan(0.1)
  })

  it('shelves: the full gain beyond the corner, half of it at the corner, none on the far side', () => {
    const low: AudioFilter = { type: 'lowshelf', frequency: 200, gain: 8, q: 1 }
    expect(filterResponseDb(low, 20)).toBeCloseTo(8, 0)
    expect(filterResponseDb(low, 200)).toBeCloseTo(4, 5)
    expect(Math.abs(filterResponseDb(low, 15000))).toBeLessThan(0.05)
    const high: AudioFilter = { type: 'highshelf', frequency: 5000, gain: -6, q: 1 }
    expect(filterResponseDb(high, 5000)).toBeCloseTo(-3, 5)
    expect(filterResponseDb(high, 20000)).toBeCloseTo(-6, 0)
    expect(Math.abs(filterResponseDb(high, 50))).toBeLessThan(0.05)
  })

  it('adds a chain up', () => {
    const chain = [peak(100, 3), peak(100, 2)]
    expect(chainResponseDb(chain, 100)).toBeCloseTo(5, 5)
  })
})

describe('headroomDb', () => {
  it('turns down by the largest boost, and not at all for cuts or nothing', () => {
    expect(headroomDb([])).toBe(0)
    expect(headroomDb([peak(1000, -8)])).toBe(0)
    expect(headroomDb([peak(1000, 6)])).toBeCloseTo(6, 1)
    expect(headroomDb([peak(1000, 6), peak(1000, 3)])).toBeCloseTo(9, 1)
  })
})

describe('readAudioFilters', () => {
  it('takes known filter types and clamps every number to the limits', () => {
    expect(
      readAudioFilters([
        { type: 'lowshelf', frequency: 5, gain: 40 },
        { type: 'peaking', frequency: 1000, gain: -3, q: 0.001 },
        { type: 'highshelf', frequency: 99_999, gain: -60, q: 2 }
      ])
    ).toEqual([
      { type: 'lowshelf', frequency: 20, gain: 24, q: 1 },
      { type: 'peaking', frequency: 1000, gain: -3, q: AUDIO_LIMITS.minQ },
      { type: 'highshelf', frequency: 20_000, gain: -24, q: 2 }
    ])
  })

  it('refuses the whole call when anything is wrong, rather than half applying it', () => {
    expect(readAudioFilters('peaking')).toBeNull()
    expect(readAudioFilters([{ type: 'notch', frequency: 1000, gain: 1 }])).toBeNull()
    expect(readAudioFilters([{ type: 'peaking', frequency: Number.NaN, gain: 1 }])).toBeNull()
    expect(readAudioFilters([{ type: 'peaking', frequency: 100, gain: '6' }])).toBeNull()
    expect(readAudioFilters([null])).toBeNull()
    expect(readAudioFilters(Array.from({ length: 17 }, () => peak(1000, 1)))).toBeNull()
  })

  it('says a list of nothing-changing filters is flat', () => {
    expect(isFlat([])).toBe(true)
    expect(isFlat([peak(100, 0), peak(1000, 0.01)])).toBe(true)
    expect(isFlat([peak(100, 0), peak(1000, 0.5)])).toBe(false)
  })
})

describe('readAudioReport', () => {
  it('shapes what the audio view says, and refuses anything else', () => {
    expect(readAudioReport({ kind: 'running' })).toEqual({ kind: 'running' })
    expect(readAudioReport({ kind: 'ended' })).toEqual({ kind: 'ended' })
    expect(readAudioReport({ kind: 'silence', silent: true })).toEqual({
      kind: 'silence',
      silent: true
    })
    expect(readAudioReport({ kind: 'failed', message: '  NotAllowedError  ' })).toEqual({
      kind: 'failed',
      message: 'NotAllowedError'
    })
    expect(readAudioReport({ kind: 'failed' })).toEqual({
      kind: 'failed',
      message: 'unknown error'
    })
    expect(readAudioReport({ kind: 'silence', silent: 'yes' })).toBeNull()
    expect(readAudioReport({ kind: 'explode' })).toBeNull()
    expect(readAudioReport(null)).toBeNull()
  })
})

describe('describeAudioStop', () => {
  it('always says SoundCloud is unaffected, and what to do when there is something', () => {
    for (const reason of ['safe-mode', 'capture-failed', 'no-sound', 'crashed'] as const) {
      expect(describeAudioStop(reason)).toContain('SoundCloud plays as normal')
    }
    expect(describeAudioStop('capture-failed', 'NotAllowedError')).toContain(
      '(NotAllowedError)'
    )
    expect(describeAudioStop('no-sound')).toContain('Turn this plugin off and on')
  })
})

describe('the no-sound safety check', () => {
  /** A track playing from `from`, a second at a time, with the capture silent throughout. */
  function silentPlay(start: Starvation, track: string, from: number, seconds: number) {
    let state = noteCaptureSilence(start, true)
    for (let t = from; t <= from + seconds; t++) {
      state = noteCaptureClock(state, { track, elapsed: t, playing: true })
    }
    return state
  }

  it('steps aside after six seconds of SoundCloud playing into silence', () => {
    let state = noteCaptureClock(NOT_STARVED, { track: 'a', elapsed: 10, playing: true })
    state = silentPlay(state, 'a', 11, 4)
    expect(isStarved(state)).toBe(false)
    state = silentPlay(state, 'a', 16, 2)
    expect(isStarved(state)).toBe(true)
  })

  it('never counts a pause, a seek forward, or a new track', () => {
    let state = noteCaptureSilence(NOT_STARVED, true)
    state = noteCaptureClock(state, { track: 'a', elapsed: 10, playing: true })
    // Paused: the clock does not move, and nothing counts.
    for (let i = 0; i < 20; i++) {
      state = noteCaptureClock(state, { track: 'a', elapsed: 10, playing: false })
    }
    // A seek forward jumps a minute; it is not a minute of listening.
    state = noteCaptureClock(state, { track: 'a', elapsed: 70, playing: true })
    expect(state.seconds).toBe(0)
    state = silentPlay(state, 'a', 71, 3)
    // A new track starts the count again.
    state = noteCaptureClock(state, { track: 'b', elapsed: 0, playing: true })
    expect(state.seconds).toBe(0)
  })

  it('forgets the count the moment sound arrives', () => {
    let state = noteCaptureClock(NOT_STARVED, { track: 'a', elapsed: 0, playing: true })
    state = silentPlay(state, 'a', 1, 5)
    state = noteCaptureSilence(state, false)
    expect(state.seconds).toBe(0)
    state = noteCaptureClock(state, { track: 'a', elapsed: 9, playing: true })
    expect(isStarved(state)).toBe(false)
  })
})
