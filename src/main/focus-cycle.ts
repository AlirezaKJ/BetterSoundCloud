import type { WebContents, WebContentsView } from 'electron'
import { CH } from '@shared/ipc'
import { hidesPage } from '@shared/page-status'
import { focusCycle, nextFocusArea } from '@shared/focus-cycle'
import type { FocusArea } from '@shared/focus-cycle'
import type { Shell } from './window'

/*
 * F6 and Shift+F6 (or whatever keys Settings → Shortcuts gives them), in every view of the window:
 * keyboard focus moves to the next part of it, in the order src/shared/focus-cycle.ts gives.
 *
 * The keys are heard by main/shortcuts.ts, in `before-input-event`, before any page sees them —
 * SoundCloud's included, which they never reach. Nothing is written to that page and no input is
 * made up for it: focusing a view is the window's business, like clicking into it.
 */

/** The view standing for each part of the window right now, or null while it is not there. */
function viewFor(shell: Shell, area: FocusArea): WebContentsView | null {
  // A status that hides SoundCloud's page hides the lyrics pane and the player buttons with it.
  const pageHidden = shell.pageStatus !== null && hidesPage(shell.pageStatus)
  switch (area) {
    case 'bar':
      // Our own bar is back while Settings or the welcome is open, over the window buttons on
      // SoundCloud's header.
      return shell.embeddedShowing && !shell.settings && !shell.onboarding
        ? shell.embedded
        : shell.header
    case 'page':
      // The status view stands in for the page, or asks over it when the page hangs; the
      // Visualizer's view of its own covers the page while it is open.
      return shell.status ?? (pageHidden ? null : shell.visualView) ?? shell.content
    case 'lyrics':
      return pageHidden ? null : shell.lyrics
    case 'player':
      return pageHidden ? null : shell.player
    case 'settings':
      // The first-run welcome is a page of ours like Settings, and takes its place in the cycle
      // (Settings opens above it, and wins while open).
      return shell.settings ?? shell.onboarding
  }
}

/**
 * Which part a view is. Null for the showcase and the right-click menu, which keep F6 to
 * themselves (it does nothing there), and for anything that is not ours, such as DevTools.
 */
function areaOf(shell: Shell, contents: WebContents): FocusArea | null {
  const is = (view: WebContentsView | null): boolean => view?.webContents === contents
  if (is(shell.header) || is(shell.embedded)) return 'bar'
  if (is(shell.content) || is(shell.status) || is(shell.visualView)) return 'page'
  if (is(shell.lyrics)) return 'lyrics'
  if (is(shell.player)) return 'player'
  if (is(shell.settings) || is(shell.onboarding)) return 'settings'
  return null
}

/** Move keyboard focus from the view that saw F6 to the next part of the window. */
export function moveFocus(shell: Shell, from: FocusArea, backwards: boolean): void {
  const cycle = focusCycle({
    settings: shell.settings !== null || shell.onboarding !== null,
    lyrics: viewFor(shell, 'lyrics') !== null,
    player: viewFor(shell, 'player') !== null
  })
  const view = viewFor(shell, nextFocusArea(cycle, from, backwards))
  if (!view || view.webContents.isDestroyed()) return

  view.webContents.focus()
  // Our own views put focus on a control and draw its ring, so the user sees where it went (the
  // preload does it: src/preload/chrome.ts). SoundCloud's page is only focused; what happens
  // inside it is the page's own.
  if (view !== shell.content) view.webContents.send(CH.focusArrived)
}

/**
 * Move focus from the view a key was pressed in to the next part of the window, or the one before.
 * Answers whether it moved: the showcase and the right-click menu keep the key to themselves.
 */
export function moveFocusFrom(
  shell: Shell,
  contents: WebContents,
  backwards: boolean
): boolean {
  const from = areaOf(shell, contents)
  if (!from) return false
  moveFocus(shell, from, backwards)
  return true
}
