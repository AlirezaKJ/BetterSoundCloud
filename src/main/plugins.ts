import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import {
  callAllowed,
  coercePluginSetting,
  describePermission,
  isAvailable,
  parsePermission,
  readHostMessage,
  readManifest
} from '@shared/plugins'
import type {
  HostMessage,
  PluginCall,
  PluginManifest,
  PluginState,
  PluginView
} from '@shared/plugins'
import type { PluginAction, PluginStatus } from '@shared/plugin-api'
import { getNowPlaying, onNowPlayingChange } from './now-playing'
import { deleteSecret, getSecret, setSecret } from './secrets'
import { openInBrowser } from './session'
import { readRecord, writeJson } from './json-file'
import { isDev } from './env'

/**
 * Plugins: finding them, remembering which are on and what the user approved, running each in
 * a process of its own, and answering what they ask for.
 *
 * WHERE THEY COME FROM. `resources/plugins/<id>/` ships with the app; `<userData>/plugins/<id>/`
 * is the user's own. Each folder holds a plugin.json and a script. A user plugin may not reuse a
 * built-in's id — that would let a dropped-in folder impersonate Last.fm.
 *
 * WHAT THE USER APPROVED. Turning a plugin on records the permissions it asked for at that
 * moment. If a later version asks for more, it is not started until the user approves again —
 * an update cannot quietly widen what a plugin may do.
 *
 * HOW THEY RUN. One Electron utility process per plugin (src/main/plugin-host.ts). Main reads
 * the script and sends its text, so that process needs no file access; every call it makes
 * comes back here and is checked against the approved permissions before anything happens.
 *
 * NOT IN THE PAGE. No plugin runs code inside SoundCloud's page yet. That is frozen until a
 * clean sign-in baseline exists (docs/TODO.md, Milestone 1); a plugin asking for it shows as one
 * that cannot be turned on.
 */

type Found = {
  /** The folder name; the plugin's id when its manifest is valid. */
  folder: string
  dir: string
  source: 'bundled' | 'user'
  manifest: PluginManifest | null
  problem: string
}

type Saved = { enabled: boolean; granted: string[] }

type StateFile = {
  plugins: Record<string, Saved>
  values: Record<string, Record<string, boolean | string>>
}

type Runtime = {
  child: UtilityProcess | null
  state: PluginState
  problem: string
  status: PluginStatus | null
  actions: PluginAction[]
  startedAt: number
  /** We asked it to stop, so its exit is not a crash. */
  stopping: boolean
  /** It reported `failed` itself, so its exit needs no second explanation. */
  failed: boolean
  /** Automatic restarts used since the user last turned it on. */
  restarts: number
  startTimer: ReturnType<typeof setTimeout> | null
}

export type PluginPaths = {
  /** Plugins shipped with the app. */
  bundled: string
  /** The user's own plugins folder. */
  user: string
  /** Where plugin state and plugin storage live. */
  data: string
  /** The built plugin-host.js. */
  host: string
}

/** A plugin whose process has not said `started` by then is treated as stuck. */
const START_TIMEOUT_MS = 20_000
/** After a crash, wait this long before one automatic restart. */
const RESTART_DELAY_MS = 5_000
/** A crash this soon after starting is not retried: it would only crash again. */
const MIN_UPTIME_FOR_RESTART_MS = 60_000
/** A plugin asked to stop is ended by force after this long. */
const STOP_GRACE_MS = 3_000
/** Limits on a plugin's own storage, so one cannot fill the disk through it. */
const MAX_STORAGE_KEYS = 200
const MAX_STORAGE_VALUE_CHARS = 100_000

let paths: PluginPaths | null = null
let found: Found[] = []
const runtimes = new Map<string, Runtime>()
const listeners = new Set<() => void>()

/**
 * Find the plugins and start the ones that are on. Called once, after `whenReady`.
 * `overrides` exists for tests.
 */
