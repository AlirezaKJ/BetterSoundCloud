<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { PluginView } from '@shared/plugins'
  import type { PluginsResult } from '@shared/ipc'
  import StatusText from './StatusText.svelte'

  /*
   * The Plugins section: every plugin, built in or dropped into the plugins folder.
   *
   * Main decides everything that matters — which plugins exist, what they may do, whether they
   * run (src/main/plugins.ts). This view lists them, asks before a plugin from the folder is
   * turned on, and passes clicks along.
   *
   * WHY IT ASKS, AND HOW. A plugin from the folder is someone else's code. Ticking its box opens
   * a confirmation inside its own row, listing what it will be able to do, instead of a dialog on
   * top of a dialog — the question belongs to the row, and the rest of the panel stays usable.
   * Built-in plugins skip the question; their permissions are listed on the row all the same.
   */

  let plugins = $state<PluginView[] | null>(null)
  /** The plugin whose confirmation is open, if any. */
  let confirming = $state<string | null>(null)
  /** A change main refused, shown on that plugin's row. */
  let refused = $state<{ id: string; message: string } | null>(null)
  /** A plugin whose change is on its way, so its controls are not pressed twice. */
  let busy = $state<string | null>(null)

  const userPlugins = $derived(plugins?.filter((p) => p.source === 'user') ?? [])

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stop = window.bsc.onPluginsChanged((next) => {
      plugins = next
    })
    void window.bsc.listPlugins().then((list) => {
      // Null when main refused this view as a sender.
      if (list as PluginView[] | null) plugins = list
    })
    return stop
  })

  function apply(id: string, result: PluginsResult | null): void {
    busy = null
    if (!result) return
    plugins = result.plugins
    refused = result.error ? { id, message: result.error } : null
  }

  /** The box was ticked or unticked. A plugin from the folder asks first. */
  async function toggle(plugin: PluginView, box: HTMLInputElement): Promise<void> {
    const on = box.checked
    if (on && plugin.source === 'user') {
      // Leave the box as it was until the user says yes.
      box.checked = false
      await ask(plugin.id)
      return
    }
    await setEnabled(plugin.id, on)
  }

  async function ask(id: string): Promise<void> {
    confirming = id
    await tick()
    document.querySelector<HTMLButtonElement>(`[data-confirm-for="${id}"] button`)?.focus()
  }

  async function setEnabled(id: string, on: boolean): Promise<void> {
    confirming = null
    busy = id
    apply(id, await window.bsc.setPluginEnabled(id, on))
  }

  async function setSetting(id: string, key: string, value: boolean | string): Promise<void> {
    apply(id, await window.bsc.setPluginSetting(id, key, value))
  }

  function onConfirmKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    // Escape closes the confirmation, not the whole settings panel behind it.
    event.stopPropagation()
    confirming = null
  }

  /** What the row says about a plugin's state, when the plugin has nothing of its own to say. */
  function stateLine(
    plugin: PluginView
  ): { lead: string; detail?: string; problem?: string } | null {
    switch (plugin.state) {
      case 'off':
        return null
      case 'starting':
        return { lead: 'Starting…' }
      case 'running':
        return plugin.status ?? { lead: 'On' }
      case 'failed':
        return { lead: 'Stopped', problem: plugin.problem }
      case 'needs-approval':
        return { lead: 'Paused', detail: plugin.problem }
      case 'unavailable':
        return { lead: 'Can’t be turned on', detail: plugin.problem }
      case 'broken':
        return { lead: 'Can’t load', detail: plugin.problem }
    }
  }

  const sourceLabel = (plugin: PluginView): string =>
    plugin.source === 'bundled' ? 'Built in' : 'From your plugins folder'
</script>

