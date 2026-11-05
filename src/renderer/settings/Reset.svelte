<script lang="ts">
  import { tick } from 'svelte'

  /*
   * Settings → Advanced, after its ordinary rows: putting the settings back to their defaults,
   * and clearing what SoundCloud keeps on this computer. Neither can be undone, so each asks
   * first, inside its own row (DESIGN.md "Reset rows"), the way a plugin from the user's folder
   * asks before it turns on.
   *
   * Main does the work (`resetSettings`, `clearSiteData` in index.ts). New setting values reach
   * the panel the usual way, through `onSettingsChanged`, so the rows above update by themselves.
   */

  type Action = 'settings' | 'site-data'
  type Phase = 'idle' | 'asking' | 'working' | 'done' | 'failed'

  type Row = {
    action: Action
    label: string
    help: string
    /** Opens the question. The ellipsis says a question comes before anything happens. */
    open: string
    question: string
    /** What it costs and what it leaves alone, so nobody confirms blind. */
    explanation: string
    confirm: string
    working: string
    done: string
    failed: string
  }

  const ROWS: Row[] = [
    {
      action: 'settings',
      label: 'Reset settings',
      help: 'Puts every setting outside Plugins back to its default.',
      open: 'Reset settings…',
      question: 'Reset every setting to its default?',
      explanation:
        'Everything in General, Appearance, Themes, Discord, Shortcuts and Advanced goes back ' +
        'to how it was when BetterSoundCloud was installed. Your plugins and their settings, ' +
        'the Last.fm connection, the files in your themes folder and your SoundCloud sign-in ' +
        'stay as they are.',
      confirm: 'Reset settings',
      working: 'Resetting…',
      done: 'Done: every setting is back to its default.',
      failed: 'Couldn’t reset the settings. Try again.'
    },
    {
      action: 'site-data',
      label: 'Clear cache and site data',
      help:
        'Signs you out of SoundCloud. Try this first if SoundCloud keeps saying you’ve been ' +
        'blocked, or its page won’t load properly.',
      open: 'Clear…',
      question: 'Clear SoundCloud’s data and sign out?',
      explanation:
        'This removes the cookies, stored data and cached files SoundCloud keeps on this ' +
        'computer, then opens SoundCloud again, signed out. Your settings, plugins and Last.fm ' +
        'connection stay.',
      confirm: 'Clear and sign out',
      working: 'Clearing…',
      done: 'Done. SoundCloud is opening again, signed out.',
      failed: 'Couldn’t clear SoundCloud’s data. Try again.'
    }
  ]

  let phases = $state<Record<Action, Phase>>({ settings: 'idle', 'site-data': 'idle' })

  async function ask(action: Action): Promise<void> {
    phases[action] = 'asking'
    await tick()
    // Focus goes to the question, not to its button: a second Enter right after the first must
    // not reset or sign anyone out. Tab reaches the buttons.
    document.querySelector<HTMLElement>(`[data-confirm-for="${action}"]`)?.focus()
  }

  async function run(action: Action): Promise<void> {
    phases[action] = 'working'
    const ok =
      action === 'settings'
        ? await window.bsc.resetSettings()
        : await window.bsc.clearSiteData()
    phases[action] = ok ? 'done' : 'failed'
  }

  function onConfirmKey(event: KeyboardEvent, action: Action): void {
    if (event.key !== 'Escape') return
    // Escape closes the question, not the whole settings panel behind it.
    event.stopPropagation()
    phases[action] = 'idle'
  }
</script>

{#each ROWS as row (row.action)}
  {@const phase = phases[row.action]}
  <div class="row" data-bsc-settings-reset={row.action}>
    <div class="label">
      <p class="name">{row.label}</p>
      <p class="help">{row.help}</p>

      {#if phase === 'asking'}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="confirm"
          role="group"
          tabindex="-1"
          aria-label={row.question}
          data-confirm-for={row.action}
          onkeydown={(event) => onConfirmKey(event, row.action)}
        >
          <p><strong>{row.question}</strong> {row.explanation}</p>
          <div class="buttons">
            <button type="button" class="default" onclick={() => run(row.action)}
              >{row.confirm}</button
            >
            <button type="button" onclick={() => (phases[row.action] = 'idle')}>Cancel</button>
          </div>
        </div>
      {:else if phase === 'done' || phase === 'failed'}
        <p class="result" role="status">{phase === 'done' ? row.done : row.failed}</p>
      {/if}
    </div>

    <div class="control">
      <button
        type="button"
        disabled={phase === 'asking' || phase === 'working'}
        onclick={() => ask(row.action)}>{phase === 'working' ? row.working : row.open}</button
      >
    </div>
  </div>
{/each}

<style>
  /* The settings row's shape, so these read as two more rows of the section. */
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

  .name {
    margin: 0;
    font-size: 14px;
  }

  .help,
  .result {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .result {
    color: var(--bsc-text-primary);
  }

  .control {
    flex: 0 0 auto;
  }

  /* The panel's one button language (Plugins.svelte, the Go to URL prompt). */
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

  /* The question, inside the row it is about: Plugins.svelte's confirmation, unchanged. */
  .confirm {
    margin-top: 10px;
    padding: 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  /* Where focus lands when the question opens, so it is read out first; not a control, so no
     ring of its own. Its buttons, one Tab away, keep theirs. */
  .confirm:focus {
    outline: none;
  }

  .confirm p {
    margin: 0;
    color: var(--bsc-text-secondary);
  }

  .confirm strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
