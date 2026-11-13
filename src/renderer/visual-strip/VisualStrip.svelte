<script lang="ts">
  import { onMount } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import type { PageTheme } from '@shared/page-theme'
  import { NO_VISUALIZER, stripLayout } from '@shared/visualizer'
  import type { VisualizerConfig } from '@shared/visualizer'
  import Visualizer from '../lib/Visualizer.svelte'

  /*
   * The Visualizer's strip (CLAUDE.md §22): what is heard, standing on the top edge of
   * SoundCloud's player bar while this exists. A transparent view over the bottom of SoundCloud's
   * page, like the player buttons over the bar's right end: nothing is put into SoundCloud's page.
   * Main takes it away whenever the pointer comes near (what is under a view of ours cannot be
   * clicked), so it takes no input itself.
   *
   * It draws in SoundCloud's icon colour for the page's light or dark, or the theme's `@mode`, or
   * Glass (always dark), the same way the player buttons do: main tells it through `onPageTheme`.
   */

  /** SoundCloud's icon white on its dark page, and its icon grey on its light one (Player.svelte). */
  const INKS: Record<PageTheme, string> = { dark: '#fff', light: '#333' }

  /** Coming back after stepping aside, it fades in like a menu; going, it is gone at once. */
  const RETURN_MS = 180

  let page = $state<PageTheme>('dark')
  let visualizer = $state<VisualizerConfig>(NO_VISUALIZER)
  let strip = $state<HTMLElement | null>(null)

  onMount(() => {
    const stopTheme = window.bsc.onPageTheme((theme) => {
      page = theme
    })
    const stopVisualizer = window.bsc.onVisualizer((next) => {
      visualizer = next
    })
    void window.bsc.getVisualizer().then((next) => {
      if (next as unknown) visualizer = next
    })
    // Main hides this view to step aside; the page hears it as hidden, then visible again.
    const fadeIn = (): void => {
      if (document.visibilityState !== 'visible' || !strip) return
      strip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: RETURN_MS, easing: easing() })
    }
    document.addEventListener('visibilitychange', fadeIn)
    return () => {
      stopTheme()
      stopVisualizer()
      document.removeEventListener('visibilitychange', fadeIn)
    }
  })

  /** Svelte's `cubicOut`, as a CSS easing, sampled: the curve every fade of ours uses. */
  function easing(): string {
    const points = Array.from({ length: 9 }, (_, i) => cubicOut(i / 8).toFixed(3))
    return `linear(${points.join(', ')})`
  }
</script>

<div class="strip" bind:this={strip} data-bsc-visualizer-strip>
  {#if visualizer.strip}
    <Visualizer
      look={visualizer.strip}
      ink={INKS[page]}
      layout={() => stripLayout(window.innerWidth, window.innerHeight)}
      strip
    />
  {/if}
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: transparent;
    overflow: hidden;
  }

  .strip {
    height: 100vh;
  }
</style>
