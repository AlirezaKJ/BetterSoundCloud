<script lang="ts" module>
  let drawings = 0

  /** Each drawing's clip paths need ids no other drawing on the page uses. */
  function clipId(): string {
    drawings += 1
    return `bsc-figure-${drawings}`
  }
</script>

<script lang="ts">
  import type { FigureName, WindowLayout } from './setting-figure'
  /*
   * Small line drawings of the window for Settings (chosen by the maintainer, 2026-11-14), and the
   * light, dark and system pictures for the Light or dark tiles.
   *
   * Every layout drawing is the same window, as all the layout settings have it right now, so the
   * drawings never disagree and switching one setting changes them all; each draws the part its
   * own setting controls in Ink, the rest quietly. The window is 120×76: our bar on top (8),
   * SoundCloud's header (9), its page, and its player bar (9) at the bottom.
   *
   * Decorative: the row's name and explanation say it all in words, so the drawing is hidden from
   * assistive technology.
   */
  let { name, layout = null }: { name: FigureName; layout?: WindowLayout | null } = $props()

  const clip = clipId()

  const state = $derived<WindowLayout>(
    layout ?? {
      barHidden: false,
      autoHide: false,
      stretched: true,
      minimalNavigation: false,
      playerButtons: true
    }
  )
  // SoundCloud centres its header and player at 1240px unless "Stretch the SoundCloud bars" is on.
  const left = $derived(state.stretched ? 5 : 24)
  const right = $derived(state.stretched ? 115 : 96)
  const headerTop = $derived(state.barHidden ? 1 : 9)
  /** The part this drawing's own setting controls, drawn in Ink. */
  const subject = (part: FigureName): string => (name === part ? 'subject' : '')
</script>

