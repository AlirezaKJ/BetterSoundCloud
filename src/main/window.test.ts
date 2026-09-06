import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dirname, 'window.ts'), 'utf8')

/** The body of `layout()`, which is the single owner of where every view sits. */
function layoutBody(): string {
  const start = SRC.indexOf('const layout = (): void => {')
  expect(start).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  shell.layout = layout', start)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

/**
 * Source-scanned rather than executed: `window.ts` imports Electron, so it cannot be loaded in
 * a unit test. These pin structure that has broken before and that nothing else would catch.
 */
describe('layout() owns every view position', () => {
  it('repositions BOTH overlays, not just the header one', () => {
    // A real regression, caught in review: rewriting this block dropped the player call, so the
    // play-control buttons kept whatever bounds they were created with. They are anchored to
    // the window's right and bottom edges, so after any resize they covered SoundCloud's
    // like/follow/queue controls with a transparent view — and after a zoom change the
    // reservation and the overlay disagreed by construction.
    const body = layoutBody()
    expect(body).toContain('fitOverSoundCloudHeader')
    expect(body).toContain('fitOverPlayControls')
  })

  it('is the only place that decides whether our own bar shows', () => {
    // Two places deciding this is the fault the narrow-window work removed. `toggleSettings`
    // used to re-derive it from `hideMenuBar`, which differs from `embeddedShowing` in exactly
    // the fallback case, and placed the settings panel over our own bar.
    const outsideLayout = SRC.replace(layoutBody(), '')
    expect(outsideLayout).not.toMatch(/hideMenuBar \? 0 : HEADER_HEIGHT/)
  })

  it('takes the window minimum from the shared constant', () => {
    // MIN_EMBED_WIDTH's doc comment asserts the two are equal; a bare literal here would let
    // them drift, and the failure mode is the overlay fallback firing at an unmeasured width.
    expect(SRC).toContain('minWidth: MIN_EMBED_WIDTH')
    expect(SRC).not.toMatch(/minWidth: \d+/)
  })
})
