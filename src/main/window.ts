import { join } from 'node:path'
import { BaseWindow, WebContentsView, nativeTheme } from 'electron'
import type { BrowserWindow } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { hardenSession, routeNewWindowsToBrowser } from './session'
import { attachDiagnostics } from './diagnostics'
import { attachBlocker } from './blocker'
import { isDev } from './env'
import { buildContentCss } from './content-css'
import { CH } from '@shared/ipc'
import type { NavState, WindowState } from '@shared/ipc'

export const HEADER_HEIGHT = 32

const START_URL = 'https://soundcloud.com/discover'

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
  /** Kept so the settings view can be hardened with the same identity as the others. */
  userAgent: string
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
const EMBEDDED_WIDTH = 144

export function createShell(userAgent: string): Shell {
  const state = windowStateKeeper({ defaultWidth: 1366, defaultHeight: 768 })

  const window = new BaseWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
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
  hardenSession(content.webContents.session, userAgent)
  hardenSession(header.webContents.session, userAgent)
  routeNewWindowsToBrowser(content.webContents)
  routeNewWindowsToBrowser(header.webContents)

  window.contentView.addChildView(content)
  window.contentView.addChildView(header)

  const shell: Shell = {
    window,
    header,
    content,
    settings: null,
    embedded: null,
    hideMenuBar: false,
    reservationKey: null,
    fullWidthLayout: false,
    userAgent,
    layout: () => {}
  }

  const layout = (): void => {
    const { width, height } = window.getContentBounds()
    const strip = shell.hideMenuBar ? 0 : HEADER_HEIGHT

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
    header.setVisible(!shell.hideMenuBar)
    header.setBounds({ x: 0, y: 0, width, height: strip })
    content.setBounds({ x: 0, y: strip, width, height: height - strip })
    // The settings panel only exists while it is open, so check before resizing it.
    if (shell.settings) fitBelowHeader(window, shell.settings, strip)
    if (shell.embedded) fitOverSoundCloudHeader(shell)
  }
  shell.layout = layout
  layout()
  window.on('resize', layout)

  void header.webContents.loadURL(rendererUrl('header'))
  void content.webContents.loadURL(START_URL)

  wireStateEvents(shell)

  // Not dev-gated: the listener is the only thing that can filter a request, and it
  // must exist in production for the setting to do anything.
  attachBlocker(shell)

  if (isDev) {
    enableDevToolsShortcut(header, content)
    attachDiagnostics(content)
  }

  // BaseWindow has no `ready-to-show` — that is a BrowserWindow event. Show once our
  // own chrome has painted, so the user never sees an unpainted frame.
  header.webContents.once('did-finish-load', () => window.show())

  // electron-window-state is typed against BrowserWindow, but it only calls getBounds,
  // isMaximized, isFullScreen and on(), all of which BaseWindow has. The cast is safe;
  // there is no BaseWindow-aware version of the package.
  state.manage(window as unknown as BrowserWindow)

  return shell
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

  hardenSession(view.webContents.session, shell.userAgent)
  routeNewWindowsToBrowser(view.webContents)

  // Transparent so the panel can animate itself in over a dimmed SoundCloud rather than
  // the whole view snapping in as an opaque rectangle. A native view's bounds cannot be
  // tweened smoothly, so all the motion happens in CSS inside the page.
  view.setBackgroundColor('#00000000')

  shell.settings = view
  shell.window.contentView.addChildView(view)
  fitBelowHeader(shell.window, view, shell.hideMenuBar ? 0 : HEADER_HEIGHT)

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
function fitOverSoundCloudHeader(shell: Shell): void {
  const view = shell.embedded
  if (!view) return

  const { width } = shell.window.getContentBounds()
  // The content view is zoomable, so SoundCloud's 46 CSS px header occupies 46 * zoom
  // window pixels. Our overlay is not zoomed, so it has to follow.
  const zoom = shell.content.webContents.getZoomFactor()

  view.setBounds({
    x: Math.round(width - EMBEDDED_WIDTH),
    y: shell.hideMenuBar ? 0 : HEADER_HEIGHT,
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
async function applyContentCss(shell: Shell, fullWidth: boolean): Promise<void> {
  const { webContents } = shell.content

  if (shell.reservationKey) {
    await webContents.removeInsertedCSS(shell.reservationKey).catch(() => undefined)
    shell.reservationKey = null
  }

  if (webContents.isDestroyed()) return

  // Reserved space is measured in window pixels, but the rule lands inside a page that
  // may be zoomed, so convert before writing it.
  const reserve = shell.embedded
    ? Math.round(EMBEDDED_WIDTH / webContents.getZoomFactor())
    : null

  shell.reservationKey = await webContents
    .insertCSS(buildContentCss({ fullWidth, reserve }))
    .catch(() => null)
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
  options: { hideMenuBar: boolean; fullWidth: boolean }
): void {
  shell.fullWidthLayout = options.fullWidth
  shell.hideMenuBar = options.hideMenuBar

  // The embedded bar exists exactly while our own bar is hidden — it carries the only
  // way back, so the two states are one thing, not two settings that could disagree.
  setEmbedded(shell, options.hideMenuBar)
  shell.layout()
  void applyContentCss(shell, options.fullWidth)
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

  hardenSession(view.webContents.session, shell.userAgent)
  routeNewWindowsToBrowser(view.webContents)
  // Transparent, so SoundCloud's own header shows through behind the glyphs and the two
  // read as a single bar.
  view.setBackgroundColor('#00000000')

  shell.embedded = view
  shell.window.contentView.addChildView(view)
  fitOverSoundCloudHeader(shell)

  void view.webContents.loadURL(rendererUrl('embedded'))
}

/** The settings panel occupies exactly the area the content view does. */
function fitBelowHeader(window: BaseWindow, view: WebContentsView, top: number): void {
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

  content.webContents.on(
    'did-finish-load',
    () => void applyContentCss(shell, shell.fullWidthLayout)
  )

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

  // v0.7.x had no did-fail-load handler anywhere, so a failed load left users staring at
  // a blank window (#50) with no way to tell what happened.
  content.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED, fires on normal navigation */) return
    console.error(`[content] load failed ${code} ${description} — ${url}`)
  })
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
function enableDevToolsShortcut(...views: WebContentsView[]): void {
  for (const view of views) {
    view.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return

      const f12 = input.key === 'F12'
      const inspect = (input.control || input.meta) && input.shift && input.key === 'I'

      if (f12 || inspect) view.webContents.openDevTools({ mode: 'detach' })
    })
  }
}

export function rendererUrl(entry: 'header' | 'settings' | 'embedded'): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer
    ? `${devServer}/${entry}/index.html`
    : `file://${join(import.meta.dirname, `../renderer/${entry}/index.html`)}`
}