{#snippet modeWindow(paper: string, panel: string, ink: string, accent: string)}
  <!-- Our own window in one mode: the bar, a sidebar of sections, rows of text. -->
  <rect x="0" y="0" width="120" height="76" fill={paper} />
  <rect x="0" y="0" width="120" height="9" fill={panel} />
  <path d="M100 4.5h3M106 4.5h3M112 4.5h3" stroke={ink} stroke-opacity="0.55" />
  <rect x="0" y="9" width="34" height="67" fill={panel} />
  <path d="M7 19h18M7 26h14M7 33h16M7 40h12" stroke={ink} stroke-opacity="0.45" />
  <rect x="5" y="22.5" width="24" height="7" rx="1.5" fill={ink} fill-opacity="0.1" />
  <path
    d="M44 20h30M44 30h52M44 36h40M44 46h48M44 52h34M44 62h44"
    stroke={ink}
    stroke-opacity="0.35"
  />
  <rect x="104" y="27" width="8" height="5" rx="1.5" fill={accent} />
  <rect
    x="104"
    y="43"
    width="8"
    height="5"
    rx="1.5"
    fill="none"
    stroke={ink}
    stroke-opacity="0.45"
  />
{/snippet}

<svg class="figure" viewBox="0 0 120 76" aria-hidden="true" data-bsc-setting-figure={name}>
  {#if name === 'mode-light' || name === 'mode-dark' || name === 'mode-system'}
    <!-- Pictures of a mode show that mode's own colours whatever the panel is in: tokens.css's
         light and dark values, the one place they are written out (DESIGN.md, "Theme pictures"). -->
    <defs>
      <clipPath id={clip}><rect x="0" y="0" width="120" height="76" rx="3" /></clipPath>
      <clipPath id={`${clip}-light`}><path d="M0 0h74L46 76H0z" /></clipPath>
    </defs>
    <g clip-path={`url(#${clip})`} stroke-width="1.6" stroke-linecap="round">
      {#if name === 'mode-dark' || name === 'mode-system'}
        {@render modeWindow('#121212', '#1c1c1c', '#f2f2f2', '#ff5500')}
      {:else}
        {@render modeWindow('#f2f2f2', '#ffffff', '#1a1a1a', '#e64d00')}
      {/if}
      {#if name === 'mode-system'}
        <!-- The dark window, with the light one laid over its left: both, as the computer says. -->
        <g clip-path={`url(#${clip}-light)`}>
          {@render modeWindow('#f2f2f2', '#ffffff', '#1a1a1a', '#e64d00')}
        </g>
      {/if}
    </g>
    <rect class="edge" x="0.5" y="0.5" width="119" height="75" rx="3" />
  {:else}
    <rect class="paper" x="0.5" y="0.5" width="119" height="75" rx="3" />

    <!-- Our bar, with its window buttons, a shade darker than SoundCloud's header under it. -->
    {#if !state.barHidden}
      <rect class={`bar ${subject('hide-bar')}`} x="1" y="1" width="118" height="8" />
      <path class="mark" d="M101 5h3M107 5h3M113 5h3" />
    {/if}

    {#if state.autoHide}
      <!-- SoundCloud's header out of sight, until the pointer touches the top edge. -->
      <rect class={`ghost ${subject('auto-hide')}`} x="1.5" y="1.5" width="117" height="8" />
      <path class={`pointer ${subject('auto-hide')}`} d="M60 15.5l-2.6-5.4 5.6 2.2-2.2.8z" />
    {:else}
      <!-- SoundCloud's header: its logo, the three links, an upsell, search, its own icons. -->
      <rect
        class={`header ${subject('auto-hide')}`}
        x="1"
        y={headerTop}
        width="118"
        height="9"
      />
      <rect class="block" x={left} y={headerTop + 2.5} width="7" height="4" rx="1" />
      {#if state.minimalNavigation}
        <path
          class={`line ${subject('minimal-nav')}`}
          d={`M${left + 12} ${headerTop + 3}h3v3h-3zM${left + 18} ${headerTop + 3}h3v3h-3zM${left + 24} ${headerTop + 3}h3v3h-3z`}
        />
      {:else}
        <path
          class={`line ${subject('minimal-nav')}`}
          d={`M${left + 12} ${headerTop + 4.5}h6M${left + 21} ${headerTop + 4.5}h5M${left + 29} ${headerTop + 4.5}h7`}
        />
        <rect
          class={`fill ${subject('minimal-nav')}`}
          x={left + 39}
          y={headerTop + 2.5}
          width="11"
          height="4"
          rx="1.5"
        />
      {/if}
      <rect class="outline" x={left + 54} y={headerTop + 2.25} width="22" height="4.5" rx="1" />
      {#if state.barHidden}
        <!-- With our bar hidden, the window buttons sit at the end of SoundCloud's header. -->
        <path
          class={`line ${subject('hide-bar')}`}
          d={`M101 ${headerTop + 4.5}h3M107 ${headerTop + 4.5}h3M113 ${headerTop + 4.5}h3`}
        />
      {:else}
        <path
          class="line"
          d={`M${right - 8} ${headerTop + 4.5}h2M${right - 3} ${headerTop + 4.5}h2`}
        />
      {/if}
      <path
        class={`line ${subject('stretch-bars')}`}
        d={`M${left} ${headerTop + 9}h${right - left}`}
      />
    {/if}

    <!-- The page keeps its own centred layout whatever the bars do. -->
    <path class="line" d="M24 25h18" />
    <rect class="block" x="24" y="29" width="14" height="14" rx="1" />
    <rect class="block" x="43" y="29" width="14" height="14" rx="1" />
    <rect class="block" x="62" y="29" width="14" height="14" rx="1" />
    <rect class="block" x="81" y="29" width="14" height="14" rx="1" />
    <path class="line" d="M24 47h10M43 47h9M62 47h11M81 47h8M24 55h16" />

    <!-- SoundCloud's player: play, the progress line, the track, and our buttons at its end. -->
    <rect class="header" x="1" y="66" width="118" height="9" />
    <path class="block-line" d={`M${left + 1} 68.5v4l3.5-2z`} />
    <path
      class={`line ${subject('stretch-bars')}`}
      d={`M${left + 9} 70.5h${right - left - 36}`}
    />
    <rect class="block" x={right - 24} y="68" width="5" height="5" rx="0.5" />
    <path class="line" d={`M${right - 17} 69.5h8M${right - 17} 72h5`} />
    {#if state.playerButtons}
      <path
        class={`line ${subject('player-buttons')}`}
        d="M103 68.5v4M108 68.5h3v4h-3zM114 72.5v-2M116 72.5v-4"
      />
    {/if}
  {/if}
</svg>

<style>
  .figure {
    display: block;
    width: 120px;
    height: 76px;
    flex: 0 0 auto;
    overflow: visible;
  }

  .paper {
    fill: var(--bsc-bg-secondary);
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
  }

  .edge {
    fill: none;
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
  }

  /* Our bar a shade darker than SoundCloud's header, so the two never read as one band. */
  .bar {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 28%, transparent);
  }

  .header {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 11%, transparent);
  }

  .block {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 24%, transparent);
  }

  .block-line,
  .fill {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 50%, transparent);
  }

  .line,
  .mark,
  .outline,
  .ghost,
  .pointer {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .line,
  .outline,
  .pointer {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 60%, transparent);
  }

  .mark {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 85%, transparent);
  }

  .ghost {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 60%, transparent);
    stroke-dasharray: 2 2;
  }

  /* What this drawing's setting controls. */
  .line.subject,
  .ghost.subject,
  .pointer.subject {
    stroke: var(--bsc-text-primary);
  }

  .bar.subject {
    fill: color-mix(in srgb, var(--bsc-text-primary) 45%, transparent);
  }

  .header.subject {
    fill: color-mix(in srgb, var(--bsc-text-primary) 22%, transparent);
  }

  .fill.subject {
    fill: var(--bsc-text-primary);
    fill-opacity: 0.6;
  }
</style>
