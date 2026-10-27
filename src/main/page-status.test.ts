import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PageStatus } from '@shared/page-status'

/*
 * page-status.ts decides when the user is told something and when it goes away again. The
 * words are tested in src/shared/page-status.test.ts; this pins the behaviour: what shows on
 * which event, the retry schedule, and that nothing acts on a button that is no longer on
 * screen. Electron is mocked so the module can load in node.
 */

const mocks = vi.hoisted(() => ({
  relaunch: vi.fn(),
  quit: vi.fn(),
  isOnline: vi.fn(() => true),
  views: [] as { webContents: FakeContents }[]
}))

type FakeContents = EventEmitter & {
  loadURL: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  forcefullyCrashRenderer: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  isDestroyed: () => boolean
  isFocused: () => boolean
}

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const contents = () =>
    Object.assign(new EventEmitter(), {
      loadURL: vi.fn(() => Promise.resolve()),
      reload: vi.fn(),
      forcefullyCrashRenderer: vi.fn(),
      focus: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      isDestroyed: () => false,
      isFocused: () => false,
      setWindowOpenHandler: vi.fn(),
      // Real hardening runs against this, so the view is built exactly as in the app.
      session: {
        setUserAgent: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn()
      }
    })
  class WebContentsView {
    webContents = contents()
    setBackgroundColor = vi.fn()
    constructor() {
      mocks.views.push(this)
    }
  }
  return {
    app: { relaunch: mocks.relaunch, quit: mocks.quit },
    net: { isOnline: mocks.isOnline },
    shell: { openExternal: vi.fn() },
    WebContentsView
  }
})
vi.mock('./window', () => ({
  START_URL: 'https://soundcloud.com/discover',
  rendererUrl: (entry: string) => `file:///${entry}/index.html`,
  enableDevToolsShortcut: vi.fn()
}))
vi.mock('./env', () => ({ isDev: false }))

const {
  attachPageStatus,
  clearPageStatus,
  noticeSlowStart,
  runPageStatusAction,
  showPageStatus
} = await import('./page-status')

function makeShell() {
  const content = Object.assign(new EventEmitter(), {
    loadURL: vi.fn(() => Promise.resolve()),
    reload: vi.fn(),
    forcefullyCrashRenderer: vi.fn(),
    focus: vi.fn()
  })
  const shell = {
    window: {
      isDestroyed: () => false,
      isFocused: () => true,
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    },
    content: { webContents: content },
    settings: null,
    status: null as { webContents: FakeContents } | null,
    pageStatus: null as PageStatus | null,
    identity: {},
    layout: vi.fn()
  }
  attachPageStatus(shell as never)
  return shell
}

type Shell = ReturnType<typeof makeShell>

const failLoad = (
  shell: Shell,
  code: number,
  error: string,
  url = 'https://soundcloud.com/you'
) => shell.content.webContents.emit('did-fail-load', {}, code, error, url, true)

