import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { connectDiscord, encodeFrame, FrameReader, OP, pipeCandidates } from './discord-ipc'
import type { DiscordConnection, Frame } from './discord-ipc'
import type { Activity } from '@shared/presence'

/*
 * The client against a fake Discord listening on a real local pipe (a named pipe on Windows, a
 * Unix socket elsewhere), so the bytes on the wire are the ones the real app would see. The fake
 * answers the way the real Discord did when measured on 2026-10-27.
 */

const ACTIVITY: Activity = {
  type: 2,
  status_display_type: 2,
  details: 'Birahe',
  state: 'Ali Sorena',
  assets: { large_image: 'bw-icon-bordered-white' },
  instance: false
}

type Fake = { path: string; frames: Frame[]; sockets: Socket[]; server: Server }

const fakes: Fake[] = []
const connections: DiscordConnection[] = []

function freshPath(): string {
  const name = `bsc-test-${randomUUID()}`
  return process.platform === 'win32' ? `\\\\?\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

/**
 * A fake Discord. By default it answers the handshake with READY; `reply` overrides what it
 * does with each frame it receives.
 */
async function fakeDiscord(
  reply: (frame: Frame, socket: Socket) => void = (frame, socket) => {
    if (frame.op === OP.handshake) {
      socket.write(encodeFrame(OP.frame, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }))
    }
  }
): Promise<Fake> {
  const fake: Fake = { path: freshPath(), frames: [], sockets: [], server: createServer() }
  fake.server.on('connection', (socket) => {
    fake.sockets.push(socket)
    const reader = new FrameReader()
    socket.on('data', (chunk: Buffer) => {
      for (const frame of reader.push(chunk)) {
        fake.frames.push(frame)
        reply(frame, socket)
      }
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>((resolve) => fake.server.listen(fake.path, resolve))
  fakes.push(fake)
  return fake
}

function connect(paths: string[]) {
  const events = { onReady: vi.fn(), onClose: vi.fn(), onError: vi.fn() }
  const connection = connectDiscord({ clientId: '1054636117284106270', paths, ...events })
  connections.push(connection)
  return { connection, ...events }
}

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close()
  for (const fake of fakes.splice(0)) {
    for (const socket of fake.sockets) socket.destroy()
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
  }
})

describe('frames', () => {
  it('round-trip, however the bytes arrive', () => {
    const bytes = Buffer.concat([
      encodeFrame(OP.frame, { cmd: 'A', title: 'ünïcødé 🎵' }),
      encodeFrame(OP.ping, { n: 2 })
    ])

    // All at once: both frames.
    expect(new FrameReader().push(bytes)).toEqual([
      { op: OP.frame, body: { cmd: 'A', title: 'ünïcødé 🎵' } },
      { op: OP.ping, body: { n: 2 } }
    ])

    // One byte at a time: the same two frames, each as soon as it is complete.
    const reader = new FrameReader()
    const frames = [...bytes].flatMap((byte) => reader.push(Buffer.from([byte])))
    expect(frames.map((f) => f.op)).toEqual([OP.frame, OP.ping])
  })
})

describe('pipeCandidates', () => {
  it('uses the ten numbered named pipes on Windows', () => {
    const paths = pipeCandidates('win32', {})
    expect(paths).toHaveLength(10)
    expect(paths[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
    expect(paths[9]).toBe('\\\\?\\pipe\\discord-ipc-9')
  })

  it('looks in the runtime directory first elsewhere, including the Flatpak and Snap ones', () => {
    const paths = pipeCandidates('linux', { XDG_RUNTIME_DIR: '/run/user/1000', TMPDIR: '/tmp' })
    expect(paths[0]).toBe(join('/run/user/1000', 'discord-ipc-0'))
    expect(paths).toContain(
      join('/run/user/1000', 'app/com.discordapp.Discord', 'discord-ipc-0')
    )
    expect(paths).toContain(join('/run/user/1000', 'snap.discord', 'discord-ipc-0'))
    // `/tmp` came from two places but is searched once.
    expect(paths.filter((p) => p === join('/tmp', 'discord-ipc-0'))).toHaveLength(1)
  })
})

describe('connectDiscord', () => {
  it('introduces itself with the client id and is ready when Discord says so', async () => {
    const fake = await fakeDiscord()
    const { onReady } = connect([fake.path])

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(fake.frames[0]).toEqual({
      op: OP.handshake,
      body: { v: 1, client_id: '1054636117284106270' }
    })
  })

  it('sets an activity tied to this process, and clears it by leaving the activity out', async () => {
    const fake = await fakeDiscord()
    const { connection, onReady } = connect([fake.path])
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())

    connection.setActivity(ACTIVITY)
    connection.setActivity(null)
    await vi.waitFor(() => expect(fake.frames).toHaveLength(3))

    const [, set, clear] = fake.frames as [Frame, Frame, Frame]
    expect(set).toMatchObject({
      op: OP.frame,
      body: { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: ACTIVITY } }
    })
    expect(clear.body).toMatchObject({ cmd: 'SET_ACTIVITY', args: { pid: process.pid } })
    expect((clear.body as { args: object }).args).not.toHaveProperty('activity')
    // Every command carries its own nonce.
    const nonces = [set, clear].map((f) => (f.body as { nonce: string }).nonce)
    expect(new Set(nonces).size).toBe(2)
  })

  it('sends nothing before Discord is ready', async () => {
    const fake = await fakeDiscord(() => undefined) // never answers the handshake
    const { connection } = connect([fake.path])
    await vi.waitFor(() => expect(fake.frames).toHaveLength(1))
    connection.setActivity(ACTIVITY)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fake.frames).toHaveLength(1)
  })

  it('answers a ping with the same body', async () => {
    const fake = await fakeDiscord((frame, socket) => {
      if (frame.op === OP.handshake) socket.write(encodeFrame(OP.ping, { id: 42 }))
    })
    connect([fake.path])
    await vi.waitFor(() =>
      expect(fake.frames.at(-1)).toEqual({ op: OP.pong, body: { id: 42 } })
    )
  })

  it('reports Discord turning it away, with Discord’s own reason', async () => {
    // Exactly what the real Discord sent for a wrong client id.
    const fake = await fakeDiscord((frame, socket) => {
      if (frame.op === OP.handshake) {
        socket.write(encodeFrame(OP.close, { code: 4000, message: 'Invalid Client ID' }))
        socket.end()
      }
    })
    const { onReady, onClose } = connect([fake.path])
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledWith('Invalid Client ID'))
    expect(onReady).not.toHaveBeenCalled()
  })

  it('passes a refused update on as an error, and stays connected', async () => {
    const fake = await fakeDiscord((frame, socket) => {
      if (frame.op === OP.handshake) {
        socket.write(encodeFrame(OP.frame, { cmd: 'DISPATCH', evt: 'READY', data: {} }))
      } else if (frame.op === OP.frame) {
        socket.write(
          encodeFrame(OP.frame, {
            cmd: 'SET_ACTIVITY',
            evt: 'ERROR',
            data: { code: 4000, message: 'child "activity" fails' }
          })
        )
      }
    })
    const { connection, onReady, onError, onClose } = connect([fake.path])
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
    connection.setActivity(ACTIVITY)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('child "activity" fails'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('skips places where nothing is listening, and says so when nothing is anywhere', async () => {
    const fake = await fakeDiscord()
    const found = connect([freshPath(), fake.path])
    await vi.waitFor(() => expect(found.onReady).toHaveBeenCalled())

    const none = connect([freshPath(), freshPath()])
    await vi.waitFor(() => expect(none.onClose).toHaveBeenCalledWith('Discord is not running'))
  })

  it('reports Discord quitting, but not a close of its own', async () => {
    const fake = await fakeDiscord()
    const quitting = connect([fake.path])
    await vi.waitFor(() => expect(quitting.onReady).toHaveBeenCalled())
    for (const socket of fake.sockets) socket.destroy()
    await vi.waitFor(() => expect(quitting.onClose).toHaveBeenCalledOnce())

    const fake2 = await fakeDiscord()
    const leaving = connect([fake2.path])
    await vi.waitFor(() => expect(leaving.onReady).toHaveBeenCalled())
    leaving.connection.close()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(leaving.onClose).not.toHaveBeenCalled()
  })
})
