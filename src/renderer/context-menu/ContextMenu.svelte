<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { cleanUrl, shortUrl, elide } from '@shared/context-menu'
  import type { ContextMenuAction, ContextMenuRequest } from '@shared/context-menu'

  /*
   * The right-click menu, drawn in a transparent view that covers SoundCloud's page while
   * the menu is open. Main decides WHEN it opens and WHAT was under the cursor (see
   * src/main/context-menu.ts); this file decides what to offer and draws it.
   *
   * Two things are deliberately unlike a web page:
   *   - The backdrop closes on pointer DOWN, not click, so dismissal feels as immediate as a
   *     native menu. That press goes no further — it never reaches SoundCloud.
   *   - The menu leaves the instant an item is chosen, with no exit animation. A menu that
   *     lingers after a click reads as slow, however short the fade.
   *
   * "Go to URL…" is the one item that stays on screen: it turns this same view into a small
   * prompt rather than opening another one.
   */

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  /** The prompt is a dialog and gets the settings panel's entrance. The menu uses CSS below. */
  const DIALOG_MS = REDUCED_MOTION ? 0 : 180

  /** Outline glyphs in the same family as the header's: a 24-unit box, stroked, never filled. */
  const ICONS = {
    cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12',
    copy: 'M9 9h11v11H9zM15 9V4H4v11h5',
    paste:
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z',
    'select-all':
      'M5 3h3M11 3h2M16 3h3M3 5v3M3 11v2M3 16v3M21 5v3M21 11v2M21 16v3M5 21h3M11 21h2M16 21h3',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    book: 'M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 0 2 2h13M11 10h5M13.5 7.5v5',
    external: 'M14 4h6v6M20 4l-9 9M18 13v6H5V6h6',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    sparkles:
      'M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 3v3M17.5 4.5h3M5 17v3M3.5 18.5h3',
    image: 'M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5M16 9h.01',
    back: 'M15 5 8 12l7 7',
    forward: 'm9 5 7 7-7 7',
    reload: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
    globe:
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18',
    go: 'M5 12h14M13 6l6 6-6 6',
    settings:
      'M15.1 12a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0zM19.1 14.4a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.03z',
    'sign-out': 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
    code: 'M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16'
  }

  type IconName = keyof typeof ICONS

  type Item = {
    /** `go-to` is handled here — it opens the prompt. Everything else goes to main. */
    action: ContextMenuAction | 'go-to'
    label: string
    icon: IconName | null
    disabled?: boolean
    /** For `replace-misspelling`: the word to put in. */
    text?: string
  }

  /** An item with the group it belongs to, so the template can draw a rule between groups. */
  type Entry = Item & { group: number }

  let request = $state<ContextMenuRequest | null>(null)
  let mode = $state<'menu' | 'go-to'>('menu')
  /** Index into `entries` of the highlighted item; -1 for none, which is how a menu opens. */
  let active = $state(-1)
  let menuEl = $state<HTMLDivElement>()
  let itemEls = $state<HTMLButtonElement[]>([])
  let inputEl = $state<HTMLInputElement>()
  let gotoText = $state('')
  let gotoError = $state('')

  const entries = $derived(request ? flatten(buildGroups(request)) : [])
  /** One line above the items saying which link, image or text this menu is about. */
  const note = $derived(request ? describe(request) : '')
  const menuLabel = $derived(
    !request
      ? ''
      : request.linkURL
        ? 'Link menu'
        : request.imageURL
          ? 'Image menu'
          : 'Page menu'
  )

  /**
   * What to offer, from what was under the cursor. Only items that can do something appear:
   * "Copy clean link" is listed only when there is something to strip, so the menu never
   * offers two items that would copy the same text.
   */
  function buildGroups(r: ContextMenuRequest): Item[][] {
    const groups: Item[][] = []

    if (r.misspelledWord) {
      groups.push([
        ...r.suggestions.map((word): Item => ({
          action: 'replace-misspelling',
          label: word,
          icon: null,
          text: word
        })),
        { action: 'add-to-dictionary', label: 'Add to dictionary', icon: 'book' }
      ])
    }

    if (r.isEditable) {
      groups.push([
        { action: 'cut', label: 'Cut', icon: 'cut', disabled: !r.canCut },
        { action: 'copy', label: 'Copy', icon: 'copy', disabled: !r.canCopy },
        { action: 'paste', label: 'Paste', icon: 'paste', disabled: !r.canPaste },
        { action: 'select-all', label: 'Select all', icon: 'select-all' }
      ])
    } else if (r.selectionText) {
      groups.push([
        { action: 'copy', label: 'Copy', icon: 'copy' },
        {
          action: 'search-selection',
          label: `Search SoundCloud for “${elide(r.selectionText, 20)}”`,
          icon: 'search'
        }
      ])
    }

    if (r.linkURL) {
      const link: Item[] = [
        { action: 'open-link-in-browser', label: 'Open link in browser', icon: 'external' },
        { action: 'copy-link', label: 'Copy link', icon: 'link' }
      ]
      if (cleanUrl(r.linkURL) !== r.linkURL) {
        link.push({ action: 'copy-clean-link', label: 'Copy clean link', icon: 'sparkles' })
      }
      groups.push(link)
    }

    if (r.imageURL) {
      groups.push([
        { action: 'copy-image-address', label: 'Copy image address', icon: 'image' }
      ])
    }

    groups.push([
      { action: 'back', label: 'Back', icon: 'back', disabled: !r.canGoBack },
      { action: 'forward', label: 'Forward', icon: 'forward', disabled: !r.canGoForward },
      { action: 'reload', label: 'Reload', icon: 'reload' }
    ])

    const page: Item[] = [{ action: 'copy-page-link', label: 'Copy page link', icon: 'globe' }]
    if (cleanUrl(r.pageURL) !== r.pageURL) {
      page.push({
        action: 'copy-clean-page-link',
        label: 'Copy clean page link',
        icon: 'sparkles'
      })
    }
    page.push({ action: 'go-to', label: 'Go to URL…', icon: 'go' })
    groups.push(page)

    groups.push([{ action: 'settings', label: 'Settings', icon: 'settings' }])
    groups.push([{ action: 'sign-out', label: 'Sign out', icon: 'sign-out' }])
    if (r.canInspect)
      groups.push([{ action: 'inspect', label: 'Inspect element', icon: 'code' }])

    return groups
  }

  function flatten(groups: Item[][]): Entry[] {
    return groups.flatMap((group, index) => group.map((item) => ({ ...item, group: index })))
  }

  function describe(r: ContextMenuRequest): string {
    if (r.isEditable) return ''
    if (r.linkURL) return shortUrl(r.linkURL)
    if (r.imageURL) return shortUrl(r.imageURL)
    if (r.selectionText) return `“${elide(r.selectionText, 60)}”`
    return ''
  }

  function show(next: ContextMenuRequest): void {
    request = next
    mode = 'menu'
    active = -1
    gotoText = ''
    gotoError = ''
  }

  function close(): void {
    if (!request) return
    request = null
    window.bsc.closeContextMenu()
  }

  function choose(item: Item): void {
    if (item.disabled) return
    if (item.action === 'go-to') {
      mode = 'go-to'
      return
    }
    window.bsc.contextMenuAction(item.action, item.text)
    // Main hides the view. Forget the menu now as well, so nothing stale can be painted if
    // the view is shown again before the next request lands.
    request = null
  }

  async function submitGoto(): Promise<void> {
    const result = await window.bsc.goToUrl(gotoText)
    if (result === 'invalid') {
      gotoError =
        'That doesn’t look like a link. Try a SoundCloud address, or a path like artist/track.'
      inputEl?.select()
      return
    }
    // Main has navigated, or opened the browser, and hidden this view.
    request = null
  }

  /** Arrow keys walk the items; Enter and Space choose. Escape is handled for the whole view. */
  function onMenuKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Home') highlight(0, 1)
    else if (e.key === 'End') highlight(entries.length - 1, -1)
    else if (e.key === 'Enter' || e.key === ' ') {
      const entry = entries[active]
      if (entry) choose(entry)
    } else if (e.key === 'Tab') close()
    else return
    // Also stops the focused button firing its own click on Enter or Space.
    e.preventDefault()
  }

  function move(step: 1 | -1): void {
    const from = active < 0 ? (step === 1 ? 0 : entries.length - 1) : active + step
    highlight(from, step)
  }

  /** Highlight and focus the nearest enabled entry from `from`, walking by `step`, wrapping. */
  function highlight(from: number, step: 1 | -1): void {
    const count = entries.length
    for (let n = 0; n < count; n++) {
      const i = (((from + n * step) % count) + count) % count
      const entry = entries[i]
      if (entry && !entry.disabled) {
        active = i
        itemEls[i]?.focus()
        return
      }
    }
  }

  // Place the menu once it has a size: at the cursor, or flipped to the other side of it when
  // it would run off an edge, which is what a native menu does. Then take keyboard focus.
  $effect(() => {
    if (!request || mode !== 'menu' || !menuEl) return
    const { width, height } = menuEl.getBoundingClientRect()
    const margin = 8
    let left = request.x
    let top = request.y
    if (left + width > window.innerWidth - margin) left = Math.max(margin, left - width)
    if (top + height > window.innerHeight - margin) top = Math.max(margin, top - height)
    menuEl.style.left = `${left}px`
    menuEl.style.top = `${top}px`
    menuEl.style.visibility = 'visible'
    menuEl.focus()
  })

  $effect(() => {
    if (mode === 'go-to') inputEl?.focus()
  })

  onMount(() => {
    const stop = window.bsc.onContextMenu(show)
    // Nothing in this document wants a native menu — Electron draws none anyway, but a
    // right-click on the backdrop must not do anything else either.
    const swallow = (e: Event): void => e.preventDefault()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('contextmenu', swallow)
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      window.removeEventListener('contextmenu', swallow)
      window.removeEventListener('keydown', onKey)
    }
  })
