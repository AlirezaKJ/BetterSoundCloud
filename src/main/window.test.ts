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

  it('positions the lyrics pane, and hides it with the page', () => {
    // The pane sits between SoundCloud's header and play bar, whose heights follow the zoom, so a
    // resize or a zoom change must move it — from layout(), like every other view.
    const body = layoutBody()
    expect(body).toContain('fitLyricsPane(shell, strip)')
    expect(body).toContain('shell.lyrics.setVisible(!pageHidden)')
  })

  it('keeps the right-click menu view over the content area', () => {
    // The menu view is created after the shell (context-menu.ts) and never positions itself;
    // if layout() forgot it, a menu opened after a resize would be drawn against stale bounds
    // and its click-catcher would cover the wrong part of the window.
    const body = layoutBody()
    expect(body).toMatch(/fitBelowHeader\(window, shell\.contextMenu, strip\)/)
  })

  it('is the only place that decides whether our own bar shows', () => {
    // Two places deciding this is the fault the narrow-window work removed. `toggleSettings`
    // used to re-derive it from `hideMenuBar`, which differs from `embeddedShowing` in exactly
    // the fallback case, and placed the settings panel over our own bar.
    const outsideLayout = SRC.replace(layoutBody(), '')
    expect(outsideLayout).not.toMatch(/hideMenuBar \? 0 : HEADER_HEIGHT/)
  })

  it('keeps the page-status view over the content area, with our own bar back above it', () => {
    // The status view is created by page-status.ts and never positions itself. While it hides
    // SoundCloud's page, the buttons drawn over SoundCloud's header have no header under them,
    // so `embeddedShows` must turn off and our bar come back.
    const body = layoutBody()
    expect(body).toMatch(/fitBelowHeader\(window, shell\.status, strip\)/)
    expect(body).toMatch(/const embeddedShows = [^\n]*!pageHidden/)
  })

  it('takes the window minimum from the shared constant', () => {
    // MIN_EMBED_WIDTH's doc comment asserts the two are equal; a bare literal here would let
    // them drift, and the failure mode is the overlay fallback firing at an unmeasured width.
    expect(SRC).toContain('minWidth: MIN_EMBED_WIDTH')
    expect(SRC).not.toMatch(/minWidth: \d+/)
  })
})

/** The body of a top-level function in window.ts, up to the next one. */
function functionBody(name: string): string {
  const start = SRC.indexOf(`function ${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n}\n', start)
  return SRC.slice(start, end)
}

describe('startup never leaves an invisible window', () => {
  it('shows the window even when the header fails, crashes or never loads', () => {
    // `once('did-finish-load', () => window.show())` used to be the only show() in the app.
    // A header that never finished meant a process that ran forever with no window, holding
    // the single-instance lock, so relaunching did nothing either.
    const body = functionBody('showWhenChromeIsReady')
    for (const event of ['did-finish-load', 'did-fail-load', 'render-process-gone']) {
      expect(body).toContain(`'${event}'`)
    }
    expect(body).toMatch(/setTimeout\(/)
    expect(body).toContain('window.show()')
    expect(functionBody('createShell')).toContain('showWhenChromeIsReady(window, header)')
  })

  it('does not load SoundCloud while building the window', () => {
    // Its page may only load once Widevine is registered; index.ts calls loadSoundCloud then.
    // Loading it here again would bring back either the wait before any window (#96) or
    // protected tracks that silently skip.
    expect(functionBody('createShell')).not.toMatch(/content\.webContents\.loadURL/)
    expect(functionBody('loadSoundCloud')).toContain('loadURL(START_URL)')
  })
})
