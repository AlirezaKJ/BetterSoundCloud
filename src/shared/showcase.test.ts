import { describe, it, expect } from 'vitest'
import {
  artworkColour,
  artworkSources,
  NEUTRAL_BACKDROP,
  showcaseInks,
  contrast,
  cssColour,
  formatClock,
  SHOWCASE_INK,
  showcaseBackdrop
} from './showcase'
import type { Rgb } from './showcase'

function rounded(colour: Rgb | null): string | null {
  return colour && cssColour(colour)
}

/** A flat RGBA image of `count` pixels, all one colour. */
function pixels(colour: [number, number, number, number], count = 16): number[] {
  return Array.from({ length: count }, () => colour).flat()
}

describe('artworkColour', () => {
  it('is the colour of a one-colour artwork', () => {
    expect(rounded(artworkColour(pixels([200, 40, 30, 255])))).toBe('rgb(200 40 30)')
  })

  it('leans to the vivid part of an artwork, not the muddy average', () => {
    // Mostly grey with one orange stripe: a plain average would be a dull brownish grey.
    const image = [...pixels([120, 120, 120, 255], 12), ...pixels([255, 85, 0, 255], 4)]
    const colour = artworkColour(image)
    expect(colour && colour.r - colour.b).toBeGreaterThan(150)
  })

  it('takes the hue holding the most colour, not the brown between two', () => {
    // Green and red side by side average to a muddy brown; the sleeve is green and red.
    const image = [...pixels([30, 190, 40, 255], 8), ...pixels([220, 30, 30, 255], 6)]
    const colour = artworkColour(image)
    expect(colour && colour.g - colour.r).toBeGreaterThan(120)
  })

  it('gives a nearly colourless sleeve its own grey', () => {
    // Mostly black, with a sliver of red lettering: a black room, not a red one.
    const image = [...pixels([12, 12, 12, 255], 60), ...pixels([200, 20, 20, 255], 2)]
    const colour = artworkColour(image)
    expect(
      colour && Math.max(colour.r, colour.g, colour.b) - Math.min(colour.r, colour.g, colour.b)
    ).toBeLessThan(12)
  })

  it('still answers for a black-and-white sleeve, and ignores what is see-through', () => {
    expect(rounded(artworkColour(pixels([20, 20, 20, 255])))).toBe('rgb(20 20 20)')
    expect(artworkColour(pixels([255, 0, 0, 0]))).toBeNull()
    expect(artworkColour([])).toBeNull()
  })
})

describe('showcaseBackdrop', () => {
  it('keeps the ink readable at 7:1 on whatever the artwork gives, white included', () => {
    for (const colour of [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 230, b: 0 },
      { r: 0, g: 200, b: 255 },
      { r: 255, g: 85, b: 0 },
      { r: 10, g: 10, b: 10 },
      { r: 128, g: 128, b: 128 }
    ]) {
      const backdrop = showcaseBackdrop(colour)
      expect(contrast(SHOWCASE_INK, backdrop), cssColour(colour)).toBeGreaterThanOrEqual(7)
    }
  })

  it('gives a darker sleeve a darker room than a pale one of the same hue', () => {
    // Two real sleeves, both yellow-brown: once they came out one identical olive.
    const dark = showcaseBackdrop({ r: 120, g: 101, b: 58 })
    const pale = showcaseBackdrop({ r: 164, g: 142, b: 83 })
    expect(contrast(SHOWCASE_INK, dark)).toBeGreaterThan(contrast(SHOWCASE_INK, pale) + 0.5)
  })

  it('keeps the hue, so an orange sleeve gives an orange room', () => {
    const backdrop = showcaseBackdrop({ r: 255, g: 85, b: 0 })
    expect(backdrop.r).toBeGreaterThan(backdrop.g)
    expect(backdrop.g).toBeGreaterThan(backdrop.b)
  })

  it('writes CSS colours', () => {
    expect(cssColour({ r: 12.4, g: 200.6, b: 0 })).toBe('rgb(12 201 0)')
  })
})

describe('formatClock', () => {
  it('writes the time the way SoundCloud does', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(213.9)).toBe('3:33')
    expect(formatClock(3750)).toBe('1:02:30')
    expect(formatClock(-4)).toBe('0:00')
  })
})

describe('showcaseInks', () => {
  /** `rgb(r g b)` back to numbers. */
  function rgb(css: string): Rgb {
    const [r = 0, g = 0, b = 0] = (css.match(/\d+/g) ?? []).map(Number)
    return { r, g, b }
  }

  it('keeps the muted text at AA on every backdrop the artwork can give', () => {
    for (const colour of [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 230, b: 0 },
      { r: 0, g: 90, b: 255 },
      { r: 255, g: 85, b: 0 },
      NEUTRAL_BACKDROP
    ]) {
      const inks = showcaseInks(showcaseBackdrop(colour))
      const backdrop = rgb(inks.backdrop)
      expect(contrast(rgb(inks.ink), backdrop)).toBeGreaterThanOrEqual(7)
      expect(contrast(rgb(inks.muted), backdrop)).toBeGreaterThanOrEqual(4.5)
      // Muted is dimmer than ink, or it would not be muted.
      expect(contrast(rgb(inks.muted), backdrop)).toBeLessThan(
        contrast(rgb(inks.ink), backdrop)
      )
    }
  })
})

describe('artworkSources', () => {
  it('asks for the 1080px artwork first, then the 500px one now-playing gave', () => {
    expect(
      artworkSources('https://i1.sndcdn.com/artworks-000003159748-ovckqr-t500x500.jpg')
    ).toEqual([
      'https://i1.sndcdn.com/artworks-000003159748-ovckqr-t1080x1080.jpg',
      'https://i1.sndcdn.com/artworks-000003159748-ovckqr-t500x500.jpg'
    ])
  })

  it('accepts nothing but SoundCloud’s image host', () => {
    expect(artworkSources('')).toEqual([])
    expect(artworkSources('https://example.com/a-t500x500.jpg')).toEqual([])
    expect(artworkSources('http://i1.sndcdn.com/a-t500x500.jpg')).toEqual([])
    expect(artworkSources('https://i1.sndcdn.com.evil.net/a-t500x500.jpg')).toEqual([])
    expect(artworkSources('https://i1.sndcdn.com/a-t500x500.jpg")')).toEqual([])
  })
})
