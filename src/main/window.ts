import { join } from 'node:path'
import { BaseWindow, WebContentsView, nativeTheme } from 'electron'
import type { BrowserWindow } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { hardenSession, routeNewWindowsToBrowser } from './session'
import { attachDiagnostics } from './diagnostics'
import { attachBlocker } from './blocker'
import { isDev } from './env'
import {
  backgroundCss,
  buildContentCss,
  COMPACT_HEADER_WIDTH,
  FIT_HEADER_WIDTH,
  MIN_EMBED_WIDTH,
  pictureCss
} from './content-css'
import type { BackgroundOptions } from './content-css'
import { findTheme, minimalNavigationCss, NO_THEME, soundCloudPaletteCss } from './themes'
import { themeChromeView } from './chrome-theme'
import { setLyricsOpen } from './lyrics'
import { contentCssOf, coverCss } from '@shared/themes'
import { overlayTheme } from '@shared/page-theme'
import type { PageTheme } from '@shared/page-theme'
import { hidesPage } from '@shared/page-status'
import type { PageStatus } from '@shared/page-status'
import type { Identity } from '@shared/identity'
import type { ContextMenuRequest } from '@shared/context-menu'
import { CH } from '@shared/ipc'
import type { NavState, WindowState } from '@shared/ipc'

export const HEADER_HEIGHT = 32

export const START_URL = 'https://soundcloud.com/discover'

/**
 * How long to wait for our own chrome before showing the window anyway. A normal launch paints
 * the header well inside this; a broken one is shown before the user decides nothing happened
 * and launches again — which the single-instance lock turns into a silent no-op.
 */
const SHOW_TIMEOUT_MS = 3_000

/**
 * Our chrome is a separate view stacked above SoundCloud, never injected into it.
 *
 * This is the rule that makes the "never write into SoundCloud's DOM" contract
 * affordable rather than feature-destroying. v0.7.x put its window controls inside
 * SoundCloud's own `.header__navMenu` (plugins/SCI.js), so a class rename there became
 * an exception storm; here it is nothing at all.
 */
export type Shell = {
  window: BaseWindow
  header: WebContentsView
  content: WebContentsView
  /**
   * Created the first time the user opens settings, then kept. Null means closed.
   * Building it lazily keeps a renderer process out of startup for a panel most
   * launches never open.
   */
  settings: WebContentsView | null
  /**
   * The window buttons drawn over SoundCloud's own header. Exists only while the
   * BetterSoundCloud bar is hidden. See `setContentAppearance`.
   */
  embedded: WebContentsView | null
  /** True while the 32px bar is hidden and SoundCloud owns the whole window. */
  hideMenuBar: boolean
  /** Key returned by `insertCSS` for our page stylesheet, so it can be removed. */
  reservationKey: string | null
  /**
   * Whether SoundCloud's centred 1240px layout is overridden to fill the window. Held here
   * so the reload handler can re-apply it without window.ts needing to read settings.
   */
  fullWidthLayout: boolean
  /** Our buttons over the right end of SoundCloud's play controls, when the setting is on. */
  player: WebContentsView | null
  /**
   * The right-click menu: a transparent view covering the content area, created once by
   * `attachContextMenu` and hidden between uses so a menu appears the instant it is asked
   * for. Everything about it lives in context-menu.ts; this file only keeps it positioned.
   */
  contextMenu: WebContentsView | null
  /** The right-click the menu is open for, so main can act on it. Null while hidden. */
  contextMenuRequest: ContextMenuRequest | null
  /**
   * Our page-status view over the content area: what is going on while SoundCloud's page
   * cannot be shown. Exists only while it has something to say. See page-status.ts.
   */
  status: WebContentsView | null
  /**
   * The lyrics pane, docked at the right of SoundCloud's page between its header and play bar.
   * Exists only while open (`toggleLyrics`); what it shows comes from main/lyrics.ts.
   */
  lyrics: WebContentsView | null
  /** What that view is saying. Null while SoundCloud's page is showing normally. */
  pageStatus: PageStatus | null
  /**
   * SoundCloud's own light/dark setting, as last reported by the content preload. Held so an
   * overlay created after the page loaded can be told straight away rather than sitting in
   * the wrong colours until the user next flips the setting.
   */
  pageTheme: PageTheme
  /**
   * The selected theme's `@mode`, or null. A theme with a mode paints SoundCloud's bars for that
   * mode in either of SoundCloud's, so the overlays follow it instead (`overlayTheme`).
   */
  themeMode: PageTheme | null
  /**
   * Whether the embedded overlay is actually on screen. Distinct from `hideMenuBar`: the
   * setting can be on while the window is too narrow to honour it. The stylesheet's
   * reservation follows THIS, so the gap and the buttons can never disagree.
   */
  embeddedShowing: boolean
  /**
   * Whether SoundCloud's promo links are being hidden to free the width our buttons need.
   * Width-driven and temporary, unlike a theme doing the same thing by choice.
   */
  compactHeader: boolean
  /**
   * Whether their header is additionally being forced down to the viewport, below the width
   * at which it stops shrinking on its own.
   */
  fitHeader: boolean
  /** Selected theme id. Held here for the same reason as `fullWidthLayout`: the reload
   *  handler re-injects the stylesheet and needs to know what to put in it. */
  theme: string
  /** Whether the Minimal navigation switch is on. Held for the reload handler, like `theme`. */
  minimalNavigation: boolean
  /**
   * The user agent and languages every view's session gets. Kept so views created later —
   * settings, the overlays, the menu — are hardened with exactly the same identity.
   */
  identity: Identity
  /** Guards against two overlapping `applyContentCss` calls clobbering each other. */
  cssGeneration: number
  /**
   * The playing track's artwork, for themes' `--bsc-cover`, and the handle of the small
   * stylesheet that carries it. Kept apart from the main page stylesheet so a new track
   * replaces three lines, not the whole theme.
   */
  cover: string
  coverKey: string | null
  coverGeneration: number
  /** The Background setting: what goes behind the page, or null for nothing. */
  background: BackgroundOptions | null
  /**
   * The chosen background picture as a `data:` URI, or '' — and its own small stylesheet, for
   * the same reason as the cover's: it is a few hundred kilobytes, inserted once per picture
   * rather than with every settings change.
   */
  picture: string
  pictureKey: string | null
  pictureGeneration: number
  /** Re-runs the view layout. Assigned in `createShell`; call it after changing a mode. */
  layout: () => void
}

