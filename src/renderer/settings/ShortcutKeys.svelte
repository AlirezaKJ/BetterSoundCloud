<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    joinKeys,
    keyLabels,
    keyText,
    MAX_KEYS,
    parseKeys,
    pressToKeys
  } from '@shared/shortcuts'
  import type { KeyPress } from '@shared/shortcuts'

  /*
   * A shortcut's keys, in the control column of its row in Settings → Shortcuts: a button per key
   * combination (up to two) showing its keys as chips, pressed to record a new one in its place;
   * "+" to add a second; "Set a key" when there is none.
   *
   * Recording listens for the next combination with Ctrl, Alt or ⌘, or an F key. One that cannot be
   * used is said in the row (`check`), and it goes on listening; the first that can is saved. Esc
   * keeps what was there, Backspace removes it, Tab leaves. While it listens, main answers no
   * shortcut (`recordingShortcut`), so even a key that is set already reaches it. What the row
   * says while it listens is the row's: this tells it (`onstate`).
   */
  let {
    id,
    label,
    value,
    platform,
    check,
    describedBy,
    onchange,
    onstate
  }: {
    /** For the row's search landing: the first button. */
    id: string
    /** The shortcut's name, for what the buttons say to a screen reader. */
    label: string
    /** The setting's value: up to two combinations, or ''. */
    value: string
    platform: string
    /** Why a combination cannot be this shortcut's, in a sentence, or '' when it can. */
    check: (keys: string) => string
    /** The row's live line, which says how to record and what went wrong. */
    describedBy: string
    onchange: (value: string) => void
    /** Recording or not; why the last key cannot be used; whether a key is there to replace. */
    onstate: (state: { recording: boolean; problem: string; replacing: boolean }) => void
  } = $props()

  const keys = $derived(parseKeys(value))

  /** The slot listening: a key's place to replace it, `keys.length` to add one; null when none. */
  let recording = $state<number | null>(null)
  /** The modifiers held so far while listening, drawn as chips. */
  let holding = $state<string[]>([])
  let listener = $state<HTMLButtonElement | null>(null)
  let box = $state<HTMLElement | null>(null)
  /** After saving or removing, the slot whose button takes focus once the setting is back. */
  let focusSlot = $state<number | null>(null)

  async function start(slot: number): Promise<void> {
    recording = slot
    holding = []
    window.bsc.recordingShortcut(true)
    onstate({ recording: true, problem: '', replacing: slot < keys.length })
    await tick()
    listener?.focus()
  }

  function stop(): void {
    if (recording === null) return
    recording = null
    holding = []
    window.bsc.recordingShortcut(false)
    onstate({ recording: false, problem: '', replacing: false })
  }

  function save(slot: number, next: string[]): void {
    stop()
    focusSlot = Math.min(slot, next.length)
    onchange(joinKeys(next))
  }

  /** The modifiers of a press with no key yet, as chips: Ctrl, Alt, Shift (⌘ ⌥ ⇧ ⌃ on a Mac). */
  function heldParts(press: KeyPress): string[] {
    const mac = platform === 'darwin'
    const parts: string[] = []
    if (mac ? press.meta : press.control) parts.push(mac ? '⌘' : 'Ctrl')
    if (mac && press.control) parts.push('⌃')
    if (press.alt) parts.push(mac ? '⌥' : 'Alt')
    if (press.shift) parts.push(mac ? '⇧' : 'Shift')
    return parts
  }

  function onKey(e: KeyboardEvent): void {
    const slot = recording
    if (slot === null || e.isComposing) return
    const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
    // Tab leaves, as from any control, keeping what was there.
    if (plain && e.key === 'Tab') return stop()
    // Every other key is the recorder's: not Settings' Escape, not its search key.
    e.preventDefault()
    e.stopPropagation()
    if (plain && e.key === 'Escape') return stop()
    if (plain && (e.key === 'Backspace' || e.key === 'Delete')) {
      if (slot >= keys.length) return stop()
      return save(
        slot,
        keys.filter((_, i) => i !== slot)
      )
    }
    const press: KeyPress = {
      key: e.key,
      code: e.code,
      control: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    }
    const combo = pressToKeys(press, platform)
    if (!combo) {
      holding = heldParts(press)
      return
    }
    holding = []
    // Already this shortcut's: nothing to change.
    if (keys.includes(combo)) return stop()
    const why = check(combo)
    if (why) {
      onstate({ recording: true, problem: why, replacing: slot < keys.length })
      return
    }
    const next = [...keys]
    next[slot] = combo
    save(slot, next)
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (recording === null) return
    holding = heldParts({
      key: '',
      code: '',
      control: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    })
  }

  // Focus follows the key just saved or removed, once the setting comes back with it.
  $effect(() => {
    const slot = focusSlot
    if (slot === null || keys.length < slot) return
    focusSlot = null
    void tick().then(() => box?.querySelectorAll<HTMLButtonElement>('button')[slot]?.focus())
  })

  onDestroy(() => {
    if (recording !== null) window.bsc.recordingShortcut(false)
  })
