/**
 * Keys: how a key combination is named, stored and compared, and which ones may be used. Pure, so
 * main (which listens for them) and Settings (which records them) follow the same rules, and the
 * rules are tested here once.
 *
 * A combination is stored as an Electron accelerator, the string `globalShortcut` takes:
 * "CommandOrControl+Alt+P", "Shift+F6". Its parts always come in one order, so two spellings of one
 * key are the same string. A shortcut setting holds up to two of them separated by a space
 * ("CommandOrControl+R F5"), or '' for none. CommandOrControl is Ctrl on Windows and Linux and ⌘ on
 * macOS, so a profile carried between them keeps working keys; `Control` is the Mac's own Control
 * key (on Windows and Linux it is the same key as CommandOrControl).
 */

/** A key press, as Electron's `before-input-event` and a renderer's `KeyboardEvent` both give it. */
export type KeyPress = {
  /** What the key types or is called (`KeyboardEvent.key`): "a", "ش", "ArrowLeft", "F5". */
  key: string
  /** Where the key is (`KeyboardEvent.code`): "KeyA", "Digit1", "NumpadAdd". */
  code: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

/** The modifiers we write, in the order we write them. The Windows key is left to Windows. */
const MODIFIERS = ['CommandOrControl', 'Control', 'Alt', 'Shift'] as const
type Modifier = (typeof MODIFIERS)[number]

/** Keys found by where they are, whatever the keyboard layout types there. */
const BY_CODE: Readonly<Record<string, string>> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute'
}

/** The keyboard's own media and volume keys, which already reach SoundCloud through the system. */
const MEDIA_KEYS = new Set([
  'MediaPlayPause',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute'
])

/** A key name a combination may end in, in its one spelling whatever its case, or null. */
function canonicalKeyName(name: string): string | null {
  if (/^[a-z0-9]$/i.test(name)) return name.toUpperCase()
  const f = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(name)
  if (f) return `F${f[1]}`
  if (/^num[0-9]$/i.test(name)) return name.toLowerCase()
  return (
    Object.values(BY_CODE).find((known) => known.toLowerCase() === name.toLowerCase()) ?? null
  )
}

/**
 * The name of the key pressed, as an accelerator writes it, or null for a modifier on its own or a
 * key we do not take (Caps Lock, Print Screen, the context-menu key).
 *
 * A letter is named by what it types when that is a Latin letter, as the system's own shortcuts
 * are: on a French keyboard the key that types A is "A". Under a layout that types no Latin letters
 * (Persian, Russian) it is named by its place, as Windows names it too. Digits and punctuation are
 * named by their place, so Shift does not turn "1" into "!".
 */
export function keyName(press: Pick<KeyPress, 'key' | 'code'>): string | null {
  const { key, code } = press
  if (/^Key[A-Z]$/.test(code)) {
    return /^[a-z]$/i.test(key) ? key.toUpperCase() : code.slice(3)
  }
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const named = BY_CODE[code]
  if (named) return named
  // A media key can arrive with no code at all on some keyboards.
  const media = BY_CODE[key]
  return media && MEDIA_KEYS.has(media) ? media : null
}

/**
 * The combination a key press makes, written as it is stored, or null while only modifiers are
 * held. On macOS ⌘ is CommandOrControl and Control is Control; elsewhere Ctrl is CommandOrControl,
 * and the Windows key is not taken (Windows keeps its own combinations).
 */
export function pressToKeys(press: KeyPress, platform: string): string | null {
  const name = keyName(press)
  if (!name) return null
  if (platform !== 'darwin' && press.meta) return null
  const mac = platform === 'darwin'
  const held: Modifier[] = []
  if (mac ? press.meta : press.control) held.push('CommandOrControl')
  if (mac && press.control) held.push('Control')
  if (press.alt) held.push('Alt')
  if (press.shift) held.push('Shift')
  return [...held, name].join('+')
}

/** What a part of a stored combination may also be written as, by hand or by an older version. */
const ALIASES: Readonly<Record<string, Modifier>> = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  command: 'CommandOrControl',
  cmd: 'CommandOrControl',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift'
}

/**
 * One stored combination in its one spelling, or null when it is not one we can use. Accepts the
 * usual aliases (Ctrl, CmdOrCtrl, Option) and any order of modifiers.
 */