/**
 * SoundCloud's header, measured on the live site: `position: fixed`, 46 CSS px tall,
 * `z-index: 1000`, background `#121212`, and it never hides on scroll. The z-index does
 * not matter to us — our view is a separate compositing layer, not a stacking context
 * inside their page.
 */
const SC_HEADER_HEIGHT = 46

/**
 * Window pixels reserved at the right end of SoundCloud's header: four 30px buttons and
 * their gaps (132px) plus a 12px breathing gap, so our controls sit close enough to
 * SoundCloud's own icons to read as part of the same bar.
 *
 * The reservation and the overlay are deliberately the same number. If the reservation
 * were smaller, SoundCloud's own controls would slide underneath the transparent part of
 * our view — visible, but dead to clicks, which is worse than a gap.
 *
 * Drag comes from SoundCloud's header instead of from empty space here; see
 * `applyContentCss`.
 */
// macOS only needs the restore-bar button here; its native controls live on the left.
const EMBEDDED_WIDTH = process.platform === 'darwin' ? 50 : 144

/**
 * SoundCloud's play controls bar, and the strip we take at its right-hand end.
 *
 * Measured on the live page: the bar is 48 CSS px tall, and its right end holds like (40),
 * follow (40) and queue (24), finishing 16px short of the edge because
 * `.playControls__wrapper` already carries that much padding. Our two 30px buttons plus the
 * gap between them need 78; 92 keeps a comfortable margin and, as with the header, the
 * reservation must never be narrower than the overlay or their controls slide underneath a
 * transparent view — visible, but dead to clicks.
 */
const PLAY_CONTROLS_HEIGHT = 48
const PLAYER_BUTTONS_WIDTH = 92

