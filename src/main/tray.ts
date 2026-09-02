import { join } from 'node:path'
import { app, Menu, Tray, nativeImage } from 'electron'
import type { Shell } from './window'

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

/** Bring the window back whether it is minimised, hidden, or merely behind something. */
function showWindow(shell: Shell): void {
  const { window } = shell
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
}

function buildMenu(shell: Shell): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show BetterSoundCloud', click: () => showWindow(shell) },
    { type: 'separator' },
    // Enabled once playback control exists. See docs/TODO.md.
    { label: 'Play', enabled: false },
    { label: 'Skip', enabled: false },
    { label: 'Previous Song', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

export function createTray(shell: Shell): void {
  // One icon file serves the installer, the window and the tray. It is 1000x1000, so it
  // is resized here rather than shipping a second asset that can drift from the first.
  // `resources/` is inside the asar at runtime and beside `out/` in dev, so this one
  // path resolves in both.
  const source = nativeImage.createFromPath(
    join(import.meta.dirname, '../../resources/icon.png')
  )
  const icon = source.resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('BetterSoundCloud')
  tray.setContextMenu(buildMenu(shell))

  // Windows and macOS raise the window on a plain click. Linux tray implementations
  // often deliver no click event at all, which is why "Show BetterSoundCloud" is the
  // first menu item rather than relying on this.
  tray.on('click', () => showWindow(shell))

  // Windows can leave a ghost icon in the notification area if the process exits without
  // destroying the tray.
  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })
}
