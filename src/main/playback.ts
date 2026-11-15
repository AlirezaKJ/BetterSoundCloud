import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { app } from 'electron'
import { mprisNameFor, nextVolume, ourSinkInputs, readDbusNames } from '@shared/playback'
import type { ShortcutStatus } from '@shared/shortcuts'
import { isDev } from './env'

/**
 * Playback control: the one place in the app that reaches SoundCloud's player from outside its
 * page (the maintainer's decision, 2026-11-15, closing "the playback-control mechanism" in
 * docs/TODO.md). Every caller goes through here: the playback shortcuts and the tray menu.
 *
 * The mechanism is the system's own media controls, pressed for our own media session. Chromium
 * registers that session for SoundCloud's playback, as it does in a browser, and a press arrives
 * at SoundCloud's own Media Session handlers exactly as a keyboard media key or the media flyout's
 * button does. Nothing is typed, clicked or run in SoundCloud's page (CLAUDE.md §7 and §14 stand).
 * Measured 2026-11-15 in this Electron: SoundCloud registers play, pause, next and previous (its
 * next and previous call its own playNext and playPrev "userInitiated"), and a press takes 1 to 9ms.
 *
 * - Windows: the system media transport controls, through our native helper
 *   (native/media-controls), which finds our session by the app's ID.
 * - Linux: MPRIS over D-Bus (`dbus-send`), our player found by our pid. Not yet seen on a real
 *   Linux machine.
 * - macOS: nothing yet; there is no macOS build.
 *
 * Volume is BetterSoundCloud's own volume in the system mixer, never SoundCloud's slider, which is
 * in its page: the helper's audio sessions on Windows, PulseAudio's `pactl` on Linux.
 *
 * Until SoundCloud has played something in a launch there is no session, and a press does nothing.
 */

export type PlaybackAction = 'playPause' | 'next' | 'previous'
export type VolumeAction = 'up' | 'down' | 'mute'

/** How far one press of a volume key moves it: 5%, as the help text says. */
const VOLUME_STEP = 0.05

type Helper = {
  press(
    appId: string,
    action: PlaybackAction
  ): Promise<'done' | 'no-session' | 'refused' | 'failed'>
  volume(
    pids: number[],
    action: VolumeAction,
    step: number
  ): Promise<{ level: number; muted: boolean } | null>
}

let appId = ''
let helper: Helper | null = null
let availability: Pick<ShortcutStatus, 'playback' | 'volume'> = {
  playback: 'unsupported',
  volume: 'unsupported'
}

/**
 * Get ready, and work out what can be done on this computer. `id` is the app's ID, as
 * `app.setAppUserModelId` was given it: Windows names our media session by it.
 */
export async function startPlayback(id: string): Promise<void> {
  appId = id
  if (process.platform === 'win32') {
    helper = loadHelper()
    const state = helper ? 'ready' : 'no-helper'
    availability = { playback: state, volume: state }
  } else if (process.platform === 'linux') {
    // dbus-send has no --version: asking the session bus for its names is the check, and the very
    // call each press makes first.
    const [dbus, pactl] = await Promise.all([
      run('dbus-send', LIST_NAMES).then(
        () => true,
        () => false
      ),
      run('pactl', ['--version']).then(
        () => true,
        () => false
      )
    ])
    availability = {
      playback: dbus ? 'ready' : 'unsupported',
      volume: pactl ? 'ready' : 'no-mixer'
    }
  }
  if (isDev)
    console.log(`[playback] playback ${availability.playback}, volume ${availability.volume}`)
}

/** What the playback and volume keys can do here, for Settings' lines under them. */
export function playbackAvailability(): Pick<ShortcutStatus, 'playback' | 'volume'> {
  return availability
}

/** Play or pause, skip, or go back, as SoundCloud's own buttons do. */
export function pressPlayback(action: PlaybackAction): void {
  if (availability.playback !== 'ready') return
  const done =
    process.platform === 'win32' && helper ? helper.press(appId, action) : pressMpris(action)
  void done.then(
    (result) => {
      if (isDev) console.log(`[playback] ${action}: ${result}`)
    },
    (error: unknown) => console.warn(`[playback] ${action} failed:`, (error as Error).message)
  )
}

/** Turn BetterSoundCloud up or down by 5% in the system mixer, or mute or unmute it. */
export function changeVolume(action: VolumeAction): void {
  if (availability.volume !== 'ready') return
  // Every process of ours: Chromium plays sound from its audio service, not from this one.
  const pids = app.getAppMetrics().map((metric) => metric.pid)
  const done =
    process.platform === 'win32' && helper
      ? helper.volume(pids, action, VOLUME_STEP)
      : volumeWithPactl(pids, action)
  void done.then(
    (result) => {
      if (isDev) {
        console.log(
          `[playback] volume ${action}: ${result ? `${Math.round(result.level * 100)}%${result.muted ? ', muted' : ''}` : 'no sound of ours yet'}`
        )
      }
    },
    (error: unknown) =>
      console.warn(`[playback] volume ${action} failed:`, (error as Error).message)
  )
}

function loadHelper(): Helper | null {
  try {
    // In a packaged app this resolves inside app.asar; electron-builder unpacks the file
    // (asarUnpack) and Electron's loader follows it to app.asar.unpacked, as for Glass.
    const path = join(import.meta.dirname, '../../resources/native/media-controls.node')
    return createRequire(import.meta.url)(path) as Helper
  } catch (error) {
    console.warn('[playback] the media helper is not available:', (error as Error).message)
    return null
  }
}

/** Run a command and answer what it printed. Ten seconds at most, so a hung bus never piles up. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (error, stdout) => {
      if (error) reject(new Error(`${command}: ${error.message}`))
      else resolve(stdout)
    })
  })
}

const MPRIS_METHODS: Record<PlaybackAction, string> = {
  playPause: 'PlayPause',
  next: 'Next',
  previous: 'Previous'
}

/** Ask the session bus for every name on it. */
const LIST_NAMES = [
  '--session',
  '--print-reply',
  '--dest=org.freedesktop.DBus',
  '/org/freedesktop/DBus',
  'org.freedesktop.DBus.ListNames'
]

async function pressMpris(action: PlaybackAction): Promise<string> {
  const names = readDbusNames(await run('dbus-send', LIST_NAMES))
  const name = mprisNameFor(names, process.pid)
  if (!name) return 'no-session'
  await run('dbus-send', [
    '--session',
    '--type=method_call',
    `--dest=${name}`,
    '/org/mpris/MediaPlayer2',
    `org.mpris.MediaPlayer2.Player.${MPRIS_METHODS[action]}`
  ])
  return 'done'
}

async function volumeWithPactl(
  pids: number[],
  action: VolumeAction
): Promise<{ level: number; muted: boolean } | null> {
  const streams = ourSinkInputs(
    JSON.parse(await run('pactl', ['-f', 'json', 'list', 'sink-inputs'])),
    pids
  )
  const first = streams[0]
  if (!first) return null
  const next = nextVolume(first, action, VOLUME_STEP)
  for (const stream of streams) {
    await run('pactl', [
      'set-sink-input-volume',
      String(stream.index),
      `${Math.round(next.level * 100)}%`
    ])
    await run('pactl', ['set-sink-input-mute', String(stream.index), next.muted ? '1' : '0'])
  }
  return next
}
