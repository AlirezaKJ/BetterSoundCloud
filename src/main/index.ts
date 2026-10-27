import { join } from 'node:path'
import { app, components, dialog, ipcMain, nativeTheme } from 'electron'
import type { WebContentsView } from 'electron'
import {
  acceptLanguages,
  buildUserAgent,
  leaksAppIdentity,
  pageLanguages
} from '@shared/identity'
import type { Identity } from '@shared/identity'
import { isDev } from './env'
import { CH } from '@shared/ipc'
import {
  createShell,
  loadSoundCloud,
  toggleSettings,
  closeSettings,
  setContentAppearance,
  setPageTheme,
  setContentCover,
  setContentPicture
} from './window'
import { choosePicture, pictureDataUri, pictureThumbnail } from './background'
import { setChromeTheme } from './chrome-theme'
import type { BackgroundOptions } from './content-css'
import { backgroundSource, chromeCssFor } from '@shared/themes'
import type { ThemeSummary } from '@shared/themes'
import {
  attachPageStatus,
  noticeSlowStart,
  runPageStatusAction,
  showPageStatus
} from './page-status'
import { describeComponentsError, isPageStatusAction } from '@shared/page-status'
import type { PageStatus } from '@shared/page-status'
import { createTray } from './tray'
import {
  attachContextMenu,
  hideContextMenu,
  runContextMenuAction,
  goToUrlFromMenu
} from './context-menu'
import { isContextMenuAction } from '@shared/context-menu'
import {
  loadBlockerEngine,
  isBlockerAvailable,
  setBlockingEnabled,
  setAudioAdBlocking
} from './blocker'
import type { Shell } from './window'
import type { Settings } from '@shared/settings-schema'
import * as settings from './settings-store'
import {
  copyThemeToUserFolder,
  findTheme,
  listThemes,
  openThemeFile,
  openThemesFolder,
  watchUserThemes
} from './themes'
import { isSoundCloudUrl, readNowPlaying } from '@shared/now-playing'
import type { NowPlaying } from '@shared/now-playing'
import { getNowPlaying, onNowPlayingChange, setNowPlaying } from './now-playing'
import {
  getPresenceStatus,
  onPresenceStatusChange,
  retryPresenceNow,
  setPresenceOptions
} from './presence'
import type { PresenceStatus } from '@shared/presence'
import {
  listPlugins,
  onPluginsChange,
  openPluginsFolder,
  pluginViews,
  runPluginAction,
  setPluginEnabled,
  setPluginSetting,
  startPlugins
} from './plugins'
import type { PluginsResult } from '@shared/ipc'

let shell: Shell | null = null
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

/*
 * ORDER MATTERS IN THIS FILE.
 *
 * The user agent must be set on `app.userAgentFallback` before `whenReady()`, because
 * that is what covers popups, workers and service workers — every context we do not
 * construct ourselves. Setting it later, or only on a header rewrite, is exactly the
 * v0.7.x bug: the sign-in POST carried one browser in its headers and a different one
 * in its body (issue #106).
 */
const USER_AGENT = buildUserAgent(process.versions.chrome, process.platform)

if (leaksAppIdentity(USER_AGENT)) {
  // Fail loudly rather than shipping a client that announces itself.
  throw new Error(`User agent leaks app identity: ${USER_AGENT}`)
}

app.userAgentFallback = USER_AGENT
app.setName('BetterSoundCloud')

// Printed in dev so the identity is verifiable at a glance without opening DevTools.
// The two lines must agree: whatever Chromium major is reported, the UA must claim the
// same one, and must not mention Electron or BetterSoundCloud.
if (process.env['ELECTRON_RENDERER_URL']) {
  console.log(`[bsc] chromium ${process.versions.chrome}`)
  console.log(`[bsc] user agent ${USER_AGENT}`)
}

/**
 * The full browser identity every session gets: the user agent above, plus the languages.
 *
 * Built on first use rather than here, because `app.getLocale()` only works after
 * `whenReady()` — and every caller runs after that. Built once, so every view, and every
 * window recreated later, tells websites exactly the same thing.
 */
