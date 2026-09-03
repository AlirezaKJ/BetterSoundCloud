import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseThemeMetadata } from '@shared/themes'

// These read the shipped stylesheet off disk, so they live on the main side: `src/shared`
// is type-checked against the web tsconfig, which has no Node types.
describe('the shipped minimal-nav theme', () => {
  const css = readFileSync(
    join(import.meta.dirname, '../../resources/themes/minimal-nav.css'),
    'utf8'
  )

  it('declares usable metadata', () => {
    const meta = parseThemeMetadata(css, 'minimal-nav')
    expect(meta.name).toBe('Minimal navigation')
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(meta.description.length).toBeGreaterThan(20)
  })

  it('targets nav links by href, never by position', () => {
    // `:nth-child` would put the wrong icon on the wrong link the day SoundCloud reorders
    // its menu — a silently wrong theme rather than an obviously broken one. Comments are
    // stripped first, or this matches the comment that explains the rule.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const href of ['/discover', '/feed', '/you/library']) {
      expect(rules).toContain(`[href='${href}']`)
    }
    expect(rules).not.toMatch(/nth-child/)
  })

  it('restyles only — it must never try to restructure SoundCloud', () => {
    // A theme is CSS reaching the page through insertCSS, so it cannot execute anything.
    // These guard the authoring rule that goes with that: no imports, no remote fetches.
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*['"]?https?:/)
  })

  it('hides labels without hiding them from screen readers', () => {
    // `font-size: 0` keeps the anchor's accessible name. `display: none` on the text, or
    // replacing it, would have cost the link its label.
    expect(css).toContain('font-size: 0')
  })

  it('gives every icon an identical box, so they line up', () => {
    // Measured regression. Without these three the anchors collapse to their content: the
    // row ended up with boxes 22, 24 and 46 tall, so each icon sat at a different height,
    // and baseline alignment of an inline-flex box also grew SoundCloud's 46px header to
    // 51.3px. With them, all four icon centres land on 23.0px from the header top.
    expect(css).toContain('height: 46px')
    expect(css).toContain('box-sizing: border-box')
    expect(css).toContain('vertical-align: middle')
  })

  it('centres the icon by position, not by flex', () => {
    // The selected nav item carries a 2px bottom border. Centring with `align-items` would
    // let that border shift its icon up relative to the others; pinning the icon at half the
    // bar height makes the border irrelevant.
    expect(css).toContain('top: 23px')
    expect(css).toContain('translate(-50%, -50%)')
  })

  it('hides the right-hand links rather than iconifying them', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const sel of [
      '.header__fanUpsell',
      '.creatorSubscriptionsButton',
      '.header__forArtistsButton',
      '.uploadButton'
    ]) {
      expect(rules).toContain(sel)
    }
    // If any of them were still iconified it would need a mask image of its own. Only the
    // three nav links carry icons.
    expect(rules).not.toContain('--bsc-icon-upload')
    expect(rules).not.toContain('--bsc-icon-studio')
    const icons = [...rules.matchAll(/--bsc-icon-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(icons).toEqual(['feed', 'home', 'library'])
  })

  it('closes the gap the hidden links left beside the avatar', () => {
    // SoundCloud's 16px right margin on the avatar button separated it from the promo links.
    // With those hidden it became a stray gap between the account chevron and the bell —
    // measured at exactly 16px, now 0.
    expect(css).toContain('.header__userNav .header__userNavButton')
    expect(css).toContain('margin-right: 0 !important')
  })
})
