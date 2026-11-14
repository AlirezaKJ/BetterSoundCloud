import { describe, expect, it } from 'vitest'
import {
  attributeSelector,
  markMatches,
  OTHER_ENTRIES,
  searchSettings,
  searchWords
} from './settings-search'
import type { SearchEntry } from './settings-search'

const tray: SearchEntry = {
  section: 'general',
  name: 'Minimize to tray on close',
  text: 'Closing the window keeps the music playing.',
  target: '[data-bsc-setting="general.minimizeToTray"]'
}
const zoom: SearchEntry = {
  section: 'appearance',
  name: 'Zoom',
  text: 'Makes SoundCloud’s page bigger or smaller.',
  target: '[data-bsc-setting="appearance.zoomFactor"]'
}
const glass: SearchEntry = {
  section: 'themes',
  name: 'Glass',
  text: 'A live blur of whatever is behind the window.',
  target: '[data-bsc-setting="appearance.glass"]'
}
const windowButtons: SearchEntry = {
  section: 'appearance',
  name: 'Hide the BetterSoundCloud bar',
  text: 'Moves the window buttons into SoundCloud’s header.',
  target: '[data-bsc-setting="appearance.hideMenuBar"]'
}
const ENTRIES = [glass, tray, zoom, windowButtons]

describe('searchWords', () => {
  it('folds case, accents and curly apostrophes, and keeps each word once', () => {
    expect(searchWords('  Café  SOUNDCLOUD’S café ')).toEqual(['cafe', "soundcloud's"])
  })

  it('is empty for nothing but spaces', () => {
    expect(searchWords('   ')).toEqual([])
  })
})

describe('searchSettings', () => {
  it('finds nothing for an empty query', () => {
    expect(searchSettings(ENTRIES, ' ')).toEqual([])
  })

  it('needs every word, in any order, from the name or the explanation', () => {
    const groups = searchSettings(ENTRIES, 'tray music')
    expect(groups.map((g) => g.hits.map((h) => h.entry.name))).toEqual([
      ['Minimize to tray on close']
    ])
    expect(searchSettings(ENTRIES, 'tray zoom')).toEqual([])
  })

  it('groups by section in the sidebar’s order, not the entries’', () => {
    const groups = searchSettings(ENTRIES, 'window')
    expect(groups.map((g) => g.section)).toEqual(['general', 'appearance', 'themes'])
  })

  it('puts a match in the name before a match only in the explanation', () => {
    const groups = searchSettings(ENTRIES, 'soundcloud')
    expect(groups[0]?.hits.map((h) => h.entry.name)).toEqual([
      'Hide the BetterSoundCloud bar',
      'Zoom'
    ])
  })

  it('puts a section with a match in a name before one matched only in explanations', () => {
    // "dark cloud": the Appearance setting says "dark" and "SoundCloud"; the theme is called it.
    const appearance: SearchEntry = {
      section: 'appearance',
      name: 'Appearance',
      text: 'Light or dark for SoundCloud’s page.',
      target: '[data-bsc-setting="appearance.colorScheme"]'
    }
    const theme: SearchEntry = {
      section: 'themes',
      name: 'Dark Cloud',
      text: 'A deeper dark.',
      target: '[data-bsc-theme="darkcloud"]'
    }
    const groups = searchSettings([appearance, theme], 'dark cloud')
    expect(groups.map((g) => g.section)).toEqual(['themes', 'appearance'])
  })

  it('matches a straight apostrophe against a curly one', () => {
    expect(searchSettings(ENTRIES, "soundcloud's page")[0]?.hits[0]?.entry).toBe(zoom)
  })
})

describe('markMatches', () => {
  it('marks every place a word occurs, keeping the original characters', () => {
    expect(markMatches('Tray, then TRAY', ['tray'])).toEqual([
      { text: 'Tray', match: true },
      { text: ', then ', match: false },
      { text: 'TRAY', match: true }
    ])
  })

  it('joins overlapping words into one run', () => {
    expect(markMatches('Glass tint', ['glass t', 'tint'])).toEqual([
      { text: 'Glass tint', match: true }
    ])
  })

  it('marks across an accent without shifting the text', () => {
    expect(markMatches('Le café ouvert', ['cafe'])).toEqual([
      { text: 'Le ', match: false },
      { text: 'café', match: true },
      { text: ' ouvert', match: false }
    ])
  })

  it('returns the whole text unmarked when nothing matches', () => {
    expect(markMatches('Zoom', ['tray'])).toEqual([{ text: 'Zoom', match: false }])
  })
})

describe('attributeSelector', () => {
  it('escapes quotes and backslashes in a value', () => {
    expect(attributeSelector('data-bsc-theme', 'my "dark"\\theme')).toBe(
      '[data-bsc-theme="my \\"dark\\"\\\\theme"]'
    )
  })
})

describe('OTHER_ENTRIES', () => {
  it('each lands on a row by a selector', () => {
    for (const entry of OTHER_ENTRIES)
      expect(entry.target).toMatch(/^\[data-bsc-[a-z-]+(=".+")?\]$/)
  })
})