export function startPlugins(overrides: Partial<PluginPaths> = {}): void {
  paths = {
    bundled: join(import.meta.dirname, '../../resources/plugins'),
    user: join(app.getPath('userData'), 'plugins'),
    data: app.getPath('userData'),
    host: join(import.meta.dirname, 'plugin-host.js'),
    ...overrides
  }
  scan()
  onNowPlayingChange((value) => {
    for (const [id, runtime] of runtimes) {
      if (runtime.state === 'running' && grantedFor(id).includes('nowPlaying')) {
        runtime.child?.postMessage({ type: 'nowPlaying', value })
      }
    }
  })
  for (const plugin of found) {
    if (plugin.manifest && shouldRun(plugin.manifest)) start(plugin)
  }
}

/** Every plugin, for the settings panel. Looks at the folders again, so new ones appear. */
export function listPlugins(): PluginView[] {
  scan()
  return pluginViews()
}

/** Every plugin as last found, for pushing a change, which must not rescan the disk each time. */
export function pluginViews(): PluginView[] {
  return found.map(view)
}

/** Run `listener` when anything a plugin row shows has changed. */
export function onPluginsChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Turn a plugin on (approving the permissions it asks for now) or off. */
export function setPluginEnabled(id: string, enabled: boolean): void {
  const plugin = find(id)
  if (!plugin?.manifest) return
  const state = loadState()

  if (enabled) {
    if (
      !plugin.manifest.permissions.every((p) =>
        isAvailable(parsePermission(p) ?? { kind: 'page' })
      )
    ) {
      return
    }
    state.plugins[id] = { enabled: true, granted: [...plugin.manifest.permissions] }
    saveState(state)
    const runtime = runtimeFor(id)
    runtime.restarts = 0
    if (!runtime.child) start(plugin)
  } else {
    state.plugins[id] = { enabled: false, granted: state.plugins[id]?.granted ?? [] }
    saveState(state)
    stop(id)
  }
  notify()
}

/**
 * Change one of a plugin's own settings. A secret goes to the encrypted store, and '' removes
 * it. Throws, with words for the user, when a secret cannot be stored on this computer.
 */
export function setPluginSetting(id: string, key: string, value: unknown): void {
  const manifest = find(id)?.manifest
  const setting = manifest?.settings.find((s) => s.key === key)
  if (!manifest || !setting) return

  if (setting.kind === 'secret') {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) setSecret(namespace(id), `setting:${key}`, text)
    else deleteSecret(namespace(id), `setting:${key}`)
  } else {
    const state = loadState()
    state.values[id] = { ...state.values[id], [key]: coercePluginSetting(setting, value) }
    saveState(state)
  }

  const runtime = runtimes.get(id)
  if (runtime?.state === 'running') {
    runtime.child?.postMessage({ type: 'settings', values: valuesFor(manifest) })
  }
  notify()
}

/** A button on a plugin's row. Only actions the plugin itself offered are passed on. */
export function runPluginAction(id: string, actionId: string): void {
  const runtime = runtimes.get(id)
  if (runtime?.state !== 'running' || !runtime.actions.some((a) => a.id === actionId)) return
  runtime.child?.postMessage({ type: 'action', id: actionId })
}

/** Open the user's plugins folder, creating it if it is not there yet. Takes no path on purpose. */
export function openPluginsFolder(): void {
  if (!paths) return
  mkdirSync(paths.user, { recursive: true })
  void shell.openPath(paths.user)
}

/*
 * ── Running ────────────────────────────────────────────────────────────────────────────────
 */

