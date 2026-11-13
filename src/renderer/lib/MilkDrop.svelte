<script lang="ts">
  import { onMount } from 'svelte'
  import {
    MILKDROP_BLEND_SECONDS,
    MILKDROP_STEP_BLEND_SECONDS,
    MILKDROP_TIMED_MS,
    VISUAL_WAVE,
    drawDue,
    milkdropRenderSize,
    presetOrder,
    stepIndex
  } from '@shared/visualizer'
  import type { MilkdropChange, VisualWave } from '@shared/visualizer'
  import { startMilkdrop } from './milkdrop'
  import type { Milkdrop } from './milkdrop'

  /*
   * MilkDrop, drawn (CLAUDE.md §22): Butterchurn's WebGL renderer playing MilkDrop's presets from
   * the sound's two channels, which the audio engine sends with each frame while this is on
   * screen. A canvas filling its view, behind everything, decorative and hidden from assistive
   * technology.
   *
   * It moves while SoundCloud plays and holds its last frame while paused, so a paused track
   * costs nothing here; a gap with no sound (between tracks) is drawn as silence, as MilkDrop
   * would. It draws at most about 60 to 75 frames a second, whatever the screen (`drawDue`, like
   * every look): MilkDrop's motion is timed, not counted, and a 240 Hz screen would otherwise
   * render four times the work for nothing. Reduced motion draws nothing at all, as for every look.
   *
   * Presets come in a shuffled order and change by themselves as `presets` says; `step` changes
   * them on request (↑ and ↓ in the views that show it). If it cannot start — no WebGL, a preset
   * pack that fails to load — it says so through `onfail` and its place draws Bars instead.
   */

  type Props = {
    /** When it moves on to another preset by itself. */
    presets: MilkdropChange
    /** The track loaded, so a `track` change comes with each new one: its URL, '' for none. */
    track: string
    /** Whether SoundCloud is playing: it moves only then. */
    running: boolean
    /**
     * Shaded by the room's colour (multiplied into it), so nothing it draws is lighter than the
     * room and every word over it keeps the contrast it has on the room alone.
     */
    shade?: boolean
    /**
     * Out of sight (nothing is loaded), though still loaded, so it shows at once when music
     * starts. Its own opacity rather than a wrapper's, which would cut it off from the room it is
     * shaded by.
     */
    hidden?: boolean
    /** The preset showing, by name, each time it changes. */
    onpreset?: (name: string) => void
    /** It could not start. */
    onfail?: () => void
  }
  let {
    presets,
    track,
    running,
    shade = false,
    hidden = false,
    onpreset,
    onfail
  }: Props = $props()

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  /** No channels for this long means no sound: draw silence. */
  const SILENT_AFTER_MS = 150
  /** After a change asked for while paused (or a resize), it draws this long to show it. */
  const PREVIEW_MS = 1500
  /** How many presets it tries on starting before it gives up. */
  const START_TRIES = 3

  let canvas = $state<HTMLCanvasElement | null>(null)
  let status = $state<'loading' | 'ready' | 'failed'>('loading')
  /** Whether it has drawn a frame yet: it fades in on its first. */
  let drawn = $state(false)

  let milkdrop: Milkdrop | null = null
  let order: number[] = []
  /** Where in `order` the preset wanted now is. */
  let at = 0
  let loading = false
  /** Whether any preset has loaded: whether its WebAssembly compiles here at all. */
  let loadedAny = false
  let wave: VisualWave | null = null
  let waveAt = 0
  let raf = 0
  let lastRender = 0
  let previewUntil = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastTrack = ''

  // Read into the same arrays every frame rather than making garbage seventy times a second.
  const silence = new Uint8Array(VISUAL_WAVE).fill(128)
  const mixed = new Uint8Array(VISUAL_WAVE)

  onMount(() => {
    const target = canvas
    if (REDUCED_MOTION || !target) return
    let alive = true
    const stop = window.bsc.onVisualFrame((frame) => {
      if (!frame.wave) return
      wave = frame.wave
      waveAt = performance.now()
    })
    const size = milkdropRenderSize(window.innerWidth, window.innerHeight)
    target.width = size.width
    target.height = size.height
    startMilkdrop(target, size.width, size.height).then(
      async (started) => {
        if (!alive) {
          started.visualizer.loseGLContext()
          return
        }
        milkdrop = started
        order = presetOrder(started.presets.length)
        // Ready only once a preset has compiled: a CSP that refused WebAssembly would refuse
        // every one, and Bars should then take its place rather than an empty room.
        for (let first = 0; first < START_TRIES && !loadedAny; first++) await show(first, 0)
        if (loadedAny) {
          status = 'ready'
        } else {
          console.warn('[milkdrop] no preset would load')
          status = 'failed'
          onfail?.()
        }
      },
      (error: unknown) => {
        console.warn('[milkdrop] could not start:', error)
        status = 'failed'
        onfail?.()
      }
    )
    window.addEventListener('resize', resize)
    return () => {
      alive = false
      stop()
      window.removeEventListener('resize', resize)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      if (timer) clearTimeout(timer)
      // Its WebGL context goes now, not whenever the garbage collector gets to it.
      milkdrop?.visualizer.loseGLContext()
      milkdrop = null
    }
  })

  // It moves while SoundCloud plays.
  $effect(() => {
    if (status === 'ready' && running) start()
  })

  // A change of setting starts the wait for a timed change again.
  $effect(() => {
    if (status === 'ready') planTimed(presets)
  })

  // A new track brings a new preset, when that is the setting.
  $effect(() => {
    const next = track
    if (status !== 'ready') return
    if (presets === 'track' && lastTrack && next && next !== lastTrack)
      void show(stepIndex(at, 1, order.length), MILKDROP_BLEND_SECONDS)
    lastTrack = next
  })

  /** The next or previous preset, at once: ↑ and ↓, or the view's own buttons. */
  export function step(by: number): void {
    if (!milkdrop || order.length === 0) return
    void show(stepIndex(at, by, order.length), MILKDROP_STEP_BLEND_SECONDS)
  }

  /**
   * Load the preset at `index` in the order. Loading compiles its equations, which takes a
   * moment, so loads go one at a time and a newer request replaces any waiting: the last key
   * pressed is the preset that shows.
   */
  async function show(index: number, blendSeconds: number): Promise<void> {
    at = index
    previewUntil = performance.now() + PREVIEW_MS
    start()
    if (loading) return
    loading = true
    try {
      let loaded = -1
      while (milkdrop && loaded !== at) {
        const wanted = at
        const entry = milkdrop.presets[order[wanted] ?? 0]
        loaded = wanted
        if (!entry) break
        try {
          await milkdrop.visualizer.loadPreset(entry.preset, blendSeconds)
          loadedAny = true
          if (at === wanted) onpreset?.(entry.name)
        } catch (error) {
          // That one stays out; the one showing goes on.
          console.warn(`[milkdrop] the preset “${entry.name}” did not load:`, error)
        }
      }
    } finally {
      loading = false
    }
    planTimed(presets)
  }

  /** The next timed change, counted from now. Only while playing: a paused one waits. */
  function planTimed(change: MilkdropChange): void {
    if (timer) clearTimeout(timer)
    timer = null
    if (change !== 'timed') return
    timer = setTimeout(() => {
      timer = null
      if (running) void show(stepIndex(at, 1, order.length), MILKDROP_BLEND_SECONDS)
      else planTimed(change)
    }, MILKDROP_TIMED_MS)
  }

  function start(): void {
    if (raf || !milkdrop) return
    raf = requestAnimationFrame(tick)
  }

  function tick(now: number): void {
    raf = 0
    if (!milkdrop || (!running && now > previewUntil)) return
    raf = requestAnimationFrame(tick)
    if (!drawDue(now, lastRender)) return
    lastRender = now
    const heard = wave && now - waveAt < SILENT_AFTER_MS ? wave : null
    const left = heard?.left ?? silence
    const right = heard?.right ?? silence
    for (let i = 0; i < VISUAL_WAVE; i++) mixed[i] = ((left[i] ?? 128) + (right[i] ?? 128)) >> 1
    milkdrop.visualizer.render({
      audioLevels: { timeByteArray: mixed, timeByteArrayL: left, timeByteArrayR: right }
    })
    if (!drawn) drawn = true
  }

  /** The room changed size: so does the render, keeping its pixel budget. */
  function resize(): void {
    if (!milkdrop || !canvas) return
    const size = milkdropRenderSize(window.innerWidth, window.innerHeight)
    if (size.width === canvas.width && size.height === canvas.height) return
    canvas.width = size.width
    canvas.height = size.height
    milkdrop.visualizer.setRendererSize(size.width, size.height)
    // Resizing clears the canvas: draw again even while paused.
    previewUntil = performance.now() + 100
    start()
  }
</script>

{#if !REDUCED_MOTION}
  <canvas
    bind:this={canvas}
    class:shade
    class:drawn={drawn && !hidden}
    aria-hidden="true"
    data-bsc-visualizer
    data-look="milkdrop"
    data-bsc-milkdrop={status}
  ></canvas>
{/if}

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0;
    /* One authored moment: the picture surfaces when it first draws, MilkDrop's own blends do
       the rest. */
    transition: opacity 600ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  canvas.drawn {
    opacity: 1;
  }

  canvas.shade {
    mix-blend-mode: multiply;
  }
</style>
