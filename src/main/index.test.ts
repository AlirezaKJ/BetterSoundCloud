import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import { CH } from '@shared/ipc'
import type * as IdentityModule from '@shared/identity'

const mocks = vi.hoisted(() => {
  return {
    createShell: vi.fn(),
    loadSoundCloud: vi.fn(),
    createTray: vi.fn(),
    attachContextMenu: vi.fn(),
    setContentAppearance: vi.fn(),
    ipcOn: vi.fn(),
    ipcHandle: vi.fn()
  }
})

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), {
      setName: vi.fn(),
      setPath: vi.fn(),
      getPath: () => '/tmp',
      // The values measured on the development machine, so the identity test below
      // exercises the real language rules.
      getLocale: () => 'en-US',
      getPreferredSystemLanguages: () => ['en-AU', 'en-US', 'fa'],
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      quit: vi.fn()
    }),
    components: { whenReady: () => Promise.resolve() },
    ipcMain: { on: mocks.ipcOn, handle: mocks.ipcHandle },
    dialog: { showErrorBox: vi.fn() },
    nativeTheme: {}
  }
})
// Only the user agent is faked. The language rules are pure and run for real.
vi.mock('@shared/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof IdentityModule>()),
  buildUserAgent: () => 'test',
  leaksAppIdentity: () => false
}))
vi.mock('./window', () => ({
  createShell: mocks.createShell,
  loadSoundCloud: mocks.loadSoundCloud,
  toggleSettings: vi.fn(),
  closeSettings: vi.fn(),
  setContentAppearance: mocks.setContentAppearance,
  setPageTheme: vi.fn()
}))
vi.mock('./tray', () => ({ createTray: mocks.createTray }))
vi.mock('./page-status', () => ({
  attachPageStatus: vi.fn(),
  noticeSlowStart: vi.fn(),
  runPageStatusAction: vi.fn(),
  showPageStatus: vi.fn()
}))
vi.mock('./context-menu', () => ({
  attachContextMenu: mocks.attachContextMenu,
  hideContextMenu: vi.fn(),
  runContextMenuAction: vi.fn(),
  goToUrlFromMenu: vi.fn()
}))
vi.mock('./blocker', () => ({
  loadBlockerEngine: vi.fn(),
  isBlockerAvailable: () => true,
  setBlockingEnabled: vi.fn(),
  setAudioAdBlocking: vi.fn()
}))
vi.mock('./settings-store', () => ({ get: () => true }))
vi.mock('./themes', () => ({ listThemes: () => [] }))

function makeShell() {
  const view = () => ({
    webContents: {
      isDestroyed: () => false,
      close: vi.fn(),
      setZoomFactor: vi.fn(),
      on: vi.fn(),
      send: vi.fn()
    }
  })
  return {
    window: Object.assign(new EventEmitter(), {
      isMinimized: () => true,
      isVisible: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn()
    }),
    header: view(),
    content: view(),
    settings: view(),
    embedded: view(),
    player: view(),
    contextMenu: view(),
    status: view(),
    pageStatus: null
  }
}

