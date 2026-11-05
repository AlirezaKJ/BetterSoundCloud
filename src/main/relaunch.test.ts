import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type * as ChildProcess from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  relaunch: vi.fn(),
  spawn: vi.fn((..._args: unknown[]) => ({ unref: vi.fn() }))
}))

vi.mock('electron', () => ({ app: { relaunch: mocks.relaunch } }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  spawn: mocks.spawn
}))

const { relaunchAfterQuit, WAIT_THEN_START } = await import('./relaunch')
// The real ones, for running the shell snippet; the mock above covers this whole file.
const { execFileSync, spawn: realSpawn } =
  await vi.importActual<typeof ChildProcess>('node:child_process')

/**
 * A script that, when run, writes the arguments it got into `started` in its own folder, one per
 * line, so no path is ever pasted into its text.
 */
function startScript(dir: string, name: string): string {
  const file = join(dir, name)
  writeFileSync(file, '#!/bin/sh\nprintf "%s\\n" "$@" > "$(dirname "$0")/started"\n')
  chmodSync(file, 0o755)
  return file
}

const realPlatform = process.platform
const onPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

beforeEach(() => {
  mocks.relaunch.mockReset()
  mocks.spawn.mockClear()
  delete process.env['APPIMAGE']
  // Electron sets it as the app starts; the Castlabs build dies at startup while it is set.
  process.env['CHROME_DESKTOP'] = 'bettersoundcloud.desktop'
})

afterEach(() => {
  onPlatform(realPlatform)
  delete process.env['APPIMAGE']
  delete process.env['CHROME_DESKTOP']
})

describe('relaunchAfterQuit', () => {
  it('starts an AppImage from outside its own mount, once this process has gone', () => {
    onPlatform('linux')
    process.env['APPIMAGE'] = '/home/a/BetterSoundCloud.AppImage'
    relaunchAfterQuit()

    // app.relaunch's helper would run from the mount the AppImage removes on exit.
    expect(mocks.relaunch).not.toHaveBeenCalled()
    expect(mocks.spawn).toHaveBeenCalledOnce()
    const [command, args, options] = mocks.spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { detached: boolean; env: NodeJS.ProcessEnv }
    ]
    expect(['/bin/bash', '/bin/sh']).toContain(command)
    expect(args).toEqual([
      '-c',
      WAIT_THEN_START,
      'relaunch',
      String(process.pid),
      '/home/a/BetterSoundCloud.AppImage',
      // This copy's own arguments, as app.relaunch() would pass them.
      ...process.argv.slice(1)
    ])
    expect(options.detached).toBe(true)
    expect(options.env['CHROME_DESKTOP']).toBeUndefined()
  })

  it('starts the file it is given: the updater’s renamed new version', () => {
    onPlatform('linux')
    process.env['APPIMAGE'] = '/home/a/BetterSoundCloud-0.8.0-linux-x86_64.AppImage'
    relaunchAfterQuit('/home/a/BetterSoundCloud-0.8.1-linux-x86_64.AppImage')
    const args = mocks.spawn.mock.calls[0]?.[1] as string[]
    // After '-c', the script, its name and the pid: the file, then this copy's arguments.
    expect(args[4]).toBe('/home/a/BetterSoundCloud-0.8.1-linux-x86_64.AppImage')
  })

  it('uses app.relaunch everywhere else, without CHROME_DESKTOP', () => {
    for (const platform of ['linux', 'win32'] as const) {
      onPlatform(platform)
      process.env['CHROME_DESKTOP'] = 'bettersoundcloud.desktop'
      let atRelaunch: string | undefined = 'not called'
      mocks.relaunch.mockImplementationOnce(() => {
        atRelaunch = process.env['CHROME_DESKTOP']
      })
      relaunchAfterQuit()
      expect(atRelaunch).toBeUndefined()
    }
    expect(mocks.relaunch).toHaveBeenCalledTimes(2)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})

// The shell relaunch.ts picks on a desktop. These tests need a Unix shell; Windows never runs it.
const BASH = '/bin/bash'
const describeUnix = describe.skipIf(process.platform === 'win32' || !existsSync(BASH))

describeUnix('WAIT_THEN_START, run by a real shell', () => {
  it('starts the file only after the process it waits on has exited', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bsc-relaunch-'))
    try {
      const marker = join(dir, 'started')
      const start = startScript(dir, 'start.sh')

      // Stands in for the app: alive for a second, then gone.
      const app = realSpawn('sleep', ['1'], { stdio: 'ignore' })
      const waiter = realSpawn(
        BASH,
        ['-c', WAIT_THEN_START, 'relaunch', String(app.pid), start],
        {
          stdio: 'ignore'
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(existsSync(marker)).toBe(false)

      await new Promise((resolve) => waiter.on('exit', resolve))
      expect(existsSync(marker)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes paths and arguments with spaces and quotes through untouched', () => {
    // Every value is an argument, never pasted into the script.
    const dir = mkdtempSync(join(tmpdir(), 'bsc relaunch "q" '))
    try {
      const start = startScript(dir, 'start me.sh')
      const args = ['--safe-mode', '--user-data-dir=/tmp/a "b" c']
      // A pid that has already exited: the loop ends at once.
      execFileSync(BASH, ['-c', WAIT_THEN_START, 'relaunch', '2147483646', start, ...args])
      expect(readFileSync(join(dir, 'started'), 'utf8')).toBe(args.join('\n') + '\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('closes every file the app left open before starting the new copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bsc-relaunch-'))
    try {
      // Writes the descriptors the started program holds, one per line.
      const start = join(dir, 'start.sh')
      writeFileSync(start, '#!/bin/sh\nls /proc/$$/fd > "$(dirname "$0")/fds"\n')
      chmodSync(start, 0o755)
      const opened = async (script: string): Promise<string[]> => {
        // fd 3 stands in for a file Chromium left without close-on-exec.
        const shell = realSpawn(BASH, ['-c', script, 'relaunch', '2147483646', start], {
          stdio: ['ignore', 'ignore', 'ignore', 'pipe']
        })
        await new Promise((resolve) => shell.on('exit', resolve))
        return readFileSync(join(dir, 'fds'), 'utf8').trim().split('\n')
      }

      // Control: the same start without the closing line keeps it.
      expect(await opened('exec "$2"')).toContain('3')
      expect(await opened(WAIT_THEN_START)).not.toContain('3')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
