import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Every view's CSP is the standard one (CLAUDE.md §6), with two kinds of exception, each as narrow
 * as it can be: the showcase and the Visualizer's view of its own load artwork from SoundCloud's
 * image host (for its colour), and compile WebAssembly for MilkDrop's presets; the audio engine
 * compiles WebAssembly for its pitch shifter. Another exception, or a broader one, fails here
 * first.
 */

const STANDARD =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"

// 'wasm-unsafe-eval' lets WebAssembly compile and nothing else: no eval, no inline script.
const WASM = (policy: string): string =>
  policy.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
const ARTWORK = (policy: string): string =>
  policy.replace("img-src 'self' data:", "img-src 'self' data: https://*.sndcdn.com")

const EXCEPTIONS: Record<string, string> = {
  // Both draw MilkDrop (Butterchurn), whose presets compile to WebAssembly.
  showcase: WASM(ARTWORK(STANDARD)),
  'visual-view': WASM(ARTWORK(STANDARD)),
  audio: WASM(STANDARD),
  // The playing track's artwork, on the Discord card's preview and the Background's tile.
  settings: ARTWORK(STANDARD)
}

const RENDERER = join(import.meta.dirname, '../renderer')
const views = readdirSync(RENDERER, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(RENDERER, entry.name, 'index.html'))
  )
  .map((entry) => entry.name)

describe('every view’s Content Security Policy', () => {
  it('finds the views', () => {
    expect(views).toEqual(expect.arrayContaining(['audio', 'header', 'settings', 'showcase']))
  })

  it.each(views)('%s carries the standard policy, or its one named exception', (view) => {
    const html = readFileSync(join(RENDERER, view, 'index.html'), 'utf8')
    const policies = [
      ...html.matchAll(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/g)
    ]
    expect(policies).toHaveLength(1)
    expect(policies[0]?.[1]).toBe(EXCEPTIONS[view] ?? STANDARD)
  })
})
