// @ts-check
/**
 * Pitch, as a BetterSoundCloud plugin: everything SoundCloud plays, moved up or down in key at
 * the same speed.
 *
 * Written only against the `bsc` API, like the Equaliser. Its one setting is a shift in whole
 * semitones, which the settings panel draws as a ruler; whenever it changes, the plugin hands it to
 * `bsc.audio.setPitch`. The app's audio engine does the rest: capturing SoundCloud's sound,
 * shifting it, and playing it.
 *
 * It works alongside the Equaliser rather than inside it: the engine shifts first and equalises
 * after, so a bass boost stays on the bass whatever the key, and either can be turned off alone.
 *
 * WHAT IT DOES NOT DO: touch SoundCloud's page, or change the speed — SoundCloud's player cannot
 * be reached from outside its page (docs/TODO.md, "Explicitly declined"). At 0 it asks for
 * nothing, and the engine does not run for it. Turned off, crashed or uninstalled, its shift goes
 * with it and SoundCloud sounds exactly as it does without the app.
 */

/** @typedef {import('../../../src/shared/plugin-api').PluginApi} PluginApi */
/** @typedef {import('../../../src/shared/plugin-api').AudioStatus} AudioStatus */

/** @type {PluginApi | null} */
let api = null
let semitones = 0
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
      apply(values['semitones'])
    })
    apply(bsc.settings.get()['semitones'])
  },

  deactivate() {
    // Nothing to undo: the app removes this plugin's shift when it stops, whatever happens.
    api = null
  }
}

/**
 * The stored shift, whole semitones as text ("2", "-3"). The app has already checked it, so this
 * only has to read it.
 *
 * @param {unknown} value
 */
function semitonesOf(value) {
  const number = typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(number) ? Math.round(number) : 0
}

/** @param {unknown} value */
function apply(value) {
  const bsc = api
  if (!bsc) return
  semitones = semitonesOf(value)
  const change = semitones === 0 ? bsc.audio.clear() : bsc.audio.setPitch(semitones)
  change.catch((/** @type {unknown} */ error) => {
    api?.warn('Couldn’t change the key:', error)
  })
  showStatus()
}

/** "2 semitones higher", "an octave lower". */
function shiftWords() {
  const steps = Math.abs(semitones)
  const way = semitones > 0 ? 'higher' : 'lower'
  if (steps === 12) return `an octave ${way}`
  return `${steps} ${steps === 1 ? 'semitone' : 'semitones'} ${way}`
}

/** The line under the plugin in settings. */
function showStatus() {
  if (!api) return
  if (semitones === 0) {
    api.status.set({
      lead: 'Original key',
      detail: 'Move the marker to play everything higher or lower.'
    })
    return
  }
  switch (engine.state) {
    case 'running':
      api.status.set({ lead: 'On', detail: `Everything SoundCloud plays is ${shiftWords()}.` })
      return
    case 'stopped':
      api.status.set({ lead: 'Not working', problem: engine.message })
      return
    default:
      api.status.set({ lead: 'Starting…' })
  }
}
