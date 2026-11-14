<script lang="ts">
  import { onMount } from 'svelte'
  import type { ThemeSummary } from '@shared/themes'

  /*
   * The Themes section's gallery: every theme, built in or in the user's themes folder, as a
   * picture of SoundCloud wearing it (the maintainer's choice, 2026-11-14), and which one is on.
   * Choosing one applies it at once, to SoundCloud's page and to our own windows.
   *
   * Main owns the files (src/main/themes.ts) and re-reads them when the folder changes, so a
   * theme author sees their edits the moment they save — this view just redraws when told. The
   * pictures are main's too (src/main/theme-pictures.ts): shipped for the built-in themes, then
   * the user's own page once a theme has been on, pushed here as each is taken. A theme with no
   * picture yet shows its own colours instead.
   */

  /** Means "no theme". Never a file, so nothing can shadow it. Mirrors NO_THEME in main. */
  const NONE = 'vanilla'

  let themes = $state<ThemeSummary[] | null>(null)
  let pictures = $state<Record<string, string>>({})
  let selected = $state(NONE)
  let problem = $state<{ id: string; message: string } | null>(null)

  const missing = $derived(
    themes !== null && selected !== NONE && !themes.some((t) => t.id === selected)
  )
  const chosen = $derived(themes?.find((t) => t.id === selected) ?? null)

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopThemes = window.bsc.onThemesChanged((next) => {
      themes = next
    })
    const stopPictures = window.bsc.onThemePicturesChanged((next) => {
      pictures = next
    })
    const stopSettings = window.bsc.onSettingsChanged((s) => {
      selected = s['appearance.theme']
    })
    void window.bsc.listThemes().then((list) => {
      if (list as ThemeSummary[] | null) themes = list
    })
    void window.bsc.getThemePictures().then((next) => {
      if (next as Record<string, string> | null) pictures = next
    })
    void window.bsc.getSettings().then((s) => {
      if (s as unknown) selected = s['appearance.theme']
    })
    return () => {
      stopThemes()
      stopPictures()
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

  function meta(theme: ThemeSummary): string {
    const version = theme.version !== '0.0.0' ? ` · ${theme.version}` : ''
    const author = theme.author !== 'Unknown' ? ` · ${theme.author}` : ''
    return `${origin(theme)}${version}${author}`
  }
</script>

<!-- One card: the theme's picture (or its colours), its name, where it comes from. -->
{#snippet card(
  id: string,
  name: string,
  line: string,
  description: string,
  colours: readonly string[]
)}
  <label class="card" class:chosen={selected === id} data-bsc-theme={id}>
    <input
      type="radio"
      name="theme"
      value={id}
      checked={selected === id}
      onchange={() => choose(id)}
    />
    <span class="picture">
      {#if pictures[id]}
        <img src={pictures[id]} alt="" />
      {:else if colours.length > 0}
        <!-- No picture yet: the theme's own colours, in bands, until it has been on. -->
        <span class="bands">
          {#each colours as colour, index (`${colour}-${index}`)}
            <span style:background-color={colour}></span>
          {/each}
          <span class="band-note">No picture yet</span>
        </span>
      {:else}
        <span class="blank" aria-hidden="true">No picture yet</span>
      {/if}
    </span>
    <span class="name">{name}</span>
    <span class="meta">{line}</span>
    {#if description}<span class="description">{description}</span>{/if}
  </label>
{/snippet}

{#if !themes}
  <p class="loading">Loading…</p>
{:else}
  <!-- The page's title already says Themes: the gallery is named for screen readers only. -->
  <div class="gallery" role="radiogroup" aria-label="Theme" data-bsc-theme-list>
    {@render card(NONE, 'None', 'SoundCloud’s own look', '', [])}
    {#each themes as theme (theme.id)}
      {@render card(theme.id, theme.name, meta(theme), theme.description, theme.preview)}
    {/each}
  </div>

  {#if missing}
    <p class="problem">
      The selected theme, “{selected}”, is no longer in your themes folder, so none is applied.
    </p>
  {/if}

  <!-- The chosen theme's one action, under the gallery so every card stays the same height. -->
  {#if chosen}
    <div class="chosen-row" data-bsc-theme-actions>
      {#if chosen.builtIn}
        <button type="button" onclick={() => copy(chosen.id)}>Make an editable copy</button>
        <p class="help">
          Copies {chosen.name} into your themes folder. Your copy then replaces it, and every change
          you save shows straight away.
        </p>
      {:else}
        <button type="button" onclick={() => window.bsc.openThemeFile(chosen.id)}
          >Open {chosen.name}’s file</button
        >
        <p class="help">Every change you save shows straight away.</p>
      {/if}
      {#if problem?.id === chosen.id}<p class="problem">{problem.message}</p>{/if}
    </div>
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
  .loading {
    color: var(--bsc-text-secondary);
  }

  /* As many cards to a row as fit at about 200px, two in the narrowest window. */
  /* Two to a row in the 720px column: a picture of the whole window needs the room to be read. */
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 18px 14px;
    padding: 10px 0 4px;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    cursor: pointer;
  }

  /* The radio stays for the keyboard and screen readers (arrow keys move through the gallery);
     the picture's ring shows which is on. */
  .card input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* The Light or dark tiles' frame: a 2px ring with 3px of air, the accent on the chosen one. */
  .picture {
    display: block;
    margin-bottom: 6px;
    padding: 3px;
    border: 2px solid transparent;
    border-radius: var(--bsc-radius);
  }

  .card:hover .picture {
    border-color: var(--bsc-border);
  }

  .card.chosen .picture {
    border-color: var(--bsc-accent);
  }

  /* Clear of the chosen ring, so the keyboard's place and the choice read as two things. */
  .card:has(input:focus-visible) .picture {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 4px;
  }

  /* The window's own shape: a picture is the whole window (main/theme-pictures.ts), and the
     shipped ones are full-screen 1920×1080 screenshots, 16:9. */
  .picture img,
  .bands,
  .blank {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    /* Square, like the showcase's sleeve: a picture of a page is a print, and has no corners. */
    border: 1px solid var(--bsc-border);
  }

  /* A window of another shape loses its edges, never its top: our bar and SoundCloud's header. */
  .picture img {
    object-fit: cover;
    object-position: top center;
  }

  .bands {
    display: flex;
    overflow: hidden;
  }

  .bands {
    position: relative;
  }

  .bands span {
    flex: 1;
  }

  /* Says the colours stand in for a picture, until the theme has been on. */
  .bands .band-note {
    position: absolute;
    bottom: 6px;
    left: 6px;
    flex: none;
    padding: 2px 6px;
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--bsc-bg-secondary);
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  .name {
    padding: 0 5px;
    font-size: 14px;
  }

  /* Weight, not colour, carries selection — the sidebar's rule. The ring carries the accent. */
  .card.chosen .name {
    font-weight: 600;
  }

  .meta,
  .description {
    padding: 0 5px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* Whole, never cut off: a theme says what it is in a sentence or two. */
  .description {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.45;
  }

  .help,
  .problem {
    max-width: 70ch;
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--bsc-text-secondary);
  }

  .problem {
    margin-top: 12px;
    color: var(--bsc-text-primary);
  }

  .chosen-row {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--bsc-border);
  }

  .chosen-row .help {
    margin-top: 8px;
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
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .footer {
    padding: 16px 0 4px;
  }

  .footer .help {
    margin-top: 8px;
  }
</style>
