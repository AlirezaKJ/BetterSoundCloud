import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PluginView } from '@shared/plugins'

/*
 * The plugin service: what it finds, what it starts, what it lets a plugin do. Real folders on
 * disk (a temporary directory), a fake plugin process, Electron mocked. The far side — the
 * sandbox inside that process — has its own tests.
 */

class FakeChild extends EventEmitter {
  postMessage = vi.fn()
  kill = vi.fn()
  stdout = null
  stderr = null
  /** The message main sent first: what to run. */
  get started() {
    return (this.postMessage.mock.calls[0]?.[0] ?? null) as {
      type: string
      plugin: { id: string; code: string; permissions: string[]; settings: object }
    } | null
  }
  /** Everything main sent after `start`. */
  sent(type: string) {
    return this.postMessage.mock.calls
      .map(([m]) => m as { type: string })
      .filter((m) => m.type === type)
  }
}

const mocks = vi.hoisted(() => ({
  children: [] as FakeChild[],
  secrets: new Map<string, string>(),
  openInBrowser: vi.fn(),
  openPath: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/unused' },
  shell: { openPath: mocks.openPath },
  utilityProcess: {
    fork: vi.fn(() => {
      const child = new FakeChild()
      mocks.children.push(child)
      return child
    })
  }
}))
vi.mock('./secrets', () => ({
  getSecret: (ns: string, key: string) => mocks.secrets.get(`${ns}/${key}`) ?? null,
  setSecret: (ns: string, key: string, value: string) =>
    mocks.secrets.set(`${ns}/${key}`, value),
  deleteSecret: (ns: string, key: string) => mocks.secrets.delete(`${ns}/${key}`)
}))
vi.mock('./session', () => ({ openInBrowser: mocks.openInBrowser }))
vi.mock('./env', () => ({ isDev: false }))

let root: string

function writePlugin(
  dir: string,
  manifest: Record<string, unknown>,
  code = 'module.exports = {}'
) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest))
  writeFileSync(join(dir, 'index.js'), code)
}

const DEMO = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  permissions: ['nowPlaying', 'secrets', 'browser:www.last.fm'],
  settings: [
    { key: 'loud', kind: 'boolean', default: true, label: 'Loud' },
    { key: 'token', kind: 'secret', label: 'Token' }
  ]
}

async function load() {
  vi.resetModules()
  const plugins = await import('./plugins')
  const nowPlaying = await import('./now-playing')
  plugins.startPlugins({
    bundled: join(root, 'bundled'),
    user: join(root, 'user'),
    data: join(root, 'data'),
    host: '/fake/plugin-host.js'
  })
  return { ...plugins, ...nowPlaying }
}

const viewOf = (list: PluginView[], id: string, source = 'bundled'): PluginView | undefined =>
  list.find((p) => p.id === id && p.source === source)

/** Answer from the latest fake process, as the sandbox would. */
const host = () => mocks.children.at(-1)!
const reply = () =>
  host().sent('reply').at(-1) as unknown as { ok: boolean; value?: unknown; error?: string }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bsc-plugins-'))
  writePlugin(join(root, 'bundled', 'demo'), DEMO, '/* demo code */ module.exports = {}')
  mocks.children.length = 0
  mocks.secrets.clear()
  mocks.openInBrowser.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

describe('finding plugins', () => {
  it('lists built-in plugins first, then the user’s, with what each can do', async () => {
    writePlugin(join(root, 'user', 'mine'), {
      id: 'mine',
      name: 'Mine',
      version: '0.1',
      author: 'me'
    })
    const { listPlugins } = await load()
    const list = listPlugins()
    expect(list.map((p) => `${p.source}:${p.id}`)).toEqual(['bundled:demo', 'user:mine'])
    expect(viewOf(list, 'demo')?.permissions).toEqual([
      { text: 'See what you’re playing', available: true, approved: false },
      { text: 'Keep secrets on this computer, encrypted', available: true, approved: false },
      { text: 'Open www.last.fm in your browser', available: true, approved: false }
    ])
    expect(viewOf(list, 'demo')?.state).toBe('off')
  })

  it('shows a broken plugin and why, instead of hiding it', async () => {
    mkdirSync(join(root, 'user', 'nojson'), { recursive: true })
    writePlugin(join(root, 'user', 'wrong'), { id: 'other', name: 'Wrong', version: '1' })
    const { listPlugins } = await load()
    const list = listPlugins()
    expect(viewOf(list, 'nojson', 'user')).toMatchObject({
      state: 'broken',
      problem: 'Its plugin.json is missing or is not valid JSON.'
    })
    expect(viewOf(list, 'wrong', 'user')?.problem).toBe(
      'Its id "other" does not match its folder name "wrong".'
    )
  })

  it('does not let a dropped-in folder take a built-in plugin’s id', async () => {
    writePlugin(join(root, 'user', 'demo'), { ...DEMO, name: 'Impostor' })
    const { listPlugins } = await load()
    expect(viewOf(listPlugins(), 'demo', 'user')).toMatchObject({
      state: 'broken',
      problem: '“demo” is the id of a built-in plugin, so this one cannot use it.'
    })
  })

  it('shows a plugin that needs SoundCloud’s page as one that cannot be turned on', async () => {
    writePlugin(join(root, 'user', 'inpage'), {
      id: 'inpage',
      name: 'In page',
      version: '1',
      permissions: ['page']
    })
    const { listPlugins, setPluginEnabled } = await load()
    setPluginEnabled('inpage', true)
    expect(viewOf(listPlugins(), 'inpage', 'user')).toMatchObject({
      state: 'unavailable',
      enabled: false
    })
    expect(mocks.children).toHaveLength(0)
  })
})

