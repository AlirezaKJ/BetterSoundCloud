import { describe, it, expect } from 'vitest'
import {
  NO_VISUALIZER,
  PEAK_HOLD_MS,
  STRIP_APPROACH,
  STRIP_INSET,
  STRIP_RETREAT,
  VISUAL_BANDS,
  VISUAL_CEILING_DB,
  VISUAL_FLOOR_DB,
  VIEW_CONTROLS,
  bandEdges,
  bandLevels,
  dbToLevel,
  follow,
  isSilentFrame,
  nextPeak,
  readVisualFrame,
  readVisualizerConfig,
  showcaseLayout,
  showsAnything,
  stepLook,
  stripAside,
  stripLayout,
  viewLayout
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
    expect(readVisualizerConfig({ showcase: 'ring' })).toEqual({
      showcase: 'ring',
      strip: null,
      view: null
    })
    expect(readVisualizerConfig({ showcase: 'off', strip: 'wave', view: 'bars' })).toEqual({
      showcase: null,
      strip: 'wave',
      view: 'bars'
    })
    expect(readVisualizerConfig({ showcase: 'off' })).toEqual(NO_VISUALIZER)
    expect(readVisualizerConfig({})).toEqual(NO_VISUALIZER)
    expect(readVisualizerConfig(null)).toEqual(NO_VISUALIZER)
  })

  it('refuses unknown looks and places, and a look a place cannot draw', () => {
    expect(readVisualizerConfig({ showcase: 'milkdrop' })).toBeNull()
    // The ring follows the sleeve, which only the showcase has.
    expect(readVisualizerConfig({ strip: 'ring' })).toBeNull()
    expect(readVisualizerConfig({ view: 'ring' })).toBeNull()
    expect(readVisualizerConfig({ titlebar: 'bars' })).toBeNull()
    expect(readVisualizerConfig(['bars'])).toBeNull()
    expect(readVisualizerConfig('bars')).toBeNull()
  })

  it('says whether a config draws anything at all', () => {
    expect(showsAnything(NO_VISUALIZER)).toBe(false)
    expect(showsAnything({ ...NO_VISUALIZER, showcase: 'bars' })).toBe(true)
    expect(showsAnything({ ...NO_VISUALIZER, strip: 'bars' })).toBe(true)
    expect(showsAnything({ ...NO_VISUALIZER, view: 'wave' })).toBe(true)
  })
})

describe('stepLook', () => {
  it('steps through a place’s looks with the arrow keys, wrapping at either end', () => {
    expect(stepLook('view', 'bars', 1)).toBe('wave')
    expect(stepLook('view', 'wave', 1)).toBe('bars')
    expect(stepLook('view', 'bars', -1)).toBe('wave')
    expect(stepLook('showcase', 'bars', -1)).toBe('wave')
    expect(stepLook('showcase', 'bars', 1)).toBe('ring')
    // A look the place cannot draw starts from its first.
    expect(stepLook('view', 'ring', 1)).toBe('wave')
  })
})

describe('viewLayout', () => {
  // The page area of a maximised 1707×960 window: under SoundCloud's header, above its bar.
  const width = 1707
  const height = 818

  it('stands the bars on a margin above the bottom, under the controls, inset at the sides', () => {
    const layout = viewLayout('bars', width, height)
    if (layout?.kind !== 'band') throw new Error('no band')
    expect(layout.area.left).toBeGreaterThanOrEqual(24)
    expect(layout.area.right).toBe(width - layout.area.left)
    expect(layout.area.bottom).toBeLessThan(height)
    expect(layout.area.top).toBeGreaterThanOrEqual(VIEW_CONTROLS)
    expect(layout.area.bottom - layout.area.top).toBeGreaterThan(height * 0.5)
  })

  it('runs the waveform through all the room below the controls', () => {
    const layout = viewLayout('wave', width, height)
    if (layout?.kind !== 'band') throw new Error('no band')
    expect(layout.area.top).toBe(VIEW_CONTROLS)
  })

  it('draws nothing in a view too small to draw in', () => {
    expect(viewLayout('bars', 100, 818)).toBeNull()
    expect(viewLayout('bars', 1707, 120)).toBeNull()
  })
})

