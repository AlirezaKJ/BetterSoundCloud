import { describe, it, expect } from 'vitest'
import { GLASS_PLATFORMS, describeGlassStatus, glassTint, pageMode } from './glass'
import type { GlassStatus } from './glass'
import { isStyledFrameUrl } from './frames'
import { HIDDEN, HIDE_DELAY_MS, nextReveal } from './auto-hide'
import type { RevealInput } from './auto-hide'
import { SETTINGS } from './settings-schema'

describe('glassTint', () => {
  it('is 0xAARRGGBB: the strength as alpha over a near-black', () => {
    expect(glassTint(0)).toBe(0x000e0e0e)
    expect(glassTint(100)).toBe(0xff0e0e0e)
    expect(glassTint(35)).toBe(0x590e0e0e)
  })

  it('clamps nonsense instead of handing the native layer a negative or huge number', () => {
    expect(glassTint(-20)).toBe(glassTint(0))
    expect(glassTint(400)).toBe(glassTint(100))
    expect(glassTint(Number.NaN)).toBe(glassTint(0))
  })

  it('stays unsigned, as the native side reads it', () => {
    expect(glassTint(100)).toBeGreaterThan(0)
  })
})

describe('the Glass settings', () => {
  it('are offered only where the native layer exists', () => {
    expect(GLASS_PLATFORMS).toEqual(['win32'])
    for (const key of ['appearance.glass', 'appearance.glassTint'] as const) {
      const def = SETTINGS[key]
      expect('platforms' in def && def.platforms).toEqual(['win32'])
    }
  })

  it('say under the switch when there is no glass, so a ticked box never silently does nothing', () => {
    const def = SETTINGS['appearance.glass']
    expect('statusFrom' in def && def.statusFrom).toBe('glass')
  })
})

describe('pageMode', () => {
  it('is dark on glass, whatever SoundCloud or the theme says: the glass is a near-black', () => {
    expect(pageMode(true, null)).toBe('dark')
    expect(pageMode(true, 'light')).toBe('dark')
    expect(pageMode(true, 'dark')).toBe('dark')
  })

  it('is the theme’s @mode without glass, or null to follow SoundCloud', () => {
    expect(pageMode(false, 'light')).toBe('light')
    expect(pageMode(false, null)).toBeNull()
  })
})

describe('describeGlassStatus', () => {
  it('says nothing when the box already tells the truth: off, or glass on screen', () => {
    expect(describeGlassStatus('off')).toBeNull()
    expect(describeGlassStatus('on')).toBeNull()
  })

  it('names the reason, and what to do, whenever the box is ticked and there is no glass', () => {
    const reasons: GlassStatus[] = [
      'safe-mode',
      'no-acceleration',
      'restart',
      'not-built',
      'refused'
    ]
    const lines = reasons.map((status) => describeGlassStatus(status))
    for (const line of lines) {
      expect(line?.lead).toMatch(/^\S+( \S+){0,3}$/) // the state in a few words
      expect(line?.detail).toMatch(/\.$/)
    }
    expect(describeGlassStatus('no-acceleration')?.detail).toContain('Advanced')
    expect(describeGlassStatus('refused')?.detail).toContain('Windows 11')
  })
})

describe('isStyledFrameUrl', () => {
  it('is SoundCloud’s own /n/ pages, the iframes it draws its newer pages in', () => {
    expect(isStyledFrameUrl('https://soundcloud.com/n/gootdubz/crunk')).toBe(true)
    expect(isStyledFrameUrl('https://soundcloud.com/n/embeds/credit-tracker?x=1')).toBe(true)
  })

  it('is never any other frame: classic pages, the sign-in box, ads, look-alike hosts', () => {
    for (const url of [
      'https://soundcloud.com/gootdubz/crunk',
      'https://secure.soundcloud.com/web-auth?client_id=x',
      'https://cm.g.doubleclick.net/partnerpixels',
      'https://soundcloud.com.evil.example/n/x',
      'http://soundcloud.com/n/x',
      'https://soundcloud.com:8443/n/x',
      'about:blank',
      ''
    ]) {
      expect(isStyledFrameUrl(url), url).toBe(false)
    }
  })
})

describe('nextReveal', () => {
  const at = (over: Partial<RevealInput>): RevealInput => ({
    x: 500,
    y: 300,
    width: 1200,
    headerHeight: 46,
    focused: true,
    now: 10_000,
    ...over
  })

  it('reveals when the pointer touches the top edge of a focused window', () => {
    expect(nextReveal(HIDDEN, at({ y: 0 })).revealed).toBe(true)
    expect(nextReveal(HIDDEN, at({ y: -2 })).revealed).toBe(true)
  })

  it('does not reveal for an unfocused window, or a pointer beside the window', () => {
    expect(nextReveal(HIDDEN, at({ y: 0, focused: false })).revealed).toBe(false)
    expect(nextReveal(HIDDEN, at({ y: 0, x: -10 })).revealed).toBe(false)
    expect(nextReveal(HIDDEN, at({ y: 0, x: 1300 })).revealed).toBe(false)
  })

  it('stays while the pointer is on or just under the header', () => {
    const shown = nextReveal(HIDDEN, at({ y: 0 }))
    expect(nextReveal(shown, at({ y: 40 }))).toEqual({ revealed: true, awaySince: 0 })
    expect(nextReveal(shown, at({ y: 46 + 20 })).revealed).toBe(true)
  })

  it('goes only after the pointer has been away for a moment, so a quick dip does not flicker', () => {
    const shown = nextReveal(HIDDEN, at({ y: 0 }))
    const away = nextReveal(shown, at({ y: 400, now: 10_000 }))
    expect(away.revealed).toBe(true)
    expect(nextReveal(away, at({ y: 400, now: 10_000 + HIDE_DELAY_MS - 1 })).revealed).toBe(
      true
    )
    expect(nextReveal(away, at({ y: 400, now: 10_000 + HIDE_DELAY_MS }))).toEqual(HIDDEN)
  })

  it('forgets an absence the moment the pointer comes back', () => {
    const shown = nextReveal(HIDDEN, at({ y: 0 }))
    const away = nextReveal(shown, at({ y: 400, now: 10_000 }))
    const back = nextReveal(away, at({ y: 20, now: 10_300 }))
    const awayAgain = nextReveal(back, at({ y: 400, now: 10_600 }))
    expect(
      nextReveal(awayAgain, at({ y: 400, now: 10_600 + HIDE_DELAY_MS - 1 })).revealed
    ).toBe(true)
  })
})
