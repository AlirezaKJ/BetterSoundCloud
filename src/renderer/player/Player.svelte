<script lang="ts">
  import { onMount } from 'svelte'
  import type { PageTheme } from '@shared/page-theme'

  /*
   * Our buttons at the right-hand end of SoundCloud's play controls.
   *
   * Same mechanism as the window controls over their header: a small transparent
   * WebContentsView that Electron composites above the SoundCloud view, with a matching
   * strip of padding reserved in their bar so nothing of theirs ends up underneath. Nothing
   * is inserted into SoundCloud's document.
   *
   * v0.7.x did the opposite — `playControls__elements.appendChild(...)` of four hand-built
   * nodes into their React-managed player, which is why it broke on their releases.
   *
   * NEITHER BUTTON DOES ANYTHING YET. They are styled as live — same white as SoundCloud's
   * own player icons, same hover wash, pointer cursor — because they have to be judged
   * against that row, and a dimmed placeholder cannot be. The caveat stays discoverable in
   * the tooltip, and `appearance.playerButtons` is off by default, so nobody meets a dead
   * control without opting in. Wiring is: lyrics -> the lyrics page, showcase -> the
   * full-screen now-playing view.
   *
   * The glyph colour follows SOUNDCLOUD's light/dark setting, not ours. This overlay is a
   * separate document composited over their bar, so it cannot inherit their colours the way
   * the injected theme does with `currentColor` — main tells it instead. Hard-coded white
   * disappeared entirely the moment somebody chose Light in SoundCloud's settings.
   */

  let page = $state<PageTheme>('dark')

  onMount(() => window.bsc.onPageTheme((t) => (page = t)))
</script>

<div class="player" data-bsc-player-controls class:light={page === 'light'}>
  <button
    class="btn"
    title="Lyrics — not implemented yet"
    aria-label="Lyrics (not implemented yet)"
  >
    <!-- Microphone, matching the glyph v0.7.x used for the lyrics page. -->
    <svg viewBox="0 -960 960 960" aria-hidden="true">
      <path
        d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 280v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Z"
      />
    </svg>
  </button>

  <button
    class="btn"
    title="Full-screen showcase — not implemented yet"
    aria-label="Full-screen showcase (not implemented yet)"
  >
    <!-- Screen with a play triangle, matching v0.7.x's showcase glyph. -->
    <svg viewBox="0 -960 960 960" aria-hidden="true">
      <path d="m380-300 280-180-280-180v360ZM80-160v-640h800v640H80Z" />
    </svg>
  </button>
</div>

<style>
  /*
   * Transparent all the way down, so SoundCloud's player bar shows through behind the
   * glyphs and the two read as one bar.
   */
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  .player {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100vh;
    padding-right: 14px;
    /* Matches the white SoundCloud uses for the like/repost/queue icons immediately to the
       left. Their bar is dark in both of their themes, so this is fixed rather than following
       our own appearance setting — the same reasoning as the header overlay. */
    color: #fff;
  }

  /* SoundCloud's own dark grey for icons on a light page — not pure black, which reads as
     heavier than everything around it. */
  .player.light {
    color: #333;
  }

  .btn {
    display: grid;
    place-items: center;
    /* Never let the flex row squash these. Measured without it: the buttons collapsed from
       30px to the 17px icon, which is the shape a too-narrow reservation would produce. */
    flex: none;
    width: 30px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .btn:hover {
    background: rgb(255 255 255 / 14%);
  }

  .btn:active {
    background: rgb(255 255 255 / 22%);
  }

  /* A white wash is invisible on a light page, so the hover inverts with the theme. */
  .player.light .btn:hover {
    background: rgb(0 0 0 / 8%);
  }

  .player.light .btn:active {
    background: rgb(0 0 0 / 14%);
  }

  .btn:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .btn svg {
    width: 17px;
    height: 17px;
    fill: currentcolor;
  }
</style>
