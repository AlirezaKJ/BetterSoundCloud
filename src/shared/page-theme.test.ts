import { describe, it, expect } from 'vitest'
import { detectPageTheme, luminance } from './page-theme'

describe('luminance', () => {
  it('reads both rgb and rgba', () => {
    expect(luminance('rgb(255, 255, 255)')).toBeCloseTo(1)
    expect(luminance('rgb(0, 0, 0)')).toBeCloseTo(0)
    expect(luminance('rgba(34, 35, 38, 1)')).toBeLessThan(0.2)
  })

  it('refuses a fully transparent colour rather than calling it black', () => {
    // Measured: `.playControls` computes to `rgba(0, 0, 0, 0)`. Treating that as black would
    // have said "dark page" on a light one.
    expect(luminance('rgba(0, 0, 0, 0)')).toBeNull()
  })

  it('returns null for anything it cannot parse', () => {
    expect(luminance('')).toBeNull()
    expect(luminance('transparent')).toBeNull()
    expect(luminance('#fff')).toBeNull()
    expect(luminance('rgb(a, b, c)')).toBeNull()
  })
})

describe('detectPageTheme', () => {
  it('trusts SoundCloud’s own body class first', () => {
    // Measured on the live page: `<body class="theme-light">`.
    expect(detectPageTheme('theme-light', 'rgb(0, 0, 0)')).toBe('light')
    expect(detectPageTheme('theme-dark', 'rgb(255, 255, 255)')).toBe('dark')
    expect(detectPageTheme('sc-classic theme-light foo', 'rgb(0,0,0)')).toBe('light')
  })

  it('is not fooled by a class that merely contains the name', () => {
    expect(detectPageTheme('not-theme-lightish', 'rgb(20, 20, 20)')).toBe('dark')
  })

  it('falls back to the background when the class is gone', () => {
    // The class is SoundCloud's to rename. If they do, we should lose the cheap path, not
    // the feature.
    expect(detectPageTheme('', 'rgb(255, 255, 255)')).toBe('light')
    expect(detectPageTheme('', 'rgb(34, 35, 38)')).toBe('dark')
  })

  it('assumes dark when it cannot tell', () => {
    // A wrong guess toward dark paints our glyphs light — legible on either background.
    // The other way round is invisible on SoundCloud's default dark page.
    expect(detectPageTheme('', 'transparent')).toBe('dark')
    expect(detectPageTheme('', '')).toBe('dark')
  })
})