</script>

<div class="keys" bind:this={box} data-bsc-keys>
  {#each keys as combo, i (i)}
    <!-- Two combinations read as two, not as one long one. -->
    {#if i > 0}<span class="or" aria-hidden="true">or</span>{/if}
    {#if recording === i}
      {@render listening(i)}
    {:else}
      <button
        id={i === 0 ? id : undefined}
        class="combo"
        aria-label={`${label}: ${keyText(combo, platform)}. Press to change`}
        title="Change"
        onclick={() => start(i)}
      >
        {#each keyLabels(combo, platform) as part, p (p)}<kbd>{part}</kbd>{/each}
      </button>
    {/if}
  {/each}
  {#if recording === keys.length}
    {@render listening(keys.length)}
  {:else if keys.length === 0}
    <button {id} class="set" aria-label={`Set a key for ${label}`} onclick={() => start(0)}
      >Set a key</button
    >
  {/if}
  <!-- "+" has a column of its own, held empty when it is not offered, so every row's keys end on
       one line down the panel's right edge. -->
  {#if keys.length > 0 && keys.length < MAX_KEYS && recording === null}
    <button
      class="add"
      aria-label={`Add another key for ${label}`}
      title="Add another key"
      onclick={() => start(keys.length)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
    </button>
  {:else}
    <span class="add-slot" aria-hidden="true"></span>
  {/if}
</div>

<!-- Listening: a field-like box saying so, with the modifiers held so far. -->
{#snippet listening(slot: number)}
  <button
    bind:this={listener}
    id={slot === 0 ? id : undefined}
    class="listening"
    aria-label={`Press the new keys for ${label}`}
    aria-describedby={describedBy}
    onkeydown={onKey}
    onkeyup={onKeyUp}
    onblur={stop}
  >
    {#if holding.length > 0}
      {#each holding as part (part)}<kbd>{part}</kbd>{/each}<span class="more">…</span>
    {:else}
      Press keys…
    {/if}
  </button>
{/snippet}

<style>
  .keys {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  /* A key, as printed on it: the field's surface and hairline, as everywhere in Settings. */
  kbd {
    display: inline-block;
    min-width: 26px;
    padding: 2px 6px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
  }

  /* A combination: its chips, and the Hover Wash behind them when pointed at, like a chrome
     button. The ring is inset, in the 3px around the chips. */
  .combo {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    font: inherit;
    cursor: default;
  }

  .combo:hover {
    background: var(--bsc-bg-hover);
  }

  /* Listening: a field, as wide as the panel's fields so the column keeps its edge, saying so. */
  .listening {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 140px;
    min-height: 30px;
    padding: 2px 8px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-secondary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  .more {
    color: var(--bsc-text-secondary);
  }

  .or {
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  /* The Prompt's button at 13px, as "Restart now" is. */
  .set {
    padding: 4px 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  .set:hover {
    background: var(--bsc-bg-hover);
  }

  /* "+", a chrome button: transparent until pointed at, a 15px stroked glyph. Its slot keeps the
     same width when it is not there. */
  .add-slot {
    width: 26px;
    flex: none;
  }

  .add {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-secondary);
    cursor: default;
  }

  .add:hover {
    background: var(--bsc-bg-hover);
    color: var(--bsc-text-primary);
  }

  .add svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .combo:focus-visible,
  .set:focus-visible,
  .add:focus-visible,
  .listening:focus {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  @media (forced-colors: active) {
    .combo:hover,
    .add:hover,
    .set:hover {
      background: transparent;
    }
  }
</style>
