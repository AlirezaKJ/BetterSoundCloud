import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPresetPack } from '@shared/visualizer'

/**
 * The MilkDrop presets the app ships (lib/milkdrop.ts loads `butterchurn-presets`' `minimal`
 * pack): every one must run as WebAssembly, since the views that draw them refuse `new Function`
 * (renderer-csp.test.ts). A pack update that brought back the other kind fails here first.
 */

const require = createRequire(import.meta.url)
const ROOT = join(import.meta.dirname, '../..')

describe('the MilkDrop presets we ship', () => {
  it('all carry their equations as EEL, which Butterchurn compiles to WebAssembly', () => {
    // The pack is a browser bundle that names its global `self`.
    const global = globalThis as { self?: unknown }
    global.self ??= globalThis
    const pack = require('butterchurn-presets/dist/minimal.min.js') as unknown
    const presets = readPresetPack(pack)
    const raw = (pack as { default?: Record<string, unknown> }).default ?? {}
    expect(presets.length).toBeGreaterThan(20)
    expect(presets).toHaveLength(Object.keys(raw).length)
  })

  it('are pinned, with Butterchurn, to the exact versions measured', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    expect(manifest.devDependencies['butterchurn']).toBe('3.0.0-beta.5')
    expect(manifest.devDependencies['butterchurn-presets']).toBe('3.0.0-beta.4')
  })

  it('ship their licences, and those of what Butterchurn bundles', () => {
    const licences = readFileSync(join(ROOT, 'resources/licenses/butterchurn.txt'), 'utf8')
    for (const name of [
      'butterchurn',
      'butterchurn-presets',
      'eel-wasm',
      '@assemblyscript/loader'
    ])
      expect(licences).toContain(name)
    expect(licences).toContain('Apache License')
  })
})