export function normalizeKeys(text: string): string | null {
  const parts = text.trim().split('+')
  const name = parts.pop()
  if (!name || parts.some((part) => part === '')) return null
  const key = canonicalKeyName(name)
  if (!key) return null
  const held = new Set<Modifier>()
  for (const part of parts) {
    const modifier = ALIASES[part.toLowerCase()]
    if (!modifier || held.has(modifier)) return null
    held.add(modifier)
  }
  return [...MODIFIERS.filter((m) => held.has(m)), key].join('+')
}

/** The most combinations one shortcut holds: a main one and a spare, as Reload has F5. */
export const MAX_KEYS = 2

/**
 * A shortcut setting's combinations: each in its one spelling, the unusable and repeated ones
 * dropped, at most two.
 */
export function parseKeys(value: string): string[] {
  const out: string[] = []
  for (const part of value.split(/\s+/)) {
    const keys = part ? normalizeKeys(part) : null
    if (keys && !out.includes(keys) && refusal(keys) === null) out.push(keys)
  }
  return out.slice(0, MAX_KEYS)
}

/** The combinations written back as a setting stores them. */
export const joinKeys = (keys: readonly string[]): string => keys.join(' ')

/** The modifiers and the key a combination presses on this platform, for comparing two. */
function pressed(keys: string, platform: string): string {
  const parts = keys.split('+')
  const name = parts.pop() ?? ''
  const mac = platform === 'darwin'
  // Off the Mac, Control and CommandOrControl are both the Ctrl key.
  const ctrl = parts.includes('Control') || (!mac && parts.includes('CommandOrControl'))
  const cmd = mac && parts.includes('CommandOrControl')
  return [
    ctrl && 'ctrl',
    cmd && 'cmd',
    parts.includes('Alt') && 'alt',
    parts.includes('Shift') && 'shift',
    name
  ]
    .filter(Boolean)
    .join('+')
}

/** Whether two combinations are the same keys on this platform. */
export const sameKeys = (a: string, b: string, platform: string): boolean =>
  pressed(a, platform) === pressed(b, platform)

/** Whether a key press is one of a shortcut setting's combinations. */
export function matchesKeys(press: KeyPress, value: string, platform: string): boolean {
  const keys = pressToKeys(press, platform)
  return keys !== null && parseKeys(value).some((k) => sameKeys(k, keys, platform))
}

/**
 * Why a combination cannot be a shortcut, or null when it can. Without a platform, only the rules
 * that hold everywhere (what a stored setting is checked against).
 *
 * - `alone`: no Ctrl, Alt or ⌘, and not an F key, so it would fire while typing (Shift alone only
 *   types a capital).
 * - `media`: the keyboard's media and volume keys already reach SoundCloud through the system.
 * - `editing`: copy, cut, paste, select all, undo and redo, which every text field needs.
 * - `system`: kept by the system: Alt+F4 and Alt+Tab, or on macOS ⌘Q, ⌘H, ⌘M, ⌘Tab and ⌘Space.
 */
export type Refusal = 'alone' | 'media' | 'editing' | 'system'

export function refusal(keys: string, platform?: string): Refusal | null {
  const parts = keys.split('+')
  const name = parts.pop() ?? ''
  if (MEDIA_KEYS.has(name)) return 'media'
  const ctrlOrCmd = parts.includes('CommandOrControl')
  const strong = ctrlOrCmd || parts.includes('Control') || parts.includes('Alt')
  if (!strong && !/^F\d+$/.test(name)) return 'alone'
  const only = (...want: string[]): boolean =>
    parts.length === want.length && want.every((w) => parts.includes(w))
  if (only('CommandOrControl') && ['C', 'X', 'V', 'A', 'Z', 'Y'].includes(name))
    return 'editing'
  if (only('CommandOrControl', 'Shift') && name === 'Z') return 'editing'
  if (platform === undefined) return null
  if (platform === 'darwin') {
    if (only('CommandOrControl') && ['Q', 'H', 'M', 'Tab', 'Space'].includes(name))
      return 'system'
  } else if (only('Alt') && (name === 'F4' || name === 'Tab')) {
    return 'system'
  }
  return null
}

/** What a refusal says, under the row being recorded, in the keys this platform has. */
export function describeRefusal(why: Refusal, platform: string): string {
  switch (why) {
    case 'alone':
      return platform === 'darwin'
        ? 'Add ⌘, ⌥ or ⌃, or use an F key: on its own it would fire while you type.'
        : 'Add Ctrl or Alt, or use an F key: on its own it would fire while you type.'
    case 'media':
      return 'Your keyboard’s media keys already work. Pick another key.'
    case 'editing':
      return 'Every text box needs that key for copying, pasting or undoing. Pick another.'
    case 'system':
      return 'Your system keeps that key for itself. Pick another.'
  }
}

