/**
 * The full-screen showcase: what can be decided about it without a window.
 *
 * Its backdrop is one flat colour taken from the playing track's artwork — no blur, no gradient,
 * per DESIGN.md — and deepened until the showcase's ink reads on it at 7:1 or better, whatever the
 * artwork looks like. The view samples the artwork's pixels; everything after that is here, pure
 * and tested.
 */

export type Rgb = { readonly r: number; readonly g: number; readonly b: number }

/** The showcase's text colour, the dark-mode Ink. Its backdrop is always deep, in both modes. */
export const SHOWCASE_INK: Rgb = { r: 242, g: 242, b: 242 }

/** Ink on the backdrop is held to 7:1, the AAA floor, because it is read from across a room. */
const INK_CONTRAST = 7

/** Hues are grouped into this many slices of the colour wheel, 30 degrees each. */
const HUE_SLICES = 12
/** Below this much colour a pixel counts as grey: black, white and everything between. */
const GREY_CHROMA = 0.12
/** A sleeve with less colour than this, pixel for pixel, is a grey one. */
const COLOURFUL_SHARE = 0.06

/** Colour summed over some pixels, each weighted by `weight`. */
type Bucket = { r: number; g: number; b: number; weight: number }

/**
 * The colour that sums an artwork up, from its RGBA pixels (a small sample is plenty), or null
 * when nothing in it is opaque.
 *
 * Not the average: the average of a colourful sleeve is a muddy olive or brown, the same for
 * most of them (measured on real SoundCloud artwork, 2026-10-28). Instead, the hue that holds
 * the most colour wins — pixels are sorted into slices of the colour wheel, weighted by how much
 * colour each has, a slice scored with its two neighbours so a hue on a boundary is not split —
 * and the answer is the average of the pixels in that hue. A sleeve with hardly any colour gives
 * its own grey.
 */
export function artworkColour(rgba: ArrayLike<number>): Rgb | null {
  const slices: Bucket[] = Array.from({ length: HUE_SLICES }, () => ({
    r: 0,
    g: 0,
    b: 0,
    weight: 0
  }))
  const grey: Bucket = { r: 0, g: 0, b: 0, weight: 0 }
  let pixels = 0
  let colour = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue
    const pixel = { r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0, b: rgba[i + 2] ?? 0 }
    const { h } = toHsl(pixel)
    const chroma =
      (Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b)) / 255
    pixels++
    grey.r += pixel.r
    grey.g += pixel.g
    grey.b += pixel.b
    grey.weight++
    if (chroma < GREY_CHROMA) continue
    colour += chroma
    const slice = slices[Math.floor(h * HUE_SLICES) % HUE_SLICES]
    if (!slice) continue
    slice.r += pixel.r * chroma
    slice.g += pixel.g * chroma
    slice.b += pixel.b * chroma
    slice.weight += chroma
  }
  if (pixels === 0) return null
  if (colour / pixels < COLOURFUL_SHARE) {
    return { r: grey.r / grey.weight, g: grey.g / grey.weight, b: grey.b / grey.weight }
  }
  // A slice with its two neighbours, round the wheel.
  const around = (index: number): Bucket[] =>
    [index - 1, index, index + 1].map(
      (n) => slices[(n + HUE_SLICES) % HUE_SLICES] ?? { r: 0, g: 0, b: 0, weight: 0 }
    )
  let best = 0
  let bestScore = -1
  for (let index = 0; index < HUE_SLICES; index++) {
    const score = around(index).reduce((sum, slice) => sum + slice.weight, 0)
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  }
  const chosen = around(best).reduce(
    (sum, slice) => ({
      r: sum.r + slice.r,
      g: sum.g + slice.g,
      b: sum.b + slice.b,
      weight: sum.weight + slice.weight
    }),
    { r: 0, g: 0, b: 0, weight: 0 }
  )
  return {
    r: chosen.r / chosen.weight,
    g: chosen.g / chosen.weight,
    b: chosen.b / chosen.weight
  }
}

/**
 * `colour` made into a backdrop: its hue kept, its saturation capped so it never shouts, and its
 * lightness deepened, then lowered further until the showcase's ink has at least 7:1 on it.
 */
export function showcaseBackdrop(colour: Rgb): Rgb {
  const { h, s, l } = toHsl(colour)
  const saturation = Math.min(s, 0.6)
  // Deeper in proportion, so a darker sleeve still gives a darker room than a pale one of the
  // same hue: capping alone gave two such sleeves one identical colour (measured).
  let lightness = Math.min(l * 0.62, 0.32)
  // Whole channels, as CSS will draw it, so rounding can never take it under the line.
  let rgb = rounded(fromHsl(h, saturation, lightness))
  while (contrast(SHOWCASE_INK, rgb) < INK_CONTRAST && lightness > 0) {
    lightness = Math.max(0, lightness - 0.01)
    rgb = rounded(fromHsl(h, saturation, lightness))
  }
  return rgb
}

/** The showcase's colours for one backdrop, as CSS. Every one is checked against it. */
export type ShowcaseInks = {
  readonly backdrop: string
  /** Titles and the line being sung: 7:1 or better. */
  readonly ink: string
  /** The artist, the clock, the lines still to come: the dimmest mix that keeps 4.5:1. */
  readonly muted: string
  /** The progress track, a missing sleeve, the hairline round the artwork. Not for text. */
  readonly faint: string
}

/** What sits behind everything until the artwork has given a colour: dark Shell Grey. */
export const NEUTRAL_BACKDROP: Rgb = { r: 18, g: 18, b: 18 }

export function showcaseInks(backdrop: Rgb): ShowcaseInks {
  // From half-way to the backdrop up towards full ink, stop at the first that reads at AA.
  let share = 0.5
  while (share < 1 && contrast(mix(SHOWCASE_INK, backdrop, share), backdrop) < 4.5) {
    share += 0.02
  }
  return {
    backdrop: cssColour(backdrop),
    ink: cssColour(SHOWCASE_INK),
    muted: cssColour(mix(SHOWCASE_INK, backdrop, Math.min(share, 1))),
    faint: cssColour(mix(SHOWCASE_INK, backdrop, 0.16))
  }
}

/** `share` of `a` over the rest of `b`, channel by channel, in whole channels. */
function mix(a: Rgb, b: Rgb, share: number): Rgb {
  return rounded({
    r: a.r * share + b.r * (1 - share),
    g: a.g * share + b.g * (1 - share),
    b: a.b * share + b.b * (1 - share)
  })
}

function rounded({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) }
}

/**
 * The artwork to show for now-playing's 500×500 URL, largest first. SoundCloud's image host
 * also serves every artwork at 1080×1080 (measured on uploads from 2010 on, 2026-10-28), which
 * stays sharp full screen; the 500 is the fallback. Nothing but that host is accepted.
 */
export function artworkSources(url: string): string[] {
  if (!/^https:\/\/i\d*\.sndcdn\.com\/[A-Za-z0-9._~/-]+-t500x500\.(jpg|png)$/.test(url))
    return []
  return [url.replace(/-t500x500\.(jpg|png)$/, '-t1080x1080.$1'), url]
}

/** `rgb(r g b)`, rounded, for CSS. */
export function cssColour({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

/** WCAG 2 contrast ratio between two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h / 6, s, l }
}

function fromHsl(h: number, s: number, l: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 }
}

/** Whole seconds as a clock, the way SoundCloud writes it: `3:07`, or `1:02:30` past an hour. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
