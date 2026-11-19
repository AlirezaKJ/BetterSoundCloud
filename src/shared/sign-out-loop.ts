/**
 * SoundCloud's page signing itself out, again and again, on a sign-in it cannot get rid of.
 *
 * Measured 2026-11-19, the 0.9.0 release on a real profile: every signed-in API call answered 401,
 * SoundCloud's own `onLogout` sent the page to /logout, /logout answered 401 too (there was no live
 * session to end) and so never cleared the dead `oauth_token`, and the page came back with it —
 * every 2.6 seconds, for as long as the app ran. Nothing could be clicked, so the user could not
 * even sign in again.
 *
 * How a profile gets such a token: packaged builds encrypt their cookies (the `enableCookieEncryption`
 * fuse) and a build run from source does not. Each kind skips the other's cookie rows, so one
 * profile can hold two sign-ins; the packaged one had gone stale while the source build, which
 * could not see it, signed in afresh.
 *
 * Pure, so the rule is tested on its own; main/sign-out-loop.ts acts on it.
 */

/** How many trips to /logout, within how long, count as a loop rather than signing out. */
export const SIGN_OUT_LOOP = { count: 3, withinMs: 30_000 } as const

/** Whether a navigation is to SoundCloud's /logout. */
export function isLogoutUrl(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return protocol === 'https:' && hostname === 'soundcloud.com' && pathname === '/logout'
  } catch {
    return false
  }
}

/**
 * Note one trip to /logout at `now`. Returns the trips still inside the window, and whether they
 * now make a loop. After a loop the caller starts again from an empty list.
 */
export function noteLogout(
  trips: readonly number[],
  now: number
): { trips: number[]; loop: boolean } {
  const recent = [...trips.filter((t) => now - t < SIGN_OUT_LOOP.withinMs), now]
  return { trips: recent, loop: recent.length >= SIGN_OUT_LOOP.count }
}
