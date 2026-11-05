import { describe, it, expect } from 'vitest'
import { focusCycle, nextFocusArea } from './focus-cycle'

const NONE_OPEN = { settings: false, lyrics: false, player: false }

describe('focusCycle', () => {
  it('goes from the bar to the page, then the lyrics pane and the player buttons when they are there', () => {
    expect(focusCycle(NONE_OPEN)).toEqual(['bar', 'page'])
    expect(focusCycle({ ...NONE_OPEN, player: true })).toEqual(['bar', 'page', 'player'])
    expect(focusCycle({ ...NONE_OPEN, lyrics: true, player: true })).toEqual([
      'bar',
      'page',
      'lyrics',
      'player'
    ])
  })

  it('keeps to Settings and the bar above it while Settings is open', () => {
    // Settings is a dialog over the page: F6 must not walk into what it covers.
    expect(focusCycle({ settings: true, lyrics: true, player: true })).toEqual([
      'bar',
      'settings'
    ])
  })
})

describe('nextFocusArea', () => {
  const cycle = focusCycle({ ...NONE_OPEN, lyrics: true, player: true })

  it('moves forwards with F6 and backwards with Shift+F6, wrapping at both ends', () => {
    expect(nextFocusArea(cycle, 'bar', false)).toBe('page')
    expect(nextFocusArea(cycle, 'page', false)).toBe('lyrics')
    expect(nextFocusArea(cycle, 'player', false)).toBe('bar')
    expect(nextFocusArea(cycle, 'bar', true)).toBe('player')
    expect(nextFocusArea(cycle, 'page', true)).toBe('bar')
  })

  it('starts at an end when focus is somewhere the cycle does not go', () => {
    // The page, say, while Settings is open and the cycle is only the bar and Settings.
    const settingsOpen = focusCycle({ ...NONE_OPEN, settings: true })
    expect(nextFocusArea(settingsOpen, 'page', false)).toBe('bar')
    expect(nextFocusArea(settingsOpen, 'page', true)).toBe('settings')
    expect(nextFocusArea(cycle, null, false)).toBe('bar')
  })

  it('stays put in a cycle of one', () => {
    expect(nextFocusArea(['bar'], 'bar', false)).toBe('bar')
  })
})
