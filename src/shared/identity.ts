/**
 * Browser identity.
 *
 * The v0.7.x bug this replaces: `main.js:56` rewrote only the `User-Agent` *header*
 * to a hardcoded `Chrome/136`, while nothing set `app.userAgentFallback`. SoundCloud's
 * sign-in code reads `window.navigator.userAgent` and posts it in the request body, so
 * one request carried `Chrome/136` in the header and `...BetterSoundCloud/0.7.1
 * Chrome/146 Electron/41.1.1...` in the body. Two different browsers, one request.
 *
 * The rule for v2 is: ONE user agent, set ONCE, at the lowest layer, derived from the
 * Chromium we are actually running. No header rewriting. No JS property spoofing.
 * No touching client hints — leave `sec-ch-ua` alone and Chromium emits brands that
 * agree with both this string and `navigator.userAgentData`, which is what a stock
 * Chromium build looks like.
 *
 * We are not claiming to be something we are not. We are declining to volunteer the
 * Electron and app tokens that Electron appends by default. Everything else — the
 * Chromium major, the platform — is the truth.
 */

export type Platform = 'win32' | 'darwin' | 'linux'

/** Real Chrome reports Intel here even on Apple Silicon. Matching that is correct. */
const PLATFORM_TOKEN: Record<Platform, string> = {
  win32: 'Windows NT 10.0; Win64; x64',
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64'
}

/**
 * Build a stock-Chromium user agent for the Chromium we are running on.
 *
 * `platform` is typed as a plain string, not `NodeJS.Platform`: this module is shared
 * with the renderer, which has no node types.
 *
 * @param chromeVersion e.g. `process.versions.chrome` — "143.0.7204.100"
 * @param platform      e.g. `process.platform`
 */
export function buildUserAgent(chromeVersion: string, platform: string): string {
  const major = chromeVersion.split('.')[0] ?? ''
  if (!/^\d+$/.test(major)) {
    throw new Error(`Unusable Chromium version: ${JSON.stringify(chromeVersion)}`)
  }
  const token = PLATFORM_TOKEN[platform as Platform] ?? PLATFORM_TOKEN.linux
  return (
    `Mozilla/5.0 (${token}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${major}.0.0.0 Safari/537.36`
  )
}

/**
 * Guard for the regression that keeps coming back (issue #106: "the User-Agent still
 * contains Electron too"). Call this in a test and at startup in dev.
 */
export function leaksAppIdentity(userAgent: string): boolean {
  return /electron|bettersoundcloud/i.test(userAgent)
}
