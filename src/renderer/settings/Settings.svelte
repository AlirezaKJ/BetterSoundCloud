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
  import type { Section, SettingKey, Settings } from '@shared/settings-schema'
  import type { ThemeSummary } from '@shared/themes'

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
  let themes = $state<ThemeSummary[]>([])
  let active = $state<Section>('general')

  const keysIn = (section: Section): SettingKey[] =>
    SETTING_KEYS.filter((k) => SETTINGS[k].section === section)

  onMount(() => {
    open = true

    // Escape is registered first, deliberately: if loading settings ever fails, the panel
    // must still be dismissable rather than trapping the user in a modal.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)

    void window.bsc.getSettings().then((s) => (values = s))
    // Read once when the panel opens. A theme author saves a file and reopens settings to
    // see it, which is simpler than a file watcher and good enough until themes are plural.
    void window.bsc.listThemes().then((t) => (themes = t))
    const stopWatching = window.bsc.onSettingsChanged((s) => (values = s))

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
        <button class:active={active === section} onclick={() => (active = section)}>
          {SECTION_LABELS[section]}
        </button>
      {/each}
    </nav>

    <main data-bsc-settings-content>
      {#if !values}
        <p class="loading">Loading…</p>
      {:else}
        {#each keysIn(active) as key (key)}
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
                    <option value={option}>{option}</option>
                  {/each}
                </select>
              {:else if 'optionsFrom' in def && def.optionsFrom === 'themes'}
                <!--
                  The one control whose choices are not in the schema. The point of a themes
                  folder is that the user adds files to it, so the list is read from disk.
                  `vanilla` is listed first and is never a file, so nothing can shadow it.
                -->
                <select
                  id={key}
                  disabled={pending}
                  value={values[key] as string}
                  onchange={(e) => update(key, e.currentTarget.value)}
                >
                  <option value="vanilla">None (SoundCloud as-is)</option>
                  {#each themes as theme (theme.id)}
                    <option value={theme.id}
                      >{theme.name}{theme.builtIn ? '' : ' (yours)'}</option
                    >
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
        {/each}
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

  label {
    font-size: 14px;
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
