<script lang="ts">
  import { onMount } from 'svelte'
  import WindowControls from '../lib/WindowControls.svelte'
  import type { WindowState } from '@shared/ipc'

  /*
   * The window controls, drawn over SoundCloud's own header.
   *
   * This renders into a small transparent WebContentsView that Electron composites above
   * the SoundCloud view. Nothing here is inserted into SoundCloud's document — that is
   * the whole point. v0.7.x got this look by appending <li> elements into their
   * React-managed header and overwriting innerHTML on live nodes, which broke on every
   * SoundCloud release and produced an exception storm when a selector went stale.
   *
   * It exists only while the BetterSoundCloud bar is hidden. The collapse button below is
   * the only way back, so it must never be the thing that breaks.
   */

  let win = $state<WindowState>({ maximized: false, focused: true })

  onMount(() => window.bsc.onWindowState((s) => (win = s)))
</script>

<!--
  The strip itself is a drag region. With the top bar hidden there is nothing else to drag
  the window by, so the empty space to the left of the buttons is the grab handle.
  WindowControls marks itself `no-drag`, so the buttons stay clickable.
-->
<div class="embedded" data-bsc-embedded-controls class:unfocused={!win.focused}>
  <button
    class="restore"
    title="Show the BetterSoundCloud bar"
    aria-label="Show the BetterSoundCloud bar"
    onclick={() => window.bsc.toggleMenuBar()}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
      />
    </svg>
  </button>

  <WindowControls maximized={win.maximized} />
</div>

<style>
  /*
   * Transparent all the way down: the view has no background, so SoundCloud's own header
   * shows through behind the buttons and the two read as one bar.
   */
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  .embedded {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    height: 100vh;
    padding-right: 6px;
    /* SoundCloud's header is dark in both of its themes, so the glyphs are light here
       regardless of our own appearance setting. */
    color: #f2f2f2;
    -webkit-app-region: drag;
  }

  .embedded.unfocused {
    color: #8a8a8a;
  }

  .restore {
    display: grid;
    place-items: center;
    width: 30px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: inherit;
    cursor: default;
    -webkit-app-region: no-drag;
  }

  .restore:hover {
    background: rgb(255 255 255 / 14%);
  }

  .restore:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .restore svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