/** The words on a key chip: Ctrl, Alt, Shift, then the key; ⌘ ⌥ ⇧ ⌃ on a Mac. */
export function keyLabels(keys: string, platform: string): string[] {
  const mac = platform === 'darwin'
  const parts = keys.split('+')
  const name = parts.pop() ?? ''
  const words: Readonly<Record<string, string>> = mac
    ? { CommandOrControl: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' }
    : { CommandOrControl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }
  return [...parts.map((part) => words[part] ?? part), keyLabel(name)]
}

/** How a key is written on its chip. */
function keyLabel(name: string): string {
  const arrows: Readonly<Record<string, string>> = { Up: '↑', Down: '↓', Left: '←', Right: '→' }
  if (arrows[name]) return arrows[name]
  if (/^num[0-9]$/.test(name)) return `Num ${name.slice(3)}`
  const numpad: Readonly<Record<string, string>> = {
    numadd: 'Num +',
    numsub: 'Num −',
    nummult: 'Num ×',
    numdiv: 'Num ÷',
    numdec: 'Num .'
  }
  if (numpad[name]) return numpad[name]
  const words: Readonly<Record<string, string>> = {
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    Escape: 'Esc',
    '-': '−'
  }
  return words[name] ?? name
}

/** A combination in one run of text, for a sentence or a screen reader: "Ctrl+Alt+P", "⌘⌥P". */
export function keyText(keys: string, platform: string): string {
  return keyLabels(keys, platform).join(platform === 'darwin' ? '' : '+')
}

/**
 * Whether the keys pressed for a shortcut already belong to another one, and which: the first
 * shortcut (in `values` order) whose combinations include the same keys on this platform.
 */
export function heldBy<K extends string>(
  keys: string,
  values: Readonly<Partial<Record<K, string>>>,
  own: K,
  platform: string
): K | null {
  for (const [other, value] of Object.entries(values) as [K, string | undefined][]) {
    if (other === own || typeof value !== 'string') continue
    if (parseKeys(value).some((k) => sameKeys(k, keys, platform))) return other
  }
  return null
}

/**
 * What the playback and volume keys can do on this computer, for the line under their first rows,
 * and which of the user's keys another app already holds (so they work only while our window is in
 * front). Main works it out; Settings shows it.
 */
export type ShortcutStatus = {
  /** `ready`, `no-helper` (this build has no media helper), or `unsupported` on this system. */
  playback: 'ready' | 'no-helper' | 'unsupported'
  /** The same for the volume keys, plus `no-mixer`: no sound server we can ask (Linux). */
  volume: 'ready' | 'no-helper' | 'no-mixer' | 'unsupported'
  /** By shortcut setting, the combinations another app had, so they work only in our window. */
  taken: Readonly<Record<string, readonly string[]>>
}

/**
 * A status line, as DESIGN.md writes one: the state in a few words (Ink at 600), then what it
 * means (Muted Ink).
 */
export type StatusLine = { state: string; rest: string }

/** What the line under a group's first row says, or null when the keys can work. */
export function describeShortcutStatus(
  group: 'playback' | 'volume',
  status: ShortcutStatus
): StatusLine | null {
  const state = status[group]
  if (state === 'ready') return null
  if (state === 'no-helper') {
    return {
      state: 'Can’t reach SoundCloud.',
      rest: 'This build has no media helper; the release builds have it.'
    }
  }
  if (state === 'no-mixer') {
    return {
      state: 'No volume control.',
      rest: 'These keys need PulseAudio’s pactl, which this computer doesn’t have.'
    }
  }
  return { state: 'Not on this system yet.', rest: 'These keys work on Windows and Linux.' }
}

/** What a row says about a combination another app holds, under its "Also in other apps". */
export function describeTaken(keys: string, platform: string): StatusLine {
  return {
    state: `${keyText(keys, platform)} is taken.`,
    rest: 'Another app has it, so it works only while BetterSoundCloud is in front.'
  }
}

/**
 * Chrome's zoom steps, so the zoom keys land on the sizes a browser does, less its 33% and 67%:
 * the Zoom setting counts in fives. A value between steps goes to the next step in the direction
 * pressed.
 */
export const ZOOM_STEPS = [25, 50, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500]

export function nextZoom(current: number, direction: 'in' | 'out'): number {
  if (direction === 'in') return ZOOM_STEPS.find((step) => step > current) ?? current
  return [...ZOOM_STEPS].reverse().find((step) => step < current) ?? current
}