describe('main window lifecycle', () => {
  it('reopens from Dock, tray and second launch with fresh settings and one tray', async () => {
    mocks.createShell.mockImplementation(makeShell)
    await import('./index')
    const { app } = await import('electron')
    await vi.waitFor(() => expect(mocks.createTray).toHaveBeenCalledOnce())
    const showFromTray = mocks.createTray.mock.calls[0]![0] as () => void

    for (const reopen of [
      () => app.emit('activate'),
      showFromTray,
      () => app.emit('second-instance')
    ]) {
      const previous = mocks.createShell.mock.results.at(-1)!.value as ReturnType<
        typeof makeShell
      >
      previous.window.emit('closed')
      for (const key of [
        'header',
        'content',
        'settings',
        'embedded',
        'player',
        'contextMenu',
        'status'
      ] as const) {
        expect(previous[key].webContents.close).toHaveBeenCalledOnce()
      }
      const count = mocks.createShell.mock.calls.length
      reopen()
      expect(mocks.createShell).toHaveBeenCalledTimes(count + 1)
      expect(mocks.setContentAppearance).toHaveBeenLastCalledWith(
        mocks.createShell.mock.results.at(-1)!.value,
        expect.any(Object)
      )
    }

    const current = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    app.emit('activate')
    expect(mocks.createShell).toHaveBeenCalledTimes(4)
    expect(current.window.restore).toHaveBeenCalledOnce()
    expect(current.window.show).toHaveBeenCalledOnce()
    expect(current.window.focus).toHaveBeenCalledOnce()
    expect(mocks.createTray).toHaveBeenCalledOnce()

    // Closing on macOS keeps the same renderer alive for background playback.
    const preventDefault = vi.fn()
    current.window.emit('close', { preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(process.platform === 'darwin' ? 1 : 0)
    expect(current.window.hide).toHaveBeenCalledTimes(process.platform === 'darwin' ? 1 : 0)
    expect(current.content.webContents.close).not.toHaveBeenCalled()
    app.emit('activate')
    expect(mocks.createShell).toHaveBeenCalledTimes(4)

    // Explicit Quit must bypass hiding and allow normal destruction.
    app.emit('before-quit')
    preventDefault.mockClear()
    current.window.hide.mockClear()
    current.window.emit('close', { preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(current.window.hide).not.toHaveBeenCalled()
    current.window.emit('closed')
    expect(current.content.webContents.close).toHaveBeenCalledOnce()
  })

  it('passes what is playing from SoundCloud’s page to our own views, and to nothing else', async () => {
    // Runs after the test above, in the same module instance: that test closed the last
    // window, so open a fresh one.
    const { app } = await import('electron')
    app.emit('activate')
    const shell = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    const ourViews = [
      shell.header,
      shell.settings,
      shell.embedded,
      shell.player,
      shell.contextMenu,
      shell.status
    ]

    const handlerFor = (method: 'on' | 'handle', channel: string) => {
      const registered = method === 'on' ? mocks.ipcOn : mocks.ipcHandle
      return registered.mock.calls.find(([name]) => name === channel)![1] as (
        event: unknown,
        ...args: unknown[]
      ) => unknown
    }
    const fromPage = {
      sender: shell.content.webContents,
      senderFrame: { parent: null, url: 'https://soundcloud.com/discover' }
    }

    // In from the page, as the content preload sends it.
    handlerFor('on', CH.trackUpdate)(fromPage, {
      title: 'Birahe',
      artworkLabel: '',
      artist: 'Ali Sorena',
      href: 'https://soundcloud.com/first-programmer/birahe',
      artworkStyle: '',
      elapsed: '1:20',
      duration: '3:08',
      playing: false,
      liked: false
    })

    // Out to every one of our views...
    const expected = {
      title: 'Birahe',
      artist: 'Ali Sorena',
      url: 'https://soundcloud.com/first-programmer/birahe',
      artwork: '',
      elapsed: 80,
      duration: 188,
      playing: false,
      liked: false
    }
    for (const view of ourViews) {
      expect(view.webContents.send).toHaveBeenCalledWith(CH.nowPlayingChanged, expected)
    }
    // ...but never back to SoundCloud's.
    expect(shell.content.webContents.send).not.toHaveBeenCalled()

    // A view opening later can read it, and SoundCloud's page cannot.
    const get = handlerFor('handle', CH.nowPlayingGet)
    expect(get({ sender: shell.player.webContents })).toEqual(expected)
    expect(get({ sender: shell.content.webContents })).toBeNull()

    // A message from anywhere but SoundCloud's top frame on soundcloud.com is ignored.
    const send = vi.mocked(shell.player.webContents.send)
    send.mockClear()
    handlerFor('on', CH.trackUpdate)(
      { ...fromPage, senderFrame: { parent: {}, url: 'https://soundcloud.com/embed' } },
      { title: 'From an iframe' }
    )
    handlerFor('on', CH.trackUpdate)(
      { sender: shell.player.webContents, senderFrame: null },
      {
        title: 'From one of our views'
      }
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('gives every window the same identity, its header built from the page’s languages', () => {
    // Every window opened by the tests above. The languages come from the electron mock:
    // locale en-US, system languages en-AU, en-US, fa — the development machine's own.
    const identities = mocks.createShell.mock.calls.map(([identity]) => identity as unknown)
    expect(identities.length).toBeGreaterThan(1)
    for (const identity of identities) {
      expect(identity).toEqual({
        userAgent: 'test',
        languages: ['en-US', 'en-AU', 'fa'],
        acceptLanguages: 'en-US,en-AU,en,fa'
      })
      // Built once, not per window.
      expect(identity).toBe(identities[0])
    }
  })
})
