import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/ipc'
import type { ChromeApi, NavState, WindowState } from '@shared/ipc'
import type { SettingKey, Settings } from '@shared/settings-schema'
import type { ThemeSummary } from '@shared/themes'
import type { PageTheme } from '@shared/page-theme'
import type { ContextMenuAction, ContextMenuRequest, GoToUrlResult } from '@shared/context-menu'

/**
 * Preload for OUR OWN chrome (header, settings, the overlays, the right-click menu). This
 * never runs on soundcloud.com — that page gets `content.ts`, which exposes nothing.
 *
 * Sandboxed, so this file is emitted as CommonJS. See electron.vite.config.ts.
 */

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api: ChromeApi = {
  minimize: () => ipcRenderer.send(CH.windowMinimize),
  maximizeToggle: () => ipcRenderer.send(CH.windowMaximizeToggle),
  close: () => ipcRenderer.send(CH.windowClose),
  back: () => ipcRenderer.send(CH.navBack),
  forward: () => ipcRenderer.send(CH.navForward),
  reload: () => ipcRenderer.send(CH.navReload),
  toggleSettings: () => ipcRenderer.send(CH.settingsToggle),
  toggleMenuBar: () => ipcRenderer.send(CH.menuBarToggle),
  closeSettings: () => ipcRenderer.send(CH.settingsClose),

  onNavState: (cb: (state: NavState) => void) => subscribe(CH.navStateChanged, cb),
  onWindowState: (cb: (state: WindowState) => void) => subscribe(CH.windowStateChanged, cb),

  getSettings: () => ipcRenderer.invoke(CH.settingsGetAll) as Promise<Settings>,
  setSetting: (key: SettingKey, value: unknown) =>
    ipcRenderer.invoke(CH.settingsSet, key, value) as Promise<Settings>,

  /** Themes available on disk right now, for the theme picker. Read-only. */
  listThemes: () => ipcRenderer.invoke(CH.themesList) as Promise<ThemeSummary[]>,

  onPageTheme: (cb: (theme: PageTheme) => void) => subscribe(CH.pageThemeChanged, cb),
  onSettingsChanged: (cb: (settings: Settings) => void) => subscribe(CH.settingsChanged, cb),

  onContextMenu: (cb: (request: ContextMenuRequest) => void) =>
    subscribe(CH.contextMenuShow, cb),
  contextMenuAction: (action: ContextMenuAction, text?: string) =>
    ipcRenderer.send(CH.contextMenuAction, action, text),
  goToUrl: (text: string) =>
    ipcRenderer.invoke(CH.contextMenuGoToUrl, text) as Promise<GoToUrlResult>,
  closeContextMenu: () => ipcRenderer.send(CH.contextMenuClose)
}

contextBridge.exposeInMainWorld('bsc', api)
