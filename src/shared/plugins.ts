import type { PluginAction, PluginStatus } from './plugin-api'

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
   * Running code inside SoundCloud's page. Not available yet: in-page code is frozen until a
   * clean sign-in baseline is recorded (docs/TODO.md, Milestone 1). A plugin asking for it is
   * shown, honestly, as one that cannot be turned on.
   */
  | { kind: 'page' }

/** A plain hostname: letters, digits, dots and dashes, with at least one dot. No wildcards. */
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

export function parsePermission(raw: string): Permission | null {
  if (raw === 'nowPlaying' || raw === 'secrets' || raw === 'page') return { kind: raw }
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
    default:
      return `setting "${key}" needs a "kind" of boolean, string or secret`
  }
}

/** A stored or submitted value for a setting, made safe for its kind. Secrets never pass here. */
export function coercePluginSetting(setting: PluginSetting, value: unknown): boolean | string {
  if (setting.kind === 'boolean') return typeof value === 'boolean' ? value : setting.default
  if (setting.kind === 'string')
    return typeof value === 'string' ? value.slice(0, 500) : setting.default
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
  'openInBrowser'
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
