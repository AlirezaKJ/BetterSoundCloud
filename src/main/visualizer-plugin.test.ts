import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { runPlugin } from './plugin-sandbox'
import type { Bridge } from './plugin-sandbox'
import type { PluginStatus } from '@shared/plugin-api'
import { readManifest } from '@shared/plugins'
import { readVisualizerConfig } from '@shared/visualizer'

/**
 * The shipped Visualizer plugin, run in the real sandbox against a fake app: what it asks to be
 * drawn, and what its status line says. src/main/visualizer.ts and the drawing are tested apart.
 */

const DIR = join(import.meta.dirname, '../../resources/plugins/visualizer')
const CODE = readFileSync(join(DIR, 'index.js'), 'utf8')
const RAW_MANIFEST = JSON.parse(readFileSync(join(DIR, 'plugin.json'), 'utf8')) as unknown

async function run(
  settings: Record<string, string>,
  answer: { reducedMotion: boolean; milkdrop?: boolean } = { reducedMotion: false }
) {
  const calls: { method: string; args: unknown[] }[] = []
  const statuses: (PluginStatus | null)[] = []
  const bridge: Bridge = {
    call: (method, args) => {
      calls.push({ method, args })
      return Promise.resolve(answer)
    },
    status: (status) => statuses.push(status),
    actions: () => undefined,
    log: () => undefined,
    fetch: () => Promise.reject(new Error('no network'))
  }
  const plugin = await runPlugin(
    {
      id: 'visualizer',
      version: '1.1.0',
      code: CODE,
      filename: 'visualizer/index.js',
      permissions: ['audio'],
      settings
    },
    bridge
  )
  // Let the answer to `visualize` come back.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { plugin, calls, last: () => statuses.at(-1) }
}

describe('the Visualizer plugin', () => {
  it('has a valid manifest: the audio permission, bars in every place, timed presets', () => {
    const result = readManifest(RAW_MANIFEST, 'visualizer')
    if (!result.ok) throw new Error(result.problem)
    expect(result.manifest.permissions).toEqual(['audio'])
    expect(result.manifest.settings).toEqual([
      expect.objectContaining({ key: 'showcase', kind: 'choice', default: 'bars' }),
      expect.objectContaining({ key: 'strip', kind: 'choice', default: 'bars' }),
      expect.objectContaining({ key: 'view', kind: 'choice', default: 'bars' }),
      expect.objectContaining({ key: 'presets', kind: 'choice', default: 'timed' })
    ])
  })

  it('offers exactly the looks each place can draw, and a way to show none', () => {
    const result = readManifest(RAW_MANIFEST, 'visualizer')
    if (!result.ok) throw new Error(result.problem)
    for (const setting of result.manifest.settings) {
      if (setting.kind !== 'choice') throw new Error('not a choice')
      for (const option of setting.options) {
        const config = readVisualizerConfig({ [setting.key]: option.value })
        expect(config, `${setting.key}: ${option.value}`).not.toBeNull()
      }
      if (setting.key !== 'presets')
        expect(setting.options.map((o) => o.value)).toContain('off')
    }
    const looks = (key: string): string[] => {
      const setting = result.manifest.settings.find((one) => one.key === key)
      return setting?.kind === 'choice' ? setting.options.map((o) => o.value) : []
    }
    expect(looks('showcase')).toContain('milkdrop')
    expect(looks('view')).toContain('milkdrop')
    expect(looks('strip')).not.toContain('milkdrop')
  })

  it('asks for the looks chosen, in a shape main accepts as it is', async () => {
    const { calls } = await run({
      showcase: 'ring',
      strip: 'wave',
      view: 'milkdrop',
      presets: 'track'
    })
    expect(calls).toEqual([
      {
        method: 'audio.visualize',
        args: [{ showcase: 'ring', strip: 'wave', view: 'milkdrop', presets: 'track' }]
      }
    ])
    expect(readVisualizerConfig(calls[0]?.args[0])).toEqual({
      showcase: 'ring',
      strip: 'wave',
      view: 'milkdrop',
      presets: 'track'
    })
  })

  it('follows the settings as they change, and asks for nothing when both are off', async () => {
    const { plugin, calls, last } = await run({ showcase: 'bars', strip: 'bars' })
    plugin.settings({ showcase: 'wave', strip: 'bars' })
    plugin.settings({ showcase: 'off', strip: 'ring' })
    expect(calls.map((c) => c.args[0])).toEqual([
      { showcase: 'bars', strip: 'bars', view: 'off', presets: 'timed' },
      { showcase: 'wave', strip: 'bars', view: 'off', presets: 'timed' },
      // The ring is not a strip look: it is "off" there.
      { showcase: 'off', strip: 'off', view: 'off', presets: 'timed' }
    ])
    expect(last()?.lead).toBe('Nothing chosen')
  })

  it('says where it shows, and the engine’s own words when it cannot', async () => {
    const { plugin, last } = await run({ showcase: 'bars', strip: 'bars' })
    expect(last()).toEqual({
      lead: 'On',
      detail: 'It shows in the full-screen view and above the player while music plays.'
    })
    plugin.settings({ showcase: 'off', strip: 'bars' })
    expect(last()?.detail).toBe('It shows above the player while music plays.')
    plugin.settings({ showcase: 'bars', strip: 'bars', view: 'wave' })
    expect(last()?.detail).toBe(
      'It shows in the full-screen view, above the player and in its own view while music plays.'
    )
    const message =
      'SoundCloud’s sound couldn’t be captured (NotAllowedError), so SoundCloud plays as normal.'
    plugin.audio({ state: 'stopped', message })
    expect(last()).toEqual({ lead: 'Not working', problem: message })
  })

  it('says MilkDrop needs hardware acceleration when main cannot draw it', async () => {
    const { plugin, last } = await run(
      { showcase: 'milkdrop', strip: 'bars' },
      { reducedMotion: false, milkdrop: false }
    )
    expect(last()).toEqual({
      lead: 'On',
      detail: 'It shows in the full-screen view and above the player while music plays.',
      problem:
        'MilkDrop needs hardware acceleration (Settings → Advanced), so Bars show in its place.'
    })
    // Not chosen anywhere, nothing to say about it.
    plugin.settings({ showcase: 'bars', strip: 'bars' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(last()?.problem).toBeUndefined()
  })

  it('says it is hidden when the system asks for reduced motion', async () => {
    const { last } = await run({ showcase: 'bars', strip: 'bars' }, { reducedMotion: true })
    expect(last()?.lead).toBe('Hidden')
  })
})