export function createShell(identity: Identity): Shell {
  const state = windowStateKeeper({ defaultWidth: 1366, defaultHeight: 768 })

  const window = new BaseWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    // The same number as MIN_EMBED_WIDTH, whose doc comment asserts they are equal.
    minWidth: MIN_EMBED_WIDTH,
    minHeight: 600,
    frame: process.platform === 'darwin',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 9 } }
      : {}),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#f2f2f2',
    title: 'BetterSoundCloud'
  })

  const header = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })

  const content = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/content.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      nodeIntegrationInSubFrames: false,
      devTools: isDev
    }
  })

  // Take the session BY REFERENCE off the view. Never `session.defaultSession`, never a
  // partition string — see the note in session.ts.
  hardenSession(content.webContents.session, identity)
  hardenSession(header.webContents.session, identity)
  routeNewWindowsToBrowser(content.webContents)
  routeNewWindowsToBrowser(header.webContents)

  window.contentView.addChildView(content)
  window.contentView.addChildView(header)
  themeChromeView(header, 'header')

  const shell: Shell = {
    window,
    header,
    content,
    settings: null,
    embedded: null,
    player: null,
    contextMenu: null,
    contextMenuRequest: null,
    status: null,
    lyrics: null,
    pageStatus: null,
    pageTheme: 'dark',
    themeMode: null,
    embeddedShowing: false,
    compactHeader: false,
    fitHeader: false,
    hideMenuBar: false,
    reservationKey: null,
    cssGeneration: 0,
    cover: '',
    coverKey: null,
    coverGeneration: 0,
    background: null,
    picture: '',
    pictureKey: null,
    pictureGeneration: 0,
    fullWidthLayout: false,
    theme: NO_THEME,
    minimalNavigation: false,
    identity,
    layout: () => {}
  }

  const layout = (): void => {
    const { width, height } = window.getContentBounds()

    // This function is the ONLY place that decides how narrow is too narrow. Three booleans
    // come out of one width, and the stylesheet is re-injected below whenever any of them
    // flips — the CSS is not width-reactive on its own, deliberately. An earlier version put
    // the reservation behind a media query and kept a second, stricter JS threshold for the
    // overlay, and the band between the two was a bug in both directions: our buttons on top
    // of SoundCloud's controls at one width, a reserved gap with no buttons in it at another.
    //
    // `hideMenuBar` is the user's setting; `embeddedShows` is whether it can be honoured. Below
    // MIN_EMBED_WIDTH it cannot, so the setting stays on and the effect falls back to our own
    // bar, which carries the same buttons. Nothing is destroyed on the way through.
    //
    // A page status that covers SoundCloud's page counts as "no room" too. Their header is not
    // on screen then, so buttons drawn over it would float over our message instead, with no
    // drag region behind them. Our own bar takes over until the page is back.
    const cssWidth = pageCssWidth(shell)
    const pageHidden = shell.pageStatus !== null && hidesPage(shell.pageStatus)
    const embeddedShows = shell.hideMenuBar && cssWidth >= MIN_EMBED_WIDTH && !pageHidden
    const compactHeader = embeddedShows && cssWidth < COMPACT_HEADER_WIDTH
    const fitHeader = embeddedShows && cssWidth < FIT_HEADER_WIDTH
    const strip = embeddedShows ? 0 : HEADER_HEIGHT
    if (process.platform === 'darwin') {
      // Native buttons stay on the left in both header modes; their coordinates are
      // window pixels, even when SoundCloud's header is zoomed.
      const barHeight = embeddedShows
        ? SC_HEADER_HEIGHT * content.webContents.getZoomFactor()
        : HEADER_HEIGHT
      window.setWindowButtonPosition({ x: 12, y: Math.round((barHeight - 14) / 2) })
    }

    // Hidden, not merely flattened to zero height.
    //
    // A zero-height view stops painting, but the page inside it keeps its own layout, and
    // Header.svelte declares `-webkit-app-region: drag` over a bar with a FIXED 32px height.
    // Chromium hands that draggable region to the window WITHOUT clipping it to the view's
    // bounds, so collapsing the view left a full-width 32px strip across the top of
    // SoundCloud that swallowed every mouse-down: their nav links and search box were dead
    // above y=32 and worked below it. Measured, not guessed — clicks at y<32 never reached
    // the document at all.
    //
    // `setVisible(false)` withdraws the region, and unlike removing the child view it keeps
    // the view parented with its renderer and IPC subscriptions alive, so toggling the bar
    // back is still instant and reloads nothing.
    header.setVisible(!embeddedShows)
    header.setBounds({ x: 0, y: 0, width, height: strip })
    content.setBounds({ x: 0, y: strip, width, height: height - strip })
    // The settings panel only exists while it is open, so check before resizing it.
    if (shell.settings) fitBelowHeader(window, shell.settings, strip)
    // The menu view is attached after the shell is built, so it too can be absent here.
    if (shell.contextMenu) fitBelowHeader(window, shell.contextMenu, strip)
    // The page-status view covers exactly what SoundCloud's page does.
    if (shell.status) fitBelowHeader(window, shell.status, strip)
    if (shell.embedded) {
      shell.embedded.setVisible(embeddedShows)
      fitOverSoundCloudHeader(shell, embeddedShows)
    }
    // Both overlays, every layout. Dropping this line once was a real regression: the player
    // buttons are anchored to `width - 92` and `height - barHeight`, so after any resize they
    // sat over the wrong part of SoundCloud's play bar, covering their like/follow/queue
    // controls with a transparent view. Zoom was worse — `applyContentCss` recomputes the
    // reservation from the new zoom factor while nothing recomputed the overlay's height, so
    // the two disagreed by construction.
    if (shell.player) {
      // Hidden while the page is, for the same reason as the header overlay above.
      shell.player.setVisible(!pageHidden)
      fitOverPlayControls(shell)
    }
    // The lyrics pane sits on SoundCloud's page, so it goes with the page too.
    if (shell.lyrics) {
      shell.lyrics.setVisible(!pageHidden)
      fitLyricsPane(shell, strip)
    }

    // Only when it actually flips — crossing the width is rare, and re-injecting on every
    // resize tick would rebuild the whole stylesheet dozens of times during a drag.
    // Only when one of them actually flips — crossing a width is rare, and re-injecting on
    // every resize tick would rebuild the whole stylesheet dozens of times during a drag.
    if (
      embeddedShows !== shell.embeddedShowing ||
      compactHeader !== shell.compactHeader ||
      fitHeader !== shell.fitHeader
    ) {
      shell.embeddedShowing = embeddedShows
      shell.compactHeader = compactHeader
      shell.fitHeader = fitHeader
      void applyContentCss(shell, shell.fullWidthLayout, shell.theme)
    }
  }
  shell.layout = layout
  layout()
  window.on('resize', layout)

  void header.webContents.loadURL(rendererUrl('header'))
  // SoundCloud is NOT loaded here. Its page may only load once Widevine is registered, which on
  // a first launch can take a while, and the window should not wait for that — index.ts calls
  // `loadSoundCloud` when it is ready.

  wireStateEvents(shell)

  // Not dev-gated: the listener is the only thing that can filter a request, and it
  // must exist in production for the setting to do anything.
  attachBlocker(shell)

  if (isDev) {
    enableDevToolsShortcut(header, content)
    attachDiagnostics(content)
  }

  showWhenChromeIsReady(window, header)

  // electron-window-state is typed against BrowserWindow, but it only calls getBounds,
  // isMaximized, isFullScreen and on(), all of which BaseWindow has. The cast is safe;
  // there is no BaseWindow-aware version of the package.
  state.manage(window as unknown as BrowserWindow)

  return shell
}

