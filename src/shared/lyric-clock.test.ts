import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lyricClock } from './lyric-clock'
import type { LyricLine } from './lyrics'

const LINES: LyricLine[] = [
  { time: 4.2, text: 'one' },
  { time: 9.8, text: 'two' },
  { time: 15.1, text: '' },
  { time: 20.6, text: 'three' }
]

describe('lyricClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A clock on fake time, and every line it lit, in order. */
  function follow(): { clock: ReturnType<typeof lyricClock>; seen: number[] } {
    const seen: number[] = []
    const clock = lyricClock(
      (index) => seen.push(index),
      () => Date.now()
    )
    return { clock, seen }
  }

  it('lights each line as it starts, between whole-second readings', () => {
    const { clock, seen } = follow()
    clock.setLines(LINES, 0)
    clock.setReading({ elapsed: 9, playing: true })
    expect(seen).toEqual([0])
    // "two" starts at 9.8: 0.8s after the reading, before SoundCloud's next tick.
    vi.advanceTimersByTime(790)
    expect(seen).toEqual([0])
    vi.advanceTimersByTime(20)
    expect(seen).toEqual([0, 1])
  })

  it('waits for the next reading rather than running on past it', () => {
    const { clock, seen } = follow()
    clock.setLines(LINES, 0)
    clock.setReading({ elapsed: 13, playing: true })
    // The clock stalls (buffering): no reading for five seconds. The 15.1 line must not light
    // until SoundCloud says it got there.
    vi.advanceTimersByTime(5000)
    expect(seen).toEqual([1])
    clock.setReading({ elapsed: 15, playing: true })
    vi.advanceTimersByTime(120)
    expect(seen).toEqual([1, 2])
  })

  it('holds while paused, and follows a seek straight away', () => {
    const { clock, seen } = follow()
    clock.setLines(LINES, 0)
    clock.setReading({ elapsed: 9, playing: false })
    vi.advanceTimersByTime(10_000)
    expect(seen).toEqual([0])
    clock.setReading({ elapsed: 21, playing: true })
    expect(seen).toEqual([0, 3])
    clock.setReading({ elapsed: 2, playing: true })
    expect(seen).toEqual([0, 3, -1])
  })

  it('moves every line by the track’s offset', () => {
    const { clock, seen } = follow()
    clock.setLines(LINES, 0)
    clock.setReading({ elapsed: 9, playing: false })
    // Nudged a second later: at 9s, "two" (9.8) has not started even by the old reading.
    clock.setLines(LINES, 1)
    expect(seen).toEqual([0])
    // Nudged a second earlier: at 9s, "two" (now 8.8) already has.
    clock.setLines(LINES, -1)
    expect(seen).toEqual([0, 1])
  })

  it('says -1 when there are no lines, and stops for good', () => {
    const { clock, seen } = follow()
    clock.setLines(LINES, 0)
    clock.setReading({ elapsed: 5, playing: true })
    clock.setLines(null, 0)
    expect(seen).toEqual([0, -1])
    clock.setLines(LINES, 0)
    clock.stop()
    vi.advanceTimersByTime(60_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
