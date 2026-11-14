<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { fade } from 'svelte/transition'
  import {
    SECTIONS,
    SECTION_LABELS,
    SETTINGS,
    SETTING_KEYS,
    APPLIES_NOTES
  } from '@shared/settings-schema'
  import type { Section, SettingDef, SettingKey, Settings } from '@shared/settings-schema'
  import { attributeSelector, OTHER_ENTRIES, searchSettings } from '@shared/settings-search'
  import type { SearchEntry, SearchHit } from '@shared/settings-search'
  import type { ThemeSummary } from '@shared/themes'
  import type { PluginView } from '@shared/plugins'
  import DiscordStatus from './DiscordStatus.svelte'
  import UpdateStatus from './UpdateStatus.svelte'
  import GlassStatus from './GlassStatus.svelte'
  import Plugins from './Plugins.svelte'
  import Themes from './Themes.svelte'
  import Background from './Background.svelte'
  import Reset from './Reset.svelte'
  import BrowserSession from './BrowserSession.svelte'

  /*
   * Settings is a page that stands in for SoundCloud's while it is open: everything below our bar,
   * a sidebar of sections, and one column of rows you can read. Main brings our bar back while it
   * is open, so the window can always be moved and closed and the gear closes it again.
   *
   * The rows are generated from the schema. Adding a setting means adding one entry to
   * src/shared/settings-schema.ts and nothing else — no markup, no getter, no setter, no
   * listener. v0.7.x needed all four, in four different files, and they drifted apart. There are
   * four write handlers here, one per `kind`, rather than one per setting. That ratio is the point.
   *
   * Closing is a two-step dance. The page lives in its own transparent WebContentsView, and main
   * destroys that view — but if it destroyed it the moment the user pressed Escape, the fade out
   * would never be seen. So Escape and the close button only set `open = false`; when the outro
   * transition ends we tell main to destroy the view.
   */

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const DURATION = REDUCED_MOTION ? 0 : 180
  const SEARCH_KEY = window.bsc.platform === 'darwin' ? '⌘F' : 'Ctrl+F'
  const REPOSITORY = 'https://github.com/AlirezaKJ/BetterSoundCloud'

  let open = $state(false)
  let values = $state<Settings | null>(null)
  let active = $state<Section>('general')
  /** Started with `--safe-mode`: some settings below are not in force, so the panel says so. */
  let safeMode = $state(false)
  /** "Continue without Widevine" was pressed at startup: protected tracks skip until a restart. */
  let withoutWidevine = $state(false)
  /** The version running, for the foot of the sidebar. Empty until the updater answers. */
  let version = $state('')

  let query = $state('')
  /** Themes and plugins are found on disk, so search reads them when a search starts. */
  let themes = $state<readonly ThemeSummary[]>([])
  let plugins = $state<readonly PluginView[]>([])
  /** The column has scrolled under the title, which then gets a hairline to sit on. */
  let scrolled = $state(false)
  /** A slider being dragged: its value shows beside it, and is stored when it is let go. */
  let sliding = $state<{ key: SettingKey; value: number } | null>(null)

  let searchField = $state<HTMLInputElement | null>(null)
  let scroller = $state<HTMLElement | null>(null)
  let results = $state<HTMLElement | null>(null)

  /** A setting that can do something here: no `platforms` list, or one naming this platform. */
  const onThisPlatform = (key: SettingKey): boolean => {
    const def = SETTINGS[key]
    return !('platforms' in def) || def.platforms.some((p) => p === window.bsc.platform)
  }

  const keysIn = (section: Section): SettingKey[] =>
    SETTING_KEYS.filter((k) => SETTINGS[k].section === section && onThisPlatform(k))

  /** Drawn by its own component (`drawnBy` in the schema), so it gets no ordinary row. */
  const drawnElsewhere = (key: SettingKey): boolean => 'drawnBy' in SETTINGS[key]

  /** How a dropdown option reads: its label from the schema, which every drawn option has. */
  const optionLabel = (key: SettingKey, option: string): string => {
    const def: SettingDef = SETTINGS[key]
    return (def.kind === 'enum' && def.labels?.[option]) || option
  }

  /** Where search lands for a setting: its own row, or the group its component draws. */
  const settingTarget = (key: SettingKey): string => {
    if (key === 'appearance.background') return '[data-bsc-background]'
    if (key === 'appearance.theme') return '[data-bsc-theme-list]'
    return attributeSelector('data-bsc-setting', key)
  }

  const entries = $derived<SearchEntry[]>([
    ...SECTIONS.flatMap((section) =>
      keysIn(section).map((key) => {
        const def: SettingDef = SETTINGS[key]
        return { section, name: def.label, text: def.help ?? '', target: settingTarget(key) }
      })
    ),
    ...themes.map((theme) => ({
      section: 'themes' as const,
      name: theme.name,
      text: theme.description,
      target: attributeSelector('data-bsc-theme', theme.id)
    })),
    ...plugins.map((plugin) => ({
      section: 'plugins' as const,
      name: plugin.name,
      text: plugin.description,
      target: attributeSelector('data-bsc-plugin', plugin.id)
    })),
    // A plugin's own settings are drawn only while it is on (Plugins.svelte), so a match lands on
    // the setting then, and on the plugin's switch otherwise, saying so.
    ...plugins.flatMap((plugin) =>
      plugin.settings.map(({ setting }) => {
        const row = attributeSelector('data-bsc-plugin', plugin.id)
        return {
          section: 'plugins' as const,
          name: `${plugin.name}: ${setting.label}`,
          text: plugin.enabled
            ? setting.help
            : [setting.help, `Shown once ${plugin.name} is on.`].filter(Boolean).join(' '),
          target: plugin.enabled
            ? `${row} ${attributeSelector('data-bsc-plugin-setting', setting.key)}`
            : row
        }
      })
    ),
    ...OTHER_ENTRIES
  ])

  const searching = $derived(query.trim() !== '')
  const groups = $derived(searchSettings(entries, query))
  const matchCount = $derived(groups.reduce((count, group) => count + group.hits.length, 0))

  onMount(() => {
    open = true

    // Escape is registered first, deliberately: if loading settings ever fails, the page must
    // still be dismissable rather than trapping the user. The row confirmations (Plugins, Reset)
    // stop their own Escape, so it closes them and only them.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // A search is cleared first, so a second Escape closes Settings.
        if (searching) clearSearch()
        else requestClose()
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchField?.focus()
        searchField?.select()
      }
    }
    window.addEventListener('keydown', onKey)

    void window.bsc.getSettings().then((s) => (values = s))
    void window.bsc.getSafeMode().then((on) => (safeMode = on))
    void window.bsc.getWidevineSkipped().then((skipped) => (withoutWidevine = skipped))
    void window.bsc.getUpdateStatus().then((status) => (version = status.current))
    const stopWatching = window.bsc.onSettingsChanged((s) => {
      values = s
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      stopWatching()
    }
  })

  let destroyRequested = false

  /** Start the fade out. The view itself is destroyed later, in `destroyView`. */
  function requestClose(): void {
    if (!open) return
    open = false
    // `onoutroend` normally does this when the fade finishes. This backstop covers the case
    // where that event never arrives — a settings page that cannot be closed is far worse than
    // one that closes without fading.
    setTimeout(destroyView, DURATION + 100)
  }

  /** Idempotent: both the transition end and the backstop timer call it. */
  function destroyView(): void {
    if (destroyRequested) return
    destroyRequested = true
    window.bsc.closeSettings()
  }

  async function update(key: SettingKey, value: unknown): Promise<void> {
    // Main re-validates and returns the authoritative snapshot; we never assume our
    // local write was accepted verbatim (a number outside its bounds comes back clamped).
    values = await window.bsc.setSetting(key, value)
  }

  function toTop(): void {
    if (scroller) scroller.scrollTop = 0
  }

  function showSection(section: Section): void {
    query = ''
    active = section
    toTop()
  }

  function onSearchInput(text: string): void {
    // Read the themes and plugins as a search starts, so one added a moment ago is found.
    if (!searching && text.trim() !== '') {
      void window.bsc.listThemes().then((list) => (themes = list))
      void window.bsc.listPlugins().then((list) => (plugins = list))
    }
    query = text
    toTop()
  }

  function clearSearch(): void {
    query = ''
    toTop()
    searchField?.focus()
  }

  /** The element `selector` names, once the section showing has drawn it (its lists load late). */
  function rowFor(selector: string): Promise<HTMLElement | null> {
    const root = scroller
    if (!root) return Promise.resolve(null)
    const find = (): HTMLElement | null => root.querySelector<HTMLElement>(selector)
    const found = find()
    if (found) return Promise.resolve(found)
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const row = find()
        if (row) done(row)
      })
      const timer = setTimeout(() => done(null), 2000)
      function done(row: HTMLElement | null): void {
        observer.disconnect()
        clearTimeout(timer)
        resolve(row)
      }
      observer.observe(root, { childList: true, subtree: true })
    })
  }

  /** Open the match's section and land on its row, with the keyboard on its control. */
  async function go(hit: SearchHit): Promise<void> {
    showSection(hit.entry.section)
    await tick()
    const row = await rowFor(hit.entry.target)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    // A radio group's chosen option, as Tab would land; otherwise the row's first control.
    const control =
      row.querySelector<HTMLElement>('input:checked:not(:disabled)') ??
      row.querySelector<HTMLElement>(
        'input:not(:disabled), select:not(:disabled), button:not(:disabled)'
      )
    if (control) {
      control.focus({ focusVisible: true } as FocusOptions)
      return
    }
    // Nothing to press here right now (a slider is disabled while there is no background, say):
    // land on the row itself, ringed, so the keyboard and a screen reader are where the eye is.
    row.tabIndex = -1
    row.dataset.bscLanded = ''
    row.addEventListener('blur', () => delete row.dataset.bscLanded, { once: true })
    row.focus({ focusVisible: true } as FocusOptions)
  }

  function hitButtons(): HTMLButtonElement[] {
    return Array.from(
      results?.querySelectorAll<HTMLButtonElement>('[data-bsc-settings-hit]') ?? []
    )
  }

  function onSearchKey(e: KeyboardEvent): void {
    const first = groups[0]?.hits[0]
    if (e.key === 'Enter' && first) {
      e.preventDefault()
      void go(first)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      hitButtons()[0]?.focus()
    }
  }

  /** Up and down move through the matches; up from the first goes back to the field. */
  function onHitKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = hitButtons()
    const at = buttons.indexOf(e.currentTarget as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? at + 1 : at - 1
    if (next < 0) searchField?.focus()
    else buttons[Math.min(next, buttons.length - 1)]?.focus()
  }
