import { describe, it, expect } from 'vitest'
import {
  NO_VISUALIZER,
  PEAK_HOLD_MS,
  VISUAL_BANDS,
  VISUAL_CEILING_DB,
  VISUAL_FLOOR_DB,
  bandEdges,
  bandLevels,
  dbToLevel,
  follow,
  isSilentFrame,
  nextPeak,
  readVisualFrame,
  readVisualizerConfig,
  showsAnything
} from './visualizer'

const RATE = 48_000
/** An AnalyserNode's float spectrum at fftSize 4096: 2048 bins, all at `db`. */
const spectrum = (db: number): Float32Array => new Float32Array(2048).fill(db)
const binOf = (hz: number): number => Math.round(hz / (RATE / 4096))

describe('bandEdges', () => {
  it('spaces the bands evenly in octaves, from 30 Hz to 16 kHz', () => {
    const edges = bandEdges()
    expect(edges).toHaveLength(VISUAL_BANDS + 1)
    expect(edges[0]).toBeCloseTo(30)
    expect(edges.at(-1)).toBeCloseTo(16_000)
    const ratios = edges.slice(1).map((edge, i) => edge / (edges[i] ?? 1))
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0] ?? 0, 9)
  })
})

describe('bandLevels', () => {
  it('reads silence (−∞ dB, what the analyser reports for zeros) as empty', () => {
    expect(bandLevels(spectrum(-Infinity), RATE).every((level) => level === 0)).toBe(true)
  })

  it('lights the band a tone is in, and leaves the ones far from it empty', () => {
    const db = spectrum(-120)
    db[binOf(1000)] = -20
    const levels = bandLevels(db, RATE)
    const edges = bandEdges()
    const band = edges.findIndex((edge, i) => edge <= 1000 && (edges[i + 1] ?? 0) > 1000)
    expect(levels[band]).toBeGreaterThan(0.8)
    expect(levels[band - 12]).toBe(0)
    expect(levels[band + 12]).toBe(0)
  })

  it('slopes through the bass instead of repeating one bin across several bars', () => {
    const db = spectrum(-120)
    for (let bin = 0; bin < 12; bin++) db[bin] = -70 + bin * 4
    const bass = bandLevels(db, RATE).slice(0, 12)
    const distinct = new Set(bass.map((level) => level.toFixed(4)))
    expect(distinct.size).toBeGreaterThan(8)
  })

  it('tilts the spectrum, so pink noise (−3 dB an octave) reads level', () => {
    const db = new Float32Array(2048)
    for (let bin = 1; bin < db.length; bin++) {
      const hz = (bin * RATE) / 4096
      db[bin] = -45 - 3 * Math.log2(hz / 1000)
    }
    const levels = bandLevels(db, RATE).slice(12)
    const spread = Math.max(...levels) - Math.min(...levels)
    expect(spread).toBeLessThan(0.08)
  })
})

describe('dbToLevel', () => {
  it('maps the floor to 0 and the ceiling to 1, clamped either side', () => {
    expect(dbToLevel(VISUAL_FLOOR_DB)).toBe(0)
    expect(dbToLevel(VISUAL_CEILING_DB)).toBe(1)
    expect(dbToLevel(-200)).toBe(0)
    expect(dbToLevel(10)).toBe(1)
    expect(dbToLevel(-Infinity)).toBe(0)
  })
})

describe('readVisualFrame', () => {
  const good = { bands: new Array<number>(VISUAL_BANDS).fill(0.5) }

  it('takes a frame of the right length, clamping values into range, and nothing else', () => {
    const frame = readVisualFrame({ bands: [1.5, ...good.bands.slice(1)], extra: 'x' })
    expect(frame?.bands[0]).toBe(1)
    expect(frame && Object.keys(frame)).toEqual(['bands'])
  })

  it('refuses the wrong length, non-numbers and non-finite values', () => {
    expect(readVisualFrame({ bands: good.bands.slice(1) })).toBeNull()
    expect(readVisualFrame({ bands: [...good.bands.slice(1), 'x'] })).toBeNull()
    expect(readVisualFrame({ bands: [...good.bands.slice(1), Number.NaN] })).toBeNull()
    expect(readVisualFrame(null)).toBeNull()
    expect(readVisualFrame('frame')).toBeNull()
  })

  it('knows digital silence when it sees it', () => {
    expect(isSilentFrame({ bands: new Array<number>(VISUAL_BANDS).fill(0) })).toBe(true)
    expect(isSilentFrame(good)).toBe(false)
  })
})

describe('readVisualizerConfig', () => {
  it('takes a look per place, with off, null or nothing meaning none', () => {
    expect(readVisualizerConfig({ showcase: 'ring' })).toEqual({ showcase: 'ring' })
    expect(readVisualizerConfig({ showcase: 'off' })).toEqual(NO_VISUALIZER)
    expect(readVisualizerConfig({})).toEqual(NO_VISUALIZER)
    expect(readVisualizerConfig(null)).toEqual(NO_VISUALIZER)
  })

  it('refuses unknown looks and places, rather than silently showing nothing', () => {
    expect(readVisualizerConfig({ showcase: 'milkdrop' })).toBeNull()
    expect(readVisualizerConfig({ titlebar: 'bars' })).toBeNull()
    expect(readVisualizerConfig(['bars'])).toBeNull()
    expect(readVisualizerConfig('bars')).toBeNull()
  })

  it('says whether a config draws anything at all', () => {
    expect(showsAnything(NO_VISUALIZER)).toBe(false)
    expect(showsAnything({ showcase: 'bars' })).toBe(true)
  })
})

describe('follow', () => {
  it('rises fast and falls slowly, never overshooting', () => {
    const up = follow(0, 1, 40)
    const down = follow(1, 0, 40)
    expect(up).toBeGreaterThan(0.6)
    expect(1 - down).toBeLessThan(0.2)
    expect(follow(0, 1, 10_000)).toBeCloseTo(1)
    expect(follow(0.5, 0.5, 16)).toBe(0.5)
  })
})

describe('nextPeak', () => {
  it('is pushed up by the bar, holds, then falls back to it', () => {
    let peak = nextPeak({ level: 0, heldMs: 0 }, 0.8, 16)
    expect(peak.level).toBe(0.8)
    peak = nextPeak(peak, 0.2, PEAK_HOLD_MS - 1)
    expect(peak.level).toBe(0.8)
    peak = nextPeak(peak, 0.2, 100)
    expect(peak.level).toBeLessThan(0.8)
    for (let i = 0; i < 200; i++) peak = nextPeak(peak, 0.2, 16)
    expect(peak.level).toBe(0.2)
  })
})
