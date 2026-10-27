<script lang="ts">
  import { onMount } from 'svelte'
  import { describePresenceStatus } from '@shared/presence'
  import type { PresenceStatus } from '@shared/presence'
  import StatusText from './StatusText.svelte'

  /*
   * The line under the Discord toggle saying whether presence is actually working.
   *
   * Without it, someone with Discord closed sees a ticked box and no card anywhere — a control
   * that silently does nothing. The words come from `describePresenceStatus` (pure, tested);
   * main tells this view whenever the status changes.
   */

  /**
   * How long "Try now" holds the "looking" line. Looking for a closed Discord fails in
   * milliseconds, so without this the press would seem to do nothing at all — the line would
   * flip to "looking" and back before it was ever painted. It did look; this lets that show.
   */
  const CHECKING_MS = 600

  let status = $state<PresenceStatus | null>(null)
  let checking = $state(false)

  const message = $derived.by(() => {
    if (!status) return null
    if (checking && status.state !== 'connected') {
      return describePresenceStatus({ state: 'connecting' })
    }
    return describePresenceStatus(status)
  })

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stop = window.bsc.onPresenceStatus((next) => (status = next))
    void window.bsc.getPresenceStatus().then((current) => {
      // Null when main refused this view as a sender; there is nothing honest to show then.
      if (!(current as PresenceStatus | null)) return
      status = current
      // Someone just opened this section to see whether Discord works. If it does not, look
      // now rather than at the next scheduled attempt, which can be up to a minute away.
      if (current.state === 'unavailable') window.bsc.retryPresence()
    })
    return stop
  })

  function tryNow(): void {
    checking = true
    window.bsc.retryPresence()
    setTimeout(() => (checking = false), CHECKING_MS)
  }
</script>

{#if message && status}
  <div class="status" data-bsc-discord-status data-state={status.state} role="status">
    <StatusText lead={message.lead} detail={message.detail} problem={message.problem} />
    {#if message.canRetry}
      <button type="button" disabled={checking} onclick={tryNow}>Try now</button>
    {/if}
  </div>
{/if}

<style>
  .status {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* The Go to URL prompt's button, so the panel keeps a single button language. */
  button {
    margin-top: 8px;
    padding: 4px 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
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
