import { net } from 'electron'
import { runPlugin } from './plugin-sandbox'
import type { RunningPlugin, PluginStart } from './plugin-sandbox'
import type { PluginCall } from '@shared/plugins'
import type { NowPlaying } from '@shared/now-playing'

/**
 * The entry point of a plugin's own process — an Electron utility process, one per plugin,
 * started by src/main/plugins.ts. It does three things: run the plugin (plugin-sandbox.ts),
 * relay its calls to main and main's answers back, and make its https requests.
 *
 * Why a process of its own: a plugin that throws, leaks or loops forever takes down this
 * process and nothing else. Main notices, says so in settings, and the app carries on.
 *
 * Messages from main are trusted — main is us. Messages this process sends are not, from main's
 * side: they carry a plugin's words, and main validates every one (readHostMessage).
 */

/** What main sends. The first message is always `start`. */
type FromMain =
  | { type: 'start'; plugin: PluginStart }
  | { type: 'reply'; callId: number; ok: boolean; value?: unknown; error?: string }
  | { type: 'nowPlaying'; value: NowPlaying | null }
  | { type: 'settings'; values: Record<string, boolean | string> }
  | { type: 'action'; id: string }
  | { type: 'stop' }

const port = process.parentPort
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextCallId = 1
let running: RunningPlugin | null = null

function call(method: PluginCall, args: unknown[]): Promise<unknown> {
  const callId = nextCallId++
  return new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject })
    port.postMessage({ type: 'call', callId, method, args })
  })
}

/** Response bodies are read whole and capped by the sandbox; a minute is the most we wait. */
const FETCH_TIMEOUT_MS = 60_000

async function request(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  // `net.fetch` rather than Node's fetch: it is the app's own network stack, so a system proxy
  // applies to plugins exactly as it does to SoundCloud. Measured to work in a utility process.
  const response = await net.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  return { status: response.status, body: await response.text() }
}

port.on('message', (event: { data: FromMain }) => {
  const message = event.data
  switch (message.type) {
    case 'start':
      void start(message.plugin)
      return
    case 'reply': {
      const waiting = pending.get(message.callId)
      if (!waiting) return
      pending.delete(message.callId)
      if (message.ok) waiting.resolve(message.value)
      else waiting.reject(new Error(message.error ?? 'refused'))
      return
    }
    case 'nowPlaying':
      running?.nowPlaying(message.value)
      return
    case 'settings':
      running?.settings(message.values)
      return
    case 'action':
      running?.action(message.id)
      return
    case 'stop':
      void stop()
      return
  }
})

async function start(plugin: PluginStart): Promise<void> {
  if (running) return
  try {
    running = await runPlugin(plugin, {
      call,
      status: (status) => port.postMessage({ type: 'status', status }),
      actions: (actions) => port.postMessage({ type: 'actions', actions }),
      log: (level, message) => port.postMessage({ type: 'log', level, message }),
      fetch: request
    })
    port.postMessage({ type: 'started' })
  } catch (error) {
    port.postMessage({ type: 'failed', message: describe(error) })
    process.exit(1)
  }
}

async function stop(): Promise<void> {
  await running?.stop()
  process.exit(0)
}

// A plugin's forgotten promise must not end its process — say so in the log instead.
process.on('unhandledRejection', (reason) => {
  port.postMessage({
    type: 'log',
    level: 'warn',
    message: `unhandled rejection: ${describe(reason)}`
  })
})
process.on('uncaughtException', (error) => {
  port.postMessage({
    type: 'log',
    level: 'warn',
    message: `uncaught exception: ${describe(error)}`
  })
})

function describe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return String(error)
}
