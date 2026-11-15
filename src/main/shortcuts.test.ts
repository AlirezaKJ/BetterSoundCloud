import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { defaults } from '@shared/settings-schema'
import type { Settings } from '@shared/settings-schema'
import type { ShortcutStatus } from '@shared/shortcuts'
import {
  applyShortcuts,
  onShortcutStatusChange,
  refreshShortcuts,
  setRecording,
  shortcutStatus,
  startShortcuts
} from './shortcuts'

const held = vi.hoisted(() => {
  /** What `globalShortcut` holds, and the keys another app has (registering them fails). */
  const registered = new Map<string, () => void>()
  return {
    registered,
    otherApps: new Set<string>(),
    unregisterAll: vi.fn(() => registered.clear())
  }
})

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: new EventEmitter(),
    globalShortcut: {
      register: vi.fn((keys: string, run: () => void) => {
        if (held.otherApps.has(keys)) return false
        held.registered.set(keys, run)
        return true
      }),
      unregisterAll: held.unregisterAll
    }
  }
})

vi.mock('./env', () => ({ isDev: false }))

const actions = {
  'shortcuts.playPause': vi.fn(() => true),
  'shortcuts.volumeUp': vi.fn(() => true),
  'shortcuts.reload': vi.fn(() => true),
  // Answers that it did nothing where it was pressed, like Reload inside Settings.
  'shortcuts.back': vi.fn(() => false)
}
let availability: Pick<ShortcutStatus, 'playback' | 'volume'> = {
  playback: 'ready',
  volume: 'ready'
}
startShortcuts({ actions, availability: () => availability })

/** A view, announced the way Electron announces every new webContents. */
function makeView(): EventEmitter {
  const contents = new EventEmitter()
  app.emit('web-contents-created', {}, contents)
  return contents
}

/** Press a key in a view; answers whether main kept it from the view. */
function press(
  view: EventEmitter,
  key: string,
  code: string,
  extra: Record<string, unknown> = {}
): boolean {
  const preventDefault = vi.fn()
  view.emit(
    'before-input-event',
    { preventDefault },
    {
      type: 'keyDown',
      key,
      code,
      control: false,
      alt: false,
      shift: false,
      meta: false,
      ...extra
    }
  )
  return preventDefault.mock.calls.length > 0
}

const settingsWith = (changes: Partial<Settings>): Settings => ({ ...defaults(), ...changes })

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockClear()
  held.otherApps.clear()
  availability = { playback: 'ready', volume: 'ready' }
})

describe('keys in the window', () => {
  it('runs a key’s action and keeps the key from the page', () => {
    const view = makeView()
    applyShortcuts(settingsWith({}))
    expect(press(view, 'r', 'KeyR', { control: true })).toBe(process.platform !== 'darwin')
    if (process.platform !== 'darwin')
      expect(actions['shortcuts.reload']).toHaveBeenCalledWith(view)
    expect(press(view, 'F5', 'F5')).toBe(true)
  })

  it('leaves a key to the view when its action means nothing there, and other keys alone', () => {
    const view = makeView()
    applyShortcuts(settingsWith({}))
    expect(press(view, 'ArrowLeft', 'ArrowLeft', { alt: true })).toBe(false)
    expect(actions['shortcuts.back']).toHaveBeenCalledOnce()
    expect(press(view, 'q', 'KeyQ', { alt: true })).toBe(false)
  })

  it('repeats only the keys that are meant to be held: volume and zoom', () => {
    const view = makeView()
    // Window-only here, so the window hears them.
    applyShortcuts(
      settingsWith({
        'shortcuts.volumeUp': 'F9',
        'shortcuts.volumeUp.anywhere': false,
        'shortcuts.playPause': 'F8',
        'shortcuts.playPause.anywhere': false
      })
    )
    // The page never sees a held key either way.
    expect(press(view, 'F9', 'F9', { isAutoRepeat: true })).toBe(true)
    expect(actions['shortcuts.volumeUp']).toHaveBeenCalledOnce()
    expect(press(view, 'F8', 'F8', { isAutoRepeat: true })).toBe(true)
    expect(actions['shortcuts.playPause']).not.toHaveBeenCalled()
  })

  it('leaves a key registered for other apps to that, so it never acts twice', () => {
    const view = makeView()
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8' }))
    expect(held.registered.has('F8')).toBe(true)
    expect(press(view, 'F8', 'F8')).toBe(false)
    expect(actions['shortcuts.playPause']).not.toHaveBeenCalled()
    // But a key another app holds still works while the window is in front.
    held.otherApps.add('F7')
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F7' }))
    expect(press(view, 'F7', 'F7')).toBe(true)
    expect(actions['shortcuts.playPause']).toHaveBeenCalledWith(view)
  })
})

