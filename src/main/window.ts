import { join } from 'node:path'
import { BaseWindow, WebContentsView, nativeTheme } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { hardenSession, routeNewWindowsToBrowser } from './session'
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

  const layout = (): void => {
    const { width, height } = window.getContentBounds()
    header.setBounds({ x: 0, y: 0, width, height: HEADER_HEIGHT })
    content.setBounds({ x: 0, y: HEADER_HEIGHT, width, height: height - HEADER_HEIGHT })
  }
  layout()
  window.on('resize', layout)

  void header.webContents.loadURL(rendererUrl('header'))
  void content.webContents.loadURL(START_URL)

  wireStateEvents(window, header, content)

  // BaseWindow has no `ready-to-show` — that is a BrowserWindow event. Show once our
  // own chrome has painted, so the user never sees an unpainted frame.
  header.webContents.once('did-finish-load', () => window.show())

  state.manage(window as unknown as Parameters<typeof state.manage>[0])

  return { window, header, content }
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

export function rendererUrl(entry: 'header' | 'settings'): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer
    ? `${devServer}/${entry}/index.html`
    : `file://${join(import.meta.dirname, `../renderer/${entry}/index.html`)}`
}
