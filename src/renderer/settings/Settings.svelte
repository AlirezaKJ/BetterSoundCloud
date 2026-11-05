<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import {
    SECTIONS,
    SECTION_LABELS,
    SETTINGS,
    SETTING_KEYS,
    APPLIES_NOTES
  } from '@shared/settings-schema'
  import type { Section, SettingDef, SettingKey, Settings } from '@shared/settings-schema'
  import DiscordStatus from './DiscordStatus.svelte'
  import UpdateStatus from './UpdateStatus.svelte'
  import Plugins from './Plugins.svelte'
  import Themes from './Themes.svelte'
  import Background from './Background.svelte'
  import Reset from './Reset.svelte'

  /*
   * The entire form is generated from the schema. Adding a setting means adding one
   * entry to src/shared/settings-schema.ts and nothing else — no markup, no getter, no
   * setter, no listener. v0.7.x needed all four, in four different files, and they
   * drifted apart.
   *
   * There are four write handlers here, one per `kind`, rather than one per setting.
   * That ratio is the point.
   *
   * Closing is a two-step dance. The panel lives in its own transparent WebContentsView,
   * and main destroys that view — but if it destroyed it the moment the user pressed
   * Escape, the exit animation would never be seen. So Escape and the close button only
   * set `open = false`; when the outro transition ends we tell main to destroy the view.
   */

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const DURATION = REDUCED_MOTION ? 0 : 180

  let open = $state(false)
  let values = $state<Settings | null>(null)
  let active = $state<Section>('general')
  /** Started with `--safe-mode`: some settings below are not in force, so the panel says so. */
  let safeMode = $state(false)
  /** "Continue without Widevine" was pressed at startup: protected tracks skip until a restart. */
  let withoutWidevine = $state(false)

  const keysIn = (section: Section): SettingKey[] =>
    SETTING_KEYS.filter((k) => SETTINGS[k].section === section)

  /** Drawn by its own component (`drawnBy` in the schema), so it gets no ordinary row. */
  const drawnElsewhere = (key: SettingKey): boolean => 'drawnBy' in SETTINGS[key]

  /** How a dropdown option reads: its label from the schema, which every drawn option has. */
  const optionLabel = (key: SettingKey, option: string): string => {
    const def: SettingDef = SETTINGS[key]
    return (def.kind === 'enum' && def.labels?.[option]) || option
  }

  onMount(() => {
    open = true

    // Escape is registered first, deliberately: if loading settings ever fails, the panel
    // must still be dismissable rather than trapping the user in a modal.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)

    void window.bsc.getSettings().then((s) => (values = s))
    void window.bsc.getSafeMode().then((on) => (safeMode = on))
    void window.bsc.getWidevineSkipped().then((skipped) => (withoutWidevine = skipped))
    const stopWatching = window.bsc.onSettingsChanged((s) => {
      values = s
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      stopWatching()
    }
  })

  let destroyRequested = false

  /** Start the exit animation. The view itself is destroyed later, in `destroyView`. */
  function requestClose(): void {
    if (!open) return
    open = false
    // `onoutroend` normally does this when the animation finishes. This backstop covers
    // the case where that event never arrives — a settings panel that cannot be closed
    // is far worse than one that closes without animating.
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
</script>

<!-- One setting's row, shared by the schema-driven sections and the Themes section. -->
{#snippet settingRow(key: SettingKey)}
  {#if values}
    {@const def = SETTINGS[key]}
    <!-- `as const` narrows each entry to its literal shape, so entries that are
         wired have no `wired` property at all — hence the `in` guard. -->
    {@const pending = 'wired' in def && def.wired === false}
    <div class="row" class:pending>
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
          <p class="help">{APPLIES_NOTES[def.applies]}</p>
        {/if}
        <!--
          Whether the feature behind the control is working right now, for the settings
          whose answer can change on its own — Discord being opened or closed, say.
        -->
        {#if 'statusFrom' in def && def.statusFrom === 'discord'}<DiscordStatus />{/if}
        {#if 'statusFrom' in def && def.statusFrom === 'updates'}<UpdateStatus />{/if}
      </div>

      <div class="control">
        {#if def.kind === 'boolean'}
          <input
            id={key}
            type="checkbox"
            disabled={pending}
            checked={values[key] as boolean}
            onchange={(e) => update(key, e.currentTarget.checked)}
          />
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

{#if open}
  <!--
    A button rather than a div so closing by clicking outside the card is reachable by
    keyboard and screen readers, and so no a11y rule has to be suppressed.
  -->
  <button
    class="scrim"
    aria-label="Close settings"
    onclick={requestClose}
    transition:fade={{ duration: DURATION }}
  ></button>

  <div
    class="panel"
    data-bsc-settings-panel
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    transition:fly={{ y: 14, duration: DURATION, easing: cubicOut }}
    onoutroend={destroyView}
  >
    <header data-bsc-settings-title>
      <h1>Settings</h1>
      <button
        class="close"
        title="Close (Esc)"
        aria-label="Close settings"
        onclick={requestClose}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
    </header>

    <nav data-bsc-settings-nav>
      {#each SECTIONS as section (section)}
        <!-- F6 into the panel lands on the section showing, not on the scrim behind it. -->
        <button
          class:active={active === section}
          data-bsc-focus-first={active === section ? '' : undefined}
          onclick={() => (active = section)}
        >
          {SECTION_LABELS[section]}
        </button>
      {/each}
    </nav>

    <main data-bsc-settings-content>
      {#if safeMode}
        <!-- On every section, because the settings it overrides live in three of them. -->
        <p class="notice" role="status" data-bsc-settings-safe-mode>
          <strong>Safe mode is on.</strong> Hardware acceleration, ad blocking and your theme are
          off for this launch, whatever the settings below say. Nothing has been changed: quit and
          start BetterSoundCloud normally to use them again.
        </p>
      {/if}
      {#if withoutWidevine}
        <!-- So a track that greys out and skips now reads as expected, not as the old bug. -->
        <p class="notice" role="status" data-bsc-settings-without-widevine>
          <strong>Protected tracks won’t play yet.</strong> Widevine couldn’t be downloaded when BetterSoundCloud
          started, and you continued without it, so tracks that need it are greyed out and skip. BetterSoundCloud
          keeps trying in the background, and restarting it tries again straight away.
        </p>
      {/if}
      {#if active === 'plugins'}
        <!-- Not schema-driven: plugins are found on disk, so their rows are too. -->
        <Plugins />
      {:else if active === 'themes'}
        <!-- The section's switches, such as Minimal navigation, which work with any theme; then
             the background, which needs a preview and sliders (Background.svelte); then the themes
             themselves, which are files with descriptions and swatches (Themes.svelte). Settings
             with `drawnBy` belong to those two components, so they get no row here. -->
        {#if values}
          {#each keysIn('themes').filter((k) => !drawnElsewhere(k)) as key (key)}
            {@render settingRow(key)}
          {/each}
        {/if}
        <Background />
        <Themes />
      {:else if !values}
        <p class="loading">Loading…</p>
      {:else}
        {#each keysIn(active).filter((k) => !drawnElsewhere(k)) as key (key)}
          {@render settingRow(key)}
        {/each}
        {#if active === 'advanced'}
          <!-- Reset settings, and clear SoundCloud's data: buttons that ask first, not settings. -->
          <Reset />
        {/if}
        {#if active === 'shortcuts'}
          <!-- Keys built into the window (main/focus-cycle.ts). Not settings, so not schema rows,
               but listed where people look for keys. -->
          <div class="row" data-bsc-settings-key="next-part">
            <div class="label">
              <p class="name">Move focus to the next part of the window</p>
              <p class="help">
                From the top bar to SoundCloud’s page, then the lyrics pane and the player
                buttons when they are open. With Settings open, between Settings and the top
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
    </main>
  </div>
{/if}

<style>
  /*
   * This page renders into a transparent WebContentsView stacked over SoundCloud, so it
   * must not paint a background of its own — the scrim below is what dims the page.
   */
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  .scrim {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: rgb(0 0 0 / 45%);
    cursor: default;
  }

  .panel {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: 160px 1fr;
    grid-template-rows: auto 1fr;
    width: min(760px, calc(100% - 48px));
    height: min(560px, calc(100% - 48px));
    margin: auto;
    overflow: hidden;
    border: 1px solid var(--bsc-border);
    border-radius: 10px;
    background: var(--bsc-bg-primary);
    box-shadow:
      0 12px 40px rgb(0 0 0 / 35%),
      0 2px 8px rgb(0 0 0 / 20%);
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid var(--bsc-border);
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

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 8px;
    border-right: 1px solid var(--bsc-border);
    overflow-y: auto;
  }

  nav button {
    padding: 8px 10px;
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

  main {
    padding: 16px 20px;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 12px 0;
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
  }

  .name {
    margin: 0;
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

  .notice strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .help {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .row.pending label {
    color: var(--bsc-text-disabled);
  }

  .pending-note {
    margin: 4px 0 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--bsc-text-disabled);
  }

  .control {
    flex: 0 0 auto;
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

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--bsc-accent);
  }

  .loading {
    color: var(--bsc-text-secondary);
  }
</style>
