/**
 * Shaping SoundCloud's sound (CLAUDE.md §21): what a filter is, what it does to each frequency,
 * and what the audio engine says about itself. Pure, so the plugin sandbox, main, the audio view
 * and the settings panel all compute the same thing, and tested.
 *
 * The engine never touches SoundCloud's page. A hidden view of ours captures the content view's
 * own audio output, shifts its pitch if a plugin asks, runs it through these filters and plays
 * the result; while the capture runs, Chromium plays the content view only into it
 * (src/main/audio.ts).
 */

export type AudioFilterType = 'lowshelf' | 'peaking' | 'highshelf'

/**
 * One filter, as a plugin describes it: a Web Audio BiquadFilterNode of that type. Gain in dB,
 * frequency in Hz. `q` shapes a peaking filter; Web Audio's shelves do not use it.
 */
export type AudioFilter = {
  readonly type: AudioFilterType
  readonly frequency: number
  readonly gain: number
  readonly q: number
}

export const AUDIO_LIMITS = {
  minFrequency: 20,
  maxFrequency: 20_000,
  /** No single filter boosts or cuts by more. The preamp keeps any boost from clipping. */
  maxGain: 24,
  minQ: 0.1,
  maxQ: 18,
  /** From one plugin. */
  maxFilters: 16,
  /** From every plugin together. */
  maxChain: 32,
  /** Semitones up or down: an octave. From one plugin, and from every plugin added together. */
  maxPitch: 12
} as const

const TYPES: readonly AudioFilterType[] = ['lowshelf', 'peaking', 'highshelf']

/**
 * A plugin's filters, from `bsc.audio.set`, made safe: a list of at most 16 filters of a known
 * type, every number finite and clamped to the limits. Null when it is not that — the whole call
 * is refused rather than half applied.
 */
export function readAudioFilters(raw: unknown): AudioFilter[] | null {
  if (!Array.isArray(raw) || raw.length > AUDIO_LIMITS.maxFilters) return null
  const filters: AudioFilter[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const { type, frequency, gain, q } = entry as Record<string, unknown>
    if (!TYPES.some((t) => t === type)) return null
    if (!isNumber(frequency) || !isNumber(gain) || (q !== undefined && !isNumber(q)))
      return null
    filters.push({
      type: type as AudioFilterType,
      frequency: clamp(frequency, AUDIO_LIMITS.minFrequency, AUDIO_LIMITS.maxFrequency),
      gain: clamp(gain, -AUDIO_LIMITS.maxGain, AUDIO_LIMITS.maxGain),
      q: q === undefined ? 1 : clamp(q, AUDIO_LIMITS.minQ, AUDIO_LIMITS.maxQ)
    })
  }
  return filters
}

/**
 * A plugin's pitch shift, from `bsc.audio.setPitch`: semitones, finite, within an octave either
 * way, to the cent. Null when it is not a number at all.
 */
export function readAudioPitch(raw: unknown): number | null {
  if (!isNumber(raw)) return null
  return roundCents(clamp(raw, -AUDIO_LIMITS.maxPitch, AUDIO_LIMITS.maxPitch))
}

/** Every plugin's shifts add up, within an octave either way. 0 is no shift at all. */
export function combinePitch(shifts: Iterable<number>): number {
  let total = 0
  for (const shift of shifts) total += shift
  return roundCents(clamp(total, -AUDIO_LIMITS.maxPitch, AUDIO_LIMITS.maxPitch))
}

/** A hundredth of a semitone (a cent) is finer than anyone hears; it also turns -0 into 0. */
function roundCents(semitones: number): number {
  return Math.round(semitones * 100) / 100 || 0
}

/** Below this a filter changes nothing anyone can hear, so it is as good as absent. */
const INAUDIBLE_DB = 0.05

/** No filter changes anything: the engine has nothing to do and does not run. */
export function isFlat(filters: readonly AudioFilter[]): boolean {
  return filters.every((filter) => Math.abs(filter.gain) < INAUDIBLE_DB)
}

/*
 * ── What a filter does to each frequency ──────────────────────────────────────────────────
 *
 * The coefficients are the Web Audio specification's own (the Audio EQ Cookbook, with the
 * shelves' slope fixed at 1), so the curve the settings panel draws is the sound the engine
 * makes, not an artist's impression of it.
 */

/** The rate the response is computed at. Devices run at 44.1 or 48 kHz; below 20 kHz the
 *  difference does not show at the panel's size. */
export const RESPONSE_SAMPLE_RATE = 48_000

/** How much `filter` raises (positive) or lowers a sine at `frequency`, in dB. */
export function filterResponseDb(
  filter: AudioFilter,
  frequency: number,
  sampleRate = RESPONSE_SAMPLE_RATE
): number {
  const { b0, b1, b2, a0, a1, a2 } = coefficients(filter, sampleRate)
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos1 = Math.cos(w)
  const cos2 = Math.cos(2 * w)
  const sin1 = Math.sin(w)
  const sin2 = Math.sin(2 * w)
  const numerator = Math.hypot(b0 + b1 * cos1 + b2 * cos2, b1 * sin1 + b2 * sin2)
  const denominator = Math.hypot(a0 + a1 * cos1 + a2 * cos2, a1 * sin1 + a2 * sin2)
  return 20 * Math.log10(numerator / denominator)
}

