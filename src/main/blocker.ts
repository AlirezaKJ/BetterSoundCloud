import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FiltersEngine, Request } from '@ghostery/adblocker'
import { neverFilter, isAudioAdRequest } from './net-rules'
import { isDev } from './env'
import type { Shell } from './window'

/**
 * Third-party ad and tracker blocking.
 *
 * The engine is a binary compiled at build time by `scripts/build-blocker-engine.mjs` and
 * committed to `resources/`. Loading it is a synchronous file read — no network at launch,
 * no cache to invalidate, no promise ordering, and no race with the content view's first
 * navigation. That determinism is the point: v0.7.x fetched filter lists on every start
 * with no await and no catch, so whether blocking was active varied run to run, which made
 * the "you have been blocked" reports impossible to reproduce.
 *
 * We own the `webRequest` listener rather than calling the library's
 * `enableBlockingInSession`. Three reasons, in order of importance:
 *
 *   1. Our allowlist runs BEFORE the engine, in our own code. An upstream list cannot
 *      reach a protected host no matter what rule it adds.
 *   2. Electron permits exactly one listener per event per session and replacement is
 *      silent, so whoever registers last wins. Owning it makes that explicit.
 *   3. `enableBlockingInSession` also registers a session-wide preload for cosmetic
 *      filtering, which would put third-party code inside SoundCloud's page.
 */

/** SoundCloud's ad endpoints. Used only by the dev trace below. */
const AD_ENDPOINT_RE = /audio-ads|\/promoted\/|promoted\.soundcloud\.com/

let engine: FiltersEngine | null = null
let blockingOn = false

/**
 * Audio-ad blocking, switched separately from the filter-list engine.
 *
 * Separate because it is a different promise. The engine is best-effort filtering of other
 * people's ad networks; this is one known request to one known endpoint, and it needs no
 * engine, no filter list and no network fetch to work — so it stays on even if the engine
 * fails to load, and it can be switched off on its own.
 */
let audioAdsOn = false

/** Where the engine failed, if it did — surfaced so a bug report can carry it. */
let loadError: string | null = null

/**
 * Read the engine. Synchronous and safe to call before the window exists.
 * Never throws: a blocker that cannot load degrades to no blocking, never to no SoundCloud.
 */
export function loadBlockerEngine(): void {
  const dir = join(import.meta.dirname, '../../resources')

  try {
    engine = FiltersEngine.deserialize(readFileSync(join(dir, 'engine.bin')))
    loadError = null
  } catch (error) {
    engine = null
    loadError = error instanceof Error ? error.message : String(error)
    console.error(`[blocker] engine unavailable, blocking stays off: ${loadError}`)
    return
  }

  // Say which engine is running. The last investigation into "did the blocker cause this?"
  // was unfalsifiable because nothing recorded what, if anything, had loaded.
  //
  // Deliberately in its own try/catch, AFTER the engine is already loaded. This file is
  // diagnostic only, and sharing a catch with the deserialize above meant a missing or
  // malformed engine.meta.json — or just an absent `sha256` making `.slice()` throw — would
  // discard a perfectly good engine and turn blocking off. A log line must not be able to
  // disable the feature it describes.
  try {
    const meta = JSON.parse(readFileSync(join(dir, 'engine.meta.json'), 'utf8')) as {
      lists: string[]
      builtAt: string
      sha256: string
    }
    console.log(
      `[blocker] engine ${meta.sha256.slice(0, 12)} — ${meta.lists.length} lists, built ${meta.builtAt}`
    )
  } catch {
    console.warn('[blocker] engine loaded, but engine.meta.json could not be read')
  }
}

/** True when an engine is loaded and blocking could actually happen. */
export function isBlockerAvailable(): boolean {
  return engine !== null
}

export function setBlockingEnabled(enabled: boolean): void {
  blockingOn = enabled && engine !== null
}

/** Switch audio-ad blocking. Independent of the engine, so no availability check. */
export function setAudioAdBlocking(enabled: boolean): void {
  if (isDev && enabled !== audioAdsOn) {
    console.log('[blocker] audio-ad blocking ' + (enabled ? 'ON' : 'OFF'))
  }
  audioAdsOn = enabled
}

/**
 * Attach the single request listener. Called once, from `createShell`.
 *
 * Scoped by `webContentsId` rather than by session: the content view and our own chrome
 * currently share the default session, and our own UI must never be filtered.
 */
export function attachBlocker(shell: Shell): void {
  const contentId = shell.content.webContents.id
  const { webRequest } = shell.content.webContents.session

  webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    // Audio ads only request an ad when one is about to play, which makes them nearly
    // impossible to catch by staring at a log. Trace them in dev so the next report comes
    // with evidence rather than a guess. This decides nothing.
    if (isDev && AD_ENDPOINT_RE.test(details.url)) {
      console.log(
        '[ad-request] ' +
          details.resourceType +
          ' wcId=' +
          String(details.webContentsId) +
          ' engine=' +
          String(blockingOn) +
          ' audioAdBlock=' +
          String(audioAdsOn) +
          ' ' +
          details.url.slice(0, 160)
      )
    }

    // Only SoundCloud's view. Our header, settings and overlay are never filtered.
    //
    // A request from a service worker or other worker context carries NO webContentsId,
    // and `undefined !== contentId` used to send every one of them straight through
    // unfiltered. That is not a rare edge: SoundCloud loads its own JS bundles and
    // DataDome's tags.js through that channel, so a large slice of its traffic bypassed
    // the blocker entirely. Our own chrome never registers a service worker, so anything
    // arriving without an id belongs to the page and still has to be checked.
    if (details.webContentsId !== undefined && details.webContentsId !== contentId) {
      return callback({})
    }

    // Never cancel a navigation — a blocked main frame is a blank window.
    if (details.resourceType === 'mainFrame') return callback({})

    // Audio ads are decided here, before the engine gate below, because they are their own
    // setting and must work whether or not the filter-list blocker is on or even loaded.
    // Deciding both ways here also keeps the two settings from contradicting each other: with
    // this off, an ad request is passed through even if a list rule would have caught it.
    if (isAudioAdRequest(details.url)) {
      return callback(audioAdsOn ? { cancel: true } : {})
    }

    // Everything below is the filter-list engine, which has its own setting.
    if (!blockingOn || engine === null) return callback({})

    if (neverFilter(details.url)) return callback({})

    // `$third-party` rules are a large share of every list, and they can only be evaluated
    // against the document a request belongs to. `details.referrer` is empty for anything a
    // script injects into a sandboxed iframe, and an empty source makes every one of those
    // rules silently pass — measured: with no source, cdn.adswizz.com and
    // synchrobox.adswizz.com go from BLOCK to allow, and those are exactly how SoundCloud
    // loads its audio-ad client. Fall back to the page the view is actually showing, which
    // is the right document in every case we have.
    const sourceUrl =
      details.referrer ||
      (shell.content.webContents.isDestroyed() ? '' : shell.content.webContents.getURL())

    const { match, redirect } = engine.match(
      Request.fromRawDetails({
        url: details.url,
        type: details.resourceType,
        sourceUrl
      })
    )

    // A redirect substitutes a harmless stub (an empty script, a 1px image) for something
    // the page expects to exist. Cancelling those outright tends to break the page.
    if (redirect) return callback({ redirectURL: redirect.dataUrl })
    if (match) return callback({ cancel: true })

    callback({})
  })
}
