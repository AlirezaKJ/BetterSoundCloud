import type { WebContents } from 'electron'
import { SIGN_IN_COOKIES } from '@shared/sign-in-cookies'
import { isLogoutUrl, noteLogout } from '@shared/sign-out-loop'

/**
 * Break SoundCloud's sign-out loop (shared/sign-out-loop.ts): when the page keeps going to /logout
 * on a sign-in it cannot clear, clear it ourselves — the same three cookies "Import browser sign-in"
 * replaces — and open `startUrl`. The user lands signed out, able to sign in again, instead of
 * watching the page reload forever.
 *
 * Event-driven (`did-navigate`), never a timer on SoundCloud's origin (§14). One /logout, the right-
 * click menu's Sign out included, is left alone: only a run of them is a loop.
 */
export function watchSignOutLoop(content: WebContents, startUrl: () => string): void {
  let trips: number[] = []
  content.on('did-navigate', (_event, url) => {
    if (!isLogoutUrl(url)) return
    const noted = noteLogout(trips, Date.now())
    trips = noted.trips
    if (!noted.loop) return
    trips = []
    void breakLoop(content, startUrl)
  })
}

/**
 * Leave SoundCloud's page, remove the sign-in cookies, then open the start page with the history
 * dropped.
 *
 * The page goes first, as in `clearSiteData` (index.ts): its scripts, still running, could write
 * `oauth_token` back, since SoundCloud's page sets that cookie itself (it is not HttpOnly).
 * `cookies.remove(url, name)` takes every cookie of that name the URL would be sent, so a
 * `.soundcloud.com` cookie goes as well as a host-only one.
 */
async function breakLoop(content: WebContents, startUrl: () => string): Promise<void> {
  await content.loadURL('about:blank').catch(() => undefined)
  if (content.isDestroyed()) return

  const { cookies } = content.session
  for (const cookie of SIGN_IN_COOKIES) {
    await cookies.remove(`https://${cookie.host}/`, cookie.name).catch(() => undefined)
  }
  await cookies.flushStore().catch(() => undefined)
  if (content.isDestroyed()) return

  console.warn('[session] SoundCloud kept signing out a sign-in it could not clear; cleared it')
  // Back would otherwise lead to the blank page, then to the pages of the dead sign-in. Run ahead
  // of window.ts's own listener, so the header's Back button reads the history after it is cleared.
  content.prependOnceListener('did-navigate', () => content.navigationHistory.clear())
  content.loadURL(startUrl()).catch(() => undefined)
}
