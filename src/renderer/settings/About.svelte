<script lang="ts">
  import { onMount } from 'svelte'
  import changelog from '../../../CHANGELOG.md?raw'
  import iconUrl from '../../../resources/icon.png?url'
  import { changelogEntry } from '@shared/changelog'
  import type { ChangelogEntry, Inline } from '@shared/changelog'
  import UpdateStatus from './UpdateStatus.svelte'

  /*
   * Settings → About (chosen by the maintainer, 2026-11-14, as Microsoft's settings guidance
   * recommends one): the app, its version and whether it is up to date, where to report a problem,
   * what changed in this version, and what it is built from. "What's new" is this version's entry
   * of CHANGELOG.md, the same text as its release notes on GitHub, bundled at build time.
   */

  const REPOSITORY = 'https://github.com/AlirezaKJ/BetterSoundCloud'

  let version = $state('')
  const meta = $derived(
    [version && `Version ${version}`, 'MIT licence', 'by AlirezaKJ'].filter(Boolean).join(' · ')
  )
  const entry = $derived<ChangelogEntry | null>(
    version ? changelogEntry(changelog, version, REPOSITORY) : null
  )

  onMount(() => {
    void window.bsc.getUpdateStatus().then((status) => (version = status.current))
  })
</script>

<!-- A run of the changelog's text: bold, code, links, as text and never as markup. -->
{#snippet inline(parts: Inline[])}
  {#each parts as part, i (i)}{#if part.href}<a
        href={part.href}
        target="_blank"
        rel="noreferrer">{part.text}</a
      >{:else if part.strong}<strong>{part.text}</strong>{:else if part.code}<code
        >{part.text}</code
      >{:else}{part.text}{/if}{/each}
{/snippet}

<div class="app" data-bsc-about>
  <img src={iconUrl} alt="" width="56" height="56" />
  <div>
    <p class="app-name">BetterSoundCloud</p>
    <p class="meta">{meta}</p>
  </div>
</div>

<div class="update"><UpdateStatus /></div>

<p class="links" data-bsc-about-links>
  <a href={REPOSITORY} target="_blank" rel="noreferrer">GitHub</a>
  <span aria-hidden="true">·</span>
  <a href={`${REPOSITORY}/issues`} target="_blank" rel="noreferrer">Report a problem</a>
  <span aria-hidden="true">·</span>
  <a href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer">Every version’s notes</a>
</p>

<h2 class="group" data-bsc-about-whats-new>
  {version ? `What’s new in ${version}` : 'What’s new'}
</h2>
{#if entry}
  <div class="notes">
    {#each entry.blocks as block, i (i)}
      {#if block.kind === 'heading'}
        <h3>{@render inline(block.parts)}</h3>
      {:else if block.kind === 'item'}
        <p class="item">{@render inline(block.parts)}</p>
      {:else}
        <p>{@render inline(block.parts)}</p>
      {/if}
    {/each}
  </div>
{:else if version}
  <p class="help">
    This version’s notes aren’t in the app. They are on
    <a href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer">GitHub</a>.
  </p>
{/if}

<h2 class="group">Built with</h2>
<p class="help">
  Electron, in Castlabs’ build for Widevine, and Svelte. It ships Butterchurn with its MilkDrop
  presets, and Signalsmith Stretch for Pitch, each under its own licence, which comes with the
  app and is on
  <a href={`${REPOSITORY}/tree/main/resources/licenses`} target="_blank" rel="noreferrer"
    >GitHub</a
  >.
</p>

<style>
  .app {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 0 14px;
  }

  .app img {
    display: block;
  }

  .app p {
    margin: 0;
  }

  .app-name {
    font-size: 15px;
    font-weight: 600;
  }

  .meta {
    margin-top: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--bsc-text-secondary);
  }

  .update {
    padding-bottom: 4px;
  }

  .links {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }

  /* The theme list's group heading, as Settings uses for every group. */
  .group {
    margin: 24px 0 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--bsc-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--bsc-text-secondary);
  }

  .notes {
    max-width: 70ch;
  }

  .notes h3 {
    margin: 16px 0 0;
    font-size: 14px;
    font-weight: 600;
  }

  .notes p,
  .help {
    max-width: 70ch;
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--bsc-text-secondary);
  }

  /* A list item: the system's 6×1 dash as its mark, as the plugin rows list permissions. */
  .notes .item {
    position: relative;
    padding-left: 16px;
  }

  .notes .item::before {
    content: '';
    position: absolute;
    top: 0.72em;
    left: 2px;
    width: 6px;
    height: 1px;
    background: currentcolor;
  }

  strong {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  code {
    font: inherit;
    color: var(--bsc-text-primary);
  }

  a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentcolor 45%, transparent);
    text-underline-offset: 2px;
  }

  a:hover {
    color: var(--bsc-text-primary);
    text-decoration-color: currentcolor;
  }

  a:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: 2px;
  }
</style>
