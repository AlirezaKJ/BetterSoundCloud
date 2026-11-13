/**
 * How each visualizer look is drawn (CLAUDE.md §22, DESIGN.md "Visualizer"). Plain canvas, in CSS
 * pixels (the caller scales for the screen), from levels the caller has already eased.
 *
 * The look is the showcase's: flat ink on the room's colour. No glow, no gradient, no rounded
 * caps — square ends, like the sleeve, the progress rule and the lyric rests. A peak is a 2px rule
 * that holds, then falls back.
 */

import type { Box } from '@shared/visualizer'

/**
 * How strongly each part is inked: decoration, so well under the text, but there to be seen. Where
 * the look is the subject of its place (the view of its own), it is drawn at `strength` times this,
 * never past full ink.
 */
const BAR_ALPHA = 0.3
const PEAK_ALPHA = 0.7
/** A peak this low is not drawn: an empty band shows nothing at all, not a stub. */
const PEAK_FLOOR = 0.015
/** The share of each bar's slot it fills; the rest is the gap. */
const BAR_FILL = 0.56

/** Twice the strength: a look that is the subject of its place, not decoration under text. */
export const STRONG = 2

/**
 * Bars standing on the bottom edge of `area`, one per level, low to high, left to right, each up
 * to the area's height.
 */
export function drawBars(
  context: CanvasRenderingContext2D,
  area: Box,
  levels: ArrayLike<number>,
  peaks: ArrayLike<number>,
  ink: string,
  strength = 1
): void {
  const count = levels.length
  const width = area.right - area.left
  const height = area.bottom - area.top
  const slot = width / count
  const bar = Math.max(2, Math.round(slot * BAR_FILL))
  context.fillStyle = ink

  context.globalAlpha = Math.min(1, BAR_ALPHA * strength)
  for (let i = 0; i < count; i++) {
    const tall = Math.round((levels[i] ?? 0) * height)
    if (tall < 1) continue
    const x = Math.round(area.left + i * slot + (slot - bar) / 2)
    context.fillRect(x, area.bottom - tall, bar, tall)
  }

  context.globalAlpha = Math.min(1, PEAK_ALPHA * strength)
  for (let i = 0; i < count; i++) {
    const peak = peaks[i] ?? 0
    if (peak < PEAK_FLOOR) continue
    const x = Math.round(area.left + i * slot + (slot - bar) / 2)
    context.fillRect(x, Math.round(area.bottom - peak * height) - 2, bar, 2)
  }
  context.globalAlpha = 1
}

/**
 * The strip's hairlines: 2px wide, one every 6px. Half strength: they float over the page, artwork
 * included, where a third was lost (seen 2026-11-12), and still sit well under its text.
 */
const HAIRLINE = 2
const HAIRLINE_PITCH = 6
const HAIRLINE_ALPHA = 0.5

/**
 * Bars as hairlines standing on the bottom edge of `area`, one every few pixels, each blended from
 * the two nearest bands. For the strip over SoundCloud's player: 64 blocks in a band that short
 * read as a row of tiles rather than a spectrum (seen 2026-11-12), and peak marks over them were
 * clutter in something meant to stay quiet while browsing.
 */
export function drawHairlines(
  context: CanvasRenderingContext2D,
  area: Box,
  levels: ArrayLike<number>,
  ink: string
): void {
  const count = levels.length
  const width = area.right - area.left
  const height = area.bottom - area.top
  const lines = Math.max(count, Math.floor(width / HAIRLINE_PITCH))
  const slot = width / lines
  context.fillStyle = ink
  context.globalAlpha = HAIRLINE_ALPHA
  for (let line = 0; line < lines; line++) {
    const band = ((line + 0.5) / lines) * count - 0.5
    const tall = Math.round(levelBetween(levels, band) * height)
    if (tall < 1) continue
    const x = Math.round(area.left + line * slot + (slot - HAIRLINE) / 2)
    context.fillRect(x, area.bottom - tall, HAIRLINE, tall)
  }
  context.globalAlpha = 1
}

/**
 * A level between bands: `band` is a place along the spectrum in bands (0 is the lowest band's
 * centre), blended from the two nearest.
 */
function levelBetween(levels: ArrayLike<number>, band: number): number {
  const count = levels.length
  const at = Math.min(count - 1, Math.max(0, band))
  const below = Math.floor(at)
  const above = Math.min(count - 1, below + 1)
  const low = levels[below] ?? 0
  return low + ((levels[above] ?? 0) - low) * (at - below)
}

/** The flowing line: its outline, the faint body between its halves, and its tapered ends. */
const FLOW_LINE_ALPHA = 0.62
const FLOW_BODY_ALPHA = 0.12
const FLOW_TAPER = 4

/**
 * The "Waveform" look: a smooth line through the band levels, low to high across `area`, mirrored
 * above and below its middle, so it swells with the bass and ripples with the treble. Each level
 * is softened with its neighbours (1–2–1) and the two ends taper to the middle line, so the shape
 * closes cleanly. Not the raw wave: that jumped about with real music (2026-11-12), where these
 * levels, already eased, move like the bars. A 2px outline over a faint flat body.
 *
 * `rise` draws one half only, rising from the bottom edge, its body filled down to it: for the
 * strip over SoundCloud's player, where a line across the middle struck through the page's text
 * (seen 2026-11-12) and the bars beside it stand on the bar.
 */
