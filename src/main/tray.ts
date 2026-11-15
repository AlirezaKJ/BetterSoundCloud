import { join } from 'node:path'
import { app, Menu, Tray } from 'electron'

/**
 * The tray icon and its right-click menu.
 *
 * The playback items are deliberately disabled. Nothing can control SoundCloud's player
 * yet — that needs the in-page audio monitor and a decision on how playback is driven,
 * which the safety contract constrains (no synthetic clicks on SoundCloud's controls).
 * A greyed item that says what it will do beats one that silently does nothing; the
 * settings panel makes the same promise with its "Not implemented yet" rows.
 */

// Module scope on purpose. A Tray that nothing references is garbage collected and the
// icon disappears from the tray with no error.
let tray: Tray | null = null

function buildMenu(showWindow: () => void): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show BetterSoundCloud', click: showWindow },
    { type: 'separator' },
    // Enabled once playback control exists. See docs/TODO.md.
    { label: 'Play', enabled: false },
    { label: 'Skip', enabled: false },
    { label: 'Previous Song', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

/**
 * Each platform's own tray file, drawn for the tray's size rather than shrunk from the app's icon
 * (a 1024px icon resized to 16 blurred, and its record vanished on a dark taskbar). Windows' .ico
 * holds a size for every display scale; Linux takes the PNG and its @2x; macOS a black "Template"
 * image, which it recolours for the menu bar. `resources/` is inside the asar at runtime and beside
 * `out/` in dev, so this one path resolves in both.
 */
function trayIconPath(): string {
  const name =
    process.platform === 'win32'
      ? 'tray.ico'
      : process.platform === 'darwin'
        ? 'trayTemplate.png'
        : 'tray.png'
  return join(import.meta.dirname, '../../resources', name)
}

export function createTray(showWindow: () => void): void {
  tray = new Tray(trayIconPath())
  tray.setToolTip('BetterSoundCloud')
  tray.setContextMenu(buildMenu(showWindow))

  // Windows and macOS raise the window on a plain click. Linux tray implementations
  // often deliver no click event at all, which is why "Show BetterSoundCloud" is the
  // first menu item rather than relying on this.
  tray.on('click', showWindow)

  // Windows can leave a ghost icon in the notification area if the process exits without
  // destroying the tray.
  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })
}