function start(plugin: Found): void {
  const manifest = plugin.manifest
  if (!manifest || !paths) return
  const runtime = runtimeFor(manifest.id)

  let code: string
  try {
    code = readFileSync(join(plugin.dir, manifest.main), 'utf8')
  } catch {
    fail(runtime, `Couldn’t read its script, ${manifest.main}.`)
    return
  }

  const child = utilityProcess.fork(paths.host, [], {
    serviceName: `BetterSoundCloud plugin: ${manifest.name}`,
    stdio: 'pipe'
  })
  Object.assign(runtime, {
    child,
    state: 'starting',
    problem: '',
    status: null,
    actions: [],
    startedAt: Date.now(),
    stopping: false,
    failed: false
  } satisfies Partial<Runtime>)

  child.on('message', (raw: unknown) => {
    if (runtime.child !== child) return
    const message = readHostMessage(raw)
    if (message) handle(manifest, runtime, child, message)
  })
  child.on('exit', (code: number) => {
    if (runtime.child === child) exited(plugin, runtime, code)
  })
  // Anything a plugin writes outside the API lands here; useful while developing one.
  child.stdout?.on('data', (data: Buffer) =>
    logFor(manifest.id, 'info', String(data).trimEnd())
  )
  child.stderr?.on('data', (data: Buffer) =>
    logFor(manifest.id, 'warn', String(data).trimEnd())
  )

  runtime.startTimer = setTimeout(() => {
    if (runtime.child !== child || runtime.state !== 'starting') return
    fail(runtime, `It didn’t start within ${START_TIMEOUT_MS / 1000} seconds.`)
    child.kill()
  }, START_TIMEOUT_MS)

  child.postMessage({
    type: 'start',
    plugin: {
      id: manifest.id,
      version: manifest.version,
      code,
      filename: `${plugin.source}-plugin:${manifest.id}/${manifest.main}`,
      permissions: grantedFor(manifest.id),
      settings: valuesFor(manifest)
    }
  })
  notify()
}

function stop(id: string): void {
  const runtime = runtimes.get(id)
  if (!runtime) return
  if (runtime.startTimer) clearTimeout(runtime.startTimer)
  const child = runtime.child
  runtime.child = null
  runtime.state = 'off'
  runtime.status = null
  runtime.actions = []
  if (!child) return
  runtime.stopping = true
  // Let it run `deactivate` — Last.fm sends a last scrobble there — then end it regardless.
  child.postMessage({ type: 'stop' })
  setTimeout(() => child.kill(), STOP_GRACE_MS)
}

