<script lang="ts">
  import { onMount } from 'svelte'
  import { describeGlassStatus } from '@shared/glass'
  import type { GlassStatus } from '@shared/glass'
  import StatusText from './StatusText.svelte'

  /*
   * The line under the Glass switch, when the box is ticked and there is no glass: safe mode,
   * hardware acceleration off, or Windows before 11. Without it the switch would sit ticked over
   * a window that looks exactly as before — a control that silently does nothing. The words come
   * from `describeGlassStatus` (pure, tested); working glass shows itself, so then there is no line.
   *
   * The answer only changes when settings do (Glass, its tint, hardware acceleration), and main
   * has applied a change before it broadcasts it, so the line asks again on every broadcast.
   */

  let status = $state<GlassStatus | null>(null)
  const message = $derived(status ? describeGlassStatus(status) : null)

  function read(): void {
    void window.bsc.getGlassStatus().then((current) => {
      // Null when main refused this view as a sender; there is nothing honest to show then.
      if (!(current as GlassStatus | null)) return
      status = current
    })
  }

  onMount(() => {
    const stop = window.bsc.onSettingsChanged(() => {
      read()
    })
    read()
    return stop
  })
</script>

{#if message && status}
  <div class="status" data-bsc-glass-status data-state={status} role="status">
    <StatusText lead={message.lead} detail={message.detail} />
  </div>
{/if}

<style>
  .status {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }
</style>
