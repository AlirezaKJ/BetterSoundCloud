import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Every view's CSP is the standard one (CLAUDE.md §6), with two exceptions, each as narrow as it
 * can be: the showcase shows artwork from SoundCloud's image host, and the audio engine compiles
 * WebAssembly for its pitch shifter. A third exception, or a broader one, fails here first.
 */

const STANDARD =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"

const EXCEPTIONS: Record<string, string> = {
  showcase: STANDARD.replace(
    "img-src 'self' data:",
    "img-src 'self' data: https://*.sndcdn.com"
  ),
  // 'wasm-unsafe-eval' lets WebAssembly compile and nothing else: no eval, no inline script.
  audio: STANDARD.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
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
