<script lang="ts">
  import StatusText from './StatusText.svelte'

  /*
   * "Import browser sign-in": bring the SoundCloud sign-in of a browser into the app, from a
   * cookie export the user picks in main's own file dialog. Only the sign-in is taken
   * (src/shared/sign-in-cookies.ts); the other cookies in the file never leave main. The result
   * is the panel's status line: what happened in bold, then the rest.
   */

  let working = $state(false)
  let line = $state<{ lead: string; detail?: string; problem?: string } | null>(null)

  async function choose(): Promise<void> {
    working = true
    line = null
    const result = await window.bsc.importBrowserSession()
    working = false
    if (!result) return
    if (result.error) {
      line = { lead: 'Not imported', problem: result.error }
    } else if (result.imported > 0) {
      line = { lead: 'Signed in', detail: signedIn(result.ignored) }
    }
  }

  /** Says that the rest of the file stayed behind, so nobody wonders what else came in. */
  function signedIn(ignored: number): string {
    if (ignored === 0) return 'Took the sign-in. SoundCloud is reloading.'
    const others = ignored === 1 ? 'its 1 other cookie' : `its ${ignored} other cookies`
    return `Took the sign-in from the file and left ${others} behind. SoundCloud is reloading.`
  }
</script>

<div class="row" data-bsc-browser-session>
  <div class="label">
    <p class="name">Import browser sign-in</p>
    <p class="help">
      Brings in your browser’s SoundCloud sign-in from a Cookie-Editor JSON export, and nothing
      else. Then delete the file: anyone who has it is signed in as you.
    </p>
    {#if line}
      <div class="result" role="status">
        <StatusText lead={line.lead} detail={line.detail ?? ''} problem={line.problem ?? ''} />
      </div>
    {/if}
  </div>
  <div class="control">
    <button type="button" disabled={working} onclick={choose}>
      {working ? 'Importing…' : 'Choose file…'}
    </button>
  </div>
</div>

<style>
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
  .name {
    margin: 0;
    font-size: 14px;
  }
  /* The help, and the status line under it, in Caption like every other row's. */
  .help,
  .result {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* What it does: read, not glanced at, like every row's explanation in Settings (13px). */
  .help {
    max-width: 70ch;
    font-size: 13px;
    line-height: 1.45;
  }
  .control {
    flex: 0 0 auto;
  }
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
</style>