/** Start SoundCloud in the content view. Only once Widevine is ready — see index.ts. */
export function loadSoundCloud(shell: Shell): void {
  // The promise rejects when the load fails; page-status.ts handles that from `did-fail-load`.
  shell.content.webContents.loadURL(START_URL).catch(() => undefined)
}

/**
 * Show the window once our header has painted, so nobody sees an unpainted frame — but never
 * wait on it forever.
 *
 * BaseWindow has no `ready-to-show` (that is a BrowserWindow event), so this used to be a bare
 * `once('did-finish-load', show)`, the only call to `window.show()` in the app. When the header
 * never finished — a file missing from a broken install, an asar integrity failure, a renderer
 * crash before first paint — the process ran on invisibly, holding the single-instance lock,
 * and only Task Manager could end it. A window with a blank strip is a bug report; an invisible
 * one is "the app does nothing".
 */
function showWhenChromeIsReady(window: BaseWindow, header: WebContentsView): void {
  let shown = false
  const show = (problem: string): void => {
    if (shown) return
    shown = true
    clearTimeout(timer)
    if (problem) console.error(`[window] showing without our header: ${problem}`)
    if (!window.isDestroyed()) window.show()
  }

  const timer = setTimeout(
    () => show(`it had not loaded after ${SHOW_TIMEOUT_MS}ms`),
    SHOW_TIMEOUT_MS
  )
  header.webContents.once('did-finish-load', () => show(''))
  header.webContents.once('did-fail-load', (_event, code, error) =>
    show(`it failed to load (${code} ${error})`)
  )
  header.webContents.once('render-process-gone', (_event, details) =>
    show(`its renderer ended (${details.reason})`)
  )
}

/**
 * Show or hide the settings panel.
 *
 * The panel is its own `WebContentsView` covering the content area, stacked above
 * SoundCloud and below nothing. Opening it does not navigate, reload or pause the
 * SoundCloud view — that keeps playing underneath.
 *
 * Why a separate view rather than markup in the header: the header is 32px and is a
 * window drag region, so growing it to full height would make the whole panel draggable.
 * A separate view also cannot be reached by anything running on soundcloud.com.
 */
export function toggleSettings(shell: Shell): void {
  if (shell.settings) {
    closeSettings(shell)
    return
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })

  hardenSession(view.webContents.session, shell.identity)
  routeNewWindowsToBrowser(view.webContents)

  // Transparent so the panel can animate itself in over a dimmed SoundCloud rather than
  // the whole view snapping in as an opaque rectangle. A native view's bounds cannot be
  // tweened smoothly, so all the motion happens in CSS inside the page.
  view.setBackgroundColor('#00000000')

  shell.settings = view
  shell.window.contentView.addChildView(view)
  themeChromeView(view, 'settings')
  // `embeddedShowing`, not `hideMenuBar`: those differ in exactly the fallback case, where the
  // setting is on but the window is too narrow to honour it. Re-deriving it here would place
  // the panel at y=0 over our own bar — including the window buttons — until the next resize.
  // A second place deciding "is our bar showing" is the fault this whole change removed.
  fitBelowHeader(shell.window, view, shell.embeddedShowing ? 0 : HEADER_HEIGHT)

  if (isDev) enableDevToolsShortcut(view)

  void view.webContents.loadURL(rendererUrl('settings'))

  // Focus it so Escape and Tab reach the panel without the user clicking first. The
  // renderer owns Escape, because it also has to play the exit animation before the view
  // is destroyed.
  view.webContents.once('did-finish-load', () => view.webContents.focus())
}

