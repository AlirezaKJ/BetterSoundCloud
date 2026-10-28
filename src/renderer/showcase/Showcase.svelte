<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { lyricClock } from '@shared/lyric-clock'
  import {
    artworkColour,
    artworkSources,
    formatClock,
    NEUTRAL_BACKDROP,
    showcaseBackdrop,
    showcaseInks
  } from '@shared/showcase'
  import type { Rgb, ShowcaseInks } from '@shared/showcase'
  import type { LyricsState } from '@shared/lyrics'
  import type { NowPlaying } from '@shared/now-playing'

  /*
   * The full-screen showcase: the playing track as a record sleeve.
   *
   * The artwork as a square print on the left; its title, artist and progress beside it, like
   * liner notes; and under them the line being sung, with the next ones fading in below. Behind
   * it all, one flat colour taken from the artwork and deepened until the text reads at 7:1
   * (src/shared/showcase.ts) — no blur, no gradient, nothing that glows.
   *
   * It reads what every view of ours reads: now-playing once a second, and the lyrics main looked
   * up while the showcase is open (the same ones the pane shows). It keeps time with the pane's
   * clock (`lyricClock`), so the two can never disagree. It never touches SoundCloud's page and
   * cannot control playback; leaving it changes nothing but the window.
   */

  /** How long the close button and the cursor stay once the pointer stops moving. */
  const CHROME_IDLE_MS = 2500
  /** The size the artwork is sampled at for its colour. A handful of pixels is plenty. */
  const SAMPLE = 24
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let playing = $state<NowPlaying | null>(null)
  let lyrics = $state<LyricsState>({ state: 'idle' })
  let current = $state(-1)
  let inks = $state<ShowcaseInks>(showcaseInks(NEUTRAL_BACKDROP))
  /** The artwork on screen. It changes only once the next one has loaded, with its colour. */
  let artwork = $state('')
  let chromeShown = $state(true)
  /** Whether the progress fill glides through the next second (a tick) or jumps (a seek). */
  let gliding = $state(false)
  /** How far the lyric lines are moved up, so the current one sits at the top. */
  let shift = $state(0)
  let prompter = $state<HTMLElement | null>(null)
  /** Bumped when the lyric area changes size, so the lines are measured again. */
  let resized = $state(0)

  let artworkWanted = ''
  let last = { elapsed: -1, playing: false }
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const clock = lyricClock((index) => {
    current = index
  })

  const elapsed = $derived(playing?.elapsed ?? 0)
  const duration = $derived(playing?.duration ?? 0)
  // Gliding, the fill heads for the next second over that second, so it is never behind.
  const fraction = $derived(
    duration > 0 ? Math.min(1, (elapsed + (gliding ? 1 : 0)) / duration) : 0
  )
  // Only this track's lyrics: for a moment after a skip the service still holds the last one's.
  const lines = $derived(
    lyrics.state === 'synced' &&
      playing !== null &&
      lyrics.track.title === playing.title &&
      lyrics.track.artist === playing.artist
      ? lyrics.lines
      : []
  )

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stopPlaying = window.bsc.onNowPlaying((next) => {
      notePlaying(next)
    })
    const stopLyrics = window.bsc.onLyrics((next) => {
      showLyrics(next)
    })
    void window.bsc.getNowPlaying().then((next) => {
      notePlaying(next)
    })
    void window.bsc.getLyrics().then((next) => {
      if (next as unknown) showLyrics(next)
    })

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.bsc.closeShowcase()
      else wake()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    wake()

    const observer = new ResizeObserver(() => {
      resized++
    })
    if (prompter) observer.observe(prompter)

    return () => {
      stopPlaying()
      stopLyrics()
      clock.stop()
      if (idleTimer) clearTimeout(idleTimer)
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  })

  function notePlaying(next: NowPlaying | null): void {
    const now = { elapsed: next?.elapsed ?? 0, playing: next?.playing ?? false }
    // The same second again (a like, say) changes nothing about the clock.
    if (now.elapsed !== last.elapsed || now.playing !== last.playing) {
      const step = now.elapsed - last.elapsed
      gliding = !REDUCED_MOTION && now.playing && step > 0 && step <= 1.5
      last = now
    }
    playing = next
    clock.setReading(next)
    loadArtwork(next?.artwork ?? '')
  }

  function showLyrics(next: LyricsState): void {
    lyrics = next
    if (next.state === 'synced') clock.setLines(next.lines, next.offset)
    else clock.setLines(null, 0)
  }

  /** Load the artwork, largest first, and take its colour. Nothing changes until it is in. */
  function loadArtwork(url: string): void {
    if (url === artworkWanted) return
    artworkWanted = url
    tryArtwork(artworkSources(url), url)
  }

  function tryArtwork(sources: string[], wanted: string): void {
    const [source, ...rest] = sources
    if (!source) {
      if (wanted !== artworkWanted) return
      artwork = ''
      inks = showcaseInks(NEUTRAL_BACKDROP)
      return
    }
    const image = new Image()
    // SoundCloud's image host answers `Access-Control-Allow-Origin: *` (measured), which is
    // what lets the artwork's pixels be read for its colour.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (wanted !== artworkWanted) return
      artwork = source
      inks = showcaseInks(showcaseBackdrop(sampleColour(image) ?? NEUTRAL_BACKDROP))
    }
    image.onerror = () => {
      tryArtwork(rest, wanted)
    }
    image.src = source
  }

  function sampleColour(image: HTMLImageElement): Rgb | null {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE
      canvas.height = SAMPLE
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
      return artworkColour(context.getImageData(0, 0, SAMPLE, SAMPLE).data)
    } catch {
      // A canvas the browser will not let us read: the neutral backdrop, not a broken view.
      return null
    }
  }

  /** Show the close button and the cursor, and hide them again once the pointer rests. */
  function wake(): void {
    chromeShown = true
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      chromeShown = false
    }, CHROME_IDLE_MS)
  }

  // Move the lines so the current one sits at the top of the lyric area. Before the first line,
  // the first sits there, still to come.
  $effect(() => {
    void resized
    const index = Math.max(0, current)
    if (!prompter || lines.length === 0) return
    const line = prompter.querySelector<HTMLElement>(`[data-line="${index}"]`)
    shift = line ? line.offsetTop : 0
  })
