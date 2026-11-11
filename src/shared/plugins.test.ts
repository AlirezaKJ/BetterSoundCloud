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
import type { PluginSetting } from './plugins'

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
    // Shaping the sound needs the audio permission, and nothing else gives it.
    expect(callAllowed('audio.set', [[]], granted)).toBe(false)
    expect(callAllowed('audio.clear', [], granted)).toBe(false)
    expect(callAllowed('audio.set', [[]], ['audio'])).toBe(true)
    expect(callAllowed('audio.clear', [], ['audio'])).toBe(true)
    expect(callAllowed('audio.setPitch', [3], granted)).toBe(false)
    expect(callAllowed('audio.setPitch', [3], ['audio'])).toBe(true)
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

  it('keeps an equaliser to one half-decibel step per band, within its range', () => {
    const curve: PluginSetting = {
      key: 'curve',
      kind: 'equaliser',
      label: 'Bands',
      help: '',
      bands: [60, 1000, 15000],
      range: 12,
      presets: [],
      default: '0,0,0'
    }
    expect(coercePluginSetting(curve, '6,99,-3.3')).toBe('6,12,-3.5')
    expect(coercePluginSetting(curve, 'x')).toBe('0,0,0')
    expect(coercePluginSetting(curve, 4)).toBe('0,0,0')
  })
})

describe('the equaliser setting kind', () => {
  const withSetting = (setting: Record<string, unknown>) =>
    readManifest({ ...VALID, permissions: [], settings: [setting] }, 'lastfm')

  it('reads bands, a range, presets and a default', () => {
    const result = withSetting({
      key: 'curve',
      kind: 'equaliser',
      label: 'Bands',
      bands: [60, 1000, 15000],
      presets: [{ name: 'Bass', gains: [6.2, 0, 0] }],
      default: '3,0,0'
    })
    expect(result.ok && result.manifest.settings[0]).toEqual({
      key: 'curve',
      kind: 'equaliser',
      label: 'Bands',
      help: '',
      bands: [60, 1000, 15000],
      range: 12,
      presets: [{ name: 'Bass', gains: [6, 0, 0] }],
      default: '3,0,0'
    })
  })

  it('refuses bands that do not rise, fall outside hearing, or are too few or many', () => {
    for (const bands of [
      [1000, 60],
      [60],
      [10, 100],
      [60, 30_000],
      Array.from({ length: 11 }, (_, i) => 100 + i)
    ]) {
      const result = withSetting({ key: 'curve', kind: 'equaliser', label: 'B', bands })
      expect(result.ok, JSON.stringify(bands)).toBe(false)
    }
  })

  it('refuses presets without a gain per band, or with a name used twice', () => {
    const base = { key: 'curve', kind: 'equaliser', label: 'B', bands: [60, 1000] }
    expect(withSetting({ ...base, presets: [{ name: 'A', gains: [1] }] }).ok).toBe(false)
    expect(
      withSetting({
        ...base,
        presets: [
          { name: 'A', gains: [1, 1] },
          { name: 'A', gains: [2, 2] }
        ]
      }).ok
    ).toBe(false)
    expect(withSetting({ ...base, range: 40 }).ok).toBe(false)
  })
})

describe('the choice setting kind', () => {
  const withSetting = (setting: Record<string, unknown>) =>
    readManifest({ ...VALID, permissions: [], settings: [setting] }, 'lastfm')
  const options = [
    { value: 'bars', label: 'Bars' },
    { value: 'off', label: 'Nothing' }
  ]

  it('reads its options and a default that is one of them, else the first', () => {
    const result = withSetting({
      key: 'look',
      kind: 'choice',
      label: 'Look',
      options,
      default: 'off'
    })
    expect(result.ok && result.manifest.settings[0]).toEqual({
      key: 'look',
      kind: 'choice',
      label: 'Look',
      help: '',
      options,
      default: 'off'
    })
    const stray = withSetting({
      key: 'look',
      kind: 'choice',
      label: 'Look',
      options,
      default: 'x'
    })
    expect(stray.ok && stray.manifest.settings[0]).toMatchObject({ default: 'bars' })
  })

  it('refuses fewer than two options, values that are not short words, and a value twice', () => {
    const base = { key: 'look', kind: 'choice', label: 'Look' }
    expect(withSetting({ ...base, options: [options[0]] }).ok).toBe(false)
    expect(
      withSetting({ ...base, options: [...options, { value: 'Big Bars', label: 'B' }] }).ok
    ).toBe(false)
    expect(
      withSetting({ ...base, options: [...options, { value: 'bars', label: 'Again' }] }).ok
    ).toBe(false)
    expect(withSetting({ ...base, options: [...options, { value: 'ring' }] }).ok).toBe(false)
  })

  it('keeps a stored value to one of its options', () => {
    const look: PluginSetting = {
      key: 'look',
      kind: 'choice',
      label: 'L',
      help: '',
      options,
      default: 'bars'
    }
    expect(coercePluginSetting(look, 'off')).toBe('off')
    expect(coercePluginSetting(look, 'lasers')).toBe('bars')
    expect(coercePluginSetting(look, 3)).toBe('bars')
  })
})

describe('the pitch setting kind', () => {
  const withSetting = (setting: Record<string, unknown>) =>
    readManifest({ ...VALID, permissions: [], settings: [setting] }, 'lastfm')

  it('reads a range of whole semitones and a default, an octave unless it says otherwise', () => {
    const result = withSetting({ key: 'semitones', kind: 'pitch', label: 'Key', default: '2' })
    expect(result.ok && result.manifest.settings[0]).toEqual({
      key: 'semitones',
      kind: 'pitch',
      label: 'Key',
      help: '',
      range: 12,
      default: '2'
    })
    const narrow = withSetting({ key: 'k', kind: 'pitch', label: 'K', range: 3, default: '9' })
    expect(narrow.ok && narrow.manifest.settings[0]).toMatchObject({ range: 3, default: '3' })
  })

  it('refuses a range that is not 1 to 12 whole semitones', () => {
    for (const range of [0, 13, 2.5, '6']) {
      const result = withSetting({ key: 'k', kind: 'pitch', label: 'K', range })
      expect(result.ok, String(range)).toBe(false)
    }
  })

  it('keeps a stored value to whole semitones within the range', () => {
    const key: PluginSetting = {
      key: 'semitones',
      kind: 'pitch',
      label: 'Key',
      help: '',
      range: 12,
      default: '0'
    }
    expect(coercePluginSetting(key, '3')).toBe('3')
    expect(coercePluginSetting(key, '-2.6')).toBe('-3')
    expect(coercePluginSetting(key, '40')).toBe('12')
    expect(coercePluginSetting(key, 'up')).toBe('0')
    expect(coercePluginSetting(key, 5)).toBe('0')
  })
})
