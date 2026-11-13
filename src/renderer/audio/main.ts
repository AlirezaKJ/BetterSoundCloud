// The pitch shifter is Signalsmith Stretch (MIT). Its licence ships with the app, in
// resources/licenses/signalsmith-stretch.txt, since the bundler drops licence comments.
import type { AudioConfig, AudioFilter } from '@shared/audio'
import { bandEdges, bandLevels, isSilentFrame, VISUAL_WAVE } from '@shared/visualizer'
import type { VisualFrame } from '@shared/visualizer'
import stretchUrl from 'signalsmith-stretch?url'

/*
 * The audio engine's view (src/main/audio.ts, CLAUDE.md §21). It has no UI and is never shown,
 * so unlike every other view this entry mounts no component: it is the engine.
 *
 * It captures the content view's own audio output — the id main sends comes from
 * `getMediaSourceId`, and `chromeMediaSource: 'tab'` is Chromium's way of asking for it — and
 * plays it through the pitch shifter, a preamp and the plugins' filters. While this capture runs,
 * Chromium plays the content view only into it; when this view closes or crashes, SoundCloud's own
 * sound comes straight back. Nothing here touches SoundCloud's page.
 *
 *   capture -> pitch shifter (only while a shift is asked) -> preamp -> filters -> output -> speakers
 *           -> analyser (the no-sound safety check; main decides what silence means)  -> tap
 *                                                                         -> left, right
 *
 * The tap, at the very end, is what a visualizer draws (src/shared/visualizer.ts, CLAUDE.md §22):
 * the sound as it is heard, after the shift and the filters, so the bars are in step with it. Only
 * while one is on screen does this view read it and send it, about 60 times a second; and only
 * while that one is MilkDrop, which analyses the sound itself, the two channels as well.
 *
 * The shift comes before the filters so an equaliser shapes the sound as it is heard: a bass boost
 * stays on the bass after the key moves.
 *
 * ONE GRAPH PER SHAPE. Everything after the capture lives in one AudioContext. Adding or removing
 * the shifter builds a fresh one and crossfades to it, because closing its context is the only way
 * to be rid of a shifter: its worklet keeps working even with nothing connected to it.
 */

/** Signalsmith Stretch's node, as far as this file uses it (the package ships no types). */
type StretchNode = AudioWorkletNode & {
  configure(options: { blockMs: number }): Promise<void>
  schedule(change: { active?: boolean; semitones?: number }): Promise<void>
}
type Stretch = ((context: BaseAudioContext) => Promise<StretchNode>) & { moduleUrl?: string }

type Graph = {
  context: AudioContext
  analyser: AnalyserNode
  /** Null while no shift is asked. */
  shifter: StretchNode | null
  semitones: number
  preamp: GainNode
  filters: BiquadFilterNode[]
  output: GainNode
  /** What a visualizer draws: the output, after everything. */
  tap: AnalyserNode
  /** Each channel of the output, for MilkDrop, at the size it reads (VISUAL_WAVE samples). */
  left: AnalyserNode
  right: AnalyserNode
}

/** Parameter changes glide over this long, so a band dragged in settings never clicks. */
const GLIDE_SECONDS = 0.03
/** The engine's sound fades in over this long when it takes over, and a replaced graph out. */
const FADE_SECONDS = 0.04
const SILENCE_CHECK_MS = 500
/**
 * The shifter's block, which is also its delay. Measured 2026-11-10 against tones and a sawtooth:
 * 80 ms shifts as accurately as the library's 120 ms default, at a third less delay.
 */
const SHIFTER_BLOCK_MS = 80
/** A shifter whose WebAssembly is refused never says it is ready; give up on it after this. */
const SHIFTER_START_MS = 5_000
/**
 * How often a visualizer's frame is taken. A timer, because this view is never shown and so never
 * gets animation frames (measured 2026-11-11: none at all, while a 16 ms timer ran about 56 times
 * a second with background throttling off). The view drawing it animates between frames itself.
 */
const VISUAL_FRAME_MS = 1000 / 60
/**
 * The tap's FFT: 4096 points, about 12 Hz a bin at 48 kHz, so the bass still has bins of its own;
 * no smoothing here, since the drawing view eases every bar itself.
 */
const TAP_FFT = 4096

