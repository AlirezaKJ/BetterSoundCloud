import { describe, expect, it } from 'vitest'
import { composeLayers, mostlyOneColour, pictureBox } from './theme-pictures'

describe('pictureBox', () => {
  it('scales a view into the picture', () => {
    // Our 32px bar in a 1366px window, in a 720px picture.
    const scale = 720 / 1366
    expect(pictureBox({ x: 0, y: 0, width: 1366, height: 32 }, scale)).toEqual({
      x: 0,
      y: 0,
      width: 720,
      height: 17
    })
  })

  it('leaves no gap between views that meet', () => {
    const scale = 720 / 1366
    const bar = pictureBox({ x: 0, y: 0, width: 1366, height: 32 }, scale)
    const page = pictureBox({ x: 0, y: 32, width: 1366, height: 736 }, scale)
    expect(page.y).toBe(bar.y + bar.height)
    expect(page.y + page.height).toBe(Math.round(768 * scale))
  })
})

describe('composeLayers', () => {
  /** A `width`×`height` layer of one grey, its rows padded by `pad` bytes. */
  const layer = (
    x: number,
    y: number,
    width: number,
    height: number,
    grey: number,
    pad = 0
  ) => {
    const stride = width * 4 + pad
    const bitmap = new Uint8Array(stride * height)
    for (let row = 0; row < height; row++) {
      bitmap.fill(grey, row * stride, row * stride + width * 4)
    }
    return { x, y, width, height, bitmap }
  }
  const at = (bitmap: Uint8Array, width: number, x: number, y: number) =>
    bitmap[(y * width + x) * 4]

  it('draws the page, then the bar over its top, in that order', () => {
    // The bar laid over SoundCloud's page, as while Settings is open over a hidden bar.
    const out = composeLayers(4, 4, [layer(0, 0, 4, 4, 10), layer(0, 0, 4, 1, 200)])
    expect(at(out, 4, 0, 0)).toBe(200)
    expect(at(out, 4, 3, 0)).toBe(200)
    expect(at(out, 4, 0, 1)).toBe(10)
    expect(at(out, 4, 3, 3)).toBe(10)
  })

  it('puts a view at its place and cuts it off at the edges', () => {
    const out = composeLayers(4, 4, [layer(2, 3, 4, 4, 50)])
    expect(at(out, 4, 1, 3)).toBe(0)
    expect(at(out, 4, 2, 3)).toBe(50)
    expect(at(out, 4, 3, 3)).toBe(50)
    expect(at(out, 4, 2, 2)).toBe(0)
  })

  it('reads padded rows', () => {
    const out = composeLayers(3, 2, [layer(0, 0, 3, 2, 70, 8)])
    expect(at(out, 3, 2, 1)).toBe(70)
    expect(out.every((byte) => byte === 70)).toBe(true)
  })

  it('skips a layer too short for its size', () => {
    const out = composeLayers(2, 2, [
      { x: 0, y: 0, width: 2, height: 2, bitmap: new Uint8Array(4) }
    ])
    expect(out.every((byte) => byte === 0)).toBe(true)
  })
})

describe('mostlyOneColour', () => {
  const bitmap = (pixels: number[][]): Uint8Array => new Uint8Array(pixels.flat())

  it('is true for a page that has not drawn: black, and a speck of logo', () => {
    const pixels = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? [255, 255, 255, 255] : [18, 18, 18, 255]
    )
    expect(mostlyOneColour(bitmap(pixels))).toBe(true)
  })

  it('is false for a page with something on it', () => {
    const pixels = Array.from({ length: 100 }, (_, i) =>
      i % 3 === 0 ? [200, 120, 40, 255] : [18, 18, 18, 255]
    )
    expect(mostlyOneColour(bitmap(pixels))).toBe(false)
  })

  it('treats nearly the same colour as the same', () => {
    const pixels = Array.from({ length: 100 }, (_, i) =>
      i % 2 ? [18, 18, 18, 255] : [20, 19, 17, 255]
    )
    expect(mostlyOneColour(bitmap(pixels))).toBe(true)
  })

  it('is true for nothing at all', () => {
    expect(mostlyOneColour(new Uint8Array(0))).toBe(true)
  })
})
