/**
 * The Visualizer (CLAUDE.md §22): the pure pieces, shared by the audio engine's view, main, the
 * plugin service and the views that draw. No Electron, no DOM, so every judgement here is tested.
 *
 *   engine view: an AnalyserNode at the end of its chain --bandLevels--> a VisualFrame
 *   main:        readVisualFrame (every frame, like every message) --> the view that draws
 *   drawing:     follow (attack and release) and nextPeak (hold, then fall), per animation frame
 */

/** Frequency bands per frame: log-spaced, so each octave gets the same width on screen. */
export const VISUAL_BANDS = 64
/** The lowest and highest frequencies drawn: below 30 Hz is felt more than heard. */
export const VISUAL_MIN_HZ = 30
export const VISUAL_MAX_HZ = 16_000

/**
 * The dB a band reads as empty, and as full, after the tilt below. AnalyserNode reports each bin
 * in dB of full scale; mastered music sits between these with room above for its peaks.
 */
export const VISUAL_FLOOR_DB = -78
export const VISUAL_CEILING_DB = -18
/**
 * Music's spectrum falls by about 3 dB an octave (pink noise does exactly), so drawn as it is, the
 * treble would always look empty beside the bass. Tilting it up by as much around 1 kHz makes a
 * well-balanced mix read level across the bars.
 */
export const VISUAL_TILT_DB_PER_OCTAVE = 3

/**
 * One frame of what is heard, as the engine sends it about 60 times a second: every look is drawn
 * from these levels. (The raw waveform went with the oscilloscope look, which jumped about with
 * real music, 2026-11-12; MilkDrop will bring its own time-domain data.)
 */
export type VisualFrame = {
  /** VISUAL_BANDS levels, 0 to 1, low to high. */
  bands: number[]
}

/** The looks there are, and the places they can show. */
export const VISUAL_LOOKS = ['bars', 'ring', 'wave'] as const
export type VisualLook = (typeof VISUAL_LOOKS)[number]
/**
 * Where a visualizer can show: `showcase`, the full-screen view; `strip`, a band under SoundCloud's
 * player controls while browsing (§22).
 */
export const VISUAL_PLACES = ['showcase', 'strip'] as const
export type VisualPlace = (typeof VISUAL_PLACES)[number]

/**
 * Which looks each place can draw. The ring follows the sleeve, which only the showcase has; the
 * strip is a band, so it takes the looks drawn in one.
 */
export const LOOKS_FOR: Readonly<Record<VisualPlace, readonly VisualLook[]>> = {
  showcase: ['bars', 'ring', 'wave'],
  strip: ['bars', 'wave']
}

/** What a plugin asked for: a look per place, or null where it shows nothing. */
export type VisualizerConfig = {
  readonly showcase: VisualLook | null
  readonly strip: VisualLook | null
}

export const NO_VISUALIZER: VisualizerConfig = { showcase: null, strip: null }

/**
 * A plugin's `bsc.audio.visualize` argument, shaped: null asks for nothing; an object names a look
 * per place, where 'off', null or nothing means none. Anything else is refused (null), so a
 * mistake is an error in the plugin's log, not a visualizer that silently does not show.
 */
export function readVisualizerConfig(raw: unknown): VisualizerConfig | null {
  if (raw === null) return NO_VISUALIZER
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const given = raw as Record<string, unknown>
  if (Object.keys(given).some((key) => !(VISUAL_PLACES as readonly string[]).includes(key)))
    return null
  const showcase = readLook(given['showcase'], 'showcase')
  const strip = readLook(given['strip'], 'strip')
  if (showcase === undefined || strip === undefined) return null
  return { showcase, strip }
}

/** A look for a place, null for none, undefined for nonsense. */
function readLook(value: unknown, place: VisualPlace): VisualLook | null | undefined {
  if (value === undefined || value === null || value === 'off') return null
  return LOOKS_FOR[place].find((look) => look === value)
}

/** Whether a config draws anything anywhere. */
export function showsAnything(config: VisualizerConfig): boolean {
  return VISUAL_PLACES.some((place) => config[place] !== null)
}

/**
 * The edges of `count` log-spaced bands from `minHz` to `maxHz`: count + 1 frequencies, rising,
 * each band the same fraction of an octave.
 */
