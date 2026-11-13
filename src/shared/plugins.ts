import type { PluginAction, PluginStatus } from './plugin-api'
import { formatGains, parseGains, snapGain } from './equaliser'
import { OCTAVE, formatSemitones, parseSemitones } from './pitch'

/**
 * Plugins: what a plugin.json may say, what a permission means, and what a plugin's process may
 * send back. Pure, because all three are judgements about untrusted input — a plugin folder
 * anyone can drop on disk, and messages from a process running someone else's code.
 *
 * src/main/plugins.ts runs them; src/main/plugin-sandbox.ts is the far side of the messages.
 */

/*
 * ── Permissions ────────────────────────────────────────────────────────────────────────────
 *
 * Listed in plugin.json, shown to the user before a plugin is turned on, and checked on every
 * call through the API. They bind a plugin that uses the API as written. They do NOT stop
 * code written to break out of its sandbox — Node's `vm` is not a security boundary, and the
 * plugin process can do what any program can (measured 2026-10-27: Node's `--permission`
 * flag has no effect in an Electron utility process). That is why the settings panel says
 * "only add plugins you trust", and why docs/CUSTOM_PLUGINS.md opens with it.
 */

export type Permission =
  | { kind: 'nowPlaying' }
  | { kind: 'secrets' }
  | { kind: 'network'; host: string }
  | { kind: 'browser'; host: string }
  /**
   * Shaping SoundCloud's sound, through the audio engine (CLAUDE.md §21): filters described to
   * `bsc.audio`, never code that runs on the audio or in SoundCloud's page.
   */
  | { kind: 'audio' }
  /**
   * Running code inside SoundCloud's page. Not available yet: in-page code is frozen until a
   * clean sign-in baseline is recorded (docs/TODO.md, Milestone 1). A plugin asking for it is
   * shown, honestly, as one that cannot be turned on.
   */
  | { kind: 'page' }

/** A plain hostname: letters, digits, dots and dashes, with at least one dot. No wildcards. */
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

export function parsePermission(raw: string): Permission | null {
  if (raw === 'nowPlaying' || raw === 'secrets' || raw === 'audio' || raw === 'page') {
    return { kind: raw }
  }
  const match = /^(network|browser):(.+)$/.exec(raw)
  if (!match) return null
  const host = (match[2] ?? '').toLowerCase()
  if (!HOSTNAME.test(host)) return null
  return match[1] === 'network' ? { kind: 'network', host } : { kind: 'browser', host }
}

/** Whether a permission can be granted at all in this version. */
export function isAvailable(permission: Permission): boolean {
  return permission.kind !== 'page'
}

/** How a permission reads to the person deciding whether to turn the plugin on. */
export function describePermission(permission: Permission): string {
  switch (permission.kind) {
    case 'nowPlaying':
      return 'See what you’re playing'
    case 'secrets':
      return 'Keep secrets on this computer, encrypted'
    case 'network':
      return `Connect to ${permission.host}`
    case 'browser':
      return `Open ${permission.host} in your browser`
    case 'audio':
      return 'Change how SoundCloud sounds'
    case 'page':
      return 'Run code inside SoundCloud’s page — not available to plugins yet'
  }
}

/*
 * ── plugin.json ────────────────────────────────────────────────────────────────────────────
 */

export type PluginSetting =
  | { key: string; kind: 'boolean'; label: string; help: string; default: boolean }
  | { key: string; kind: 'string'; label: string; help: string; default: string }
  /** Stored encrypted by main and never sent back to the settings panel. */
  | { key: string; kind: 'secret'; label: string; help: string }
  /**
   * A graphic equaliser, drawn by the settings panel as a curve with a point per band. Its value
   * is text, one gain per band in half-decibel steps: "6,4,0,0,1.5,3" (src/shared/equaliser.ts).
   */
  | {
      key: string
      kind: 'equaliser'
      label: string
      help: string
      /** Band centres in Hz, rising: 2 to 10 of them. */
      bands: number[]
      /** Each band goes this many dB up or down. */
      range: number
      presets: { name: string; gains: number[] }[]
      default: string
    }
  /**
   * One of a few choices, drawn by the settings panel as a dropdown. Its value is the chosen
   * option's `value`; anything else stored falls back to the default.
   */
  | {
      key: string
      kind: 'choice'
      label: string
      help: string
      /** 2 to 12 options, each a short value and the label the panel shows for it. */
      options: { value: string; label: string }[]
      default: string
    }
  /**
   * A key shift, drawn by the settings panel as a ruler of semitones. Its value is text, whole
   * semitones: "0", "2", "-3" (src/shared/pitch.ts).
   */
  | {
      key: string
      kind: 'pitch'
      label: string
      help: string
      /** Semitones up or down, 1 to 12 (an octave). */
      range: number
      default: string
    }

