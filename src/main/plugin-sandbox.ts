import vm from 'node:vm'
import { createHash } from 'node:crypto'
import type { NowPlaying } from '@shared/now-playing'
import type {
  PluginAction,
  PluginApi,
  PluginFetchInit,
  PluginModule,
  PluginResponse,
  PluginStatus
} from '@shared/plugin-api'
import { httpsHost } from '@shared/plugins'
import type { PluginCall } from '@shared/plugins'

/**
 * Runs one plugin's script and gives it its `bsc` API. Used inside the plugin's own process
 * (src/main/plugin-host.ts), and by tests, which is why it knows nothing about Electron: the
 * process hands it a `Bridge` for everything that leaves the plugin.
 *
 * WHAT THE CONTEXT HOLDS. A fresh `vm` context: JavaScript's own built-ins, `module` and
 * `exports`, timers, `console`, `URL` and `URLSearchParams`. No `require`, no `process`, no
 * file system, no `fetch` but ours. A plugin that uses the API as written can do only what its
 * permissions allow.
 *
 * WHAT IT IS NOT. A security boundary. Node says so of `vm` in its own documentation, and the
 * objects handed in come from this realm, so code written to escape can reach the process
 * around it. The separate process is what protects the app — a plugin that crashes or loops
 * forever cannot freeze it — not this. Hence "only add plugins you trust".
 *
 * TEARDOWN. Every timer and listener a plugin creates is tracked, and `stop` clears them all
 * after `deactivate`, whether or not the plugin remembered to. That is the "teardown and single
 * injection" guarantee the roadmap asks of PluginService (Amend Phase 4).
 */

export type Bridge = {
  /** Ask main for something. Rejects with main's reason when it refuses. */
  call: (method: PluginCall, args: unknown[]) => Promise<unknown>
  status: (status: PluginStatus | null) => void
  actions: (actions: PluginAction[]) => void
  log: (level: 'info' | 'warn', message: string) => void
  /** Perform an https request. The host decides how (Electron's `net.fetch` in the app). */
  fetch: (url: string, init: PluginFetchInit) => Promise<{ status: number; body: string }>
}

export type PluginStart = {
  id: string
  version: string
  /** The script's text. Main reads the file, so this process needs no file access at all. */
  code: string
  /** For stack traces only. */
  filename: string
  /** What the user approved. */
  permissions: string[]
  settings: Record<string, boolean | string>
}

export type RunningPlugin = {
  nowPlaying(value: NowPlaying | null): void
  settings(values: Record<string, boolean | string>): void
  action(id: string): void
  /** Call `deactivate`, then clear every timer and listener the plugin left behind. */
  stop(): Promise<void>
}

/** Synchronous code at load may run this long; an endless loop at the top level ends here. */
const EVALUATE_TIMEOUT_MS = 5_000
/** How long `activate` and `deactivate` may take before the plugin counts as stuck. */
const LIFECYCLE_TIMEOUT_MS = 10_000
/** A plugin's response bodies are capped, so one cannot exhaust its process's memory. */
const MAX_RESPONSE_CHARS = 5_000_000

