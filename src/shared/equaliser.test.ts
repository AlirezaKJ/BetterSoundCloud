import { describe, it, expect } from 'vitest'
import { chainResponseDb } from './audio'
import {
  bandLabel,
  formatGains,
  gainLabel,
  graphicEqualiser,
  matchingPreset,
  parseGains,
  snapGain
} from './equaliser'

/** Spotify's bands, which the bundled Equaliser plugin uses. */
const BANDS = [60, 150, 400, 1000, 2400, 15000]

/** Curves a listener would make, including the extremes. */
const CURVES: number[][] = [
  [6, 4, 0, 0, 0, 0],
  [-6, -4, 0, 0, 0, 0],
  [0, 0, 0, 0, 3, 6],
  [-2, -1, 2, 4, 2, 0],
  [5, 2, 0, -1, 1, 4],
  [12, 0, 0, 0, 0, 0],
  [0, 0, 12, 0, 0, 0],
  [0, 0, 0, 0, 0, -12],
  [12, 12, 12, 12, 12, 12],
  [12, -12, 12, -12, 12, -12],
  [10, 6, 0, 0, 6, 10]
]

describe('graphicEqualiser', () => {
  it('asks for nothing when every band is at 0', () => {
    expect(graphicEqualiser(BANDS, [0, 0, 0, 0, 0, 0])).toEqual([])
  })

  it('makes a low shelf, peaks in between, and a high shelf', () => {
    const filters = graphicEqualiser(BANDS, [3, 3, 3, 3, 3, 3])
    expect(filters.map((f) => f.type)).toEqual([
      'lowshelf',
      'peaking',
      'peaking',
      'peaking',
      'peaking',
      'highshelf'
    ])
  })

  it('sounds the way it is drawn: the response passes through every band’s gain', () => {
    for (const gains of CURVES) {
      const filters = graphicEqualiser(BANDS, gains)
      const misses = BANDS.map((band, i) =>
        Math.abs(chainResponseDb(filters, band) - (gains[i] ?? 0))
      )
      // Within a quarter of a decibel everywhere, the zig-zag extreme included.
      expect(
        Math.max(...misses),
        `${gains.join(',')} missed by ${misses.map((m) => m.toFixed(2)).join(',')}`
      ).toBeLessThan(0.25)
    }
  })
})

describe('stored gains', () => {
  it('reads one half-decibel step per band within the range, and junk as 0', () => {
    expect(parseGains('6,4.26,-3.74,0,99,-99', 6, 12)).toEqual([6, 4.5, -3.5, 0, 12, -12])
    expect(parseGains('6,x', 3, 12)).toEqual([6, 0, 0])
    expect(parseGains(undefined, 2, 12)).toEqual([0, 0])
    expect(formatGains([6, -0, 1.5])).toBe('6,0,1.5')
    expect(snapGain(-0.2, 12)).toBe(0)
    expect(Object.is(snapGain(-0.2, 12), -0)).toBe(false)
  })

  it('names the preset a curve matches, or nothing for the user’s own', () => {
    const presets = [
      { name: 'Flat', gains: [0, 0] },
      { name: 'Bass boost', gains: [6, 0] }
    ]
    expect(matchingPreset([6, 0], presets)).toBe('Bass boost')
    expect(matchingPreset([5.5, 0], presets)).toBeNull()
  })

  it('labels bands and gains the way the panel shows them', () => {
    expect(BANDS.map(bandLabel)).toEqual([
      '60 Hz',
      '150 Hz',
      '400 Hz',
      '1 kHz',
      '2.4 kHz',
      '15 kHz'
    ])
    expect([6, 0, -4.5].map(gainLabel)).toEqual(['+6 dB', '0 dB', '−4.5 dB'])
  })
})
