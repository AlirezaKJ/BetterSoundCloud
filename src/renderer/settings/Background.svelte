<script lang="ts">
  import { onMount } from 'svelte'
  import { SETTINGS } from '@shared/settings-schema'
  import type { SettingKey, Settings } from '@shared/settings-schema'
  import { backgroundSource } from '@shared/themes'
  import type { ThemeSummary } from '@shared/themes'

  /*
   * The Background group in Settings → Themes: what goes behind SoundCloud's page, and how
   * strongly. The values are ordinary settings (`appearance.background*` in the schema), drawn
   * here rather than as rows because they need a preview, a picture chooser and sliders.
   *
   * The picture never passes through this view as a file: main shows the open dialog, stores
   * the picture and answers only a small preview.
   *
   * A theme can need a background (`@background required`, Glassmorphism). While one is
   * selected, None cannot be chosen, and the choice shown as on is what is actually on the page
   * (`backgroundSource`) — the artwork — while the stored setting stays None for the next theme.
   */

  type Source = Settings['appearance.background']

  const SOURCES: readonly { value: Source; name: string; help: string }[] = [
    { value: 'none', name: 'None', help: 'SoundCloud’s page as it is.' },
    {
      value: 'artwork',
      name: 'The playing track’s artwork',
      help: 'Changes with every track; nothing shows while nothing is playing.'
    },
    {
      value: 'picture',
      name: 'A picture of your own',
      help: 'A JPEG or PNG from this computer.'
    }
  ]

  const SLIDERS = [
    { key: 'appearance.backgroundBlur', unit: 'px' },
    { key: 'appearance.backgroundStrength', unit: '%' }
  ] as const satisfies readonly { key: SettingKey; unit: string }[]

  let values = $state<Settings | null>(null)
  let themes = $state<ThemeSummary[]>([])
  /** The playing track's artwork, for the artwork tile's picture; empty while nothing plays. */
  let artwork = $state('')
  let thumbnail = $state<string | null>(null)
  let problem = $state('')
  let choosing = $state(false)
  /** The slider being dragged and its value. The setting is written when it is let go. */
  let dragging = $state<{ key: SettingKey; value: number } | null>(null)

  /** The selected theme, when it needs a background; null otherwise. */
  const needing = $derived(
    themes.find((t) => t.id === values?.['appearance.theme'] && t.needsBackground) ?? null
  )
  /** Glass is on (Windows): it is the background, so this one is not drawn (main/index.ts). */
  const glassOn = $derived(
    window.bsc.platform === 'win32' && values?.['appearance.glass'] === true
  )
  const source = $derived(
    values && !glassOn
      ? backgroundSource(values['appearance.background'], needing !== null)
      : 'none'
  )
  /** What the chosen tile does, or why None cannot be chosen, under the tiles. */
  const chosenHelp = $derived(
    needing && !glassOn
      ? `Not with ${needing.name}: the theme is made to sit on a background, so it shows the playing track’s artwork instead.`
      : (SOURCES.find((option) => option.value === source)?.help ?? '')
  )

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopSettings = window.bsc.onSettingsChanged((next) => {
      values = next
    })
    const stopThemes = window.bsc.onThemesChanged((next) => {
      themes = next
    })
    void window.bsc.getSettings().then((next) => {
      if (next as unknown) values = next
    })
    void window.bsc.listThemes().then((list) => {
      if (list as ThemeSummary[] | null) themes = list
    })
    void window.bsc.getBackgroundPicture().then((preview) => (thumbnail = preview))
    const stopPlaying = window.bsc.onNowPlaying((np) => {
      artwork = np?.artwork ?? ''
    })
    void window.bsc.getNowPlaying().then((np) => (artwork = np?.artwork ?? ''))
    return () => {
      stopSettings()
      stopThemes()
      stopPlaying()
    }
  })

  async function set(key: SettingKey, value: unknown): Promise<void> {
    const next = await window.bsc.setSetting(key, value)
    if (next as unknown) values = next
  }

  async function choosePicture(): Promise<void> {
    problem = ''
    choosing = true
    try {
      const result = await window.bsc.chooseBackgroundPicture()
      if (result.thumbnail) thumbnail = result.thumbnail
      problem = result.error
    } finally {
      choosing = false
    }
  }

  async function release(key: SettingKey, value: number): Promise<void> {
    await set(key, value)
    dragging = null
  }
</script>

