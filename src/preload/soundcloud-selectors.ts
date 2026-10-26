/**
 * Every part of SoundCloud's page that BetterSoundCloud reads, in one file.
 *
 * These are SoundCloud's class names, not ours, and they change when SoundCloud redesigns.
 * When the now-playing info stops updating, this is the file to fix — usually one line.
 * Run `npm run dev` and play a track: main logs a `[now-playing]` line for every change,
 * and an empty field in that line points at the selector that went stale.
 *
 * A stale selector is harmless by construction. It reads as an empty string, the feature
 * goes quiet, nothing throws, and nothing in SoundCloud's page is touched.
 *
 * Sources: the bar, its buttons and the timeline were measured on the live page on
 * 2026-10-26. The parts inside the sound badge only exist while a track is loaded, and
 * follow soundcloud-rpc's `audioMonitorService.ts`, which reads the same elements.
 */
export const PLAYER_BAR = {
  /** The play bar along the bottom. Drawn after the page loads; survives in-app navigation. */
  bar: '.playControls',

  playButton: '.playControls__play',
  /** The class the play button carries while a track is playing. */
  playingClass: 'playing',

  /** Its `title` attribute is the track title, and its `href` is the track's page. */
  titleLink: '.playbackSoundBadge__titleLink',
  artist: '.playbackSoundBadge__lightLink',
  /** A span whose inline `background-image` is the artwork, and whose `aria-label` is the title. */
  artwork: '.playbackSoundBadge__avatar .image__lightOutline span',

  /** The last span is the visible clock; the first is a longer version for screen readers. */
  elapsed: '.playbackTimeline__timePassed span:last-child',
  duration: '.playbackTimeline__duration span:last-child',

  likeButton: '.playbackSoundBadge__like',
  /** The class the like button carries once the track is liked. */
  likedClass: 'sc-button-selected'
} as const
