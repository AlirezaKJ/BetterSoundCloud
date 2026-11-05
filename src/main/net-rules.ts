/**
 * What must never be filtered, no matter what a filter list says.
 *
 * This is a pure predicate with no Electron import so it can be unit tested directly, and
 * it runs *before* the blocking engine — not as an exception rule inside it. That ordering
 * is the whole design: an upstream list can add an `$important` rule targeting SoundCloud
 * tomorrow and it still cannot reach anything here.
 *
 * v0.7.x had no allowlist at all — it handed the prebuilt ads-and-tracking engine straight
 * to `enableBlockingInSession` and let every rule fire. That is why its audio ads stayed
 * quiet, and why the first version of this file silently switched them back on: the lists
 * DO carry a rule for SoundCloud's own `/audio-ads` endpoint, and a blanket host allowlist
 * cancelled it. Hence `isAudioAdRequest` below, which the blocker consults first.
 */

/**
 * First-party and sign-in critical hosts, matched across every subdomain.
 *
 * `soundcloud.com` covers `secure.` (sign-in), `api-auth.`, `api-v2.`, `checkout.`, and
 * `dwt.` — which is DataDome, served first-party under SoundCloud's own domain. That last
 * one is why subdomain coverage matters rather than an exact-host list.
 *
 * `sndcdn.com` covers `a-v2.` (audio), `i1.` (artwork), `va.` and `cf-hls-media.`.
 */
const NEVER_FILTER_HOSTS = [
  'soundcloud.com',
  'sndcdn.com',

  // DataDome's own hosts, for the challenge page SoundCloud opens when it returns a 403.
  'datadome.co',
  'captcha-delivery.com',

  // reCAPTCHA, which the sign-in flow uses. Allowlisted whole rather than by path: it
  // costs a little coverage (Google Analytics on these hosts survives) and buys a
  // predicate a reviewer can check in one read, with no path-matching bugs sitting on the
  // auth and DRM paths. The one host that had to be carved back out is `imasdk` — see
  // `isAudioAdRequest`.
  'google.com',
  'gstatic.com',
  'googleapis.com',

  // Third-party sign-in SoundCloud offers. Allowing connect.facebook.net also lets the
  // Facebook pixel through — that is the price of Facebook sign-in working.
  'accounts.google.com',
  'connect.facebook.net',
  'appleid.apple.com',
  'appleid.cdn-apple.com'
]

/**
 * Widevine licence acquisition, matched by shape.
 *
 * The real licence host has not been measured yet. Until it has, this errs toward letting
 * requests through: a blocked licence request looks exactly like the auto-skip bug that
 * took four issues and fifteen months to diagnose.
 */
const LICENCE_RE = /licen[cs]e|widevine|\/drm\b|cenc/i

/**
 * Everything that delivers SoundCloud's between-track audio ads.
 *
 * This is the whole definition of the feature, in one place, so the setting that switches it
 * and the allowlist that must not shield it can never drift apart.
 *
 * Deliberately narrow. Each entry was measured on the live site:
 *
 * - `api-v2.soundcloud.com/audio-ads` is the request the player makes when an ad is due. Its
 *   URL is built by `getAudioAdsUrl({trackId})` from `audioAds: {service:'api-v2',
 *   path:'audio-ads'}`, and it carries an `aw_listener_id` — the AdsWizz listener id.
 *   Anchored at the path root, matching the filter lists' own rule: `/audio-ads` is an ad,
 *   `/v2/audio-ads` and `/tracks/1/audio-ads` are not.
 * - `adswizz.com` is the audio-ad network itself. SoundCloud loads its client with
 *   `insertMultipleScriptsInSandbox(['//synchrobox.adswizz.com/register2.php', ...])`.
 * - `imasdk.googleapis.com` is Google's IMA ad SDK. The rest of googleapis.com — everything
 *   reCAPTCHA and OAuth need — is untouched.
 *
 * Blocking the endpoint lands on a path SoundCloud already handles: its own `parse()`
 * returns `{ is_malformed: true }` when the response has no `promoted` key.
 */
export function isAudioAdRequest(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  const host = url.hostname
  if (host === 'imasdk.googleapis.com') return true
  if (host === 'adswizz.com' || host.endsWith('.adswizz.com')) return true

  const soundCloud = host === 'soundcloud.com' || host.endsWith('.soundcloud.com')
  return soundCloud && (url.pathname === '/audio-ads' || url.pathname.startsWith('/audio-ads/'))
}

/** True when a request must be passed through untouched. */
export function neverFilter(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // Unparseable means we cannot reason about it, so we do not block it.
    return true
  }

  // Before everything else, including the licence heuristic: an ad endpoint that happened
  // to contain the word "license" would otherwise protect itself. The blocker short-circuits
  // audio ads before it ever calls this, so this is belt-and-braces — it means the allowlist
  // cannot shield an ad even if that ordering is later changed.
  if (isAudioAdRequest(url.href)) return false

  if (LICENCE_RE.test(url.href)) return true

  const host = url.hostname
  return NEVER_FILTER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}
