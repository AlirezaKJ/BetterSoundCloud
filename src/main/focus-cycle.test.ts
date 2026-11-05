import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import { app } from 'electron'
import { CH } from '@shared/ipc'
import type { PageStatus } from '@shared/page-status'
import { watchFocusKeys } from './focus-cycle'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { app: new EventEmitter() }
})

type FakeView = {
  webContents: EventEmitter & {
    focus: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

/** A view, announced the way Electron announces every new webContents. */
function makeView(): FakeView {
  const webContents = Object.assign(new EventEmitter(), {
    focus: vi.fn(),
    send: vi.fn(),
    isDestroyed: () => false
  })
  app.emit('web-contents-created', {}, webContents)
  return { webContents }
}

type FakeShell = {
  header: FakeView
  content: FakeView
  embedded: FakeView | null
  status: FakeView | null
  lyrics: FakeView | null
  player: FakeView | null
  settings: FakeView | null
  showcase: FakeView | null
  embeddedShowing: boolean
  pageStatus: PageStatus | null
}

let shell: FakeShell | null = null
watchFocusKeys(() => shell as never)

function makeShell(parts: Partial<FakeShell> = {}): FakeShell {
  shell = {
    header: makeView(),
    content: makeView(),
    embedded: null,
    status: null,
    lyrics: null,
    player: null,
    settings: null,
    showcase: null,
    embeddedShowing: false,
    pageStatus: null,
    ...parts
  }
  return shell
}

/** Press a key in a view; answers whether main kept it from the page. */
function press(view: FakeView, key = 'F6', modifiers: Record<string, boolean> = {}): boolean {
  const preventDefault = vi.fn()
  view.webContents.emit(
    'before-input-event',
    { preventDefault },
    {
      type: 'keyDown',
      key,
      shift: false,
      control: false,
      alt: false,
      meta: false,
      ...modifiers
    }
  )
  return preventDefault.mock.calls.length > 0
}

/** Which of the views has just been given focus. */
function focused(s: FakeShell): string | null {
  const views = Object.entries(s).filter(
    (entry): entry is [string, FakeView] =>
      typeof entry[1] === 'object' && entry[1] !== null && 'webContents' in entry[1]
  )
  const hit = views.find(([, view]) => view.webContents.focus.mock.calls.length > 0)
  for (const [, view] of views) view.webContents.focus.mockClear()
  return hit?.[0] ?? null
}

describe('F6', () => {
  it('moves from our bar to SoundCloud’s page and back, keeping the key from the page', () => {
    const s = makeShell()
    expect(press(s.header)).toBe(true)
    expect(focused(s)).toBe('content')
    // The page is only focused: nothing is sent into it.
    expect(s.content.webContents.send).not.toHaveBeenCalled()

    expect(press(s.content)).toBe(true)
    expect(focused(s)).toBe('header')
    // Our bar is told, so its preload puts focus on a control with the ring drawn.
    expect(s.header.webContents.send).toHaveBeenCalledWith(CH.focusArrived)
  })

  it('takes in the lyrics pane and the player buttons when they are there, and Shift goes back', () => {
    const s = makeShell({ lyrics: makeView(), player: makeView() })
    press(s.header)
    expect(focused(s)).toBe('content')
    press(s.content)
    expect(focused(s)).toBe('lyrics')
    press(s.lyrics!)
    expect(focused(s)).toBe('player')
    press(s.player!)
    expect(focused(s)).toBe('header')

    press(s.header, 'F6', { shift: true })
    expect(focused(s)).toBe('player')
  })

  it('goes to the window buttons over SoundCloud’s header while our bar is hidden', () => {
    const s = makeShell({ embedded: makeView(), embeddedShowing: true })
    press(s.content)
    expect(focused(s)).toBe('embedded')
    press(s.embedded!)
    expect(focused(s)).toBe('content')
  })

  it('keeps to Settings and the bar while Settings is open', () => {
    const s = makeShell({ settings: makeView(), player: makeView() })
    press(s.header)
    expect(focused(s)).toBe('settings')
    press(s.settings!)
    expect(focused(s)).toBe('header')
  })

  it('goes to the status view when it stands in for the page, and skips what it hides', () => {
    const s = makeShell({
      status: makeView(),
      lyrics: makeView(),
      player: makeView(),
      pageStatus: { kind: 'crashed', reason: 'oom' }
    })
    press(s.header)
    expect(focused(s)).toBe('status')
    press(s.status!)
    expect(focused(s)).toBe('header')
  })

  it('leaves every other key, F6 with Ctrl, and the full-screen showcase alone', () => {
    const s = makeShell({ showcase: makeView() })
    expect(press(s.header, 'F5')).toBe(false)
    expect(press(s.header, 'F6', { control: true })).toBe(false)
    expect(press(s.showcase!)).toBe(false)
    expect(focused(s)).toBeNull()
  })
})
