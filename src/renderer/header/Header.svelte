<script lang="ts">
  import { onMount } from 'svelte'
  import type { NavState, WindowState } from '@shared/ipc'

  let nav = $state<NavState>({ canGoBack: false, canGoForward: false })
  let win = $state<WindowState>({ maximized: false, focused: true })

  onMount(() => {
    const offNav = window.bsc.onNavState((s) => (nav = s))
    const offWin = window.bsc.onWindowState((s) => (win = s))
    return () => {
      offNav()
      offWin()
    }
  })
</script>

<!--
  The whole strip is a drag region; interactive elements opt back out with
  `-webkit-app-region: no-drag`. This is what replaces v0.7.x's SCI.js, which appended
  <li> elements into SoundCloud's own React-managed `.header__navMenu` and overwrote
  `innerHTML` on three live React nodes.
-->
<header data-bsc-header class:unfocused={!win.focused}>
  <div class="nav" data-bsc-header-nav>
    <button
      title="Back"
      aria-label="Back"
      disabled={!nav.canGoBack}
      onclick={() => window.bsc.back()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
    </button>
    <button
      title="Forward"
      aria-label="Forward"
      disabled={!nav.canGoForward}
      onclick={() => window.bsc.forward()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </button>
    <button title="Reload" aria-label="Reload" onclick={() => window.bsc.reload()}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 5v6h-6" />
      </svg>
    </button>
  </div>

  <div class="title" data-bsc-header-title>BetterSoundCloud</div>

  <div class="controls" data-bsc-header-controls>
    <!--
      A cog, not a sun. The earlier icon was a circle with eight radiating lines, which
      reads as a brightness or theme control — and BetterSoundCloud has no theme toggle in
      the header; appearance lives inside settings.
    -->
    <button title="Settings" aria-label="Settings" onclick={() => window.bsc.toggleSettings()}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3.1" />
        <path
          d="M19.1 14.4a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.03z"
        />
      </svg>
    </button>
    <button title="Minimize" aria-label="Minimize" onclick={() => window.bsc.minimize()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
    </button>
    <button
      title={win.maximized ? 'Restore' : 'Maximize'}
      aria-label={win.maximized ? 'Restore' : 'Maximize'}
      onclick={() => window.bsc.maximizeToggle()}
    >
      {#if win.maximized}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="5" width="11" height="11" />
          <path d="M5 8v11h11" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><rect x="6" y="6" width="12" height="12" /></svg
        >
      {/if}
    </button>
    <button class="close" title="Close" aria-label="Close" onclick={() => window.bsc.close()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--bsc-header-height);
    padding: 0 2px 0 6px;
    background: var(--bsc-header-bg);
    border-bottom: 1px solid var(--bsc-border);
    user-select: none;
    -webkit-app-region: drag;
  }

  header.unfocused {
    color: var(--bsc-text-disabled);
  }

  .nav,
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
  }

  .title {
    flex: 1;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: var(--bsc-text-secondary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  button {
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
  }

  button:hover:not(:disabled) {
    background: var(--bsc-bg-hover);
  }

  button:disabled {
    color: var(--bsc-text-disabled);
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  button.close:hover {
    background: var(--bsc-danger);
    color: #fff;
  }

  svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
