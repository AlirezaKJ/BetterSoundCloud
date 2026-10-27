import { describe, it, expect } from 'vitest'
import {
  callAllowed,
  coercePluginSetting,
  describePermission,
  httpsHost,
  isAvailable,
  parsePermission,
  readHostMessage,
  readManifest
} from './plugins'

const VALID = {
  id: 'lastfm',
  name: 'Last.fm',
  version: '1.0.0',
  author: 'BetterSoundCloud',
  description: 'Scrobbles.',
  homepage: 'https://www.last.fm',
  main: 'index.js',
  permissions: [
    'nowPlaying',
    'network:ws.audioscrobbler.com',
    'browser:www.last.fm',
    'secrets'
  ],
  settings: [
    { key: 'nowPlaying', kind: 'boolean', default: true, label: 'Now playing' },
    { key: 'apiKey', kind: 'string', label: 'API key' },
    { key: 'apiSecret', kind: 'secret', label: 'Secret' }
  ]
}

describe('readManifest', () => {
  it('reads a valid plugin.json, filling in what is optional', () => {
    const result = readManifest(VALID, 'lastfm')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.settings).toEqual([
      { key: 'nowPlaying', kind: 'boolean', label: 'Now playing', help: '', default: true },
      { key: 'apiKey', kind: 'string', label: 'API key', help: '', default: '' },
      { key: 'apiSecret', kind: 'secret', label: 'Secret', help: '' }
    ])
    expect(readManifest({ id: 'x', name: 'X', version: '1' }, 'x')).toMatchObject({
      ok: true,
      manifest: { main: 'index.js', permissions: [], settings: [], homepage: '' }
    })
  })

  it('requires the id to match the folder, so a folder says what is in it', () => {
    expect(readManifest(VALID, 'something-else')).toEqual({
      ok: false,
      problem: 'its id "lastfm" does not match its folder name "something-else"'
    })
  })

  it('refuses a script outside the plugin’s own folder', () => {
    for (const main of [
      '../index.js',
      '/etc/passwd.js',
      'C:\\\\x.js',
      'index.mjs',
      'a/../../b.js'
    ]) {
      expect(readManifest({ ...VALID, main }, 'lastfm').ok, main).toBe(false)
    }
    expect(readManifest({ ...VALID, main: 'lib/main.js' }, 'lastfm').ok).toBe(true)
  })

  it('refuses a permission this version does not know, rather than ignoring it', () => {
    // Silently dropping an unknown permission would let the user approve less than the plugin
    // expects to have — or, in a newer version, more than this one can explain.
    expect(
      readManifest({ ...VALID, permissions: ['nowPlaying', 'filesystem'] }, 'lastfm')
    ).toEqual({
      ok: false,
      problem: 'it asks for a permission this version does not know: "filesystem"'
    })
  })

  it('refuses ids and names that would not be safe to show or store', () => {
    expect(readManifest({ ...VALID, id: 'Last FM' }, 'Last FM').ok).toBe(false)
    expect(readManifest({ ...VALID, name: '' }, 'lastfm').ok).toBe(false)
    expect(readManifest({ ...VALID, homepage: 'http://insecure.example' }, 'lastfm').ok).toBe(
      false
    )
    expect(readManifest([], 'lastfm').ok).toBe(false)
    expect(readManifest(null, 'lastfm').ok).toBe(false)
  })

  it('strips control characters and caps lengths in what it will show', () => {
    const result = readManifest(
      { ...VALID, name: 'Last\u0007.fm\n' + 'x'.repeat(200) },
      'lastfm'
    )
    expect(result.ok && result.manifest.name).toMatch(/^Last \.fm x+$/)
    expect(result.ok && result.manifest.name.length).toBe(60)
  })

  it('refuses a setting without a key, label or kind, or one that appears twice', () => {
    const settings = (list: unknown[]) =>
      readManifest({ ...VALID, settings: list }, 'lastfm').ok
    expect(settings([{ kind: 'boolean', label: 'x' }])).toBe(false)
    expect(settings([{ key: 'a', kind: 'boolean' }])).toBe(false)
    expect(settings([{ key: 'a', kind: 'colour', label: 'x' }])).toBe(false)
    expect(
      settings([
        { key: 'a', kind: 'boolean', label: 'x' },
        { key: 'a', kind: 'string', label: 'y' }
      ])
    ).toBe(false)
  })
})

