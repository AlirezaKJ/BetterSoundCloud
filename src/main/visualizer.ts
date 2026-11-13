import { app, systemPreferences } from 'electron'
import { drawsFromWave, NO_VISUALIZER, VISUAL_PLACES } from '@shared/visualizer'
import type { VisualLook, VisualPlace, VisualizerConfig } from '@shared/visualizer'
import { setAudioVisual } from './audio'

/**
 * The Visualizer (CLAUDE.md §22): what a plugin asked to be drawn, where it is on screen, and so
 * whether the audio engine should be listening.
 *
 * A plugin cannot draw — it runs in a process of its own with no screen — so it says which look it
 * wants in each place (`bsc.audio.visualize`, shaped by `readVisualizerConfig`) and the app's own
 * views draw it. The engine runs for it only while one of those places is actually on screen and
 * has a look: the showcase open, say. Everywhere else the visualizer costs nothing.
 *
 * It never runs under reduced motion: a visualizer is nothing but motion, so it is removed rather
 * than frozen (DESIGN.md, like the wait line), and the plugin is told so it can say why.
 *
 * MilkDrop needs WebGL on the graphics card. Without it (hardware acceleration off), Chromium
 * draws WebGL in software at 12 to 112 ms a frame (measured 2026-11-13), which would make the
 * whole app crawl, so Bars are drawn in its place and the plugin is told why.
 */

/** Each plugin's request, by plugin id. One look per place wins: the first plugin's, by id. */
const requests = new Map<string, VisualizerConfig>()
/** The places on screen now. */
const shown = new Set<VisualPlace>()
/**
 * The look the view of its own draws, when it was changed there (its switch or the arrow keys);
 * null for the plugin's. It decides whether the engine sends MilkDrop the channels.
 */
let viewLook: VisualLook | null = null
const listeners = new Set<(config: VisualizerConfig) => void>()

/** A plugin's request, already shaped. Asking for nothing anywhere withdraws it. */
export function setVisualizer(owner: string, config: VisualizerConfig): void {
  const asks = VISUAL_PLACES.some((place) => config[place] !== null)
  if (asks) requests.set(owner, config)
  else if (!requests.delete(owner)) return
  changed()
}

/** A plugin stopped, however it stopped: its request goes with it. */
export function clearVisualizer(owner: string): void {
  if (requests.delete(owner)) changed()
}

/**
 * What the views should draw: for each place, the first plugin's look there, by plugin id, with
 * Bars for MilkDrop where it cannot be drawn; and when MilkDrop changes preset, as the first
 * plugin asking for anything said.
 */
export function getVisualizer(): VisualizerConfig {
  if (reducedMotion()) return NO_VISUALIZER
  const owners = [...requests.keys()].sort()
  const canMilkdrop = milkdropPossible()
  const lookFor = (place: VisualPlace): VisualizerConfig[VisualPlace] => {
    for (const owner of owners) {
      const look = requests.get(owner)?.[place] ?? null
      if (look === 'milkdrop' && !canMilkdrop) return 'bars'
      if (look) return look
    }
    return null
  }
  const first = owners[0] === undefined ? undefined : requests.get(owners[0])
  return {
    showcase: lookFor('showcase'),
    strip: lookFor('strip'),
    view: lookFor('view'),
    presets: first?.presets ?? NO_VISUALIZER.presets
  }
}

/**
 * Whether MilkDrop can be drawn: Chromium has WebGL on the graphics card. With hardware
 * acceleration off it reports `unavailable_software`, with it on `enabled` (measured 2026-11-13).
 */
export function milkdropPossible(): boolean {
  try {
    return app.getGPUFeatureStatus().webgl.startsWith('enabled')
  } catch {
    return false
  }
}

/**
 * The look the view of its own is drawing now, as it says; null when it closes, so the next one
 * starts from the plugin's. Only MilkDrop changes anything: the channels it reads.
 */
export function setVisualViewLook(look: VisualLook | null): void {
  if (look === viewLook) return
  viewLook = look
  updateDemand()
}

export function onVisualizerChange(listener: (config: VisualizerConfig) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A place came on screen or left it: the showcase opening or closing, for one. */
export function setVisualPlaceShown(place: VisualPlace, isShown: boolean): void {
  if (isShown === shown.has(place)) return
  if (isShown) shown.add(place)
  else shown.delete(place)
  updateDemand()
}

/** The window is gone, and every place with it. */
export function forgetVisualPlaces(): void {
  if (shown.size === 0) return
  shown.clear()
  updateDemand()
}

/**
 * Whether the system asks for reduced motion (Windows' "Animation effects" off, macOS's "Reduce
 * motion"): the same switch Chromium reads for `prefers-reduced-motion` in our views.
 */
export function reducedMotion(): boolean {
  try {
    return systemPreferences.getAnimationSettings().prefersReducedMotion
  } catch {
    return false
  }
}

function changed(): void {
  const config = getVisualizer()
  for (const listener of listeners) {
    try {
      listener(config)
    } catch (error) {
      console.error('[visualizer] listener failed:', error)
    }
  }
  updateDemand()
}

/**
 * The engine listens while some place on screen has a look to draw, and only then; and sends the
 * channels while one of them is MilkDrop.
 */
function updateDemand(): void {
  const config = getVisualizer()
  const drawn = [...shown].map((place) =>
    place === 'view' && config.view !== null ? (viewLook ?? config.view) : config[place]
  )
  setAudioVisual(
    drawn.some((look) => look !== null),
    drawn.some((look) => drawsFromWave(look))
  )
}

/** For tests: forget everything. */
export function resetVisualizerForTests(): void {
  requests.clear()
  shown.clear()
  listeners.clear()
  viewLook = null
}
