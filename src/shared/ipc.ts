import type { Settings, SettingKey } from './settings-schema'
import type { ThemeSummary } from './themes'
import type { PageTheme } from './page-theme'

/** Every IPC channel name, in one place. Strings are never written inline. */
export const CH = {
  // chrome (header) -> main
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  navBack: 'nav:back',
  navForward: 'nav:forward',
  navReload: 'nav:reload',
  settingsToggle: 'settings:toggle',
  menuBarToggle: 'window:menu-bar-toggle',
  settingsClose: 'settings:close',

  // main -> chrome
  navStateChanged: 'nav:state-changed',
  windowStateChanged: 'window:state-changed',

  // settings renderer <-> main
  settingsGetAll: 'settings:get-all',
  themesList: 'themes:list',

  // content preload -> main, then main -> our overlays. SoundCloud's own light/dark choice.
  pageTheme: 'page:theme',
  pageThemeChanged: 'page:theme-changed',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',

  // content preload -> main (Phase 1: AudioMonitor)
  trackUpdate: 'content:track-update'
} as const

export type NavState = {
  canGoBack: boolean
  canGoForward: boolean
}

export type WindowState = {
  maximized: boolean
  focused: boolean
}

/** Shape exposed on `window.bsc` in our own chrome renderers. Never in SoundCloud's page. */
export type ChromeApi = {
  minimize(): void
  maximizeToggle(): void
  close(): void
  back(): void
  forward(): void
  reload(): void
  toggleSettings(): void
  /** Swap between the 32px strip and the controls drawn inside SoundCloud’s header. */
  toggleMenuBar(): void
  closeSettings(): void
  onNavState(cb: (state: NavState) => void): () => void
  onWindowState(cb: (state: WindowState) => void): () => void

  getSettings(): Promise<Settings>
  setSetting(key: SettingKey, value: unknown): Promise<Settings>
  onSettingsChanged(cb: (settings: Settings) => void): () => void

  /** Themes found on disk, for a control whose choices are not known at compile time. */
  listThemes(): Promise<ThemeSummary[]>

  /**
   * SoundCloud's own light/dark setting, so an overlay drawn on top of their page can match
   * it. Fires on load and whenever the user changes it in SoundCloud's settings.
   */
  onPageTheme(cb: (theme: PageTheme) => void): () => void
}
