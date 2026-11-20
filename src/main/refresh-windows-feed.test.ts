import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/*
 * scripts/refresh-windows-feed.mjs, run for real on a folder shaped like release/ just after
 * SignPath has signed the installer: latest.yml still describes the file as it was before signing.
 */

const SCRIPT = join(import.meta.dirname, '../../scripts/refresh-windows-feed.mjs')
const SETUP = 'BetterSoundCloud-0.9.1-win-x64-setup.exe'

/** latest.yml as electron-builder 26 writes it for one NSIS installer. */
function feed(sha512: string, size: number): string {
  return [
    'version: 0.9.1',
    'files:',
    `  - url: ${SETUP}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${SETUP}`,
    `sha512: ${sha512}`,
    "releaseDate: '2026-11-20T12:00:00.000Z'",
    ''
  ].join('\n')
}

/** Bytes that differ along their length, so the blockmap has more than one block. */
function installerBytes(): Buffer {
  const bytes = Buffer.alloc(300_000)
  let seed = 7
  for (let i = 0; i < bytes.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    bytes[i] = seed >> 16
  }
  return bytes
}

const sha512 = (bytes: Buffer): string => createHash('sha512').update(bytes).digest('base64')

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function release(files: Record<string, string | Buffer>): string {
  const folder = mkdtempSync(join(tmpdir(), 'bsc-feed-'))
  folders.push(folder)
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(folder, name), content)
  return folder
}

const run = (folder: string) =>
  spawnSync(process.execPath, [SCRIPT, folder], { encoding: 'utf8' })

describe('refresh-windows-feed', () => {
  it("writes the signed installer's hash and size into the feed, and rebuilds its blockmap", () => {
    const signed = installerBytes()
    const folder = release({
      [SETUP]: signed,
      'latest.yml': feed(sha512(Buffer.from('the installer before signing')), 123)
    })

    const result = run(folder)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(readFileSync(join(folder, 'latest.yml'), 'utf8')).toBe(
      feed(sha512(signed), signed.length)
    )
    const blockMap = join(folder, `${SETUP}.blockmap`)
    expect(existsSync(blockMap) && statSync(blockMap).size).toBeGreaterThan(0)
  })

  it('refuses a feed it does not understand, and leaves it as it was', () => {
    const twoEntries = feed('old', 1).replace(
      `path: ${SETUP}`,
      `  - url: other.exe\n    sha512: old\n    size: 2\npath: ${SETUP}`
    )
    const folder = release({ [SETUP]: installerBytes(), 'latest.yml': twoEntries })

    const result = run(folder)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Left unchanged')
    expect(readFileSync(join(folder, 'latest.yml'), 'utf8')).toBe(twoEntries)
  })

  it('refuses when the installer the feed names is not there', () => {
    const folder = release({ 'latest.yml': feed('old', 1) })

    const result = run(folder)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${SETUP}, which is not in`)
  })
})