function handle(
  manifest: PluginManifest,
  runtime: Runtime,
  child: UtilityProcess,
  message: HostMessage
): void {
  switch (message.type) {
    case 'started':
      if (runtime.startTimer) clearTimeout(runtime.startTimer)
      runtime.state = 'running'
      if (grantedFor(manifest.id).includes('nowPlaying')) {
        child.postMessage({ type: 'nowPlaying', value: getNowPlaying() })
      }
      notify()
      return
    case 'failed':
      runtime.failed = true
      fail(runtime, `Couldn’t start: ${message.message}`)
      return
    case 'status':
      runtime.status = message.status
      notify()
      return
    case 'actions':
      runtime.actions = message.actions
      notify()
      return
    case 'log':
      logFor(manifest.id, message.level, message.message)
      return
    case 'call':
      void answer(manifest, message.method, message.args).then(
        (value) =>
          child.postMessage({ type: 'reply', callId: message.callId, ok: true, value }),
        (error: unknown) =>
          child.postMessage({
            type: 'reply',
            callId: message.callId,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
      )
      return
  }
}

/**
 * Do what a plugin asked, if what it was given allows it. Async so that a refusal, thrown, comes
 * back to the plugin as a rejected promise like any other failure.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- see above
async function answer(
  manifest: PluginManifest,
  method: PluginCall,
  args: unknown[]
): Promise<unknown> {
  const { id } = manifest
  if (!callAllowed(method, args, grantedFor(id))) {
    throw new Error(`${method} is not among the permissions this plugin was given`)
  }
  const key = typeof args[0] === 'string' ? args[0].slice(0, 100) : ''

  switch (method) {
    case 'nowPlaying.get':
      return getNowPlaying()
    case 'storage.get':
      return readRecord(storageFile(id))[key] ?? null
    case 'storage.set': {
      if (!key) throw new Error('storage keys are non-empty strings')
      const json = JSON.stringify(args[1] ?? null)
      if (json.length > MAX_STORAGE_VALUE_CHARS)
        throw new Error('that value is too large to store')
      const stored = readRecord(storageFile(id))
      if (!(key in stored) && Object.keys(stored).length >= MAX_STORAGE_KEYS) {
        throw new Error(`a plugin can store at most ${MAX_STORAGE_KEYS} values`)
      }
      stored[key] = JSON.parse(json) as unknown
      writeJson(storageFile(id), stored)
      return null
    }
    case 'secrets.get':
      return getSecret(namespace(id), key)
    case 'secrets.set':
      if (!key || typeof args[1] !== 'string')
        throw new Error('secrets are strings, under a key')
      setSecret(namespace(id), key, args[1])
      return null
    case 'secrets.delete':
      deleteSecret(namespace(id), key)
      return null
    case 'settings.secret':
      return manifest.settings.some((s) => s.kind === 'secret' && s.key === key)
        ? (getSecret(namespace(id), `setting:${key}`) ?? '')
        : ''
    case 'openInBrowser':
      openInBrowser(String(args[0]))
      return null
  }
}

function exited(plugin: Found, runtime: Runtime, code: number): void {
  runtime.child = null
  if (runtime.startTimer) clearTimeout(runtime.startTimer)
  if (runtime.stopping) return

  // It failed, or was ended for being stuck, and already said why.
  if (runtime.failed || runtime.state === 'failed') {
    notify()
    return
  }

  const ranLongEnough = Date.now() - runtime.startedAt >= MIN_UPTIME_FOR_RESTART_MS
  if (ranLongEnough && runtime.restarts < 1) {
    runtime.restarts += 1
    runtime.state = 'starting'
    logFor(plugin.folder, 'warn', `stopped unexpectedly (exit code ${code}); restarting once`)
    setTimeout(() => {
      const manifest = plugin.manifest
      if (manifest && shouldRun(manifest) && !runtime.child) start(plugin)
    }, RESTART_DELAY_MS)
    notify()
    return
  }
  fail(runtime, `It stopped unexpectedly (exit code ${code}). Turn it off and on to try again.`)
}

function fail(runtime: Runtime, problem: string): void {
  if (runtime.startTimer) clearTimeout(runtime.startTimer)
  runtime.state = 'failed'
  runtime.problem = problem
  runtime.status = null
  runtime.actions = []
  notify()
}

/*
 * ── Finding and describing ─────────────────────────────────────────────────────────────────
 */

function scan(): void {
  if (!paths) return
  const bundled = readFolder(paths.bundled, 'bundled')
  const builtInIds = new Set(bundled.map((p) => p.folder))
  const user = readFolder(paths.user, 'user').map((plugin) =>
    builtInIds.has(plugin.folder)
      ? {
          ...plugin,
          manifest: null,
          problem: `“${plugin.folder}” is the id of a built-in plugin, so this one cannot use it.`
        }
      : plugin
  )
  found = [...bundled, ...user]
}

function readFolder(dir: string, source: 'bundled' | 'user'): Found[] {
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => !name.startsWith('.') && isDirectory(join(dir, name)))
    .sort()
    .slice(0, 100)
    .map((folder) => {
      const pluginDir = join(dir, folder)
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'))
      } catch {
        return {
          folder,
          dir: pluginDir,
          source,
          manifest: null,
          problem: 'Its plugin.json is missing or is not valid JSON.'
        }
      }
      const result = readManifest(raw, folder)
      return result.ok
        ? { folder, dir: pluginDir, source, manifest: result.manifest, problem: '' }
        : {
            folder,
            dir: pluginDir,
            source,
            manifest: null,
            problem: capitalise(`${result.problem}.`)
          }
    })
}

function view(plugin: Found): PluginView {
  const { manifest } = plugin
  if (!manifest) {
    return {
      id: plugin.folder,
      name: plugin.folder,
      version: '',
      author: '',
      description: '',
      homepage: '',
      source: plugin.source,
      permissions: [],
      enabled: false,
      state: 'broken',
      problem: plugin.problem,
      status: null,
      actions: [],
      settings: []
    }
  }

  const saved = loadState().plugins[manifest.id]
  const granted = saved?.granted ?? []
  const permissions = manifest.permissions.map((raw) => {
    const permission = parsePermission(raw) ?? { kind: 'page' as const }
    return {
      text: describePermission(permission),
      available: isAvailable(permission),
      approved: granted.includes(raw)
    }
  })
  const runtime = runtimes.get(manifest.id)

  let state: PluginState
  let problem = ''
  if (permissions.some((p) => !p.available)) {
    state = 'unavailable'
    problem = 'It needs to run code inside SoundCloud’s page, which plugins can’t do yet.'
  } else if (!saved?.enabled) {
    state = 'off'
  } else if (permissions.some((p) => !p.approved)) {
    state = 'needs-approval'
    problem =
      'This version asks for more than you approved, so it is paused until you approve it.'
  } else {
    state = runtime?.state ?? 'starting'
    problem = runtime?.problem ?? ''
  }

  const values = valuesFor(manifest)
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    homepage: manifest.homepage,
    source: plugin.source,
    permissions,
    enabled: saved?.enabled === true,
    state,
    problem,
    status: state === 'running' ? (runtime?.status ?? null) : null,
    actions: state === 'running' ? (runtime?.actions ?? []) : [],
    settings: manifest.settings.map((setting) =>
      setting.kind === 'secret'
        ? {
            setting,
            value: null,
            hasValue: getSecret(namespace(manifest.id), `setting:${setting.key}`) !== null
          }
        : { setting, value: values[setting.key] ?? setting.default, hasValue: true }
    )
  }
}

