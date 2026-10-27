import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PageStatus } from '@shared/page-status'
import type * as IdentityModule from '@shared/identity'

/*
 * Startup order, around the Widevine install. index.ts runs its startup when it is imported,
 * so every test here imports a fresh copy (`vi.resetModules`) with its own Widevine outcome.
 * The window lifecycle and IPC paths are covered in index.test.ts.
 */

const mocks = vi.hoisted(() => ({
  whenWidevineReady: vi.fn<() => Promise<unknown>>(),
  createShell: vi.fn(),
  loadSoundCloud: vi.fn(),
  showPageStatus: vi.fn(),
  noticeSlowStart: vi.fn(),
  showErrorBox: vi.fn(),
  quit: vi.fn()
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), {
      setName: vi.fn(),
      setPath: vi.fn(),
      getPath: () => '/tmp',
      getLocale: () => 'en-US',
      getPreferredSystemLanguages: () => ['en-US'],
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      quit: mocks.quit
    }),
    components: { whenReady: mocks.whenWidevineReady },
    dialog: { showErrorBox: mocks.showErrorBox },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    nativeTheme: {}
  }
})
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
  setContentAppearance: vi.fn(),
  setPageTheme: vi.fn(),
  setContentCover: vi.fn(),
  setContentPicture: vi.fn()
}))
vi.mock('./background', () => ({
  choosePicture: vi.fn(),
  pictureDataUri: () => '',
  pictureThumbnail: () => null
}))
vi.mock('./page-status', () => ({
  attachPageStatus: vi.fn(),
  noticeSlowStart: mocks.noticeSlowStart,
  runPageStatusAction: vi.fn(),
  showPageStatus: mocks.showPageStatus
}))
vi.mock('./tray', () => ({ createTray: vi.fn() }))
vi.mock('./context-menu', () => ({
  attachContextMenu: vi.fn(),
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
vi.mock('./themes', () => ({
  listThemes: () => [],
  findTheme: () => null,
  copyThemeToUserFolder: vi.fn(),
  openThemesFolder: vi.fn(),
  openThemeFile: vi.fn(),
  watchUserThemes: vi.fn()
}))
vi.mock('./plugins', () => ({
  startPlugins: vi.fn(),
  listPlugins: () => [],
  pluginViews: () => [],
  onPluginsChange: vi.fn(),
  setPluginEnabled: vi.fn(),
  setPluginSetting: vi.fn(),
  runPluginAction: vi.fn(),
  openPluginsFolder: vi.fn()
}))
// The real one would connect to the Discord app on whatever machine runs the tests.
vi.mock('./presence', () => ({
  setPresenceOptions: vi.fn(),
  getPresenceStatus: () => ({ state: 'off' }),
  onPresenceStatusChange: vi.fn(),
  retryPresenceNow: vi.fn()
}))

type FakeShell = {
  window: EventEmitter
  header: unknown
  content: unknown
  pageStatus: PageStatus | null
}

function makeShell(): FakeShell {
  const view = () => ({
    webContents: {
      isDestroyed: () => false,
      close: vi.fn(),
      setZoomFactor: vi.fn(),
      on: vi.fn()
    }
  })
  return { window: new EventEmitter(), header: view(), content: view(), pageStatus: null }
}

/** A promise the test settles by hand, standing in for `components.whenReady()`. */
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Import a fresh index.ts and let its `whenReady().then(...)` startup run. */
async function start(): Promise<FakeShell> {
  vi.resetModules()
  await import('./index')
  await vi.waitFor(() => expect(mocks.createShell).toHaveBeenCalled())
  return mocks.createShell.mock.results.at(-1)!.value as FakeShell
}

/** Let promise callbacks run without moving the clock. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createShell.mockImplementation(makeShell)
  // What page-status.ts does with it, as far as index.ts can tell: the shell remembers it.
  mocks.showPageStatus.mockImplementation((shell: FakeShell, status: PageStatus) => {
    shell.pageStatus = status
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startup and Widevine', () => {
  it('opens the window first, and loads SoundCloud only once Widevine is ready', async () => {
    const widevine = deferred()
    mocks.whenWidevineReady.mockReturnValue(widevine.promise)
    const shell = await start()

    // The window exists while the install is still going — it used to wait for it.
    expect(mocks.createShell).toHaveBeenCalledOnce()
    expect(mocks.loadSoundCloud).not.toHaveBeenCalled()

    // If the wait is noticeable, it is described as Widevine setting up.
    const current = mocks.noticeSlowStart.mock.calls[0]![1] as () => PageStatus
    expect(current()).toEqual({ kind: 'setting-up', slow: false })
    mocks.showPageStatus(shell, current())

    widevine.resolve([])
    await settle()

    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell)
    // The status on screen moves on to the page itself.
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
    expect(current()).toEqual({ kind: 'loading' })
  })

  it('says so when Widevine cannot be installed, instead of quitting', async () => {
    const widevine = deferred()
    mocks.whenWidevineReady.mockReturnValue(widevine.promise)
    const shell = await start()

    // The shape Castlabs rejects with offline, as measured.
    widevine.reject(
      Object.assign(new Error('Failed to install required components'), {
        errors: [{ message: 'Update check error' }]
      })
    )
    await settle()

    expect(shell.pageStatus).toEqual({ kind: 'setup-failed', detail: 'Update check error' })
    expect(mocks.loadSoundCloud).not.toHaveBeenCalled()
    expect(mocks.quit).not.toHaveBeenCalled()
  })

  it('admits a slow install is slow, and still opens SoundCloud when it finishes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const widevine = deferred()
    mocks.whenWidevineReady.mockReturnValue(widevine.promise)
    const shell = await start()
    mocks.showPageStatus(shell, { kind: 'setting-up', slow: false })

    vi.advanceTimersByTime(19_000)
    expect(shell.pageStatus).toEqual({ kind: 'setting-up', slow: false })
    vi.advanceTimersByTime(1_000)
    expect(shell.pageStatus).toEqual({ kind: 'setting-up', slow: true })

    widevine.resolve([])
    await settle()
    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell)
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
  })

  it('reports a startup failure in a native box before quitting, never silently', async () => {
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    mocks.createShell.mockImplementation(() => {
      throw new Error('renderer files missing')
    })
    vi.resetModules()
    await import('./index')

    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalled())
    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      'BetterSoundCloud couldn’t start',
      expect.stringContaining('renderer files missing')
    )
  })
})
