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

async function run(showcase: string, answer = { reducedMotion: false }) {
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
      version: '1.0.0',
      code: CODE,
      filename: 'visualizer/index.js',
      permissions: ['audio'],
      settings: { showcase }
    },
    bridge
  )
  // Let the answer to `visualize` come back.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { plugin, calls, last: () => statuses.at(-1) }
}

describe('the Visualizer plugin', () => {
  it('has a valid manifest: the audio permission, and bars in the full-screen view to start', () => {
    const result = readManifest(RAW_MANIFEST, 'visualizer')
    if (!result.ok) throw new Error(result.problem)
    expect(result.manifest.permissions).toEqual(['audio'])
    expect(result.manifest.settings).toEqual([
      expect.objectContaining({ key: 'showcase', kind: 'choice', default: 'bars' })
    ])
  })

  it('offers exactly the looks the full-screen view can draw, and a way to show none', () => {
    const result = readManifest(RAW_MANIFEST, 'visualizer')
    if (!result.ok) throw new Error(result.problem)
    const setting = result.manifest.settings[0]
    if (setting?.kind !== 'choice') throw new Error('not a choice')
    for (const option of setting.options) {
      expect(readVisualizerConfig({ showcase: option.value }), option.value).not.toBeNull()
    }
    expect(setting.options.map((o) => o.value)).toContain('off')
  })

  it('asks for the look chosen, in a shape main accepts as it is', async () => {
    const { calls } = await run('ring')
    expect(calls).toEqual([{ method: 'audio.visualize', args: [{ showcase: 'ring' }] }])
    expect(readVisualizerConfig(calls[0]?.args[0])).toEqual({ showcase: 'ring' })
  })

  it('follows the setting as it changes, and asks for nothing when it is off', async () => {
    const { plugin, calls, last } = await run('bars')
    plugin.settings({ showcase: 'wave' })
    plugin.settings({ showcase: 'off' })
    plugin.settings({ showcase: 'lasers' })
    expect(calls.map((c) => c.args[0])).toEqual([
      { showcase: 'bars' },
      { showcase: 'wave' },
      { showcase: 'off' },
      { showcase: 'off' }
    ])
    expect(last()?.lead).toBe('Nothing chosen')
  })

  it('says where it shows, and the engine’s own words when it cannot', async () => {
    const { plugin, last } = await run('bars')
    expect(last()).toEqual({
      lead: 'On',
      detail: 'It shows in the full-screen view while music plays.'
    })
    const message =
      'SoundCloud’s sound couldn’t be captured (NotAllowedError), so SoundCloud plays as normal.'
    plugin.audio({ state: 'stopped', message })
    expect(last()).toEqual({ lead: 'Not working', problem: message })
  })

  it('says it is hidden when the system asks for reduced motion', async () => {
    const { last } = await run('bars', { reducedMotion: true })
    expect(last()?.lead).toBe('Hidden')
  })
})