export function bandEdges(
  count = VISUAL_BANDS,
  minHz = VISUAL_MIN_HZ,
  maxHz = VISUAL_MAX_HZ
): number[] {
  const ratio = maxHz / minHz
  return Array.from({ length: count + 1 }, (_, i) => minHz * ratio ** (i / count))
}

/**
 * Band levels, 0 to 1, from an AnalyserNode's `getFloatFrequencyData`: `db` holds one value per
 * bin, `sampleRate / fftSize` Hz apart.
 *
 * A band wider than two bins takes its loudest bin, so a kick drum lights its band fully rather
 * than being averaged away. A narrower one — the lowest dozen at 30 Hz, where a band is a few Hz
 * and a bin is about 12 — reads the spectrum at its centre between the two nearest bins, so the
 * bass slopes instead of standing in steps of identical bars.
 */
export function bandLevels(
  db: ArrayLike<number>,
  sampleRate: number,
  edges: readonly number[] = bandEdges()
): number[] {
  const bins = db.length
  const binHz = sampleRate / (2 * bins)
  const at = (index: number): number => {
    const value = db[Math.min(Math.max(index, 0), bins - 1)] ?? -Infinity
    return Number.isFinite(value) ? value : -Infinity
  }
  const levels: number[] = []
  for (let band = 0; band + 1 < edges.length; band++) {
    const low = edges[band] ?? 0
    const high = edges[band + 1] ?? low
    const centre = Math.sqrt(low * high)
    let level: number
    if (high - low < binHz * 2) {
      const position = centre / binHz
      const below = Math.floor(position)
      const fraction = position - below
      const a = at(below)
      const b = at(below + 1)
      level = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * fraction : Math.max(a, b)
    } else {
      level = -Infinity
      const last = Math.min(Math.round(high / binHz), bins - 1)
      for (let bin = Math.round(low / binHz); bin <= last; bin++)
        level = Math.max(level, at(bin))
    }
    const tilted = level + VISUAL_TILT_DB_PER_OCTAVE * Math.log2(centre / 1000)
    levels.push(dbToLevel(tilted))
  }
  return levels
}

/** dB to 0–1 between the floor and the ceiling. Silence (−∞) is 0. */
export function dbToLevel(db: number): number {
  if (!Number.isFinite(db)) return db > 0 ? 1 : 0
  const level = (db - VISUAL_FLOOR_DB) / (VISUAL_CEILING_DB - VISUAL_FLOOR_DB)
  return Math.min(1, Math.max(0, level))
}

/** A frame from the engine's view, checked like any message: the right length, finite, in range. */
export function readVisualFrame(raw: unknown): VisualFrame | null {
  if (typeof raw !== 'object' || raw === null) return null
  const bands = readNumbers((raw as Record<string, unknown>)['bands'], VISUAL_BANDS, 0, 1)
  return bands ? { bands } : null
}

function readNumbers(raw: unknown, length: number, min: number, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== length) return null
  const out: number[] = []
  for (const value of raw as unknown[]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    out.push(Math.min(max, Math.max(min, value)))
  }
  return out
}

/** Digital silence: SoundCloud paused, or between tracks. Nothing to draw, nothing to send. */
export function isSilentFrame(frame: VisualFrame): boolean {
  return frame.bands.every((level) => level === 0)
}

/** A bar rises this fast (ms to cover about two thirds of the way) and falls this slowly. */
export const ATTACK_MS = 40
export const RELEASE_MS = 220

/**
 * A level moving toward `target` over `dtMs`: quickly up, slowly down, exponentially both ways
 * (DESIGN.md's ease-out), so a beat snaps up and decays like a meter rather than flickering.
 */
export function follow(
  current: number,
  target: number,
  dtMs: number,
  attackMs = ATTACK_MS,
  releaseMs = RELEASE_MS
): number {
  const time = target > current ? attackMs : releaseMs
  return target + (current - target) * Math.exp(-Math.max(0, dtMs) / time)
}

/** A peak mark holds this long once the bar falls away from it, then falls at this speed. */
export const PEAK_HOLD_MS = 320
export const PEAK_FALL_PER_SECOND = 0.9

export type Peak = { level: number; heldMs: number }

