import { describe, it, expect } from 'vitest'
import { buildContentCss, RESERVATION_MIN_WIDTH } from './content-css'

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

  it('only asks for header space where the header has room to give it', () => {
    const css = stylesheet(false, 144)
    expect(css).toContain(`@media (min-width: ${RESERVATION_MIN_WIDTH}px)`)
    // The padding must be inside the query, not alongside it.
    const query = css.slice(css.indexOf('@media'))
    expect(query).toContain('padding-right: 144px !important')
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
})
