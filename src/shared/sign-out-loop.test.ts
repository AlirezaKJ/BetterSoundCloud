import { describe, it, expect } from 'vitest'
import { SIGN_OUT_LOOP, isLogoutUrl, noteLogout } from './sign-out-loop'

describe('isLogoutUrl', () => {
  it('is SoundCloud’s own /logout, with or without a query', () => {
    expect(isLogoutUrl('https://soundcloud.com/logout')).toBe(true)
    expect(isLogoutUrl('https://soundcloud.com/logout?redirect=1')).toBe(true)
  })

  it('is no other page, host or scheme', () => {
    for (const url of [
      'https://soundcloud.com/discover',
      'https://soundcloud.com/logout/extra',
      'https://soundcloud.com/n/logout',
      'https://secure.soundcloud.com/logout',
      'http://soundcloud.com/logout',
      'not a url'
    ]) {
      expect(isLogoutUrl(url), url).toBe(false)
    }
  })
})

describe('noteLogout', () => {
  it('leaves one sign-out alone: the right-click menu’s Sign out goes to /logout too', () => {
    expect(noteLogout([], 1000).loop).toBe(false)
  })

  it('calls a run of them inside the window a loop (the 0.9.0 bug: one every 2.6s)', () => {
    let trips: number[] = []
    const loops: boolean[] = []
    for (const now of [0, 2600, 5200]) {
      const noted = noteLogout(trips, now)
      trips = noted.trips
      loops.push(noted.loop)
    }
    expect(loops).toEqual([false, false, true])
  })

  it('forgets trips older than the window, so occasional sign-outs never add up', () => {
    const late = SIGN_OUT_LOOP.withinMs + 1
    const first = noteLogout([], 0)
    const second = noteLogout(first.trips, late)
    const third = noteLogout(second.trips, late * 2)
    expect([first.loop, second.loop, third.loop]).toEqual([false, false, false])
    expect(third.trips).toEqual([late * 2])
  })
})
