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
import type { LyricsState } from '@shared/lyrics'
import type { UpdateAction, UpdateStatus } from '@shared/updates'

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
  onThemesChanged: (cb: (themes: ThemeSummary[]) => void) => subscribe(CH.themesChanged, cb),
  copyTheme: (id: string) => ipcRenderer.invoke(CH.themeCopy, id) as Promise<{ error: string }>,
  openThemesFolder: () => ipcRenderer.send(CH.themesOpenFolder),
  openThemeFile: (id: string) => ipcRenderer.send(CH.themeOpenFile, id),
  getBackgroundPicture: () =>
    ipcRenderer.invoke(CH.backgroundPicture) as Promise<string | null>,
  chooseBackgroundPicture: () =>
    ipcRenderer.invoke(CH.backgroundChoosePicture) as Promise<{
      thumbnail: string | null
      error: string
    }>,

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

  getSafeMode: () => ipcRenderer.invoke(CH.safeModeGet) as Promise<boolean>,
  getWidevineSkipped: () => ipcRenderer.invoke(CH.widevineSkippedGet) as Promise<boolean>,
  resetSettings: () => ipcRenderer.invoke(CH.settingsReset) as Promise<boolean>,
  clearSiteData: () => ipcRenderer.invoke(CH.siteDataClear) as Promise<boolean>,

  getUpdateStatus: () => ipcRenderer.invoke(CH.updateStatusGet) as Promise<UpdateStatus>,
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => subscribe(CH.updateStatusChanged, cb),
  updateAction: (action: UpdateAction) => ipcRenderer.send(CH.updateAction, action),

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
  openPluginsFolder: () => ipcRenderer.send(CH.pluginsOpenFolder),

  toggleLyrics: () => ipcRenderer.send(CH.lyricsToggle),
  closeLyrics: () => ipcRenderer.send(CH.lyricsClose),
  getLyrics: () => ipcRenderer.invoke(CH.lyricsGet) as Promise<LyricsState>,
  onLyrics: (cb: (state: LyricsState) => void) => subscribe(CH.lyricsChanged, cb),
  retryLyrics: () => ipcRenderer.send(CH.lyricsRetry),
  nudgeLyrics: (seconds: number) => ipcRenderer.send(CH.lyricsNudge, seconds),
  onLyricsShown: (cb: (shown: boolean) => void) => subscribe(CH.lyricsShown, cb),

  openShowcase: () => ipcRenderer.send(CH.showcaseOpen),
  closeShowcase: () => ipcRenderer.send(CH.showcaseClose)
}

contextBridge.exposeInMainWorld('bsc', api)
