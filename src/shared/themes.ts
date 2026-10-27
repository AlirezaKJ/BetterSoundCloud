import type { PageTheme } from './page-theme'

/**
 * What the settings panel knows about a theme.
 *
 * The stylesheet itself never crosses IPC — main injects it straight into SoundCloud's view,
 * and the panel only needs enough to draw a list. Keeping the CSS out of this type is what
 * makes that obvious to the next person, rather than a rule they have to remember.
 */
export interface ThemeSummary {
  /** Filename stem, and the value stored in `appearance.theme`. */
  readonly id: string
  readonly name: string
  readonly author: string
  readonly version: string
  readonly description: string
  /** Shipped with the app, as opposed to one the user dropped in their themes folder. */
  readonly builtIn: boolean
  /**
   * A few hex colours that sum the theme up, from its `@preview` line, for swatches in the
   * panel. Empty when the theme declares none — the panel then shows no swatches rather than
   * guessing colours out of the stylesheet.
   */
  readonly preview: readonly string[]
  /** A built-in theme the user has copied into their own folder, which now takes its place. */
  readonly overridesBuiltIn: boolean
  /**
   * Which of SoundCloud's two modes the theme was made for, from its `@mode` line, or null when it
   * does not say. While SoundCloud shows the other mode, BetterSoundCloud puts that mode's own
   * colours back underneath the theme (resources/soundcloud-palette-*.css), so the theme looks the
   * same in both; and the window buttons drawn on SoundCloud's bars follow it rather than
   * SoundCloud. A theme with no `@mode` has to look after both modes itself.
   */
  readonly mode: PageTheme | null
  /**
   * The theme is made to sit on a background, from `@background required` in its header —
   * Glassmorphism's see-through panels are nothing over a flat colour. While such a theme is
   * selected, the Background setting cannot be None: `backgroundSource` turns None into the
   * playing track's artwork, without changing the stored setting, so None comes back with the
   * next theme.
   */
  readonly needsBackground: boolean
}

/**
 * Read a `/** @name … *\/` header off a theme file.
 *
 * Pure and exported so it can be tested without touching the disk. Every field is optional:
 * a theme with no header at all still loads, and just shows up under its filename. Being
 * strict here would mean a typo in a comment stops a stylesheet working, which is a bad
 * trade for metadata that only decorates a list.
 */
export function parseThemeMetadata(
  css: string,
  fallbackName: string
): Omit<ThemeSummary, 'id' | 'builtIn' | 'overridesBuiltIn'> {
  const header = /\/\*\*([\s\S]*?)\*\//.exec(css)?.[1] ?? ''

  // `@name Minimal navigation` up to the next `@tag` or the end of the block. The `m` flag
  // plus the leading-star strip is what lets a description wrap over several lines.
  const tag = (name: string): string | null => {
    const body = new RegExp(`@${name}\\s+([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|$)`).exec(header)?.[1]
    if (body === undefined) return null
    return body
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .join(' ')
      .trim()
  }

  return {
    name: tag('name') || fallbackName,
    author: tag('author') || 'Unknown',
    version: tag('version') || '0.0.0',
    description: tag('description') || '',
    preview: (tag('preview') ?? '')
      .split(/\s+/)
      .filter((colour) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour))
      .slice(0, 5),
    mode: readMode(tag('mode')),
    needsBackground: (tag('background') ?? '').toLowerCase() === 'required'
  }
}

/**
 * What the Background shows, given the setting and whether the selected theme needs one. The
 * one place that decides it, for main (what goes on the page) and the settings panel (which
 * choice it shows as on).
 */
export function backgroundSource(
  setting: 'none' | 'artwork' | 'picture',
  themeNeedsBackground: boolean
): 'none' | 'artwork' | 'picture' {
  return setting === 'none' && themeNeedsBackground ? 'artwork' : setting
}

/** `@mode dark` or `@mode light`, in any case; anything else is no mode at all. */
function readMode(value: string | null): PageTheme | null {
  const word = (value ?? '').toLowerCase()
  return word === 'dark' || word === 'light' ? word : null
}

/*
 * ── Where a theme's CSS goes ──────────────────────────────────────────────────────────────
 *
 * One file can style SoundCloud's page and BetterSoundCloud's own windows. A line that is
 * exactly `/* @target <name> *\/` starts a section for that target; everything before the first
 * marker is for SoundCloud's page, so every theme written before targets existed still works.
 * Lifted from soundcloud-rpc, whose idea this was.
 */

/**
 * `content` is SoundCloud's page. `chrome` is every view of ours that follows the app's own
 * colours — the 32px bar, the settings panel, the right-click menu, the status screen — and the
 * per-view names narrow that down. `all` goes everywhere.
 *
 * The overlays drawn on SoundCloud's own bars are not chrome: they follow SoundCloud's light or
 * dark setting so they match the bar under them, and a theme reaches them through `content`'s
 * colours, not through ours.
 */
export const THEME_TARGETS = [
  'content',
  'chrome',
  'header',
  'settings',
  'menu',
  'status',
  'all'
] as const
export type ThemeTarget = (typeof THEME_TARGETS)[number]

/** Our own views a theme can reach, and the per-view target that also applies to each. */
export type ChromeView = 'header' | 'settings' | 'menu' | 'status'

export type ThemeSections = Record<ThemeTarget, string>

const MARKER = /^[ \t]*\/\*[ \t]*@target[ \t]+([a-z]+)[ \t]*\*\/[ \t]*$/gm

/** Split a theme into its sections. An unknown target's CSS is dropped, not misapplied. */
export function splitThemeTargets(css: string): ThemeSections {
  const sections: ThemeSections = {
    content: '',
    chrome: '',
    header: '',
    settings: '',
    menu: '',
    status: '',
    all: ''
  }
  let target: ThemeTarget | null = 'content'
  let from = 0
  for (const match of css.matchAll(MARKER)) {
    if (target) sections[target] += css.slice(from, match.index)
    const name = match[1] ?? ''
    target = THEME_TARGETS.some((t) => t === name) ? (name as ThemeTarget) : null
    from = match.index + match[0].length
  }
  if (target) sections[target] += css.slice(from)
  for (const key of THEME_TARGETS) sections[key] = sections[key].trim()
  return sections
}

/** The CSS one of our views gets from a theme: `all`, then `chrome`, then its own section. */
export function chromeCssFor(sections: ThemeSections, view: ChromeView): string {
  return [sections.all, sections.chrome, sections[view]].filter(Boolean).join('\n')
}

/** The CSS SoundCloud's page gets from a theme: `all`, then `content`. */
export function contentCssOf(sections: ThemeSections): string {
  return [sections.all, sections.content].filter(Boolean).join('\n')
}

/**
 * The stylesheet that gives themes `--bsc-cover`: the playing track's artwork, or `none`.
 *
 * `html:root` rather than `:root` on purpose. This sheet and the page's main stylesheet are
 * inserted separately and at different times, so their order is not fixed; the main sheet sets
 * the `none` default on `:root`, and the extra specificity is what makes the real cover win
 * whichever was inserted last.
 *
 * The URL is checked here even though it comes from `readNowPlaying`, because it is about to be
 * written into CSS: only an https URL on SoundCloud's image host, made of characters that cannot
 * close the `url("…")` it sits in, gets through.
 */
export function coverCss(artwork: string): string {
  const safe = /^https:\/\/i\d*\.sndcdn\.com\/[A-Za-z0-9._~/-]+$/.test(artwork)
  return `html:root { --bsc-cover: ${safe ? `url("${artwork}")` : 'none'}; }`
}