export type PluginManifest = {
  id: string
  name: string
  version: string
  author: string
  description: string
  /** https only, or ''. */
  homepage: string
  /** The script, relative to the plugin's folder. */
  main: string
  /** As written, in order; each one parses (unknown ones make the manifest invalid). */
  permissions: string[]
  settings: PluginSetting[]
}

export type ManifestResult =
  { ok: true; manifest: PluginManifest } | { ok: false; problem: string }

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const SETTING_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/
const MAX_SETTINGS = 20

/**
 * Read a plugin.json. `folder` is the name of the folder it was found in: a plugin's id must
 * equal it, so two plugins can never claim the same id and a folder's name says what is in it.
 *
 * Problems are written for the settings panel, which shows them on the plugin's row.
 */
export function readManifest(raw: unknown, folder: string): ManifestResult {
  if (!isRecord(raw)) return fail('plugin.json is not a JSON object')

  const id = raw['id']
  if (typeof id !== 'string' || !ID.test(id)) {
    return fail('plugin.json needs an "id" of lowercase letters, digits and dashes')
  }
  if (id !== folder) return fail(`its id "${id}" does not match its folder name "${folder}"`)

  const name = text(raw['name'], 60)
  if (!name) return fail('plugin.json needs a "name"')

  const version = text(raw['version'], 20)
  if (!version) return fail('plugin.json needs a "version"')

  const main = typeof raw['main'] === 'string' ? raw['main'] : 'index.js'
  if (!/^[\w-]+(\/[\w-]+)*\.js$/.test(main)) {
    return fail('"main" must be a .js file inside the plugin’s folder')
  }

  const homepage = typeof raw['homepage'] === 'string' ? raw['homepage'] : ''
  if (homepage && !/^https:\/\/[^\s]+$/.test(homepage))
    return fail('"homepage" must be an https link')

  const rawPermissions = raw['permissions'] ?? []
  if (!Array.isArray(rawPermissions) || rawPermissions.some((p) => typeof p !== 'string')) {
    return fail('"permissions" must be a list of strings')
  }
  const permissions = [...new Set(rawPermissions as string[])]
  const unknown = permissions.find((p) => parsePermission(p) === null)
  if (unknown !== undefined)
    return fail(`it asks for a permission this version does not know: "${unknown}"`)

  const rawSettings = raw['settings'] ?? []
  if (!Array.isArray(rawSettings) || rawSettings.length > MAX_SETTINGS) {
    return fail(`"settings" must be a list of at most ${MAX_SETTINGS}`)
  }
  const settings: PluginSetting[] = []
  for (const entry of rawSettings) {
    const setting = readSetting(entry)
    if (typeof setting === 'string') return fail(setting)
    if (settings.some((s) => s.key === setting.key))
      return fail(`setting "${setting.key}" appears twice`)
    settings.push(setting)
  }

  return {
    ok: true,
    manifest: {
      id,
      name,
      version,
      author: text(raw['author'], 60),
      description: text(raw['description'], 300),
      homepage,
      main,
      permissions,
      settings
    }
  }
}

function readSetting(raw: unknown): PluginSetting | string {
  if (!isRecord(raw)) return 'each entry in "settings" must be an object'
  const key = raw['key']
  if (typeof key !== 'string' || !SETTING_KEY.test(key)) {
    return 'each setting needs a "key" of letters and digits'
  }
  const label = text(raw['label'], 80)
  if (!label) return `setting "${key}" needs a "label"`
  const help = text(raw['help'], 300)

  switch (raw['kind']) {
    case 'boolean':
      return { key, kind: 'boolean', label, help, default: raw['default'] === true }
    case 'string':
      return {
        key,
        kind: 'string',
        label,
        help,
        default: typeof raw['default'] === 'string' ? raw['default'].slice(0, 500) : ''
      }
    case 'secret':
      return { key, kind: 'secret', label, help }
    case 'equaliser':
      return readEqualiserSetting(raw, key, label, help)
    case 'choice':
      return readChoiceSetting(raw, key, label, help)
    case 'pitch': {
      const range = raw['range'] ?? OCTAVE
      if (
        typeof range !== 'number' ||
        !Number.isInteger(range) ||
        range < 1 ||
        range > OCTAVE
      ) {
        return `setting "${key}" needs a "range" of whole semitones, from 1 to ${OCTAVE}`
      }
      // Text like every stored value ("2"), though a plain number is taken too.
      const given = raw['default']
      const value = formatSemitones(
        parseSemitones(typeof given === 'number' ? String(given) : given, range)
      )
      return { key, kind: 'pitch', label, help, range, default: value }
    }
    default:
      return `setting "${key}" needs a "kind" of boolean, string, secret, choice, equaliser or pitch`
  }
}

