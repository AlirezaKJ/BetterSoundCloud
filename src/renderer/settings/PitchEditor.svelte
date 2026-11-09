<script lang="ts">
  import { untrack } from 'svelte'
  import {
    OCTAVE,
    formatSemitones,
    parseSemitones,
    semitoneLabel,
    semitoneWords
  } from '@shared/pitch'

  /*
   * A `pitch` plugin setting (src/shared/plugins.ts): how many semitones to move everything
   * SoundCloud plays, drawn as a ruler with a tick per semitone and a marker on the shift.
   *
   * The ticks between 0 and the marker darken, so the shift can be counted as well as read: three
   * dark ticks are three semitones. 0 and the octaves stand taller, 0 in Ghost Ink like the
   * Equaliser's 0 dB line, since that is where the song's own key is.
   *
   * The marker is a real slider: arrows move it a semitone, Page keys an octave, Home and End to
   * the limits, Delete or a double-click back to the original key. Dragging sends the shift to main
   * as it changes, at most a dozen times a second, so the sound follows the pointer.
   */

  type Props = {
    /** The id of the element naming this control (the setting's label). */
    labelledBy: string
    range: number
    value: string
    onchange: (value: string) => void
  }

  let { labelledBy, range, value, onchange }: Props = $props()

  const HEIGHT = 46
  /** Where the ticks stand, from the top. The value tag floats above them. */
  const BASELINE = 32
  /** Room at each end so the marker's target stays whole at a limit. */
  const INSET_X = 14
  const COMMIT_EVERY_MS = 80

  let semitones = $state(untrack(() => parseSemitones(value, range)))
  let width = $state(0)
  let dragging = $state(false)
  let focused = $state(false)

  /** The last value sent, until main's answer carries it back; older answers are ignored. */
  let awaiting: string | null = null
  let awaitingTimer: ReturnType<typeof setTimeout> | null = null
  let commitTimer: ReturnType<typeof setTimeout> | null = null
  let lastCommitAt = 0

  const steps = $derived(Array.from({ length: 2 * range + 1 }, (_, i) => i - range))
  const span = $derived(Math.max(1, width - 2 * INSET_X))

  // Take main's value, unless it is an older answer to a drag still on its way.
  $effect(() => {
    const incoming = parseSemitones(value, range)
    untrack(() => {
      if (dragging) return
      if (awaiting !== null) {
        if (formatSemitones(incoming) === awaiting) awaiting = null
        return
      }
      if (incoming !== semitones) semitones = incoming
    })
  })

  function xOf(step: number): number {
    return INSET_X + ((step + range) / (2 * range)) * span
  }

  function stepAt(x: number): number {
    return Math.round(((x - INSET_X) / span) * 2 * range - range)
  }

  /** Tall at 0 and the octaves, short elsewhere. */
  function tickHeight(step: number): number {
    return step % OCTAVE === 0 ? 14 : 7
  }

  /** Whether `step` lies between the original key and the shift: the steps moved. */
  function moved(step: number): boolean {
    return (
      step !== 0 &&
      Math.sign(step) === Math.sign(semitones) &&
      Math.abs(step) <= Math.abs(semitones)
    )
  }

  function set(next: number, now = false): void {
    const clamped = Math.max(-range, Math.min(range, Math.round(next))) || 0
    if (clamped === semitones) {
      if (now) commit(true)
      return
    }
    semitones = clamped
    commit(now)
  }

  function commit(now: boolean): void {
    const send = (): void => {
      commitTimer = null
      lastCommitAt = performance.now()
      const text = formatSemitones(semitones)
      awaiting = text
      if (awaitingTimer) clearTimeout(awaitingTimer)
      // A value main reshaped would never come back equal; stop waiting for it after a while.
      awaitingTimer = setTimeout(() => {
        awaiting = null
      }, 2000)
      onchange(text)
    }
    if (now) {
      if (commitTimer) clearTimeout(commitTimer)
      send()
      return
    }
    const wait = COMMIT_EVERY_MS - (performance.now() - lastCommitAt)
    if (wait <= 0) send()
    else commitTimer ??= setTimeout(send, wait)
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const ruler = event.currentTarget as HTMLElement
    dragging = true
    ruler.setPointerCapture(event.pointerId)
    // Grabbing the marker keeps its value; grabbing the ruler moves it to the pointer.
    const onMarker = (event.target as HTMLElement).closest('[role="slider"]') !== null
    if (!onMarker) set(stepAt(event.clientX - ruler.getBoundingClientRect().left))
    ruler.querySelector<HTMLElement>('[role="slider"]')?.focus({ preventScroll: true })
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    set(stepAt(event.clientX - box.left))
  }

  function onPointerUp(): void {
    if (!dragging) return
    dragging = false
    commit(true)
  }

  /**
   * A double-click goes back to the original key. It is heard on the ruler, not the marker: the
   * ruler captures the pointer on every press, so Chromium sends the click to it.
   */
  function onDoubleClick(): void {
    set(0, true)
  }

  function onKey(event: KeyboardEvent): void {
    const octave = Math.min(OCTAVE, range)
    const moves: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: octave,
      PageDown: -octave
    }
    let next: number | null = null
    if (event.key in moves) next = semitones + (moves[event.key] ?? 0)
    else if (event.key === 'Home') next = -range
    else if (event.key === 'End') next = range
    else if (event.key === 'Delete' || event.key === 'Backspace' || event.key === '0') next = 0
    if (next === null) return
    event.preventDefault()
    set(next, true)
  }
