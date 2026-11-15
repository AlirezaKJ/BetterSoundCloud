import { app, globalShortcut } from 'electron'
import type { WebContents } from 'electron'
import { SETTINGS, SETTING_KEYS } from '@shared/settings-schema'
import type { SettingDef, SettingKey, Settings } from '@shared/settings-schema'
import { matchesKeys, parseKeys, pressToKeys, refusal, sameKeys } from '@shared/shortcuts'
import type { KeyPress, ShortcutStatus } from '@shared/shortcuts'
import { isDev } from './env'

/*
 * The shortcuts in Settings → Shortcuts (schema settings of kind `keys`): every key the window
 * answers, and the playback and volume keys that may also work from other apps.
 *
 * - **In the window**, a key is read in `before-input-event`, in every view, before any page sees
 *   it — SoundCloud's included, which it then never reaches. One listener per view, attached as
 *   each view is made (`web-contents-created`), so a view added later takes part by itself.
 * - **From other apps**, the playback and volume keys whose "Also in other apps" switch is on are
 *   registered with `globalShortcut`, and only those, only while they are set: v0.7.x held the
 *   media keys system-wide for its whole life. Windows hands such a key to us and not to the window
 *   in front, so it works in a game too (#127). A key another app already holds cannot be
 *   registered; it still works while our window is in front, and Settings says so.
 * - **While Settings records a key**, none of this listens: the key pressed is for the recorder.
 *
 * Nothing here touches SoundCloud's page. What a key does is its action's business (index.ts);
 * the playback keys go through main/playback.ts.
 */

/**
 * What a shortcut does. `from` is the view the key was pressed in, or null from another app.
 * Answers whether it did something, so a key that means nothing where it was pressed (Reload
 * inside Settings, say) reaches that view as usual.
 */
export type ShortcutAction = (from: WebContents | null) => boolean

type Options = {
  /** Each shortcut setting's action. A setting with none is left to the view (Search settings). */
  actions: Partial<Record<SettingKey, ShortcutAction>>
  /** What the playback and volume keys can do here (main/playback.ts). */
  availability: () => Pick<ShortcutStatus, 'playback' | 'volume'>
}

/** The shortcut settings, in the schema's order, which decides a clash in a hand-edited file. */
const KEY_SETTINGS = SETTING_KEYS.filter((key) => SETTINGS[key].kind === 'keys')

/** Held while a key repeats, these go on repeating; anything else happens once per press. */
const REPEATS: readonly SettingKey[] = [
  'shortcuts.volumeUp',
  'shortcuts.volumeDown',
  'shortcuts.zoomIn',
  'shortcuts.zoomOut'
]

let options: Options | null = null
let values: Settings | null = null
/** The view recording a new key in Settings, while it does. */
let recordingIn: WebContents | null = null
/** What `globalShortcut` holds for us now. */
let registered: string[] = []
let taken: Record<string, string[]> = {}
/** The status last told to the listeners, so they hear only changes. */
let lastStatus = ''
const statusListeners = new Set<(status: ShortcutStatus) => void>()

/** The anywhere switch's setting for a shortcut, if it has one. */
function anywhereOf(key: SettingKey): SettingKey | null {
  const def: SettingDef = SETTINGS[key]
  return def.kind === 'keys' && def.anywhere ? (def.anywhere as SettingKey) : null
}

/** Start listening in every view from now on. Call before the first view exists. */
export function startShortcuts(given: Options): void {
  options = given
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || contents === recordingIn) return
      const key = settingFor(input)
      if (!key) return
      if (input.isAutoRepeat && !REPEATS.includes(key)) {
        // A held key still belongs to its shortcut: keep the repeats from the page too.
        event.preventDefault()
        return
      }
      if (options?.actions[key]?.(contents)) event.preventDefault()
    })
  })
  // Windows keeps a hotkey until its process lets it go; let ours go as soon as we quit.
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/**
 * The shortcut a key pressed in a view is, if any. A key registered for other apps is answered by
 * `globalShortcut` alone: Windows never lets the window see it, and where a system does, it must
 * not act twice.
 */
function settingFor(input: Electron.Input): SettingKey | null {
  if (!values) return null
  const press: KeyPress = {
    key: input.key,
    code: input.code,
    control: input.control,
    alt: input.alt,
    shift: input.shift,
    meta: input.meta
  }
  const keys = pressToKeys(press, process.platform)
  if (!keys || registered.some((other) => sameKeys(other, keys, process.platform))) return null
  for (const key of KEY_SETTINGS) {
    const value = values[key] as string
    if (value && matchesKeys(press, value, process.platform)) return key
  }
  return null
}

/**
 * Take the settings as they are now: register the keys that should work from other apps, and
 * let go of the ones that should not. Called at startup and on every settings change.
 */
export function applyShortcuts(next: Settings): void {
  values = next
  if (recordingIn) return
  register()
}

function register(): void {
  globalShortcut.unregisterAll()
  registered = []
  const nowTaken: Record<string, string[]> = {}
  const availability = options?.availability()
  if (values && availability) {
    for (const key of KEY_SETTINGS) {
      const anywhere = anywhereOf(key)
      if (!anywhere || !values[anywhere]) continue
      const group =
        key === 'shortcuts.volumeUp' ||
        key === 'shortcuts.volumeDown' ||
        key === 'shortcuts.mute'
          ? availability.volume
          : availability.playback
      if (group !== 'ready') continue
      for (const keys of parseKeys(values[key] as string)) {
        if (refusal(keys, process.platform) !== null) continue
        // One key, one shortcut: a clash in a hand-edited file goes to the first in the schema.
        if (registered.some((other) => sameKeys(other, keys, process.platform))) continue
        // False when another app holds the key; a combination Electron cannot read throws.
        let ok: boolean
        try {
          ok = globalShortcut.register(keys, () => {
            if (!recordingIn) options?.actions[key]?.(null)
          })
        } catch {
          ok = false
        }
        if (ok) registered.push(keys)
        else (nowTaken[key] ??= []).push(keys)
      }
    }
  }
  if (isDev && registered.length > 0)
    console.log(`[shortcuts] in other apps: ${registered.join(', ')}`)
  taken = nowTaken
  const status = shortcutStatus()
  if (JSON.stringify(status) !== lastStatus) {
    lastStatus = JSON.stringify(status)
    for (const listener of statusListeners) listener(status)
  }
}

/**
 * Register again with what the playback and volume keys can do now: on Linux that is known only
 * once the tools it needs have answered, after startup (main/playback.ts).
 */
export function refreshShortcuts(): void {
  if (values && !recordingIn) register()
}

/**
 * Settings is recording a key in `contents` (on), or has finished (off). While it records, no key
 * does anything, here or from other apps, so the recorder hears even a key that is already set.
 * A view that goes away while recording ends it.
 */
export function setRecording(contents: WebContents, on: boolean): void {
  if (on) {
    if (recordingIn === contents) return
    recordingIn = contents
    globalShortcut.unregisterAll()
    registered = []
    contents.once('destroyed', () => {
      if (recordingIn === contents) setRecording(contents, false)
    })
  } else if (recordingIn === contents) {
    recordingIn = null
    register()
  }
}

/** What the playback and volume keys can do, and which keys another app holds. */
export function shortcutStatus(): ShortcutStatus {
  return {
    ...(options?.availability() ?? { playback: 'unsupported', volume: 'unsupported' }),
    taken
  }
}

/** Told whenever `shortcutStatus` changes. Answers a function that stops it. */
export function onShortcutStatusChange(listener: (status: ShortcutStatus) => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}