let identity: Identity | null = null

function browserIdentity(): Identity {
  if (!identity) {
    const languages = pageLanguages(app.getLocale(), app.getPreferredSystemLanguages())
    identity = { userAgent: USER_AGENT, languages, acceptLanguages: acceptLanguages(languages) }
    if (isDev) {
      console.log(
        `[bsc] languages ${languages.join(',')} -> accept-language ${identity.acceptLanguages}`
      )
    }
  }
  return identity
}

/**
 * Dev only: confirm pages really see the language list the header was built from.
 *
 * That list is Electron's, recomputed here by `pageLanguages`. If some platform builds it
 * differently, the header and `navigator.languages` would quietly disagree again — the very
 * mismatch this exists to prevent — so say so loudly. Our own header page is asked, never
 * SoundCloud's, so nothing runs in their page.
 */
function checkPageLanguages(view: WebContentsView, expected: string[]): void {
  view.webContents.once('did-finish-load', () => {
    view.webContents
      .executeJavaScript('navigator.languages')
      .then((seen: unknown) => {
        if (JSON.stringify(seen) === JSON.stringify(expected)) return
        console.warn(
          `[bsc] navigator.languages is ${JSON.stringify(seen)}, but Accept-Language was ` +
            `built from ${JSON.stringify(expected)} — fix pageLanguages in src/shared/identity.ts`
        )
      })
      .catch(() => undefined)
  })
}

// Dev runs from its own profile directory. Without this, a `npm run dev` instance and an
// installed build share one userData path, so they fight over the single-instance lock:
// launching the installed app while dev is running makes it exit instantly and silently,
// which reads as "the packaged build is broken" when nothing is wrong. It also keeps dev
// cookies and settings out of the real profile.
if (process.env['ELECTRON_RENDERER_URL']) {
  app.setPath('userData', join(app.getPath('appData'), 'BetterSoundCloud (dev)'))
}

if (!settings.get('advanced.hardwareAcceleration')) {
  app.disableHardwareAcceleration()
}

/**
 * Widevine, the DRM module SoundCloud's protected tracks need. Castlabs' Electron downloads it
 * on first launch, and it must be registered before SoundCloud's page makes any EME call.
 *
 * The gate is on SoundCloud's page, NOT on the window. Startup used to wait for it before
 * creating any window at all, so a first launch showed nothing until the download finished,
 * and an offline one quit with no message (#96). Measured 2026-10-27 on fresh profiles:
 *
 *   - online, the install takes about 2s; with Widevine already installed it resolves ~100ms
 *     after startup;
 *   - offline, `whenReady()` rejects after about 4s ("Update check error"), and every later
 *     call returns that same rejection even once the network is back — so a retry has to be a
 *     fresh launch;
 *   - a view created BEFORE it resolves still gets Widevine once it navigates. That is what
 *     makes it safe to build the window first and hold back only the page.
 *
 * Without Widevine, SoundCloud is never loaded. Its protected tracks would grey out and skip,
 * which is indistinguishable from the bug v2 exists to fix.
 */
type Widevine =
  { state: 'pending'; slow: boolean } | { state: 'ready' } | { state: 'failed'; detail: string }

let widevine: Widevine = { state: 'pending', slow: false }

/** After this, the "setting up" status admits it is taking longer than it should. */
const WIDEVINE_SLOW_MS = 20_000

function waitForWidevine(): void {
  const started = Date.now()

  const slow = setTimeout(() => {
    if (widevine.state !== 'pending') return
    widevine = { state: 'pending', slow: true }
    if (shell?.pageStatus?.kind === 'setting-up') showPageStatus(shell, startingStatus())
  }, WIDEVINE_SLOW_MS)

  components.whenReady().then(
    () => {
      clearTimeout(slow)
      widevine = { state: 'ready' }
      if (isDev) console.log(`[widevine] ready after ${Date.now() - started}ms`)
      if (!shell) return
      if (shell.pageStatus?.kind === 'setting-up') showPageStatus(shell, { kind: 'loading' })
      loadSoundCloud(shell)
    },
    (error: unknown) => {
      clearTimeout(slow)
      const detail = describeComponentsError(error)
      widevine = { state: 'failed', detail }
      console.error(`[widevine] install failed after ${Date.now() - started}ms: ${detail}`)
      if (shell) showPageStatus(shell, { kind: 'setup-failed', detail })
    }
  )
}

