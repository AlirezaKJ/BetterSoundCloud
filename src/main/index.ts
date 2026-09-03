import { join } from 'node:path'
import { app, components, ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { buildUserAgent, leaksAppIdentity } from '@shared/identity'
import { CH } from '@shared/ipc'
import { createShell, toggleSettings, closeSettings, setContentAppearance } from './window'
import { createTray } from './tray'
import {
  loadBlockerEngine,
  isBlockerAvailable,
  setBlockingEnabled,
  setAudioAdBlocking
} from './blocker'
import type { Shell } from './window'
import type { Settings } from '@shared/settings-schema'
import * as settings from './settings-store'

let shell: Shell | null = null

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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!shell) return
    // show() matters as well as restore(): with a tray the window can be hidden, and a
    // hidden window is not a minimised one. Without this, launching the app again while
    // it sits in the tray would appear to do nothing.
    if (shell.window.isMinimized()) shell.window.restore()
    if (!shell.window.isVisible()) shell.window.show()
    shell.window.focus()
  })

  app
    .whenReady()
    // Castlabs' Widevine CDM must be registered before any window opens, or EME calls
    // reject. `components` exists only on the Castlabs build of Electron.
    .then(() => components.whenReady())
    .then(() => {
      registerIpc()
      // Synchronous, and before any view exists, so blocking is either fully on or
      // fully off from the first request — never half-applied mid-load.
      loadBlockerEngine()
      shell = createShell(USER_AGENT)
      createTray(shell)
      applyLiveSettings()

      app.on('activate', () => {
        if (!shell && BrowserWindow.getAllWindows().length === 0) {
          shell = createShell(USER_AGENT)
        }
      })
    })
    .catch((error: unknown) => {
      console.error('[main] startup failed:', error)
      app.quit()
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

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
    // Still always closes. The tray now exists, so hiding would no longer strand the app
    // — "Show BetterSoundCloud", a tray click, and second-instance can all bring it back.
    // Turning the setting on is a separate, deliberate change: it needs its own quitting
    // flag so Quit is not swallowed by the same hide, and `general.minimizeToTray` stays
    // `wired: false` in the schema until then.
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

  ipcMain.handle(CH.settingsGetAll, (e) => (fromSettingsUi(e) ? settings.getAll() : null))

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
function applyLiveSettings(): void {
  if (!shell) return
  shell.content.webContents.setZoomFactor(settings.get('appearance.zoomFactor') / 100)
  nativeTheme.themeSource = settings.get('appearance.colorScheme')
  applyBlocking()
  // Called after the zoom above, deliberately: the overlay's height and the CSS space it
  // reserves are both derived from the current zoom factor.
  setContentAppearance(shell, {
    hideMenuBar: settings.get('appearance.hideMenuBar'),
    fullWidth: settings.get('appearance.fullWidthLayout')
  })
}
