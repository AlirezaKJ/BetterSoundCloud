import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runPlugin } from './plugin-sandbox'
import type { Bridge, PluginStart } from './plugin-sandbox'

/*
 * The sandbox, with real plugin scripts. What these pin is what a plugin author can rely on —
 * and what a plugin cannot reach by accident. (Not by design: Node's `vm` is no security
 * boundary, and plugin-sandbox.ts says so. These are about honest plugins.)
 */

function bridge(overrides: Partial<Bridge> = {}) {
  const logs: string[] = []
  const fake: Bridge = {
    call: vi.fn(() => Promise.resolve(null)),
    status: vi.fn(),
    actions: vi.fn(),
    log: (level, message) => logs.push(`${level}: ${message}`),
    fetch: vi.fn(() => Promise.resolve({ status: 200, body: '{"ok":true}' })),
    ...overrides
  }
  return { fake, logs }
}

function plugin(code: string, permissions: string[] = []): PluginStart {
  return { id: 'test', version: '1.0.0', code, filename: 'test.js', permissions, settings: {} }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the context', () => {
  it('has no require, process, file system or fetch — only the API', async () => {
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(`module.exports = { activate(bsc) {
        bsc.log([typeof require, typeof process, typeof fetch, typeof globalThis.Buffer].join(','))
      } }`),
      fake
    )
    expect(logs).toEqual(['info: undefined,undefined,undefined,undefined'])
  })

  it('offers exactly the globals that resources/plugins/sandbox.d.ts declares', async () => {
    // The declaration is what plugin authors and the bundled plugins' type-check believe exists.
    // If the two drift, a plugin type-checks against a global that is not there, or misses one.
    const declared = [
      ...readFileSync(
        join(import.meta.dirname, '../../resources/plugins/sandbox.d.ts'),
        'utf8'
      ).matchAll(/^declare (?:const|function|class) (\w+)/gm)
    ].map((m) => m[1])
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(
        `module.exports = { activate(bsc) { bsc.log(Object.keys(globalThis).sort().join(',')) } }`
      ),
      fake
    )
    expect(logs[0]).toBe(`info: ${[...new Set(declared)].sort().join(',')}`)
  })

  it('runs the script strictly, so a typo is an error rather than a new global', async () => {
    const { fake } = bridge()
    await expect(
      runPlugin(plugin(`module.exports = { activate() { misspelt = 1 } }`), fake)
    ).rejects.toThrow(/misspelt is not defined/)
  })

  it('says how a plugin script should be shaped when it is not', async () => {
    const { fake } = bridge()
    await expect(runPlugin(plugin(`module.exports = 42`), fake)).rejects.toThrow(
      /module\.exports = \{ activate/
    )
  })
})

describe('permissions, at the API', () => {
  it('refuses now-playing without the permission, and passes it on with it', async () => {
    const { fake } = bridge()
    await expect(
      runPlugin(
        plugin(`module.exports = { activate(bsc) { bsc.nowPlaying.onChange(() => {}) } }`),
        fake
      )
    ).rejects.toThrow(/needs the "nowPlaying" permission/)

    const { fake: allowed, logs } = bridge()
    const running = await runPlugin(
      plugin(
        `module.exports = { activate(bsc) { bsc.nowPlaying.onChange((np) => bsc.log(np && np.title)) } }`,
        ['nowPlaying']
      ),
      allowed
    )
    running.nowPlaying({
      title: 'Birahe',
      artist: 'Ali Sorena',
      url: '',
      artwork: '',
      elapsed: 1,
      duration: 2,
      playing: true,
      liked: false
    })
    expect(logs).toEqual(['info: Birahe'])
  })

  it('makes https requests only to listed hosts, refusing the rest before anything is sent', async () => {
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(
        `module.exports = { async activate(bsc) {
          for (const url of ['https://ws.audioscrobbler.com/2.0/', 'https://evil.example/', 'http://ws.audioscrobbler.com/']) {
            try { const r = await bsc.fetch(url); bsc.log('ok', r.status, JSON.stringify(await r.json())) }
            catch (e) { bsc.log('refused', e.message) }
          }
        } }`,
        ['network:ws.audioscrobbler.com']
      ),
      fake
    )
    expect(fake.fetch).toHaveBeenCalledOnce()
    expect(fake.fetch).toHaveBeenCalledWith('https://ws.audioscrobbler.com/2.0/', {})
    expect(logs[0]).toBe('info: ok 200 {"ok":true}')
    expect(logs[1]).toMatch(/refused .*needs the "network:evil\.example" permission/)
    expect(logs[2]).toMatch(/refused bsc\.fetch only makes https requests/)
  })

  it('opens only listed https hosts in the browser', async () => {
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(
        `module.exports = { async activate(bsc) {
          await bsc.openInBrowser('https://www.last.fm/api/auth/')
          try { await bsc.openInBrowser('https://phish.example/') } catch (e) { bsc.log(e.message) }
        } }`,
        ['browser:www.last.fm']
      ),
      fake
    )
    expect(fake.call).toHaveBeenCalledWith('openInBrowser', ['https://www.last.fm/api/auth/'])
    expect(fake.call).toHaveBeenCalledTimes(1)
    expect(logs[0]).toMatch(/needs the "browser:phish\.example" permission/)
  })
})

