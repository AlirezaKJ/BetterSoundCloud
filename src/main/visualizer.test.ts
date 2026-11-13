import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_VISUALIZER } from '@shared/visualizer'

/**
 * main/visualizer.ts: which look each place draws, and what the engine is asked for. Electron and
 * the engine are faked: the GPU's answer, the system's reduced motion, and `setAudioVisual`.
 */

const mocks = vi.hoisted(() => ({
  webgl: 'enabled',
  reducedMotion: false,
  setAudioVisual: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getGPUFeatureStatus: () => ({ webgl: mocks.webgl }) },
  systemPreferences: {
    getAnimationSettings: () => ({ prefersReducedMotion: mocks.reducedMotion })
  }
}))
vi.mock('./audio', () => ({ setAudioVisual: mocks.setAudioVisual }))

const visualizer = await import('./visualizer')
const config = (given: Partial<typeof NO_VISUALIZER>) => ({ ...NO_VISUALIZER, ...given })
/** What the engine was last asked: [listening, sending the channels]. */
const lastAsked = () => mocks.setAudioVisual.mock.calls.at(-1)

beforeEach(() => {
  visualizer.resetVisualizerForTests()
  mocks.webgl = 'enabled'
  mocks.reducedMotion = false
  mocks.setAudioVisual.mockClear()
})

describe('the Visualizer in main', () => {
  it('listens only while a place with a look is on screen', () => {
    visualizer.setVisualizer('visualizer', config({ showcase: 'bars', view: 'wave' }))
    expect(lastAsked()).toEqual([false, false])
    visualizer.setVisualPlaceShown('showcase', true)
    expect(lastAsked()).toEqual([true, false])
    visualizer.setVisualPlaceShown('showcase', false)
    expect(lastAsked()).toEqual([false, false])
  })

  it('asks the engine for the channels while MilkDrop is on screen, and only then', () => {
    visualizer.setVisualizer('visualizer', config({ showcase: 'milkdrop', strip: 'bars' }))
    visualizer.setVisualPlaceShown('strip', true)
    expect(lastAsked()).toEqual([true, false])
    visualizer.setVisualPlaceShown('strip', false)
    visualizer.setVisualPlaceShown('showcase', true)
    expect(lastAsked()).toEqual([true, true])
  })

  it('follows the look the view of its own draws, until it closes', () => {
    visualizer.setVisualizer('visualizer', config({ view: 'bars' }))
    visualizer.setVisualPlaceShown('view', true)
    expect(lastAsked()).toEqual([true, false])
    // Its switch, or the arrow keys, moved it to MilkDrop.
    visualizer.setVisualViewLook('milkdrop')
    expect(lastAsked()).toEqual([true, true])
    // Closed: the next one opens on the plugin's look.
    visualizer.setVisualViewLook(null)
    expect(lastAsked()).toEqual([true, false])
  })

  it('draws Bars for MilkDrop without WebGL on the graphics card, and says so', () => {
    mocks.webgl = 'unavailable_software'
    visualizer.setVisualizer('visualizer', config({ showcase: 'milkdrop', view: 'milkdrop' }))
    expect(visualizer.milkdropPossible()).toBe(false)
    expect(visualizer.getVisualizer()).toEqual(config({ showcase: 'bars', view: 'bars' }))
    visualizer.setVisualPlaceShown('showcase', true)
    expect(lastAsked()).toEqual([true, false])
    mocks.webgl = 'enabled_force'
    expect(visualizer.milkdropPossible()).toBe(true)
  })

  it('takes when MilkDrop changes preset from the first plugin by id', () => {
    visualizer.setVisualizer('zeta', config({ view: 'milkdrop', presets: 'still' }))
    expect(visualizer.getVisualizer().presets).toBe('still')
    visualizer.setVisualizer('alpha', config({ strip: 'bars', presets: 'track' }))
    expect(visualizer.getVisualizer()).toEqual(
      config({ strip: 'bars', view: 'milkdrop', presets: 'track' })
    )
  })

  it('draws nothing at all under reduced motion', () => {
    mocks.reducedMotion = true
    visualizer.setVisualizer('visualizer', config({ showcase: 'milkdrop' }))
    expect(visualizer.getVisualizer()).toEqual(NO_VISUALIZER)
    visualizer.setVisualPlaceShown('showcase', true)
    expect(lastAsked()).toEqual([false, false])
  })
})
