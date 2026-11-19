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
    void clearSignIn(content).then(() => {
      if (content.isDestroyed()) return
      console.warn(
        '[session] SoundCloud kept signing out a sign-in it could not clear; cleared it'
      )
      content.loadURL(startUrl()).catch(() => undefined)
    })
  })
}

/**
 * Remove the sign-in cookies. `cookies.remove(url, name)` takes every cookie of that name the URL
 * would be sent, so SoundCloud's own `.soundcloud.com` cookies go as well as host-only ones.
 */
async function clearSignIn(content: WebContents): Promise<void> {
  if (content.isDestroyed()) return
  const { cookies } = content.session
  for (const cookie of SIGN_IN_COOKIES) {
    await cookies.remove(`https://${cookie.host}/`, cookie.name).catch(() => undefined)
  }
  await cookies.flushStore().catch(() => undefined)
}
