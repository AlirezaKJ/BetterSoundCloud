import { describe, it, expect } from 'vitest'
import { buildActivity, describePresenceStatus, PRESENCE_LOGO, sameActivity } from './presence'
import type { Activity, PresenceStatus } from './presence'
import type { NowPlaying } from './now-playing'

const NOW = 1_800_000_000_000

const TRACK: NowPlaying = {
  title: 'Birahe',
  artist: 'Ali Sorena',
  url: 'https://soundcloud.com/first-programmer/birahe',
  artwork: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
  elapsed: 80,
  duration: 188,
  playing: true,
  liked: false
}

const PLAYING = { showWhenPaused: false }

describe('buildActivity', () => {
  it('builds the full listening card for a playing track', () => {
    expect(buildActivity(TRACK, PLAYING, NOW)).toEqual({
      type: 2,
      status_display_type: 2,
      details: 'Birahe',
      state: 'Ali Sorena',
      // Started 80s ago, ends 188s after it started: Discord draws the bar from these.
      timestamps: { start: NOW - 80_000, end: NOW - 80_000 + 188_000 },
      assets: {
        large_image: TRACK.artwork,
        small_image: PRESENCE_LOGO,
        small_text: 'BetterSoundCloud'
      },
      buttons: [
        { label: 'Listen on SoundCloud', url: TRACK.url },
        { label: 'Get BetterSoundCloud', url: 'https://bsc.akjstud.io/' }
      ],
      instance: false
    })
  })

  it('shows no card when nothing is loaded', () => {
    expect(buildActivity(null, PLAYING, NOW)).toBeNull()
    expect(buildActivity(null, { showWhenPaused: true }, NOW)).toBeNull()
  })

  it('clears on pause, unless asked to keep it — and then drops the progress bar', () => {
    const paused = { ...TRACK, playing: false }
    expect(buildActivity(paused, PLAYING, NOW)).toBeNull()

    const kept = buildActivity(paused, { showWhenPaused: true }, NOW)
    expect(kept?.state).toBe('Ali Sorena · Paused')
    expect(kept).not.toHaveProperty('timestamps')
    expect(kept?.buttons).toHaveLength(2)
  })

  it('falls back to our logo, once, when a track has no artwork', () => {
    const assets = buildActivity({ ...TRACK, artwork: '' }, PLAYING, NOW)?.assets
    expect(assets).toEqual({ large_image: PRESENCE_LOGO, large_text: 'BetterSoundCloud' })
  })

  it('leaves out what it could not read rather than sending it empty', () => {
    const bare = buildActivity({ ...TRACK, artist: '', url: '', duration: 0 }, PLAYING, NOW)
    expect(bare).not.toHaveProperty('state')
    // No track link, so only the app's own button.
    expect(bare?.buttons?.map((b) => b.label)).toEqual(['Get BetterSoundCloud'])
    // Still counting up from the start, with no end to count to.
    expect(bare?.timestamps).toEqual({ start: NOW - 80_000 })
  })

  it('keeps every text field inside Discord’s 2–128 character limits', () => {
    // Discord rejects the WHOLE update when one field is out of range, so a long title would
    // otherwise leave the previous track on the card.
    const long = buildActivity({ ...TRACK, title: 'x'.repeat(300) }, PLAYING, NOW)
    expect(long?.details.length).toBeLessThanOrEqual(128)
    expect(long?.details.endsWith('…')).toBe(true)

    const short = buildActivity({ ...TRACK, title: 'X', artist: 'Y' }, PLAYING, NOW)
    expect(short?.details.length).toBe(2)
    expect(short?.state?.length).toBe(2)
  })

  it('keeps the buttons inside Discord’s limits: two at most, short labels, https links', () => {
    const cards = [
      buildActivity(TRACK, PLAYING, NOW),
      buildActivity({ ...TRACK, url: '' }, PLAYING, NOW),
      buildActivity({ ...TRACK, playing: false }, { showWhenPaused: true }, NOW)
    ].filter((card): card is Activity => card !== null)
    for (const card of cards) {
      expect(card.buttons?.length).toBeLessThanOrEqual(2)
      for (const button of card.buttons ?? []) {
        expect(button.label.length).toBeLessThanOrEqual(32)
        expect(button.url).toMatch(/^https:\/\//)
        expect(button.url.length).toBeLessThanOrEqual(512)
      }
    }
  })

  it('never cuts an emoji in half when shortening', () => {
    const title = '🎵'.repeat(100) // 200 UTF-16 units
    const details = buildActivity({ ...TRACK, title }, PLAYING, NOW)?.details ?? ''
    expect(details.length).toBeLessThanOrEqual(128)
    // A lone surrogate would show as a broken glyph.
    expect(details).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })
})

describe('sameActivity', () => {
  const at = (now: number, elapsed: number) =>
    buildActivity({ ...TRACK, elapsed }, PLAYING, now)

  it('treats the clock ticking as no change', () => {
    // A second later, one second further in — and the reading arrived a little late.
    expect(sameActivity(at(NOW, 80), at(NOW + 1_400, 81))).toBe(true)
  })

  it('treats a seek, a new track and a pause as changes', () => {
    expect(sameActivity(at(NOW, 80), at(NOW + 1_000, 120))).toBe(false)
    expect(
      sameActivity(at(NOW, 80), buildActivity({ ...TRACK, title: 'Next' }, PLAYING, NOW))
    ).toBe(false)
    expect(
      sameActivity(
        at(NOW, 80),
        buildActivity({ ...TRACK, playing: false }, { showWhenPaused: true }, NOW)
      )
    ).toBe(false)
  })

  it('compares no card with no card, and nothing else', () => {
    expect(sameActivity(null, null)).toBe(true)
    expect(sameActivity(null, at(NOW, 80))).toBe(false)
    expect(sameActivity(at(NOW, 80), null)).toBe(false)
  })
})

describe('describePresenceStatus', () => {
  const connected = (
    extra: Partial<Extract<PresenceStatus, { state: 'connected' }>>
  ): PresenceStatus => ({
    state: 'connected',
    showing: null,
    hiddenWhilePaused: false,
    refused: '',
    ...extra
  })

  it('shows nothing when presence is switched off — the unticked box already says so', () => {
    expect(describePresenceStatus({ state: 'off' })).toBeNull()
  })

  it('says what the card shows, so "connected" is proof rather than a claim', () => {
    expect(
      describePresenceStatus(
        connected({ showing: { title: 'Birahe', artist: 'Ali Sorena', paused: false } })
      )
    ).toEqual({
      lead: 'Connected',
      detail: 'Showing “Birahe” by Ali Sorena.',
      problem: '',
      canRetry: false
    })
    expect(
      describePresenceStatus(
        connected({ showing: { title: 'Birahe', artist: '', paused: true } })
      )?.detail
    ).toBe('Showing “Birahe”, paused.')
  })

  it('explains an empty card instead of leaving it looking broken', () => {
    expect(describePresenceStatus(connected({}))?.detail).toBe(
      'Nothing is playing, so nothing is shown.'
    )
    expect(describePresenceStatus(connected({ hiddenWhilePaused: true }))?.detail).toMatch(
      /hidden while the track is paused/
    )
  })

  it('puts a refused update on its own line', () => {
    expect(
      describePresenceStatus(connected({ refused: 'child "activity" fails' }))?.problem
    ).toBe('Discord didn’t accept the last update: child "activity" fails')
  })

  it('tells the user what to do when Discord is closed, and offers to try again', () => {
    const message = describePresenceStatus({
      state: 'unavailable',
      reason: { kind: 'not-running' }
    })
    expect(message?.lead).toBe('Discord isn’t running')
    expect(message?.detail).toMatch(/Open the Discord desktop app/)
    expect(message?.canRetry).toBe(true)
  })

  it('passes Discord’s own words on when it refuses us', () => {
    expect(
      describePresenceStatus({
        state: 'unavailable',
        reason: { kind: 'refused', message: 'Invalid Client ID' }
      })?.detail
    ).toBe('It said: Invalid Client ID')
  })

  it('offers "Try now" only where trying again can change the answer', () => {
    const statuses: PresenceStatus[] = [
      { state: 'connecting' },
      connected({}),
      { state: 'unavailable', reason: { kind: 'not-running' } },
      { state: 'unavailable', reason: { kind: 'refused', message: 'x' } },
      { state: 'unavailable', reason: { kind: 'lost', message: 'x' } }
    ]
    expect(statuses.map((s) => describePresenceStatus(s)?.canRetry)).toEqual([
      false,
      false,
      true,
      true,
      true
    ])
  })
})
