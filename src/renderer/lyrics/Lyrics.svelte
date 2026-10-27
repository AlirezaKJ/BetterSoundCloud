<script lang="ts">
  import { onMount } from 'svelte'
  import { currentLineIndex, playbackPosition } from '@shared/lyrics'
  import type { ClockAnchor, LyricsState } from '@shared/lyrics'
  import type { NowPlaying } from '@shared/now-playing'

  /*
   * The lyrics pane, docked at the right of SoundCloud's page.
   *
   * Main owns everything but the clock: it looks the track up on LRCLIB and sends a
   * `LyricsState` whenever there is something new to show (src/main/lyrics.ts). The pane keeps
   * time itself, from the now-playing pushes every view gets: SoundCloud's clock only says whole
   * seconds, so between its ticks the position runs on (`playbackPosition`). Nothing polls. The
   * pane knows when the next line starts, so it sets one timer for that moment, and plans again
   * whenever a clock reading, a new track or a nudge arrives — exact to the millisecond, and
   * idle between lines.
   *
   * Every line is text, rendered as text — v0.7.x wrote LRCLIB's answers in with innerHTML.
   */

  /** Where the current line rests while following: a third of the way down, read at eye level. */
  const READING_LINE = 0.32

  let lyrics = $state<LyricsState>({ state: 'idle' })
  let current = $state(-1)
  /** Whether the pane scrolls itself to the current line. Scrolling by hand stops it. */
  let following = $state(true)
  let body = $state<HTMLElement | null>(null)
  let anchor: ClockAnchor = { elapsed: 0, at: 0, playing: false }
  let shownKey = ''
  /** The one timer: when the next line starts. */
  let nextLine: ReturnType<typeof setTimeout> | null = null

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const track = $derived(lyrics.state === 'idle' ? null : lyrics.track)
  const offsetLabel = $derived(lyrics.state === 'synced' ? formatOffset(lyrics.offset) : '')
  const credit = $derived(
    lyrics.state === 'synced' || lyrics.state === 'plain' || lyrics.state === 'instrumental'
      ? `“${lyrics.match.track}” by ${lyrics.match.artist}`
      : ''
  )

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopLyrics = window.bsc.onLyrics((next) => {
      show(next)
    })
    const stopPlaying = window.bsc.onNowPlaying((next) => {
      noteClock(next)
    })
    void window.bsc.getLyrics().then((next) => {
      if (next as unknown) show(next)
    })
    void window.bsc.getNowPlaying().then(noteClock)

    const stopScrolling = (): void => {
      following = false
    }
    body?.addEventListener('wheel', stopScrolling, { passive: true })
    body?.addEventListener('touchmove', stopScrolling, { passive: true })
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.bsc.closeLyrics()
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        following = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      stopLyrics()
      stopPlaying()
      if (nextLine) clearTimeout(nextLine)
      body?.removeEventListener('wheel', stopScrolling)
      body?.removeEventListener('touchmove', stopScrolling)
      window.removeEventListener('keydown', onKey)
    }
  })

  function show(next: LyricsState): void {
    const key = next.state === 'idle' ? '' : next.track.key
    lyrics = next
    if (key !== shownKey) {
      // A different track starts at the top, following.
      shownKey = key
      current = -1
      following = true
      body?.scrollTo({ top: 0 })
    }
    planLines()
  }

  /** Re-anchor on a new clock reading. The same second again (a like, say) keeps the anchor. */
  function noteClock(nowPlaying: NowPlaying | null): void {
    const elapsed = nowPlaying?.elapsed ?? 0
    const playing = nowPlaying?.playing ?? false
    if (elapsed !== anchor.elapsed || playing !== anchor.playing) {
      anchor = { elapsed, at: performance.now(), playing }
      planLines()
    }
  }

  /**
   * Light the line being sung now, and set the timer for when the next one starts. While the
   * clock runs past the last reading, `playbackPosition` caps it, so a timer that lands early
   * finds the same line and plans again; the next reading replans in any case.
   */
  function planLines(): void {
    if (nextLine) clearTimeout(nextLine)
    nextLine = null
    if (lyrics.state !== 'synced') return
    const position = playbackPosition(anchor, performance.now()) - lyrics.offset
    const index = currentLineIndex(lyrics.lines, position)
    if (index !== current) current = index
    const upcoming = lyrics.lines[index + 1]
    if (!anchor.playing || !upcoming) return
    nextLine = setTimeout(planLines, Math.max(0, (upcoming.time - position) * 1000) + 5)
  }

  // Keep the current line at reading height while following.
  $effect(() => {
    const index = current
    if (!following || !body || index < 0) return
    const line = body.querySelector<HTMLElement>(`[data-line="${index}"]`)
    if (!line) return
    body.scrollTo({
      top: line.offsetTop - body.clientHeight * READING_LINE,
      behavior: reduceMotion.matches ? 'auto' : 'smooth'
    })
  })

  function formatOffset(seconds: number): string {
    if (seconds === 0) return 'On time'
    return `${seconds > 0 ? '+' : '−'}${Math.abs(seconds).toFixed(1)} s`
  }