const press = (shell: Shell, action: Parameters<typeof runPageStatusAction>[1]) =>
  runPageStatusAction(shell as never, action)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.clearAllMocks()
  mocks.isOnline.mockReturnValue(true)
  mocks.views.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a failed load', () => {
  it('is shown, retried on Chrome’s schedule, and cleared the moment the page arrives', () => {
    const shell = makeShell()
    failLoad(shell, -106, 'ERR_INTERNET_DISCONNECTED')

    expect(shell.pageStatus).toEqual({
      kind: 'load-failed',
      code: -106,
      error: 'ERR_INTERNET_DISCONNECTED',
      retrying: false
    })
    // Our own view, over the content area, positioned by layout().
    expect(shell.status).toBe(mocks.views[0])
    expect(shell.window.contentView.addChildView).toHaveBeenCalledWith(mocks.views[0])
    expect(shell.layout).toHaveBeenCalled()

    // First retry after 1s, at the URL that failed.
    vi.advanceTimersByTime(999)
    expect(shell.content.webContents.loadURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(shell.content.webContents.loadURL).toHaveBeenCalledWith('https://soundcloud.com/you')
    expect(shell.pageStatus).toMatchObject({ retrying: true })

    // It fails again: the next try waits 5s.
    failLoad(shell, -106, 'ERR_INTERNET_DISCONNECTED')
    expect(shell.pageStatus).toMatchObject({ retrying: false })
    vi.advanceTimersByTime(4_999)
    expect(shell.content.webContents.loadURL).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(shell.content.webContents.loadURL).toHaveBeenCalledTimes(2)

    // The page arrives: the status and its view are gone, and nothing is left scheduled.
    const view = shell.status!
    shell.content.webContents.emit('did-navigate')
    expect(shell.pageStatus).toBeNull()
    expect(shell.status).toBeNull()
    expect(view.webContents.close).toHaveBeenCalled()
    vi.advanceTimersByTime(3_600_000)
    expect(shell.content.webContents.loadURL).toHaveBeenCalledTimes(2)
  })

  it('does not ask again while offline, but carries on once the network is back', () => {
    const shell = makeShell()
    failLoad(shell, -106, 'ERR_INTERNET_DISCONNECTED')
    mocks.isOnline.mockReturnValue(false)

    vi.advanceTimersByTime(1_000 + 5_000)
    expect(shell.content.webContents.loadURL).not.toHaveBeenCalled()

    mocks.isOnline.mockReturnValue(true)
    vi.advanceTimersByTime(30_000)
    expect(shell.content.webContents.loadURL).toHaveBeenCalledTimes(1)
  })

  it('is not retried by itself where retrying cannot help, but Try again still works once', () => {
    const shell = makeShell()
    failLoad(shell, -202, 'ERR_CERT_AUTHORITY_INVALID')

    vi.advanceTimersByTime(3_600_000)
    expect(shell.content.webContents.loadURL).not.toHaveBeenCalled()

    press(shell, 'retry')
    press(shell, 'retry') // a double click is one request
    expect(shell.content.webContents.loadURL).toHaveBeenCalledOnce()
    expect(shell.pageStatus).toMatchObject({ retrying: true })
  })

  it('retries SoundCloud’s start page rather than a URL that is not SoundCloud’s', () => {
    const shell = makeShell()
    failLoad(shell, -105, 'ERR_NAME_NOT_RESOLVED', 'https://evil.example/')
    press(shell, 'retry')
    expect(shell.content.webContents.loadURL).toHaveBeenCalledWith(
      'https://soundcloud.com/discover'
    )
  })

  it('ignores frames inside the page and navigations that were merely replaced', () => {
    const shell = makeShell()
    shell.content.webContents.emit(
      'did-fail-load',
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      'x',
      false
    )
    failLoad(shell, -3, 'ERR_ABORTED')
    expect(shell.pageStatus).toBeNull()
    expect(shell.status).toBeNull()
  })
})

describe('a crash', () => {
  it('is reported, a clean exit is not, and Reload answers at once', () => {
    const shell = makeShell()
    shell.content.webContents.emit('render-process-gone', {}, { reason: 'clean-exit' })
    expect(shell.pageStatus).toBeNull()

    shell.content.webContents.emit('render-process-gone', {}, { reason: 'oom' })
    expect(shell.pageStatus).toEqual({ kind: 'crashed', reason: 'oom' })

    press(shell, 'reload')
    expect(shell.content.webContents.reload).toHaveBeenCalledOnce()
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
  })
})

