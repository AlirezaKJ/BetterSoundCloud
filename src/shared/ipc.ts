import type { Settings, SettingKey } from './settings-schema'
import type { ThemeSummary } from './themes'
import type { PageTheme } from './page-theme'
import type { ContextMenuAction, ContextMenuRequest, GoToUrlResult } from './context-menu'
import type { NowPlaying } from './now-playing'
import type { PageStatus, PageStatusAction } from './page-status'
import type { PresenceStatus } from './presence'
import type { PluginView } from './plugins'
import type { LyricsState } from './lyrics'
import type { UpdateAction, UpdateStatus } from './updates'

/** Every IPC channel name, in one place. Strings are never written inline. */
export const CH = {
  // chrome (header) -> main
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  navBack: 'nav:back',
  navForward: 'nav:forward',
  navReload: 'nav:reload',
  navStop: 'nav:stop',
  settingsToggle: 'settings:toggle',
  menuBarToggle: 'window:menu-bar-toggle',
  settingsClose: 'settings:close',

  // main -> chrome
  navStateChanged: 'nav:state-changed',
  windowStateChanged: 'window:state-changed',

  // settings renderer <-> main
  settingsGetAll: 'settings:get-all',
  themesList: 'themes:list',
  // The Themes section: the list changes when a file in the themes folder does.
  themesChanged: 'themes:changed',
  themeCopy: 'themes:copy',
  themesOpenFolder: 'themes:open-folder',
  themeOpenFile: 'themes:open-file',
  // The Background setting's own picture: its preview, and choosing one (main shows the dialog).
  backgroundPicture: 'background:picture',
  backgroundChoosePicture: 'background:choose-picture',

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
  nowPlayingGet: 'now-playing:get',

  // main -> any of our views. F6 moved keyboard focus into it (main/focus-cycle.ts); the preload
  // puts it on a control with its ring drawn. Not on `window.bsc`: no view has anything to add.
  focusArrived: 'view:focus-arrived',

  // main -> the page-status view (src/renderer/status), then its buttons -> main.
  pageStatusChanged: 'page-status:changed',
  pageStatusAction: 'page-status:action',

  // settings renderer -> main. Whether this launch is in safe mode (`--safe-mode`).
  safeModeGet: 'app:safe-mode-get',
  // settings renderer -> main. Whether this launch went on without Widevine.
  widevineSkippedGet: 'app:widevine-skipped-get',

  // settings renderer -> main. The two buttons under Advanced: settings back to their defaults,
  // and SoundCloud's cookies, storage and cache cleared (which signs the user out).
  settingsReset: 'settings:reset',
  siteDataClear: 'app:site-data-clear',

  // settings renderer <-> main. The updater: its status, and the one button that status offers.
  updateStatusGet: 'updates:status-get',
  updateStatusChanged: 'updates:status-changed',
  updateAction: 'updates:action',

  // settings renderer <-> main. Whether Discord presence is working, and "Try now".
  presenceStatusGet: 'presence:status-get',
  presenceStatusChanged: 'presence:status-changed',
  presenceRetry: 'presence:retry',

  // settings renderer <-> main. The Plugins section: list, switch on and off, settings, buttons.
  pluginsList: 'plugins:list',
  pluginsChanged: 'plugins:changed',
  pluginSetEnabled: 'plugins:set-enabled',
  pluginSetSetting: 'plugins:set-setting',
  pluginAction: 'plugins:action',
  pluginsOpenFolder: 'plugins:open-folder',

  // The lyrics pane. Toggled from the player-bar button (and the right-click menu, in main);
  // main pushes what to show, the pane closes itself, retries and nudges the timing.
  lyricsToggle: 'lyrics:toggle',
  lyricsClose: 'lyrics:close',
  lyricsGet: 'lyrics:get',
  lyricsChanged: 'lyrics:changed',
  lyricsRetry: 'lyrics:retry',
  lyricsNudge: 'lyrics:nudge',
  // main -> the player-bar buttons: whether the pane is open, so the button can say so.
  lyricsShown: 'lyrics:shown',

  // The full-screen showcase. Opened from the player-bar button (and the right-click menu, in
  // main); only the showcase itself closes it. It reads lyrics through `lyricsGet`/`lyricsChanged`.
  showcaseOpen: 'showcase:open',
  showcaseClose: 'showcase:close'
} as const

/** What a change to a plugin answers: every row as it now is, and why it failed if it did. */
export type PluginsResult = { plugins: PluginView[]; error: string }

