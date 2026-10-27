<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { describePageStatus, hidesPage } from '@shared/page-status'
  import type { PageStatus } from '@shared/page-status'

  /*
   * What BetterSoundCloud says while SoundCloud's page cannot be shown.
   *
   * Main decides the status and sends it (src/main/page-status.ts); the words and buttons come
   * from `describePageStatus`, which is pure and tested. This component only draws them, and
   * sends back which button was pressed. Main also decides when this view goes away — it is
   * destroyed the moment SoundCloud's page arrives — so nothing here has to run for the user
   * to get their page back.
   *
   * Two presentations. Most statuses mean there is no page to look at, so this view takes its
   * place: an opaque surface, flat, no shadow — it is the page, not something over it. A hang is
   * different: the page is still there, frozen, and may come back, so the question is asked in
   * a dialog over it, with the scrim and shadow every dialog in the app gets.
   */

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const DURATION = REDUCED_MOTION ? 0 : 180

  let status = $state<PageStatus | null>(null)
  const message = $derived(status ? describePageStatus(status) : null)
  const dialog = $derived(status !== null && !hidesPage(status))

  let defaultButton = $state<HTMLButtonElement | null>(null)

  onMount(() => {
    const stop = window.bsc.onPageStatus((next) => (status = next))

    // The network coming back is the best moment to retry a failed load, sooner than main's
    // own schedule would. Main ignores it unless a failed load is actually on screen.
    const onOnline = (): void => {
      if (status?.kind === 'load-failed') window.bsc.pageStatusAction('retry')
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && status?.kind === 'unresponsive') {
        window.bsc.pageStatusAction('wait')
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('keydown', onKey)

    return () => {
      stop()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('keydown', onKey)
    }
  })

  // Keep the default button focused as the status changes, so Enter always does the expected
  // thing — including after "Trying again…" fails and the button comes back.
  $effect(() => {
    if (!message) return
    const button = defaultButton
    if (button && !button.disabled && document.activeElement !== button) button.focus()
  })

  /** The dialog gets the app's one dialog entrance; the page surface just fades its words in. */
  function enter(node: Element) {
    return dialog
      ? fly(node, { y: 14, duration: DURATION, easing: cubicOut })
      : fade(node, { duration: DURATION })
  }
</script>

{#if status && message}
  <div class="surface" class:page={!dialog} data-bsc-page-status>
    {#if dialog}
      <!-- A button, so dismissing by clicking outside is reachable by keyboard and screen
           readers too. Dismissing a hang dialog means waiting, the choice that loses nothing. -->
      <button
        class="scrim"
        aria-label="Wait for SoundCloud"
        tabindex="-1"
        onclick={() => window.bsc.pageStatusAction('wait')}
        transition:fade={{ duration: DURATION }}
      ></button>
    {/if}

    <section
      class="status"
      class:dialog
      data-bsc-page-status-kind={status.kind}
      role={dialog ? 'alertdialog' : message.waiting ? 'status' : 'alert'}
      aria-modal={dialog ? 'true' : undefined}
      aria-labelledby="page-status-title"
      aria-describedby="page-status-body"
      in:enter
    >
      <h1 id="page-status-title">{message.title}</h1>
      <p id="page-status-body" class="body">{message.body}</p>

      {#if message.detail}
        <!-- The technical half, for bug reports. Selectable, so it can be copied. -->
        <p class="detail">{message.detail}</p>
      {/if}

      {#if message.waiting}
        <!-- Something is in progress. The words already say so; this says it is not stuck.
             Last before the buttons, next to the one it is usually waiting on. -->
        <div class="progress" aria-hidden="true"><span></span></div>
      {/if}

      {#if message.buttons.length > 0}
        <div class="actions">
          {#each message.buttons as button, index (button.action)}
            {#if index === 0}
              <button
                class="default"
                bind:this={defaultButton}
                disabled={button.disabled}
                onclick={() => window.bsc.pageStatusAction(button.action)}
                >{button.label}</button
              >
            {:else}
              <button
                disabled={button.disabled}
                onclick={() => window.bsc.pageStatusAction(button.action)}
                >{button.label}</button
              >
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  /*
   * The view itself is transparent (main sets that), so a hang dialog can show the frozen page
   * through its scrim. Every other status paints its own opaque surface, `.page` below.
   */
  :global(html),
  :global(body) {
    height: 100%;
    background: transparent;
    overflow: hidden;
  }

  .surface {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .surface.page {
    background: var(--bsc-bg-primary);
    overflow-y: auto;
  }

  /* A column a little above centre, where the eye goes first in an empty window. */
  .status {
    width: min(440px, 100%);
    margin-bottom: 8vh;
  }

  .status.dialog {
    position: fixed;
    top: 96px;
    right: 0;
    left: 0;
    width: min(460px, calc(100% - 48px));
    margin: 0 auto;
    padding: 16px;
    border: 1px solid var(--bsc-border);
    border-radius: 10px;
    background: var(--bsc-bg-primary);
    box-shadow:
      0 12px 40px rgb(0 0 0 / 35%),
      0 2px 8px rgb(0 0 0 / 20%);
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

  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    text-wrap: balance;
  }

  .body {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--bsc-text-secondary);
    text-wrap: pretty;
  }

  .detail {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
    overflow-wrap: anywhere;
    user-select: text;
    cursor: text;
  }

  .detail::selection {
    background: rgb(255 85 0 / 30%);
  }

  /*
   * An indeterminate line: a short segment crossing a hairline track. Muted Ink rather than
   * the accent — waiting is not a state the accent marks. Square ends: at 2px a radius would be
   * a third one in a two-radius system, for no visible difference.
   */
  .progress {
    position: relative;
    width: 120px;
    height: 2px;
    margin: 16px 0 0;
    overflow: hidden;
    background: var(--bsc-border);
  }

  .progress span {
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: var(--bsc-text-secondary);
    animation: cross 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }

  @keyframes cross {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }

  /* Without motion a static segment would read as a stuck bar; the words carry it instead. */
  @media (prefers-reduced-motion: reduce) {
    .progress {
      display: none;
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }

  .dialog .actions {
    margin-top: 16px;
  }

  button:not(.scrim) {
    padding: 6px 14px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  /*
   * The default button sits one tonal step forward, on Field White — emphasis from the
   * neutrals, since the accent marks state and never decorates. The wash is layered over it
   * on hover rather than replacing it, so the step survives the hover.
   */
  button.default {
    background-color: var(--bsc-bg-secondary);
  }

  button:not(.scrim):hover:enabled {
    background-image: linear-gradient(var(--bsc-bg-hover), var(--bsc-bg-hover));
  }

  button:not(.scrim):focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  button:not(.scrim):disabled {
    color: var(--bsc-text-disabled);
  }
</style>