{#if values}
  <h2 class="group" id="background-group" data-bsc-background-heading>Background</h2>
  <p class="intro">{SETTINGS['appearance.background'].help}</p>
  {#if glassOn}
    <p class="intro" role="status" data-bsc-background-glass>
      Off while Glass is on: the glass is the background. Turn Glass off, above, to use one.
    </p>
  {/if}

  <!-- A tile per choice: a small page with the picture blurred and faded behind it, as the
       Background draws it (the maintainer's choice, 2026-11-14). -->
  <div class="tiles" role="radiogroup" aria-labelledby="background-group" data-bsc-background>
    {#each SOURCES as option (option.value)}
      {@const unavailable = glassOn || (option.value === 'none' && needing !== null)}
      {@const image =
        option.value === 'artwork'
          ? artwork
          : option.value === 'picture'
            ? (thumbnail ?? '')
            : ''}
      <label class="tile" class:chosen={source === option.value} class:unavailable>
        <input
          type="radio"
          name="background"
          value={option.value}
          disabled={unavailable}
          checked={source === option.value}
          onchange={() => set('appearance.background', option.value)}
        />
        <span class="tile-picture">
          <span class="page" class:empty={!image && option.value !== 'none'}>
            {#if image}
              <img class="behind" src={image} alt="" referrerpolicy="no-referrer" />
            {:else if option.value !== 'none'}
              <span class="missing"
                >{option.value === 'artwork' ? 'Nothing playing' : 'No picture yet'}</span
              >
            {/if}
            <svg viewBox="0 0 120 76" aria-hidden="true">
              <rect class="bar" x="0" y="0" width="120" height="10" />
              <rect class="block" x="22" y="20" width="16" height="16" />
              <rect class="block" x="44" y="20" width="16" height="16" />
              <rect class="block" x="66" y="20" width="16" height="16" />
              <path class="line" d="M22 43h12M44 43h10M66 43h13M22 52h40M22 58h28" />
              <rect class="bar" x="0" y="66" width="120" height="10" />
            </svg>
          </span>
        </span>
        <span class="tile-name">{option.name}</span>
      </label>
    {/each}
  </div>
  {#if chosenHelp && !glassOn}<p class="intro">{chosenHelp}</p>{/if}

  <div class="chooser">
    <!-- Not while Glass is on: choosing also selects the picture, which would not show. -->
    <button type="button" disabled={choosing || glassOn} onclick={choosePicture}>
      {thumbnail ? 'Choose another picture…' : 'Choose a picture…'}
    </button>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  </div>

  {#each SLIDERS as slider (slider.key)}
    {@const def = SETTINGS[slider.key]}
    {@const shown = dragging?.key === slider.key ? dragging.value : values[slider.key]}
    <div class="slider" class:off={source === 'none'} data-bsc-setting={slider.key}>
      <div class="label">
        <label for={slider.key}>{def.label}</label>
        {#if 'help' in def && def.help}<p class="help">{def.help}</p>{/if}
      </div>
      <input
        id={slider.key}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        disabled={source === 'none'}
        value={values[slider.key]}
        style:--bsc-range-fill={`${((shown - def.min) / (def.max - def.min)) * 100}%`}
        oninput={(e) => (dragging = { key: slider.key, value: e.currentTarget.valueAsNumber })}
        onchange={(e) => release(slider.key, e.currentTarget.valueAsNumber)}
      />
      <output for={slider.key}>{shown}{slider.unit}</output>
    </div>
  {/each}
{/if}

<style>
  /* The same group heading as the theme list below it (Themes.svelte). */
  .group {
    margin: 20px 0 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--bsc-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--bsc-text-secondary);
  }

  .intro {
    margin: 8px 0 0;
    max-width: 70ch;
    font-size: 13px;
    line-height: 1.45;
    color: var(--bsc-text-secondary);
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  label {
    cursor: default;
  }

  .help,
  .problem {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* What it does: read, not glanced at, like every row's explanation in Settings (13px). */
  .help {
    max-width: 70ch;
    font-size: 13px;
    line-height: 1.45;
  }

  .problem {
    margin-top: 6px;
    color: var(--bsc-text-primary);
  }

  input:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 2px;
  }

  /* The Light or dark tiles (Settings.svelte): a picture per choice, the chosen one ringed. */
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 14px;
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
  }

  .tile.unavailable {
    cursor: not-allowed;
  }

  .tile input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .tile-picture {
    display: block;
    padding: 3px;
    border: 2px solid transparent;
    border-radius: var(--bsc-radius);
  }

  .tile:hover:not(.unavailable) .tile-picture {
    border-color: var(--bsc-border);
  }

  .tile.chosen .tile-picture {
    border-color: var(--bsc-accent);
  }

  .tile:has(input:focus-visible) .tile-picture {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 3px;
  }

  .tile.unavailable .tile-picture {
    opacity: 0.5;
  }

  .tile-name {
    padding-left: 5px;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }

  .tile.chosen .tile-name {
    color: var(--bsc-text-primary);
    font-weight: 600;
  }

  .tile.unavailable .tile-name {
    color: var(--bsc-text-disabled);
  }

  /* A small SoundCloud page, square like a print, with the picture blurred and faded behind its
     rows: what the Background does, at a glance. */
  .page {
    position: relative;
    display: block;
    width: 120px;
    height: 76px;
    overflow: hidden;
    border: 1px solid var(--bsc-border);
    background: var(--bsc-bg-secondary);
  }

  .page svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .behind {
    position: absolute;
    inset: -8px;
    width: calc(100% + 16px);
    height: calc(100% + 16px);
    object-fit: cover;
    filter: blur(5px);
    opacity: 0.6;
  }

  /* No artwork or picture to show yet: the page drawing steps back behind the words. */
  .page.empty svg {
    opacity: 0.3;
  }

  .missing {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: grid;
    place-items: center;
    padding-top: 14px;
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  .bar {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 14%, transparent);
  }

  .block {
    fill: color-mix(in srgb, var(--bsc-text-secondary) 26%, transparent);
  }

  .line {
    fill: none;
    stroke: color-mix(in srgb, var(--bsc-text-secondary) 60%, transparent);
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .chooser {
    margin-top: 12px;
    padding-bottom: 4px;
  }

  .slider {
    display: grid;
    grid-template-columns: 1fr 180px 48px;
    align-items: center;
    column-gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--bsc-border);
  }

  .slider label {
    font-size: 14px;
  }

  .slider.off label,
  .slider.off output {
    color: var(--bsc-text-disabled);
  }

  /* The slider itself is tokens.css's, one across our views. */
  input[type='range'] {
    width: 100%;
  }

  output {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--bsc-text-secondary);
  }

  /* The panel's one button style (Themes.svelte, the Go to URL prompt). */
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

  button:hover:not(:disabled) {
    background: var(--bsc-bg-hover);
  }

  button:disabled {
    color: var(--bsc-text-disabled);
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }
</style>