/** The peak mark over a bar now at `level`: pushed up by it, held a moment, then falling. */
export function nextPeak(peak: Peak, level: number, dtMs: number): Peak {
  if (level >= peak.level) return { level, heldMs: 0 }
  const heldMs = peak.heldMs + Math.max(0, dtMs)
  if (heldMs < PEAK_HOLD_MS) return { level: peak.level, heldMs }
  const fallen = peak.level - (PEAK_FALL_PER_SECOND * Math.max(0, dtMs)) / 1000
  return { level: Math.max(level, fallen), heldMs }
}

/*
 * ── Where a look is drawn ─────────────────────────────────────────────────────────────────────
 *
 * Pure geometry, in CSS pixels, from the rectangles a view measures: so each place's layout is
 * tested here, and the drawing view only measures and draws.
 */

export type Box = { left: number; top: number; right: number; bottom: number }

/** A look drawn in a band (bars or the flowing line), or as a fringe round the sleeve. */
export type VisualLayout =
  { kind: 'band'; area: Box } | { kind: 'ring'; sleeve: Box; gap: number; reach: number }

/**
 * In the showcase: bars and the flowing line in the band under the sleeve and its notes, exactly as
 * wide as them; the ring round the sleeve, as far out as the room on its tightest side allows.
 * Null when there is no room (a tall screen, where the notes sit under the sleeve).
 */
export function showcaseLayout(
  look: VisualLook,
  sleeve: Box,
  notes: Box,
  both: Box,
  width: number,
  height: number
): VisualLayout | null {
  if (look === 'ring') {
    const side = sleeve.right - sleeve.left
    const gap = Math.max(8, Math.round(side * 0.018))
    // Room on each side of the sleeve: to the notes where they sit, else to the screen's edge.
    const right = (notes.left >= sleeve.right ? notes.left : width) - sleeve.right
    const below = (notes.top >= sleeve.bottom ? notes.top : height) - sleeve.bottom
    const room = Math.min(sleeve.left, sleeve.top, right, below) - gap
    const reach = Math.min(side * 0.09, room * 0.72)
    return reach >= 8 ? { kind: 'ring', sleeve, gap, reach } : null
  }
  const pad = Math.min(96, Math.max(24, height * 0.06))
  const top = Math.max(sleeve.bottom, both.bottom) + Math.max(16, height * 0.04)
  const area: Box = {
    left: both.left,
    right: both.right,
    top: Math.max(top, height - pad - height * 0.16),
    bottom: height - pad
  }
  return area.bottom - area.top >= 28 ? { kind: 'band', area } : null
}

/** The strip's side margins: SoundCloud's own padding in its bar, 16 CSS px. */
export const STRIP_INSET = 16

/**
 * In the strip floating above SoundCloud's player: one band across the view, inset at the sides
 * like the controls below it, the bars standing on the bar's top edge.
 */
export function stripLayout(width: number, height: number): VisualLayout | null {
  const area: Box = { left: STRIP_INSET, right: width - STRIP_INSET, top: 0, bottom: height }
  return area.right - area.left >= 64 && area.bottom - area.top >= 8
    ? { kind: 'band', area }
    : null
}

/*
 * ── The strip stepping aside ──────────────────────────────────────────────────────────────────
 *
 * The strip is a view of ours over SoundCloud's page, so what is under it cannot be clicked. The
 * queue and the volume slider open upward from SoundCloud's controls, right where it floats, so it
 * steps aside whenever the pointer comes near it or the bar under it (window pixels throughout).
 * Once aside, it stays aside until the pointer is well clear: the volume slider opens on hover and
 * reaches above the strip, and the strip coming back under a pointer moving down the slider would
 * close it.
 */

/** How far above the strip the pointer sends it aside, in CSS pixels (times the zoom). */
export const STRIP_APPROACH = 12
/** How far above the strip the pointer must go before it comes back: past the volume slider. */
export const STRIP_RETREAT = 160

/**
 * Whether the strip should be aside now, from where the pointer is relative to the window's
 * content (`x`, `y`), the window's size, the strip's top edge and the zoom, and whether it already
 * was. Anywhere outside the window brings it back.
 */
export function stripAside(
  wasAside: boolean,
  pointer: { x: number; y: number },
  window: { width: number; height: number; stripTop: number; zoom: number }
): boolean {
  const inside =
    pointer.x >= 0 && pointer.x < window.width && pointer.y >= 0 && pointer.y < window.height
  if (!inside) return false
  const reach = (wasAside ? STRIP_RETREAT : STRIP_APPROACH) * window.zoom
  return pointer.y >= window.stripTop - reach
}