</script>

<!-- One setting's row, shared by the schema-driven sections and the Themes section. -->
{#snippet settingRow(key: SettingKey)}
  {#if values}
    {@const def = SETTINGS[key]}
    <!-- `as const` narrows each entry to its literal shape, so entries that are
         wired have no `wired` property at all — hence the `in` guard. -->
    {@const pending = 'wired' in def && def.wired === false}
    <div class="row" class:pending data-bsc-setting={key}>
      <div class="label">
        <label for={key}>{def.label}</label>
        {#if 'help' in def && def.help}<p class="help">{def.help}</p>{/if}
        <!--
          Honesty about what does not exist yet. The schema is written ahead of the
          features, so without this the panel would offer controls that silently do
          nothing — and every one would become a bug report.
        -->
        {#if pending}<p class="pending-note">Not implemented yet</p>{/if}
        <!--
          Timing, for the few settings whose effect is not immediate. A caption rather
          than a second badge: DESIGN.md reserves the Overline treatment for the
          "not implemented yet" badge alone.
        -->
        {#if 'applies' in def && def.applies}
          <p class="note">{APPLIES_NOTES[def.applies]}</p>
        {/if}
        <!--
          Whether the feature behind the control is working right now, for the settings
          whose answer can change on its own — Discord being opened or closed, say.
        -->
        {#if 'statusFrom' in def && def.statusFrom === 'discord'}<DiscordStatus />{/if}
        {#if 'statusFrom' in def && def.statusFrom === 'updates'}<UpdateStatus />{/if}
        {#if 'statusFrom' in def && def.statusFrom === 'glass'}<GlassStatus />{/if}
      </div>

      <div class="control">
        {#if def.kind === 'boolean'}
          <input
            id={key}
            type="checkbox"
            disabled={pending}
            checked={!pending && (values[key] as boolean)}
            onchange={(e) => update(key, e.currentTarget.checked)}
          />
        {:else if def.kind === 'number' && 'slider' in def && def.slider}
          <!-- The Background's slider, so the two in the Themes section look and work alike. -->
          <input
            id={key}
            type="range"
            class="slider"
            disabled={pending}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={values[key] as number}
            oninput={(e) => (sliding = { key, value: e.currentTarget.valueAsNumber })}
            onchange={async (e) => {
              await update(key, e.currentTarget.valueAsNumber)
              sliding = null
            }}
          />
          <output for={key}
            >{sliding?.key === key ? sliding.value : values[key]}{'unit' in def
              ? def.unit
              : ''}</output
          >
        {:else if def.kind === 'number'}
          <input
            id={key}
            type="number"
            disabled={pending}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={values[key] as number}
            onchange={(e) => update(key, e.currentTarget.valueAsNumber)}
          />
          {#if 'unit' in def && def.unit}<span class="unit" aria-hidden="true">{def.unit}</span
            >{/if}
        {:else if def.kind === 'enum'}
          <select
            id={key}
            disabled={pending}
            value={values[key] as string}
            onchange={(e) => update(key, e.currentTarget.value)}
          >
            {#each def.options as option (option)}
              <option value={option}>{optionLabel(key, option)}</option>
            {/each}
          </select>
        {:else}
          <input
            id={key}
            type="text"
            disabled={pending}
            value={values[key] as string}
            onchange={(e) => update(key, e.currentTarget.value)}
          />
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<!-- A run of text with the searched-for words in bold. -->
{#snippet marked(parts: SearchHit['name'])}
  {#each parts as part, i (i)}{#if part.match}<strong>{part.text}</strong
      >{:else}{part.text}{/if}{/each}
{/snippet}

{#if open}
  <div
    class="page"
    data-bsc-settings-panel
    transition:fade={{ duration: DURATION }}
    onoutroend={destroyView}
  >
    <div class="sidebar">
      <div class="find" role="search" data-bsc-settings-search>
        <svg class="find-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 4.5 4.5" />
        </svg>
        <!-- While searching, F6 into Settings comes back here rather than to a section. -->
        <input
          bind:this={searchField}
          type="search"
          placeholder="Search settings"
          aria-label="Search settings"
          aria-keyshortcuts={window.bsc.platform === 'darwin' ? 'Meta+F' : 'Control+F'}
          spellcheck="false"
          autocomplete="off"
          data-bsc-focus-first={searching ? '' : undefined}
          value={query}
          oninput={(e) => onSearchInput(e.currentTarget.value)}
          onkeydown={onSearchKey}
        />
        {#if searching}
          <button
            class="clear"
            aria-label="Clear search"
            title="Clear search (Esc)"
            onclick={clearSearch}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" /></svg>
          </button>
        {:else}
          <kbd class="find-key" aria-hidden="true">{SEARCH_KEY}</kbd>
        {/if}
      </div>

      <nav aria-label="Settings sections" data-bsc-settings-nav>
        {#each SECTIONS as section (section)}
          <!-- F6 into Settings lands on the section showing. -->
          <button
            class:active={!searching && active === section}
            aria-current={!searching && active === section ? 'page' : undefined}
            data-bsc-focus-first={!searching && active === section ? '' : undefined}
            onclick={() => showSection(section)}
          >
            {SECTION_LABELS[section]}
          </button>
        {/each}
      </nav>

      <div class="about" data-bsc-settings-about>
        <p>
          BetterSoundCloud{#if version}&nbsp;<span class="version">{version}</span>{/if}
        </p>
        <p>
          <a href={REPOSITORY} target="_blank" rel="noreferrer">GitHub</a>
          <span aria-hidden="true">·</span>
          <a href={`${REPOSITORY}/issues`} target="_blank" rel="noreferrer">Report a problem</a>
        </p>
      </div>
    </div>

    <div class="content">
      <header class:scrolled data-bsc-settings-title>
        <h1 id="settings-heading">{searching ? 'Search' : SECTION_LABELS[active]}</h1>
        <button
          class="close"
          title="Close (Esc)"
          aria-label="Close settings"
          onclick={requestClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      </header>

      <main
        bind:this={scroller}
        aria-labelledby="settings-heading"
        data-bsc-settings-content
        onscroll={(e) => (scrolled = e.currentTarget.scrollTop > 0)}
      >
        <div class="column">
          {#if safeMode}
            <!-- On every section, because the settings it overrides live in three of them. -->
            <div class="notice" role="status" data-bsc-settings-safe-mode>
              <p>
                <strong>Safe mode is on.</strong> Hardware acceleration, ad blocking and your theme
                are off for this launch, whatever the settings below say. Nothing has been changed:
                quit and start BetterSoundCloud normally to use them again.
              </p>
            </div>
          {/if}
          {#if withoutWidevine}
            <!-- So a track that greys out and skips now reads as expected, not as the old bug. -->
            <div class="notice" role="status" data-bsc-settings-without-widevine>
              <p>
                <strong>Protected tracks won’t play yet.</strong> Widevine couldn’t be downloaded
                at startup; BetterSoundCloud keeps trying, and restarting it tries straight away.
              </p>
            </div>
          {/if}

          {#if searching}
            <div class="results" bind:this={results}>
              {#if matchCount === 0}
                <div class="empty" role="status">
                  <p class="empty-lead">Nothing matches “{query.trim()}”.</p>
                  <p class="help">
                    Search looks through the name and explanation of every setting, and your
                    themes and plugins. Try a single word, such as “tray” or “theme”.
                  </p>
                </div>
              {:else}
                <p class="count" role="status">
                  {matchCount === 1 ? '1 match' : `${matchCount} matches`}
                </p>
                {#each groups as group (group.section)}
                  <h2 class="group">{SECTION_LABELS[group.section]}</h2>
                  {#each group.hits as hit (`${hit.entry.target} ${hit.entry.name}`)}
                    <button
                      class="hit"
                      data-bsc-settings-hit
                      onclick={() => go(hit)}
                      onkeydown={onHitKey}
                    >
                      <span class="hit-name">{@render marked(hit.name)}</span>
                      {#if hit.entry.text}
                        <span class="hit-text">{@render marked(hit.text)}</span>
                      {/if}
                      <svg viewBox="0 0 24 24" aria-hidden="true"
                        ><path d="m10 7 5 5-5 5" /></svg
                      >
                    </button>
                  {/each}
                {/each}
              {/if}
            </div>
          {:else if active === 'plugins'}
            <!-- Not schema-driven: plugins are found on disk, so their rows are too. -->
            <Plugins />
          {:else if active === 'themes'}
            <!-- The section's main choice first (the maintainer's, 2026-11-14): the themes, which
                 are files with descriptions and swatches (Themes.svelte). Then the switches that
                 work with any theme: Minimal navigation, and Glass with its tint on Windows, right
                 above the Background it takes the place of (Background.svelte, a preview and
                 sliders). Settings with `drawnBy` belong to those two components, so they get no
                 row here. -->
            <Themes />
            {#if values}
              <h2 class="group" data-bsc-settings-group="any-theme">With every theme</h2>
              {#each keysIn('themes').filter((k) => !drawnElsewhere(k)) as key (key)}
                {@render settingRow(key)}
              {/each}
            {/if}
            <Background />
          {:else if !values}
            <p class="loading">Loading…</p>
          {:else}
            {#each keysIn(active).filter((k) => !drawnElsewhere(k)) as key (key)}
              {@render settingRow(key)}
            {/each}
            {#if active === 'advanced'}
              <BrowserSession />
              <!-- Reset settings, and clear SoundCloud's data: buttons that ask first, not settings. -->
              <Reset />
            {/if}
            {#if active === 'shortcuts'}
              <!-- Keys built into the window (main/focus-cycle.ts). Not settings, so not schema
                   rows, but listed where people look for keys. -->
              <div class="row" data-bsc-settings-key="next-part">
                <div class="label">
                  <p class="name">Move focus to the next part of the window</p>
                  <p class="help">
                    From the top bar to SoundCloud’s page, then the lyrics pane and the player
                    buttons when they’re open. With Settings open, between Settings and the top
                    bar.
                  </p>
                </div>
                <div class="control"><kbd>F6</kbd></div>
              </div>
              <div class="row" data-bsc-settings-key="previous-part">
                <div class="label"><p class="name">Move focus back</p></div>
                <div class="control keys"><kbd>Shift</kbd> <kbd>F6</kbd></div>
              </div>
            {/if}
          {/if}
        </div>
      </main>
    </div>
  </div>
{/if}

<style>
  /*
   * The view is transparent so the page can fade in over SoundCloud; the page itself is opaque.
   */
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    background: var(--bsc-bg-primary);
    color: var(--bsc-text-primary);
  }

  .page ::selection {
    background: color-mix(in srgb, var(--bsc-accent) 30%, transparent);
  }

  /* ── The sidebar: search, the sections, and what is running ─────────────────────────── */

  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--bsc-border);
  }

  /* As tall as the title row beside it, so the field and the title share a centre line. */
  .find {
    position: relative;
    display: flex;
    align-items: center;
    height: 56px;
    padding: 0 12px;
  }

  .find input {
    width: 100%;
    height: 30px;
    padding: 0 30px 0 30px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    caret-color: var(--bsc-accent);
  }

  /* Our own clear button, in the system's icon language, instead of Chromium's blue cross. */
  .find input::-webkit-search-cancel-button {
    appearance: none;
  }

  .find input::placeholder {
    color: var(--bsc-text-secondary);
  }

  .find-icon,
  .clear svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .find-icon {
    position: absolute;
    left: 21px;
    color: var(--bsc-text-secondary);
    pointer-events: none;
  }

  .clear {
    position: absolute;
    right: 16px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-secondary);
    cursor: pointer;
  }

  .clear:hover {
    background: var(--bsc-bg-hover);
    color: var(--bsc-text-primary);
  }

  /* The shortcut, shown in the empty field and gone once it has focus or text. */
  .find-key {
    position: absolute;
    right: 18px;
    pointer-events: none;
  }

  .find:focus-within .find-key {
    display: none;
  }

  nav {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 12px 12px;
    overflow-y: auto;
  }

  nav button {
    flex: 0 0 auto;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-secondary);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  nav button:hover {
    background: var(--bsc-bg-hover);
  }

  nav button.active {
    background: var(--bsc-bg-hover);
    color: var(--bsc-text-primary);
    font-weight: 600;
  }

  .about {
    padding: 12px 22px 14px;
    border-top: 1px solid var(--bsc-border);
    font-size: 12px;
    line-height: 1.6;
    color: var(--bsc-text-secondary);
  }

  .about p {
    margin: 0;
  }

  .version {
    font-variant-numeric: tabular-nums;
  }

  /* Links that look like links at rest: a quiet underline, full ink on hover. */
  .about a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentcolor 45%, transparent);
    text-underline-offset: 2px;
  }

  .about a:hover {
    color: var(--bsc-text-primary);
    text-decoration-color: currentcolor;
  }

  /* ── The content: the section's title, then its rows ──────────────────────────────── */

  .content {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* Stays put while the rows scroll, with a hairline under it once they pass beneath. */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 56px;
    padding: 0 14px 0 40px;
    border-bottom: 1px solid transparent;
  }

  header.scrolled {
    border-bottom-color: var(--bsc-border);
  }

  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-secondary);
    cursor: pointer;
  }

  .close:hover {
    background: var(--bsc-danger);
    color: #fff;
  }

  .close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  main {
    overflow-y: auto;
    padding: 0 40px 56px;
  }

  /* One column you can read: a control never ends up a screen away from its name. */
  .column {
    max-width: 720px;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    padding: 14px 0;
    border-bottom: 1px solid var(--bsc-border);
  }

  .row:last-child {
    border-bottom: 0;
  }

  .label {
    flex: 1;
    min-width: 0;
  }

  label,
  .name {
    font-size: 14px;
    line-height: 1.4;
  }

  .name {
    margin: 0;
  }

  /* What the setting does: read, not glanced at, so 13px rather than the caption's 12. */
  .help {
    max-width: 70ch;
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--bsc-text-secondary);
  }

  /* When it takes effect: a caption under the explanation. */
  .note {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .row.pending label {
    color: var(--bsc-text-disabled);
  }

  .pending-note {
    margin: 6px 0 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--bsc-text-disabled);
  }

  /* A row of its own, so no space character sits between a field and its unit. */
  .control {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    padding-top: 1px;
  }

  .control :disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input[type='number'],
  input[type='text'],
  select {
    min-width: 140px;
    padding: 6px 8px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
  }

  /* A slider setting: Background.svelte's slider, so the two read as one control. */
  .control input[type='range'] {
    width: 180px;
    margin: 0;
    accent-color: var(--bsc-accent);
  }

  .control output {
    width: 48px;
    margin-left: 12px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--bsc-text-secondary);
  }

  /* What a number counts, beside its field, like the Background sliders' values. The field gives
     up the unit's room, so the control is still 140px and lines up with the dropdowns. */
  input[type='number']:has(+ .unit) {
    min-width: 120px;
    width: 120px;
  }

  .unit {
    display: inline-block;
    width: 14px;
    margin-left: 6px;
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--bsc-accent);
  }

  /* A key, as printed on it: a field's surface and hairline, in the system font like the rest. */
  kbd {
    display: inline-block;
    min-width: 26px;
    padding: 2px 6px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
  }

  .find-key {
    min-width: 0;
    padding: 0 5px;
    color: var(--bsc-text-secondary);
  }

  .keys {
    display: flex;
    gap: 4px;
  }

  /* A launch notice (DESIGN.md): the status line's shape, the state in Ink at 600, the rest in
     Muted Ink. */
  .notice {
    margin: 0;
    padding: 0 0 12px;
    border-bottom: 1px solid var(--bsc-border);
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* Both at once (safe mode, and no Widevine): one hairline between them, as between rows. */
  .notice + .notice {
    padding-top: 12px;
  }

  .notice p {
    max-width: 80ch;
    margin: 0;
  }

  .notice strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .loading {
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }

  /* ── Search results ─────────────────────────────────────────────────────────────── */

  .count {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--bsc-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* The theme list's group heading (Themes.svelte), naming each section's matches. */
  .group {
    margin: 20px 0 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--bsc-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--bsc-text-secondary);
  }

  .count + .group {
    margin-top: 12px;
  }

  /* A whole row to press, its wash reaching a little past the column so the text stays aligned. */
  .hit {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 16px;
    align-items: center;
    width: calc(100% + 24px);
    margin: 0 -12px;
    padding: 10px 12px;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .hit:hover {
    background: var(--bsc-bg-hover);
  }

  /* A hairline between matches, as between rows, drawn inside the wash's inset. */
  .hit + .hit {
    position: relative;
  }

  .hit + .hit::before {
    content: '';
    position: absolute;
    top: 0;
    right: 12px;
    left: 12px;
    border-top: 1px solid var(--bsc-border);
  }

  .hit-name {
    font-size: 14px;
    line-height: 1.4;
  }

  .hit-text {
    grid-column: 1;
    max-width: 70ch;
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--bsc-text-secondary);
  }

  /* The words searched for, by weight: the accent marks state, not this. */
  .hit strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .hit svg {
    grid-column: 2;
    grid-row: 1 / span 2;
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--bsc-text-secondary);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .empty {
    padding-top: 4px;
  }

  .empty-lead {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  /* ── Focus: the 2px ring on every control this page draws ─────────────────────────── */

  nav button:focus-visible,
  .hit:focus-visible,
  .close:focus-visible,
  .clear:focus-visible,
  .control select:focus-visible,
  .control input:focus-visible,
  .find input:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .control input[type='checkbox']:focus-visible,
  .control input[type='range']:focus-visible {
    outline-offset: 2px;
  }

  .about a:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 2px;
  }

  /* A row search landed on that has nothing to press right now (`go`). */
  .column :global([data-bsc-landed]:focus-visible) {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 4px;
    border-radius: var(--bsc-radius);
  }
</style>
