import { join } from 'node:path'
import { app, Menu, Tray } from 'electron'
import { getNowPlaying, onNowPlayingChange } from './now-playing'
import type { PlaybackAction } from './playback'

/**
 * The tray icon and its right-click menu.
 *
 * Its playback items go through main/playback.ts, as the playback shortcuts do: the system's
 * media controls, pressed for our own media session, so SoundCloud's own handlers run and
 * nothing is clicked in its page. They are enabled only while there is a track to act on, and
 * only where playback control works (Windows and Linux): a greyed item that says what it will do
 * beats one that silently does nothing.
 */

// Module scope on purpose. A Tray that nothing references is garbage collected and the
// icon disappears from the tray with no error.
let tray: Tray | null = null

type Controls = {
  /** Play or pause, skip, or go back (main/playback.ts). */
  press: (action: PlaybackAction) => void
  /** Whether playback control works here. */
  ready: () => boolean
}

function buildMenu(showWindow: () => void, controls: Controls): Menu {
  const nowPlaying = getNowPlaying()
  const canPlay = controls.ready() && nowPlaying !== null
  return Menu.buildFromTemplate([
    { label: 'Show BetterSoundCloud', click: showWindow },
    { type: 'separator' },
    {
      label: nowPlaying?.playing ? 'Pause' : 'Play',
      enabled: canPlay,
      click: () => controls.press('playPause')
    },
    { label: 'Next track', enabled: canPlay, click: () => controls.press('next') },
    { label: 'Previous track', enabled: canPlay, click: () => controls.press('previous') },
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

export function createTray(showWindow: () => void, controls: Controls): void {
  tray = new Tray(trayIconPath())
  tray.setToolTip('BetterSoundCloud')
  tray.setContextMenu(buildMenu(showWindow, controls))

  // The menu says Pause while SoundCloud plays and Play while it does not, and its items are
  // enabled only with a track loaded. It is built again only when one of those changes, not on
  // every tick of the clock.
  let shown = ''
  onNowPlayingChange((nowPlaying) => {
    const state = nowPlaying === null ? 'none' : nowPlaying.playing ? 'playing' : 'paused'
    if (state === shown || !tray) return
    shown = state
    tray.setContextMenu(buildMenu(showWindow, controls))
  })

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