const MAX_CHOICES = 12
const CHOICE_VALUE = /^[a-z0-9-]{1,24}$/

function readChoiceSetting(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  help: string
): PluginSetting | string {
  const rawOptions = raw['options']
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > MAX_CHOICES) {
    return `setting "${key}" needs "options": 2 to ${MAX_CHOICES} of { value, label }`
  }
  const options: { value: string; label: string }[] = []
  for (const option of rawOptions as unknown[]) {
    const value = isRecord(option) ? option['value'] : null
    const optionLabel = isRecord(option) ? text(option['label'], 40) : ''
    if (typeof value !== 'string' || !CHOICE_VALUE.test(value) || !optionLabel) {
      return `each option of setting "${key}" needs a "value" of lowercase letters, digits or dashes, and a "label"`
    }
    if (options.some((o) => o.value === value))
      return `option "${value}" appears twice in setting "${key}"`
    options.push({ value, label: optionLabel })
  }
  const given = raw['default']
  const fallback = options[0]?.value ?? ''
  const value = options.some((o) => o.value === given) ? (given as string) : fallback
  return { key, kind: 'choice', label, help, options, default: value }
}

const MAX_BANDS = 10
const MAX_PRESETS = 20

function readEqualiserSetting(
  raw: Record<string, unknown>,
  key: string,
  label: string,
  help: string
): PluginSetting | string {
  const bands = raw['bands']
  const rising =
    Array.isArray(bands) &&
    bands.length >= 2 &&
    bands.length <= MAX_BANDS &&
    bands.every(
      (band: unknown, i) =>
        typeof band === 'number' &&
        Number.isFinite(band) &&
        band >= 20 &&
        band <= 20_000 &&
        (i === 0 || band > (bands[i - 1] as number))
    )
  if (!rising) {
    return `setting "${key}" needs "bands": ${MAX_BANDS} or fewer frequencies in Hz, rising, from 20 to 20000`
  }
  const bandList = bands as number[]

  const range = raw['range'] ?? 12
  if (typeof range !== 'number' || !Number.isFinite(range) || range < 3 || range > 24) {
    return `setting "${key}" needs a "range" from 3 to 24 dB`
  }

  const rawPresets = raw['presets'] ?? []
  if (!Array.isArray(rawPresets) || rawPresets.length > MAX_PRESETS) {
    return `setting "${key}" may have at most ${MAX_PRESETS} "presets"`
  }
  const presets: { name: string; gains: number[] }[] = []
  for (const preset of rawPresets) {
    const name = isRecord(preset) ? text(preset['name'], 30) : ''
    const gains = isRecord(preset) ? preset['gains'] : null
    if (!name || !Array.isArray(gains) || gains.length !== bandList.length) {
      return `each preset of setting "${key}" needs a "name" and one gain per band`
    }
    if (presets.some((p) => p.name === name))
      return `preset "${name}" appears twice in setting "${key}"`
    presets.push({ name, gains: gains.map((gain) => snapGain(Number(gain), range)) })
  }

  return {
    key,
    kind: 'equaliser',
    label,
    help,
    bands: [...bandList],
    range,
    presets,
    default: formatGains(parseGains(raw['default'], bandList.length, range))
  }
}

/** A stored or submitted value for a setting, made safe for its kind. Secrets never pass here. */
export function coercePluginSetting(setting: PluginSetting, value: unknown): boolean | string {
  if (setting.kind === 'boolean') return typeof value === 'boolean' ? value : setting.default
  if (setting.kind === 'string')
    return typeof value === 'string' ? value.slice(0, 500) : setting.default
  if (setting.kind === 'equaliser') {
    return typeof value === 'string'
      ? formatGains(parseGains(value, setting.bands.length, setting.range))
      : setting.default
  }
  if (setting.kind === 'pitch') {
    return typeof value === 'string'
      ? formatSemitones(parseSemitones(value, setting.range))
      : setting.default
  }
  if (setting.kind === 'choice') {
    return setting.options.some((option) => option.value === value)
      ? (value as string)
      : setting.default
  }
  return ''
}

/*
 * ── What the settings panel shows ──────────────────────────────────────────────────────────
 */

export type PluginState =
  /** Switched off. */
  | 'off'
  /** On, and its process is starting. */
  | 'starting'
  | 'running'
  /** On, but it stopped or would not start. `problem` says why. */
  | 'failed'
  /** On, but it now asks for permissions the user never approved. Not started until they do. */
  | 'needs-approval'
  /** Cannot be turned on in this version — it needs a permission that does not exist yet. */
  | 'unavailable'
  /** Its plugin.json is invalid. `problem` says how. */
  | 'broken'

