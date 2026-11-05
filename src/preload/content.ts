/**
 * Preload for the SoundCloud page.
 *
 * This file is the whole of BetterSoundCloud's presence inside soundcloud.com, and it
 * is bound by the contract in the vault note "BetterSoundCloud v2 Tech Stack and
 * Approach" §4:
 *
 *   1. Never write into SoundCloud's DOM tree. Expando properties on nodes are fine;
 *      `innerHTML`, insertion into React containers, attribute writes and `.remove()`
 *      are not.
 *   2. Our chrome lives outside the document — there is nothing to inject.
 *   3. Read-only, event-driven, isolated world, `try/catch`. ZERO `setInterval`.
 *      Results go over `ipcRenderer`, never `console.log`.
 *   4. Cosmetic changes are CSS-only via `webContents.insertCSS()` from main.
 *
 * Why it matters, concretely: v0.7.x ran four zero-jitter timers on this origin
 * (`infoticker.js:10` at 1 Hz emitting nine `console.log("BSCReceive|...")` per tick,
 * `custombg.js:25` at 100 ms, `lastfm.js:426`, `startup.js:88`), re-executed a script
 * into the page every second forever because a flag was never set, overwrote
 * `innerHTML` on live React nodes, and fired untrusted synthetic clicks on the player.
 * The maintainer's own observation on issue #91 was that "without the injected scripts
 * it works perfectly even in BSC".
 *
 * Nothing is exposed to the page's main world. `contextBridge` is deliberately not used
 * here — SoundCloud must not be able to detect us by probing for a global. v0.7.x
 * leaked `issciloaded`, `playpausebtn`, `nextsongbtn`, `maximize`, and more.
 *
 * What it does today: reports SoundCloud's light/dark setting, and reports what is
 * playing by watching the player bar. Both are observers; neither writes anything.
 */

import { ipcRenderer } from 'electron'
import { detectPageTheme } from '@shared/page-theme'
import type { PageTheme } from '@shared/page-theme'
import type { PlayerReading } from '@shared/now-playing'
import { PLAYER_BAR } from './soundcloud-selectors'

/*
 * The channels this preload sends on, written out rather than imported from `@shared/ipc`.
 *
 * Not a style choice. `chrome.ts` imports that module too, and Rollup hoists anything two
 * entries share into `chunks/…cjs` which each entry then `require`s — but a SANDBOXED preload
 * resolves `require` against Electron's allowlist only, never a relative path, so the preload
 * fails to load with "module not found" and everything it does silently stops. That is exactly
 * what happened when this file first started using its import; before that the shared module
 * was tree-shaken away and the problem was invisible.
 *
 * `src/preload/content.test.ts` fails if these strings and `CH` ever drift apart.
 */
const PAGE_THEME_CHANNEL = 'page:theme'
const TRACK_UPDATE_CHANNEL = 'content:track-update'

type Disposer = () => void

const disposers: Disposer[] = []

/**
 * Every listener and observer goes through here so teardown cannot be forgotten.
 * Returns a function that stops this one observer early; teardown stops it regardless.
 */
function observe(target: Node, options: MutationObserverInit, cb: MutationCallback): Disposer {
  try {
    const observer = new MutationObserver((records, self) => {
      try {
        cb(records, self)
      } catch {
        // A stale selector must be a no-op, never an exception that reaches
        // SoundCloud's own window.onerror wrapper.
      }
    })
    observer.observe(target, options)
    const stop = (): void => observer.disconnect()
    disposers.push(stop)
    return stop
  } catch {
    return () => {}
  }
}

function listen<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void
): void {
  const wrapped = (event: Event): void => {
    try {
      handler(event as DocumentEventMap[K])
    } catch {
      /* ignore */
    }
  }
  // Passive and capturing: we observe, we never intercept.
  document.addEventListener(type, wrapped, { capture: true, passive: true })
  disposers.push(() => document.removeEventListener(type, wrapped, { capture: true }))
}

