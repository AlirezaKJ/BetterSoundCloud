<script lang="ts">
  /*
   * Minimize / maximize / close, in one place.
   *
   * Used by two surfaces: the 32px chrome strip, and the overlay that floats over
   * SoundCloud's own header. They must stay identical — two copies of window controls
   * that drift apart is exactly the kind of thing nobody notices until a user reports
   * that "the buttons look different depending on where I look".
   */
  type Props = { maximized: boolean }
  let { maximized }: Props = $props()
</script>

<div class="controls" data-bsc-window-controls>
  <button title="Minimize" aria-label="Minimize" onclick={() => window.bsc.minimize()}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
  </button>

  <button
    title={maximized ? 'Restore' : 'Maximize'}
    aria-label={maximized ? 'Restore' : 'Maximize'}
    onclick={() => window.bsc.maximizeToggle()}
  >
    {#if maximized}
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

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
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

  button:hover {
    background: var(--bsc-bg-hover);
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
