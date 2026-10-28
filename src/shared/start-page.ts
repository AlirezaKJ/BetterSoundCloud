import { cleanUrl } from './context-menu'
import type { Settings } from './settings-schema'

/*
 * Which SoundCloud page the app opens on: the "On startup, open" setting (`general.startupUrl`),
 * and the rule for which pages its "Where you left off" choice may reopen. Pure, so both are
 * tested; main/start-page.ts does the reading and writing.
 */

export type StartPage = Settings['general.startupUrl']

/**
 * Where each fixed choice goes. SoundCloud calls /discover "Home". The `stream` choice keeps the
 * name SoundCloud used before it renamed its stream "Feed", which lives at /feed.
 */
export const START_PAGE_URLS = {
  discover: 'https://soundcloud.com/discover',
  stream: 'https://soundcloud.com/feed',
  library: 'https://soundcloud.com/you/library'
} as const

/**
 * Pages that are a step in something else rather than somewhere to come back to. Reopening
 * /logout would sign the user out at every launch: the right-click menu's Sign out goes there.
 */
const NOT_PAGES = ['logout', 'signin', 'signup', 'connect']

/** Room for any real page and its `?in=` playlist; anything longer is not one of SoundCloud's. */
const MAX_LENGTH = 2048

/** The page to open at startup. `lastPage` is whatever was stored, so it is checked again here. */
export function startPageUrl(choice: StartPage, lastPage: unknown): string {
  if (choice === 'lastVisited') return pageToRemember(lastPage) ?? START_PAGE_URLS.discover
  return START_PAGE_URLS[choice]
}

/**
 * The page to reopen next time, for a URL SoundCloud's page went to, or null when it is not one
 * to come back to. Only soundcloud.com itself, over https: its other hosts (sign-in, checkout) are
 * steps in something else. Tracking parameters and the `#fragment` are dropped; the rest of the
 * query stays, because a track opened from a playlist carries that playlist in `?in=`.
 */
export function pageToRemember(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > MAX_LENGTH) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'soundcloud.com') return null
  // SoundCloud's page never has these; a stored URL with them was not written by us.
  if (parsed.port || parsed.username || parsed.password) return null

  const firstSegment = (parsed.pathname.split('/')[1] ?? '').toLowerCase()
  if (NOT_PAGES.includes(firstSegment)) return null

  parsed.hash = ''
  return cleanUrl(parsed.toString())
}