export function drawFlow(
  context: CanvasRenderingContext2D,
  area: Box,
  levels: ArrayLike<number>,
  ink: string,
  rise = false,
  strength = 1
): void {
  const count = levels.length
  if (count < 3) return
  const middle = rise ? area.bottom : (area.top + area.bottom) / 2
  const half = rise ? area.bottom - area.top : (area.bottom - area.top) / 2
  const step = (area.right - area.left) / (count - 1)
  const at = (i: number): number => levels[Math.min(count - 1, Math.max(0, i))] ?? 0
  const swing = Array.from({ length: count }, (_, i) => {
    // Eased (smoothstep) rather than straight, so the ends round off instead of coming to a point.
    const edge = Math.min(1, i / FLOW_TAPER, (count - 1 - i) / FLOW_TAPER)
    const taper = edge * edge * (3 - 2 * edge)
    return ((at(i - 1) + 2 * at(i) + at(i + 1)) / 4) * taper * half
  })

  // One half of the outline, from the current point, through each level's point to the end.
  const trace = (order: number[], sign: 1 | -1): void => {
    for (let k = 1; k < order.length - 1; k++) {
      const i = order[k] ?? 0
      const next = order[k + 1] ?? i
      const x = area.left + i * step
      const y = middle - sign * (swing[i] ?? 0)
      const nx = area.left + next * step
      const ny = middle - sign * (swing[next] ?? 0)
      context.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    const last = order.at(-1) ?? 0
    context.lineTo(area.left + last * step, middle - sign * (swing[last] ?? 0))
  }
  const forward = Array.from({ length: count }, (_, i) => i)
  const back = [...forward].reverse()

  context.beginPath()
  context.moveTo(area.left, middle)
  trace(forward, 1)
  if (!rise) trace(back, -1)
  context.closePath()
  context.fillStyle = ink
  context.globalAlpha = Math.min(1, FLOW_BODY_ALPHA * strength)
  context.fill()
  if (rise) {
    // The outline is the curve alone: closed, it would draw a rule along the bar's edge.
    context.beginPath()
    context.moveTo(area.left, middle)
    trace(forward, 1)
  }
  context.strokeStyle = ink
  context.lineWidth = 2
  context.lineJoin = 'round'
  context.globalAlpha = Math.min(1, FLOW_LINE_ALPHA * strength)
  context.stroke()
  context.globalAlpha = 1
}

/** Hairlines per band round the sleeve, and how wide each is: a fringe, not a row of pins. */
const RING_LINES_PER_BAND = 3
const RING_LINE = 2
const RING_ALPHA = 0.42

/**
 * A fringe of hairlines standing out from the four edges of the sleeve, `gap` away from it: the
 * sleeve is a square print, so the "ring" follows its edges rather than a circle that would cut
 * into the notes beside it. The spectrum runs from the bottom edge's middle (the bass) round each
 * side to the top edge's middle (the treble), the same on both halves, so the sleeve stays
 * balanced. Three lines a band, each blended from its neighbours, so the outline swells and
 * settles smoothly: thick bars here read as the pins of a chip (seen 2026-11-11), and peak marks
 * only cluttered it. `reach` is the longest a line may be.
 */
export function drawRing(
  context: CanvasRenderingContext2D,
  sleeve: Box,
  gap: number,
  reach: number,
  levels: ArrayLike<number>,
  ink: string
): void {
  const count = levels.length
  const lines = count * RING_LINES_PER_BAND
  const side = sleeve.right - sleeve.left
  const slot = (side * 2) / lines
  const centre = (sleeve.left + sleeve.right) / 2

  // The line's place along the spectrum, blended from the two nearest bands.
  const levelAt = (line: number): number =>
    levelBetween(levels, (line + 0.5) / RING_LINES_PER_BAND - 0.5)

  context.fillStyle = ink
  context.globalAlpha = RING_ALPHA
  for (let line = 0; line < lines; line++) {
    const length = Math.round(levelAt(line) * reach)
    if (length < 1) continue
    // Along the half-path: bottom middle → bottom-left corner → up the left → top middle. The
    // right half mirrors it.
    const distance = (line + 0.5) * slot
    if (distance < side / 2 || distance >= side * 1.5) {
      const along =
        distance < side / 2 ? centre - distance : sleeve.left + (distance - side * 1.5)
      const y = distance < side / 2 ? sleeve.bottom + gap : sleeve.top - gap - length
      for (const x of [along, 2 * centre - along]) {
        context.fillRect(Math.round(x - RING_LINE / 2), Math.round(y), RING_LINE, length)
      }
    } else {
      const y = Math.round(sleeve.bottom - (distance - side / 2) - RING_LINE / 2)
      context.fillRect(Math.round(sleeve.left - gap - length), y, length, RING_LINE)
      context.fillRect(Math.round(sleeve.right + gap), y, length, RING_LINE)
    }
  }
  context.globalAlpha = 1
}
