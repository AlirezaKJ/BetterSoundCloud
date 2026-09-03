import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { parseThemeMetadata } from '@shared/themes'
import type { ThemeSummary } from '@shared/themes'

/**
 * Themes: CSS files that restyle SoundCloud's page.
 *
 * A theme is a plain `.css` file with a metadata comment at the top. Two places are scanned:
 *
 *   resources/themes/       shipped with the app, read-only
 *   <userData>/themes/      the user's own, and where a theme author works
 *
 * CSS only, deliberately. A theme reaches the page through `webContents.insertCSS()` and
 * never through a string-built `<script>`, so a theme cannot execute anything — which is
 * what lets themes be installed by dropping a file in a folder while plugins, when they
 * arrive, will need a capability contract and a warning.
 *
 * The one hard rule for theme authors: style what is there, never restructure it. v0.7.x's
 * equivalent set `innerHTML` on SoundCloud's nav items; the shipped `minimal-nav` theme gets
 * the same look from `::before` pseudo-elements, which add no node to their document. A
 * selector that stops matching is then a cosmetic no-op rather than a broken page.
 */

/**
 * A loaded theme: everything the settings panel sees, plus the stylesheet only main needs.
 * The id is the filename stem, so `minimal-nav.css` is selected as `minimal-nav`.
 */
export interface Theme extends ThemeSummary {
  readonly css: string
}

/** The id meaning "no theme". Never a file, so it can never be shadowed by one. */
export const NO_THEME = 'vanilla'

/** Where built-in themes live, next to the ad-blocking engine. */
function builtInDir(): string {
  return join(import.meta.dirname, '../../resources/themes')
}

/** Where a user's own themes live. Created by the user, not by us. */
export function userThemeDir(): string {
  return join(app.getPath('userData'), 'themes')
}

function readDir(dir: string, builtIn: boolean): Theme[] {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.css'))
  } catch {
    // No themes folder is the normal case for a fresh profile, not an error.
    return []
  }

  const themes: Theme[] = []
  for (const file of files) {
    const id = file.replace(/\.css$/i, '')
    if (id === NO_THEME) continue // reserved

    try {
      const css = readFileSync(join(dir, file), 'utf8')
      themes.push({ id, css, builtIn, ...parseThemeMetadata(css, id) })
    } catch (error) {
      // One unreadable file must not cost the user every other theme.
      console.error(`[themes] could not read ${file}: ${String(error)}`)
    }
  }
  return themes
}

/**
 * Every theme available right now, built-in first.
 *
 * Read fresh each call rather than cached, so a theme author can save a file and pick it up
 * by reopening settings. That is deliberately not a file watcher: `fs.watch` fires two or
 * three times per editor save and needs a real trailing debounce to be usable, which is more
 * machinery than this needs before anyone has written a second theme.
 */
export function listThemes(): Theme[] {
  const user = readDir(userThemeDir(), false)
  const userIds = new Set(user.map((t) => t.id))
  // A user theme with the same id wins, so a shipped theme can be overridden by copying it
  // into the user folder and editing it — the obvious way to start writing one.
  return [...readDir(builtInDir(), true).filter((t) => !userIds.has(t.id)), ...user]
}

/** The CSS for a theme id, or empty for `vanilla` and for any id that no longer exists. */
export function themeCss(id: string): string {
  if (!id || id === NO_THEME) return ''
  const theme = listThemes().find((t) => t.id === id)
  if (!theme) {
    console.warn(`[themes] "${id}" is selected but no longer on disk — using no theme`)
    return ''
  }
  return theme.css
}
