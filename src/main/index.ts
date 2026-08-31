import { join } from 'node:path'
import { app, components, ipcMain, BrowserWindow } from 'electron'
import { buildUserAgent, leaksAppIdentity } from '@shared/identity'
import { CH } from '@shared/ipc'
import { createShell } from './window'
import type { Shell } from './window'
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
    if (shell.window.isMinimized()) shell.window.restore()
    shell.window.focus()
  })

  app
    .whenReady()
    // Castlabs' Widevine CDM must be registered before any window opens, or EME calls
    // reject. `components` exists only on the Castlabs build of Electron.
    .then(() => components.whenReady())
    .then(() => {
      registerIpc()
      shell = createShell(USER_AGENT)

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
    shell !== null && event.sender === shell.header.webContents

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
    if (settings.get('general.minimizeToTray')) shell.window.hide()
    else shell.window.close()
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

  ipcMain.handle(CH.settingsGetAll, (e) => (fromChrome(e) ? settings.getAll() : null))

  ipcMain.handle(CH.settingsSet, (e, key: unknown, value: unknown) => {
    if (!fromChrome(e)) return null
    const next = settings.set(key, value)
    applyLiveSettings()
    if (shell && !shell.header.webContents.isDestroyed()) {
      shell.header.webContents.send(CH.settingsChanged, next)
    }
    return next
  })
}

/** Settings that take effect without a restart. */
function applyLiveSettings(): void {
  if (!shell) return
  shell.content.webContents.setZoomFactor(settings.get('appearance.zoomFactor') / 100)
}
