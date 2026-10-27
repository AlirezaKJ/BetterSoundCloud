import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { parseThemeMetadata, splitThemeTargets } from '@shared/themes'
import type { ThemeSections, ThemeSummary } from '@shared/themes'
import type { PageTheme } from '@shared/page-theme'

/**
 * Themes: CSS files that restyle SoundCloud's page — and, through `@target` sections, our own
 * windows to match.
 *
 * A theme is a plain `.css` file with a metadata comment at the top. Two places are read:
 *
 *   resources/themes/       shipped with the app, read-only
 *   <userData>/themes/      the user's own, and where a theme author works
 *
 * CSS only, deliberately. A theme reaches a page through `webContents.insertCSS()` and never
 * through a string-built `<script>`, so a theme cannot execute anything — which is why themes
 * can be installed by dropping a file in a folder, while plugins need permissions and a warning.
 *
 * The one hard rule for theme authors: style what is there, never restructure it. v0.7.x's
 * equivalent set `innerHTML` on SoundCloud's nav items; the Minimal navigation switch gets the
 * same look from `::before` pseudo-elements, which add no node to their document. A selector that
 * stops matching is then a cosmetic no-op rather than a broken page.
 *
 * Authors' guide: docs/CUSTOM_THEMES.md.
 */

/**
 * A loaded theme: everything the settings panel sees, plus what only main needs. The id is the
 * filename stem, so `darkcloud.css` is selected as `darkcloud`.
 */
export interface Theme extends ThemeSummary {
  readonly css: string
  readonly sections: ThemeSections
  readonly file: string
}

/** The id meaning "no theme". Never a file, so it can never be shadowed by one. */
export const NO_THEME = 'vanilla'

/**
 * How long a burst of file events must go quiet before themes are re-read. An editor's save is
 * two or three events (truncate, write, rename); this turns them into one reload. A trailing
 * timer, not a microtask — soundcloud-rpc "debounced" with `Promise.resolve().then`, which
 * coalesces nothing across ticks, so every save reloaded two or three times.
 */
const RELOAD_DEBOUNCE_MS = 150

/** Where built-in themes live, next to the ad-blocking engine. */
function builtInDir(): string {
  return join(import.meta.dirname, '../../resources/themes')
}

/**
 * The CSS behind the Minimal navigation switch (`appearance.minimalNavigation`), or '' if it
 * cannot be read. It lives beside the themes rather than among them because it is not one: it
 * goes on top of whichever theme is selected. Read on every apply, like a theme, so editing it
 * in dev shows on the next settings change.
 */
export function minimalNavigationCss(): string {
  try {
    return readFileSync(join(import.meta.dirname, '../../resources/minimal-nav.css'), 'utf8')
  } catch {
    return ''
  }
}

/**
 * SoundCloud's own colours for one of its modes, scoped to the OTHER mode: the layer that goes
 * under a theme with `@mode`, so that theme looks the same whichever mode SoundCloud is in.
 * `resources/soundcloud-palette-dark.css` applies only while SoundCloud is light, and the light
 * one only while it is dark; each file says how it was measured. '' if it cannot be read.
 */
export function soundCloudPaletteCss(mode: PageTheme): string {
  try {
    return readFileSync(
      join(import.meta.dirname, `../../resources/soundcloud-palette-${mode}.css`),
      'utf8'
    )
  } catch {
    return ''
  }
}

/** Where a user's own themes live. */
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
  for (const name of files) {
    const id = name.replace(/\.css$/i, '')
    if (id === NO_THEME || !/^[\w.-]+$/.test(id)) continue // reserved, or not a safe name

    const file = join(dir, name)
    try {
      const css = readFileSync(file, 'utf8')
      themes.push({
        id,
        css,
        file,
        builtIn,
        overridesBuiltIn: false,
        sections: splitThemeTargets(css),
        ...parseThemeMetadata(css, id)
      })
    } catch (error) {
      // One unreadable file must not cost the user every other theme.
      console.error(`[themes] could not read ${name}: ${String(error)}`)
    }
  }
  return themes.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Every theme available right now, built-in first, read fresh from disk.
 *
 * A user theme with the same id as a built-in one takes its place — that is how "Make an
 * editable copy" works, and the obvious way to start writing a theme.
 */
export function listThemes(): Theme[] {
  const builtIn = readDir(builtInDir(), true)
  const builtInIds = new Set(builtIn.map((t) => t.id))
  const user = readDir(userThemeDir(), false).map((t) =>
    builtInIds.has(t.id) ? { ...t, overridesBuiltIn: true } : t
  )
  const userIds = new Set(user.map((t) => t.id))
  return [...builtIn.filter((t) => !userIds.has(t.id)), ...user]
}

/** The theme with this id, or null for `vanilla` and for an id that is no longer on disk. */
export function findTheme(id: string): Theme | null {
  if (!id || id === NO_THEME) return null
  const theme = listThemes().find((t) => t.id === id)
  if (!theme)
    console.warn(`[themes] "${id}" is selected but no longer on disk — using no theme`)
  return theme ?? null
}

/** The CSS for SoundCloud's page from a theme id, or empty. Kept for callers that need only that. */
export function themeCss(id: string): string {
  return findTheme(id)?.css ?? ''
}

/**
 * Copy a built-in theme into the user's folder, where it can be edited — and, having the same
 * id, immediately takes the built-in's place. Refuses to overwrite a copy that already exists,
 * so a second click cannot wipe someone's edits.
 */
export function copyThemeToUserFolder(id: string): string {
  const theme = listThemes().find((t) => t.id === id)
  if (!theme) throw new Error('That theme is no longer there.')
  if (!theme.builtIn) throw new Error('That theme is already one of yours.')
  const dir = userThemeDir()
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `${theme.id}.css`)
  if (existsSync(target)) throw new Error('There is already a copy in your themes folder.')
  copyFileSync(theme.file, target)
  return target
}

/** Open the user's themes folder, creating it first. Takes no path, so none can be passed in. */
export function openThemesFolder(): void {
  const dir = userThemeDir()
  mkdirSync(dir, { recursive: true })
  void shell.openPath(dir)
}

/**
 * Open one of the user's own theme files in whatever edits CSS on this computer. Only ids that
 * name a file in the user's folder: built-in themes live inside the app and are not editable.
 */
export function openThemeFile(id: string): void {
  const theme = listThemes().find((t) => t.id === id && !t.builtIn)
  if (theme) void shell.openPath(theme.file)
}

let watcher: FSWatcher | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Call `onChange` whenever a file in the user's themes folder changes — a save, a new theme, a
 * deleted one — once per burst of events. Creates the folder so there is something to watch;
 * an empty folder in the profile is harmless, and it is where "Open themes folder" leads.
 *
 * Built-in themes are not watched: they only change with a new build.
 */
export function watchUserThemes(onChange: () => void): void {
  if (watcher) return
  const dir = userThemeDir()
  try {
    mkdirSync(dir, { recursive: true })
    watcher = watch(dir, () => {
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        reloadTimer = null
        onChange()
      }, RELOAD_DEBOUNCE_MS)
    })
    watcher.on('error', (error) => {
      console.warn(`[themes] stopped watching the themes folder: ${String(error)}`)
      watcher?.close()
      watcher = null
    })
  } catch (error) {
    // Live reload is a convenience; without it themes still load when settings reopens.
    console.warn(`[themes] cannot watch ${dir}: ${String(error)}`)
  }
}