describe('keys from other apps', () => {
  it('registers the playback and volume keys whose switch is on, and nothing else', () => {
    applyShortcuts(
      settingsWith({
        'shortcuts.playPause': 'Control+Alt+P F8',
        'shortcuts.volumeUp': 'Control+Alt+Up',
        'shortcuts.volumeUp.anywhere': false
      })
    )
    expect([...held.registered.keys()]).toEqual(['Control+Alt+P', 'F8'])
    held.registered.get('F8')?.()
    expect(actions['shortcuts.playPause']).toHaveBeenCalledWith(null)
  })

  it('lets go of every key when they change, and registers none where playback cannot work', () => {
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8' }))
    expect(held.registered.has('F8')).toBe(true)
    applyShortcuts(settingsWith({ 'shortcuts.playPause': '' }))
    expect(held.registered.size).toBe(0)

    availability = { playback: 'no-helper', volume: 'ready' }
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8', 'shortcuts.volumeUp': 'F9' }))
    expect([...held.registered.keys()]).toEqual(['F9'])
  })

  it('says which keys another app holds, and tells when that changes', () => {
    const heard: ShortcutStatus[] = []
    const stop = onShortcutStatusChange((status) => heard.push(status))
    held.otherApps.add('Control+Alt+P')
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'Control+Alt+P F8' }))
    expect(shortcutStatus().taken).toEqual({ 'shortcuts.playPause': ['Control+Alt+P'] })
    expect(heard.at(-1)?.taken).toEqual({ 'shortcuts.playPause': ['Control+Alt+P'] })
    expect(held.registered.has('F8')).toBe(true)

    // The same again tells nobody.
    const count = heard.length
    refreshShortcuts()
    expect(heard.length).toBe(count)
    stop()
  })
})

describe('recording a new key', () => {
  it('lets go of every key while Settings records, and answers none in its view', () => {
    const settingsView = makeView()
    const other = makeView()
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8' }))
    setRecording(settingsView as never, true)
    expect(held.registered.size).toBe(0)
    expect(press(settingsView, 'F5', 'F5')).toBe(false)
    // Another view still has its keys.
    expect(press(other, 'F5', 'F5')).toBe(true)

    // A change while recording waits until it ends.
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F7' }))
    expect(held.registered.size).toBe(0)
    setRecording(settingsView as never, false)
    expect([...held.registered.keys()]).toEqual(['F7'])
  })

  it('ends when the recording view goes away', () => {
    const settingsView = makeView()
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8' }))
    setRecording(settingsView as never, true)
    settingsView.emit('destroyed')
    expect([...held.registered.keys()]).toEqual(['F8'])
  })
})

describe('quitting', () => {
  it('lets go of every key at once', () => {
    applyShortcuts(settingsWith({ 'shortcuts.playPause': 'F8' }))
    held.unregisterAll.mockClear()
    app.emit('will-quit')
    expect(held.unregisterAll).toHaveBeenCalled()
    expect(held.registered.size).toBe(0)
  })
})
