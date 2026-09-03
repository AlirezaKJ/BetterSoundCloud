#!/usr/bin/env node
/**
 * Compiles the ad-blocking engine once, at build time, into `resources/engine.bin`.
 *
 * Why a committed binary rather than fetching filter lists at launch:
 *
 * v0.7.x fetched 15 lists over the network on every start, inside a `dom-ready` handler
 * that can fire more than once, with no `await` and no `.catch()`. Whether blocking was
 * even active varied run to run, which is precisely why the "you have been blocked"
 * reports were impossible to reproduce on identical versions. A synchronous read of a
 * committed file has no network, no cache, no promise ordering and no first-load race.
 *
 * The engine's `Config` is serialized *inside* the binary, so `loadCosmeticFilters: false`
 * becomes a property of the artefact rather than an argument a future contributor can
 * forget at the call site. That matters: cosmetic filters would inject third-party
 * scriptlets into SoundCloud's page, which the safety contract forbids outright.
 *
 * Run with `npm run blocker:build`, and commit both output files.
 */

import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  FiltersEngine,
  Request,
  adsAndTrackingLists,
  ENGINE_VERSION
} from '@ghostery/adblocker'

const OUT_DIR = join(import.meta.dirname, '..', 'resources')

/** Must never be blocked. Mirrors NEVER_FILTER_HOSTS in src/main/net-rules.ts. */
const MUST_ALLOW = [
  ['https://secure.soundcloud.com/sign-in', 'document'],
  ['https://dwt.soundcloud.com/tags.js', 'script'],
  ['https://api-auth.soundcloud.com/oauth/authorize', 'xhr'],
  ['https://api-v2.soundcloud.com/me', 'xhr'],
  // Narrow neighbours of the audio-ads rule: these must NOT be caught by it.
  ['https://api-v2.soundcloud.com/tracks/1/audio-ads', 'xhr'],
  ['https://a-v2.sndcdn.com/media/123/stream/hls', 'media'],
  ['https://i1.sndcdn.com/artworks-abc-large.jpg', 'image'],
  ['https://www.google.com/recaptcha/api.js', 'script'],
  ['https://geo.captcha-delivery.com/captcha/', 'document']
]

/**
 * Must be blocked, or the engine is not doing its job.
 *
 * The audio-ad entries are the load-bearing ones. SoundCloud's between-track ads are the
 * thing users actually want gone, and the only reason they can be stopped is that the
 * lists carry a rule for SoundCloud's own `/audio-ads` endpoint plus the AdsWizz hosts
 * that deliver the creative. If a list update ever drops those, the feature quietly stops
 * working — so the build fails here instead.
 */
const MUST_BLOCK = [
  ['https://securepubads.g.doubleclick.net/tag/js/gpt.js', 'script'],
  ['https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script'],

  // Audio ads: the endpoint, the SDK, and AdsWizz, SoundCloud's audio-ad delivery network.
  ['https://api-v2.soundcloud.com/audio-ads', 'xhr'],
  ['https://imasdk.googleapis.com/js/sdkloader/ima3.js', 'script'],
  ['https://synchrobox.adswizz.com/register2.php', 'script'],
  ['https://cdn.adswizz.com/adswizz/js/SynchroClient2.js', 'script'],
  ['https://synchroscript.deliveryengine.adswizz.com/x', 'script']
]

const matches = (engine, [url, type]) =>
  engine.match(Request.fromRawDetails({ url, type, sourceUrl: 'https://soundcloud.com/' }))
    .match

console.log(`Building engine (adblocker ENGINE_VERSION ${ENGINE_VERSION})`)
console.log(`${adsAndTrackingLists.length} lists — ads and tracking only, no annoyances.`)

const engine = await FiltersEngine.fromLists(fetch, adsAndTrackingLists, {
  loadNetworkFilters: true,
  // Everything below is off on purpose. Each one would run third-party code or CSS inside
  // SoundCloud's document, which safety-contract rule 1 forbids. The annoyance lists that
  // `fullLists` would add are the ones carrying a `$replace` rule that patches SoundCloud's
  // `isLoggedIn()` and scriptlets that delete its anonymous-ID cookies.
  loadCosmeticFilters: false,
  loadGenericCosmeticsFilters: false,
  loadCSPFilters: false,
  enableMutationObserver: false,
  enableHtmlFiltering: false,
  enableCompression: true
})

// Fail the build, never the app. A bad engine caught here costs a minute; shipped, it
// costs a user their sign-in.
const wronglyBlocked = MUST_ALLOW.filter((c) => matches(engine, c))
const wronglyAllowed = MUST_BLOCK.filter((c) => !matches(engine, c))

if (wronglyBlocked.length) {
  console.error('\nFAIL — these must never be blocked but matched a rule:')
  for (const [url] of wronglyBlocked) console.error(`  ${url}`)
}
if (wronglyAllowed.length) {
  console.error('\nFAIL — these should be blocked but did not match:')
  for (const [url] of wronglyAllowed) console.error(`  ${url}`)
}
if (wronglyBlocked.length || wronglyAllowed.length) process.exit(1)

const bytes = engine.serialize()
writeFileSync(join(OUT_DIR, 'engine.bin'), bytes)

// The engine's identity. Log it at startup: without it, the next "is the blocker involved?"
// investigation is as unfalsifiable as the last one was.
const meta = {
  engineVersion: ENGINE_VERSION,
  builtAt: new Date().toISOString(),
  lists: adsAndTrackingLists,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex')
}
writeFileSync(join(OUT_DIR, 'engine.meta.json'), JSON.stringify(meta, null, 2) + '\n')

console.log(
  `\nOK — ${MUST_ALLOW.length} protected URLs pass through, ${MUST_BLOCK.length} ad hosts blocked.`
)
console.log(`resources/engine.bin       ${(bytes.length / 1024 / 1024).toFixed(2)} MB`)
console.log(`resources/engine.meta.json sha256 ${meta.sha256.slice(0, 16)}…`)
