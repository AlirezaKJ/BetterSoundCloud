import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/ipc'
import type { ChromeApi, NavState, PluginsResult, WindowState } from '@shared/ipc'
import type { SettingKey, Settings } from '@shared/settings-schema'
import type { ThemeSummary } from '@shared/themes'
import type { PageTheme } from '@shared/page-theme'
import type { ContextMenuAction, ContextMenuRequest, GoToUrlResult } from '@shared/context-menu'
import type { NowPlaying } from '@shared/now-playing'
import type { PageStatus, PageStatusAction } from '@shared/page-status'
import type { PresenceStatus } from '@shared/presence'
import type { PluginView } from '@shared/plugins'

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
  platform: process.platform,
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
  closeContextMenu: () => ipcRenderer.send(CH.contextMenuClose),

  getNowPlaying: () => ipcRenderer.invoke(CH.nowPlayingGet) as Promise<NowPlaying | null>,
  onNowPlaying: (cb: (nowPlaying: NowPlaying | null) => void) =>
    subscribe(CH.nowPlayingChanged, cb),

  onPageStatus: (cb: (status: PageStatus) => void) => subscribe(CH.pageStatusChanged, cb),
  pageStatusAction: (action: PageStatusAction) => ipcRenderer.send(CH.pageStatusAction, action),

  getPresenceStatus: () => ipcRenderer.invoke(CH.presenceStatusGet) as Promise<PresenceStatus>,
  onPresenceStatus: (cb: (status: PresenceStatus) => void) =>
    subscribe(CH.presenceStatusChanged, cb),
  retryPresence: () => ipcRenderer.send(CH.presenceRetry),

  listPlugins: () => ipcRenderer.invoke(CH.pluginsList) as Promise<PluginView[]>,
  onPluginsChanged: (cb: (plugins: PluginView[]) => void) => subscribe(CH.pluginsChanged, cb),
  setPluginEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(CH.pluginSetEnabled, id, enabled) as Promise<PluginsResult>,
  setPluginSetting: (id: string, key: string, value: boolean | string) =>
    ipcRenderer.invoke(CH.pluginSetSetting, id, key, value) as Promise<PluginsResult>,
  pluginAction: (id: string, actionId: string) =>
    ipcRenderer.send(CH.pluginAction, id, actionId),
  openPluginsFolder: () => ipcRenderer.send(CH.pluginsOpenFolder)
}

contextBridge.exposeInMainWorld('bsc', api)