export function closeSettings(shell: Shell): void {
  const view = shell.settings
  if (!view) return

  shell.settings = null
  shell.window.contentView.removeChildView(view)
  // Destroy rather than keep it hidden: a settings panel is opened rarely and briefly,
  // so holding a renderer process for the rest of the session is the wrong trade.
  view.webContents.close()
}

/*
 * ── Window controls drawn inside SoundCloud's header ───────────────────────────────
 *
 * v0.7.x produced this look by inserting <li> elements into SoundCloud's React-managed
 * header and overwriting innerHTML on live nodes. That is what broke on every SoundCloud
 * release, and when a selector went stale it threw once a second forever.
 *
 * The same pixels, without the DOM: a small transparent WebContentsView composited over
 * their header, plus one CSS-only rule that reserves the space it sits in. SoundCloud's
 * document is never touched — `insertCSS` adds a stylesheet, not a node.
 *
 * When the reservation rule stops matching, our buttons overlap SoundCloud's own controls.
 * That is cosmetic and recoverable; nothing throws, nothing loops, and the window buttons
 * still work. The difference between those two failure modes is the whole reason this is
 * allowed under the safety contract.
 */

/** Position the overlay over the right end of SoundCloud's header. */
/**
 * The page's own width in CSS pixels, which is what every layout decision here is about.
 *
 * Not the window's width: the page is zoomable and these overlay views are not, so an 800px
 * window at 150% zoom is a 533 CSS px page.
 */
function pageCssWidth(shell: Shell): number {
  const { width } = shell.window.getContentBounds()
  return width / shell.content.webContents.getZoomFactor()
}

function fitOverSoundCloudHeader(shell: Shell, showing: boolean): void {
  const view = shell.embedded
  if (!view) return

  const { width } = shell.window.getContentBounds()
  // The content view is zoomable, so SoundCloud's 46 CSS px header occupies 46 * zoom
  // window pixels. Our overlay is not zoomed, so it has to follow.
  const zoom = shell.content.webContents.getZoomFactor()

  view.setBounds({
    x: Math.round(width - EMBEDDED_WIDTH),
    y: showing ? 0 : HEADER_HEIGHT,
    width: EMBEDDED_WIDTH,
    height: Math.round(SC_HEADER_HEIGHT * zoom)
  })
}

/**
 * Push the current appearance into SoundCloud's page as one stylesheet.
 *
 * Re-applied on every load because `insertCSS` lasts for the life of one document, not
 * the session. The rules themselves live in content-css.ts, which is pure and tested;
 * this function only decides what to pass it and owns the handle for removing it again.
 */
async function applyContentCss(shell: Shell, fullWidth: boolean, theme: string): Promise<void> {
  const { webContents } = shell.content

  // Two calls can be in flight at once — `setContentAppearance` triggers one, and a resize
  // that crosses the width threshold triggers another. Both await, so without this the older
  // call could insert its stylesheet after the newer one and win.
  const generation = ++shell.cssGeneration
  if (webContents.isDestroyed()) return

  // The new stylesheet goes in BEFORE the old one comes out. Removing first left a frame with
  // no stylesheet at all, so every theme switch, theme save and narrow-window step flashed
  // SoundCloud's own look.
  const previous = shell.reservationKey

  // Reserved space is measured in window pixels, but the rule lands inside a page that
  // may be zoomed, so convert before writing it.
  const zoom = webContents.getZoomFactor()
  // `embeddedShowing`, not `embedded`: the view exists whenever the setting is on, but it is
  // only on screen when the window is wide enough. Reserving for a hidden overlay is the gap
  // with no buttons in it.
  const reserve = shell.embeddedShowing ? Math.round(EMBEDDED_WIDTH / zoom) : null
  const playerReserve = shell.player ? Math.round(PLAYER_BUTTONS_WIDTH / zoom) : null
  const compactHeader = shell.compactHeader
  const fitHeader = shell.fitHeader

  // Read once: the theme's page CSS, and SoundCloud's palette for the mode it was made for.
  const selected = theme === NO_THEME ? null : findTheme(theme)

  const key = await webContents
    .insertCSS(
      buildContentCss({
        fullWidth,
        reserve,
        nativeControlsReserve: process.platform === 'darwin' ? Math.ceil(80 / zoom) : 0,
        palette: selected?.mode ? soundCloudPaletteCss(selected.mode) : '',
        theme: selected ? contentCssOf(selected.sections) : '',
        minimalNavigation: shell.minimalNavigation ? minimalNavigationCss() : '',
        background: shell.background ? backgroundCss(shell.background) : '',
        playerReserve,
        compactHeader,
        fitHeader
      })
    )
    .catch(() => null)

  if (generation !== shell.cssGeneration) {
    // A newer call owns the stylesheet now; drop ours rather than leaking it.
    if (key) void webContents.removeInsertedCSS(key).catch(() => undefined)
    return
  }
  shell.reservationKey = key
  if (previous) await webContents.removeInsertedCSS(previous).catch(() => undefined)
}

