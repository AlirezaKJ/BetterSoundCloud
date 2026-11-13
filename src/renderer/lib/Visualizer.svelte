<script lang="ts">
  import { onMount } from 'svelte'
  import { VISUAL_BANDS, drawDue, follow, nextPeak } from '@shared/visualizer'
  import type { Peak, VisualFrame, VisualLayout, VisualLook } from '@shared/visualizer'
  import { drawBars, drawFlow, drawHairlines, drawRing, STRONG } from './visualizer-draw'

  /*
   * The Visualizer, drawn (CLAUDE.md §22): what SoundCloud plays, from the frames the audio engine
   * sends about 60 times a second while this is on screen. A canvas behind everything, decorative
   * and hidden from assistive technology.
   *
   * Frames arrive at the engine's pace; this draws at the screen's, up to about 60 a second
   * (`drawDue`: a 240 Hz screen would otherwise draw four times as often for nothing), easing every
   * bar toward its frame (quick up, slow down) so motion stays smooth whatever the timing. When the sound stops
   * — a pause, the end of a track, the engine stepping aside — the bars fall away and the loop
   * stops, so a silent visualizer costs nothing. Reduced motion draws nothing at all: a visualizer
   * is only motion, so it is removed rather than frozen (DESIGN.md).
   *
   * Where it draws is the place's to say: `layout` is asked on every frame (so it follows a resize
   * with no listener) and answers with the pure geometry in shared/visualizer.ts, or null where
   * there is no room. The showcase measures its sleeve and notes; the strip is its whole view.
   */

  type Props = {
    look: VisualLook
    /** The ink to draw with: the showcase's for the room's colour, or the bar's icon colour. */
    ink: string
    layout: () => VisualLayout | null
    /**
     * Drawn in the strip over SoundCloud's player: bars as hairlines without peak marks, and the
     * waveform rising from the bar's edge rather than mirrored about a middle line.
     */
    strip?: boolean
    /**
     * The look is the subject of its place, not decoration under text (the view of its own):
     * drawn at twice the strength.
     */
    strong?: boolean
  }
  let { look, ink, layout, strip = false, strong = false }: Props = $props()

  /** No frame for this long means no sound: let everything fall. */
  const SILENT_AFTER_MS = 150
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let canvas = $state<HTMLCanvasElement | null>(null)

  const levels = new Float32Array(VISUAL_BANDS)
  const peaks: Peak[] = Array.from({ length: VISUAL_BANDS }, () => ({ level: 0, heldMs: 0 }))
  let target: VisualFrame | null = null
  let lastFrameAt = 0
  let lastTick = 0
  let raf = 0

  onMount(() => {
    if (REDUCED_MOTION) return
    const stop = window.bsc.onVisualFrame((next) => {
      target = next
      lastFrameAt = performance.now()
      start()
    })
    return () => {
      stop()
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
  })

  function start(): void {
    if (raf) return
    lastTick = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function tick(now: number): void {
    raf = 0
    if (!drawDue(now, lastTick)) {
      raf = requestAnimationFrame(tick)
      return
    }
    const dt = Math.min(100, Math.max(0, now - lastTick))
    lastTick = now
    const current = now - lastFrameAt > SILENT_AFTER_MS ? null : target

    let moving = false
    for (let i = 0; i < VISUAL_BANDS; i++) {
      const level = follow(levels[i] ?? 0, current?.bands[i] ?? 0, dt)
      levels[i] = level < 0.001 ? 0 : level
      const peak = nextPeak(peaks[i] ?? { level: 0, heldMs: 0 }, levels[i] ?? 0, dt)
      peaks[i] = peak
      if ((levels[i] ?? 0) > 0 || peak.level > 0.001) moving = true
    }

    draw()
    if (moving || current) raf = requestAnimationFrame(tick)
  }

  function draw(): void {
    const context = sized()
    if (!context) return
    context.clearRect(0, 0, window.innerWidth, window.innerHeight)
    const place = layout()
    if (!place) return
    if (place.kind === 'ring')
      drawRing(context, place.sleeve, place.gap, place.reach, levels, ink)
    else if (look === 'bars' && strip) drawHairlines(context, place.area, levels, ink)
    else if (look === 'bars')
      drawBars(context, place.area, levels, peakLevels(), ink, strong ? STRONG : 1)
    else drawFlow(context, place.area, levels, ink, strip, strong ? STRONG : 1)
  }

  function peakLevels(): number[] {
    return peaks.map((peak) => peak.level)
  }

  /** The canvas at the screen's resolution, in CSS pixels. */
  function sized(): CanvasRenderingContext2D | null {
    if (!canvas) return null
    const scale = window.devicePixelRatio || 1
    const width = Math.round(window.innerWidth * scale)
    const height = Math.round(window.innerHeight * scale)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const context = canvas.getContext('2d')
    context?.setTransform(scale, 0, 0, scale, 0, 0)
    return context
  }
</script>

{#if !REDUCED_MOTION}
  <canvas bind:this={canvas} aria-hidden="true" data-bsc-visualizer data-look={look}></canvas>
{/if}

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
