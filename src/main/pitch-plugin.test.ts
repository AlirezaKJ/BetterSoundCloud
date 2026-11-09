import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { runPlugin } from './plugin-sandbox'
import type { Bridge } from './plugin-sandbox'
import type { PluginStatus } from '@shared/plugin-api'
import { readManifest } from '@shared/plugins'
import { readAudioPitch } from '@shared/audio'

/**
 * The shipped Pitch plugin, run in the real sandbox against a fake app: what it asks the audio
 * engine for, and what its status line says. src/main/audio.ts is tested on its own.
 */

const DIR = join(import.meta.dirname, '../../resources/plugins/pitch')
const CODE = readFileSync(join(DIR, 'index.js'), 'utf8')
const RAW_MANIFEST = JSON.parse(readFileSync(join(DIR, 'plugin.json'), 'utf8')) as unknown

async function run(semitones: string) {
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
      id: 'pitch',
      version: '1.0.0',
      code: CODE,
      filename: 'pitch/index.js',
      permissions: ['audio'],
      settings: { semitones }
    },
    bridge
  )
  return { plugin, calls, last: () => statuses.at(-1) }
}

describe('the Pitch plugin', () => {
  it('has a valid manifest: the audio permission and a key that starts in the original', () => {
    const result = readManifest(RAW_MANIFEST, 'pitch')
    if (!result.ok) throw new Error(result.problem)
    expect(result.manifest.permissions).toEqual(['audio'])
    expect(result.manifest.settings).toEqual([
      expect.objectContaining({ key: 'semitones', kind: 'pitch', range: 12, default: '0' })
    ])
  })

  it('asks for nothing in the original key, so the engine does not run for it', async () => {
    const { calls, last } = await run('0')
    expect(calls).toEqual([{ method: 'audio.clear', args: [] }])
    expect(last()?.lead).toBe('Original key')
  })

  it('asks for the shift the ruler shows, one main accepts as it is', async () => {
    const { calls } = await run('-3')
    expect(calls).toEqual([{ method: 'audio.setPitch', args: [-3] }])
    expect(readAudioPitch(calls[0]?.args[0])).toBe(-3)
  })

  it('follows the key as it moves, back to nothing at 0', async () => {
    const { plugin, calls } = await run('0')
    plugin.settings({ semitones: '2' })
    plugin.settings({ semitones: '12' })
    plugin.settings({ semitones: '0' })
    expect(calls).toEqual([
      { method: 'audio.clear', args: [] },
      { method: 'audio.setPitch', args: [2] },
      { method: 'audio.setPitch', args: [12] },
      { method: 'audio.clear', args: [] }
    ])
  })

  it('says what the engine is doing, in the words the engine gives for a problem', async () => {
    const { plugin, last } = await run('2')
    expect(last()?.lead).toBe('Starting…')
    plugin.audio({ state: 'running', message: '' })
    expect(last()).toEqual({
      lead: 'On',
      detail: 'Everything SoundCloud plays is 2 semitones higher.'
    })
    plugin.settings({ semitones: '-12' })
    expect(last()?.detail).toBe('Everything SoundCloud plays is an octave lower.')
    const message =
      'The pitch shifter couldn’t start (CompileError), so SoundCloud plays as normal.'
    plugin.audio({ state: 'stopped', message })
    expect(last()).toEqual({ lead: 'Not working', problem: message })
  })
})