describe('showcaseLayout', () => {
  // A 1920×1080 screen, measured from the built showcase: the sleeve left, the notes beside it.
  const sleeve = { left: 213, top: 205, right: 881, bottom: 873 }
  const notes = { left: 977, top: 205, right: 1707, bottom: 873 }
  const both = { left: 213, top: 205, right: 1707, bottom: 873 }

  it('puts bars and the flowing line under the sleeve and its notes, exactly as wide', () => {
    const layout = showcaseLayout('bars', sleeve, notes, both, 1920, 1080)
    expect(layout?.kind).toBe('band')
    if (layout?.kind !== 'band') return
    expect([layout.area.left, layout.area.right]).toEqual([both.left, both.right])
    expect(layout.area.top).toBeGreaterThan(sleeve.bottom)
    expect(layout.area.bottom).toBeLessThan(1080)
  })

  it('keeps the ring clear of the notes beside the sleeve', () => {
    const layout = showcaseLayout('ring', sleeve, notes, both, 1920, 1080)
    if (layout?.kind !== 'ring') throw new Error('no ring')
    expect(sleeve.right + layout.gap + layout.reach).toBeLessThan(notes.left)
  })

  it('draws nothing where there is no room, rather than over the text', () => {
    // A tall screen: the notes under the sleeve, running to the bottom.
    const tallNotes = { left: 100, top: 700, right: 700, bottom: 1060 }
    const tallSleeve = { left: 100, top: 40, right: 700, bottom: 640 }
    const tallBoth = { left: 100, top: 40, right: 700, bottom: 1060 }
    expect(showcaseLayout('bars', tallSleeve, tallNotes, tallBoth, 800, 1080)).toBeNull()
  })
})

describe('stripLayout', () => {
  it('spans the strip inside the controls’ own side padding, standing on the bar', () => {
    expect(stripLayout(1366, 40)).toEqual({
      kind: 'band',
      area: { left: STRIP_INSET, right: 1366 - STRIP_INSET, top: 0, bottom: 40 }
    })
    expect(stripLayout(40, 40)).toBeNull()
  })
})

describe('stripAside', () => {
  // A 1366×768 window at 100%: the bar is the bottom 48px, the strip the 40px above it.
  const window = { width: 1366, height: 768, stripTop: 768 - 48 - 40, zoom: 1 }

  it('steps aside as the pointer comes near the strip, or is on the bar under it', () => {
    expect(stripAside(false, { x: 600, y: 300 }, window)).toBe(false)
    expect(stripAside(false, { x: 600, y: window.stripTop - STRIP_APPROACH }, window)).toBe(
      true
    )
    expect(stripAside(false, { x: 600, y: 700 }, window)).toBe(true)
    expect(stripAside(false, { x: 600, y: 760 }, window)).toBe(true)
  })

  it('stays aside until the pointer is past the volume slider’s reach, so the slider stays open', () => {
    const slider = { x: 900, y: window.stripTop - 100 }
    expect(stripAside(false, slider, window)).toBe(false)
    expect(stripAside(true, slider, window)).toBe(true)
    expect(stripAside(true, { x: 900, y: window.stripTop - STRIP_RETREAT - 1 }, window)).toBe(
      false
    )
  })

  it('comes back when the pointer leaves the window, and reaches further on a zoomed page', () => {
    expect(stripAside(true, { x: 600, y: 800 }, window)).toBe(false)
    expect(stripAside(true, { x: -5, y: 700 }, window)).toBe(false)
    const zoomed = { ...window, zoom: 1.5 }
    const between = { x: 600, y: window.stripTop - STRIP_APPROACH * 1.25 }
    expect(stripAside(false, between, window)).toBe(false)
    expect(stripAside(false, between, zoomed)).toBe(true)
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
