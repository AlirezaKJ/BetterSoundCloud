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

/**
 * Everything a website can read about which browser this is, decided once in main and given
 * to every session we create — so no two views, and no two layers, can tell a page different
 * stories.
 */
export type Identity = {
  userAgent: string
  /**
   * What pages see in `navigator.languages`. We do not set this — Electron does, and no
   * supported API changes it (see `pageLanguages`). It is recorded so the header can be built
   * from it and so dev builds can check the two still agree.
   */
  languages: string[]
  /**
   * The `Accept-Language` list, comma-separated and without q-values — Chromium adds those.
   * Built from `languages` by `acceptLanguages()`, e.g. `en-US,en-AU,en,fa`.
   */
  acceptLanguages: string
}

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

/*
 * Languages.
 *
 * A browser tells a website its languages twice: in `navigator.languages`, which scripts read,
 * and in the `Accept-Language` header on every request. Real Chrome builds both from one list,
 * so they always agree — and bot detection compares them. Left alone, Electron reported the
 * operating system's three languages to scripts while sending a bare `en-US` header, which is
 * a pairing no real browser produces. Measured 2026-10-27 against real Chrome 155 on the same
 * machine.
 *
 * The fix runs one way only. Electron gives no supported way to change `navigator.languages`
 * (`session.setUserAgent`, `--lang` and `--accept-lang` were all measured to leave it alone),
 * and overriding it from inside the page is the kind of spoofing this project refuses. So the
 * header is built from the list pages already see, the way Chrome builds it. A real Chrome
 * with the same languages configured would send exactly this.
 */

/**
 * The language list pages see in `navigator.languages`, as Electron builds it: the app's own
 * locale first, then the operating system's preferred languages, each once.
 *
 * Measured on Windows: locale `en-US` with system languages `["en-AU","en-US","fa"]` gives
 * `["en-US","en-AU","fa"]`. Dev builds check this against the real value at startup, so a
 * platform that builds the list differently shows up as a warning rather than a silent mismatch.
 */
export function pageLanguages(appLocale: string, systemLanguages: readonly string[]): string[] {
  const languages: string[] = []
  for (const language of [appLocale, ...systemLanguages]) {
    if (language && !languages.includes(language)) languages.push(language)
  }
  return languages
}

/**
 * The `Accept-Language` list Chrome sends for a language list, without the q-values.
 *
 * Chrome adds each language's base right after the last of its regional variants, unless the
 * base is already there: `en-US,en-AU,fa` becomes `en-US,en-AU,en,fa`, and a base that appears
 * later in the list moves up to that spot. Electron's `session.setUserAgent` adds the q-values
 * but not the base languages — measured — so this does that part. Every case in the tests was
 * measured on real Chrome with that list set in a fresh profile.
 */
export function acceptLanguages(languages: readonly string[]): string {
  const list: string[] = []
  const add = (language: string): void => {
    if (!list.includes(language)) list.push(language)
  }

  for (const [i, language] of languages.entries()) {
    add(language)
    const base = baseLanguage(language)
    const next = languages[i + 1]
    const lastVariantOfBase = next === undefined || baseLanguage(next) !== base
    if (base !== language && lastVariantOfBase) add(base)
  }
  return list.join(',')
}

/** `en-AU` -> `en`, `zh-Hant-TW` -> `zh`, `fa` -> `fa`. */
function baseLanguage(language: string): string {
  return language.split('-')[0] ?? language
}
