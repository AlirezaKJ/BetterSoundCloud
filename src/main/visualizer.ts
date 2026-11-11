import { systemPreferences } from 'electron'
import { NO_VISUALIZER, VISUAL_PLACES } from '@shared/visualizer'
import type { VisualPlace, VisualizerConfig } from '@shared/visualizer'
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
 */

/** Each plugin's request, by plugin id. One look per place wins: the first plugin's, by id. */
const requests = new Map<string, VisualizerConfig>()
/** The places on screen now. */
const shown = new Set<VisualPlace>()
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

/** What the views should draw: for each place, the first plugin's look there, by plugin id. */
export function getVisualizer(): VisualizerConfig {
  if (reducedMotion()) return NO_VISUALIZER
  const owners = [...requests.keys()].sort()
  const lookFor = (place: VisualPlace): VisualizerConfig[VisualPlace] => {
    for (const owner of owners) {
      const look = requests.get(owner)?.[place] ?? null
      if (look) return look
    }
    return null
  }
  return { showcase: lookFor('showcase') }
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

/** The engine listens while some place on screen has a look to draw, and only then. */
function updateDemand(): void {
  const config = getVisualizer()
  setAudioVisual([...shown].some((place) => config[place] !== null))
}

/** For tests: forget everything. */
export function resetVisualizerForTests(): void {
  requests.clear()
  shown.clear()
  listeners.clear()
}
