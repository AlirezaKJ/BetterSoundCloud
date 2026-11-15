<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import logoUrl from '../../../resources/logo.svg?url'
  import type { Settings, SettingKey } from '@shared/settings-schema'
  import type { ThemeSummary } from '@shared/themes'
  import type { PluginView } from '@shared/plugins'
  import type { GlassStatus } from '@shared/glass'
  import { describeGlassStatus } from '@shared/glass'
  import SettingFigure from '../settings/SettingFigure.svelte'
  import StatusText from '../settings/StatusText.svelte'
  import OnboardingFigure from './OnboardingFigure.svelte'
  import { updateReach } from '@shared/updates'
  import type { UpdateReach } from '@shared/updates'
  import { isChosen, stepsFor } from './steps'
  import type { Choice, SignInChoice } from './steps'

  /*
   * The first-run welcome (the maintainer's request, 2026-11-15, after Zen's and Helium's): one
   * question per screen, asked in large type and answered with picture tiles. The answer shown as
   * chosen is what is stored, so Enter keeps the default and moves on; 1 to 9 pick a tile. Every
   * answer is written as it is chosen, so Skip setup, or closing half way, keeps what was chosen.
   * The questions themselves are data, in steps.ts.
   */

  /** Means "no theme": never a file. Mirrors NO_THEME in main, as Themes.svelte does. */
  const NONE = 'vanilla'

  /** What this copy can do about updates, which words the updates question (or leaves it out). */
  let reach = $state<UpdateReach>('install')
  const steps = $derived(stepsFor(window.bsc.platform, reach))
  /** Every step but the welcome is a question. */
  const QUESTIONS = $derived(steps.length - 1)
  /** One progress segment per question. */
  const SEGMENTS = $derived(Array.from({ length: QUESTIONS }, (_unused, index) => index))
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let at = $state(0)
  /** 1 going forward, -1 going back: where the next question slides in from. */
  let direction = $state(1)
  let values = $state<Settings | null>(null)
  let themes = $state<ThemeSummary[]>([])
  let pictures = $state<Record<string, string>>({})
  let plugins = $state<PluginView[]>([])
  let pluginProblem = $state('')
  let glass = $state<GlassStatus | null>(null)
  let signIn = $state<SignInChoice['id']>('soundcloud')
  let importing = $state(false)
  let importLine = $state<{ lead: string; detail?: string; problem?: string } | null>(null)
  let page = $state<HTMLElement | null>(null)

  const step = $derived(steps[at] ?? steps[0])
  const isLast = $derived(at === steps.length - 1)
  const signInChoice = $derived(
    step?.kind === 'sign-in' ? step.choices.find((c) => c.id === signIn) : undefined
  )
  const continueLabel = $derived.by(() => {
    if (at === 0) return 'Get started'
    if (signInChoice) return importing ? 'Importing…' : signInChoice.action
    return 'Continue'
  })
  const themeTiles = $derived([
    { id: NONE, name: 'None', preview: [] as readonly string[] },
    ...themes.map((t) => ({ id: t.id, name: t.name, preview: t.preview }))
  ])
  const glassLine = $derived(
    glass && values?.['appearance.glass'] ? describeGlassStatus(glass) : null
  )

  const pluginOf = (id: string): PluginView | undefined => plugins.find((p) => p.id === id)

  /** What a plugin says about itself once on: its own line, or its state's. */
  function pluginLine(
    plugin: PluginView
  ): { lead: string; detail?: string; problem?: string } | null {
    if (!plugin.enabled) return null
    if (plugin.state === 'starting') return { lead: 'Starting…' }
    if (plugin.state === 'failed') return { lead: 'Stopped', problem: plugin.problem }
    if (plugin.state === 'running') return plugin.status ?? { lead: 'On' }
    return plugin.problem ? { lead: 'Not running', detail: plugin.problem } : null
  }

  async function write(set: Partial<Settings>): Promise<void> {
    for (const [key, value] of Object.entries(set)) {
      const next = await window.bsc.setSetting(key as SettingKey, value)
      if (next) values = next
    }
  }

  async function choose(choice: Choice): Promise<void> {
    await write(choice.set)
    // Glass says at once when it cannot show on this computer, rather than after the welcome.
    if ('appearance.glass' in choice.set) glass = await window.bsc.getGlassStatus()
  }

  async function setPlugin(id: string, on: boolean): Promise<void> {
    const result = await window.bsc.setPluginEnabled(id, on)
    if (!result) return
    plugins = result.plugins
    pluginProblem = result.error
  }

  async function go(index: number): Promise<void> {
    const next = Math.max(0, Math.min(steps.length - 1, index))
    if (next === at) return
    direction = next > at ? 1 : -1
    at = next
    importLine = null
    await tick()
    page?.scrollTo({ top: 0 })
    // The keyboard lands on the answer shown as chosen, so arrows and Enter work at once.
    const target =
      document.querySelector<HTMLElement>('[data-bsc-onboarding-choices] input:checked') ??
      document.querySelector<HTMLElement>('[data-bsc-onboarding-choices] input') ??
      document.querySelector<HTMLElement>('[data-bsc-onboarding-continue]')
    target?.focus({ preventScroll: true })
  }

  async function next(): Promise<void> {
    if (importing) return
    if (step?.kind !== 'sign-in') {
      await go(at + 1)
      return
    }
    if (signIn !== 'browser') {
      window.bsc.finishOnboarding(signIn === 'soundcloud')
      return
    }
    // The browser's sign-in: main's own file dialog; only the sign-in is taken (cookie-import.ts).
    importing = true
    importLine = null
    const result = await window.bsc.importBrowserSession()
    importing = false
    if (!result) return
    if (result.error) importLine = { lead: 'Not imported', problem: result.error }
    else if (result.imported > 0) window.bsc.finishOnboarding(false)
  }

  function skip(): void {
    window.bsc.finishOnboarding(false)
  }

  function onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (event.key === 'Enter') {
      // A button or link Enter would press does its own thing; anywhere else, Enter continues.
      if (target?.closest('button, a, summary')) return
      event.preventDefault()
      void next()
    } else if (/^[1-9]$/.test(event.key)) {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        '[data-bsc-onboarding-choices] input'
      )
      const input = inputs[Number(event.key) - 1]
      if (!input) return
      event.preventDefault()
      input.click()
      input.focus()
    }
  }

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stops = [
      window.bsc.onSettingsChanged((next) => {
        values = next
      }),
      window.bsc.onThemesChanged((next) => {
        themes = next
      }),
      window.bsc.onPluginsChanged((next) => {
        plugins = next
      })
    ]
    void window.bsc.getSettings().then((next) => (values = next))
    void window.bsc.listThemes().then((next) => (themes = next))
    void window.bsc.getThemePictures().then((next) => (pictures = next ?? {}))
    void window.bsc.listPlugins().then((next) => (plugins = next ?? []))
    void window.bsc.getUpdateStatus().then((status) => {
      if (status) reach = updateReach(status.kind)
    })
    void tick().then(() =>
      document.querySelector<HTMLElement>('[data-bsc-onboarding-continue]')?.focus()
    )
    return () => {
      for (const stop of stops) stop()
    }
  })