/** Turned on, everything it asks for approved, and nothing it asks for unavailable. */
function shouldRun(manifest: PluginManifest): boolean {
  const saved = loadState().plugins[manifest.id]
  return (
    saved?.enabled === true &&
    manifest.permissions.every(
      (p) => saved.granted.includes(p) && isAvailable(parsePermission(p) ?? { kind: 'page' })
    )
  )
}

function find(id: string): Found | undefined {
  return found.find((p) => p.manifest?.id === id)
}

function grantedFor(id: string): string[] {
  return loadState().plugins[id]?.granted ?? []
}

/** A plugin's non-secret settings, each made valid for its kind. */
function valuesFor(manifest: PluginManifest): Record<string, boolean | string> {
  const stored = loadState().values[manifest.id] ?? {}
  const values: Record<string, boolean | string> = {}
  for (const setting of manifest.settings) {
    if (setting.kind !== 'secret')
      values[setting.key] = coercePluginSetting(setting, stored[setting.key])
  }
  return values
}

function runtimeFor(id: string): Runtime {
  let runtime = runtimes.get(id)
  if (!runtime) {
    runtime = {
      child: null,
      state: 'off',
      problem: '',
      status: null,
      actions: [],
      startedAt: 0,
      stopping: false,
      failed: false,
      restarts: 0,
      startTimer: null
    }
    runtimes.set(id, runtime)
  }
  return runtime
}

/*
 * ── Files ──────────────────────────────────────────────────────────────────────────────────
 */

function stateFile(): string {
  return join(paths?.data ?? '', 'plugins.json')
}

function storageFile(id: string): string {
  return join(paths?.data ?? '', 'plugin-data', `${id}.json`)
}

function loadState(): StateFile {
  const raw = readRecord(stateFile())
  const plugins: Record<string, Saved> = {}
  const values: Record<string, Record<string, boolean | string>> = {}
  if (typeof raw['plugins'] === 'object' && raw['plugins'] !== null) {
    for (const [id, entry] of Object.entries(raw['plugins'] as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      const { enabled, granted } = entry as { enabled?: unknown; granted?: unknown }
      plugins[id] = {
        enabled: enabled === true,
        granted: Array.isArray(granted)
          ? granted.filter((g): g is string => typeof g === 'string')
          : []
      }
    }
  }
  if (typeof raw['values'] === 'object' && raw['values'] !== null) {
    for (const [id, entry] of Object.entries(raw['values'] as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      values[id] = Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).filter(
          (pair): pair is [string, boolean | string] =>
            typeof pair[1] === 'boolean' || typeof pair[1] === 'string'
        )
      )
    }
  }
  return { plugins, values }
}

function saveState(state: StateFile): void {
  writeJson(stateFile(), state)
}

/** Each plugin's secrets live under their own namespace, so one can never read another's. */
function namespace(id: string): string {
  return `plugin:${id}`
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[plugins] listener failed:', error)
    }
  }
}

function logFor(id: string, level: 'info' | 'warn', message: string): void {
  if (!message) return
  // A plugin's warnings are kept in every build — they are how a broken plugin gets reported.
  if (level === 'warn') console.warn(`[plugin:${id}] ${message}`)
  else if (isDev) console.log(`[plugin:${id}] ${message}`)
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
