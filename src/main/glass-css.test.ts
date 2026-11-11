import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  buildContentCss,
  buildFrameCss,
  GLASS_BAR_INKS,
  glassCss,
  glassFrameCss,
  glassHeaderCss,
  headerHiddenCss
} from './content-css'

/*
 * Glass's stylesheets (CLAUDE.md §17, "Glass"). Each rule here was learned on the live page, in
 * the user's own signed-in dev app, 2026-11-10; the tests hold the CSS to those findings.
 */

describe('glassCss', () => {
  // Comments out, so the scans below see only rules.
  const css = glassCss().replace(/\/\*[\s\S]*?\*\//g, '')

  it('clears the page and its columns, but never an image: artwork is a background image', () => {
    expect(css).toMatch(
      /html body #app > \.l-container[^{]*\{[^}]*background-color: transparent/
    )
    // Only the page's own boxes lose their background image; a rule that cleared images on
    // anything wider would blank every cover on the page.
    for (const [, selectors = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/background-image:\s*none/.test(body)) continue
      expect(selectors).not.toMatch(/artwork|image|sc-artwork/)
    }
  })

  it('beats a theme’s own page colours wherever the sheets land', () => {
    // Dark Cloud paints `#app > .l-container` with !important at (1,1,0); these start `html body`.
    for (const [, selectors = '', body = ''] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!/background-color/.test(body) || /^\s*(from|to)\s*$/.test(selectors)) continue
      expect(body, selectors.trim()).toContain('!important')
      for (const selector of selectors
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        expect(selector, selector).toMatch(/^html(\s|:|$)/)
      }
    }
  })

  it('never puts a blur, a shadow or a gap beside the fixed bars: those smeared on scroll', () => {
    // A backdrop-filter (one build) and floating pills with a shadow (another) both left the page
    // smeared with stale frames on a transparent window. The bars are a plain fill.
    expect(css).not.toMatch(/backdrop-filter/)
    expect(css).not.toMatch(/box-shadow/)
  })

  it('cuts the page off under the bars with a mask that follows the WINDOW’s scroll', () => {
    // SoundCloud loads more of a feed when the window scrolls; making body the scroller stopped it.
    expect(css).toContain('animation-timeline: view()')
    expect(css).toContain('mask-position: 0 -100vh')
    expect(css).toContain('mask-position: 0 calc(100% + 100vh)')
    expect(css).not.toMatch(/html[^{]*\{[^}]*overflow:\s*hidden/)
    // The bottom cut only while SoundCloud shows its play bar, read from its own stylesheet.
    expect(css).toContain('html:has(.playControls.m-visible)')
  })

  it('keeps the play button’s circle while the bar’s other controls lose their boxes', () => {
    // SoundCloud draws the triangle in the page colour on a round background (§17).
    expect(css).toContain('.playControls__inner .sc-button:not(.sc-button-play)')
    expect(css).not.toMatch(/--surface-color:/)
  })

  it('keeps SoundCloud’s /n/ iframe see-through: same colour scheme as its element', () => {
    // A frame whose scheme differs from its element's gets an opaque canvas from Chromium.
    expect(css).toContain('iframe[src^="https://soundcloud.com/n/"] { color-scheme: dark')
  })

  it('makes the waveforms glassy through MUI’s own groups, found by accessible name', () => {
    expect(css).toContain('[role="slider"][aria-label="Waveform"]')
    expect(css).not.toMatch(/\.mui-[a-z0-9]{5,}/) // hashed classes change every build
  })
})

describe('glassFrameCss', () => {
  it('dresses the frame like the page, without the bars it does not have', () => {
    const css = glassFrameCss()
    expect(css).toContain('background-color: transparent')
    // An html::before in the frame would lay a dark strip across its top.
    expect(css).not.toContain('html:root::before')
    expect(css).not.toContain('animation-timeline')
    expect(css).not.toContain('playControls__inner {')
  })
})

describe('buildFrameCss', () => {
  it('carries the palette, the theme and glass, in that order, and nothing about the bars', () => {
    const css = buildFrameCss({
      palette: '/*palette*/',
      theme: '/*theme*/',
      glass: '/*glass*/'
    })
    expect(css.indexOf('/*palette*/')).toBeLessThan(css.indexOf('/*theme*/'))
    expect(css.indexOf('/*theme*/')).toBeLessThan(css.indexOf('/*glass*/'))
    expect(css).not.toContain('padding-right')
  })

  it('is just the basics with no theme and no glass', () => {
    const css = buildFrameCss({})
    expect(css).toContain('::-webkit-scrollbar')
    expect(css).toContain('--bsc-cover: none')
  })
})

describe('glass in the page sheet', () => {
  it('goes after the theme, so it clears a theme’s page colours, and before the Background', () => {
    const css = buildContentCss({
      fullWidth: false,
      reserve: null,
      theme: '/*theme*/',
      glass: '/*glass*/',
      background: '/*background*/'
    })
    expect(css.indexOf('/*theme*/')).toBeLessThan(css.indexOf('/*glass*/'))
    expect(css.indexOf('/*glass*/')).toBeLessThan(css.indexOf('/*background*/'))
  })

  it('gives the header its slide only while the top bar hides until pointed at', () => {
    const on = buildContentCss({ fullWidth: false, reserve: null, autoHideHeader: true })
    const off = buildContentCss({ fullWidth: false, reserve: null })
    expect(on).toContain('transition: transform')
    expect(off).not.toContain('transition: transform')
  })
})

describe('glassHeaderCss', () => {
  const css = glassHeaderCss()
  /** Every `{ … }` body in the sheet: the declarations, without the media query around them. */
  const bodies = [...css.matchAll(/\{([^{}]*)\}/g)].map(([, body]) => body ?? '')

  it('clears our bar’s page and sets only tokens, like a theme’s chrome block', () => {
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies)
      for (const [, property] of body.matchAll(/([\w-]+)\s*:/g))
        expect(property).toMatch(/^--bsc-/)
    expect(css).toMatch(/^:root \{[^{}]*--bsc-page-bg: transparent/)
  })

  it('gives the bar dark ink under a light scheme, since the glass is dark either way', () => {
    // Measured 2026-11-11: with Appearance on Light, the title and buttons all but vanished.
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\) and \(forced-colors: none\) \{\s*:root \{[^{}]*--bsc-text-secondary: #a0a0a0/
    )
  })

  it('uses exactly tokens.css’s dark values, so the two cannot drift apart', () => {
    const tokens = readFileSync(join(import.meta.dirname, '../renderer/tokens.css'), 'utf8')
    const dark = /@media \(prefers-color-scheme: dark\) \{\s*:where\(:root\) \{([^}]*)\}/.exec(
      tokens
    )?.[1]
    expect(dark).toBeTruthy()
    for (const [token, value] of Object.entries(GLASS_BAR_INKS)) {
      expect(dark, token).toContain(`${token}: ${value};`)
    }
  })
})

describe('headerHiddenCss', () => {
  it('moves the header with a transform only, so the page does not reflow (§4: 46 CSS px)', () => {
    const css = headerHiddenCss(false)
    expect(css).toContain('transform: translateY(-100%)')
    expect(css).not.toMatch(/height|display:\s*none/)
    expect(css).not.toContain('mask-image')
  })

  it('leaves the header on screen while the keyboard is in it: typing in search, or Tab', () => {
    // :focus-visible, not :focus-within: a link clicked with the mouse keeps focus after
    // SoundCloud moves to its page, and must not pin the header there.
    expect(headerHiddenCss(false)).toContain('header.header:not(:has(:focus-visible))')
    expect(headerHiddenCss(false)).not.toContain('focus-within')
  })

  it('lifts Glass’s top cut while the header is away, so the page runs up to the edge', () => {
    const css = headerHiddenCss(true)
    expect(css).toContain('mask-image: none')
    expect(css).toContain(':has(.playControls.m-visible)')
    // ...and not while the keyboard has brought the header back over it.
    for (const rule of css.split('\n').filter((r) => r.includes('mask-image'))) {
      expect(rule).toMatch(/^html:not\(:has\(#app > header\.header :focus-visible\)\)/)
    }
  })
})