describe('permissions', () => {
  it('parses each kind, and rejects hosts that are not plain hostnames', () => {
    expect(parsePermission('nowPlaying')).toEqual({ kind: 'nowPlaying' })
    expect(parsePermission('network:WS.Audioscrobbler.com')).toEqual({
      kind: 'network',
      host: 'ws.audioscrobbler.com'
    })
    for (const bad of [
      'network:*',
      'network:*.example.com',
      'network:localhost',
      'browser:',
      'network:a b.com',
      'files'
    ]) {
      expect(parsePermission(bad), bad).toBeNull()
    }
  })

  it('reads each permission as a plain sentence for the person deciding', () => {
    expect(describePermission({ kind: 'nowPlaying' })).toBe('See what you’re playing')
    expect(describePermission({ kind: 'network', host: 'ws.audioscrobbler.com' })).toBe(
      'Connect to ws.audioscrobbler.com'
    )
    expect(describePermission({ kind: 'browser', host: 'www.last.fm' })).toBe(
      'Open www.last.fm in your browser'
    )
  })

  it('keeps page access unavailable while in-page code is frozen', () => {
    expect(isAvailable({ kind: 'page' })).toBe(false)
    expect(isAvailable({ kind: 'secrets' })).toBe(true)
  })
})

describe('callAllowed', () => {
  const granted = ['nowPlaying', 'secrets', 'browser:www.last.fm']

  it('lets a plugin make only the calls its permissions cover', () => {
    expect(callAllowed('nowPlaying.get', [], granted)).toBe(true)
    expect(callAllowed('nowPlaying.get', [], [])).toBe(false)
    expect(callAllowed('secrets.get', ['k'], [])).toBe(false)
    // Its own storage and secret settings need nothing granted.
    expect(callAllowed('storage.set', ['k', 1], [])).toBe(true)
    expect(callAllowed('settings.secret', ['k'], [])).toBe(true)
  })

  it('opens only https pages on hosts the plugin listed', () => {
    expect(
      callAllowed('openInBrowser', ['https://www.last.fm/api/auth/?token=x'], granted)
    ).toBe(true)
    expect(callAllowed('openInBrowser', ['https://evil.example/'], granted)).toBe(false)
    expect(callAllowed('openInBrowser', ['http://www.last.fm/'], granted)).toBe(false)
    expect(callAllowed('openInBrowser', ['https://user:pw@www.last.fm/'], granted)).toBe(false)
    expect(callAllowed('openInBrowser', [42], granted)).toBe(false)
  })
})

describe('httpsHost', () => {
  it('lowercases, and refuses everything that is not a plain https URL', () => {
    expect(httpsHost('https://WS.Audioscrobbler.com/2.0/')).toBe('ws.audioscrobbler.com')
    expect(httpsHost('file:///etc/passwd')).toBeNull()
    expect(httpsHost('javascript:alert(1)')).toBeNull()
    expect(httpsHost('not a url')).toBeNull()
  })
})

describe('readHostMessage', () => {
  it('accepts each message a plugin process may send, cleaned', () => {
    expect(readHostMessage({ type: 'started' })).toEqual({ type: 'started' })
    expect(
      readHostMessage({ type: 'call', callId: 3, method: 'storage.get', args: ['k'] })
    ).toEqual({
      type: 'call',
      callId: 3,
      method: 'storage.get',
      args: ['k']
    })
    expect(
      readHostMessage({ type: 'status', status: { lead: 'Connected', detail: '', extra: 1 } })
    ).toEqual({ type: 'status', status: { lead: 'Connected' } })
  })

  it('drops what it does not recognise instead of passing it on', () => {
    for (const bad of [
      null,
      'started',
      { type: 'exec', command: 'rm -rf /' },
      { type: 'call', callId: 1, method: 'process.exit', args: [] },
      { type: 'call', callId: '1', method: 'storage.get', args: [] },
      { type: 'call', callId: 1, method: 'storage.get', args: 'k' }
    ]) {
      expect(readHostMessage(bad)).toBeNull()
    }
  })

  it('caps a plugin’s buttons at four, with short labels', () => {
    const message = readHostMessage({
      type: 'actions',
      actions: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, label: 'x'.repeat(50) }))
    })
    expect(message?.type === 'actions' && message.actions).toHaveLength(4)
    expect(message?.type === 'actions' && message.actions[0]?.label).toHaveLength(32)
  })

  it('treats a status without a lead as no status', () => {
    expect(readHostMessage({ type: 'status', status: { detail: 'orphan' } })).toEqual({
      type: 'status',
      status: null
    })
  })
})

describe('coercePluginSetting', () => {
  it('keeps each value to its kind, and falls back to the default', () => {
    const flag = { key: 'a', kind: 'boolean', label: 'A', help: '', default: true } as const
    expect(coercePluginSetting(flag, false)).toBe(false)
    expect(coercePluginSetting(flag, 'yes')).toBe(true)
    const words = { key: 'b', kind: 'string', label: 'B', help: '', default: 'd' } as const
    expect(coercePluginSetting(words, 'x'.repeat(900))).toHaveLength(500)
    expect(coercePluginSetting(words, 3)).toBe('d')
  })
})
