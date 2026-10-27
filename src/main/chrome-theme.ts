import type { WebContentsView } from 'electron'
import type { ChromeView } from '@shared/themes'
import { isDev } from './env'

/**
 * A theme's `chrome` sections, applied to our own views: the bar, the settings panel, the
 * right-click menu, the status screen.
 *
 * Each view registers once, when it is created, saying which kind it is. From then on it gets
 * the current theme's CSS on every load, and again whenever the theme changes — without the view
 * code knowing anything about themes. The CSS reaches it through `insertCSS`, so our renderers'
 * Content-Security-Policy still decides what a theme can load in them: `data:` images yes,
 * anything from the network no.
 *
 * The overlays drawn on SoundCloud's own bars are not registered. They follow SoundCloud's
 * light/dark setting to match the bar under them (CLAUDE.md §6, "Two colour sources").
 */

type Entry = { kind: ChromeView; key: string | null; generation: number }

const views = new Map<WebContentsView, Entry>()
let cssFor: (kind: ChromeView) => string = () => ''

/** Theme this view, now and on every reload, until it is destroyed. */
export function themeChromeView(view: WebContentsView, kind: ChromeView): void {
  const entry: Entry = { kind, key: null, generation: 0 }
  views.set(view, entry)
  view.webContents.on('did-finish-load', () => {
    // The key is kept on purpose: a sheet inserted while the view was loading belongs to this
    // document, and forgetting its key would leave it stuck under every later theme. Removing a
    // key the new document never had is a no-op.
    void apply(view, entry)
  })
  view.webContents.once('destroyed', () => views.delete(view))
}

/** Switch every themed view to a new theme. `css` answers what each kind of view should get. */
export function setChromeTheme(css: (kind: ChromeView) => string): void {
  cssFor = css
  for (const [view, entry] of views) void apply(view, entry)
}

/**
 * Insert the new stylesheet first, then remove the old one. The other order leaves a frame in
 * which the view has no theme at all, which shows as a flash every time a theme file is saved.
 */
async function apply(view: WebContentsView, entry: Entry): Promise<void> {
  const generation = ++entry.generation
  const { webContents } = view
  if (webContents.isDestroyed()) return

  const css = cssFor(entry.kind)
  const previous = entry.key
  const key = css
    ? await webContents.insertCSS(css).catch((error: unknown) => {
        if (isDev) console.log(`[theme] ${entry.kind}: could not insert the theme:`, error)
        return null
      })
    : null
  if (isDev) console.log(`[theme] ${entry.kind}: ${css ? `${css.length} bytes` : 'no theme'}`)

  // A newer call owns this view's stylesheet now; drop ours rather than leak it.
  if (generation !== entry.generation) {
    if (key) void webContents.removeInsertedCSS(key).catch(() => undefined)
    return
  }
  entry.key = key
  if (previous && !webContents.isDestroyed()) {
    await webContents.removeInsertedCSS(previous).catch(() => undefined)
  }
}