describe('a hang', () => {
  it('is asked about over the page, and goes away by itself if the page recovers', () => {
    const shell = makeShell()
    shell.content.webContents.emit('unresponsive')
    expect(shell.pageStatus).toEqual({ kind: 'unresponsive' })
    shell.content.webContents.emit('responsive')
    expect(shell.pageStatus).toBeNull()
    expect(shell.status).toBeNull()
  })

  it('is recovered by Reload without the killed renderer being reported as a crash', () => {
    const shell = makeShell()
    shell.content.webContents.emit('unresponsive')
    press(shell, 'reload')
    expect(shell.content.webContents.forcefullyCrashRenderer).toHaveBeenCalledOnce()
    expect(shell.content.webContents.reload).toHaveBeenCalledOnce()

    shell.content.webContents.emit('render-process-gone', {}, { reason: 'killed' })
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
  })

  it('is not stacked over a status that already hides the page', () => {
    const shell = makeShell()
    failLoad(shell, -106, 'ERR_INTERNET_DISCONNECTED')
    shell.content.webContents.emit('unresponsive')
    expect(shell.pageStatus).toMatchObject({ kind: 'load-failed' })
  })

  it('is dismissed by Wait', () => {
    const shell = makeShell()
    shell.content.webContents.emit('unresponsive')
    press(shell, 'wait')
    expect(shell.pageStatus).toBeNull()
  })
})

describe('buttons', () => {
  it('never act on a status the screen no longer shows', () => {
    const shell = makeShell()
    press(shell, 'quit')
    press(shell, 'restart')
    press(shell, 'reload')
    expect(mocks.quit).not.toHaveBeenCalled()
    expect(mocks.relaunch).not.toHaveBeenCalled()
    expect(shell.content.webContents.reload).not.toHaveBeenCalled()

    failLoad(shell, -106, 'ERR_INTERNET_DISCONNECTED')
    press(shell, 'restart')
    press(shell, 'quit')
    expect(mocks.relaunch).not.toHaveBeenCalled()
    expect(mocks.quit).not.toHaveBeenCalled()
  })

  it('restart the app when Widevine failed, since it cannot be retried in-process', () => {
    const shell = makeShell()
    showPageStatus(shell as never, { kind: 'setup-failed', detail: 'Update check error' })
    press(shell, 'restart')
    expect(mocks.relaunch).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })
})

describe('the view', () => {
  it('is sent the latest status when it loads, so a change made while it loaded is not lost', () => {
    const shell = makeShell()
    showPageStatus(shell as never, { kind: 'setting-up', slow: false })
    const view = shell.status!
    // A change while the view's page is still loading. A message sent now has nobody to hear
    // it, which is exactly why the load handler sends again.
    showPageStatus(shell as never, { kind: 'loading' })
    view.webContents.send.mockClear()

    view.webContents.emit('did-finish-load')
    expect(view.webContents.send).toHaveBeenCalledExactlyOnceWith('page-status:changed', {
      kind: 'loading'
    })

    showPageStatus(shell as never, { kind: 'setup-failed', detail: 'x' })
    expect(view.webContents.send).toHaveBeenLastCalledWith('page-status:changed', {
      kind: 'setup-failed',
      detail: 'x'
    })
    // One view for the whole episode, not one per change.
    expect(mocks.views).toHaveLength(1)
  })

  it('stays under a settings panel the user has open', () => {
    const shell = makeShell()
    const settings = { webContents: {} }
    Object.assign(shell, { settings })
    showPageStatus(shell as never, { kind: 'loading' })
    const added: unknown[] = shell.window.contentView.addChildView.mock.calls.map(
      (call: unknown[]) => call[0]
    )
    expect(added).toEqual([shell.status, settings])
  })

  it('is cleared safely when there is nothing to clear', () => {
    const shell = makeShell()
    expect(() => clearPageStatus(shell as never)).not.toThrow()
  })
})

describe('noticeSlowStart', () => {
  it('says nothing when the first page arrives within a second', () => {
    const shell = makeShell()
    noticeSlowStart(shell as never, () => ({ kind: 'loading' }))
    shell.content.webContents.emit('did-navigate')
    vi.advanceTimersByTime(1_000)
    expect(shell.status).toBeNull()
  })

  it('says what is holding things up once a second has passed', () => {
    const shell = makeShell()
    noticeSlowStart(shell as never, () => ({ kind: 'setting-up', slow: false }))
    vi.advanceTimersByTime(999)
    expect(shell.pageStatus).toBeNull()
    vi.advanceTimersByTime(1)
    expect(shell.pageStatus).toEqual({ kind: 'setting-up', slow: false })
  })
})
