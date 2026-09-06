import { describe, it, expect } from 'vitest'
import {
  buildContentCss,
  COMPACT_HEADER_WIDTH,
  FIT_HEADER_WIDTH,
  MIN_EMBED_WIDTH
} from './content-css'

describe('buildContentCss', () => {
  const stylesheet = (fullWidth: boolean, reserve: number | null): string =>
    buildContentCss({ fullWidth, reserve })

  it('always styles the scrollbar, whatever else is on', () => {
    for (const css of [stylesheet(false, null), stylesheet(true, 144)]) {
      expect(css).toContain('::-webkit-scrollbar')
    }
  })

  it('widens the two bars with min-width, never width', () => {
    const css = stylesheet(true, null)
    expect(css).toContain('.header__inner, .playControls__wrapper')
    expect(css).toContain('min-width: 100% !important')

    // The regression this file exists for. `width: 100%` overrides SoundCloud's container
    // in BOTH directions, so below ~900px it squeezed their header narrower than they ever
    // build it and the contents wrapped out of the 46px bar onto the page, covering it and
    // swallowing clicks. `min-width` can only widen.
    expect(css).not.toMatch(/[^-]width: 100%/)
  })

  it('leaves SoundCloud alone when full width is off', () => {
    const css = stylesheet(false, null)
    expect(css).not.toContain('.header__inner')
    expect(css).not.toContain('playControls__wrapper')
  })

  it('asks for header space only when the overlay is on screen', () => {
    // Superseded the media-query version: the width decision moved to `layout()`, which is
    // now the only place that decides, so `reserve` being non-null already means "showing".
    expect(stylesheet(false, 144)).toContain('padding-right: 144px !important')
    expect(stylesheet(false, null)).not.toContain('padding-right')
  })

  it('reserves nothing and adds no drag region without the embedded buttons', () => {
    const css = stylesheet(true, null)
    expect(css).not.toContain('padding-right')
    expect(css).not.toContain('app-region')
  })

  it('makes the header draggable but never its contents', () => {
    const css = stylesheet(true, 144)
    expect(css).toContain('.header { -webkit-app-region: drag; }')
    expect(css).toContain('.header * { -webkit-app-region: no-drag; }')
  })

  it('takes the reservation width it is given, so zoom can be applied by the caller', () => {
    expect(stylesheet(true, 115)).toContain('padding-right: 115px')
    expect(stylesheet(true, 180)).toContain('padding-right: 180px')
  })

  it('reserves room in the play controls only when the buttons are on', () => {
    expect(stylesheet(false, null)).not.toContain('playControls__wrapper { padding-right')
    expect(buildContentCss({ fullWidth: false, reserve: null, playerReserve: 92 })).toContain(
      '.playControls__wrapper { padding-right: 92px !important; }'
    )
  })

  it('keeps the two reservations independent of each other', () => {
    // The header overlay belongs to `hideMenuBar`; the player buttons are their own setting.
    // Neither may imply the other, or turning one on would silently move the other's bar.
    const headerOnly = buildContentCss({ fullWidth: false, reserve: 144, playerReserve: null })
    expect(headerOnly).toContain('.header__inner { padding-right: 144px !important; }')
    expect(headerOnly).not.toContain('playControls__wrapper { padding-right')

    const playerOnly = buildContentCss({ fullWidth: false, reserve: null, playerReserve: 92 })
    expect(playerOnly).toContain('.playControls__wrapper { padding-right: 92px !important; }')
    expect(playerOnly).not.toContain('.header__inner { padding-right')
  })

  it('emits the reservation and the drag region together, ungated', () => {
    // The bug this exists for: the padding was inside a media query and the JS that shows the
    // overlay used a different, stricter number. Between them SoundCloud's header reserved the
    // gap while our buttons stayed hidden. There is now one decision — `reserve` is non-null
    // only while the overlay is on screen — so a query here would reintroduce a second one.
    const css = buildContentCss({ fullWidth: true, reserve: 144, playerReserve: null })
    expect(css).toContain('padding-right: 144px !important')
    expect(css).toContain('-webkit-app-region: drag')
    expect(css).toContain('-webkit-app-region: no-drag')
    expect(css).not.toContain('@media')
  })

  it('emits neither when the overlay is not showing', () => {
    const css = buildContentCss({ fullWidth: true, reserve: null, playerReserve: null })
    expect(css).not.toContain('padding-right')
    expect(css).not.toContain('app-region')
  })

  it('reaches the window minimum, by compacting rather than by shrinking', () => {
    // Measured: even a 72px reservation wraps the stock header at 1000px, so making our own
    // overlay smaller buys nothing. What runs out is SoundCloud's space, not ours.
    expect(MIN_EMBED_WIDTH).toBe(800)
    expect(COMPACT_HEADER_WIDTH).toBeGreaterThan(MIN_EMBED_WIDTH)
  })

  it('hides only the paid-tier upsells when compacting', () => {
    const compact = buildContentCss({
      fullWidth: true,
      reserve: 144,
      playerReserve: null,
      compactHeader: true
    })
    expect(compact).toContain('.header__fanUpsell')
    expect(compact).toContain('.creatorSubscriptionsButton')
    expect(compact).toContain('.header__upsellWrapper')

    // Measured: the upsells are 167px against a 76px overflow, so they alone are enough and
    // everything else can stay. Hiding more than the numbers require is not ours to do.
    // Measured: the upsells alone are enough while their container still shrinks, so nothing
    // else goes at this tier. Hiding more than the numbers require is not ours to do.
    expect(compact).not.toContain('.uploadButton')
    expect(compact).not.toContain('.header__forArtistsButton')

    // Their account controls are navigation, not promotion, and are never touched.
    for (const keep of ['userNav', 'moreButton', 'notifications', 'messages']) {
      expect(compact).not.toContain(keep)
    }
  })

  it('only forces their container narrower at the tighter tier, and keeps Upload', () => {
    const fit = buildContentCss({
      fullWidth: true,
      reserve: 144,
      playerReserve: null,
      compactHeader: true,
      fitHeader: true
    })
    // Below ~960 their container stops shrinking, so it has to be overridden or their
    // controls slide under the overlay while the header still looks fine on one line.
    expect(fit).toContain('min-width: 0 !important')
    expect(fit).toContain('.header__forArtistsButton')
    // Upload survives even at the narrowest width — measured as unnecessary to hide.
    expect(fit).not.toContain('.uploadButton')
  })

  it('orders the fit override after the full-width rule, or it cannot win', () => {
    const fit = buildContentCss({
      fullWidth: true,
      reserve: 144,
      playerReserve: null,
      compactHeader: true,
      fitHeader: true
    })
    expect(fit.indexOf('min-width: 0 !important')).toBeGreaterThan(
      fit.indexOf('min-width: 100% !important')
    )
  })

  it('tiers are ordered, and both sit above the overlay floor', () => {
    expect(COMPACT_HEADER_WIDTH).toBeGreaterThan(FIT_HEADER_WIDTH)
    expect(FIT_HEADER_WIDTH).toBeGreaterThan(MIN_EMBED_WIDTH)
  })

  it('leaves the header alone when there is room, or with no overlay showing', () => {
    expect(
      buildContentCss({
        fullWidth: true,
        reserve: 144,
        playerReserve: null,
        compactHeader: false
      })
    ).not.toContain('.header__fanUpsell')

    // No overlay means no reason to take anything away from them.
    expect(
      buildContentCss({
        fullWidth: true,
        reserve: null,
        playerReserve: null,
        compactHeader: true
      })
    ).not.toContain('.header__fanUpsell')
  })
})
