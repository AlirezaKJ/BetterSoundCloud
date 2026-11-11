<script lang="ts">
  import { onMount } from 'svelte'
  import { VISUAL_BANDS, follow, nextPeak } from '@shared/visualizer'
  import type { Peak, VisualFrame, VisualLook } from '@shared/visualizer'
  import { drawBars, drawFlow, drawRing } from './visualizer-draw'
  import type { Box } from './visualizer-draw'

  /*
   * The Visualizer, drawn (CLAUDE.md §22): what SoundCloud plays, from the frames the audio engine
   * sends about 60 times a second while this is on screen. A canvas behind everything, decorative
   * and hidden from assistive technology.
   *
   * Frames arrive at the engine's pace; this draws at the screen's, easing every bar toward its
   * frame (quick up, slow down) so motion stays smooth whatever the timing. When the sound stops
   * — a pause, the end of a track, the engine stepping aside — the bars fall away and the loop
   * stops, so a silent visualizer costs nothing. Reduced motion draws nothing at all: a visualizer
   * is only motion, so it is removed rather than frozen (DESIGN.md).
   *
   * It places itself by measuring the showcase's own parts: `art` is the sleeve, `notes` the text
   * beside or below it, `frame` the two together.
   */

  type Props = {
    look: VisualLook
    /** The ink to draw with: the showcase's, computed for the room's colour. */
    ink: string
    art: HTMLElement | null
    notes: HTMLElement | null
    frame: HTMLElement | null
  }
  let { look, ink, art, notes, frame }: Props = $props()

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
    const { innerWidth: width, innerHeight: height } = window
    context.clearRect(0, 0, width, height)
    const sleeve = rectOf(art)
    const words = rectOf(notes)
    const both = rectOf(frame)
    if (!sleeve || !words || !both) return

    if (look === 'ring') {
      const side = sleeve.right - sleeve.left
      const gap = Math.max(8, Math.round(side * 0.018))
      // Room on each side of the sleeve: to the notes where they sit, else to the screen's edge.
      const right = (words.left >= sleeve.right ? words.left : width) - sleeve.right
      const below = (words.top >= sleeve.bottom ? words.top : height) - sleeve.bottom
      const room = Math.min(sleeve.left, sleeve.top, right, below) - gap
      const reach = Math.min(side * 0.09, room * 0.72)
      if (reach >= 8) drawRing(context, sleeve, gap, reach, levels, ink)
      return
    }

    // Bars and the flowing line share the band under the sleeve and its notes, across their width.
    const pad = Math.min(96, Math.max(24, height * 0.06))
    const top = Math.max(sleeve.bottom, both.bottom) + Math.max(16, height * 0.04)
    const area: Box = {
      left: both.left,
      right: both.right,
      top: Math.max(top, height - pad - height * 0.16),
      bottom: height - pad
    }
    if (area.bottom - area.top < 28) return
    if (look === 'bars') drawBars(context, area, levels, peakLevels(), ink)
    else drawFlow(context, area, levels, ink)
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

  function rectOf(element: HTMLElement | null): Box | null {
    if (!element) return null
    const { left, top, right, bottom } = element.getBoundingClientRect()
    return { left, top, right, bottom }
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