/** Every filter in turn: their responses in dB simply add. */
export function chainResponseDb(
  filters: readonly AudioFilter[],
  frequency: number,
  sampleRate = RESPONSE_SAMPLE_RATE
): number {
  let total = 0
  for (const filter of filters) total += filterResponseDb(filter, frequency, sampleRate)
  return total
}

/**
 * How far the engine turns everything down before the filters, in dB (0 or more): the chain's
 * largest boost anywhere in the audible range. A boosted band then peaks where the original did
 * instead of past full scale, so loud passages never distort — and no plugin can make SoundCloud
 * louder than SoundCloud plays it.
 */
export function headroomDb(filters: readonly AudioFilter[]): number {
  if (isFlat(filters)) return 0
  let peak = 0
  const points = 240
  const low = Math.log(AUDIO_LIMITS.minFrequency)
  const high = Math.log(AUDIO_LIMITS.maxFrequency)
  for (let i = 0; i <= points; i++) {
    const frequency = Math.exp(low + ((high - low) * i) / points)
    peak = Math.max(peak, chainResponseDb(filters, frequency))
  }
  return Math.ceil(peak * 10) / 10
}

function coefficients(
  filter: AudioFilter,
  sampleRate: number
): { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number } {
  const A = 10 ** (filter.gain / 40)
  const w0 = (2 * Math.PI * Math.min(filter.frequency, sampleRate / 2 - 1)) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)

  if (filter.type === 'peaking') {
    const alpha = sin / (2 * filter.q)
    return {
      b0: 1 + alpha * A,
      b1: -2 * cos,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cos,
      a2: 1 - alpha / A
    }
  }

  // Shelves, with Web Audio's slope of 1: alpha = sin(w0) / 2 * sqrt(2).
  const alpha = sin / Math.SQRT2
  const root = 2 * Math.sqrt(A) * alpha
  if (filter.type === 'lowshelf') {
    return {
      b0: A * (A + 1 - (A - 1) * cos + root),
      b1: 2 * A * (A - 1 - (A + 1) * cos),
      b2: A * (A + 1 - (A - 1) * cos - root),
      a0: A + 1 + (A - 1) * cos + root,
      a1: -2 * (A - 1 + (A + 1) * cos),
      a2: A + 1 + (A - 1) * cos - root
    }
  }
  return {
    b0: A * (A + 1 + (A - 1) * cos + root),
    b1: -2 * A * (A - 1 + (A + 1) * cos),
    b2: A * (A + 1 + (A - 1) * cos - root),
    a0: A + 1 - (A - 1) * cos + root,
    a1: 2 * (A - 1 - (A + 1) * cos),
    a2: A + 1 - (A - 1) * cos - root
  }
}

/*
 * ── Between main and the audio view ───────────────────────────────────────────────────────
 */

/** What main tells the audio view: what to capture, and what to do to it. */
export type AudioConfig = {
  /** From `getMediaSourceId`: good for one capture, within ten seconds. */
  readonly sourceId: string
  /**
   * Semitones to shift everything by, before the filters, so an equaliser shapes the sound as it
   * is heard: a bass boost stays on the bass after the key moves. 0 for none.
   */
  readonly pitch: number
  readonly filters: readonly AudioFilter[]
  /** dB, 0 or below. */
  readonly preampDb: number
  /**
   * Whether a visualizer is on screen: the view then reads what it plays, at the end of its chain,
   * and sends it about 60 times a second (src/shared/visualizer.ts). False costs nothing.
   */
  readonly visual: boolean
  /**
   * Whether that visualizer is MilkDrop, which reads the sound itself: each frame then carries the
   * left and right channels too (`VisualFrame.wave`). Only with `visual`.
   */
  readonly visualWave: boolean
}

/** What the audio view tells main. Its renderer is ours, but it is checked like any message. */
export type AudioReport =
  /** The capture is running and its sound is playing, through the pitch shifter if asked. */
  | { kind: 'running' }
  /** The capture could not start. */
  | { kind: 'failed'; message: string }
  /** The pitch shifter could not start (its WebAssembly refused, for one). */
  | { kind: 'pitch-failed'; message: string }
  /** The capture stopped by itself — the content view's renderer went away, for one. */
  | { kind: 'ended' }
  /** The capture went digitally silent (exact zeros), or stopped being. */
  | { kind: 'silence'; silent: boolean }

export function readAudioReport(raw: unknown): AudioReport | null {
  if (typeof raw !== 'object' || raw === null) return null
  const report = raw as Record<string, unknown>
  switch (report['kind']) {
    case 'running':
      return { kind: 'running' }
    case 'ended':
      return { kind: 'ended' }
    case 'failed':
    case 'pitch-failed':
      return {
        kind: report['kind'],
        message:
          typeof report['message'] === 'string' && report['message'].trim()
            ? report['message'].trim().slice(0, 120)
            : 'unknown error'
      }
    case 'silence':
      return typeof report['silent'] === 'boolean'
        ? { kind: 'silence', silent: report['silent'] }
        : null
    default:
      return null
  }
}

