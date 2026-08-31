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
 * Phase 1 fills in AudioMonitor against the contract below. Phase 0 establishes it.
 */

import { ipcRenderer } from 'electron'
import { CH } from '@shared/ipc'

type Disposer = () => void

const disposers: Disposer[] = []

/** Every listener and observer goes through here so teardown cannot be forgotten. */
function observe(target: Node, options: MutationObserverInit, cb: MutationCallback): void {
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
    disposers.push(() => observer.disconnect())
  } catch {
    /* ignore */
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

function start(): void {
  // Phase 1: observe the play button and the sound badge here, and send
  // `CH.trackUpdate` with a validated payload. Intentionally empty for now — an empty
  // observer set is the correct Phase 0 state, not a TODO to paper over.
  void observe
  void listen
  void CH
  void ipcRenderer
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}

window.addEventListener('pagehide', teardown, { once: true })