</script>

<svelte:window onkeydown={onKey} />

{#snippet frame(
  id: string,
  name: string,
  label: string,
  detail: string,
  chosen: boolean,
  onpick: () => void,
  face: 'picture' | 'plain'
)}
  <label
    class="tile {face === 'picture' ? 'has-picture' : 'plain'}"
    class:chosen
    data-bsc-onboarding-choice={id}
  >
    <input type="radio" {name} value={id} checked={chosen} onchange={onpick} />
    {#if face === 'picture'}
      <span class="ring"><span class="picture">{@render pictureFor(id)}</span></span>
      <span class="name">{label}</span>
      {#if detail}<span class="detail">{detail}</span>{/if}
    {:else}
      <span class="ring">
        <span class="panel">
          <span class="name">{label}</span>
          {#if detail}<span class="detail">{detail}</span>{/if}
        </span>
      </span>
    {/if}
  </label>
{/snippet}

{#snippet pictureFor(id: string)}
  {#if step?.kind === 'choice'}
    {@const picture = step.choices.find((c) => c.id === id)?.picture}
    {#if picture?.kind === 'mode'}
      <span class="mode"><SettingFigure name={picture.name} /></span>
    {:else if picture?.kind === 'figure'}
      <OnboardingFigure name={picture.name} />
    {/if}
  {:else if step?.kind === 'plugin'}
    <OnboardingFigure name={id === 'on' ? step.on.picture : step.off.picture} />
  {:else if step?.kind === 'theme'}
    {@const tile = themeTiles.find((t) => t.id === id)}
    {#if pictures[id]}
      <img src={pictures[id]} alt="" />
    {:else}
      <!-- No picture yet: the theme's own colours, as Settings → Themes shows them. -->
      <span class="bands">
        {#each tile?.preview ?? [] as colour, index (`${colour}-${index}`)}
          <span style:background-color={colour}></span>
        {/each}
      </span>
    {/if}
  {/if}
{/snippet}

<div class="welcome" data-bsc-onboarding>
  <main class="body" bind:this={page}>
    {#key at}
      <section
        class="step"
        data-bsc-onboarding-step={step?.id}
        in:fly={{ x: 14 * direction, duration: REDUCED_MOTION ? 0 : 180, easing: cubicOut }}
      >
        {#if step?.kind === 'welcome'}
          <img class="icon" src={logoUrl} alt="" width="63" height="40" />
        {/if}
        <h1 id="step-title">{step?.title}</h1>
        <p class="lead">{step?.lead}</p>

        {#if step?.kind === 'welcome'}
          <p class="aside">
            {QUESTIONS} questions, about a minute. Enter keeps what is chosen and moves on.
          </p>
        {:else if step?.kind === 'choice' && values}
          {@const current = values}
          <div
            class="choices"
            class:pictures={step.choices.some((c) => c.picture)}
            style:--count={step.choices.length}
            role="radiogroup"
            aria-labelledby="step-title"
            data-bsc-onboarding-choices
          >
            {#each step.choices as choice (choice.id)}
              {@render frame(
                choice.id,
                step.id,
                choice.label,
                choice.detail,
                isChosen(choice, current),
                () => void choose(choice),
                choice.picture ? 'picture' : 'plain'
              )}
            {/each}
          </div>
          {#if step.id === 'glass' && glassLine}
            <div class="line" role="status">
              <StatusText lead={glassLine.lead} detail={glassLine.detail} />
            </div>
          {/if}
        {:else if step?.kind === 'theme' && values}
          {@const chosenTheme = values['appearance.theme']}
          <div
            class="choices pictures themes"
            style:--count={3}
            role="radiogroup"
            aria-labelledby="step-title"
            data-bsc-onboarding-choices
          >
            {#each themeTiles as tile (tile.id)}
              {@render frame(
                tile.id,
                'theme',
                tile.name,
                '',
                chosenTheme === tile.id,
                () => void write({ 'appearance.theme': tile.id }),
                'picture'
              )}
            {/each}
          </div>
        {:else if step?.kind === 'plugin'}
          {@const plugin = pluginOf(step.plugin)}
          {@const on = plugin?.enabled === true}
          {@const id = step.plugin}
          <div
            class="choices pictures"
            style:--count={2}
            role="radiogroup"
            aria-labelledby="step-title"
            data-bsc-onboarding-choices
          >
            {@render frame(
              'on',
              step.id,
              step.on.label,
              step.on.detail,
              on,
              () => void setPlugin(id, true),
              'picture'
            )}
            {@render frame(
              'off',
              step.id,
              step.off.label,
              step.off.detail,
              !on,
              () => void setPlugin(id, false),
              'picture'
            )}
          </div>
          {@const line = plugin ? pluginLine(plugin) : null}
          {#if line || pluginProblem}
            <div class="line" role="status">
              {#if line}
                <StatusText
                  lead={line.lead}
                  detail={line.detail ?? ''}
                  problem={line.problem ?? ''}
                />
              {/if}
              {#if pluginProblem}<p class="problem">{pluginProblem}</p>{/if}
            </div>
          {/if}
          {#if plugin && on && plugin.actions.length > 0}
            <div class="buttons">
              {#each plugin.actions as action (action.id)}
                <button
                  type="button"
                  disabled={action.disabled === true}
                  onclick={() => window.bsc.pluginAction(id, action.id)}>{action.label}</button
                >
              {/each}
            </div>
          {/if}
        {:else if step?.kind === 'sign-in'}
          <div
            class="choices"
            style:--count={step.choices.length}
            role="radiogroup"
            aria-labelledby="step-title"
            data-bsc-onboarding-choices
          >
            {#each step.choices as choice (choice.id)}
              {@render frame(
                choice.id,
                step.id,
                choice.label,
                choice.detail,
                signIn === choice.id,
                () => (signIn = choice.id),
                'plain'
              )}
            {/each}
          </div>
          {#if importLine}
            <div class="line" role="status">
              <StatusText
                lead={importLine.lead}
                detail={importLine.detail ?? ''}
                problem={importLine.problem ?? ''}
              />
            </div>
          {/if}
        {/if}
      </section>
    {/key}
  </main>

  <footer class="foot" data-bsc-onboarding-foot>
    {#if at > 0}
      <button class="button" type="button" onclick={() => void go(at - 1)}>Back</button>
    {/if}
    <button
      class="button primary"
      type="button"
      disabled={importing}
      onclick={() => void next()}
      data-bsc-onboarding-continue
    >
      {continueLabel}
      <kbd aria-hidden="true">Enter</kbd>
    </button>
    {#if at > 0}
      <div class="progress">
        <span class="segments" aria-hidden="true">
          {#each SEGMENTS as index (index)}
            <span class="segment" class:done={index < at}></span>
          {/each}
        </span>
        <span class="count"><span class="sr-only">Question </span>{at} of {QUESTIONS}</span>
      </div>
    {/if}
    {#if !isLast}
      <button class="skip" type="button" onclick={skip}>Skip setup</button>
    {/if}
  </footer>
</div>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: var(--bsc-bg-primary);
    color: var(--bsc-text-primary);
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }

  /* One gutter for the question and the foot, wide on a wide window and never under 24px. */
  .welcome {
    --gutter: clamp(24px, 9vw, 160px);
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100vh;
  }

  .body {
    overflow-y: auto;
    padding: clamp(32px, 9vh, 96px) var(--gutter) 40px;
  }

  .icon {
    display: block;
    width: 63px;
    height: 40px;
    margin-bottom: 28px;
  }

  /* The Welcome Exception: the question, read like a page's headline, past the 15px ceiling. */
  h1 {
    max-width: 22ch;
    margin: 0;
    font-size: clamp(36px, 4.2vw, 56px);
    font-weight: 650;
    line-height: 1.08;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .lead {
    max-width: 66ch;
    margin: 16px 0 0;
    font-size: 15px;
    line-height: 1.5;
    color: var(--bsc-text-secondary);
  }

  .aside {
    margin: 24px 0 0;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }

  /* Word answers: as many across as there are, up to four (two below 860px wide). */
  .choices {
    display: grid;
    grid-template-columns: repeat(min(var(--count), 4), minmax(0, 1fr));
    gap: 20px 16px;
    max-width: calc(min(var(--count), 4) * 240px);
    margin-top: clamp(28px, 5vh, 48px);
  }

  /* Every picture answer in one row, up to four (the start page has four), so none falls under
     the foot at the first window size or the smallest. */
  .choices.pictures {
    grid-template-columns: repeat(min(var(--count), 4), minmax(0, 1fr));
    max-width: calc(min(var(--count), 4) * 320px);
  }

  /* Six themes in two rows that fit the first window size (1366×768) without scrolling. */
  .choices.themes {
    max-width: 840px;
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    cursor: default;
  }

  /* The radio stays for the keyboard and screen readers; the ring shows which is chosen. */
  .tile input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* The tile frame of Settings' pictures: a 2px ring with 3px of air, the accent when chosen. */
  .ring {
    display: block;
    padding: 3px;
    border: 2px solid transparent;
    border-radius: var(--bsc-radius);
  }

  .tile:hover .ring {
    border-color: var(--bsc-border);
  }

  .tile.chosen .ring {
    border-color: var(--bsc-accent);
  }

  .tile:has(input:focus-visible) .ring {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 3px;
  }

  /* A picture is a print: square, behind a Hairline. */
  .picture {
    display: block;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 1px solid var(--bsc-border);
    background: var(--bsc-bg-secondary);
  }

  .themes .picture {
    aspect-ratio: 16 / 9;
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }

  .picture :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* The Light or dark pictures, drawn for 120×76, fill the frame here. */
  .mode {
    display: block;
    height: 100%;
  }

  .mode :global(svg.figure) {
    width: 100%;
    height: 100%;
  }

  .bands {
    display: flex;
    height: 100%;
  }

  .bands span {
    flex: 1;
  }

  .tile.has-picture .name {
    margin-top: 10px;
    padding: 0 5px;
  }

  .tile.has-picture .detail {
    padding: 0 5px;
  }

  /* An answer with nothing to picture: its words on Field White, inside the same frame, every
     panel in a row as tall as the tallest. */
  .tile.plain .ring {
    flex: 1;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-sizing: border-box;
    height: 100%;
    min-height: 88px;
    padding: 14px 16px;
    border: 1px solid var(--bsc-border);
    border-radius: 3px;
    background: var(--bsc-bg-secondary);
  }

  .name {
    font-size: 15px;
    line-height: 1.35;
  }

  .tile.chosen .name {
    font-weight: 600;
  }

  .detail {
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--bsc-text-secondary);
  }

  .line {
    max-width: 70ch;
    margin-top: 20px;
    font-size: 12px;
  }

  .problem {
    margin: 4px 0 0;
    font-size: 12px;
  }

  .buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  /* The Prompt's button, as everywhere a status line offers one. */
  .buttons button,
  .button {
    height: 34px;
    padding: 0 16px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 14px;
    cursor: default;
  }

  .buttons button {
    height: 30px;
    padding: 0 12px;
    font-size: 13px;
  }

  .buttons button:hover,
  .button:hover {
    background: var(--bsc-bg-hover);
  }

  .buttons button:disabled {
    color: var(--bsc-text-disabled);
  }

  /* Continue: the one filled button, in Ink, so the way on is never in doubt. Emphasis from the
     neutrals; the accent stays for state. */
  .button.primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-color: var(--bsc-text-primary);
    background: var(--bsc-text-primary);
    color: var(--bsc-bg-primary);
    font-weight: 600;
  }

  .button.primary:hover {
    background: color-mix(in srgb, var(--bsc-text-primary) 86%, var(--bsc-bg-primary));
  }

  .button.primary:disabled {
    opacity: 0.6;
  }

  kbd {
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--bsc-bg-primary) 45%, transparent);
    border-radius: var(--bsc-radius);
    font-family: inherit;
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
  }

  .button:focus-visible,
  .buttons button:focus-visible,
  .skip:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 2px;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px var(--gutter) 18px;
    border-top: 1px solid var(--bsc-border);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    font-size: 12px;
    color: var(--bsc-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .segments {
    display: flex;
    gap: 4px;
  }

  /* Square-ended 2px rules, like the showcase's progress. */
  .segment {
    width: 16px;
    height: 2px;
    background: var(--bsc-border);
  }

  .segment.done {
    background: var(--bsc-text-primary);
  }

  .skip {
    margin-left: auto;
    padding: 4px 2px;
    border: 0;
    background: none;
    color: var(--bsc-text-secondary);
    font: inherit;
    font-size: 13px;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentcolor 45%, transparent);
    text-underline-offset: 2px;
    cursor: default;
  }

  .progress + .skip {
    margin-left: 24px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .skip:hover {
    color: var(--bsc-text-primary);
    text-decoration-color: currentcolor;
  }

  @media (max-width: 860px) {
    .choices:not(.pictures) {
      grid-template-columns: repeat(min(var(--count), 2), minmax(0, 1fr));
    }

    .segments {
      display: none;
    }
  }

  @media (forced-colors: active) {
    .tile.chosen .ring {
      border-color: Highlight;
    }

    .button.primary {
      forced-color-adjust: none;
      border-color: ButtonText;
      background: ButtonText;
      color: ButtonFace;
    }
  }
</style>