/** What is holding up SoundCloud's first page right now. */
function startingStatus(): PageStatus {
  if (widevine.state === 'pending') return { kind: 'setting-up', slow: widevine.slow }
  if (widevine.state === 'failed') return { kind: 'setup-failed', detail: widevine.detail }
  return { kind: 'loading' }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app
    .whenReady()
    .then(() => {
      registerIpc()
      // Synchronous, and before any view exists, so blocking is either fully on or
      // fully off from the first request — never half-applied mid-load.
      loadBlockerEngine()
      showMainWindow()
      createTray(showMainWindow)
      // Plugins belong to the app, not the window, and none of them needs SoundCloud's page.
      startPlugins()
      app.on('activate', showMainWindow)
      app.on('second-instance', showMainWindow)
      // After the window exists, so the wait is spent with something on screen.
      waitForWidevine()
    })
    .catch((error: unknown) => {
      console.error('[main] startup failed:', error)
      // The last resort, for a failure before there is any window to say it in. A native box
      // needs no renderer, so it works when nothing else does.
      dialog.showErrorBox(
        'BetterSoundCloud couldn’t start',
        `${error instanceof Error ? error.message : String(error)}\n\n` +
          'Please report this at github.com/AlirezaKJ/BetterSoundCloud/issues.'
      )
      app.quit()
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Recreate a closed window, or raise the existing one, from every entry point. */
function showMainWindow(): void {
  if (!shell) {
    const next = createShell(browserIdentity())
    shell = next
    if (isDev) checkPageLanguages(next.header, browserIdentity().languages)
    next.window.on('close', (event) => {
      if (process.platform === 'darwin' && !quitting) {
        // Keep SoundCloud's renderer (and its audio) alive until the user quits.
        event.preventDefault()
        next.window.hide()
      }
    })
    // A full page load stops playback, and the new page reports again once its player bar
    // is drawn. Until then nothing is playing — and if the bar never turns up (a SoundCloud
    // redesign), that is still the truth rather than the last track hanging around forever.
    next.content.webContents.on('did-navigate', () => setNowPlaying(null))
    next.content.webContents.on('render-process-gone', () => setNowPlaying(null))
    next.window.once('closed', () => {
      if (shell === next) shell = null
      setNowPlaying(null)
      // BaseWindow does not own the lifetime of its WebContentsViews.
      for (const view of [
        next.header,
        next.content,
        next.settings,
        next.embedded,
        next.player,
        next.contextMenu,
        next.status
      ]) {
        if (view && !view.webContents.isDestroyed()) view.webContents.close()
      }
    })
    attachContextMenu(next)
    attachPageStatus(next)
    applyLiveSettings()

    // SoundCloud only once Widevine is ready (see `waitForWidevine`). A window opened after
    // that — macOS reopening from the Dock — loads straight away.
    if (widevine.state === 'ready') loadSoundCloud(next)
    else if (widevine.state === 'failed') showPageStatus(next, startingStatus())
    noticeSlowStart(next, startingStatus)
    return
  }

  if (shell.window.isMinimized()) shell.window.restore()
  if (!shell.window.isVisible()) shell.window.show()
  shell.window.focus()
}

function registerIpc(): void {
  /**
   * Only our own chrome may drive the window. v0.7.x dispatched window commands off
   * `console-message` strings from inside SoundCloud's page (`app.js:99`), which meant
   * any script on soundcloud.com could emit `BSCReceive|UISettingCloseApp` and quit the
   * app. Checking the sender closes that channel permanently.
   */
  const fromChrome = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    shell !== null &&
    (event.sender === shell.header.webContents || event.sender === shell.embedded?.webContents)

  /** The header drives the window; the settings panel only reads and writes settings. */
  const fromSettingsUi = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): boolean => fromChrome(event) || event.sender === shell?.settings?.webContents

  ipcMain.on(CH.windowMinimize, (e) => {
    if (fromChrome(e)) shell?.window.minimize()
  })

  ipcMain.on(CH.windowMaximizeToggle, (e) => {
    if (!fromChrome(e) || !shell) return
    if (shell.window.isMaximized()) shell.window.unmaximize()
    else shell.window.maximize()
  })

  ipcMain.on(CH.windowClose, (e) => {
    if (!fromChrome(e) || !shell) return
    // macOS hides the window in its close handler to keep playback running.
    shell.window.close()
  })

  ipcMain.on(CH.menuBarToggle, (e) => {
    if (!fromChrome(e)) return
    settings.set('appearance.hideMenuBar', !settings.get('appearance.hideMenuBar'))
    applyLiveSettings()
    // After applying, for the same reason as the settingsSet handler below.
    broadcastSettings(settings.getAll())
  })

  ipcMain.on(CH.settingsToggle, (e) => {
    if (fromChrome(e) && shell) toggleSettings(shell)
  })

  ipcMain.on(CH.settingsClose, (e) => {
    // Sent by the settings panel's own close button, so the sender is that view.
    if (shell && e.sender === shell.settings?.webContents) closeSettings(shell)
  })

  ipcMain.on(CH.navBack, (e) => {
    if (fromChrome(e)) shell?.content.webContents.navigationHistory.goBack()
  })

  ipcMain.on(CH.navForward, (e) => {
    if (fromChrome(e)) shell?.content.webContents.navigationHistory.goForward()
  })

  ipcMain.on(CH.navReload, (e) => {
    if (fromChrome(e)) shell?.content.webContents.reload()
  })

  /**
   * The right-click menu. Only its own overlay may drive it, and it sends verbs rather than
   * data: main acts on the request it sent (src/main/context-menu.ts), so a compromised
   * overlay could at most pick a menu item.
   */
  const fromContextMenu = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): boolean => shell !== null && event.sender === shell.contextMenu?.webContents

  ipcMain.on(CH.contextMenuAction, (e, action: unknown, text: unknown) => {
    if (!fromContextMenu(e) || !shell || !isContextMenuAction(action)) return
    runContextMenuAction(shell, action, typeof text === 'string' ? text : '')
  })

  ipcMain.on(CH.contextMenuClose, (e) => {
    if (fromContextMenu(e) && shell) hideContextMenu(shell)
  })

  ipcMain.handle(CH.contextMenuGoToUrl, (e, text: unknown) => {
    if (!fromContextMenu(e) || !shell || typeof text !== 'string') return 'invalid'
    return goToUrlFromMenu(shell, text)
  })

  /**
   * SoundCloud's own light/dark setting, reported by the content preload.
   *
   * Sender-checked like everything else: only the SoundCloud view may send this, so a
   * compromised overlay cannot drive the others' colours. The payload is validated rather
   * than trusted — it crosses from the page's preload, which is the least trusted of ours.
   */
  ipcMain.on(CH.pageTheme, (e, theme: unknown) => {
    if (!shell || e.sender !== shell.content.webContents) return
    if (theme !== 'light' && theme !== 'dark') return
    setPageTheme(shell, theme)
  })

  /**
   * What is playing, reported by the content preload whenever SoundCloud's player bar
   * changes.
   *
   * Checked more strictly than any other channel. It must come from the content view, from
   * its top frame, while that frame is on soundcloud.com — so neither an embedded frame nor
   * a page the view navigated away to can post a track. v0.7.x's console-message channel had
   * none of this, and any script on the page could drive it. The payload is then rebuilt
   * field by field by `readNowPlaying`, never passed on as sent.
   */
  const fromSoundCloudPage = (event: Electron.IpcMainEvent): boolean => {
    if (!shell || event.sender !== shell.content.webContents) return false
    const frame = event.senderFrame
    return frame !== null && frame.parent === null && isSoundCloudUrl(frame.url)
  }

  ipcMain.on(CH.trackUpdate, (e, reading: unknown) => {
    if (fromSoundCloudPage(e)) setNowPlaying(readNowPlaying(reading))
  })

  /**
   * A button on the page-status view. Only that view may press them — Restart and Quit act on
   * the whole app — and page-status.ts re-checks each against what is actually on screen.
   */
  ipcMain.on(CH.pageStatusAction, (e, action: unknown) => {
    if (!shell || e.sender !== shell.status?.webContents || !isPageStatusAction(action)) return
    runPageStatusAction(shell, action)
  })

  /**
   * Any view we draw ourselves may read what is playing — and only those. SoundCloud's own
   * view is the source of this data, so it has no reason to ask for it back.
   */
  const fromOurViews = (event: Electron.IpcMainInvokeEvent): boolean =>
    shell !== null &&
    [
      shell.header,
      shell.settings,
      shell.embedded,
      shell.player,
      shell.contextMenu,
      shell.status
    ].some((view) => view?.webContents === event.sender)

  ipcMain.handle(CH.nowPlayingGet, (e) => (fromOurViews(e) ? getNowPlaying() : null))
  onNowPlayingChange(broadcastNowPlaying)

  ipcMain.handle(CH.settingsGetAll, (e) => (fromSettingsUi(e) ? settings.getAll() : null))

  // Whether Discord presence is working, for the line under its toggle in settings.
  ipcMain.handle(CH.presenceStatusGet, (e) => (fromSettingsUi(e) ? getPresenceStatus() : null))
  ipcMain.on(CH.presenceRetry, (e) => {
    if (fromSettingsUi(e)) retryPresenceNow()
  })
  onPresenceStatusChange(broadcastPresenceStatus)

  /*
   * The Plugins section. The settings UI may list, switch, configure and press, and that is
   * all: which plugins exist and what they may do is decided in main (src/main/plugins.ts).
   */
  ipcMain.handle(CH.pluginsList, (e) => (fromSettingsUi(e) ? listPlugins() : null))
  ipcMain.handle(
    CH.pluginSetEnabled,
    (e, id: unknown, enabled: unknown): PluginsResult | null => {
      if (!fromSettingsUi(e) || typeof id !== 'string' || typeof enabled !== 'boolean')
        return null
      return pluginResult(() => setPluginEnabled(id, enabled))
    }
  )
  ipcMain.handle(
    CH.pluginSetSetting,
    (e, id: unknown, key: unknown, value: unknown): PluginsResult | null => {
      if (!fromSettingsUi(e) || typeof id !== 'string' || typeof key !== 'string') return null
      return pluginResult(() => setPluginSetting(id, key, value))
    }
  )
  ipcMain.on(CH.pluginAction, (e, id: unknown, actionId: unknown) => {
    if (fromSettingsUi(e) && typeof id === 'string' && typeof actionId === 'string') {
      runPluginAction(id, actionId)
    }
  })
  ipcMain.on(CH.pluginsOpenFolder, (e) => {
    if (fromSettingsUi(e)) openPluginsFolder()
  })
  onPluginsChange(broadcastPlugins)

  // The CSS never leaves main — the panel only needs enough to draw a list, and shipping a
  // whole stylesheet over IPC for every render would be waste.
  ipcMain.handle(CH.themesList, (e) => (fromSettingsUi(e) ? themeSummaries() : null))
  ipcMain.handle(CH.themeCopy, (e, id: unknown) => {
    if (!fromSettingsUi(e) || typeof id !== 'string') return { error: 'Not allowed.' }
    try {
      copyThemeToUserFolder(id)
      return { error: '' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.on(CH.themesOpenFolder, (e) => {
    if (fromSettingsUi(e)) openThemesFolder()
  })
  ipcMain.on(CH.themeOpenFile, (e, id: unknown) => {
    if (fromSettingsUi(e) && typeof id === 'string') openThemeFile(id)
  })

  // The Background setting's own picture. Main shows the dialog and does all the file handling;
  // the panel sends no path and gets back only a small preview.
  ipcMain.handle(CH.backgroundPicture, (e) => (fromSettingsUi(e) ? pictureThumbnail() : null))
  ipcMain.handle(CH.backgroundChoosePicture, async (e) => {
    if (!fromSettingsUi(e) || !shell) return { thumbnail: null, error: 'Not allowed.' }
    const result = await choosePicture(shell.window)
    if (result.status === 'cancelled') return { thumbnail: null, error: '' }
    if (result.status === 'failed') return { thumbnail: null, error: result.error }
    // Chosen: show it straight away, which is what choosing one means.
    settings.set('appearance.background', 'picture')
    applyLiveSettings()
    broadcastSettings(settings.getAll())
    return { thumbnail: pictureThumbnail(), error: '' }
  })

  // A theme file saved, added or deleted: the selected theme re-applies everywhere, and an open
  // panel redraws its list. This is what makes writing a theme feel live.
  watchUserThemes(() => {
    applyLiveSettings()
    const view = shell?.settings
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.send(CH.themesChanged, themeSummaries())
    }
  })

  // `--bsc-cover` for themes: the artwork of what is playing, once per track.
  onNowPlayingChange((nowPlaying) => {
    if (shell) setContentCover(shell, nowPlaying?.artwork ?? '')
  })

  ipcMain.handle(CH.settingsSet, (e, key: unknown, value: unknown) => {
    if (!fromSettingsUi(e)) return null
    settings.set(key, value)
    applyLiveSettings()
    // Read the store AFTER applying, never before. `applyLiveSettings` -> `applyBlocking` is
    // allowed to correct a setting — it turns the ad blocker back off when the engine failed
    // to load — and broadcasting a snapshot taken beforehand would overwrite that correction
    // with the value the user just clicked, leaving a ticked checkbox over a blocker that is
    // doing nothing. That is the exact failure `applyBlocking` exists to prevent.
    const next = settings.getAll()
    broadcastSettings(next)
    return next
  })
}

/**
 * Follow the ad-blocker settings, and refuse to lie about them.
 *
 * If the engine could not load, the filter-list setting turns itself back off, so the
 * checkbox visibly unticks rather than claiming to block. A control that silently does
 * nothing is the exact failure the schema's `wired` flag exists to prevent.
 *
 * It only writes the store — it does not broadcast. Both callers re-read the store after
 * calling this and broadcast once, which is what makes the correction survive instead of
 * being overwritten by the snapshot the user's click produced.
 */
function applyBlocking(): void {
  // Audio ads first, and unconditionally: this one needs no engine, so it is never turned
  // off on our own initiative the way the filter-list blocker below can be.
  setAudioAdBlocking(settings.get('advanced.blockAudioAds'))

  const wanted = settings.get('advanced.adBlocker')

  if (wanted && !isBlockerAvailable()) {
    setBlockingEnabled(false)
    settings.set('advanced.adBlocker', false)
    return
  }

  setBlockingEnabled(wanted)
}

/**
 * Tell every view we draw about a change in what is playing.
 *
 * All of them, whether or not they show it: a view that does not care simply never
 * subscribes, and keeping one rule means a new view gets it without anyone remembering to
 * add it here. It is cheap — a few short strings, at most once a second.
 */
function broadcastNowPlaying(nowPlaying: NowPlaying | null): void {
  if (!shell) return
  for (const view of [
    shell.header,
    shell.settings,
    shell.embedded,
    shell.player,
    shell.contextMenu,
    shell.status
  ]) {
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.send(CH.nowPlayingChanged, nowPlaying)
    }
  }
}

/** Run a change to a plugin and answer with every row, plus the reason if it failed. */
function pluginResult(change: () => void): PluginsResult {
  try {
    change()
    return { plugins: pluginViews(), error: '' }
  } catch (error) {
    return {
      plugins: pluginViews(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** Plugin rows change on their own (a status line, a button), so the open panel is told. */
function broadcastPlugins(): void {
  const view = shell?.settings
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.send(CH.pluginsChanged, pluginViews())
  }
}

/** The settings panel is the one view that shows it, and only while it is open. */
function broadcastPresenceStatus(status: PresenceStatus): void {
  const view = shell?.settings
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.send(CH.presenceStatusChanged, status)
  }
}

/** Tell every one of our own renderers about a settings change. */
function broadcastSettings(next: Settings): void {
  if (!shell) return
  for (const view of [shell.header, shell.settings]) {
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.send(CH.settingsChanged, next)
    }
  }
}

/**
 * Settings that take effect without a restart.
 *
 * `colorScheme` goes through `nativeTheme.themeSource`, which is what `prefers-color-scheme`
 * reports in every renderer we own. That means tokens.css needs no `data-theme` attribute
 * and no IPC of its own — the existing `@media (prefers-color-scheme: dark)` block just
 * starts following this setting. It reaches soundcloud.com too: `themeSource` rewrites
 * `prefers-color-scheme` for every web contents in the app, measured — a page loaded in
 * the content view reports `prefers-color-scheme: dark` the moment this is set to dark.
 */
/**
 * The CSS never leaves main — the panel only needs enough to draw a list, and shipping whole
 * stylesheets over IPC for every render would be waste.
 */
function themeSummaries(): ThemeSummary[] {
  return listThemes().map(
    ({
      id,
      name,
      author,
      version,
      description,
      builtIn,
      preview,
      overridesBuiltIn,
      mode,
      needsBackground
    }) => ({
      id,
      name,
      author,
      version,
      description,
      builtIn,
      preview,
      overridesBuiltIn,
      mode,
      needsBackground
    })
  )
}

/** The selected theme's `chrome` sections, into every view of ours that takes them. */
function applyChromeTheme(): void {
  const theme = findTheme(settings.get('appearance.theme'))
  setChromeTheme((kind) => (theme ? chromeCssFor(theme.sections, kind) : ''))
}

function applyLiveSettings(): void {
  // Discord presence belongs to the app rather than to a window, so it is applied before the
  // window check below.
  setPresenceOptions({
    enabled: settings.get('discord.enabled'),
    showWhenPaused: settings.get('discord.showWhenPaused')
  })

  applyChromeTheme()

  if (!shell) return
  shell.content.webContents.setZoomFactor(settings.get('appearance.zoomFactor') / 100)
  nativeTheme.themeSource = settings.get('appearance.colorScheme')
  applyBlocking()
  // Called after the zoom above, deliberately: the overlay's height and the CSS space it
  // reserves are both derived from the current zoom factor.
  setContentAppearance(shell, {
    hideMenuBar: settings.get('appearance.hideMenuBar'),
    fullWidth: settings.get('appearance.fullWidthLayout'),
    theme: settings.get('appearance.theme'),
    minimalNavigation: settings.get('appearance.minimalNavigation'),
    background: backgroundOptions(),
    playerButtons: settings.get('appearance.playerButtons')
  })
  // The chosen picture travels in its own sheet, and only while it is the background.
  setContentPicture(shell, currentBackground() === 'picture' ? pictureDataUri() : '')
}

/** What the Background shows: the setting, unless the selected theme needs one (`@background`). */
function currentBackground(): 'none' | 'artwork' | 'picture' {
  const theme = findTheme(settings.get('appearance.theme'))
  return backgroundSource(
    settings.get('appearance.background'),
    theme?.needsBackground ?? false
  )
}

/** The Background settings as the page stylesheet wants them, or null for no background. */
function backgroundOptions(): BackgroundOptions | null {
  const source = currentBackground()
  if (source === 'none') return null
  return {
    source,
    blur: settings.get('appearance.backgroundBlur'),
    strength: settings.get('appearance.backgroundStrength')
  }
}
