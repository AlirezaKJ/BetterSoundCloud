/**
 * "Hide the top bar until you point at it" (`appearance.autoHideHeader`): when the hidden header
 * comes back and when it goes again. Pure, so it is tested without a window; main/window.ts feeds
 * it the pointer and acts on the answer (`watchAutoHideHeader`).
 */

/** How close to the window's top edge, in window pixels, the pointer has to come to reveal it. */
export const REVEAL_EDGE = 4
/** How far below the header the pointer may wander before the header goes again. */
export const HIDE_MARGIN = 24
/** How long the pointer must stay away before the header goes, so a quick dip does not flicker. */
export const HIDE_DELAY_MS = 500

export interface RevealInput {
  /** The pointer relative to the window's content area, in window pixels. */
  readonly x: number
  readonly y: number
  /** The content area's width, and the header's height in window pixels (46 CSS px × zoom). */
  readonly width: number
  readonly headerHeight: number
  /** Only a focused window reveals: another app in front must not wake our header. */
  readonly focused: boolean
  /** Now, in milliseconds. */
  readonly now: number
}

export interface RevealState {
  readonly revealed: boolean
  /** When the pointer last left the header's neighbourhood while it was showing; 0 if it has not. */
  readonly awaySince: number
}

export const HIDDEN: RevealState = { revealed: false, awaySince: 0 }

export function nextReveal(state: RevealState, input: RevealInput): RevealState {
  const across = input.x >= 0 && input.x <= input.width
  // A couple of pixels above the content area still counts: the window's top edge is a thin line.
  if (input.focused && across && input.y >= -2 && input.y <= REVEAL_EDGE) {
    return { revealed: true, awaySince: 0 }
  }
  if (!state.revealed) return state
  const near =
    input.focused && across && input.y >= -2 && input.y <= input.headerHeight + HIDE_MARGIN
  if (near) return { revealed: true, awaySince: 0 }
  const awaySince = state.awaySince || input.now
  return input.now - awaySince >= HIDE_DELAY_MS ? HIDDEN : { revealed: true, awaySince }
}
