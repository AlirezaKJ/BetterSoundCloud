import { join } from 'node:path'
import { app } from 'electron'
import type { WebContents } from 'electron'
import { readRecord, writeJson } from './json-file'
import { pageToRemember, startPageUrl } from '@shared/start-page'
import type { StartPage } from '@shared/start-page'

/*
 * The page SoundCloud opens on (the "On startup, open" setting), and the last page the user had
 * open, which its "Where you left off" choice reopens. Which pages count is decided in
 * src/shared/start-page.ts.
 *
 * The last page is kept whatever the setting says, so switching to "Where you left off" reopens
 * the page you were just on rather than one from whenever the setting was last chosen. It is one
 * URL in the profile, next to Chromium's own history of every page.
 */

/** A navigation often comes in a burst (a redirect, then the page), so save once it settles. */
const SAVE_AFTER_MS = 1_000

function lastPageFile(): string {
  return join(app.getPath('userData'), 'last-page.json')
}

/** The URL to load SoundCloud on, for the user's choice. */
export function startUrl(choice: StartPage): string {
  const lastPage = choice === 'lastVisited' ? readRecord(lastPageFile())['url'] : null
  return startPageUrl(choice, lastPage)
}

/** Remember each page SoundCloud's view moves to, for the next launch. */
export function rememberLastPage(webContents: WebContents): void {
  let unsaved: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const save = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!unsaved) return
    try {
      writeJson(lastPageFile(), { url: unsaved })
    } catch (error) {
      // Not worth bothering the user over: the next launch opens Home instead.
      console.error('[start-page] could not save the last page:', error)
    }
    unsaved = null
  }

  const notice = (url: string): void => {
    const page = pageToRemember(url)
    if (!page) return
    unsaved = page
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_AFTER_MS)
  }

  // SoundCloud is a single-page app: moving between its pages is an in-page navigation. A full
  // load happens only at startup, on Reload, and on Back to another document.
  webContents.on('did-navigate', (_event, url) => notice(url))
  webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) notice(url)
  })
  // Closing the window right after moving to a page must not lose it to the timer.
  webContents.once('destroyed', save)
}
