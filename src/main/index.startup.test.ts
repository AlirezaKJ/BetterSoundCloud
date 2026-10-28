import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from 'electron'
import { CH } from '@shared/ipc'
import type { PageStatus } from '@shared/page-status'
import type * as IdentityModule from '@shared/identity'

/*
 * Startup order, around the Widevine install. index.ts runs its startup when it is imported,
 * so every test here imports a fresh copy (`vi.resetModules`) with its own Widevine outcome.
 * The window lifecycle and IPC paths are covered in index.test.ts.
 */

const mocks = vi.hoisted(() => ({
  whenWidevineReady: vi.fn<() => Promise<unknown>>(),
  componentsStatus: vi.fn((): unknown => ({})),
  ipcOn: vi.fn(),
  ipcHandle: vi.fn(),
  createShell: vi.fn(),
  loadSoundCloud: vi.fn(),
  startUrl: vi.fn((_choice: unknown) => 'https://soundcloud.com/discover'),
  rememberLastPage: vi.fn(),
  showPageStatus: vi.fn(),
  noticeSlowStart: vi.fn(),
  showErrorBox: vi.fn(),
  quit: vi.fn(),
  setName: vi.fn(),
  setAppUserModelId: vi.fn(),
  startUpdater: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
  settingsGet: vi.fn((_key: string): unknown => true),
  settingsSet: vi.fn(),
  disableHardwareAcceleration: vi.fn(),
  loadBlockerEngine: vi.fn(),
  setBlockingEnabled: vi.fn(),
  setAudioAdBlocking: vi.fn(),
  setContentAppearance: vi.fn()
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), {
      setName: mocks.setName,
      setAppUserModelId: mocks.setAppUserModelId,
      setPath: vi.fn(),
      getPath: () => '/tmp',
      getLocale: () => 'en-US',
      getPreferredSystemLanguages: () => ['en-US'],
      requestSingleInstanceLock: mocks.requestSingleInstanceLock,
      disableHardwareAcceleration: mocks.disableHardwareAcceleration,
      whenReady: () => Promise.resolve(),
      quit: mocks.quit
    }),
    components: {
      whenReady: mocks.whenWidevineReady,
      status: mocks.componentsStatus,
      WIDEVINE_CDM_ID: 'widevine-id'
    },
    dialog: { showErrorBox: mocks.showErrorBox },
    ipcMain: { on: mocks.ipcOn, handle: mocks.ipcHandle },
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
  setContentAppearance: mocks.setContentAppearance,
  setPageTheme: vi.fn(),
  setContentCover: vi.fn(),
  setContentPicture: vi.fn(),
  toggleLyrics: vi.fn(),
  closeLyrics: vi.fn(),
  openShowcase: vi.fn(),
  closeShowcase: vi.fn()
}))
vi.mock('./lyrics', () => ({
  getLyricsState: () => ({ state: 'idle' }),
  noticeNowPlaying: vi.fn(),
  nudgeLyrics: vi.fn(),
  onLyricsChange: vi.fn(),
  retryLyrics: vi.fn()
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
vi.mock('./start-page', () => ({
  startUrl: mocks.startUrl,
  rememberLastPage: mocks.rememberLastPage
}))
vi.mock('./context-menu', () => ({
  attachContextMenu: vi.fn(),
  hideContextMenu: vi.fn(),
  runContextMenuAction: vi.fn(),
  goToUrlFromMenu: vi.fn()
}))
vi.mock('./blocker', () => ({
  loadBlockerEngine: mocks.loadBlockerEngine,
  isBlockerAvailable: () => true,
  setBlockingEnabled: mocks.setBlockingEnabled,
  setAudioAdBlocking: mocks.setAudioAdBlocking
}))
vi.mock('./settings-store', () => ({ get: mocks.settingsGet, set: mocks.settingsSet }))
vi.mock('./themes', () => ({
  NO_THEME: 'vanilla',
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
vi.mock('./updater', () => ({
  startUpdater: mocks.startUpdater,
  setAutoUpdate: vi.fn(),
  getUpdateStatus: () => ({ state: 'idle', current: '0.8.0', auto: true, kind: 'installer' }),
  onUpdateStatusChange: vi.fn(),
  runUpdateAction: vi.fn()
}))

type FakeView = { webContents: { isDestroyed: () => boolean; close: () => void } }

type FakeShell = {
  window: EventEmitter
  header: FakeView
  content: FakeView
  /** The page-status view, which page-status.ts would create. Tests put one in by hand. */
  status: FakeView | null
  pageStatus: PageStatus | null
}

function makeView() {
  return {
    webContents: {
      isDestroyed: () => false,
      close: vi.fn(),
      setZoomFactor: vi.fn(),
      on: vi.fn()
    }
  }
}

function makeShell(): FakeShell {
  return {
    window: new EventEmitter(),
    header: makeView(),
    content: makeView(),
    status: null,
    pageStatus: null
  }
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
  // Every test imports a fresh index.ts onto this same fake `app`; the last copy's listeners
  // would otherwise pile up past Node's limit of ten and warn.
  app.removeAllListeners()
  // Every setting reads as `true` unless a test says otherwise.
  mocks.settingsGet.mockImplementation(() => true)
  mocks.componentsStatus.mockReturnValue({})
  mocks.createShell.mockImplementation(makeShell)
  // What page-status.ts does with it, as far as index.ts can tell: the shell remembers it.
  mocks.showPageStatus.mockImplementation((shell: FakeShell, status: PageStatus) => {
    shell.pageStatus = status
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the profile folder', () => {
  it('is named BetterSoundCloud before anything reads settings or takes the lock', async () => {
    // Renaming it signs every user out. Naming it late puts the settings file and the lock in
    // the default folder, which is v0.7.x's lowercase `bettersoundcloud` on Linux.
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    await start()

    expect(mocks.setName).toHaveBeenCalledOnce()
    expect(mocks.setName).toHaveBeenCalledWith('BetterSoundCloud')
    const named = mocks.setName.mock.invocationCallOrder[0]!
    expect(named).toBeLessThan(mocks.settingsGet.mock.invocationCallOrder[0]!)
    expect(named).toBeLessThan(mocks.requestSingleInstanceLock.mock.invocationCallOrder[0]!)
  })
})

describe('the Windows app ID', () => {
  const realPlatform = process.platform
  const onPlatform = (platform: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  }

  afterEach(() => {
    onPlatform(realPlatform)
  })

  it('is the installer’s appId, set before the first window', async () => {
    // The installer stamps the Start Menu and desktop shortcuts with this ID. If the two
    // differ, Windows shows a pinned shortcut and the running window as two apps.
    const appId = /^appId:\s*(\S+)\s*$/m.exec(readFileSync('electron-builder.yml', 'utf8'))?.[1]
    onPlatform('win32')
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    await start()

    expect(mocks.setAppUserModelId).toHaveBeenCalledOnce()
    expect(mocks.setAppUserModelId).toHaveBeenCalledWith(appId)
    expect(mocks.setAppUserModelId.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.createShell.mock.invocationCallOrder[0]!
    )
  })

  it('is left alone elsewhere, where the method does not exist', async () => {
    onPlatform('linux')
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    await start()

    expect(mocks.setAppUserModelId).not.toHaveBeenCalled()
  })
})

describe('safe mode', () => {
  afterEach(() => {
    process.argv = process.argv.filter((arg) => arg !== '--safe-mode')
  })

  it('turns off hardware acceleration, ad blocking and the theme, and saves nothing', async () => {
    process.argv.push('--safe-mode')
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    await start()

    // The settings mock answers true to everything, so each of these is safe mode's doing.
    expect(mocks.disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(mocks.loadBlockerEngine).not.toHaveBeenCalled()
    expect(mocks.setBlockingEnabled).toHaveBeenLastCalledWith(false)
    expect(mocks.setAudioAdBlocking).toHaveBeenLastCalledWith(false)
    expect(mocks.setContentAppearance).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'vanilla' })
    )
    // Without the engine, the blocker's own correction would have saved `adBlocker: false`.
    expect(mocks.settingsSet).not.toHaveBeenCalled()
  })

  it('leaves all of that to the settings without the flag', async () => {
    mocks.whenWidevineReady.mockReturnValue(new Promise(() => undefined))
    await start()

    expect(mocks.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(mocks.loadBlockerEngine).toHaveBeenCalledOnce()
    expect(mocks.setBlockingEnabled).toHaveBeenLastCalledWith(true)
    expect(mocks.setAudioAdBlocking).toHaveBeenLastCalledWith(true)
  })
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

    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell, 'https://soundcloud.com/discover')
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
    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell, 'https://soundcloud.com/discover')
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
  })

  it('opens the page "On startup, open" names, and remembers where the user goes', async () => {
    mocks.settingsGet.mockImplementation((key) =>
      key === 'general.startupUrl' ? 'lastVisited' : true
    )
    mocks.startUrl.mockReturnValueOnce('https://soundcloud.com/a/b')
    mocks.whenWidevineReady.mockResolvedValue([])
    const shell = await start()
    await settle()

    expect(mocks.startUrl).toHaveBeenCalledWith('lastVisited')
    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell, 'https://soundcloud.com/a/b')
    expect(mocks.rememberLastPage).toHaveBeenCalledWith(shell.content.webContents)
  })

  it('starts the updater only once Widevine has settled, either way', async () => {
    const ready = deferred()
    mocks.whenWidevineReady.mockReturnValue(ready.promise)
    await start()
    expect(mocks.startUpdater).not.toHaveBeenCalled()

    ready.resolve([])
    await settle()
    expect(mocks.startUpdater).toHaveBeenCalledOnce()
    expect(mocks.startUpdater).toHaveBeenCalledWith(expect.objectContaining({ auto: true }))

    // A failed Widevine install does not stop it: an update may be the fix.
    mocks.startUpdater.mockClear()
    const failed = deferred()
    mocks.whenWidevineReady.mockReturnValue(failed.promise)
    await start()
    failed.reject(
      Object.assign(new Error('x'), { errors: [{ message: 'Update check error' }] })
    )
    await settle()
    expect(mocks.startUpdater).toHaveBeenCalledOnce()
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

describe('when Widevine cannot be installed', () => {
  // `components.status()` before and after Chromium's updater finishes by itself, as measured.
  const NOT_YET = {
    'widevine-id': { status: 'not-installed', title: 'Widevine', version: null }
  }
  const INSTALLED = {
    'widevine-id': { status: 'updated', title: 'Widevine', version: '4.10.3112.0' }
  }

  /** Start with the install failing, and the failure screen up. */
  async function startFailed(): Promise<FakeShell> {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mocks.componentsStatus.mockReturnValue(NOT_YET)
    mocks.whenWidevineReady.mockRejectedValue(
      Object.assign(new Error('x'), { errors: [{ message: 'Update check error' }] })
    )
    const shell = await start()
    await settle()
    shell.status = makeView()
    return shell
  }

  /** The handler the newest copy of index.ts registered, since a test may start it twice. */
  function handler(method: 'on' | 'handle', channel: string) {
    const registered = method === 'on' ? mocks.ipcOn : mocks.ipcHandle
    return registered.mock.calls.filter(([name]) => name === channel).at(-1)![1] as (
      event: unknown,
      ...args: unknown[]
    ) => unknown
  }
  const press = (shell: FakeShell, action: string) =>
    handler('on', CH.pageStatusAction)({ sender: shell.status?.webContents }, action)
  const settingsSaysSkipped = (shell: FakeShell) =>
    handler('handle', CH.widevineSkippedGet)({ sender: shell.header.webContents })

  it('opens SoundCloud when the user goes on without it, for this launch only', async () => {
    const shell = await startFailed()
    expect(shell.pageStatus?.kind).toBe('setup-failed')
    expect(settingsSaysSkipped(shell)).toBe(false)

    press(shell, 'continue')
    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell, 'https://soundcloud.com/discover')
    expect(shell.pageStatus).toEqual({ kind: 'loading' })
    // The settings panel says so, and nothing is written: the next launch tries Widevine again.
    expect(settingsSaysSkipped(shell)).toBe(true)
    expect(mocks.settingsSet).not.toHaveBeenCalled()

    // A second press, arriving late from the status view, opens nothing twice.
    press(shell, 'continue')
    expect(mocks.loadSoundCloud).toHaveBeenCalledOnce()
  })

  it('is only offered from the failure screen', async () => {
    const widevine = deferred()
    mocks.whenWidevineReady.mockReturnValue(widevine.promise)
    const shell = await start()
    shell.status = makeView()
    mocks.showPageStatus(shell, { kind: 'setting-up', slow: true })

    press(shell, 'continue')
    expect(mocks.loadSoundCloud).not.toHaveBeenCalled()
    // And only from the status view itself.
    const failed = await startFailed()
    handler('on', CH.pageStatusAction)({ sender: failed.header.webContents }, 'continue')
    expect(mocks.loadSoundCloud).not.toHaveBeenCalled()
  })

  it('opens SoundCloud by itself when the updater installs Widevine late', async () => {
    const shell = await startFailed()
    vi.advanceTimersByTime(15_000)
    expect(mocks.loadSoundCloud).not.toHaveBeenCalled()

    mocks.componentsStatus.mockReturnValue(INSTALLED)
    vi.advanceTimersByTime(15_000)
    expect(mocks.loadSoundCloud).toHaveBeenCalledWith(shell, 'https://soundcloud.com/discover')
    expect(shell.pageStatus).toEqual({ kind: 'loading' })

    // Then it stops looking.
    mocks.componentsStatus.mockClear()
    vi.advanceTimersByTime(60_000)
    expect(mocks.componentsStatus).not.toHaveBeenCalled()
  })

  it('after going on without it, a late install ends the notice without reloading', async () => {
    const shell = await startFailed()
    press(shell, 'continue')

    mocks.componentsStatus.mockReturnValue(INSTALLED)
    vi.advanceTimersByTime(15_000)
    expect(settingsSaysSkipped(shell)).toBe(false)
    // The page is open already and can use Widevine now (measured); reloading would only stop
    // whatever is playing.
    expect(mocks.loadSoundCloud).toHaveBeenCalledOnce()
  })

  it('loads SoundCloud in a reopened window once the user went on without it', async () => {
    // macOS keeps the app running with no window; reopening from the Dock builds a new one.
    const shell = await startFailed()
    press(shell, 'continue')
    shell.window.emit('closed')

    app.emit('activate')
    const reopened = mocks.createShell.mock.results.at(-1)!.value as FakeShell
    expect(reopened).not.toBe(shell)
    expect(mocks.loadSoundCloud).toHaveBeenLastCalledWith(
      reopened,
      'https://soundcloud.com/discover'
    )
  })
})