/**
 * Tell themes what is playing: `--bsc-cover` becomes the track's artwork. Called when the
 * artwork changes, which is once per track, not once per clock tick.
 */
export function setContentCover(shell: Shell, artwork: string): void {
  if (artwork === shell.cover) return
  shell.cover = artwork
  void applyCover(shell)
}

async function applyCover(shell: Shell): Promise<void> {
  const { webContents } = shell.content
  const generation = ++shell.coverGeneration
  if (webContents.isDestroyed()) return
  const previous = shell.coverKey
  const key = await webContents.insertCSS(coverCss(shell.cover)).catch(() => null)
  if (generation !== shell.coverGeneration) {
    if (key) void webContents.removeInsertedCSS(key).catch(() => undefined)
    return
  }
  shell.coverKey = key
  if (previous) await webContents.removeInsertedCSS(previous).catch(() => undefined)
}

/**
 * The background picture changed (or was switched on or off): replace its sheet. '' removes it,
 * so a picture nobody is looking at does not sit in the page's memory.
 */
export function setContentPicture(shell: Shell, dataUri: string): void {
  if (dataUri === shell.picture) return
  shell.picture = dataUri
  void applyPicture(shell)
}

async function applyPicture(shell: Shell): Promise<void> {
  const { webContents } = shell.content
  const generation = ++shell.pictureGeneration
  if (webContents.isDestroyed()) return
  const previous = shell.pictureKey
  const key = shell.picture
    ? await webContents.insertCSS(pictureCss(shell.picture)).catch(() => null)
    : null
  if (generation !== shell.pictureGeneration) {
    if (key) void webContents.removeInsertedCSS(key).catch(() => undefined)
    return
  }
  shell.pictureKey = key
  if (previous) await webContents.removeInsertedCSS(previous).catch(() => undefined)
}

/**
 * Apply both page-appearance settings together.
 *
 * One entry point rather than two, because the overlay and the stylesheet have to agree:
 * the reservation rule only belongs in the page while the overlay actually exists, and
 * both depend on the current zoom factor. Safe to call repeatedly with the same values —
 * `applyLiveSettings` calls it on every settings change.
 */
export function setContentAppearance(
  shell: Shell,
  options: {
    hideMenuBar: boolean
    fullWidth: boolean
    theme: string
    minimalNavigation: boolean
    background: BackgroundOptions | null
    playerButtons: boolean
  }
): void {
  shell.fullWidthLayout = options.fullWidth
  shell.theme = options.theme
  shell.minimalNavigation = options.minimalNavigation
  shell.background = options.background
  shell.hideMenuBar = options.hideMenuBar
  setThemeMode(
    shell,
    options.theme === NO_THEME ? null : (findTheme(options.theme)?.mode ?? null)
  )

  // The embedded bar exists exactly while our own bar is hidden — it carries the only
  // way back, so the two states are one thing, not two settings that could disagree.
  setEmbedded(shell, options.hideMenuBar)
  setPlayerButtons(shell, options.playerButtons)
  shell.layout()
  void applyContentCss(shell, options.fullWidth, options.theme)
}

function setEmbedded(shell: Shell, enabled: boolean): void {
  if (enabled === !!shell.embedded) return

  if (!enabled) {
    const view = shell.embedded
    shell.embedded = null
    if (view) {
      shell.window.contentView.removeChildView(view)
      view.webContents.close()
    }
    return
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })

  hardenSession(view.webContents.session, shell.identity)
  routeNewWindowsToBrowser(view.webContents)
  // Transparent, so SoundCloud's own header shows through behind the glyphs and the two
  // read as a single bar.
  view.setBackgroundColor('#00000000')

  shell.embedded = view
  shell.window.contentView.addChildView(view)
  // Position and visibility are `layout()`'s job — it is called immediately after this, and
  // it owns the "is there room for the overlay" decision. Placing the view here as well would
  // mean two places deciding, which is how the two got out of step in the first place.
  sendPageThemeOnLoad(shell, view)

  void view.webContents.loadURL(rendererUrl('embedded'))
}

/**
 * Position our buttons over the right end of SoundCloud's play controls.
 *
 * Anchored to the bottom of the window rather than the top: the play bar is the last 48 CSS
 * px of the content view, and the content view runs to the window's bottom edge whether or
 * not our own bar is showing. Height follows the zoom factor for the same reason the header
 * overlay's does — SoundCloud's 48 CSS px is 48 * zoom window pixels, and this view is not
 * zoomed.
 */
function fitOverPlayControls(shell: Shell): void {
  const view = shell.player
  if (!view) return

  const { width, height } = shell.window.getContentBounds()
  const zoom = shell.content.webContents.getZoomFactor()
  const barHeight = Math.round(PLAY_CONTROLS_HEIGHT * zoom)

  const bounds = {
    x: Math.round(width - PLAYER_BUTTONS_WIDTH),
    y: height - barHeight,
    width: PLAYER_BUTTONS_WIDTH,
    height: barHeight
  }
  view.setBounds(bounds)

  // A new overlay over somebody else's bar is exactly the kind of thing that is easier to
  // check from a number than from a screenshot.
  if (isDev) console.log('[player] buttons at ' + JSON.stringify(bounds))
}

