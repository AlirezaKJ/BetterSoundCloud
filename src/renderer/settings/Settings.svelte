<script lang="ts">
  import { onMount } from 'svelte'
  import { SECTIONS, SETTINGS, SETTING_KEYS } from '@shared/settings-schema'
  import type { Section, SettingKey, Settings } from '@shared/settings-schema'

  /*
   * The entire form is generated from the schema. Adding a setting means adding one
   * entry to src/shared/settings-schema.ts and nothing else — no markup, no getter, no
   * setter, no listener. v0.7.x needed all four, in four different files, and they
   * drifted apart.
   *
   * There are four write handlers here, one per `kind`, rather than one per setting.
   * That ratio is the point.
   */

  let values = $state<Settings | null>(null)
  let active = $state<Section>('general')

  const keysIn = (section: Section): SettingKey[] =>
    SETTING_KEYS.filter((k) => SETTINGS[k].section === section)

  onMount(() => {
    void window.bsc.getSettings().then((s) => (values = s))
    return window.bsc.onSettingsChanged((s) => (values = s))
  })

  async function update(key: SettingKey, value: unknown): Promise<void> {
    // Main re-validates and returns the authoritative snapshot; we never assume our
    // local write was accepted verbatim (a number outside its bounds comes back clamped).
    values = await window.bsc.setSetting(key, value)
  }
</script>

<div class="wrap">
  <nav data-bsc-settings-nav>
    {#each SECTIONS as section (section)}
      <button class:active={active === section} onclick={() => (active = section)}>
        {section}
      </button>
    {/each}
  </nav>

  <main data-bsc-settings-panel>
    {#if !values}
      <p class="loading">Loading…</p>
    {:else}
      {#each keysIn(active) as key (key)}
        {@const def = SETTINGS[key]}
        <div class="row">
          <div class="label">
            <label for={key}>{def.label}</label>
            {#if 'help' in def && def.help}<p class="help">{def.help}</p>{/if}
          </div>

          <div class="control">
            {#if def.kind === 'boolean'}
              <input
                id={key}
                type="checkbox"
                checked={values[key] as boolean}
                onchange={(e) => update(key, e.currentTarget.checked)}
              />
            {:else if def.kind === 'number'}
              <input
                id={key}
                type="number"
                min={def.min}
                max={def.max}
                step={def.step ?? 1}
                value={values[key] as number}
                onchange={(e) => update(key, e.currentTarget.valueAsNumber)}
              />
            {:else if def.kind === 'enum'}
              <select
                id={key}
                value={values[key] as string}
                onchange={(e) => update(key, e.currentTarget.value)}
              >
                {#each def.options as option (option)}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            {:else}
              <input
                id={key}
                type="text"
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

<style>
  .wrap {
    display: grid;
    grid-template-columns: 160px 1fr;
    height: 100vh;
    background: var(--bsc-bg-primary);
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
    text-transform: capitalize;
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

  .control {
    flex: 0 0 auto;
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
