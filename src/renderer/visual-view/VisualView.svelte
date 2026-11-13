<script lang="ts">
  import { onMount } from 'svelte'
  import type { NowPlaying } from '@shared/now-playing'
  import { LOOKS_FOR, NO_VISUALIZER, stepIndex, viewLayout } from '@shared/visualizer'
  import type { VisualLook, VisualizerConfig } from '@shared/visualizer'
  import Visualizer from '../lib/Visualizer.svelte'
  import MilkDrop from '../lib/MilkDrop.svelte'
  import { hardwareWebgl } from '../lib/milkdrop'
  import { artworkRoom, NEUTRAL_ROOM } from '../lib/artwork-room'
  import type { ArtworkRoom } from '../lib/artwork-room'

  /*
   * The Visualizer's view of its own (CLAUDE.md §22): what is heard, over SoundCloud's page area,
   * between its header and play bar, which stay usable around it.
   *
   * A room painted from the artwork, like the showcase (lib/artwork-room.ts): one flat colour and
   * its inks, with the look drawn large across it, or MilkDrop filling it. The plugin chooses the
   * look; here the switch at the top, or ← and →, try another for as long as the view is open,
   * and ↑ and ↓ (or the two buttons beside the preset's name) change MilkDrop's preset. Escape or
   * the close button closes it. Like the showcase, the controls and the cursor go once the
   * pointer rests.
   */

  /** How long the controls and the cursor stay once the pointer stops moving. */
  const CHROME_IDLE_MS = 2500
  const LOOK_NAMES: Record<VisualLook, string> = {
    bars: 'Bars',
    ring: 'Around the artwork',
    wave: 'Waveform',
    milkdrop: 'MilkDrop'
  }

  /** MilkDrop needs WebGL on the graphics card; without it, it is not offered at all. */
  const CAN_MILKDROP = hardwareWebgl()

  let playing = $state<NowPlaying | null>(null)
  let room = $state<ArtworkRoom>(NEUTRAL_ROOM)
  let visualizer = $state<VisualizerConfig>(NO_VISUALIZER)
  /** The look tried here, with the switch or the arrow keys; until then, the plugin's. */
  let picked = $state<VisualLook | null>(null)
  let chromeShown = $state(true)
  /** MilkDrop could not start here: Bars take its place, and the switch stops offering it. */
  let milkdropFailed = $state(false)
  let presetName = $state('')
  let milkdrop = $state<{ step(by: number): void } | null>(null)

  const offered = $derived(
    LOOKS_FOR.view.filter((one) => one !== 'milkdrop' || (CAN_MILKDROP && !milkdropFailed))
  )
  const look = $derived.by((): VisualLook | null => {
    const wanted = picked ?? visualizer.view
    return wanted && !offered.includes(wanted) ? 'bars' : wanted
  })
  const track = $derived(playing ? playing.url || `${playing.artist}\n${playing.title}` : '')

  let artworkWanted = ''
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  // Main sends MilkDrop the sound's channels exactly while it is the look here.
  $effect(() => {
    if (look) window.bsc.reportVisualViewLook(look)
  })

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopPlaying = window.bsc.onNowPlaying((next) => {
      notePlaying(next)
    })
    const stopVisualizer = window.bsc.onVisualizer((next) => {
      // A new choice in the plugin's settings is the one to show.
      visualizer = next
      picked = null
    })
    void window.bsc.getVisualizer().then((next) => {
      if (next as unknown) visualizer = next
    })
    void window.bsc.getNowPlaying().then((next) => {
      notePlaying(next)
    })

    const onKey = (event: KeyboardEvent): void => {
      wake()
      if (event.key === 'Escape') window.bsc.closeVisualView()
      else if (event.key === 'ArrowRight') pick(1)
      else if (event.key === 'ArrowLeft') pick(-1)
      else if (event.key === 'ArrowDown') milkdrop?.step(1)
      else if (event.key === 'ArrowUp') milkdrop?.step(-1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    wake()

    return () => {
      stopPlaying()
      stopVisualizer()
      if (idleTimer) clearTimeout(idleTimer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  })

  function notePlaying(next: NowPlaying | null): void {
    playing = next
    const url = next?.artwork ?? ''
    if (url === artworkWanted) return
    artworkWanted = url
    void artworkRoom(url).then((painted) => {
      // A newer track's artwork was asked for meanwhile: that one wins.
      if (url === artworkWanted) room = painted
    })
  }

  /** The next or previous look on offer, from the one showing. */
  function pick(step: number): void {
    if (!look) return
    picked = offered[stepIndex(offered.indexOf(look), step, offered.length)] ?? look
  }

  /** Show the controls and the cursor, and hide them again once the pointer rests. */
  function wake(): void {
    chromeShown = true
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      chromeShown = false
    }, CHROME_IDLE_MS)
  }