/**
 * Create or destroy the play-control buttons.
 *
 * Deliberately a separate switch from `setEmbedded`. The header overlay exists exactly while
 * our own bar is hidden — the two are one state, because that overlay carries the only way
 * back. These buttons are not part of that: they are their own setting, and they stay put
 * whether the BetterSoundCloud bar is showing or not.
 */
function setPlayerButtons(shell: Shell, enabled: boolean): void {
  if (enabled === !!shell.player) return

  if (!enabled) {
    const view = shell.player
    shell.player = null
    if (view) {
      shell.window.contentView.removeChildView(view)
      view.webContents.close()
    }
    return
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })

  hardenSession(view.webContents.session, shell.identity)
  routeNewWindowsToBrowser(view.webContents)
  // Transparent, so SoundCloud's player bar shows through behind the glyphs.
  view.setBackgroundColor('#00000000')

  shell.player = view
  shell.window.contentView.addChildView(view)
  fitOverPlayControls(shell)
  sendPageThemeOnLoad(shell, view)
  view.webContents.once('did-finish-load', () => sendLyricsShown(shell))

  void view.webContents.loadURL(rendererUrl('player'))
}

/*
 * ── The lyrics pane ────────────────────────────────────────────────────────────────────────
 *
 * Docked at the right of SoundCloud's page, from under its header to above its play bar, so the
 * page stays usable beside it and the player stays reachable below. Opaque and flat: it does not
 * float or take over input, so it has no shadow and no scrim (DESIGN.md "Lyrics pane").
 */

/** The pane's width in window pixels: a column of lines, not a page. */
export const LYRICS_WIDTH = 360

export function toggleLyrics(shell: Shell): void {
  if (shell.lyrics) closeLyrics(shell)
  else openLyrics(shell)
}

function openLyrics(shell: Shell): void {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })
  hardenSession(view.webContents.session, shell.identity)
  routeNewWindowsToBrowser(view.webContents)
  // The pane's own colour while its page loads, so it does not flash white in the dark.
  view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#121212' : '#f2f2f2')

  shell.lyrics = view
  const views = shell.window.contentView
  views.addChildView(view)
  // Adding a view puts it on top; the settings panel and the right-click menu must stay above
  // the pane, and adding a view that is already there only moves it to the top.
  for (const above of [shell.settings, shell.contextMenu]) if (above) views.addChildView(above)
  themeChromeView(view, 'lyrics')
  shell.layout()

  if (isDev) enableDevToolsShortcut(view)
  void view.webContents.loadURL(rendererUrl('lyrics'))
  // Focused, so Escape closes it straight away, as it does the settings panel.
  view.webContents.once('did-finish-load', () => {
    if (!view.webContents.isDestroyed()) view.webContents.focus()
  })
  setLyricsOpen(true)
  sendLyricsShown(shell)
}

export function closeLyrics(shell: Shell): void {
  const view = shell.lyrics
  if (!view) return
  shell.lyrics = null
  shell.window.contentView.removeChildView(view)
  // Destroyed rather than hidden, like settings: opened now and then, and a renderer held for
  // the rest of the session is the wrong trade. Its state lives in main.
  view.webContents.close()
  setLyricsOpen(false)
  sendLyricsShown(shell)
  // Back to SoundCloud, so the keyboard works there again without a click.
  if (!shell.content.webContents.isDestroyed()) shell.content.webContents.focus()
}

/** Under SoundCloud's header, above its play bar, at the right edge. Both bars follow the zoom. */
function fitLyricsPane(shell: Shell, strip: number): void {
  const view = shell.lyrics
  if (!view) return
  const { width, height } = shell.window.getContentBounds()
  const zoom = shell.content.webContents.getZoomFactor()
  const top = strip + Math.round(SC_HEADER_HEIGHT * zoom)
  const bottom = Math.round(PLAY_CONTROLS_HEIGHT * zoom)
  // Never more than two fifths of a narrow window, so SoundCloud keeps the larger share.
  const paneWidth = Math.round(Math.min(LYRICS_WIDTH, width * 0.4))
  view.setBounds({
    x: width - paneWidth,
    y: top,
    width: paneWidth,
    height: Math.max(0, height - top - bottom)
  })
}

/** Tell the player-bar buttons whether the pane is open, so the lyrics button shows it. */
function sendLyricsShown(shell: Shell): void {
  const view = shell.player
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.send(CH.lyricsShown, shell.lyrics !== null)
  }
}

/**
 * Give a freshly created overlay the current page theme once it can receive it.
 *
 * `once('did-finish-load')` rather than sending immediately: the view is created and the
 * message would be sent before its renderer exists to hear it, and the overlay would then
 * stay in the default colours until SoundCloud's theme next changed — which for most users
 * is never.
 */