{#if !plugins}
  <p class="loading">Loading…</p>
{:else}
  {#each plugins as plugin (`${plugin.source}:${plugin.id}`)}
    {@const line = stateLine(plugin)}
    {@const canToggle =
      plugin.state !== 'broken' && plugin.state !== 'unavailable' && busy !== plugin.id}
    <div
      class="row"
      class:pending={plugin.state === 'broken' || plugin.state === 'unavailable'}
      data-bsc-plugin={plugin.id}
    >
      <div class="label">
        <label for={`plugin-${plugin.source}-${plugin.id}`}>{plugin.name}</label>
        <p class="meta">
          {sourceLabel(plugin)}{plugin.version ? ` · ${plugin.version}` : ''}{plugin.author
            ? ` · ${plugin.author}`
            : ''}
        </p>
        {#if plugin.description}<p class="help">{plugin.description}</p>{/if}

        {#if plugin.permissions.length > 0}
          <ul class="permissions" aria-label={`What ${plugin.name} can do`}>
            {#each plugin.permissions as permission (permission.text)}
              <li class:missing={!permission.available}>{permission.text}</li>
            {/each}
          </ul>
        {/if}

        {#if line}
          <div class="status" role="status">
            <StatusText
              lead={line.lead}
              detail={line.detail ?? ''}
              problem={line.problem ?? ''}
            />
          </div>
        {/if}
        {#if refused?.id === plugin.id}
          <p class="problem">{refused.message}</p>
        {/if}

        {#if plugin.state === 'needs-approval' && confirming !== plugin.id}
          <div class="buttons">
            <button type="button" onclick={() => ask(plugin.id)}>Review and approve</button>
          </div>
        {:else if plugin.actions.length > 0}
          <div class="buttons">
            {#each plugin.actions as action (action.id)}
              <button
                type="button"
                disabled={action.disabled === true}
                onclick={() => window.bsc.pluginAction(plugin.id, action.id)}
                >{action.label}</button
              >
            {/each}
          </div>
        {/if}

        {#if confirming === plugin.id}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="confirm"
            role="group"
            aria-label={`Turn on ${plugin.name}?`}
            data-confirm-for={plugin.id}
            onkeydown={onConfirmKey}
          >
            <p>
              <strong>Turn on “{plugin.name}”?</strong> It came from your plugins folder, not
              with BetterSoundCloud.
              {plugin.permissions.length > 0
                ? 'It will be able to:'
                : 'It asks for no permissions.'}
            </p>
            {#if plugin.permissions.length > 0}
              <ul class="permissions">
                {#each plugin.permissions as permission (permission.text)}
                  <li>{permission.text}</li>
                {/each}
              </ul>
            {/if}
            <p>
              Only turn it on if you trust where it came from. A plugin keeps to that list when
              it uses BetterSoundCloud’s API, but one written to break the rules could do
              anything a program on this computer can.
            </p>
            <div class="buttons">
              <button type="button" class="default" onclick={() => setEnabled(plugin.id, true)}
                >Turn on</button
              >
              <button type="button" onclick={() => (confirming = null)}>Cancel</button>
            </div>
          </div>
        {/if}

        {#if plugin.enabled && plugin.settings.length > 0}
          <div class="settings" data-bsc-plugin-settings>
            {#each plugin.settings as { setting, value, hasValue } (setting.key)}
              {@const id = `plugin-${plugin.id}-${setting.key}`}
              <div class="setting">
                <div class="setting-label">
                  <label for={id}>{setting.label}</label>
                  {#if setting.help}<p class="help">{setting.help}</p>{/if}
                </div>
                {#if setting.kind === 'boolean'}
                  <input
                    {id}
                    type="checkbox"
                    checked={value === true}
                    onchange={(e) =>
                      setSetting(plugin.id, setting.key, e.currentTarget.checked)}
                  />
                {:else if setting.kind === 'string'}
                  <input
                    {id}
                    type="text"
                    value={typeof value === 'string' ? value : ''}
                    onchange={(e) => setSetting(plugin.id, setting.key, e.currentTarget.value)}
                  />
                {:else}
                  <!-- The saved value never comes back here; the placeholder only says one exists. -->
                  <input
                    {id}
                    type="password"
                    autocomplete="off"
                    placeholder={hasValue ? 'Saved — type to replace' : ''}
                    onchange={(e) => {
                      void setSetting(plugin.id, setting.key, e.currentTarget.value)
                      e.currentTarget.value = ''
                    }}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="control">
        <input
          id={`plugin-${plugin.source}-${plugin.id}`}
          type="checkbox"
          checked={plugin.enabled}
          disabled={!canToggle}
          onchange={(e) => toggle(plugin, e.currentTarget)}
        />
      </div>
    </div>
  {/each}

  <div class="footer" data-bsc-plugins-footer>
    <button type="button" onclick={() => window.bsc.openPluginsFolder()}
      >Open plugins folder</button
    >
    {#if userPlugins.length === 0}
      <p class="help">
        None of your own yet. To add one, put its folder in the plugins folder, then come back
        to this section.
      </p>
    {/if}
    <p class="help">
      Each plugin runs in a process of its own, so a broken one can’t freeze the app. A plugin
      lists what it will do, and BetterSoundCloud holds it to that list — but cannot stop a
      plugin written to break the rules. Only add plugins you trust.
    </p>
  </div>
{/if}

<style>
  .loading {
    color: var(--bsc-text-secondary);
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

  .row.pending > .label > label {
    color: var(--bsc-text-disabled);
  }

  .meta,
  .help,
  .permissions,
  .status,
  .problem {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .meta {
    margin-top: 2px;
  }

  .status {
    margin-top: 8px;
  }

  .problem {
    color: var(--bsc-text-primary);
  }

  /*
   * What a plugin can do, one per line, each after a short hairline dash — the system's own
   * mark, rather than a bullet glyph or a circle.
   */
  .permissions {
    padding: 0;
    list-style: none;
  }

  .permissions li {
    position: relative;
    padding-left: 14px;
  }

  /* Whole pixels: at 0.7em the 1px line landed between pixels and some dashes drew heavier. */
  .permissions li::before {
    content: '';
    position: absolute;
    top: 8px;
    left: 2px;
    width: 6px;
    height: 1px;
    background: currentcolor;
  }

  .permissions li.missing {
    color: var(--bsc-text-primary);
  }

  .control {
    flex: 0 0 auto;
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--bsc-accent);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input[type='text'],
  input[type='password'] {
    min-width: 180px;
    padding: 6px 8px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    caret-color: var(--bsc-accent);
  }

  input::placeholder {
    color: var(--bsc-text-secondary);
  }

  input[type='text']:focus-visible,
  input[type='password']:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -1px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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

  /*
   * One tonal step forward, as on the page-status surface: emphasis from the neutrals. And
   * weight, because inside the confirmation the box is already Field White and the step
   * disappears — the settings rail's rule, "weight, not colour, carries selection".
   */
  button.default {
    background-color: var(--bsc-bg-secondary);
    font-weight: 600;
  }

  button:hover:enabled {
    background-image: linear-gradient(var(--bsc-bg-hover), var(--bsc-bg-hover));
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  button:disabled {
    color: var(--bsc-text-disabled);
  }

  /*
   * The question, inside the row it is about: inset on Field White behind a hairline, the way a
   * control reads as inset rather than painted on. Not a card and not a dialog — it does not
   * float, and the rest of the panel stays usable.
   */
  .confirm {
    margin-top: 10px;
    padding: 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .confirm p {
    margin: 0;
  }

  .confirm p + p,
  .confirm .permissions + p {
    margin-top: 8px;
    color: var(--bsc-text-secondary);
    font-size: 12px;
  }

  .confirm strong {
    font-weight: 600;
  }

  .confirm .permissions {
    margin-top: 6px;
    font-size: 13px;
    color: var(--bsc-text-primary);
  }

  .confirm .permissions li::before {
    top: 9px;
  }

  /* A plugin's own settings, set in from its row so they read as belonging to it. */
  .settings {
    margin-top: 10px;
    padding-left: 12px;
    border-left: 1px solid var(--bsc-border);
  }

  .setting {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 0;
  }

  .setting-label {
    flex: 1;
    min-width: 0;
  }

  .setting label {
    font-size: 13px;
  }

  .footer {
    padding: 16px 0 4px;
  }

  .footer .help {
    margin-top: 8px;
    max-width: 60ch;
  }
</style>
