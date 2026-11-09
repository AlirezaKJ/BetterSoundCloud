// @ts-check
/**
 * The Equaliser, as a BetterSoundCloud plugin.
 *
 * Written only against the `bsc` API, like Last.fm, so it doubles as the reference for the
 * `audio` permission. docs/CUSTOM_PLUGINS.md walks through it.
 *
 * WHAT IT DOES. Its one setting is a curve: a gain for each of six bands, which the settings panel
 * draws as points to drag. Whenever the curve changes, the plugin asks `bsc.audio.graphicEqualiser`
 * for the filters that make that curve and hands them to `bsc.audio.set`. The app's audio engine
 * does the rest — capturing SoundCloud's sound, shaping it, playing it, and turning everything
 * down by the largest boost so nothing distorts.
 *
 * WHAT IT DOES NOT DO: touch SoundCloud's page, or the audio itself. A flat curve asks for
 * nothing, and the engine then does not run at all. Turned off, crashed or uninstalled, its
 * filters go with it and SoundCloud sounds exactly as it does without the app.
 */

/** @typedef {import('../../../src/shared/plugin-api').PluginApi} PluginApi */
/** @typedef {import('../../../src/shared/plugin-api').AudioStatus} AudioStatus */

/** Must equal "bands" in plugin.json; equaliser-plugin.test.ts holds them together. */
const BANDS = [60, 150, 400, 1000, 2400, 15000]

/** @type {PluginApi | null} */
let api = null
let flat = true
/** @type {AudioStatus} */
let engine = { state: 'off', message: '' }

module.exports = {
  /** @param {PluginApi} bsc */
  activate(bsc) {
    api = bsc
    bsc.audio.onStatus((status) => {
      engine = status
      showStatus()
    })
    bsc.settings.onChange((values) => {
      apply(values['curve'])
    })
    apply(bsc.settings.get()['curve'])
  },

  deactivate() {
    // Nothing to undo: the app removes this plugin's filters when it stops, whatever happens.
    api = null
  }
}

/**
 * The stored curve, one number per band ("6,4,0,0,1.5,3"). The app has already checked it, so
 * this only has to read it.
 *
 * @param {unknown} curve
 */
function gainsOf(curve) {
  const parts = typeof curve === 'string' ? curve.split(',') : []
  return BANDS.map((_, i) => {
    const gain = Number(parts[i])
    return Number.isFinite(gain) ? gain : 0
  })
}

/** @param {unknown} curve */
function apply(curve) {
  const bsc = api
  if (!bsc) return
  const gains = gainsOf(curve)
  flat = gains.every((gain) => gain === 0)
  const change = flat
    ? bsc.audio.clear()
    : bsc.audio.set(bsc.audio.graphicEqualiser(BANDS, gains))
  change.catch((/** @type {unknown} */ error) => {
    api?.warn('Couldn’t change the sound:', error)
  })
  showStatus()
}

/** The line under the plugin in settings. */
function showStatus() {
  if (!api) return
  if (flat) {
    api.status.set({
      lead: 'Flat',
      detail: 'Pick a preset or move a band to change how SoundCloud sounds.'
    })
    return
  }
  switch (engine.state) {
    case 'running':
      api.status.set({ lead: 'On', detail: 'Everything SoundCloud plays goes through it.' })
      return
    case 'stopped':
      api.status.set({ lead: 'Not working', problem: engine.message })
      return
    default:
      api.status.set({ lead: 'Starting…' })
  }
}
