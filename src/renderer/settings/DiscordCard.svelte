<script lang="ts">
  import { onMount } from 'svelte'
  import iconUrl from '../../../resources/icon.png?url'
  import { buildActivity, PRESENCE_LOGO } from '@shared/presence'
  import type { NowPlaying } from '@shared/now-playing'
  import type { Settings } from '@shared/settings-schema'
  import { formatClock } from '@shared/showcase'

  /*
   * The card your friends see on your Discord profile, at the top of Settings → Discord (chosen by
   * the maintainer, 2026-11-14). Built by the same `buildActivity` that sends it, from what is
   * playing now, so it shows exactly what Discord is given: the title, the artist, the artwork with
   * our badge, the progress, the two buttons. Drawn in our own colours, not Discord's: it is a
   * preview of what is sent, not an imitation of Discord. Nothing on it can be pressed.
   */

  let { values }: { values: Settings } = $props()

  let nowPlaying = $state<NowPlaying | null>(null)
  /** Ticks once a second with the reading, so the progress moves as it does on Discord. */
  let now = $state(Date.now())

  const enabled = $derived(values['discord.enabled'])
  const activity = $derived(
    buildActivity(nowPlaying, { showWhenPaused: values['discord.showWhenPaused'] }, now)
  )
  const artwork = $derived(
    activity && activity.assets.large_image !== PRESENCE_LOGO ? activity.assets.large_image : ''
  )
  const progress = $derived.by(() => {
    const times = activity?.timestamps
    if (!times?.end) return null
    const length = times.end - times.start
    const played = Math.min(Math.max(now - times.start, 0), length)
    return {
      share: length > 0 ? played / length : 0,
      played: formatClock(Math.floor(played / 1000)),
      length: formatClock(Math.round(length / 1000))
    }
  })

  /** Why there is no card, in words, when there is none. */
  const empty = $derived.by(() => {
    if (!enabled) return 'Rich Presence is off, so Discord shows nothing.'
    if (!nowPlaying) return 'Nothing is playing, so Discord shows no card.'
    return 'Paused: the card clears until you play again.'
  })

  onMount(() => {
    // Subscribe first, then read, so no change can slip between the two.
    const stop = window.bsc.onNowPlaying((np) => {
      nowPlaying = np
      now = Date.now()
    })
    void window.bsc.getNowPlaying().then((np) => {
      nowPlaying = np
      now = Date.now()
    })
    return stop
  })
</script>

<div class="preview" data-bsc-discord-card>
  {#if enabled && activity}
    <div class="card">
      <p class="kind">Listening to BetterSoundCloud</p>
      <div class="body">
        <div class="art">
          <img
            class="large"
            src={artwork || iconUrl}
            alt=""
            width="64"
            height="64"
            referrerpolicy="no-referrer"
          />
          {#if artwork}<img class="badge" src={iconUrl} alt="" width="20" height="20" />{/if}
        </div>
        <div class="words">
          <p class="title">{activity.details}</p>
          {#if activity.state}<p class="state">{activity.state}</p>{/if}
          {#if progress}
            <div class="progress">
              <span class="figures">{progress.played}</span>
              <span class="rule"><span style={`width: ${progress.share * 100}%`}></span></span>
              <span class="figures">{progress.length}</span>
            </div>
          {/if}
        </div>
      </div>
      {#each activity.buttons ?? [] as button (button.label)}
        <span class="button">{button.label}</span>
      {/each}
    </div>
    <p class="caption">What your friends see on your Discord profile, right now.</p>
  {:else}
    <p class="empty">{empty}</p>
  {/if}
</div>

<style>
  .preview {
    padding: 14px 0 6px;
  }

  .caption {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  /* A card that shows what is sent: Field White behind a hairline, the control radius. */
  .card {
    width: min(100%, 340px);
    padding: 12px;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
  }

  .card p {
    margin: 0;
  }

  .kind {
    font-size: 12px;
    font-weight: 600;
    color: var(--bsc-text-secondary);
  }

  .body {
    display: flex;
    gap: 12px;
    margin-top: 10px;
  }

  .art {
    position: relative;
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
  }

  .large {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: var(--bsc-radius);
    object-fit: cover;
  }

  /* Our badge in the artwork's corner, as Discord draws the small image. */
  .badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    border: 2px solid var(--bsc-bg-secondary);
    border-radius: var(--bsc-radius);
    background: var(--bsc-bg-secondary);
  }

  .words {
    min-width: 0;
    flex: 1;
  }

  .title,
  .state {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
  }

  .state {
    margin-top: 2px;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--bsc-text-secondary);
  }

  .figures {
    font-variant-numeric: tabular-nums;
  }

  .rule {
    position: relative;
    flex: 1;
    height: 2px;
    background: var(--bsc-border);
  }

  .rule span {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--bsc-text-primary);
  }

  /* Discord's buttons, as words in a box: a preview, so they do nothing. */
  .button {
    display: block;
    margin-top: 8px;
    padding: 5px 0;
    border: 1px solid var(--bsc-border);
    border-radius: var(--bsc-radius);
    font-size: 13px;
    text-align: center;
    color: var(--bsc-text-primary);
  }

  .empty {
    margin: 0;
    font-size: 13px;
    color: var(--bsc-text-secondary);
  }
</style>