export type NavState = {
  canGoBack: boolean
  canGoForward: boolean
  /**
   * SoundCloud's page itself is loading: a full load (startup, Reload, Back to another document),
   * not a move inside the page, and not a frame within it such as the sign-in box.
   */
  loading: boolean
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
  /** Stop SoundCloud's page loading: the reload button, while `NavState.loading` is true. */
  stop(): void
  toggleSettings(): void
  /** Swap between the 32px strip and the controls drawn inside SoundCloud’s header. */
  toggleMenuBar(): void
  closeSettings(): void
  onNavState(cb: (state: NavState) => void): () => void
  onWindowState(cb: (state: WindowState) => void): () => void

  getSettings(): Promise<Settings>
  setSetting(key: SettingKey, value: unknown): Promise<Settings>
  onSettingsChanged(cb: (settings: Settings) => void): () => void

  /** Themes found on disk, built-in first, read fresh each time. */
  listThemes(): Promise<ThemeSummary[]>
  /**
   * The themes again, whenever a file in the user's themes folder changes — a save, a new theme,
   * a deleted one. The selected theme re-applies itself at the same moment.
   */
  onThemesChanged(cb: (themes: ThemeSummary[]) => void): () => void
  /** Copy a built-in theme into the themes folder to edit it. Answers why, if it could not. */
  copyTheme(id: string): Promise<{ error: string }>
  openThemesFolder(): void
  /** Open one of the user's own theme files in their editor. Built-in themes cannot be opened. */
  openThemeFile(id: string): void

  /** A small preview of the chosen background picture, as a `data:` URI, or null if none. */
  getBackgroundPicture(): Promise<string | null>
  /**
   * Show the system's open dialog and make the picture chosen the background: the Background
   * setting switches to it, and every view hears the new settings as usual. Answers the new
   * preview (null when the dialog was cancelled) and why it failed, or '' when it did not. Takes
   * no path: main does all the file handling.
   */
  chooseBackgroundPicture(): Promise<{ thumbnail: string | null; error: string }>

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

  /**
   * What the page-status view should say while SoundCloud's page cannot be shown: starting
   * up, a failed load, a crash, a hang. Sent when that view loads and on every change, which
   * is rare — a handful of times per failure.
   */
  onPageStatus(cb: (status: PageStatus) => void): () => void
  /** One of that view's buttons. Main checks it against the current status before acting. */
  pageStatusAction(action: PageStatusAction): void

  /**
   * Whether the app was started with `--safe-mode`: hardware acceleration, ad blocking and the
   * theme are off for this launch whatever the settings say, and the settings panel must say so.
   * Fixed for the life of the app, so read once.
   */
  getSafeMode(): Promise<boolean>

  /**
   * Whether the user pressed "Continue without Widevine" on "Couldn’t set up playback" this
   * launch: protected tracks grey out and skip until the app restarts, and the settings panel
   * must say so. It can only change while the status view covers the page, so read once.
   */
  getWidevineSkipped(): Promise<boolean>

  /**
   * Put every schema setting back to its default, after the user confirmed it in the panel.
   * Plugins, their settings and secrets, and the sign-in are not touched. The new values arrive
   * through `onSettingsChanged`; this answers whether it happened. The settings view only.
   */
  resetSettings(): Promise<boolean>

  /**
   * Clear SoundCloud's cookies, site storage and HTTP cache, which signs the user out, then open
   * SoundCloud again. Answers whether the clearing worked. The settings view only.
   */
  clearSiteData(): Promise<boolean>

  /**
   * What the updater is doing: idle, checking, up to date, a version available, downloading (with
   * a percentage), ready to install, or failed and why — plus the running version, the setting and
   * how this copy was installed. Read once, then follow `onUpdateStatus`; it changes on each step,
   * and about once a second while downloading.
   */
  getUpdateStatus(): Promise<UpdateStatus>
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  /** Check now, download, restart to install, or open the release page. */
  updateAction(action: UpdateAction): void

  /**
   * Whether Discord presence is working — off, looking for Discord, connected (and what the card
   * shows), or unavailable and why. Read once, then follow `onPresenceStatus`; it changes on
   * connecting, on losing Discord and when the card does, at most every few seconds.
   */
  getPresenceStatus(): Promise<PresenceStatus>
  onPresenceStatus(cb: (status: PresenceStatus) => void): () => void
  /** Look for Discord now instead of at the next scheduled attempt. */
  retryPresence(): void

  /**
   * Every plugin, built in and the user's own, as the Plugins section shows them. Looks at the
   * plugins folder again, so a plugin dropped in appears without a restart. Follow
   * `onPluginsChanged` for changes a plugin makes itself: its status line, its buttons.
   */
  listPlugins(): Promise<PluginView[]>
  onPluginsChanged(cb: (plugins: PluginView[]) => void): () => void
  /** On approves the permissions the plugin asks for right now; the panel asks the user first. */
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginsResult>
  /** A secret setting is stored encrypted; '' removes it. */
  setPluginSetting(id: string, key: string, value: boolean | string): Promise<PluginsResult>
  /** One of the buttons a plugin put on its row. */
  pluginAction(id: string, actionId: string): void
  openPluginsFolder(): void

  /** Open the lyrics pane, or close it if it is open. From the player-bar button. */
  toggleLyrics(): void
  /** The pane closing itself: its close button, or Escape. */
  closeLyrics(): void
  /**
   * What the lyrics pane (or the showcase) should show. Read once on opening, then follow `onLyrics`, which
   * fires when the track changes, a lookup finishes, or the timing is nudged — never per tick.
   */
  getLyrics(): Promise<LyricsState>
  onLyrics(cb: (state: LyricsState) => void): () => void
  /** Look the current track up again, after LRCLIB could not be reached. */
  retryLyrics(): void
  /** Move the current track's timed lyrics by ±0.5 seconds; positive is later. */
  nudgeLyrics(seconds: number): void
  /** Whether the lyrics pane is open: on the player-bar buttons' load and on every change. */
  onLyricsShown(cb: (shown: boolean) => void): () => void

  /** Take the window full screen with the showcase. From the player-bar button. */
  openShowcase(): void
  /** The showcase closing itself: its close button, or Escape. Leaves full screen too. */
  closeShowcase(): void
}