function teardown(): void {
  while (disposers.length) {
    try {
      disposers.pop()?.()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Sends a watcher's current reading again, even though it has not changed. Every watcher
 * returns one, for the rare moment main needs telling twice — see the `pageshow` listener.
 */
type ReportAgain = () => void

/**
 * Report SoundCloud's own light/dark setting to main, so our overlays can match it.
 *
 * Read-only and event-driven, per the contract above: it observes the `class` attribute on
 * `<body>` — which is where SoundCloud carries `theme-light` — and never polls. Switching
 * the theme in their settings rewrites that class without a reload, which is exactly the
 * mutation this waits for.
 */
function watchPageTheme(): ReportAgain {
  let last: PageTheme | null = null

  const report = (): void => {
    const theme = detectPageTheme(
      document.body.className,
      getComputedStyle(document.body).backgroundColor
    )
    // Only on a real change. The observer fires for every class SoundCloud toggles on body,
    // and most of them have nothing to do with the theme.
    if (theme === last) return
    last = theme
    ipcRenderer.send(PAGE_THEME_CHANNEL, theme)
  }

  report()
  observe(document.body, { attributes: true, attributeFilter: ['class'] }, report)

  return () => {
    last = null
    report()
  }
}

/**
 * Report what is playing, by watching SoundCloud's player bar.
 *
 * The bar is drawn by SoundCloud's app some time after this preload starts — measured: it
 * is not there yet at DOMContentLoaded — so this waits for it with an observer, never a
 * timer. Once found, the same element stays for the life of the page: measured, it survives
 * SoundCloud's in-app navigation. So one observer on it sees every track change, play, pause,
 * like and clock tick.
 *
 * It sends the raw reading and lets main make sense of it with `readNowPlaying`
 * (src/shared/now-playing.ts), so every judgement call is in a pure module with tests.
 */
function watchPlayer(): ReportAgain {
  let lastSent = ''
  /** The bar being watched, once it has been found. */
  let watched: Element | null = null

  const report = (bar: Element): void => {
    const reading = readPlayer(bar)
    // The observer fires for far more than we read — the progress bar's width, the volume
    // slider, tooltips. Only a change in the reading is worth a message. While a track plays,
    // that is about once a second, as the clock ticks.
    const serialized = JSON.stringify(reading)
    if (serialized === lastSent) return
    lastSent = serialized
    ipcRenderer.send(TRACK_UPDATE_CHANNEL, reading)
  }

  const watch = (bar: Element): void => {
    watched = bar
    report(bar)
    observe(
      bar,
      { subtree: true, childList: true, characterData: true, attributes: true },
      () => report(bar)
    )
  }

  const bar = document.querySelector(PLAYER_BAR.bar)
  if (bar) {
    watch(bar)
  } else {
    // Waiting watches the whole page, so it stops the moment the bar turns up.
    const stopWaiting = observe(document.body, { childList: true, subtree: true }, () => {
      const found = document.querySelector(PLAYER_BAR.bar)
      if (!found) return
      stopWaiting()
      watch(found)
    })
  }

  return () => {
    lastSent = ''
    if (watched) report(watched)
  }
}

/** Read the player bar as it is. A missing element reads as empty — never a throw. */
function readPlayer(bar: Element): PlayerReading {
  const text = (selector: string): string =>
    bar.querySelector(selector)?.textContent?.trim() ?? ''
  const hasClass = (selector: string, className: string): boolean =>
    bar.querySelector(selector)?.classList.contains(className) ?? false

  // A link's resolved `href`; '' for an element that is not a link.
  const href = (selector: string): string =>
    bar.querySelector<HTMLAnchorElement>(selector)?.href ?? ''

  const titleLink = bar.querySelector<HTMLAnchorElement>(PLAYER_BAR.titleLink)
  const artwork = bar.querySelector<HTMLElement>(PLAYER_BAR.artwork)

  return {
    title: titleLink?.getAttribute('title') ?? '',
    artworkLabel: artwork?.getAttribute('aria-label') ?? '',
    artist: text(PLAYER_BAR.artist),
    href: href(PLAYER_BAR.titleLink),
    artworkHref: href(PLAYER_BAR.artworkLink),
    uploaderHref: href(PLAYER_BAR.artist),
    artworkStyle: artwork?.style.backgroundImage ?? '',
    elapsed: text(PLAYER_BAR.elapsed),
    duration: text(PLAYER_BAR.duration),
    playing: hasClass(PLAYER_BAR.playButton, PLAYER_BAR.playingClass),
    liked: hasClass(PLAYER_BAR.likeButton, PLAYER_BAR.likedClass)
  }
}

function start(): void {
  const themeAgain = watchPageTheme()
  const playerAgain = watchPlayer()

  // Back from the back/forward cache. Main forgets what was playing whenever the page is
  // left, and each watcher only speaks on a change, so both say their current state once
  // more. Trusted events only, for the reason given at `pagehide` below. This cannot happen
  // in today's Electron — see there — so it is insurance for an upgrade that changes that.
  window.addEventListener('pageshow', (event) => {
    if (!event.isTrusted || !event.persisted) return
    try {
      themeAgain()
      playerAgain()
    } catch {
      /* ignore */
    }
  })

  // Kept for the next in-page feature that needs an event rather than a mutation.
  void listen
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}

/*
 * Stop every watcher only when the page is really going away.
 *
 * Two kinds of `pagehide` must not count, and both were measured on 2026-10-27:
 *
 *   - One the page makes up. It is an ordinary DOM event, so any script on soundcloud.com can
 *     dispatch it, and a single fake `pagehide` used to switch off every watcher for the rest
 *     of the session. Real ones come from the browser and are `isTrusted`.
 *   - One that means "going into the back/forward cache" (`persisted`). A cached page is
 *     frozen and runs nothing, so its watchers simply carry on if it is ever brought back.
 *     Electron keeps that cache switched off, and SoundCloud's pages are `Cache-Control:
 *     no-store`, which makes them ineligible anyway — so in practice every Back to another
 *     page is a fresh load, and this file simply runs again.
 */
window.addEventListener('pagehide', (event) => {
  if (event.isTrusted && !event.persisted) teardown()
})
