// @ts-check
/**
 * Visualizer, as a BetterSoundCloud plugin: what SoundCloud plays, drawn as it plays.
 *
 * Written only against the `bsc` API, like the Equaliser and Pitch. A plugin has no screen of its
 * own, so this one does not draw: it tells the app which look it wants in each place
 * (`bsc.audio.visualize`), and the app's own views draw it from the audio engine's sound. Its one
 * setting today is the look in the full-screen view.
 *
 * It is a plugin, off until turned on, so that it can never be what breaks SoundCloud: turned
 * off, crashed or uninstalled, the app drops its request, nothing is drawn, and the engine stops
 * listening for it. Even on, the engine listens only while a visualizer is on screen.
 */

/** @typedef {import('../../../src/shared/plugin-api').PluginApi} PluginApi */
/** @typedef {import('../../../src/shared/plugin-api').AudioStatus} AudioStatus */
/** @typedef {import('../../../src/shared/plugin-api').VisualLook} VisualLook */

/** @type {PluginApi | null} */
let api = null
/** @type {VisualLook | 'off'} */
let showcase = 'off'
let reducedMotion = false
/** @type {AudioStatus} */
let engine = { state: 'off', message: '' }

/** The looks the full-screen view can take; anything else is "off". */
const LOOKS = ['bars', 'ring', 'wave']

module.exports = {
  /** @param {PluginApi} bsc */
  activate(bsc) {
    api = bsc
    bsc.audio.onStatus((status) => {
      engine = status
      showStatus()
    })
    bsc.settings.onChange((values) => {
      apply(values['showcase'])
    })
    apply(bsc.settings.get()['showcase'])
  },

  deactivate() {
    // Nothing to undo: the app drops this plugin's request when it stops, whatever happens.
    api = null
  }
}

/** @param {unknown} value */
function apply(value) {
  const bsc = api
  if (!bsc) return
  showcase = /** @type {VisualLook | 'off'} */ (
    typeof value === 'string' && LOOKS.includes(value) ? value : 'off'
  )
  bsc.audio
    .visualize({ showcase })
    .then((answer) => {
      reducedMotion = answer.reducedMotion
      showStatus()
    })
    .catch((/** @type {unknown} */ error) => {
      api?.warn('Couldn’t set the visualizer:', error)
    })
  showStatus()
}

/** The line under the plugin in settings. */
function showStatus() {
  if (!api) return
  if (showcase === 'off') {
    api.status.set({ lead: 'Nothing chosen', detail: 'Choose a look below to see one.' })
    return
  }
  if (reducedMotion) {
    api.status.set({
      lead: 'Hidden',
      detail: 'Your system asks for reduced motion, and a visualizer is nothing but motion.'
    })
    return
  }
  // The engine also runs for the Equaliser and Pitch, so "running" is not "drawing": the line says
  // where it shows rather than claiming it is on screen.
  if (engine.state === 'stopped') {
    api.status.set({ lead: 'Not working', problem: engine.message })
    return
  }
  api.status.set({ lead: 'On', detail: 'It shows in the full-screen view while music plays.' })
}