let stream: MediaStream | null = null
let capturing: Promise<boolean> | null = null
let graph: Graph | null = null
/** The newest config not yet applied. Configs are applied one at a time, newest first. */
let latest: AudioConfig | null = null
let working = false
let running = false
/** What the last check heard; null until the first, which always reports (shared/audio.ts). */
let silent: boolean | null = null
let stretch: Promise<Stretch> | null = null
let visualTimer: ReturnType<typeof setTimeout> | null = null
/** Whether the visualizer on screen is MilkDrop, so frames carry the channels too. */
let waveWanted = false
let lastFrameSilent = false
const edges = bandEdges()
// Read into the same array every frame, rather than making garbage sixty times a second.
const spectrum = new Float32Array(TAP_FFT / 2)
const leftWave = new Uint8Array(VISUAL_WAVE)
const rightWave = new Uint8Array(VISUAL_WAVE)

window.bsc.onAudioConfig((config) => {
  latest = config
  void work()
})

/**
 * Apply configs one at a time, skipping any a newer one replaced: dragging an equaliser band
 * sends a dozen a second, and building a shifter takes a moment.
 */
async function work(): Promise<void> {
  if (working) return
  working = true
  try {
    while (latest) {
      const config = latest
      latest = null
      await apply(config)
    }
  } finally {
    working = false
  }
}

async function apply(config: AudioConfig): Promise<void> {
  // One capture for this view's whole life; later configs only change what is done to it.
  capturing ??= capture(config.sourceId)
  if (!(await capturing) || !stream) return

  const wantsShifter = config.pitch !== 0
  if (graph && (graph.shifter !== null) === wantsShifter) {
    shape(graph, config)
  } else {
    const next = await build(stream, config)
    if (!next) return
    crossfade(graph, next)
    graph = next
  }
  if (!running) {
    running = true
    watchForSilence()
    report({ kind: 'running' })
  }
  waveWanted = config.visual && config.visualWave
  setVisual(config.visual)
}

async function capture(sourceId: string): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Chromium's own constraint for another view's audio. The standard types do not describe
      // it, so it goes through `unknown`.
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: sourceId }
      } as unknown as MediaTrackConstraints,
      video: false
    })
  } catch (error) {
    report({ kind: 'failed', message: describe(error) })
    return false
  }
  const track = stream.getAudioTracks()[0]
  if (!track) {
    report({ kind: 'failed', message: 'no audio track' })
    return false
  }
  track.addEventListener('ended', () => {
    report({ kind: 'ended' })
  })
  return true
}

/** A graph for this config, silent until `crossfade` brings it in. Null if its shifter failed. */
async function build(source: MediaStream, config: AudioConfig): Promise<Graph | null> {
  // 'playback': larger buffers, for music without dropouts on a busy computer. The few extra
  // milliseconds of delay make no difference to a song.
  const context = new AudioContext({ latencyHint: 'playback' })
  const input = context.createMediaStreamSource(source)
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  input.connect(analyser)

  let shifter: StretchNode | null = null
  if (config.pitch !== 0) {
    try {
      shifter = await createShifter(context, config.pitch)
    } catch (error) {
      void context.close()
      report({ kind: 'pitch-failed', message: describe(error) })
      return null
    }
  }

  const preamp = new GainNode(context, { gain: dbToGain(config.preampDb) })
  const output = new GainNode(context, { gain: 0 })
  if (shifter) input.connect(shifter).connect(preamp)
  else input.connect(preamp)
  output.connect(context.destination)
  const tap = new AnalyserNode(context, { fftSize: TAP_FFT, smoothingTimeConstant: 0 })
  output.connect(tap)
  // MilkDrop analyses each channel itself, as an analyser of its own would give it the samples.
  const channels = new ChannelSplitterNode(context, { numberOfOutputs: 2 })
  const left = new AnalyserNode(context, { fftSize: VISUAL_WAVE, smoothingTimeConstant: 0 })
  const right = new AnalyserNode(context, { fftSize: VISUAL_WAVE, smoothingTimeConstant: 0 })
  output.connect(channels)
  channels.connect(left, 0)
  channels.connect(right, 1)

  const next: Graph = {
    context,
    analyser,
    shifter,
    semitones: config.pitch,
    preamp,
    filters: [],
    output,
    tap,
    left,
    right
  }
  wireFilters(next, config.filters)
  if (context.state !== 'running') await context.resume()
  return next
}

/**
 * Signalsmith Stretch, from our own files: the CSP lets scripts come from 'self' only, and lets
 * WebAssembly compile only because this view's CSP adds 'wasm-unsafe-eval' (measured: without it
 * the shifter's WebAssembly is refused, in the page and in its worklet alike).
 */
async function createShifter(context: AudioContext, semitones: number): Promise<StretchNode> {
  stretch ??= import(/* @vite-ignore */ stretchUrl).then(
    (module: { default: Stretch }) => module.default
  )
  const create = await stretch
  // Left to itself the library loads its worklet from a blob: URL, which this view's CSP refuses.
  create.moduleUrl = stretchUrl
  const node = await withTimeout(create(context), SHIFTER_START_MS, 'timed out')
  await node.configure({ blockMs: SHIFTER_BLOCK_MS })
  await node.schedule({ active: true, semitones })
  return node
}