</script>

<main
  class="room"
  class:idle={!chromeShown}
  aria-label="Visualizer"
  style:--backdrop={room.inks.backdrop}
  style:--ink={room.inks.ink}
  style:--muted={room.inks.muted}
  data-bsc-visual-view
>
  {#if look === 'milkdrop'}
    <!-- Paused, the picture is shaded into the room, so "Paused" reads as it does on the room
         alone; playing, it is the subject, at full strength. -->
    <MilkDrop
      bind:this={milkdrop}
      presets={visualizer.presets}
      {track}
      running={playing?.playing ?? false}
      shade={!playing?.playing}
      hidden={!playing}
      onpreset={(name: string) => {
        presetName = name
      }}
      onfail={() => (milkdropFailed = true)}
    />
  {:else if look}
    {@const current = look}
    <Visualizer
      look={current}
      ink={room.inks.ink}
      layout={() => viewLayout(current, window.innerWidth, window.innerHeight)}
      strong
    />
  {/if}

  {#if !playing}
    <p class="note">
      <strong>Nothing is playing</strong>
      <span>Play something on SoundCloud and it shows here.</span>
    </p>
  {:else if !playing.playing}
    <p class="note"><strong>Paused</strong></p>
  {/if}

  <!-- Over MilkDrop's picture the controls stand on a plate of the room's colour, so they read
       whatever it draws; over the other looks, on the room itself. -->
  <div class="controls" class:shown={chromeShown} class:plate={look === 'milkdrop'}>
    <div class="looks" role="group" aria-label="Look">
      {#each offered as option (option)}
        <button
          class="look"
          type="button"
          aria-pressed={look === option}
          data-bsc-focus-first={look === option ? '' : undefined}
          onclick={() => (picked = option)}
        >
          {LOOK_NAMES[option]}
        </button>
      {/each}
    </div>

    {#if look === 'milkdrop'}
      <div class="preset" role="group" aria-label="Preset">
        <button
          class="icon"
          type="button"
          title="Previous preset (↑)"
          aria-label="Previous preset"
          onclick={() => milkdrop?.step(-1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
        </button>
        <button
          class="icon"
          type="button"
          title="Next preset (↓)"
          aria-label="Next preset"
          onclick={() => milkdrop?.step(1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </button>
        <span class="name" title={presetName} aria-live="polite">{presetName}</span>
      </div>
    {/if}

    <span class="hint">
      {look === 'milkdrop'
        ? '↑ ↓ change the preset · Esc closes'
        : '← → change the look · Esc closes'}
    </span>
    <button
      class="icon close"
      type="button"
      title="Close the visualizer (Esc)"
      aria-label="Close the visualizer"
      onclick={() => window.bsc.closeVisualView()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  .room {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    color: var(--ink);
    /* The room changes colour with the track, slowly, so it is felt rather than seen. */
    transition: background-color 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .room.idle {
    cursor: none;
  }

  /* Nothing loaded, or paused: said once, quietly, in the middle of the room. */
  .note {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 6px;
    margin: 0;
    text-align: center;
  }

  .note strong {
    font-size: 15px;
    font-weight: 600;
  }

  .note span {
    font-size: 14px;
    color: var(--muted);
  }

  /* Above the canvas, which takes the whole room. */
  .controls {
    position: absolute;
    top: 16px;
    right: 16px;
    left: 16px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0;
    transition: opacity 240ms ease-out;
  }

  .controls.shown,
  .controls:focus-within {
    opacity: 1;
  }

  /* A floating surface that takes input: the one shadow and the larger radius (DESIGN.md). */
  .controls.plate {
    top: 12px;
    right: 12px;
    left: 12px;
    padding: 4px;
    border-radius: 10px;
    background: var(--backdrop);
    box-shadow:
      0 12px 40px rgb(0 0 0 / 35%),
      0 2px 8px rgb(0 0 0 / 20%);
  }

  .looks,
  .preset {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .preset {
    flex: 0 1 auto;
    min-width: 0;
  }

  .look {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  .look:hover,
  .icon:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  /* The look showing: a state, said by the ink and a wash rather than the accent, which would
     fight a room that takes its colour from the artwork. */
  .look[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ink) 14%, transparent);
    color: var(--ink);
  }

  .name {
    overflow: hidden;
    padding-left: 4px;
    color: var(--ink);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    flex: none;
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }

  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--muted);
    cursor: default;
  }

  .close:hover {
    background: var(--bsc-danger);
    color: #fff;
  }

  .look:focus-visible,
  .icon:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .icon svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* A narrow room keeps the controls and drops the hint, which only repeats the keys. */
  @media (max-width: 720px) {
    .hint {
      display: none;
    }

    .close {
      margin-left: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .room,
    .controls {
      transition: none;
    }
  }
</style>
