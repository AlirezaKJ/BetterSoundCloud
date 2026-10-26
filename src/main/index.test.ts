import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    createShell: vi.fn(),
    createTray: vi.fn(),
    attachContextMenu: vi.fn(),
    setContentAppearance: vi.fn()
  }
})

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), {
      setName: vi.fn(),
      setPath: vi.fn(),
      getPath: () => '/tmp',
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      quit: vi.fn()
    }),
    components: { whenReady: () => Promise.resolve() },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    nativeTheme: {}
  }
})
vi.mock('@shared/identity', () => ({
  buildUserAgent: () => 'test',
  leaksAppIdentity: () => false
}))
vi.mock('./window', () => ({
  createShell: mocks.createShell,
  toggleSettings: vi.fn(),
  closeSettings: vi.fn(),
  setContentAppearance: mocks.setContentAppearance,
  setPageTheme: vi.fn()
}))
vi.mock('./tray', () => ({ createTray: mocks.createTray }))
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
      on: vi.fn()
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
    contextMenu: view()
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
        'contextMenu'
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
})
