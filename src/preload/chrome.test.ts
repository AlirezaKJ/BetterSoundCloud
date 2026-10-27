import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/*
 * The chrome preload calls our views' `window.bsc.on…` callbacks across the context bridge, and
 * the bridge copies a callback's RETURN value back as well as its arguments. A Svelte 5 `$state`
 * object is a Proxy, which cannot be copied, so `(s) => (state = s)` — an arrow that returns the
 * assignment — threw "An object could not be cloned" on every push. The state still updated, so
 * nothing looked wrong; it was found in the packaged build's DevTools (2026-10-27), and while a
 * track played it threw once a second. Callbacks get a block body, so they return nothing.
 */

const RENDERER = join(import.meta.dirname, '../renderer')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(svelte|ts)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('callbacks handed to window.bsc.on…', () => {
  it('have a block body, so they never return a value the bridge must copy', () => {
    const offenders: string[] = []
    for (const file of sources(RENDERER)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(
        /window\.bsc\.on\w+\(\s*(?:\([^)]*\)|\w+)\s*=>(?!\s*\{)/g
      )) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${file.slice(RENDERER.length + 1)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('are found at all — the scan is looking at the right files', () => {
    const count = sources(RENDERER)
      .map((file) => readFileSync(file, 'utf8').match(/window\.bsc\.on\w+\(/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0)
    expect(count).toBeGreaterThan(10)
  })
})
