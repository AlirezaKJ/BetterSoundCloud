/*
 * The judgement behind each theme's picture (src/main/theme-pictures.ts), pure so it is tested
 * without Electron: where each of our views lands in the picture, putting them together into one
 * picture of the whole window, and whether the page has drawn yet.
 */

/** A view's place in the window, in window pixels (or, scaled, in the picture's). */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** One view's capture, already scaled to its `Box` in the picture: BGRA, four bytes a pixel. */
export interface PictureLayer extends Box {
  bitmap: Uint8Array
}

/**
 * Where a view at `bounds` in the window lands in a picture `scale` times its size. Both edges
 * are rounded, not the size, so views that meet in the window meet in the picture, with no gap.
 */
export function pictureBox(bounds: Box, scale: number): Box {
  const x = Math.round(bounds.x * scale)
  const y = Math.round(bounds.y * scale)
  return {
    x,
    y,
    width: Math.round((bounds.x + bounds.width) * scale) - x,
    height: Math.round((bounds.y + bounds.height) * scale) - y
  }
}

/**
 * One `width`×`height` bitmap of the whole window from its views' captures, each drawn at its
 * place in the order given (the window's own order, bottom first), cut off at the edges. A
 * layer's rows may be padded: its stride is read from its length.
 */
export function composeLayers(
  width: number,
  height: number,
  layers: readonly PictureLayer[]
): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  for (const layer of layers) {
    if (layer.width <= 0 || layer.height <= 0) continue
    const stride = Math.floor(layer.bitmap.length / layer.height)
    if (stride < layer.width * 4) continue
    const left = Math.max(0, layer.x)
    const right = Math.min(width, layer.x + layer.width)
    const top = Math.max(0, layer.y)
    const bottom = Math.min(height, layer.y + layer.height)
    if (right <= left) continue
    for (let row = top; row < bottom; row++) {
      const from = (row - layer.y) * stride + (left - layer.x) * 4
      out.set(layer.bitmap.subarray(from, from + (right - left) * 4), (row * width + left) * 4)
    }
  }
  return out
}

/**
 * Whether a bitmap (BGRA, four bytes a pixel) is almost all one colour, in coarse steps of
 * colour: a page that has not drawn yet (measured: the first launch's picture of None was
 * SoundCloud's logo on black). `share` is how much of it must be the one colour.
 */
export function mostlyOneColour(bitmap: Uint8Array, share = 0.97): boolean {
  const pixels = Math.floor(bitmap.length / 4)
  if (pixels === 0) return true
  const counts = new Map<number, number>()
  let most = 0
  for (let i = 0; i < pixels * 4; i += 4) {
    const colour =
      ((bitmap[i] ?? 0) >> 4) * 256 +
      ((bitmap[i + 1] ?? 0) >> 4) * 16 +
      ((bitmap[i + 2] ?? 0) >> 4)
    const count = (counts.get(colour) ?? 0) + 1
    counts.set(colour, count)
    most = Math.max(most, count)
  }
  return most / pixels >= share
}
