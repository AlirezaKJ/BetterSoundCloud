/*
 * F6 and Shift+F6: moving keyboard focus between the parts of the window.
 *
 * Each part is its own WebContentsView, and Electron does not move focus between views, so Tab
 * never leaves the one it is in. From SoundCloud's page, no key reached Back, Settings or the
 * window buttons. F6 is the browser's own key for this (Chrome moves between its toolbar, the page
 * and its panes with it). This file is the order, pure so it is tested; main/focus-cycle.ts moves
 * the focus.
 */

/** A part of the window that keyboard focus can be in. */
export type FocusArea = 'bar' | 'page' | 'lyrics' | 'player' | 'settings'

/** Which of the parts that come and go can take focus right now. */
export type OpenAreas = { settings: boolean; lyrics: boolean; player: boolean }

/**
 * The order F6 moves through, as the eye reads the window: our bar (or the window buttons over
 * SoundCloud's header while the bar is hidden), SoundCloud's page (or what stands in for it), the
 * lyrics pane at its side, the buttons in the player bar below. Settings is a dialog: while it is
 * open, focus moves only between it and the bar above it.
 */
export function focusCycle(open: OpenAreas): FocusArea[] {
  if (open.settings) return ['bar', 'settings']
  const cycle: FocusArea[] = ['bar', 'page']
  if (open.lyrics) cycle.push('lyrics')
  if (open.player) cycle.push('player')
  return cycle
}

/**
 * Where F6 goes from `from`, or Shift+F6 with `backwards`, wrapping at either end. From a part that
 * is not in the cycle, F6 starts at the first and Shift+F6 at the last.
 */
export function nextFocusArea(
  cycle: FocusArea[],
  from: FocusArea | null,
  backwards: boolean
): FocusArea {
  const at = from === null ? -1 : cycle.indexOf(from)
  if (at === -1) return (backwards ? cycle.at(-1) : cycle[0]) ?? 'bar'
  const next = (at + (backwards ? -1 : 1) + cycle.length) % cycle.length
  return cycle[next] ?? 'bar'
}
