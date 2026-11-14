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

  it('stretches the showcase over the whole window, our own bar included', () => {
    // The window goes full screen as the showcase opens, so its size changes after the view is
    // made: only layout() hears that resize.
    expect(layoutBody()).toContain('shell.showcase.setBounds({ x: 0, y: 0, width, height })')
  })

  it('places the visualizer’s own view over the page, beside the lyrics pane, and hides it with the page', () => {
    const body = layoutBody()
    expect(body).toContain('fitVisualView(shell, strip)')
    expect(body).toContain('shell.visualView.setVisible(!pageHidden)')
    // The engine listens for it only while it is drawn, and Settings, opaque, hides it…
    expect(body).toMatch(
      /const visualViewDrawn =\s+shell\.visualView !== null && !pageHidden && !shell\.showcase && !settingsOpen/
    )
    expect(body).toContain("setVisualPlaceShown('view', visualViewDrawn)")
    // …and the strip steps back while it is open: it would draw the same thing twice.
    expect(body).toMatch(
      /const visualStripDrawn =\s+visualStripWanted && !shell\.showcase && !shell\.visualView/
    )
    // Closing the lyrics pane gives the strip and the view their width back.
    const close = SRC.slice(SRC.indexOf('export function closeLyrics'))
    expect(close.slice(0, close.indexOf('\n}\n'))).toContain('shell.layout()')
  })

  it('widens the player buttons’ reservation with their third button, by one number', () => {
    // The overlay and SoundCloud's padding must agree, or our transparent view covers SoundCloud's
    // own controls: both read playerButtonsWidth, and its availability re-applies the page's CSS.
    expect(SRC).toMatch(
      /playerReserve = shell\.player \? Math\.round\(playerButtonsWidth\(shell\)/
    )
    expect(SRC).toContain('const buttonsWidth = playerButtonsWidth(shell)')
    const available = SRC.slice(SRC.indexOf('export function setVisualViewAvailable'))
    expect(available.slice(0, available.indexOf('\n}\n'))).toContain('applyContentCss(')
  })

  it('floats the Visualizer strip on the bar’s top edge, out of the pointer’s way', () => {
    // The strip is a view of ours over SoundCloud's page, and the queue and the volume slider open
    // upward from the bar right under it: it must step aside for the pointer, or they would be
    // dead to clicks.
    const body = layoutBody()
    expect(body).toMatch(/y: height - barHeight - VISUAL_STRIP_HEIGHT/)
    expect(body).toContain('!shell.visualStripAside')
    expect(body).toContain('watchVisualStrip(shell, watchStrip)')
    // Watched only while it is in place and the window focused, and never aside when not watched.
    expect(body).toContain(
      'const watchStrip = visualStripShows && visualStripDrawn && shell.windowFocused'
    )
    expect(body).toContain('if (!watchStrip) shell.visualStripAside = false')
    // Gone while the engine has stepped aside, but still asking for sound, so the engine stays
    // aside instead of retrying what failed (§21).
    expect(body).toContain('const visualStripShows = visualStripWanted && !shell.audioStopped')
    expect(body).toMatch(/const visualStripDrawn =\s+visualStripWanted && !shell\.showcase/)
    // Settings is opaque and covers it, so it is not drawn while Settings is open either.
    expect(body).toMatch(/const visualStripDrawn =\s+[^\n]*!settingsOpen/)
    // The page's room for it is re-decided whenever it comes or goes, from the same flag…
    expect(body).toMatch(/if \(visualStripFlipped\) void applyContentCss\(/)
    expect(SRC).toMatch(/stripReserve = shell\.visualStripShowing \?/)
    // …and the engine listens for it only while it is drawn.
    expect(body).toContain("setVisualPlaceShown('strip', visualStripDrawn)")
    // The window's focus starts and stops the watcher.
    expect(SRC).toContain("window.on('focus', () => shell.layout())")
    expect(SRC).toContain("window.on('blur', () => shell.layout())")
  })

  it('never brings full screen back on the next launch', () => {
    // Full screen belongs to the showcase alone. electron-window-state restores it by default,
    // so quitting with the showcase open relaunched the app full screen with no showcase.
    expect(SRC).toMatch(/windowStateKeeper\(\{[^}]*fullScreen: false[^}]*\}\)/)
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

  it('brings our own bar back above Settings, without moving SoundCloud’s page', () => {
    // Settings stands in for the page; the window must stay movable and closable, and the gear
    // must close it, whatever the bar setting says. The page keeps its place under it, so it does
    // not jump as Settings fades.
    const body = layoutBody()
    expect(body).toContain('const barShows = !embeddedShows || settingsOpen')
    expect(body).toContain('header.setVisible(barShows)')
    expect(body).toContain(
      'content.setBounds({ x: 0, y: strip, width, height: height - strip })'
    )
    expect(body).toContain('fitBelowHeader(window, shell.settings, HEADER_HEIGHT)')
    expect(body).toMatch(/shell\.embedded\.setVisible\(\s+embeddedShows && !settingsOpen/)
    // Opening and closing it re-run the layout, which alone decides the bar.
    expect(functionBody('toggleSettings')).toContain('shell.layout()')
    expect(functionBody('closeSettings')).toContain('shell.layout()')
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
    expect(functionBody('loadSoundCloud')).toContain('content.webContents.loadURL(url)')
  })
})

describe('the bar and keyboard focus', () => {
  it('tells the bar when SoundCloud’s page itself is loading, so Reload can become Stop', () => {
    const body = functionBody('wireStateEvents')
    // The main frame only: the sign-in box is a frame of its own and is not "the page loading".
    expect(body).toContain('isLoadingMainFrame()')
    for (const event of ['did-start-loading', 'did-stop-loading']) {
      expect(body).toContain(`'${event}'`)
    }
  })

  it('hands keyboard focus back when settings close, instead of dropping it', () => {
    // Removing the focused view left focus nowhere: the next key did nothing at all.
    expect(functionBody('toggleSettings')).toContain('shell.settingsOpener =')
    expect(functionBody('closeSettings')).toMatch(/back\.focus\(\)/)
  })
})
