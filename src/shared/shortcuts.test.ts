import { describe, it, expect } from 'vitest'
import {
  describeRefusal,
  describeShortcutStatus,
  describeTaken,
  heldBy,
  joinKeys,
  keyLabels,
  keyName,
  keyText,
  matchesKeys,
  nextZoom,
  normalizeKeys,
  parseKeys,
  pressToKeys,
  refusal,
  sameKeys,
  ZOOM_STEPS
} from './shortcuts'
import type { KeyPress } from './shortcuts'

/** A key press, as `before-input-event` or a renderer's keydown gives it. */
const press = (key: string, code: string, held: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  control: false,
  alt: false,
  shift: false,
  meta: false,
  ...held
})

describe('naming a key', () => {
  it('names a letter by what it types, or by its place under a layout without Latin letters', () => {
    expect(keyName(press('p', 'KeyP'))).toBe('P')
    // A French keyboard: the key in Q's place types A, and is A, as the system's shortcuts have it.
    expect(keyName(press('a', 'KeyQ'))).toBe('A')
    // Persian: the key in A's place types ش, so it is named by its place.
    expect(keyName(press('ش', 'KeyA'))).toBe('A')
  })

  it('names digits and punctuation by their place, so Shift does not change them', () => {
    expect(keyName(press('!', 'Digit1'))).toBe('1')
    expect(keyName(press('+', 'Equal'))).toBe('=')
    expect(keyName(press('<', 'Comma'))).toBe(',')
  })

  it('names the arrows, the numpad, F keys and the media keys as accelerators do', () => {
    expect(keyName(press('ArrowLeft', 'ArrowLeft'))).toBe('Left')
    expect(keyName(press('+', 'NumpadAdd'))).toBe('numadd')
    expect(keyName(press('0', 'Numpad0'))).toBe('num0')
    expect(keyName(press('F6', 'F6'))).toBe('F6')
    expect(keyName(press('MediaPlayPause', 'MediaPlayPause'))).toBe('MediaPlayPause')
    expect(keyName(press('MediaPlayPause', ''))).toBe('MediaPlayPause')
  })

  it('has no name for a modifier on its own or a key we do not take', () => {
    expect(keyName(press('Control', 'ControlLeft'))).toBeNull()
    expect(keyName(press('Shift', 'ShiftRight'))).toBeNull()
    expect(keyName(press('CapsLock', 'CapsLock'))).toBeNull()
    expect(keyName(press('PrintScreen', 'PrintScreen'))).toBeNull()
  })
})

describe('the combination a press makes', () => {
  it('writes Ctrl as CommandOrControl off the Mac, and its modifiers in one order', () => {
    expect(
      pressToKeys(press('p', 'KeyP', { shift: true, alt: true, control: true }), 'win32')
    ).toBe('CommandOrControl+Alt+Shift+P')
    expect(pressToKeys(press('F6', 'F6', { shift: true }), 'linux')).toBe('Shift+F6')
  })

  it('writes ⌘ as CommandOrControl and Control as Control on a Mac', () => {
    expect(pressToKeys(press('p', 'KeyP', { meta: true }), 'darwin')).toBe('CommandOrControl+P')
    expect(pressToKeys(press('p', 'KeyP', { control: true }), 'darwin')).toBe('Control+P')
  })

  it('waits while only modifiers are held, and leaves the Windows key to Windows', () => {
    expect(pressToKeys(press('Control', 'ControlLeft', { control: true }), 'win32')).toBeNull()
    expect(pressToKeys(press('p', 'KeyP', { meta: true }), 'win32')).toBeNull()
  })
})

describe('stored combinations', () => {
  it('reads the usual aliases and any order into one spelling', () => {
    expect(normalizeKeys('ctrl+alt+p')).toBe('Control+Alt+P')
    expect(normalizeKeys('Shift+CmdOrCtrl+Alt+p')).toBe('CommandOrControl+Alt+Shift+P')
    expect(normalizeKeys('Option+Left')).toBe('Alt+Left')
  })

  it('refuses what is not a combination', () => {
    for (const bad of ['', '+', 'Ctrl+', 'Ctrl+Ctrl+P', 'Hyper+P', 'Ctrl+Banana', 'Ctrl++P']) {
      expect(normalizeKeys(bad), bad).toBeNull()
    }
  })

  it('keeps at most two, without repeats or keys that cannot be used, in the order given', () => {
    expect(parseKeys('F5 CommandOrControl+R F5 F7')).toEqual(['F5', 'CommandOrControl+R'])
    expect(parseKeys('  CommandOrControl+C  F8 ')).toEqual(['F8'])
    // Key names are read whatever their case.
    expect(joinKeys(parseKeys('ctrl+r f5 alt+left'))).toBe('Control+R F5')
    expect(normalizeKeys('alt+pageup')).toBe('Alt+PageUp')
    expect(normalizeKeys('Ctrl+NUMADD')).toBe('Control+numadd')
  })
})