/** Follow a new config in place: glide to new values, or rewire when the filters change shape. */
function shape(on: Graph, config: AudioConfig): void {
  const now = on.context.currentTime
  on.preamp.gain.setTargetAtTime(dbToGain(config.preampDb), now, GLIDE_SECONDS / 3)

  if (on.shifter && on.semitones !== config.pitch) {
    on.semitones = config.pitch
    void on.shifter.schedule({ semitones: config.pitch })
  }

  const filters = config.filters
  const sameShape =
    on.filters.length === filters.length &&
    on.filters.every((node, i) => node.type === filters[i]?.type)
  if (!sameShape) {
    wireFilters(on, filters)
    return
  }
  on.filters.forEach((node, i) => {
    const filter = filters[i]
    if (!filter) return
    node.frequency.setTargetAtTime(filter.frequency, now, GLIDE_SECONDS / 3)
    node.gain.setTargetAtTime(filter.gain, now, GLIDE_SECONDS / 3)
    node.Q.setTargetAtTime(filter.q, now, GLIDE_SECONDS / 3)
  })
}

/** preamp -> one BiquadFilterNode per filter -> output. */
function wireFilters(on: Graph, filters: readonly AudioFilter[]): void {
  on.preamp.disconnect()
  for (const node of on.filters) node.disconnect()
  on.filters = filters.map(
    (filter) =>
      new BiquadFilterNode(on.context, {
        type: filter.type,
        frequency: filter.frequency,
        gain: filter.gain,
        Q: filter.q
      })
  )
  let last: AudioNode = on.preamp
  for (const node of on.filters) last = last.connect(node)
  last.connect(on.output)
}

/** Bring `next` in and take `old` out, then close the old context and anything in it. */
function crossfade(old: Graph | null, next: Graph): void {
  next.output.gain.setTargetAtTime(1, next.context.currentTime, FADE_SECONDS / 3)
  if (!old) return
  old.output.gain.setTargetAtTime(0, old.context.currentTime, FADE_SECONDS / 3)
  setTimeout(() => {
    void old.context.close()
  }, FADE_SECONDS * 4000)
}

/**
 * Tell main when the capture goes digitally silent (every sample exactly zero) and when sound
 * comes back. Silence alone means nothing — SoundCloud may be paused — so main weighs it against
 * SoundCloud's clock (src/shared/audio.ts, "the no-sound safety check").
 */
function watchForSilence(): void {
  const samples = new Float32Array(2048)
  const check = (): void => {
    const analyser = graph?.analyser
    if (analyser) {
      analyser.getFloatTimeDomainData(samples)
      const now = samples.every((sample) => sample === 0)
      if (now !== silent) {
        silent = now
        report({ kind: 'silence', silent })
      }
    }
    setTimeout(check, SILENCE_CHECK_MS)
  }
  check()
}

/** Start or stop sending a visualizer what this view plays. */
function setVisual(on: boolean): void {
  if (on && !visualTimer) {
    lastFrameSilent = false
    sendVisualFrame()
  } else if (!on && visualTimer) {
    clearTimeout(visualTimer)
    visualTimer = null
  }
}

/**
 * One frame for the visualizer: the tap's bands, and for MilkDrop the channels. Silence is sent
 * once and then not again until there is sound, so a paused track costs nothing; the drawing view
 * lets its bars fall.
 */
function sendVisualFrame(): void {
  visualTimer = setTimeout(sendVisualFrame, VISUAL_FRAME_MS)
  const tap = graph?.tap
  if (!tap || !graph) return
  tap.getFloatFrequencyData(spectrum)
  let wave: VisualFrame['wave'] = null
  if (waveWanted) {
    graph.left.getByteTimeDomainData(leftWave)
    graph.right.getByteTimeDomainData(rightWave)
    // Sending copies them, so the same two arrays serve every frame.
    wave = { left: leftWave, right: rightWave }
  }
  const frame: VisualFrame = {
    bands: bandLevels(spectrum, graph.context.sampleRate, edges),
    wave
  }
  const silent = isSilentFrame(frame)
  if (silent && lastFrameSilent) return
  lastFrameSilent = silent
  window.bsc.reportVisualFrame(frame)
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

function report(message: Parameters<typeof window.bsc.reportAudio>[0]): void {
  window.bsc.reportAudio(message)
}

/** An error's name ("NotAllowedError") says more than its message here, and is short. */
function describe(error: unknown): string {
  if (error instanceof Error)
    return error.name && error.name !== 'Error' ? error.name : error.message
  return String(error)
}