describe('turning a plugin on', () => {
  it('approves what it asks for, starts its own process, and sends it its script', async () => {
    const { listPlugins, setPluginEnabled } = await load()
    setPluginEnabled('demo', true)

    expect(mocks.children).toHaveLength(1)
    expect(host().started).toMatchObject({
      type: 'start',
      plugin: {
        id: 'demo',
        code: '/* demo code */ module.exports = {}',
        permissions: DEMO.permissions,
        settings: { loud: true }
      }
    })
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({ enabled: true, state: 'starting' })

    host().emit('message', { type: 'started' })
    host().emit('message', { type: 'status', status: { lead: 'Connected as akj' } })
    host().emit('message', { type: 'actions', actions: [{ id: 'go', label: 'Go' }] })
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({
      state: 'running',
      status: { lead: 'Connected as akj' },
      actions: [{ id: 'go', label: 'Go', disabled: false }]
    })
  })

  it('starts plugins that were on at the last launch', async () => {
    const first = await load()
    first.setPluginEnabled('demo', true)
    mocks.children.length = 0
    await load() // the next launch
    expect(mocks.children).toHaveLength(1)
  })

  it('holds back a new version that asks for more than was approved', async () => {
    const first = await load()
    first.setPluginEnabled('demo', true)
    writePlugin(join(root, 'bundled', 'demo'), {
      ...DEMO,
      permissions: [...DEMO.permissions, 'network:api.example.com']
    })
    mocks.children.length = 0

    const { listPlugins, setPluginEnabled } = await load()
    expect(mocks.children).toHaveLength(0)
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({
      state: 'needs-approval',
      enabled: true
    })

    setPluginEnabled('demo', true)
    expect(mocks.children).toHaveLength(1)
    expect(host().started?.plugin.permissions).toContain('network:api.example.com')
  })

  it('stops it on the way off: asks first, then ends it after three seconds', async () => {
    const { setPluginEnabled, listPlugins } = await load()
    setPluginEnabled('demo', true)
    const child = host()
    child.emit('message', { type: 'started' })

    setPluginEnabled('demo', false)
    expect(child.sent('stop')).toHaveLength(1)
    expect(child.kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3_000)
    expect(child.kill).toHaveBeenCalled()
    child.emit('exit', 0)
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({ state: 'off', enabled: false })
  })
})

