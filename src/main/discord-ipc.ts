import { createConnection } from 'node:net'
import type { Socket } from 'node:net'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Activity, DiscordCloseReason } from '@shared/presence'

/**
 * A minimal client for the Discord app's local RPC pipe: just enough to show an activity.
 *
 * WHY NOT A LIBRARY. The protocol is five frame types over one local socket, and setting an
 * activity uses two of them. The maintained libraries bring websocket and REST clients this app
 * would never call; v0.7.x's `discord-rpc` is unmaintained. Under two hundred lines anyone can
 * read beat a dependency tree nobody will. No network is involved — this talks only to the
 * Discord app on the same computer, which does the rest.
 *
 * THE PROTOCOL, measured 2026-10-27 against Discord on Windows. Each frame is an 8-byte header
 * (opcode, then body length, both little-endian uint32) and a JSON body. We send a HANDSHAKE
 * `{ v: 1, client_id }`; Discord answers with a FRAME whose `evt` is `READY`, or — for an unknown
 * client id — a CLOSE `{ code: 4000, message: 'Invalid Client ID' }`. After READY, a FRAME with
 * `cmd: 'SET_ACTIVITY'` sets or clears the activity. Discord PINGs; we PONG back the same body.
 * Closing the pipe clears the activity, so a crash cannot leave a stale card behind.
 */

export const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const

export function encodeFrame(op: number, body: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(body), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(op, 0)
  header.writeUInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

export type Frame = { op: number; body: unknown }

/**
 * Splits the byte stream from the pipe back into frames. A chunk can hold part of a frame or
 * several at once; nothing about the pipe promises one frame per read.
 */
export class FrameReader {
  private pending = Buffer.alloc(0)

  push(chunk: Buffer): Frame[] {
    this.pending = Buffer.concat([this.pending, chunk])
    const frames: Frame[] = []
    while (this.pending.length >= 8) {
      const op = this.pending.readUInt32LE(0)
      const length = this.pending.readUInt32LE(4)
      if (this.pending.length < 8 + length) break
      const json = this.pending.subarray(8, 8 + length).toString('utf8')
      this.pending = this.pending.subarray(8 + length)
      frames.push({ op, body: parseJson(json) })
    }
    return frames
  }
}

/**
 * Where the Discord app listens, in the order to try. Discord takes the first free number of
 * ten, so `-0` is almost always it.
 *
 * Windows uses named pipes. Everywhere else it is a Unix socket in the runtime or temp
 * directory — inside the sandbox's own subfolder for the Flatpak and Snap builds of Discord.
 */
export function pipeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const numbers = Array.from({ length: 10 }, (_, i) => i)
  if (platform === 'win32') return numbers.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`)

  const directories = [env['XDG_RUNTIME_DIR'], env['TMPDIR'], env['TMP'], env['TEMP'], '/tmp']
    .filter((dir): dir is string => typeof dir === 'string' && dir !== '')
    .filter((dir, index, all) => all.indexOf(dir) === index)
  const sandboxes = ['', 'app/com.discordapp.Discord', 'snap.discord']

  return directories.flatMap((dir) =>
    sandboxes.flatMap((sandbox) => numbers.map((i) => join(dir, sandbox, `discord-ipc-${i}`)))
  )
}

export type DiscordConnection = {
  /** Show `activity`, or clear the card with null. Ignored until Discord has said READY. */
  setActivity(activity: Activity | null): void
  /** Close the pipe. Discord clears the card when it closes. Does not call `onClose`. */
  close(): void
}

export type ConnectOptions = {
  clientId: string
  onReady: () => void
  /** The connection is gone, or never came up. Called once. */
  onClose: (reason: DiscordCloseReason) => void
  /** Discord refused a command — almost always an activity field it did not accept. */
  onError: (message: string) => void
  /** Where to look. Defaults to this platform's places; tests pass their own. */
  paths?: string[]
}

/** If Discord takes this long to answer the handshake, it is not going to. */
const HANDSHAKE_TIMEOUT_MS = 10_000

export function connectDiscord(options: ConnectOptions): DiscordConnection {
  const paths = options.paths ?? pipeCandidates(process.platform, process.env)
  let socket: Socket | null = null
  let ready = false
  let finished = false
  // What to report when the pipe closes: Discord's own CLOSE message if it sent one first.
  let closeReason: DiscordCloseReason = {
    kind: 'lost',
    message: 'Discord closed the connection'
  }
  const reader = new FrameReader()

  const finish = (reason: DiscordCloseReason): void => {
    if (finished) return
    finished = true
    clearTimeout(handshakeTimer)
    socket?.destroy()
    options.onClose(reason)
  }

  const handshakeTimer = setTimeout(
    () => finish({ kind: 'lost', message: 'Discord did not answer the handshake' }),
    HANDSHAKE_TIMEOUT_MS
  )

  const onFrame = ({ op, body }: Frame): void => {
    if (op === OP.ping) {
      socket?.write(encodeFrame(OP.pong, body))
      return
    }
    if (op === OP.close) {
      closeReason = { kind: 'refused', message: messageOf(body) || 'no reason given' }
      socket?.end()
      return
    }
    if (op !== OP.frame || !isObject(body)) return

    if (body['evt'] === 'READY' && !ready) {
      ready = true
      clearTimeout(handshakeTimer)
      options.onReady()
    } else if (body['evt'] === 'ERROR') {
      options.onError(messageOf(body['data']) || 'unknown error')
    }
  }

  /** Try each place in turn until one answers. */
  const tryPath = (index: number): void => {
    if (finished) return
    const path = paths[index]
    if (path === undefined) {
      finish({ kind: 'not-running' })
      return
    }

    const candidate = createConnection(path)
    candidate.once('error', () => {
      // Nothing listening here. Not an error of ours — try the next place.
      if (socket === null) tryPath(index + 1)
    })
    candidate.once('connect', () => {
      // Closed while this attempt was still on its way: do not start a session nobody wants.
      if (finished) {
        candidate.destroy()
        return
      }
      socket = candidate
      candidate.removeAllListeners('error')
      candidate.on('error', () =>
        finish({ kind: 'lost', message: 'the connection to Discord failed' })
      )
      candidate.on('close', () => finish(closeReason))
      candidate.on('data', (chunk: Buffer) => reader.push(chunk).forEach(onFrame))
      candidate.write(encodeFrame(OP.handshake, { v: 1, client_id: options.clientId }))
    })
  }

  tryPath(0)

  return {
    setActivity(activity) {
      if (!ready || finished || !socket) return
      socket.write(
        encodeFrame(OP.frame, {
          cmd: 'SET_ACTIVITY',
          // `pid` ties the card to this process, so Discord clears it if we exit. Leaving out
          // `activity` is how a card is cleared.
          args: activity ? { pid: process.pid, activity } : { pid: process.pid },
          nonce: randomUUID()
        })
      )
    },
    close() {
      finished = true
      clearTimeout(handshakeTimer)
      socket?.end()
    }
  }
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function messageOf(value: unknown): string {
  return isObject(value) && typeof value['message'] === 'string' ? value['message'] : ''
}
