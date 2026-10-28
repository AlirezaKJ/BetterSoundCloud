<script lang="ts">
  import { onMount } from 'svelte'
  import { describeUpdateStatus } from '@shared/updates'
  import type { UpdateStatus } from '@shared/updates'
  import StatusText from './StatusText.svelte'

  /*
   * The line under "Update automatically": what the updater is doing, and the one thing you can do
   * about it — check now, download, restart to install, or open the download page.
   *
   * The words and the button come from `describeUpdateStatus` (pure, tested); main tells this view
   * whenever the status changes, which is about once a second while downloading.
   */

  let status = $state<UpdateStatus | null>(null)
  /** "Restart now" closes the app; a second press while it closes would do nothing useful. */
  let installing = $state(false)

  const message = $derived(status ? describeUpdateStatus(status) : null)

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stop = window.bsc.onUpdateStatus((next) => {
      status = next
    })
    void window.bsc.getUpdateStatus().then((current) => {
      // Null when main refused this view as a sender; there is nothing honest to show then.
      if (current as UpdateStatus | null) status = current
    })
    return stop
  })

  function press(): void {
    const action = message?.action?.action
    if (!action) return
    if (action === 'install') installing = true
    window.bsc.updateAction(action)
  }
</script>

{#if message && status}
  <div class="status" data-bsc-update-status data-state={status.state} role="status">
    <StatusText lead={message.lead} detail={message.detail} problem={message.problem} />
    {#if message.action}
      <button type="button" disabled={installing} onclick={press}>
        {message.action.label}
      </button>
    {/if}
  </div>
{/if}

<style>
  .status {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
    /* The download percentage changes every second; equal-width digits keep the line still. */
    font-variant-numeric: tabular-nums;
  }

  /* The panel's one button language: the Prompt's button at 13px, as Discord's "Try now". */
  button {
    margin-top: 8px;
    padding: 4px 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    font-variant-numeric: normal;
    cursor: default;
  }

  button:hover:enabled {
    background: var(--bsc-bg-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  button:disabled {
    color: var(--bsc-text-disabled);
  }
</style>