</script>

<div class="pitch" data-bsc-pitch>
  <div class="bar">
    <output class="readout" class:original={semitones === 0} aria-hidden="true"
      >{semitoneWords(semitones)}</output
    >
    <button type="button" disabled={semitones === 0} onclick={() => set(0, true)}>Reset</button>
  </div>

  <!-- The whole ruler takes the pointer: a drag can start anywhere along it, and keeps going
       outside it once it has started. -->
  <div
    class="ruler"
    class:dragging
    bind:clientWidth={width}
    style:height="{HEIGHT}px"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={onDoubleClick}
    role="presentation"
  >
    {#if width > 0}
      <svg {width} height={HEIGHT} aria-hidden="true">
        <line class="base" x1={xOf(-range)} x2={xOf(range)} y1={BASELINE} y2={BASELINE} />
        {#each steps as step (step)}
          <line
            class="tick"
            class:zero={step === 0}
            class:moved={moved(step)}
            x1={xOf(step)}
            x2={xOf(step)}
            y1={BASELINE}
            y2={BASELINE - tickHeight(step)}
          />
        {/each}
        {#if semitones !== 0}
          <line class="fill" x1={xOf(0)} x2={xOf(semitones)} y1={BASELINE} y2={BASELINE} />
        {/if}
      </svg>

      <div
        class="marker"
        class:active={dragging}
        role="slider"
        tabindex="0"
        aria-labelledby={labelledBy}
        aria-orientation="horizontal"
        aria-valuemin={-range}
        aria-valuemax={range}
        aria-valuenow={semitones}
        aria-valuetext={semitoneWords(semitones)}
        style:left="{xOf(semitones)}px"
        style:top="{BASELINE}px"
        onkeydown={onKey}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
      ></div>
      {#if focused || dragging}
        <span
          class="value"
          style:left="{xOf(semitones)}px"
          style:top="{BASELINE - 14}px"
          aria-hidden="true">{semitoneLabel(semitones)}</span
        >
      {/if}
    {/if}
  </div>

  <div class="scale" aria-hidden="true">
    <span style:left="{xOf(-range)}px">{semitoneLabel(-range)}</span>
    <span style:left="{xOf(0)}px">0</span>
    <span style:left="{xOf(range)}px">{semitoneLabel(range)}</span>
  </div>
</div>

<style>
  .pitch {
    margin-top: 10px;
  }

  /* The Equaliser's bar: what it is set to on the left, Reset on the right. */
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
  }

  .readout {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--bsc-text-primary);
  }

  .readout.original {
    color: var(--bsc-text-secondary);
  }

  /* The settings panel's own button, so the panel keeps one control language. */
  button {
    padding: 4px 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  button:hover:enabled {
    background: var(--bsc-bg-hover);
  }

  button:disabled {
    color: var(--bsc-text-disabled);
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .ruler {
    position: relative;
    margin-top: 6px;
    touch-action: none;
    user-select: none;
    cursor: ew-resize;
  }

  svg {
    display: block;
    overflow: visible;
  }

  /* Hairlines for the ruler; Ghost Ink at 0, a reference quieter than anything set. */
  .base,
  .tick {
    stroke: var(--bsc-border);
    stroke-width: 1;
  }

  .tick.zero {
    stroke: var(--bsc-text-disabled);
  }

  /* The steps moved, counted off in Muted Ink. */
  .tick.moved {
    stroke: var(--bsc-text-secondary);
  }

  /* The shift itself, along the baseline from the original key to the marker. */
  .fill {
    stroke: var(--bsc-text-primary);
    stroke-width: 2;
    stroke-linecap: round;
  }

  /*
   * The marker: the Equaliser's point, a 12px Ink dot ringed in the panel's colour inside a 28px
   * target. The target is the slider, so its focus ring is a circle around the dot.
   */
  .marker {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border-radius: 50%;
  }

  .marker::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: var(--bsc-text-primary);
    box-shadow: 0 0 0 2px var(--bsc-bg-primary);
  }

  .marker:hover::before,
  .marker.active::before {
    inset: 7px;
  }

  .marker:focus {
    outline: none;
  }

  .marker:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  /* The shift being set, above the ticks over the marker. */
  .value {
    position: absolute;
    transform: translate(-50%, -100%);
    padding: 1px 6px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  .scale {
    position: relative;
    height: 18px;
  }

  .scale span {
    position: absolute;
    top: 2px;
    transform: translateX(-50%);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--bsc-text-secondary);
    white-space: nowrap;
  }
</style>
