<script lang="ts">
  import { untrack } from 'svelte'
  import { chainResponseDb, headroomDb } from '@shared/audio'
  import {
    bandLabel,
    formatGains,
    gainLabel,
    graphicEqualiser,
    matchingPreset,
    parseGains,
    snapGain
  } from '@shared/equaliser'

  /*
   * An `equaliser` plugin setting (src/shared/plugins.ts): a point per band, dragged up or down,
   * over the curve the plugin's filters will really make.
   *
   * The curve is not drawn through the points by eye. It is the summed response of the exact
   * filters the plugin asks for — `graphicEqualiser`, the same function the plugin sandbox hands
   * plugins — computed with Web Audio's own coefficients (src/shared/audio.ts). What you see is
   * what you hear; the filters are tuned so the curve passes through every point.
   *
   * Every point is a real slider: Tab between them, arrows and Page keys to move one, Home and End
   * for the limits, Delete or a double-click for 0 dB. Dragging sends the curve to main a dozen
   * times a second, so the sound follows the pointer, and once more when the pointer lets go.
   */

  type Props = {
    /** The id of the element naming this group (the setting's label). */
    labelledBy: string
    bands: number[]
    range: number
    presets: { name: string; gains: number[] }[]
    value: string
    onchange: (value: string) => void
  }

  let { labelledBy, bands, range, presets, value, onchange }: Props = $props()

  const PLOT_HEIGHT = 168
  /** Room inside the plot so a point at a limit, and its ring, stay whole. */
  const INSET_X = 22
  const INSET_Y = 12
  /** At most this often while dragging, so main is not asked hundreds of times a second. */
  const COMMIT_EVERY_MS = 80

  let gains = $state(untrack(() => parseGains(value, bands.length, range)))
  let width = $state(0)
  /** The band being dragged, or null. */
  let dragging = $state<number | null>(null)
  /** The band whose value label shows: dragged or focused. */
  let showing = $state<number | null>(null)

  /** The last value sent, until main's answer carries it back; older answers are ignored. */
  let awaiting: string | null = null
  let awaitingTimer: ReturnType<typeof setTimeout> | null = null
  let commitTimer: ReturnType<typeof setTimeout> | null = null
  let lastCommitAt = 0

  const plotWidth = $derived(Math.max(0, width))
  const xs = $derived(
    bands.map(
      (_, i) => INSET_X + (i * (plotWidth - 2 * INSET_X)) / Math.max(1, bands.length - 1)
    )
  )
  const filters = $derived(graphicEqualiser(bands, gains))
  const headroom = $derived(headroomDb(filters))
  const preset = $derived(matchingPreset(gains, presets))
  const flat = $derived(gains.every((gain) => gain === 0))

  /** The curve, sampled every two pixels between the first band and the last. */
  const curve = $derived.by(() => {
    const first = xs[0]
    const last = xs[xs.length - 1]
    if (first === undefined || last === undefined || last <= first)
      return { line: '', area: '' }
    const points: string[] = []
    for (let x = first; x <= last + 0.5; x += 2) {
      const db = chainResponseDb(filters, frequencyAt(Math.min(x, last)))
      points.push(`${x.toFixed(1)},${yOf(Math.max(-range, Math.min(range, db))).toFixed(1)}`)
    }
    const zero = yOf(0).toFixed(1)
    return {
      line: `M${points.join('L')}`,
      area: `M${first.toFixed(1)},${zero}L${points.join('L')}L${last.toFixed(1)},${zero}Z`
    }
  })

  // Take main's value, unless it is an older answer to a drag still on its way.
  $effect(() => {
    const incoming = parseGains(value, bands.length, range)
    const text = formatGains(incoming)
    untrack(() => {
      if (dragging !== null) return
      if (awaiting !== null) {
        if (text === awaiting) awaiting = null
        return
      }
      if (text !== formatGains(gains)) gains = incoming
    })
  })

  function yOf(gain: number): number {
    return INSET_Y + ((range - gain) / (2 * range)) * (PLOT_HEIGHT - 2 * INSET_Y)
  }

  function gainAt(y: number): number {
    return snapGain(range - ((y - INSET_Y) / (PLOT_HEIGHT - 2 * INSET_Y)) * 2 * range, range)
  }

  /**
   * The bands are evenly spaced across the plot, as on a hi-fi, although 2.4 kHz to 15 kHz is a
   * far wider span than 60 to 150 Hz. So between two bands, x is linear in log-frequency.
   */
  function frequencyAt(x: number): number {
    for (let i = 0; i < xs.length - 1; i++) {
      const left = xs[i] ?? 0
      const right = xs[i + 1] ?? 0
      if (x <= right || i === xs.length - 2) {
        const t = right > left ? (x - left) / (right - left) : 0
        const low = Math.log(bands[i] ?? 20)
        const high = Math.log(bands[i + 1] ?? 20000)
        return Math.exp(low + t * (high - low))
      }
    }
    return bands[0] ?? 1000
  }

  function setGain(band: number, gain: number, now = false): void {
    const next = snapGain(gain, range)
    if (gains[band] === next) return
    gains = gains.map((g, i) => (i === band ? next : g))
    commit(now)
  }

  function setAll(next: number[]): void {
    gains = next.map((g) => snapGain(g, range))
    commit(true)
  }

  function commit(now: boolean): void {
    const send = (): void => {
      commitTimer = null
      lastCommitAt = performance.now()
      const text = formatGains(gains)
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

  /** Which band a pointer at `x` is over: the nearest column. */
  function bandAt(x: number): number {
    let nearest = 0
    xs.forEach((bandX, i) => {
      if (Math.abs(bandX - x) < Math.abs((xs[nearest] ?? 0) - x)) nearest = i
    })
    return nearest
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const plot = event.currentTarget as HTMLElement
    const box = plot.getBoundingClientRect()
    const band = bandAt(event.clientX - box.left)
    dragging = band
    showing = band
    plot.setPointerCapture(event.pointerId)
    // Grabbing a point keeps its value; grabbing its column puts it where the pointer is.
    const onPoint = (event.target as HTMLElement).closest('[role="slider"]') !== null
    if (!onPoint) setGain(band, gainAt(event.clientY - box.top))
    plot.querySelector<HTMLElement>(`[data-band="${band}"]`)?.focus({ preventScroll: true })
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (dragging === null) return
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setGain(dragging, gainAt(event.clientY - box.top))
  }

  function onPointerUp(): void {
    if (dragging === null) return
    dragging = null
    commit(true)
  }

  /**
   * A double-click puts the band under the pointer back to 0 dB. It is heard on the plot, not the
   * point: the plot captures the pointer on every press, so Chromium sends the click to it, and a
   * handler on the point never ran.
   */
  function onDoubleClick(event: MouseEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setGain(bandAt(event.clientX - box.left), 0, true)
  }

  function onKey(event: KeyboardEvent, band: number): void {
    const gain = gains[band] ?? 0
    const big = event.shiftKey ? 3 : 1
    const steps: Record<string, number> = {
      ArrowUp: big,
      ArrowRight: big,
      ArrowDown: -big,
      ArrowLeft: -big,
      PageUp: 3,
      PageDown: -3
    }
    let next: number | null = null
    if (event.key in steps) next = gain + (steps[event.key] ?? 0)
    else if (event.key === 'Home') next = -range
    else if (event.key === 'End') next = range
    else if (event.key === 'Delete' || event.key === 'Backspace' || event.key === '0') next = 0
    if (next === null) return
    event.preventDefault()
    setGain(band, next, true)
  }

  function choosePreset(name: string): void {
    const chosen = presets.find((p) => p.name === name)
    if (chosen) setAll(chosen.gains)
  }

  /** How a screen reader says a point's value. */
  function spoken(gain: number): string {
    if (gain === 0) return '0 decibels'
    return `${gain > 0 ? 'plus' : 'minus'} ${Math.abs(gain)} decibels`
  }
</script>

<div class="equaliser" role="group" aria-labelledby={labelledBy} data-bsc-equaliser>
  <div class="bar">
    <label class="preset">
      <span>Preset</span>
      <select value={preset ?? ''} onchange={(e) => choosePreset(e.currentTarget.value)}>
        {#if preset === null}
          <option value="" disabled>Custom</option>
        {/if}
        {#each presets as option (option.name)}
          <option value={option.name}>{option.name}</option>
        {/each}
      </select>
    </label>
    <button type="button" disabled={flat} onclick={() => setAll(bands.map(() => 0))}
      >Reset</button
    >
  </div>

  <div class="graph">
    <div class="scale" aria-hidden="true">
      <span style:top="{yOf(range)}px">{gainLabel(range)}</span>
      <span style:top="{yOf(0)}px">0</span>
      <span style:top="{yOf(-range)}px">{gainLabel(-range)}</span>
    </div>

    <!-- The whole plot takes the pointer: a drag can start anywhere in a band's column, and
         keeps going outside the plot once it has started. -->
    <div
      class="plot"
      class:dragging={dragging !== null}
      bind:clientWidth={width}
      style:height="{PLOT_HEIGHT}px"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      ondblclick={onDoubleClick}
      role="presentation"
    >
      <svg width={plotWidth} height={PLOT_HEIGHT} aria-hidden="true">
        <line class="edge" x1="0" x2={plotWidth} y1={yOf(range)} y2={yOf(range)} />
        <line class="edge" x1="0" x2={plotWidth} y1={yOf(-range)} y2={yOf(-range)} />
        {#each xs as x, i (i)}
          <line class="column" x1={x} x2={x} y1={yOf(range)} y2={yOf(-range)} />
        {/each}
        <line class="zero" x1="0" x2={plotWidth} y1={yOf(0)} y2={yOf(0)} />
        <path class="area" d={curve.area} />
        <path class="curve" d={curve.line} />
      </svg>

      {#each bands as band, i (band)}
        {@const gain = gains[i] ?? 0}
        <div
          class="point"
          class:active={dragging === i}
          role="slider"
          tabindex="0"
          data-band={i}
          aria-label={bandLabel(band)}
          aria-orientation="vertical"
          aria-valuemin={-range}
          aria-valuemax={range}
          aria-valuenow={gain}
          aria-valuetext={spoken(gain)}
          style:left="{xs[i]}px"
          style:top="{yOf(gain)}px"
          onkeydown={(e) => onKey(e, i)}
          onfocus={() => (showing = i)}
          onblur={() => {
            if (dragging === null) showing = null
          }}
        ></div>
        {#if showing === i}
          <span
            class="value"
            class:below={yOf(gain) < 20}
            style:left="{xs[i]}px"
            style:top="{yOf(gain)}px"
            aria-hidden="true">{gainLabel(gain)}</span
          >
        {/if}
      {/each}
    </div>

    <div class="bands" aria-hidden="true">
      {#each bands as band, i (band)}
        <span style:left="{xs[i]}px">{bandLabel(band)}</span>
      {/each}
    </div>
  </div>

  {#if headroom > 0}
    <p class="note">
      Everything plays {headroom.toFixed(1)} dB quieter, to make room for the boost without distortion.
    </p>
  {/if}
</div>

<style>
  .equaliser {
    margin-top: 10px;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .preset {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  /* The settings panel's own select and button, so the panel keeps one control language. */
  select {
    min-width: 160px;
    padding: 6px 8px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
  }

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

  select:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  /* The scale in a column of its own on the left; the plot takes the rest. */
  .graph {
    display: grid;
    grid-template-columns: 44px 1fr;
    grid-template-rows: auto auto;
    margin-top: 14px;
  }

  .scale {
    position: relative;
    grid-row: 1;
    grid-column: 1;
  }

  .scale span,
  .bands span {
    position: absolute;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--bsc-text-secondary);
    white-space: nowrap;
  }

  .scale span {
    right: 8px;
    transform: translateY(-50%);
  }

  .plot {
    position: relative;
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
    touch-action: none;
    user-select: none;
  }

  svg {
    display: block;
    overflow: visible;
  }

  /* Hairlines for the frame, Ghost Ink for 0 dB: a reference, quieter than the curve. */
  .edge,
  .column {
    stroke: var(--bsc-border);
    stroke-width: 1;
  }

  .zero {
    stroke: var(--bsc-text-disabled);
    stroke-width: 1;
  }

  /* The sound itself: an Ink line over a flat wash, from 0 dB to the curve. No gradient. */
  .area {
    fill: color-mix(in srgb, var(--bsc-text-primary) 7%, transparent);
  }

  .curve {
    fill: none;
    stroke: var(--bsc-text-primary);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /*
   * A point: a 12px Ink dot ringed in the panel's colour so it stands off the curve, inside a
   * 28px target. The target is the slider, so its focus ring is a circle around the dot.
   */
  .point {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border-radius: 50%;
    cursor: ns-resize;
  }

  .point::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: var(--bsc-text-primary);
    box-shadow: 0 0 0 2px var(--bsc-bg-primary);
  }

  .point:hover::before,
  .point.active::before {
    inset: 7px;
  }

  .point:focus {
    outline: none;
  }

  .point:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .plot.dragging,
  .plot.dragging .point {
    cursor: ns-resize;
  }

  /* The value of the point being moved, just above it (below, near the top). */
  .value {
    position: absolute;
    transform: translate(-50%, calc(-100% - 14px));
    padding: 1px 6px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  .value.below {
    transform: translate(-50%, 14px);
  }

  .bands {
    position: relative;
    grid-row: 2;
    grid-column: 2;
    height: 22px;
  }

  .bands span {
    top: 6px;
    transform: translateX(-50%);
  }

  .note {
    margin: 6px 0 0 44px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }
</style>
