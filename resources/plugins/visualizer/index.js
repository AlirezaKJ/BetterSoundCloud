// @ts-check
/**
 * Visualizer, as a BetterSoundCloud plugin: what SoundCloud plays, drawn as it plays.
 *
 * Written only against the `bsc` API, like the Equaliser and Pitch. A plugin has no screen of its
 * own, so this one does not draw: it tells the app which look it wants in each place
 * (`bsc.audio.visualize`), and the app's own views draw it from the audio engine's sound. Its
 * settings are the look in each place: the full-screen view, the strip above the player, and a
 * view of its own over SoundCloud's page.
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
/** @type {{ showcase: VisualLook | 'off', strip: VisualLook | 'off', view: VisualLook | 'off' }} */
let looks = { showcase: 'off', strip: 'off', view: 'off' }
let reducedMotion = false
/** @type {AudioStatus} */
let engine = { state: 'off', message: '' }

/** The looks each place can take; anything else is "off". */
const LOOKS = {
  showcase: ['bars', 'ring', 'wave'],
  strip: ['bars', 'wave'],
  view: ['bars', 'wave']
}

module.exports = {
  /** @param {PluginApi} bsc */
  activate(bsc) {
    api = bsc
    bsc.audio.onStatus((status) => {
      engine = status
      showStatus()
    })
    bsc.settings.onChange((values) => {
      apply(values)
    })
    apply(bsc.settings.get())
  },

  deactivate() {
    // Nothing to undo: the app drops this plugin's request when it stops, whatever happens.
    api = null
  }
}

/**
 * A setting's value as a look for that place, or "off".
 *
 * @param {unknown} value
 * @param {string[]} allowed
 * @returns {VisualLook | 'off'}
 */
function lookOf(value, allowed) {
  return typeof value === 'string' && allowed.includes(value)
    ? /** @type {VisualLook} */ (value)
    : 'off'
}

/** @param {Record<string, boolean | string>} values */
function apply(values) {
  const bsc = api
  if (!bsc) return
  looks = {
    showcase: lookOf(values['showcase'], LOOKS.showcase),
    strip: lookOf(values['strip'], LOOKS.strip),
    view: lookOf(values['view'], LOOKS.view)
  }
  bsc.audio
    .visualize(looks)
    .then((answer) => {
      reducedMotion = answer.reducedMotion
      showStatus()
    })
    .catch((/** @type {unknown} */ error) => {
      api?.warn('Couldn’t set the visualizer:', error)
    })
  showStatus()
}

/** Where it shows, in words: "in the full-screen view, above the player and in its own view". */
function placesWords() {
  const places = []
  if (looks.showcase !== 'off') places.push('in the full-screen view')
  if (looks.strip !== 'off') places.push('above the player')
  if (looks.view !== 'off') places.push('in its own view')
  const last = places.pop()
  if (!last) return ''
  return places.length > 0 ? `${places.join(', ')} and ${last}` : last
}

/** The line under the plugin in settings. */
function showStatus() {
  if (!api) return
  const where = placesWords()
  if (!where) {
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
  api.status.set({ lead: 'On', detail: `It shows ${where} while music plays.` })
}
