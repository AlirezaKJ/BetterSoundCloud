<script lang="ts">
  import { onMount } from 'svelte'
  import type { ThemeSummary } from '@shared/themes'

  /*
   * The Themes section: every theme, built in or in the user's themes folder, and which one is
   * on. Choosing one applies it at once, to SoundCloud's page and to our own windows.
   *
   * Main owns the files (src/main/themes.ts) and re-reads them when the folder changes, so a
   * theme author sees their edits the moment they save — this view just redraws when told.
   */

  /** Means "no theme". Never a file, so nothing can shadow it. Mirrors NO_THEME in main. */
  const NONE = 'vanilla'

  let themes = $state<ThemeSummary[] | null>(null)
  let selected = $state(NONE)
  let problem = $state<{ id: string; message: string } | null>(null)

  const missing = $derived(
    themes !== null && selected !== NONE && !themes.some((t) => t.id === selected)
  )

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopThemes = window.bsc.onThemesChanged((next) => {
      themes = next
    })
    const stopSettings = window.bsc.onSettingsChanged((s) => {
      selected = s['appearance.theme']
    })
    void window.bsc.listThemes().then((list) => {
      if (list as ThemeSummary[] | null) themes = list
    })
    void window.bsc.getSettings().then((s) => {
      if (s as unknown) selected = s['appearance.theme']
    })
    return () => {
      stopThemes()
      stopSettings()
    }
  })

  async function choose(id: string): Promise<void> {
    problem = null
    selected = id
    const next = await window.bsc.setSetting('appearance.theme', id)
    if (next as unknown) selected = next['appearance.theme']
  }

  async function copy(id: string): Promise<void> {
    const { error } = await window.bsc.copyTheme(id)
    problem = error ? { id, message: error } : null
  }

  function origin(theme: ThemeSummary): string {
    if (theme.overridesBuiltIn) return 'Yours — your copy of a built-in theme'
    return theme.builtIn ? 'Built in' : 'Yours'
  }
</script>

{#if !themes}
  <p class="loading">Loading…</p>
{:else}
  <!-- Named on screen, not only for screen readers: the section's switches sit directly above,
       and without a heading the first of them reads as one more choice in this list. -->
  <h2 class="group" id="theme-group" data-bsc-themes-heading>Theme</h2>
  <div class="list" role="radiogroup" aria-labelledby="theme-group">
    <div class="row" class:selected={selected === NONE} data-bsc-theme={NONE}>
      <label for="theme-none">
        <span class="name">None</span>
        <span class="help">No theme: SoundCloud’s own look.</span>
      </label>
      <input
        id="theme-none"
        type="radio"
        name="theme"
        value={NONE}
        checked={selected === NONE}
        onchange={() => choose(NONE)}
      />
    </div>

    {#each themes as theme (theme.id)}
      {@const id = `theme-${theme.id}`}
      <div class="row" class:selected={selected === theme.id} data-bsc-theme={theme.id}>
        <label for={id}>
          <span class="name">{theme.name}</span>
          <span class="meta">
            {origin(theme)}{theme.version !== '0.0.0'
              ? ` · ${theme.version}`
              : ''}{theme.author !== 'Unknown' ? ` · ${theme.author}` : ''}
          </span>
          {#if theme.description}<span class="help">{theme.description}</span>{/if}
          {#if theme.preview.length > 0}
            <span class="swatches" aria-hidden="true">
              {#each theme.preview as colour, index (`${colour}-${index}`)}
                <span class="swatch" style:background-color={colour}></span>
              {/each}
            </span>
          {/if}
        </label>
        <input
          {id}
          type="radio"
          name="theme"
          value={theme.id}
          checked={selected === theme.id}
          onchange={() => choose(theme.id)}
        />

        {#if selected === theme.id}
          <div class="actions">
            {#if theme.builtIn}
              <button type="button" onclick={() => copy(theme.id)}>Make an editable copy</button
              >
              <p class="help">
                Copies it into your themes folder. Your copy then replaces this one, and every
                change you save shows straight away.
              </p>
            {:else}
              <button type="button" onclick={() => window.bsc.openThemeFile(theme.id)}
                >Open file</button
              >
              <p class="help">Every change you save shows straight away.</p>
            {/if}
            {#if problem?.id === theme.id}<p class="problem">{problem.message}</p>{/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if missing}
    <p class="problem standalone">
      The selected theme, “{selected}”, is no longer in your themes folder, so none is applied.
    </p>
  {/if}

  <div class="footer" data-bsc-themes-footer>
    <button type="button" onclick={() => window.bsc.openThemesFolder()}
      >Open themes folder</button
    >
    <p class="help">
      Themes are CSS: they restyle SoundCloud’s page and BetterSoundCloud’s own windows, and
      cannot run code. A theme can load pictures from the internet on SoundCloud’s page, which
      lets that site see when you use it.
    </p>
  </div>
{/if}

<style>
  /* A Label-size group heading (DESIGN.md type scale), in the secondary ink so it names the
     list without competing with the theme names in it. */
  .group {
    margin: 20px 0 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--bsc-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--bsc-text-secondary);
  }

  .loading {
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

  .meta,
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

  .problem.standalone {
    margin-top: 12px;
  }

  /*
   * The theme's own colours, as square chips behind a hairline. Square because the system has
   * two radii and neither suits a 14px chip; the hairline keeps a near-white or near-black
   * colour visible against the panel it sits on.
   */
  .swatches {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border: 1px solid var(--bsc-border);
  }

  input[type='radio'] {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--bsc-accent);
  }

  input[type='radio']:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: 2px;
  }

  .actions {
    grid-column: 1 / -1;
    margin-top: 10px;
  }

  .actions .help {
    margin-top: 6px;
    max-width: 60ch;
  }

  /* The Go to URL prompt's button, so the panel keeps a single button language. */
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

  button:hover {
    background: var(--bsc-bg-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .footer {
    padding: 16px 0 4px;
  }

  .footer .help {
    margin-top: 8px;
    max-width: 60ch;
  }
</style>
