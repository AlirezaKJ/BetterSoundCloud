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
  let thumbnail = $state<string | null>(null)
  let problem = $state('')
  let choosing = $state(false)
  /** The slider being dragged and its value. The setting is written when it is let go. */
  let dragging = $state<{ key: SettingKey; value: number } | null>(null)

  /** The selected theme, when it needs a background; null otherwise. */
  const needing = $derived(
    themes.find((t) => t.id === values?.['appearance.theme'] && t.needsBackground) ?? null
  )
  const source = $derived(
    values ? backgroundSource(values['appearance.background'], needing !== null) : 'none'
  )

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopSettings = window.bsc.onSettingsChanged((next) => (values = next))
    const stopThemes = window.bsc.onThemesChanged((next) => (themes = next))
    void window.bsc.getSettings().then((next) => {
      if (next as unknown) values = next
    })
    void window.bsc.listThemes().then((list) => {
      if (list as ThemeSummary[] | null) themes = list
    })
    void window.bsc.getBackgroundPicture().then((preview) => (thumbnail = preview))
    return () => {
      stopSettings()
      stopThemes()
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

  <div class="list" role="radiogroup" aria-labelledby="background-group" data-bsc-background>
    {#each SOURCES as option (option.value)}
      {@const id = `background-${option.value}`}
      {@const unavailable = option.value === 'none' && needing !== null}
      <div class="row" class:selected={source === option.value} class:unavailable>
        <label for={id}>
          <span class="name">{option.name}</span>
          <span class="help">
            {unavailable
              ? `Not with ${needing?.name}: the theme is made to sit on a background, so it shows the playing track’s artwork instead.`
              : option.help}
          </span>
        </label>
        <input
          {id}
          type="radio"
          name="background"
          value={option.value}
          disabled={unavailable}
          checked={source === option.value}
          onchange={() => set('appearance.background', option.value)}
        />

        {#if option.value === 'picture'}
          <div class="picture">
            {#if thumbnail}
              <img src={thumbnail} alt="Your background" />
            {/if}
            <div>
              <button type="button" disabled={choosing} onclick={choosePicture}>
                {thumbnail ? 'Choose another picture…' : 'Choose a picture…'}
              </button>
              {#if !thumbnail}<p class="help">No picture chosen yet.</p>{/if}
              {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#each SLIDERS as slider (slider.key)}
    {@const def = SETTINGS[slider.key]}
    {@const shown = dragging?.key === slider.key ? dragging.value : values[slider.key]}
    <div class="slider" class:off={source === 'none'}>
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
    max-width: 60ch;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--bsc-border);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    cursor: default;
  }

  .name {
    font-size: 14px;
  }

  /* Weight, not colour, carries selection — the settings rail's rule. The radio carries the accent. */
  .row.selected .name {
    font-weight: 600;
  }

  .row.unavailable .name {
    color: var(--bsc-text-disabled);
  }

  .help,
  .problem {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .problem {
    margin-top: 6px;
    color: var(--bsc-text-primary);
  }

  input[type='radio'] {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--bsc-accent);
  }

  input:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: 2px;
  }

  .picture {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 10px;
  }

  .picture .help {
    margin-top: 6px;
  }

  /* A control-radius preview behind a hairline, so a very dark or very light picture still has
     an edge against the panel. */
  img {
    width: 120px;
    height: 68px;
    object-fit: cover;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
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

  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--bsc-accent);
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
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }
</style>
