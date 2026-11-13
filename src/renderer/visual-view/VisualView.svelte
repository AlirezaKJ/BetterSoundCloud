<script lang="ts">
  import { onMount } from 'svelte'
  import type { NowPlaying } from '@shared/now-playing'
  import { LOOKS_FOR, NO_VISUALIZER, stepLook, viewLayout } from '@shared/visualizer'
  import type { VisualLook, VisualizerConfig } from '@shared/visualizer'
  import Visualizer from '../lib/Visualizer.svelte'
  import { artworkRoom, NEUTRAL_ROOM } from '../lib/artwork-room'
  import type { ArtworkRoom } from '../lib/artwork-room'

  /*
   * The Visualizer's view of its own (CLAUDE.md §22): what is heard, over SoundCloud's page area,
   * between its header and play bar, which stay usable around it.
   *
   * A room painted from the artwork, like the showcase (lib/artwork-room.ts): one flat colour and
   * its inks, with the look drawn large across it. The plugin chooses the look; here the switch at
   * the top, or the arrow keys, try another for as long as the view is open. Escape or the close
   * button closes it. Like the showcase, the controls and the cursor go once the pointer rests.
   */

  /** How long the controls and the cursor stay once the pointer stops moving. */
  const CHROME_IDLE_MS = 2500
  const LOOK_NAMES: Record<VisualLook, string> = {
    bars: 'Bars',
    ring: 'Around the artwork',
    wave: 'Waveform'
  }

  let playing = $state<NowPlaying | null>(null)
  let room = $state<ArtworkRoom>(NEUTRAL_ROOM)
  let visualizer = $state<VisualizerConfig>(NO_VISUALIZER)
  /** The look tried here, with the switch or the arrow keys; until then, the plugin's. */
  let picked = $state<VisualLook | null>(null)
  let chromeShown = $state(true)

  const look = $derived(picked ?? visualizer.view)

  let artworkWanted = ''
  let idleTimer: ReturnType<typeof setTimeout> | null = null

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

  /** The next or previous look, from the one showing. */
  function pick(step: number): void {
    if (look) picked = stepLook('view', look, step)
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
  {#if look}
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

  <div class="controls" class:shown={chromeShown}>
    <div class="looks" role="group" aria-label="Look">
      {#each LOOKS_FOR.view as option (option)}
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

    <span class="hint">← → change the look · Esc closes</span>
    <button
      class="close"
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

  .looks {
    display: flex;
    gap: 4px;
    margin-right: auto;
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

  .look:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  /* The look showing: a state, said by the ink and a wash rather than the accent, which would
     fight a room that takes its colour from the artwork. */
  .look[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ink) 14%, transparent);
    color: var(--ink);
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  .close {
    display: grid;
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
  .close:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (prefers-reduced-motion: reduce) {
    .room,
    .controls {
      transition: none;
    }
  }
</style>
