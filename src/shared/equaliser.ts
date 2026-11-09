import { AUDIO_LIMITS, chainResponseDb } from './audio'
import type { AudioFilter } from './audio'

/**
 * A graphic equaliser: a gain for each of a few bands, turned into filters for the audio engine
 * (src/shared/audio.ts). Shared by the plugin sandbox, which hands it to plugins as
 * `bsc.audio.graphicEqualiser`, and by the settings panel's curve editor, which draws exactly the
 * filters the plugin will ask for.
 *
 * WHY THE FILTERS ARE NOT SIMPLY THE GAINS. Neighbouring bands overlap: two bands at +6 dB give
 * nearer +8 between them, and a shelf reaches only half its gain at its own frequency. So the
 * filters' gains are corrected, a few rounds, until the summed response passes through every
 * band's gain — the curve the user draws is the sound they get.
 */

/** The low shelf's corner sits this far above the lowest band (the high one as far below the
 *  highest), so each band is near the shelf's full gain instead of half of it. */
const SHELF_RATIO = 1.6
/** Correction rounds, and how much of the remaining error each corrects. */
const ROUNDS = 16
const DAMPING = 0.85

export function graphicEqualiser(
  bands: readonly number[],
  gains: readonly number[]
): AudioFilter[] {
  const count = Math.min(bands.length, gains.length)
  if (count === 0) return []
  const targets = gains.slice(0, count).map((g) => (Number.isFinite(g) ? g : 0))
  if (targets.every((g) => g === 0)) return []

  const shape = bands.slice(0, count).map((frequency, i) => {
    if (count === 1) return { type: 'peaking' as const, frequency, q: 1 }
    if (i === 0) return { type: 'lowshelf' as const, frequency: frequency * SHELF_RATIO, q: 1 }
    if (i === count - 1)
      return { type: 'highshelf' as const, frequency: frequency / SHELF_RATIO, q: 1 }
    return { type: 'peaking' as const, frequency, q: bandQ(bands[i - 1], bands[i + 1]) }
  })

  let filterGains = [...targets]
  const build = (): AudioFilter[] => shape.map((s, i) => ({ ...s, gain: filterGains[i] ?? 0 }))
  for (let round = 0; round < ROUNDS; round++) {
    const filters = build()
    filterGains = filterGains.map((gain, i) => {
      const error = (targets[i] ?? 0) - chainResponseDb(filters, bands[i] ?? 1000)
      return clamp(gain + error * DAMPING, -AUDIO_LIMITS.maxGain, AUDIO_LIMITS.maxGain)
    })
  }
  return build().map((filter) => ({ ...filter, gain: Math.round(filter.gain * 100) / 100 }))
}

/**
 * A peaking band as wide as the space to its neighbours: half the distance to each side, in
 * octaves, as Q. Even spacing gives about 1; the wide gap up to 15 kHz gives a wider 2.4 kHz band.
 */
function bandQ(below: number | undefined, above: number | undefined): number {
  if (!below || !above) return 1
  const octaves = Math.log2(above / below) / 2
  const ratio = 2 ** octaves
  return Math.sqrt(ratio) / (ratio - 1)
}

/*
 * ── Stored values ─────────────────────────────────────────────────────────────────────────
 *
 * A plugin setting is a boolean or a string, so an equaliser's gains are kept as text: one
 * number per band, comma-separated, in half-decibel steps — "6,4,0,0,1.5,3".
 */

/** The gains in `value`, one per band, each a finite half-dB step within ±range. Junk is 0. */
export function parseGains(value: unknown, count: number, range: number): number[] {
  const parts = typeof value === 'string' ? value.split(',') : []
  return Array.from({ length: count }, (_, i) => snapGain(Number(parts[i]), range))
}

export function formatGains(gains: readonly number[]): string {
  return gains.map((g) => String(Object.is(g, -0) ? 0 : g)).join(',')
}

/** Half a decibel is the finest step anyone sets by hand, and keeps stored values short. */
export function snapGain(gain: number, range: number): number {
  if (!Number.isFinite(gain)) return 0
  const snapped = Math.round(clamp(gain, -range, range) * 2) / 2
  return snapped === 0 ? 0 : snapped
}

/** The name of the preset whose gains these are, or null for the user's own curve. */
export function matchingPreset(
  gains: readonly number[],
  presets: readonly { readonly name: string; readonly gains: readonly number[] }[]
): string | null {
  return (
    presets.find(
      (preset) =>
        preset.gains.length === gains.length && preset.gains.every((g, i) => g === gains[i])
    )?.name ?? null
  )
}

/** "60 Hz", "1 kHz", "2.4 kHz": how a band is labelled. */
export function bandLabel(frequency: number): string {
  if (frequency < 1000) return `${Math.round(frequency)} Hz`
  const khz = frequency / 1000
  return `${Number.isInteger(khz) ? khz : Math.round(khz * 10) / 10} kHz`
}

/** "+6 dB", "0 dB", "−4.5 dB", with a real minus sign. */
export function gainLabel(gain: number): string {
  if (gain === 0) return '0 dB'
  return `${gain > 0 ? '+' : '−'}${Math.abs(gain)} dB`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