describe('errors and teardown', () => {
  it('reports a throwing listener, and an async one rejecting, without stopping the plugin', async () => {
    const { fake, logs } = bridge()
    const running = await runPlugin(
      plugin(
        `module.exports = { activate(bsc) {
          bsc.actions.onPress(() => { throw new Error('sync boom') })
          bsc.actions.onPress(async () => { throw new Error('async boom') })
          bsc.actions.onPress((id) => bsc.log('still here', id))
        } }`
      ),
      fake
    )
    running.action('go')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(logs).toContain('info: still here go')
    expect(
      logs.some((l) => l.startsWith('warn: An action listener failed: Error: sync boom'))
    ).toBe(true)
    // The rejection comes from a promise made inside the plugin's own context, which is not this
    // realm's Promise. It still has to be reported.
    expect(logs.some((l) => l.includes('async boom'))).toBe(true)
  })

  it('calls deactivate on stop, then clears whatever the plugin left running', async () => {
    vi.useFakeTimers()
    const { fake, logs } = bridge()
    const running = await runPlugin(
      plugin(
        `module.exports = {
          activate(bsc) {
            this.bsc = bsc
            setTimeout(() => bsc.log('timer fired'), 10000)
            setInterval(() => bsc.log('tick'), 1000)
            bsc.actions.onPress(() => bsc.log('pressed'))
          },
          deactivate() { this.bsc.log('bye') }
        }`
      ),
      fake
    )
    vi.advanceTimersByTime(2_000)
    expect(logs.filter((l) => l === 'info: tick')).toHaveLength(2)

    await running.stop()
    vi.advanceTimersByTime(60_000)
    running.action('after-stop')
    expect(logs).toEqual(['info: tick', 'info: tick', 'info: bye'])
  })

  it('does not wait forever on an activate that never finishes', async () => {
    vi.useFakeTimers()
    const { fake } = bridge()
    const starting = runPlugin(
      plugin(`module.exports = { activate() { return new Promise(() => {}) } }`),
      fake
    )
    const assertion = expect(starting).rejects.toThrow(/activate did not finish within 10s/)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
  })
})

describe('the API surface', () => {
  it('hashes for signed APIs', async () => {
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(
        `module.exports = { activate(bsc) { bsc.log(bsc.hash.md5('abc'), bsc.hash.sha256('')) } }`
      ),
      fake
    )
    expect(logs[0]).toBe(
      'info: 900150983cd24fb0d6963f7d28e17f72 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('cannot be changed by the plugin it was handed to', async () => {
    const { fake, logs } = bridge()
    await runPlugin(
      plugin(`module.exports = { activate(bsc) {
        try { bsc.fetch = () => 'spoofed' } catch (e) { bsc.log('frozen') }
      } }`),
      fake
    )
    expect(logs).toEqual(['info: frozen'])
  })
})