function sendPageThemeOnLoad(shell: Shell, view: WebContentsView): void {
  view.webContents.once('did-finish-load', () => {
    if (!view.webContents.isDestroyed()) {
      view.webContents.send(CH.pageThemeChanged, overlayTheme(shell.pageTheme, shell.themeMode))
    }
  })
}

/**
 * SoundCloud's own light/dark choice, as the content preload reported it. The overlays drawn on
 * top of their page follow it — unless the selected theme has a `@mode`, which wins.
 *
 * Only the overlays: our own header and settings panel are our surfaces and follow the
 * user's `appearance.colorScheme`, not SoundCloud's.
 */
export function setPageTheme(shell: Shell, theme: PageTheme): void {
  if (isDev && theme !== shell.pageTheme) console.log(`[theme] SoundCloud page is ${theme}`)
  const before = overlayTheme(shell.pageTheme, shell.themeMode)
  shell.pageTheme = theme
  sendOverlayTheme(shell, before)
}

/** The selected theme's `@mode` changed (or the theme did): the overlays may need new colours. */
function setThemeMode(shell: Shell, mode: PageTheme | null): void {
  if (mode === shell.themeMode) return
  const before = overlayTheme(shell.pageTheme, shell.themeMode)
  shell.themeMode = mode
  sendOverlayTheme(shell, before)
}

/** Tell the overlays their colours, if they changed from `before`. */
function sendOverlayTheme(shell: Shell, before: PageTheme): void {
  const now = overlayTheme(shell.pageTheme, shell.themeMode)
  if (now === before) return
  if (isDev && shell.themeMode) console.log(`[theme] overlays follow the theme: ${now}`)
  for (const view of [shell.embedded, shell.player]) {
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.send(CH.pageThemeChanged, now)
    }
  }
}

/** The settings panel and the right-click menu occupy exactly the area the content view does. */
export function fitBelowHeader(window: BaseWindow, view: WebContentsView, top: number): void {
  const { width, height } = window.getContentBounds()
  view.setBounds({ x: 0, y: top, width, height: height - top })
}

function wireStateEvents(shell: Shell): void {
  const { window, header, content } = shell
  const sendNav = (): void => {
    const state: NavState = {
      canGoBack: content.webContents.navigationHistory.canGoBack(),
      canGoForward: content.webContents.navigationHistory.canGoForward()
    }
    if (!header.webContents.isDestroyed()) header.webContents.send(CH.navStateChanged, state)
  }

  const sendWindow = (): void => {
    const state: WindowState = {
      maximized: window.isMaximized(),
      focused: window.isFocused()
    }
    for (const view of [header, shell.embedded]) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.send(CH.windowStateChanged, state)
      }
    }
  }

  content.webContents.on('did-finish-load', () => {
    // Re-apply both sheets to the new document. The saved keys are NOT cleared first: a sheet
    // inserted while the page was still loading already belongs to this document, and clearing
    // its key orphaned it for good — the startup theme then stayed on the page under every theme
    // chosen after it (measured, 2026-10-27). Removing a key the document no longer has is a no-op.
    void applyContentCss(shell, shell.fullWidthLayout, shell.theme)
    void applyCover(shell)
    void applyPicture(shell)
  })

  content.webContents.on('did-navigate', sendNav)
  content.webContents.on('did-navigate-in-page', sendNav)
  header.webContents.on('did-finish-load', () => {
    sendNav()
    sendWindow()
  })

  window.on('maximize', sendWindow)
  window.on('unmaximize', sendWindow)
  window.on('focus', sendWindow)
  window.on('blur', sendWindow)

  // A failed load, a crash and a hang are page-status.ts's: it tells the user, not the console.
}

/**
 * Dev builds only: F12, or Ctrl/Cmd+Shift+I, opens DevTools for the view under the
 * cursor. The window is frameless and has no menu, so without this there is no way in.
 *
 * This uses `before-input-event` rather than `globalShortcut` on purpose. Global
 * shortcuts are system-wide and fire even when the app is not focused — v0.7.x
 * registered the media keys that way and never released them, so it held them for its
 * whole process lifetime (`main.js:174-192`).
 */
export function enableDevToolsShortcut(...views: WebContentsView[]): void {
  for (const view of views) {
    view.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return

      const f12 = input.key === 'F12'
      const inspect = (input.control || input.meta) && input.shift && input.key === 'I'

      if (f12 || inspect) view.webContents.openDevTools({ mode: 'detach' })
    })
  }
}

export function rendererUrl(
  entry: 'header' | 'settings' | 'embedded' | 'player' | 'context-menu' | 'status' | 'lyrics'
): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer
    ? `${devServer}/${entry}/index.html`
    : `file://${join(import.meta.dirname, `../renderer/${entry}/index.html`)}`
}
