import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { runPlugin } from './plugin-sandbox'
import type { Bridge } from './plugin-sandbox'
import type { PluginStatus } from '@shared/plugin-api'
import { readManifest } from '@shared/plugins'
import { graphicEqualiser, parseGains } from '@shared/equaliser'
import { readAudioFilters } from '@shared/audio'

/**
 * The shipped Equaliser plugin, run in the real sandbox against a fake app: what it asks the audio
 * engine for, and what its status line says. src/main/audio.ts is tested on its own.
 */

const DIR = join(import.meta.dirname, '../../resources/plugins/equaliser')
const CODE = readFileSync(join(DIR, 'index.js'), 'utf8')
const RAW_MANIFEST = JSON.parse(readFileSync(join(DIR, 'plugin.json'), 'utf8')) as unknown

function manifest() {
  const result = readManifest(RAW_MANIFEST, 'equaliser')
  if (!result.ok) throw new Error(result.problem)
  const setting = result.manifest.settings[0]
  if (setting?.kind !== 'equaliser') throw new Error('its setting is not an equaliser')
  return { manifest: result.manifest, setting }
}

async function run(curve: string) {
  const calls: { method: string; args: unknown[] }[] = []
  const statuses: (PluginStatus | null)[] = []
  const bridge: Bridge = {
    call: (method, args) => {
      calls.push({ method, args })
      return Promise.resolve(null)
    },
    status: (status) => statuses.push(status),
    actions: () => undefined,
    log: () => undefined,
    fetch: () => Promise.reject(new Error('no network'))
  }
  const plugin = await runPlugin(
    {
      id: 'equaliser',
      version: '1.0.0',
      code: CODE,
      filename: 'equaliser/index.js',
      permissions: ['audio'],
      settings: { curve }
    },
    bridge
  )
  return { plugin, calls, statuses, last: () => statuses.at(-1) }
}

describe('the Equaliser plugin', () => {
  it('has a valid manifest, and the same bands in its script as in plugin.json', () => {
    const { manifest: m, setting } = manifest()
    expect(m.permissions).toEqual(['audio'])
    const scriptBands = /const BANDS = \[([^\]]+)\]/.exec(CODE)?.[1]?.split(',').map(Number)
    expect(scriptBands).toEqual(setting.bands)
    expect(setting.default).toBe('0,0,0,0,0,0')
    // Every preset is a curve the panel can show: one gain per band, within the range.
    for (const preset of setting.presets) {
      expect(preset.gains).toHaveLength(setting.bands.length)
      expect(preset.gains.every((g) => Math.abs(g) <= setting.range)).toBe(true)
    }
    expect(setting.presets[0]).toEqual({ name: 'Flat', gains: [0, 0, 0, 0, 0, 0] })
  })

  it('asks for nothing while flat, so the engine does not run', async () => {
    const { calls, last } = await run('0,0,0,0,0,0')
    expect(calls).toEqual([{ method: 'audio.clear', args: [] }])
    expect(last()?.lead).toBe('Flat')
  })

  it('asks for exactly the filters the settings panel draws for the curve', async () => {
    const { setting } = manifest()
    const curve = '6,4,1,0,0,0'
    const { calls } = await run(curve)
    const expected = graphicEqualiser(setting.bands, parseGains(curve, 6, setting.range))
    expect(calls).toEqual([{ method: 'audio.set', args: [expected] }])
    // And main would accept them as they are.
    expect(readAudioFilters(calls[0]?.args[0])).toEqual(expected)
  })

  it('follows the curve as it changes, back to nothing when it is flat again', async () => {
    const { plugin, calls } = await run('0,0,0,0,0,0')
    plugin.settings({ curve: '0,0,0,1,4,6' })
    plugin.settings({ curve: '0,0,0,0,0,0' })
    expect(calls.map((c) => c.method)).toEqual(['audio.clear', 'audio.set', 'audio.clear'])
  })

  it('says what the engine is doing, in the words the engine gives for a problem', async () => {
    const { plugin, last } = await run('6,4,1,0,0,0')
    expect(last()?.lead).toBe('Starting…')
    plugin.audio({ state: 'running', message: '' })
    expect(last()?.lead).toBe('On')
    const message = 'No sound reached it from SoundCloud, so it stepped aside.'
    plugin.audio({ state: 'stopped', message })
    expect(last()).toEqual({ lead: 'Not working', problem: message })
  })
})