</script>

<section class="pane" data-bsc-lyrics aria-label="Lyrics">
  <header data-bsc-lyrics-header>
    <div class="heading">
      <h1>{track?.title ?? 'Lyrics'}</h1>
      {#if track?.artist}<p class="artist">{track.artist}</p>{/if}
    </div>
    <button
      class="close"
      type="button"
      title="Close lyrics (Esc)"
      aria-label="Close lyrics"
      onclick={() => window.bsc.closeLyrics()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
  </header>

  <!-- Focusable, so the lines can be scrolled from the keyboard as well as the wheel: a
       scrollable region nobody can reach by keyboard fails WCAG 2.1.1, which outweighs the
       general rule against a tab stop on a non-interactive element. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="body"
    bind:this={body}
    role="region"
    aria-label="Lyric lines"
    tabindex="0"
    data-bsc-lyrics-body
  >
    {#if lyrics.state === 'synced'}
      <ol class="lines">
        {#each lyrics.lines as line, index (index)}
          <li
            data-line={index}
            class:current={index === current}
            class:past={index < current}
            aria-current={index === current ? 'true' : undefined}
            data-bsc-lyrics-line
          >
            {#if line.text}
              {line.text}
            {:else}
              <!-- A pause between lines: a short rest, not a glyph. -->
              <span class="rest" role="img" aria-label="Instrumental"></span>
            {/if}
          </li>
        {/each}
      </ol>
    {:else if lyrics.state === 'plain'}
      <p class="note">These lyrics aren’t timed, so they don’t follow the song.</p>
      <ol class="lines untimed">
        {#each lyrics.lines as line, index (index)}
          <li class:gap={line === ''}>{line}</li>
        {/each}
      </ol>
    {:else}
      <div class="message" role="status">
        {#if lyrics.state === 'idle'}
          <p class="lead">Nothing is playing.</p>
          <p class="note">Lyrics show here as soon as a track plays.</p>
        {:else if lyrics.state === 'loading'}
          <p class="lead">Looking up lyrics…</p>
          <div class="progress" aria-hidden="true"><span></span></div>
        {:else if lyrics.state === 'instrumental'}
          <p class="lead">Instrumental.</p>
          <p class="note">LRCLIB lists this track as having no lyrics.</p>
        {:else if lyrics.state === 'none'}
          <p class="lead">No lyrics found.</p>
          <p class="note">
            LRCLIB has nothing for “{lyrics.searched.track}” by {lyrics.searched.artist}.
          </p>
        {:else if lyrics.state === 'error'}
          <p class="lead">Couldn’t reach LRCLIB.</p>
          <p class="note">Check your connection, then try again.</p>
          <button class="action" type="button" onclick={() => window.bsc.retryLyrics()}>
            Try again
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if lyrics.state === 'synced' && !following && current >= 0}
    <button class="action follow" type="button" onclick={() => (following = true)}>
      Back to the current line
    </button>
  {/if}

  <footer data-bsc-lyrics-footer>
    {#if lyrics.state === 'synced'}
      <div class="timing" role="group" aria-label="Lyrics timing">
        <span class="label">Timing</span>
        <button
          class="step"
          type="button"
          title="Show each line half a second earlier"
          aria-label="Earlier"
          onclick={() => window.bsc.nudgeLyrics(-0.5)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" /></svg>
        </button>
        <output aria-live="polite">{offsetLabel}</output>
        <button
          class="step"
          type="button"
          title="Show each line half a second later"
          aria-label="Later"
          onclick={() => window.bsc.nudgeLyrics(0.5)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" /></svg>
        </button>
      </div>
    {/if}
    <p
      class="credit"
      title="Looked up on lrclib.net, a free lyrics database. BetterSoundCloud sends it the track’s title, artist and length, and only while this pane is open."
    >
      From LRCLIB{credit ? ` · ${credit}` : ''}
    </p>
  </footer>
</section>

<style>
  .pane {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    /* The pane's edge against SoundCloud's page: the system's Hairline, nothing heavier. */
    border-left: 1px solid var(--bsc-border);
    background: var(--bsc-bg-primary);
    color: var(--bsc-text-primary);
    position: relative;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 10px 12px 20px;
    border-bottom: 1px solid var(--bsc-border);
  }

  .heading {
    flex: 1;
    min-width: 0;
    padding-top: 3px;
  }

  h1 {
    margin: 0;
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .artist {
    margin: 2px 0 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--bsc-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The settings panel's close button, so a close looks like a close everywhere. */
  .close {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-secondary);
    cursor: default;
  }

  .close:hover {
    background: var(--bsc-danger);
    color: #fff;
  }

  .close svg,
  .step svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Lines fade out under the header and footer rather than being cut by them. */
  .body {
    position: relative;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px 20px 0;
    mask-image: linear-gradient(transparent, #000 20px, #000 calc(100% - 28px), transparent);
  }

  .body:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  .lines {
    margin: 0;
    padding: 0 0 45vh;
    list-style: none;
  }

  /*
   * The lyric lines: the one place type goes past the 15px ceiling (DESIGN.md, "the Lyrics
   * Exception"). Lyrics are the content of this pane, read from arm's length while something
   * else has the user's attention, so they get the size content needs; nothing around them does.
   * Weight and ink carry the current line — no accent, no bar, no glow. Every line stays at
   * Muted Ink or darker, so the lines not being sung still pass AA.
   */
  .lines li {
    padding: 5px 0;
    font-size: 20px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
    text-wrap: pretty;
    transition: color 160ms ease-out;
  }

  .lines li.current {
    font-weight: 600;
    color: var(--bsc-text-primary);
  }

  .untimed li {
    color: var(--bsc-text-primary);
  }

  .untimed li.gap {
    height: 14px;
    padding: 0;
  }

  .rest {
    display: inline-block;
    width: 24px;
    height: 1px;
    vertical-align: middle;
    background: currentcolor;
    transition: width 160ms ease-out;
  }

  .current .rest {
    width: 48px;
  }

  .message {
    padding-top: 4px;
  }

  .lead {
    margin: 0;
    font-size: 14px;
  }

  .note {
    margin: 4px 0 0;
    max-width: 44ch;
    font-size: 12px;
    line-height: 1.4;
    color: var(--bsc-text-secondary);
  }

  .lines.untimed {
    margin-top: 16px;
  }

  /* The page-status wait line: proof the lookup is not stuck, never the accent. */
  .progress {
    position: relative;
    width: 120px;
    height: 2px;
    margin: 14px 0 0;
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

  /* The Prompt's button, the panel's one button language. */
  .action {
    margin-top: 14px;
    padding: 4px 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
    color: var(--bsc-text-primary);
    font: inherit;
    font-size: 13px;
    cursor: default;
  }

  .action:hover {
    background: var(--bsc-bg-hover);
  }

  .follow {
    position: absolute;
    right: 20px;
    bottom: 76px;
    margin: 0;
  }

  footer {
    padding: 8px 12px 10px 20px;
    border-top: 1px solid var(--bsc-border);
  }

  .timing {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 4px;
  }

  .label {
    flex: 1;
    font-size: 13px;
  }

  .step {
    display: grid;
    place-items: center;
    width: 30px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--bsc-text-primary);
    cursor: default;
  }

  .step:hover {
    background: var(--bsc-bg-hover);
  }

  output {
    min-width: 56px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--bsc-text-secondary);
  }

  .credit {
    margin: 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--bsc-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:focus-visible {
    outline: 2px solid var(--bsc-accent);
    outline-offset: -2px;
  }

  /* Selection is a state, so it takes the accent, mixed down so the text stays readable. */
  ::selection {
    background: color-mix(in srgb, var(--bsc-accent) 28%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .lines li,
    .rest {
      transition: none;
    }

    .progress {
      display: none;
    }
  }
</style>
