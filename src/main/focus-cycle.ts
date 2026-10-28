import { app } from 'electron'
import type { WebContents, WebContentsView } from 'electron'
import { CH } from '@shared/ipc'
import { hidesPage } from '@shared/page-status'
import { focusCycle, nextFocusArea } from '@shared/focus-cycle'
import type { FocusArea } from '@shared/focus-cycle'
import type { Shell } from './window'

/*
 * F6 and Shift+F6, in every view of the window: keyboard focus moves to the next part of it, in
 * the order src/shared/focus-cycle.ts gives.
 *
 * The key is read here, in `before-input-event`, before any page sees it — SoundCloud's included,
 * which it never reaches. Nothing is written to that page and no input is made up for it: focusing
 * a view is the window's business, like clicking into it.
 *
 * One listener per view, attached as each view is made (`web-contents-created`), so a view added
 * later takes part without anyone remembering to wire it.
 */

/** The view standing for each part of the window right now, or null while it is not there. */
function viewFor(shell: Shell, area: FocusArea): WebContentsView | null {
  // A status that hides SoundCloud's page hides the lyrics pane and the player buttons with it.
  const pageHidden = shell.pageStatus !== null && hidesPage(shell.pageStatus)
  switch (area) {
    case 'bar':
      return shell.embeddedShowing ? shell.embedded : shell.header
    case 'page':
      // The status view stands in for the page, or asks over it when the page hangs.
      return shell.status ?? shell.content
    case 'lyrics':
      return pageHidden ? null : shell.lyrics
    case 'player':
      return pageHidden ? null : shell.player
    case 'settings':
      return shell.settings
  }
}

/**
 * Which part a view is. Null for the showcase and the right-click menu, which keep F6 to
 * themselves (it does nothing there), and for anything that is not ours, such as DevTools.
 */
function areaOf(shell: Shell, contents: WebContents): FocusArea | null {
  const is = (view: WebContentsView | null): boolean => view?.webContents === contents
  if (is(shell.header) || is(shell.embedded)) return 'bar'
  if (is(shell.content) || is(shell.status)) return 'page'
  if (is(shell.lyrics)) return 'lyrics'
  if (is(shell.player)) return 'player'
  if (is(shell.settings)) return 'settings'
  return null
}

/** Move keyboard focus from the view that saw F6 to the next part of the window. */
export function moveFocus(shell: Shell, from: FocusArea, backwards: boolean): void {
  const cycle = focusCycle({
    settings: shell.settings !== null,
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

/** Listen for F6 in every view from now on. `currentShell` is the window there is, if any. */
export function watchFocusKeys(currentShell: () => Shell | null): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'F6') return
      if (input.control || input.alt || input.meta) return
      const shell = currentShell()
      const from = shell ? areaOf(shell, contents) : null
      if (!shell || !from) return
      event.preventDefault()
      moveFocus(shell, from, input.shift)
    })
  })
}
