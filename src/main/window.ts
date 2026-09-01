import { join } from 'node:path'
import { BaseWindow, WebContentsView, nativeTheme } from 'electron'
import type { BrowserWindow } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { hardenSession, routeNewWindowsToBrowser } from './session'
import { attachDiagnostics } from './diagnostics'
import { CH } from '@shared/ipc'
import type { NavState, WindowState } from '@shared/ipc'

export const HEADER_HEIGHT = 32

const START_URL = 'https://soundcloud.com/discover'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

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
  /** Kept so the settings view can be hardened with the same identity as the others. */
  userAgent: string
}

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

  const shell: Shell = { window, header, content, settings: null, userAgent }

  const layout = (): void => {
    const { width, height } = window.getContentBounds()
    header.setBounds({ x: 0, y: 0, width, height: HEADER_HEIGHT })
    content.setBounds({ x: 0, y: HEADER_HEIGHT, width, height: height - HEADER_HEIGHT })
    // The settings panel only exists while it is open, so check before resizing it.
    if (shell.settings) fitBelowHeader(window, shell.settings)
  }
  layout()
  window.on('resize', layout)

  void header.webContents.loadURL(rendererUrl('header'))
  void content.webContents.loadURL(START_URL)

  wireStateEvents(window, header, content)

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
  fitBelowHeader(shell.window, view)

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

/** The settings panel occupies exactly the area the content view does. */
function fitBelowHeader(window: BaseWindow, view: WebContentsView): void {
  const { width, height } = window.getContentBounds()
  view.setBounds({ x: 0, y: HEADER_HEIGHT, width, height: height - HEADER_HEIGHT })
}

function wireStateEvents(
  window: BaseWindow,
  header: WebContentsView,
  content: WebContentsView
): void {
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
    if (!header.webContents.isDestroyed()) header.webContents.send(CH.windowStateChanged, state)
  }

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

export function rendererUrl(entry: 'header' | 'settings'): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer
    ? `${devServer}/${entry}/index.html`
    : `file://${join(import.meta.dirname, `../renderer/${entry}/index.html`)}`
}
