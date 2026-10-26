import type { NowPlaying } from '@shared/now-playing'
import { isDev } from './env'

/**
 * The one copy of "what is playing" in the main process.
 *
 * The content preload reports SoundCloud's player bar whenever it changes, including once a
 * second while a track plays. Everything that cares — the tray, Discord, Last.fm, our own
 * overlays — reads it from here instead of watching the page itself, so the page is watched
 * exactly once however many features want the answer.
 */

type Listener = (nowPlaying: NowPlaying | null) => void

let current: NowPlaying | null = null
const listeners = new Set<Listener>()

/** The current track, or null when nothing is loaded in SoundCloud's player. */
export function getNowPlaying(): NowPlaying | null {
  return current
}

/** Run `listener` on every change. Returns a function that stops it. */
export function onNowPlayingChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setNowPlaying(next: NowPlaying | null): void {
  const previous = current
  if (JSON.stringify(previous) === JSON.stringify(next)) return
  current = next

  if (isDev) logChange(previous, next)

  for (const listener of listeners) {
    try {
      listener(next)
    } catch (error) {
      // One broken consumer must not stop the others hearing about the track.
      console.error('[now-playing] listener failed:', error)
    }
  }
}

/**
 * One line per change, in dev only. This is how a stale selector shows up: the field it
 * feeds reads as empty or `?` here. Clock ticks are left out, or they would bury everything
 * else — the clock appears in the line whenever something else changes.
 */
function logChange(previous: NowPlaying | null, next: NowPlaying | null): void {
  const before = previous ? { ...previous, elapsed: 0 } : null
  const after = next ? { ...next, elapsed: 0 } : null
  if (JSON.stringify(before) === JSON.stringify(after)) return

  if (!next) {
    console.log('[now-playing] nothing loaded')
    return
  }

  const parts = [
    next.playing ? 'playing' : 'paused',
    `${next.artist || '?'} — ${next.title}`,
    `${clock(next.elapsed)} / ${clock(next.duration)}`,
    next.liked ? 'liked' : 'not liked',
    next.artwork ? 'artwork' : 'no artwork',
    next.url || 'no url'
  ]
  console.log(`[now-playing] ${parts.join(' | ')}`)
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
