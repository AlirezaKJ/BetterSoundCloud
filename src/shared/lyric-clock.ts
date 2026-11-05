import { currentLineIndex, playbackPosition } from './lyrics'
import type { ClockAnchor, LyricLine } from './lyrics'

/*
 * Which lyric line is being sung, kept without polling. Used by both views that show timed
 * lyrics: the pane and the full-screen showcase.
 *
 * SoundCloud's clock only says whole seconds, about once a second, so between its readings the
 * position runs on (`playbackPosition`). The clock knows when the next line starts, so it sets
 * one timer for that moment, and plans again whenever a reading, new lines or a nudge arrive —
 * exact to the millisecond, and idle between lines.
 */

export type LyricClock = {
  /** The timed lines to follow and the track's offset in seconds, or null for none. */
  setLines(lines: readonly LyricLine[] | null, offset: number): void
  /** A now-playing reading, or null when nothing is loaded. */
  setReading(reading: { readonly elapsed: number; readonly playing: boolean } | null): void
  /** Stop the timer for good. */
  stop(): void
}

/**
 * `onLine` hears the index of the line being sung whenever it changes: -1 before the first
 * line, or when there are no lines. `now` is milliseconds on any steady clock; tests pass a
 * fake one.
 */
export function lyricClock(
  onLine: (index: number) => void,
  now: () => number = () => performance.now()
): LyricClock {
  let lines: readonly LyricLine[] | null = null
  let offset = 0
  let anchor: ClockAnchor = { elapsed: 0, at: 0, playing: false }
  let current = -1
  let timer: ReturnType<typeof setTimeout> | null = null

  function show(index: number): void {
    if (index === current) return
    current = index
    onLine(index)
  }

  /**
   * Light the line being sung now, and set the timer for when the next one starts. While the
   * clock runs past the last reading, `playbackPosition` caps it, so a timer that lands early
   * finds the same line and plans again; the next reading replans in any case.
   */
  function plan(): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (!lines) {
      show(-1)
      return
    }
    const position = playbackPosition(anchor, now()) - offset
    const index = currentLineIndex(lines, position)
    show(index)
    const upcoming = lines[index + 1]
    if (!anchor.playing || !upcoming) return
    timer = setTimeout(plan, Math.max(0, (upcoming.time - position) * 1000) + 5)
  }

  return {
    setLines(next, nextOffset) {
      lines = next && next.length > 0 ? next : null
      offset = nextOffset
      plan()
    },
    setReading(reading) {
      const elapsed = reading?.elapsed ?? 0
      const playing = reading?.playing ?? false
      // The same second again (a like, say) keeps the anchor, or the clock would jump back.
      if (elapsed !== anchor.elapsed || playing !== anchor.playing) {
        anchor = { elapsed, at: now(), playing }
        plan()
      }
    },
    stop() {
      if (timer) clearTimeout(timer)
      timer = null
      lines = null
    }
  }
}