describe('what a running plugin may do', () => {
  async function running() {
    const service = await load()
    service.setPluginEnabled('demo', true)
    host().emit('message', { type: 'started' })
    return service
  }

  const call = async (method: string, args: unknown[], callId = 1) => {
    host().emit('message', { type: 'call', callId, method, args })
    await vi.waitFor(() => expect(host().sent('reply').length).toBeGreaterThanOrEqual(callId))
    return reply()
  }

  it('gets what is playing, and follows it', async () => {
    const { setNowPlaying } = await running()
    const track = {
      title: 'Birahe',
      artist: 'A',
      url: '',
      artwork: '',
      elapsed: 1,
      duration: 9,
      playing: true,
      liked: false
    }
    setNowPlaying(track)
    expect(host().sent('nowPlaying').at(-1)).toEqual({ type: 'nowPlaying', value: track })
    expect(await call('nowPlaying.get', [])).toMatchObject({ ok: true, value: track })
  })

  it('opens only the hosts it listed, and refuses the rest with a reason', async () => {
    await running()
    expect(await call('openInBrowser', ['https://www.last.fm/api/auth/'], 1)).toMatchObject({
      ok: true
    })
    expect(mocks.openInBrowser).toHaveBeenCalledWith('https://www.last.fm/api/auth/')

    expect(await call('openInBrowser', ['https://phish.example/'], 2)).toMatchObject({
      ok: false,
      error: 'openInBrowser is not among the permissions this plugin was given'
    })
    expect(mocks.openInBrowser).toHaveBeenCalledTimes(1)
  })

  it('keeps its secrets under its own name, apart from every other plugin', async () => {
    await running()
    expect(await call('secrets.set', ['session', 'sk'], 1)).toMatchObject({ ok: true })
    expect(mocks.secrets.get('plugin:demo/session')).toBe('sk')
    expect(await call('secrets.get', ['session'], 2)).toMatchObject({ ok: true, value: 'sk' })
  })

  it('keeps small values between runs, and refuses ones too big to keep', async () => {
    await running()
    expect(await call('storage.set', ['queue', [1, 2, 3]], 1)).toMatchObject({ ok: true })
    expect(await call('storage.get', ['queue'], 2)).toMatchObject({
      ok: true,
      value: [1, 2, 3]
    })
    expect(await call('storage.set', ['big', 'x'.repeat(200_000)], 3)).toMatchObject({
      ok: false
    })
  })

  it('passes on only the buttons the plugin itself offered', async () => {
    const { runPluginAction } = await running()
    host().emit('message', { type: 'actions', actions: [{ id: 'go', label: 'Go' }] })
    runPluginAction('demo', 'go')
    runPluginAction('demo', 'something-else')
    expect(host().sent('action')).toEqual([{ type: 'action', id: 'go' }])
  })

  it('stores a secret setting encrypted, and never sends it back to the panel', async () => {
    const { setPluginSetting, listPlugins } = await running()
    setPluginSetting('demo', 'token', 'abc')
    setPluginSetting('demo', 'loud', false)
    expect(mocks.secrets.get('plugin:demo/setting:token')).toBe('abc')
    const settings = viewOf(listPlugins(), 'demo') as unknown as {
      settings: { value: unknown; hasValue: boolean }[]
    }
    expect(settings.settings).toMatchObject([
      { value: false, hasValue: true },
      { value: null, hasValue: true }
    ])
    // The plugin hears about the change; the secret is not in it.
    expect(host().sent('settings').at(-1)).toEqual({
      type: 'settings',
      values: { loud: false }
    })
  })

  it('drops messages it does not recognise', async () => {
    const { listPlugins } = await running()
    host().emit('message', { type: 'exec', command: 'rm -rf /' })
    host().emit('message', 'nonsense')
    expect(viewOf(listPlugins(), 'demo')?.state).toBe('running')
    expect(host().sent('reply')).toEqual([])
  })
})

describe('when a plugin goes wrong', () => {
  it('says why it would not start', async () => {
    const { setPluginEnabled, listPlugins } = await load()
    setPluginEnabled('demo', true)
    host().emit('message', { type: 'failed', message: 'activate threw' })
    host().emit('exit', 1)
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({
      state: 'failed',
      problem: 'Couldn’t start: activate threw'
    })
  })

  it('ends one that never finishes starting', async () => {
    const { setPluginEnabled, listPlugins } = await load()
    setPluginEnabled('demo', true)
    vi.advanceTimersByTime(20_000)
    expect(host().kill).toHaveBeenCalled()
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({
      state: 'failed',
      problem: 'It didn’t start within 20 seconds.'
    })
  })

  it('restarts once after a crash that came well after starting, not after an instant one', async () => {
    const { setPluginEnabled, listPlugins } = await load()
    setPluginEnabled('demo', true)
    host().emit('message', { type: 'started' })

    vi.advanceTimersByTime(120_000)
    host().emit('exit', 3)
    vi.advanceTimersByTime(5_000)
    expect(mocks.children).toHaveLength(2)

    // The restarted one crashes straight away: no second restart.
    host().emit('message', { type: 'started' })
    host().emit('exit', 3)
    vi.advanceTimersByTime(60_000)
    expect(mocks.children).toHaveLength(2)
    expect(viewOf(listPlugins(), 'demo')).toMatchObject({
      state: 'failed',
      problem: 'It stopped unexpectedly (exit code 3). Turn it off and on to try again.'
    })
  })
})
