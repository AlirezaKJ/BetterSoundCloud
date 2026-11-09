/**
 * A `pitch` plugin setting: how many semitones to move everything SoundCloud plays, up or down,
 * without changing its speed (the audio engine's pitch stage, src/shared/audio.ts). Shared by
 * the settings panel, which draws it as a ruler (PitchEditor.svelte), and the plugin tests.
 *
 * A plugin setting is a boolean or a string, so the value is kept as text: whole semitones,
 * "0", "2", "-3". Whole steps are what a listener moves a key by; twelve make an octave.
 */

export const OCTAVE = 12

/** The semitones in `value`: a whole number within ±range. Anything else is 0. */
export function parseSemitones(value: unknown, range: number): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number)) return 0
  return Math.round(Math.min(range, Math.max(-range, number))) || 0
}

export function formatSemitones(semitones: number): string {
  return String(Math.round(semitones) || 0)
}

/** "+2", "0", "−3", with a real minus sign: the tag over the ruler's marker. */
export function semitoneLabel(semitones: number): string {
  if (semitones === 0) return '0'
  return `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)}`
}

/**
 * The shift in words, for the readout above the ruler and for screen readers: "Original key",
 * "Up 2 semitones", "Down 1 semitone", "Up an octave".
 */
export function semitoneWords(semitones: number): string {
  if (semitones === 0) return 'Original key'
  const way = semitones > 0 ? 'Up' : 'Down'
  const steps = Math.abs(semitones)
  if (steps === OCTAVE) return `${way} an octave`
  return `${way} ${steps} ${steps === 1 ? 'semitone' : 'semitones'}`
}
