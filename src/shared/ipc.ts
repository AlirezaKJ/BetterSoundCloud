import type { Settings, SettingKey } from './settings-schema'
import type { ThemeSummary } from './themes'
import type { PageTheme } from './page-theme'
import type { ContextMenuAction, ContextMenuRequest, GoToUrlResult } from './context-menu'
import type { NowPlaying } from './now-playing'

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

  // main -> the right-click menu overlay, then the overlay -> main
  contextMenuShow: 'context-menu:show',
  contextMenuAction: 'context-menu:action',
  contextMenuGoToUrl: 'context-menu:go-to-url',
  contextMenuClose: 'context-menu:close',

  // content preload -> main. A raw reading of SoundCloud's player bar; see src/shared/now-playing.ts.
  trackUpdate: 'content:track-update',

  // main -> every view of ours on each change, and a one-off read when a view opens.
  nowPlayingChanged: 'now-playing:changed',
  nowPlayingGet: 'now-playing:get'
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
  readonly platform: string
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

  /**
   * The right-click menu, which lives in its own overlay view. Main sends a request for
   * every right-click on SoundCloud's page; the overlay answers with a verb, or with nothing.
   */
  onContextMenu(cb: (request: ContextMenuRequest) => void): () => void
  /** `text` only travels with `replace-misspelling` — the word to put in. */
  contextMenuAction(action: ContextMenuAction, text?: string): void
  /** The "Go to URL" prompt. Main navigates on success and says what it did with the text. */
  goToUrl(text: string): Promise<GoToUrlResult>
  /** Dismissed without choosing anything. */
  closeContextMenu(): void

  /**
   * What is playing in SoundCloud, or null when nothing is loaded in its player. Read this
   * once when a view opens, then follow `onNowPlaying` — subscribe first, so no change can
   * slip between the two.
   */
  getNowPlaying(): Promise<NowPlaying | null>
  /**
   * Every change: a new track, play or pause, a like, a seek — and the clock, which means
   * once a second while a track plays.
   */
  onNowPlaying(cb: (nowPlaying: NowPlaying | null) => void): () => void
}
