import type { AudioConfig, AudioFilter } from '@shared/audio'

/*
 * The audio engine's view (src/main/audio.ts, CLAUDE.md §21). It has no UI and is never shown,
 * so unlike every other view this entry mounts no component: it is the engine.
 *
 * It captures the content view's own audio output — the id main sends comes from
 * `getMediaSourceId`, and `chromeMediaSource: 'tab'` is Chromium's way of asking for it — and
 * plays it through a preamp and the plugins' filters. While this capture runs, Chromium plays
 * the content view only into it; when this view closes or crashes, SoundCloud's own sound comes
 * straight back. Nothing here touches SoundCloud's page.
 *
 *   capture -> preamp (minus the largest boost) -> filters -> output (fades in) -> speakers
 *           -> analyser (the no-sound safety check; main decides what silence means)
 */

/** Parameter changes glide over this long, so a band dragged in settings never clicks. */
const GLIDE_SECONDS = 0.03
/** The engine's sound fades in over this long when it takes over from SoundCloud's. */
const FADE_IN_SECONDS = 0.04
const SILENCE_CHECK_MS = 500

let context: AudioContext | null = null
let preamp: GainNode | null = null
let output: GainNode | null = null
let analyser: AnalyserNode | null = null
let chain: BiquadFilterNode[] = []
let capturing: Promise<boolean> | null = null
let silent = false

window.bsc.onAudioConfig((config) => {
  void apply(config)
})

async function apply(config: AudioConfig): Promise<void> {
  // One capture for this view's whole life; later configs only change the filters.
  capturing ??= capture(config.sourceId)
  if (await capturing) shape(config.filters, config.preampDb)
}

async function capture(sourceId: string): Promise<boolean> {
  let stream: MediaStream
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

  // 'playback': larger buffers, for music without dropouts on a busy computer. The few extra
  // milliseconds of delay make no difference to a song.
  context = new AudioContext({ latencyHint: 'playback' })
  const input = context.createMediaStreamSource(stream)
  preamp = context.createGain()
  output = context.createGain()
  output.gain.value = 0
  analyser = context.createAnalyser()
  analyser.fftSize = 2048
  input.connect(analyser)
  input.connect(preamp)
  preamp.connect(output)
  output.connect(context.destination)
  if (context.state !== 'running') await context.resume()
  output.gain.setTargetAtTime(1, context.currentTime, FADE_IN_SECONDS / 3)

  watchForSilence(analyser)
  report({ kind: 'running' })
  return true
}

/** Set the preamp and the filters: glide to new values, or rebuild when the chain changes shape. */
function shape(filters: readonly AudioFilter[], preampDb: number): void {
  if (!context || !preamp || !output) return
  const now = context.currentTime
  preamp.gain.setTargetAtTime(10 ** (preampDb / 20), now, GLIDE_SECONDS / 3)

  const sameShape =
    chain.length === filters.length && chain.every((node, i) => node.type === filters[i]?.type)
  if (sameShape) {
    chain.forEach((node, i) => {
      const filter = filters[i]
      if (!filter) return
      node.frequency.setTargetAtTime(filter.frequency, now, GLIDE_SECONDS / 3)
      node.gain.setTargetAtTime(filter.gain, now, GLIDE_SECONDS / 3)
      node.Q.setTargetAtTime(filter.q, now, GLIDE_SECONDS / 3)
    })
    return
  }

  preamp.disconnect()
  for (const node of chain) node.disconnect()
  chain = filters.map((filter) => {
    const node = new BiquadFilterNode(context as AudioContext, {
      type: filter.type,
      frequency: filter.frequency,
      gain: filter.gain,
      Q: filter.q
    })
    return node
  })
  let last: AudioNode = preamp
  for (const node of chain) {
    last.connect(node)
    last = node
  }
  last.connect(output)
}

/**
 * Tell main when the capture goes digitally silent (every sample exactly zero) and when sound
 * comes back. Silence alone means nothing — SoundCloud may be paused — so main weighs it against
 * SoundCloud's clock (src/shared/audio.ts, "the no-sound safety check").
 */
function watchForSilence(node: AnalyserNode): void {
  const samples = new Float32Array(node.fftSize)
  const check = (): void => {
    node.getFloatTimeDomainData(samples)
    const now = samples.every((sample) => sample === 0)
    if (now !== silent) {
      silent = now
      report({ kind: 'silence', silent })
    }
    setTimeout(check, SILENCE_CHECK_MS)
  }
  check()
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