export async function runPlugin(start: PluginStart, bridge: Bridge): Promise<RunningPlugin> {
  const granted = new Set(start.permissions)
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const intervals = new Set<ReturnType<typeof setInterval>>()
  const nowPlayingListeners = new Set<(value: NowPlaying | null) => void>()
  const settingsListeners = new Set<(values: Record<string, boolean | string>) => void>()
  const actionListeners = new Set<(id: string) => void>()
  let settings = { ...start.settings }
  let stopped = false

  const format = (values: unknown[]): string =>
    values
      .map((v) =>
        typeof v === 'string' ? v : isErrorLike(v) ? v.stack || v.message : safeJson(v)
      )
      .join(' ')
  const log = (...values: unknown[]): void => bridge.log('info', format(values))
  const warn = (...values: unknown[]): void => bridge.log('warn', format(values))

  /** Run plugin code that we call into, so one throw cannot take the others down. */
  const guarded =
    <A extends unknown[]>(what: string, fn: (...args: A) => unknown) =>
    (...args: A): void => {
      if (stopped) return
      try {
        const result = fn(...args)
        // Duck-typed: a promise made inside the plugin's context is not `instanceof` this
        // realm's Promise, so the plain check would let its rejection go unreported.
        if (isThenable(result))
          result.then(undefined, (e: unknown) => warn(`${what} failed:`, e))
      } catch (error) {
        warn(`${what} failed:`, error)
      }
    }

  const subscribe = <T>(set: Set<T>, listener: T): (() => void) => {
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  const requirePermission = (permission: string, what: string): void => {
    if (!granted.has(permission)) {
      throw new Error(`${what} needs the "${permission}" permission in plugin.json`)
    }
  }

  const api: PluginApi = Object.freeze({
    plugin: Object.freeze({ id: start.id, version: start.version }),
    log,
    warn,

    nowPlaying: Object.freeze({
      get: async () => {
        requirePermission('nowPlaying', 'bsc.nowPlaying.get')
        return (await bridge.call('nowPlaying.get', [])) as NowPlaying | null
      },
      onChange: (listener: (value: NowPlaying | null) => void) => {
        requirePermission('nowPlaying', 'bsc.nowPlaying.onChange')
        return subscribe(nowPlayingListeners, listener)
      }
    }),

    settings: Object.freeze({
      get: () => ({ ...settings }),
      onChange: (listener: (values: Record<string, boolean | string>) => void) =>
        subscribe(settingsListeners, listener),
      secret: async (key: string) => {
        const value = await bridge.call('settings.secret', [key])
        return typeof value === 'string' ? value : ''
      }
    }),

    status: Object.freeze({ set: (status: PluginStatus | null) => bridge.status(status) }),

    actions: Object.freeze({
      set: (actions: PluginAction[]) => bridge.actions(actions),
      onPress: (listener: (id: string) => void) => subscribe(actionListeners, listener)
    }),

    storage: Object.freeze({
      get: (key: string) => bridge.call('storage.get', [key]),
      set: async (key: string, value: unknown) => {
        await bridge.call('storage.set', [key, value])
      }
    }),

    secrets: Object.freeze({
      get: async (key: string) => {
        requirePermission('secrets', 'bsc.secrets.get')
        const value = await bridge.call('secrets.get', [key])
        return typeof value === 'string' ? value : null
      },
      set: async (key: string, value: string) => {
        requirePermission('secrets', 'bsc.secrets.set')
        await bridge.call('secrets.set', [key, value])
      },
      delete: async (key: string) => {
        requirePermission('secrets', 'bsc.secrets.delete')
        await bridge.call('secrets.delete', [key])
      }
    }),

    fetch: async (url: string, init: PluginFetchInit = {}): Promise<PluginResponse> => {
      const host = httpsHost(url)
      if (host === null) throw new Error(`bsc.fetch only makes https requests: ${String(url)}`)
      requirePermission(`network:${host}`, `A request to ${host}`)
      const request: PluginFetchInit = {}
      if (init.method === 'POST') request.method = 'POST'
      if (init.headers) request.headers = { ...init.headers }
      if (typeof init.body === 'string') request.body = init.body
      const { status, body } = await bridge.fetch(url, request)
      const text = body.slice(0, MAX_RESPONSE_CHARS)
      return Object.freeze({
        status,
        ok: status >= 200 && status < 300,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve(JSON.parse(text) as unknown)
      })
    },

    openInBrowser: async (url: string) => {
      const host = httpsHost(url)
      if (host === null)
        throw new Error(`bsc.openInBrowser only opens https pages: ${String(url)}`)
      requirePermission(`browser:${host}`, `Opening ${host}`)
      await bridge.call('openInBrowser', [url])
    },

    hash: Object.freeze({
      md5: (text: string) => createHash('md5').update(String(text), 'utf8').digest('hex'),
      sha256: (text: string) => createHash('sha256').update(String(text), 'utf8').digest('hex')
    })
  })

  // Timers the plugin can use, tracked so `stop` can clear what it forgets. These run in the
  // plugin's own process, not on SoundCloud's page, so the no-polling rule does not apply here.
  const sandboxTimers = {
    setTimeout: (fn: () => void, ms?: number) => {
      const handle = setTimeout(() => {
        timers.delete(handle)
        guarded('A timer', fn)()
      }, ms)
      timers.add(handle)
      return handle
    },
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => {
      clearTimeout(handle)
      timers.delete(handle)
    },
    setInterval: (fn: () => void, ms?: number) => {
      // eslint-disable-next-line no-restricted-globals -- the plugin's own process, not SoundCloud's page
      const handle = setInterval(guarded('An interval', fn), Math.max(1_000, ms ?? 0))
      intervals.add(handle)
      return handle
    },
    clearInterval: (handle: ReturnType<typeof setInterval>) => {
      clearInterval(handle)
      intervals.delete(handle)
    }
  }

  const module = { exports: {} as unknown }
  const context = vm.createContext({
    module,
    exports: module.exports,
    console: Object.freeze({ log, info: log, debug: log, warn, error: warn }),
    URL,
    URLSearchParams,
    ...sandboxTimers
  })

  // `use strict` inside the wrapper, so a stray assignment to an undeclared name throws
  // instead of quietly creating a global.
  const wrapped = `(function (module, exports) { 'use strict';\n${start.code}\n})`
  const factory = new vm.Script(wrapped, { filename: start.filename }).runInContext(context, {
    timeout: EVALUATE_TIMEOUT_MS
  }) as (m: typeof module, e: unknown) => void
  factory(module, module.exports)

  const plugin = module.exports as Partial<PluginModule> | null
  if (!plugin || typeof plugin.activate !== 'function') {
    throw new Error('the script must set module.exports = { activate(bsc) { … } }')
  }

  const clearEverything = (): void => {
    for (const handle of timers) clearTimeout(handle)
    for (const handle of intervals) clearInterval(handle)
    timers.clear()
    intervals.clear()
    nowPlayingListeners.clear()
    settingsListeners.clear()
    actionListeners.clear()
  }

  try {
    await withTimeout(Promise.resolve(plugin.activate(api)), LIFECYCLE_TIMEOUT_MS, 'activate')
  } catch (error) {
    stopped = true
    clearEverything()
    throw error
  }

  const deliver = <T>(set: Set<(value: T) => void>, what: string, value: T): void => {
    for (const listener of [...set]) guarded(what, listener)(value)
  }

  return {
    nowPlaying: (value) => deliver(nowPlayingListeners, 'A now-playing listener', value),
    settings: (values) => {
      settings = { ...values }
      deliver(settingsListeners, 'A settings listener', { ...values })
    },
    action: (id) => deliver(actionListeners, 'An action listener', id),
    stop: async () => {
      if (stopped) return
      try {
        if (typeof plugin.deactivate === 'function') {
          await withTimeout(
            Promise.resolve(plugin.deactivate()),
            LIFECYCLE_TIMEOUT_MS,
            'deactivate'
          )
        }
      } catch (error) {
        warn('deactivate failed:', error)
      } finally {
        stopped = true
        clearEverything()
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} did not finish within ${ms / 1000}s`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** An Error from any realm — the plugin's context has its own Error, so `instanceof` misses it. */
function isErrorLike(value: unknown): value is { message: string; stack?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