/*
 * ── What the engine says about itself ─────────────────────────────────────────────────────
 */

export type AudioStopReason =
  'safe-mode' | 'capture-failed' | 'pitch-failed' | 'no-sound' | 'crashed'

/** The engine's state, as plugins with the `audio` permission are told it. */
export type AudioEngineState =
  /** Nothing to do: no plugin asked for a change, or every change is flat. */
  | { readonly state: 'off' }
  | { readonly state: 'starting' }
  | { readonly state: 'running' }
  /** It cannot run, or stepped aside. SoundCloud plays as it would without it. */
  | { readonly state: 'stopped'; readonly reason: AudioStopReason; readonly detail: string }

/** One sentence for a stopped engine, written for the plugin's status line. */
export function describeAudioStop(reason: AudioStopReason, detail = ''): string {
  const tryAgain = 'Turn this plugin off and on to try again.'
  switch (reason) {
    case 'safe-mode':
      return 'Off while BetterSoundCloud runs in safe mode. SoundCloud plays as normal.'
    case 'capture-failed':
      return `Couldn’t take SoundCloud’s sound${detail ? ` (${detail})` : ''}, so SoundCloud plays as normal. ${tryAgain}`
    case 'pitch-failed':
      // Every plugin with the permission reads this, so it names Pitch rather than "this plugin":
      // turning Pitch off is also what lets the Equaliser work again (main/audio.ts, reconcile).
      return `The pitch shifter couldn’t start${detail ? ` (${detail})` : ''}, so SoundCloud plays as normal. Turn Pitch off and on to try again.`
    case 'no-sound':
      return `No sound reached it from SoundCloud, so it stepped aside and SoundCloud plays as normal. ${tryAgain}`
    case 'crashed':
      return `It stopped unexpectedly twice, so it stepped aside and SoundCloud plays as normal. ${tryAgain}`
  }
}

/*
 * ── The no-sound safety check ─────────────────────────────────────────────────────────────
 *
 * If SoundCloud ever plays a way the capture cannot see (Windows' hardware DRM path bypasses the
 * part of Chromium capture copies from), the engine would play silence while SoundCloud's clock
 * runs. So the audio view reports exact digital silence, and main counts the seconds SoundCloud's
 * clock moves forward during it — only forward, in steps a playing track makes, on one track, so
 * a pause, a seek or a new track never counts. Past the limit, the engine steps aside.
 *
 * Only before the capture has heard anything of the track. Audio that bypasses the capture does
 * so from a track's first second; a track that has been heard is reaching it, so a silent ending
 * or a quiet stretch later on is the music. Counting those stepped the engine aside at the end of
 * a song (2026-11-12), and with the Visualizer's strip the engine runs all session, so one false
 * alarm ended the visualizer until the plugin was turned off and on.
 *
 * The audio view's first check always reports, sound or silence, so `known` says whether a reading
 * of "not silent" is the capture's word or just the starting value.
 */

/** Seconds of SoundCloud playing while the capture heard nothing, before the engine steps aside. */
export const SILENCE_LIMIT_SECONDS = 6

export type Starvation = {
  /** The capture has said whether it hears anything, at least once. */
  readonly known: boolean
  readonly silent: boolean
  /** The capture has heard this track. */
  readonly heard: boolean
  readonly track: string
  readonly elapsed: number
  readonly seconds: number
}

export const NOT_STARVED: Starvation = {
  known: false,
  silent: false,
  heard: false,
  track: '',
  elapsed: 0,
  seconds: 0
}

/** The capture went silent, or heard something (which forgets every counted second). */
export function noteCaptureSilence(state: Starvation, silent: boolean): Starvation {
  return { ...state, known: true, silent, seconds: silent ? state.seconds : 0 }
}

/** A clock reading from now-playing. */
export function noteCaptureClock(
  state: Starvation,
  reading: {
    readonly track: string
    readonly elapsed: number
    readonly playing: boolean
  } | null
): Starvation {
  if (!reading) return { ...state, track: '', heard: false, seconds: 0 }
  const sameTrack = reading.track === state.track
  const step = reading.elapsed - state.elapsed
  const playedOn = sameTrack && reading.playing && step > 0 && step <= 2
  // A second of the track went by while the capture said it hears something: it is reaching us.
  const heard = sameTrack && (state.heard || (playedOn && state.known && !state.silent))
  const counts = playedOn && state.silent && !heard
  return {
    known: state.known,
    silent: state.silent,
    heard,
    track: reading.track,
    elapsed: reading.elapsed,
    seconds: !sameTrack ? 0 : counts ? state.seconds + step : state.seconds
  }
}

export function isStarved(state: Starvation): boolean {
  return state.seconds >= SILENCE_LIMIT_SECONDS
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
