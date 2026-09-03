/**
 * Which way round SoundCloud's page is: light or dark.
 *
 * Our overlays — the window controls over their header, the buttons in their player bar —
 * are separate documents composited on top of SoundCloud's. CSS cannot reach across that
 * boundary, so they cannot inherit its colours the way the injected theme does with
 * `currentColor`. Left hard-coded white, they vanish the moment somebody picks Light in
 * SoundCloud's own settings. This is how they find out which way to paint.
 *
 * Pure, so the decision can be tested without a browser. The DOM reading lives in the
 * content preload; everything debatable lives here.
 */

/** Serialisable, and deliberately not a boolean — `theme.light` reads better than `theme`. */
export type PageTheme = 'light' | 'dark'

/**
 * Relative luminance of a CSS colour, 0 (black) to 1 (white), or null if unreadable.
 *
 * Deliberately the simple sRGB weighting rather than the full WCAG curve: the question is
 * only "is this page light or dark", never a contrast ratio, and the two agree everywhere
 * except a narrow band around mid-grey where the answer does not matter.
 */
export function luminance(color: string): number | null {
  const parts = /rgba?\(([^)]+)\)/.exec(color)
  if (!parts?.[1]) return null

  const nums = parts[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  const [r, g, b, a] = nums
  if (r === undefined || g === undefined || b === undefined) return null
  if (nums.some((n) => Number.isNaN(n))) return null

  // A fully transparent background tells us nothing about what shows through it.
  if (a !== undefined && a === 0) return null

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Decide the page theme from what the content preload could read.
 *
 * Measured on the live site: SoundCloud puts `theme-light` on `<body>`, and it does NOT
 * follow `prefers-color-scheme` once the account has picked a theme explicitly — with the
 * account set to Light, flipping `nativeTheme.themeSource` to dark left the class alone. So
 * the class is the signal, and the OS preference is not.
 *
 * The background colour is a fallback rather than the primary check because the class is
 * explicit and cheap, while the fallback keeps working if SoundCloud renames it — a stale
 * selector should cost us the nice path, not the feature.
 */
export function detectPageTheme(bodyClass: string, backgroundColor: string): PageTheme {
  if (/(^|\s)theme-light(\s|$)/.test(bodyClass)) return 'light'
  if (/(^|\s)theme-dark(\s|$)/.test(bodyClass)) return 'dark'

  const lum = luminance(backgroundColor)
  // Unreadable colour: assume dark. SoundCloud's default is dark, and a wrong guess there
  // leaves our glyphs light on dark, which is legible — the other way round is invisible.
  if (lum === null) return 'dark'
  return lum > 0.5 ? 'light' : 'dark'
}