export type PluginView = {
  /** For a broken plugin, its folder name. */
  id: string
  name: string
  version: string
  author: string
  description: string
  homepage: string
  /** Shipped with the app, or dropped into the plugins folder by the user. */
  source: 'bundled' | 'user'
  permissions: { text: string; available: boolean; approved: boolean }[]
  enabled: boolean
  state: PluginState
  problem: string
  status: PluginStatus | null
  actions: PluginAction[]
  /** `value` is null for a secret; `hasValue` says whether one is saved. */
  settings: { setting: PluginSetting; value: boolean | string | null; hasValue: boolean }[]
}

/*
 * ── Messages from a plugin's process ───────────────────────────────────────────────────────
 *
 * That process runs code we did not write, so everything it sends is hostile until proven
 * otherwise: shape-checked here, then permission-checked by `callAllowed`.
 */

export const PLUGIN_CALLS = [
  'nowPlaying.get',
  'storage.get',
  'storage.set',
  'secrets.get',
  'secrets.set',
  'secrets.delete',
  'settings.secret',
  'openInBrowser',
  'audio.set',
  'audio.setPitch',
  'audio.clear',
  'audio.visualize'
] as const
export type PluginCall = (typeof PLUGIN_CALLS)[number]

export type HostMessage =
  | { type: 'started' }
  | { type: 'failed'; message: string }
  | { type: 'call'; callId: number; method: PluginCall; args: unknown[] }
  | { type: 'status'; status: PluginStatus | null }
  | { type: 'actions'; actions: PluginAction[] }
  | { type: 'log'; level: 'info' | 'warn'; message: string }

const MAX_ACTIONS = 4

export function readHostMessage(raw: unknown): HostMessage | null {
  if (!isRecord(raw)) return null
  switch (raw['type']) {
    case 'started':
      return { type: 'started' }
    case 'failed':
      return { type: 'failed', message: text(raw['message'], 500) || 'unknown error' }
    case 'call': {
      const callId = raw['callId']
      const method = raw['method']
      const args = raw['args']
      if (typeof callId !== 'number' || !Number.isSafeInteger(callId)) return null
      if (!PLUGIN_CALLS.some((m) => m === method) || !Array.isArray(args)) return null
      return { type: 'call', callId, method: method as PluginCall, args: args as unknown[] }
    }
    case 'status':
      return { type: 'status', status: readStatus(raw['status']) }
    case 'actions': {
      const list = raw['actions']
      if (!Array.isArray(list)) return null
      const actions: PluginAction[] = []
      for (const item of list.slice(0, MAX_ACTIONS)) {
        if (!isRecord(item)) continue
        const id = text(item['id'], 40)
        const label = text(item['label'], 32)
        if (id && label) actions.push({ id, label, disabled: item['disabled'] === true })
      }
      return { type: 'actions', actions }
    }
    case 'log':
      return {
        type: 'log',
        level: raw['level'] === 'warn' ? 'warn' : 'info',
        message: text(raw['message'], 2000)
      }
    default:
      return null
  }
}

function readStatus(raw: unknown): PluginStatus | null {
  if (!isRecord(raw)) return null
  const lead = text(raw['lead'], 80)
  if (!lead) return null
  const status: PluginStatus = { lead }
  const detail = text(raw['detail'], 300)
  const problem = text(raw['problem'], 300)
  if (detail) status.detail = detail
  if (problem) status.problem = problem
  return status
}

/**
 * Whether a plugin holding `granted` may make this call. Checked by main on every call, so a
 * plugin's process cannot widen its own permissions however it is rewritten.
 */
export function callAllowed(method: PluginCall, args: unknown[], granted: string[]): boolean {
  switch (method) {
    case 'nowPlaying.get':
      return granted.includes('nowPlaying')
    case 'secrets.get':
    case 'secrets.set':
    case 'secrets.delete':
      return granted.includes('secrets')
    case 'storage.get':
    case 'storage.set':
    case 'settings.secret':
      // The plugin's own data. Nothing to grant.
      return true
    case 'openInBrowser': {
      const host = httpsHost(args[0])
      return host !== null && granted.includes(`browser:${host}`)
    }
    case 'audio.set':
    case 'audio.setPitch':
    case 'audio.clear':
    case 'audio.visualize':
      return granted.includes('audio')
  }
}

/** The hostname of an https URL, lowercased, or null for anything that is not one. */
export function httpsHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.hostname.toLowerCase()
      : null
  } catch {
    return null
  }
}

function fail(problem: string): ManifestResult {
  return { ok: false, problem }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A trimmed string with control characters removed and a length cap, or '' if not a string. */
function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return (
    value
      // eslint-disable-next-line no-control-regex -- stripping them is the point
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, max)
  )
}