</script>

{#if request}
  <!--
    The click-catcher. A button, so closing by clicking outside needs no suppressed a11y
    rule; `tabindex="-1"` keeps Tab from landing on it.
  -->
  <button
    type="button"
    class="backdrop"
    aria-label="Close menu"
    tabindex="-1"
    onpointerdown={close}
  ></button>

  {#if mode === 'menu'}
    {#key request}
      <div
        class="menu"
        role="menu"
        tabindex="-1"
        aria-label={menuLabel}
        data-bsc-context-menu
        bind:this={menuEl}
        onkeydown={onMenuKey}
        onpointerleave={() => (active = -1)}
      >
        {#if note}<div class="note" aria-hidden="true">{note}</div>{/if}

        {#each entries as entry, i (i)}
          {#if i > 0 && entry.group !== entries[i - 1]?.group}
            <div class="separator" role="separator"></div>
          {/if}
          <button
            type="button"
            role="menuitem"
            class="item"
            class:active={i === active}
            tabindex={i === active ? 0 : -1}
            disabled={entry.disabled}
            bind:this={itemEls[i]}
            onpointerenter={() => (active = i)}
            onclick={() => choose(entry)}
          >
            <span class="glyph" aria-hidden="true">
              {#if entry.icon}
                <svg viewBox="0 0 24 24"><path d={ICONS[entry.icon]} /></svg>
              {/if}
            </span>
            <span class="label">{entry.label}</span>
          </button>
        {/each}
      </div>
    {/key}
  {:else}
    <!--
      A dialog, so it gets the scrim the menu itself does not. Intro only: closing hides the
      whole view at once, and a fading copy of the prompt must not be left over the next menu.
    -->
    <div class="scrim" in:fade={{ duration: DIALOG_MS }}></div>
    <div
      class="prompt"
      role="dialog"
      aria-modal="true"
      aria-label="Go to URL"
      data-bsc-go-to
      in:fly={{ y: 14, duration: DIALOG_MS, easing: cubicOut }}
    >
      <form
        onsubmit={(e) => {
          e.preventDefault()
          void submitGoto()
        }}
      >
        <label for="go-to">Go to</label>
        <div class="row">
          <input
            id="go-to"
            type="text"
            placeholder="soundcloud.com/…"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="go-to-hint"
            bind:value={gotoText}
            bind:this={inputEl}
          />
          <button type="submit" class="go">Go</button>
        </div>
        <p id="go-to-hint" class="hint" class:error={gotoError !== ''} aria-live="polite">
          {gotoError || 'A SoundCloud link or path. Other sites open in your browser.'}
        </p>
      </form>
    </div>
  {/if}
{/if}

<style>
  /* Transparent all the way down: SoundCloud shows through everywhere but the menu itself. */
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 45%);
    /* The backdrop underneath is what closes the prompt. */
    pointer-events: none;
  }

  /*
   * The menu floats, so it carries the system's one shadow and the 10px radius of things
   * that float. Unlike the settings panel it brings no scrim: it takes input, but any click
   * dismisses it, and dimming the page for something that transient would be noise.
   */
  .menu {
    position: fixed;
    /* Until the effect above has measured and placed it. */
    visibility: hidden;
    min-width: 208px;
    max-width: 320px;
    /* A short window scrolls the menu rather than cutting it off, as a native menu would. */
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--bsc-border);
    /* Item radius (6px) plus the padding, so the corners are concentric. */
    border-radius: 10px;
    background: var(--bsc-bg-primary);
    box-shadow:
      0 12px 40px rgb(0 0 0 / 35%),
      0 2px 8px rgb(0 0 0 / 20%);
    font-size: 13px;
    user-select: none;
    outline: none;
    animation: menu-in 100ms cubic-bezier(0.2, 0, 0, 1);
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
    }
  }

  .note {
    padding: 5px 8px 6px;
    font-size: 12px;
    color: var(--bsc-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    text-align: left;
    cursor: default;
  }

  /* One highlight, driven by state, so the mouse and the keyboard can never show two. */
  .item.active {
    background: var(--bsc-bg-hover);
  }

  .item:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .item:disabled {
    color: var(--bsc-text-disabled);
  }

  .glyph {
    display: grid;
    place-items: center;
    color: var(--bsc-text-secondary);
  }

  .item:disabled .glyph {
    color: inherit;
  }

  .glyph svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--bsc-border);
  }

  .prompt {
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

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  input {
    flex: 1;
    min-width: 0;
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

  input::selection {
    background: rgb(255 85 0 / 30%);
  }

  input:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -1px;
  }

  .go {
    padding: 6px 14px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  .go:hover {
    background: var(--bsc-bg-hover);
  }

  .go:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .hint {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  /* Ink rather than red: Danger Red is reserved for the close button, and the words do the work. */
  .hint.error {
    color: var(--bsc-text-primary);
  }
</style>