describe('matching and clashes', () => {
  it('matches a press against any of a setting’s combinations', () => {
    const reload = 'CommandOrControl+R F5'
    expect(matchesKeys(press('r', 'KeyR', { control: true }), reload, 'win32')).toBe(true)
    expect(matchesKeys(press('F5', 'F5'), reload, 'win32')).toBe(true)
    expect(
      matchesKeys(press('r', 'KeyR', { control: true, shift: true }), reload, 'win32')
    ).toBe(false)
    expect(matchesKeys(press('r', 'KeyR', { meta: true }), reload, 'darwin')).toBe(true)
    expect(matchesKeys(press('r', 'KeyR', { control: true }), reload, 'darwin')).toBe(false)
  })

  it('treats Control and CommandOrControl as one key off the Mac, and two on it', () => {
    expect(sameKeys('Control+P', 'CommandOrControl+P', 'win32')).toBe(true)
    expect(sameKeys('Control+P', 'CommandOrControl+P', 'darwin')).toBe(false)
  })

  it('names the shortcut that already has a key', () => {
    const values = {
      'a.reload': 'CommandOrControl+R F5',
      'a.play': 'Control+Alt+P',
      'a.none': ''
    }
    expect(heldBy('F5', values, 'a.play', 'win32')).toBe('a.reload')
    expect(heldBy('CommandOrControl+Alt+P', values, 'a.reload', 'win32')).toBe('a.play')
    expect(heldBy('CommandOrControl+Alt+P', values, 'a.reload', 'darwin')).toBeNull()
    // Its own keys are not a clash.
    expect(heldBy('F5', values, 'a.reload', 'win32')).toBeNull()
  })
})

describe('keys that cannot be shortcuts', () => {
  it('needs Ctrl, Alt or ⌘, or an F key: anything else would fire while typing', () => {
    expect(refusal('P')).toBe('alone')
    expect(refusal('Shift+P')).toBe('alone')
    expect(refusal('Space')).toBe('alone')
    expect(refusal('F8')).toBeNull()
    expect(refusal('Shift+F6')).toBeNull()
    expect(refusal('Alt+P')).toBeNull()
  })

  it('leaves the media keys, and copy, paste and undo, to what already has them', () => {
    expect(refusal('MediaPlayPause')).toBe('media')
    expect(refusal('CommandOrControl+VolumeUp')).toBe('media')
    expect(refusal('CommandOrControl+C')).toBe('editing')
    expect(refusal('CommandOrControl+Shift+Z')).toBe('editing')
    // With another modifier it is a different key.
    expect(refusal('CommandOrControl+Alt+C')).toBeNull()
  })

  it('leaves each system its own keys', () => {
    expect(refusal('Alt+F4', 'win32')).toBe('system')
    expect(refusal('Alt+F4', 'darwin')).toBeNull()
    expect(refusal('CommandOrControl+Q', 'darwin')).toBe('system')
    expect(refusal('CommandOrControl+Q', 'win32')).toBeNull()
    // Without a platform, only what holds everywhere (a stored setting is checked so).
    expect(refusal('Alt+F4')).toBeNull()
  })
})

describe('the words for a key', () => {
  it('writes chips the way each system writes its keys', () => {
    expect(keyLabels('CommandOrControl+Alt+Shift+Left', 'win32')).toEqual([
      'Ctrl',
      'Alt',
      'Shift',
      '←'
    ])
    expect(keyLabels('CommandOrControl+Alt+P', 'darwin')).toEqual(['⌘', '⌥', 'P'])
    expect(keyLabels('CommandOrControl+numadd', 'linux')).toEqual(['Ctrl', 'Num +'])
    expect(keyLabels('CommandOrControl+-', 'win32')).toEqual(['Ctrl', '−'])
  })

  it('runs a combination together for a sentence', () => {
    expect(keyText('CommandOrControl+Alt+P', 'win32')).toBe('Ctrl+Alt+P')
    expect(keyText('CommandOrControl+Alt+P', 'darwin')).toBe('⌘⌥P')
    expect(describeTaken('Control+Alt+P', 'win32')).toEqual({
      state: 'Ctrl+Alt+P is taken.',
      rest: 'Another app has it, so it works only while BetterSoundCloud is in front.'
    })
  })

  it('names the modifiers each system has when a key needs one', () => {
    expect(describeRefusal('alone', 'win32')).toMatch(/^Add Ctrl or Alt/)
    expect(describeRefusal('alone', 'darwin')).toMatch(/^Add ⌘, ⌥ or ⌃/)
  })

  it('says why a group of keys cannot work here, and nothing when it can', () => {
    const status = { playback: 'ready', volume: 'no-mixer', taken: {} } as const
    expect(describeShortcutStatus('playback', status)).toBeNull()
    expect(describeShortcutStatus('volume', status)?.rest).toMatch(/pactl/)
    expect(
      describeShortcutStatus('playback', { ...status, playback: 'no-helper' })?.rest
    ).toMatch(/media helper/)
  })
})

describe('zoom steps', () => {
  it('steps through a browser’s sizes, in fives like the Zoom setting', () => {
    expect(nextZoom(100, 'in')).toBe(110)
    expect(nextZoom(100, 'out')).toBe(90)
    // Between steps, to the next one in the direction pressed.
    expect(nextZoom(105, 'in')).toBe(110)
    expect(nextZoom(105, 'out')).toBe(100)
    // At the ends it stays.
    expect(nextZoom(500, 'in')).toBe(500)
    expect(nextZoom(25, 'out')).toBe(25)
    for (const step of ZOOM_STEPS) expect(step % 5, String(step)).toBe(0)
  })
})
