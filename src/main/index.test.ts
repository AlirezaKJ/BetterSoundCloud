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
  setPageTheme: vi.fn(),
  setContentCover: vi.fn(),
  setContentPicture: vi.fn()
}))
vi.mock('./background', () => ({
  choosePicture: vi.fn(),
  pictureDataUri: () => '',
  pictureThumbnail: () => null
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

  it('lets the settings panel read Discord’s status and ask for a retry, and nothing on the page', async () => {
    const { app } = await import('electron')
    const presence = await import('./presence')
    app.emit('activate')
    const shell = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    const handlerFor = (method: 'on' | 'handle', channel: string) => {
      const registered = method === 'on' ? mocks.ipcOn : mocks.ipcHandle
      return registered.mock.calls.find(([name]) => name === channel)![1] as (
        event: unknown
      ) => unknown
    }

    const get = handlerFor('handle', CH.presenceStatusGet)
    expect(get({ sender: shell.settings.webContents })).toEqual({ state: 'off' })
    expect(get({ sender: shell.content.webContents })).toBeNull()

    const retry = handlerFor('on', CH.presenceRetry)
    retry({ sender: shell.content.webContents })
    expect(presence.retryPresenceNow).not.toHaveBeenCalled()
    retry({ sender: shell.settings.webContents })
    expect(presence.retryPresenceNow).toHaveBeenCalledOnce()
  })

  it('lets only the settings panel list, switch and configure plugins', async () => {
    const { app } = await import('electron')
    const plugins = await import('./plugins')
    app.emit('activate')
    const shell = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    const handlerFor = (method: 'on' | 'handle', channel: string) => {
      const registered = method === 'on' ? mocks.ipcOn : mocks.ipcHandle
      return registered.mock.calls.find(([name]) => name === channel)![1] as (
        event: unknown,
        ...args: unknown[]
      ) => unknown
    }
    const fromSettings = { sender: shell.settings.webContents }
    const fromPage = { sender: shell.content.webContents }

    expect(handlerFor('handle', CH.pluginsList)(fromSettings)).toEqual([])
    expect(handlerFor('handle', CH.pluginsList)(fromPage)).toBeNull()

    expect(handlerFor('handle', CH.pluginSetEnabled)(fromPage, 'lastfm', true)).toBeNull()
    expect(handlerFor('handle', CH.pluginSetEnabled)(fromSettings, 'lastfm', 'yes')).toBeNull()
    expect(plugins.setPluginEnabled).not.toHaveBeenCalled()
    expect(handlerFor('handle', CH.pluginSetEnabled)(fromSettings, 'lastfm', true)).toEqual({
      plugins: [],
      error: ''
    })
    expect(plugins.setPluginEnabled).toHaveBeenCalledWith('lastfm', true)

    handlerFor('on', CH.pluginsOpenFolder)(fromPage)
    handlerFor('on', CH.pluginAction)(fromPage, 'lastfm', 'connect')
    expect(plugins.openPluginsFolder).not.toHaveBeenCalled()
    expect(plugins.runPluginAction).not.toHaveBeenCalled()
  })

  it('lets only our settings UI list, copy and open themes, and never with a path', async () => {
    const { app } = await import('electron')
    const themes = await import('./themes')
    app.emit('activate')
    const shell = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    const handlerFor = (method: 'on' | 'handle', channel: string) => {
      const registered = method === 'on' ? mocks.ipcOn : mocks.ipcHandle
      return registered.mock.calls.find(([name]) => name === channel)![1] as (
        event: unknown,
        ...args: unknown[]
      ) => unknown
    }
    const fromSettings = { sender: shell.settings.webContents }
    const fromPage = { sender: shell.content.webContents }

    expect(handlerFor('handle', CH.themesList)(fromSettings)).toEqual([])
    expect(handlerFor('handle', CH.themesList)(fromPage)).toBeNull()

    expect(handlerFor('handle', CH.themeCopy)(fromPage, 'darkcloud')).toEqual({
      error: 'Not allowed.'
    })
    expect(handlerFor('handle', CH.themeCopy)(fromSettings, { id: 'darkcloud' })).toEqual({
      error: 'Not allowed.'
    })
    handlerFor('on', CH.themesOpenFolder)(fromPage)
    handlerFor('on', CH.themeOpenFile)(fromPage, 'darkcloud')
    handlerFor('on', CH.themeOpenFile)(fromSettings, ['darkcloud'])
    expect(themes.copyThemeToUserFolder).not.toHaveBeenCalled()
    expect(themes.openThemesFolder).not.toHaveBeenCalled()
    expect(themes.openThemeFile).not.toHaveBeenCalled()

    // The service's refusal reaches the panel as words, not as a rejected promise.
    vi.mocked(themes.copyThemeToUserFolder).mockImplementationOnce(() => {
      throw new Error('“Dark Cloud” is already one of yours.')
    })
    expect(handlerFor('handle', CH.themeCopy)(fromSettings, 'darkcloud')).toEqual({
      error: '“Dark Cloud” is already one of yours.'
    })
    handlerFor('on', CH.themesOpenFolder)(fromSettings)
    handlerFor('on', CH.themeOpenFile)(fromSettings, 'darkcloud')
    expect(themes.openThemesFolder).toHaveBeenCalledOnce()
    expect(themes.openThemeFile).toHaveBeenCalledWith('darkcloud')
  })

  it('lets only our settings UI choose a background picture, and takes no path from it', async () => {
    const { app } = await import('electron')
    const background = await import('./background')
    app.emit('activate')
    const shell = mocks.createShell.mock.results.at(-1)!.value as ReturnType<typeof makeShell>
    const handle = (channel: string) =>
      mocks.ipcHandle.mock.calls.find(([name]) => name === channel)![1] as (
        event: unknown,
        ...args: unknown[]
      ) => unknown
    const fromSettings = { sender: shell.settings.webContents }
    const fromPage = { sender: shell.content.webContents }

    expect(handle(CH.backgroundPicture)(fromPage)).toBeNull()
    expect(await handle(CH.backgroundChoosePicture)(fromPage, 'C:/secret.jpg')).toEqual({
      thumbnail: null,
      error: 'Not allowed.'
    })
    expect(background.choosePicture).not.toHaveBeenCalled()

    // A cancelled dialog is not an error.
    vi.mocked(background.choosePicture).mockResolvedValueOnce({ status: 'cancelled' })
    expect(await handle(CH.backgroundChoosePicture)(fromSettings, 'C:/secret.jpg')).toEqual({
      thumbnail: null,
      error: ''
    })
    // The handler ignores anything the view sends: the dialog is the only way a file is picked.
    expect(background.choosePicture).toHaveBeenCalledWith(shell.window)
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
