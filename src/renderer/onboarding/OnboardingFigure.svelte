<script lang="ts">
  import type { OnboardingFigureName } from './onboarding-figure'

  /*
   * The welcome's line drawings, one per answer that has something to show (DESIGN.md, "Theme
   * pictures"): the same language as Settings' drawings beside its layout rows, 1.4 strokes with
   * round ends in mixes of Muted Ink, and what the answer is about in Ink. A 16:10 window, 160×100.
   *
   * One meaning for a dashed outline in every picture: nothing is there. An ad that plays or
   * shows is a solid block in Ink (a banner on SoundCloud's page, a slot between two tracks on its
   * player); a blocked one leaves its dashed outline. Glass is drawn in its own dark tint whatever
   * the panel is in, as a picture of a mode is.
   *
   * Decorative: the tile's name and line say it all, so the drawing is hidden from assistive
   * technology.
   */
  let { name }: { name: OnboardingFigureName } = $props()

  const adOnPage = $derived(name === 'ads-audio' || name === 'ads-none')
  const adOnPlayer = $derived(name === 'ads-none')
</script>

<svg class="figure" viewBox="0 0 160 100" aria-hidden="true" data-bsc-onboarding-figure={name}>
  {#if name === 'ads-audio' || name === 'ads-all' || name === 'ads-none'}
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <!-- SoundCloud's header, its tiles, a side column, its player. -->
    <rect class="band" x="1" y="1" width="158" height="11" />
    <rect class="block" x="8" y="4" width="10" height="5" rx="1" />
    <path class="line" d="M24 6.5h8M36 6.5h7M47 6.5h9" />
    <path class="line" d="M10 22h26" />
    <rect class="block" x="10" y="28" width="20" height="20" rx="1" />
    <rect class="block" x="35" y="28" width="20" height="20" rx="1" />
    <rect class="block" x="60" y="28" width="20" height="20" rx="1" />
    <rect class="block" x="85" y="28" width="20" height="20" rx="1" />
    <path class="line" d="M10 54h14M35 54h12M60 54h15M85 54h10M10 62h22M35 62h16" />
    <path class="line" d="M116 22h28M116 28h20" />
    <rect class={adOnPage ? 'ad' : 'empty'} x="116" y="36" width="34" height="34" />
    <rect class="band" x="1" y="84" width="158" height="15" />
    <path class="play" d="M8 88.5v6l5-3z" />
    <path class="line" d="M16 91.5h44M90 91.5h50" />
    <rect class={adOnPlayer ? 'ad' : 'empty'} x="64" y="88" width="22" height="7" />
  {:else if name === 'glass-off' || name === 'glass-on'}
    <!-- A desktop wallpaper, and the window over it. -->
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <path class="hill" d="M1 70 C30 50 50 58 72 46 S120 30 159 40 V99 H1z" />
    <path class="hill far" d="M1 84 C40 68 80 80 110 66 S150 60 159 64 V99 H1z" />
    <rect
      class={name === 'glass-on' ? 'glass' : 'solid'}
      x="22"
      y="12"
      width="116"
      height="74"
      rx="2"
    />
    <g class:on-glass={name === 'glass-on'}>
      <rect class="glass-bar" x="22" y="12" width="116" height="8" rx="2" />
      <path class="glass-ink" d="M30 30h30M30 38h52M30 44h40M30 54h46M30 60h34" />
      <rect class="glass-block" x="104" y="28" width="26" height="26" rx="1" />
    </g>
  {:else if name === 'discord-on' || name === 'discord-off'}
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <!-- A Discord profile: the name at the top, then what it shows. -->
    <rect class="block" x="14" y="12" width="14" height="14" rx="2" />
    <path class="line" d="M34 16h36M34 22h22" />
    {#if name === 'discord-on'}
      <rect class="card" x="14" y="34" width="132" height="54" rx="2" />
      <path class="line" d="M22 42h40" />
      <rect class="art" x="22" y="50" width="24" height="24" rx="1" />
      <path class="line strong" d="M54 55h56" />
      <path class="line" d="M54 62h36" />
      <path class="rule" d="M54 71h84" />
      <path class="line strong" d="M54 71h30" />
      <rect class="outline" x="22" y="79" width="116" height="5" rx="1" />
    {:else}
      <rect class="empty" x="14" y="34" width="132" height="54" rx="2" />
    {/if}
  {:else if name === 'start-home' || name === 'start-feed' || name === 'start-library' || name === 'start-last'}
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <!-- SoundCloud's header: Home, Feed and Library, the page it opens on in Ink. -->
    <rect class="band" x="1" y="1" width="158" height="11" />
    <rect class="block" x="8" y="4" width="10" height="5" rx="1" />
    <path class={name === 'start-home' ? 'line strong' : 'line'} d="M24 6.5h9" />
    <path class={name === 'start-feed' ? 'line strong' : 'line'} d="M38 6.5h8" />
    <path class={name === 'start-library' ? 'line strong' : 'line'} d="M51 6.5h10" />
    {#if name === 'start-home'}
      <!-- Suggestions: rows of covers. -->
      <path class="line" d="M10 22h30" />
      <rect class="block" x="10" y="28" width="24" height="24" rx="1" />
      <rect class="block" x="40" y="28" width="24" height="24" rx="1" />
      <rect class="block" x="70" y="28" width="24" height="24" rx="1" />
      <rect class="block" x="100" y="28" width="24" height="24" rx="1" />
      <path class="line" d="M10 64h26" />
      <rect class="block" x="10" y="70" width="24" height="24" rx="1" />
      <rect class="block" x="40" y="70" width="24" height="24" rx="1" />
      <rect class="block" x="70" y="70" width="24" height="24" rx="1" />
      <rect class="block" x="100" y="70" width="24" height="24" rx="1" />
    {:else if name === 'start-feed'}
      <!-- New uploads: a cover and a waveform each. -->
      {#each [20, 46, 72] as y (y)}
        <rect class="block" x="10" {y} width="20" height="20" rx="1" />
        <path class="line" d={`M36 ${y + 3}h40`} />
        <path class="wave" d={`M36 ${y + 15}h${110}`} />
      {/each}
    {:else if name === 'start-library'}
      <!-- Likes, playlists, history: tabs over a grid. -->
      <path class="line" d="M10 22h16M32 22h18M56 22h14" />
      {#each [30, 62] as y (y)}
        {#each [10, 40, 70, 100, 130] as x (x)}
          <rect class="block" {x} {y} width="22" height="22" rx="1" />
        {/each}
      {/each}
    {:else}
      <!-- A track's own page, the one last open: its cover, title and waveform. -->
      <rect class="block" x="10" y="20" width="44" height="44" rx="1" />
      <path class="line strong" d="M62 26h56" />
      <path class="line" d="M62 34h34" />
      <path class="wave" d="M62 54h86" />
      <path class="line" d="M10 76h40M10 84h28" />
    {/if}
  {:else if name === 'lastfm-on' || name === 'lastfm-off'}
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <!-- A Last.fm profile's recent tracks: a row per scrobble, or nothing. -->
    <rect class="block" x="14" y="12" width="14" height="14" rx="2" />
    <path class="line" d="M34 16h36M34 22h22" />
    {#if name === 'lastfm-on'}
      {#each [36, 50, 64, 78] as y, index (y)}
        <rect class="block" x="14" {y} width="10" height="10" rx="1" />
        <path
          class={index === 0 ? 'line strong' : 'line'}
          d={`M30 ${y + 3}h${54 - index * 6}`}
        />
        <path class="line" d={`M30 ${y + 8}h30M128 ${y + 5}h16`} />
      {/each}
    {:else}
      <rect class="empty" x="14" y="34" width="132" height="54" rx="2" />
    {/if}
  {:else}
    <!-- The desktop's taskbar, with the window closed above it. -->
    <rect class="paper" x="0.5" y="0.5" width="159" height="99" rx="3" />
    <rect class="empty" x="26" y="10" width="108" height="62" rx="2" />
    {#if name === 'close-quit'}
      <path class="line strong" d="M124 14l6 6M130 14l-6 6" />
    {/if}
    <rect class="band" x="1" y="82" width="158" height="17" />
    <rect class="block" x="10" y="86" width="9" height="9" rx="1" />
    <rect class="block" x="24" y="86" width="9" height="9" rx="1" />
    <rect class="block" x="38" y="86" width="9" height="9" rx="1" />
    {#if name === 'close-tray'}
      <rect class="tray" x="126" y="86" width="9" height="9" rx="1" />
      <path class="line strong" d="M141 93v-4M145 93v-7M149 93v-3" />
    {/if}
  {/if}
</svg>

<style>
  .figure {
    display: block;
    width: 100%;
    height: auto;
  }

  .paper {
    fill: var(--bsc-bg-secondary);
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
  }

  .band {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 11%, transparent);
  }

  .block,
  .art,
  .play {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 24%, transparent);
  }

  .card {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 7%, transparent);
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
  }

  .tray {
    fill: var(--bsc-text-primary);
  }

  .line,
  .rule,
  .outline,
  .empty {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .line,
  .outline {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 60%, transparent);
  }

  .rule {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 30%, transparent);
  }

  /* What the answer is about. */
  .line.strong {
    stroke: var(--bsc-text-primary);
  }

  /* An ad that plays or shows: a solid block in Ink. Blocked, it leaves the dashed outline. */
  .ad {
    fill: var(--bsc-text-primary);
    fill-opacity: 0.75;
    stroke: none;
  }

  /* A waveform: short bars along a line. */
  .wave {
    fill: none;
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
    stroke-width: 6;
    stroke-dasharray: 1.4 1.6;
  }

  .empty {
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 60%, transparent);
    stroke-dasharray: 3 3;
  }

  .hill {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 30%, transparent);
  }

  .hill.far {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 50%, transparent);
  }

  /* Glass in its own colours, whatever the panel is in: a dark tint that lets the desktop through,
     with the dark palette's inks on it; solid, the panel's own page colour. */
  .glass {
    fill: rgb(13 13 13 / 55%);
    stroke: rgb(255 255 255 / 18%);
  }

  .solid {
    fill: var(--bsc-bg-primary);
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 45%, transparent);
  }

  .glass-bar {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 18%, transparent);
  }

  .glass-ink {
    fill: none;
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 70%, transparent);
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .glass-block {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 28%, transparent);
  }

  /* On the glass, the dark palette's inks (DESIGN.md, "Glass is dark"). */
  .on-glass .glass-bar {
    fill: rgb(0 0 0 / 35%);
  }

  .on-glass .glass-ink {
    stroke: rgb(242 242 242 / 60%);
  }

  .on-glass .glass-block {
    fill: rgb(242 242 242 / 22%);
  }

  @media (forced-colors: active) {
    .paper,
    .card,
    .solid,
    .glass {
      fill: Canvas;
      stroke: CanvasText;
    }
  }
</style>
