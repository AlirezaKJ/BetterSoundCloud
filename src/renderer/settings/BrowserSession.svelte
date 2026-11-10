<script lang="ts">
  let working = $state(false)
  let message = $state('')
  let failed = $state(false)

  async function choose(): Promise<void> {
    working = true
    message = ''
    const result = await window.bsc.importBrowserSession()
    working = false
    failed = !!result.error
    message =
      result.error ||
      (result.count ? `Imported ${result.count} SoundCloud cookies. Reloading…` : '')
  }
</script>

<div class="row">
  <div class="label">
    <p class="name">Import browser sign-in</p>
    <p class="help">
      After signing in to SoundCloud with Google in Zen, Firefox, or Edge, export SoundCloud's
      cookies as JSON with Cookie-Editor. Choose that file here to use the session in
      BetterSoundCloud.
    </p>
    {#if message}
      <p class="result" role={failed ? 'alert' : 'status'}>{message}</p>
    {/if}
  </div>
  <div class="control">
    <button type="button" disabled={working} onclick={choose}>
      {working ? 'Importing…' : 'Choose export…'}
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