</script>

<main
  class="showcase"
  class:idle={!chromeShown}
  aria-label="Showcase"
  style:--backdrop={inks.backdrop}
  style:--ink={inks.ink}
  style:--muted={inks.muted}
  style:--faint={inks.faint}
  data-bsc-showcase
>
  <div class="sleeve">
    <div class="art" data-bsc-showcase-artwork>
      {#key artwork}
        {#if artwork}
          <img
            src={artwork}
            alt=""
            crossorigin="anonymous"
            in:fade={{ duration: REDUCED_MOTION ? 0 : 320 }}
          />
        {/if}
      {/key}
    </div>

    <div class="notes" data-bsc-showcase-notes>
      {#if playing}
        <h1>{playing.title || 'Untitled track'}</h1>
        {#if playing.artist}<p class="artist">{playing.artist}</p>{/if}

        <div class="time">
          {#if duration > 0}
            <div
              class="progress"
              role="progressbar"
              aria-label="Played"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={elapsed}
              aria-valuetext={`${formatClock(elapsed)} of ${formatClock(duration)}`}
            >
              <span class="fill" class:gliding style:transform={`scaleX(${fraction})`}></span>
            </div>
          {/if}
          <p class="clock">
            {#if !playing.playing}<span class="paused">Paused</span>{/if}
            {formatClock(elapsed)}{#if duration > 0}<span class="of"
                >&nbsp;/ {formatClock(duration)}</span
              >{/if}
          </p>
        </div>
      {:else}
        <h1 class="quiet">Nothing is playing</h1>
        <p class="artist">Play something on SoundCloud and it shows here.</p>
      {/if}

      <!-- The lyric area is always there, so measuring never waits on it; it is empty when the
           track has no timed lyrics. Lines are text, never markup. -->
      <div
        class="prompter"
        bind:this={prompter}
        role="region"
        aria-label="Lyrics"
        data-bsc-showcase-lyrics
      >
        {#if lines.length > 0}
          <ol
            class="lines"
            style:transform={`translateY(${-shift}px)`}
            in:fade={{ duration: REDUCED_MOTION ? 0 : 400 }}
          >
            {#each lines as line, index (index)}
              <li
                data-line={index}
                class:current={index === current}
                class:sung={index < current}
                aria-current={index === current ? 'true' : undefined}
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
        {/if}
      </div>
    </div>
  </div>

  <div class="corner top" class:shown={chromeShown}>
    <span class="hint">Press Esc to leave</span>
    <button
      class="close"
      type="button"
      title="Leave the showcase (Esc)"
      aria-label="Leave the showcase"
      onclick={() => window.bsc.closeShowcase()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
  </div>

  {#if lines.length > 0}
    <p
      class="corner bottom credit"
      class:shown={chromeShown}
      title="Looked up on lrclib.net, a free lyrics database. BetterSoundCloud sends it the track’s title, artist and length, and only while the lyrics pane or this showcase is open."
    >
      Lyrics from LRCLIB
    </p>
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    overflow: hidden;
  }

  /*
   * Type here goes past the 15px ceiling, under the Showcase Exception (DESIGN.md): the title
   * block and the lyric lines, read from across a room. Every size follows the screen, and the
   * smaller of its width and height, so a wide or a tall display gets the same proportions.
   */
  .showcase {
    --art: min(62vh, 44vw);
    --gap: clamp(32px, 5vw, 104px);
    --title: clamp(28px, min(3.2vw, 5.6vh), 64px);
    --artist: clamp(16px, min(1.3vw, 2.3vh), 26px);
    --lyric: clamp(22px, min(2.2vw, 3.9vh), 44px);

    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(24px, 6vh, 96px) clamp(24px, 6vw, 120px);
    background: var(--backdrop);
    color: var(--ink);
    /* The room changes colour with the track, slowly, so it is felt rather than seen. */
    transition: background-color 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .showcase.idle {
    cursor: none;
  }

  .sleeve {
    display: grid;
    grid-template-columns: var(--art) minmax(0, min(38vw, 880px));
    gap: var(--gap);
  }

  /* A printed sleeve: square, flat, with a hairline so a dark sleeve keeps its edge. */
  .art {
    position: relative;
    width: var(--art);
    aspect-ratio: 1;
    overflow: hidden;
    /* An empty sleeve, while the artwork loads or when there is none: barely there. */
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }

  .art::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    pointer-events: none;
  }

  .art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .notes {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: var(--art);
  }

  h1 {
    display: -webkit-box;
    /* Pulled up by the line's leading, so the capitals start level with the sleeve's top edge. */
    margin: -0.08em 0 0;
    overflow: hidden;
    font-size: var(--title);
    font-weight: 600;
    line-height: 1.06;
    letter-spacing: -0.02em;
    text-wrap: balance;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  h1.quiet {
    color: var(--muted);
  }

  .artist {
    display: -webkit-box;
    margin: 0.55em 0 0;
    overflow: hidden;
    font-size: var(--artist);
    line-height: 1.3;
    color: var(--muted);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .time {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: clamp(20px, 3.4vh, 40px);
  }

  /* A rule, not a slider: there is no knob, because nothing here can seek. */
  .progress {
    flex: 1;
    height: 2px;
    overflow: hidden;
    background: var(--faint);
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--ink);
    transform-origin: left;
  }

  .fill.gliding {
    transition: transform 1s linear;
  }

  .clock {
    margin: 0;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .of,
  .paused {
    color: var(--muted);
  }

  .paused {
    margin-right: 12px;
  }

  /*
   * The lyric area, anchored to the artwork's bottom edge. The current line rests at its top;
   * the ones to come fade out below, and the ones sung fade away as they move up.
   */
  .prompter {
    position: relative;
    flex: 0 1 auto;
    min-height: 0;
    height: calc(var(--lyric) * 1.22 * 4.6);
    margin-top: auto;
    overflow: hidden;
    mask-image: linear-gradient(#000 48%, transparent);
  }

  .lines {
    position: relative;
    margin: 0;
    padding: 0;
    list-style: none;
    transition: transform 560ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Every line at one weight, so nothing re-wraps as the song moves; ink marks the current. */
  .lines li {
    padding-bottom: 0.32em;
    font-size: var(--lyric);
    font-weight: 600;
    line-height: 1.22;
    letter-spacing: -0.01em;
    color: var(--muted);
    text-wrap: balance;
    transition:
      color 240ms ease-out,
      opacity 360ms ease-out;
  }

  .lines li.current {
    color: var(--ink);
  }

  .lines li.sung {
    opacity: 0;
  }

  .rest {
    display: inline-block;
    width: 1.1em;
    height: 2px;
    vertical-align: middle;
    background: currentcolor;
    transition: width 360ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .current .rest {
    width: 2.2em;
  }

  /* The only controls: at the corners, there while the pointer moves, gone once it rests. */
  .corner {
    position: fixed;
    opacity: 0;
    transition: opacity 240ms ease-out;
  }

  .corner.shown,
  .corner:focus-within {
    opacity: 1;
  }

  .top {
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bottom {
    bottom: 16px;
    left: 20px;
  }

  .hint,
  .credit {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--bsc-radius);
    background: transparent;
    color: var(--muted);
    cursor: default;
  }

  .close:hover {
    background: var(--bsc-danger);
    color: #fff;
  }

  .close:focus-visible {
    outline: 2px solid var(--bsc-focus);
    outline-offset: -2px;
  }

  .close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Selection is a state, so it takes the accent, mixed down so the text stays readable. */
  ::selection {
    background: color-mix(in srgb, var(--bsc-accent) 32%, transparent);
  }

  /* A tall screen: the sleeve above, the notes below it, the same width. */
  @media (max-aspect-ratio: 1/1) {
    .showcase {
      --art: min(44vh, 80vw);
      --title: clamp(26px, min(6vw, 4vh), 56px);
      --artist: clamp(16px, min(2.6vw, 1.9vh), 24px);
      --lyric: clamp(22px, min(4.4vw, 3vh), 40px);
    }

    .sleeve {
      grid-template-columns: var(--art);
      gap: clamp(24px, 4vh, 48px);
    }

    .notes {
      height: auto;
    }

    .prompter {
      margin-top: clamp(20px, 3vh, 36px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .showcase,
    .lines,
    .lines li,
    .rest,
    .corner {
      transition: none;
    }
  }
</style>
