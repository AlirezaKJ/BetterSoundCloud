import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/*
 * scripts/verify-electron.mjs, run for real against small fake projects: a package.json, a
 * package-lock.json and an installed electron package, each one wrong in turn. Offline only; the
 * --remote check against GitHub runs in CI itself.
 */

const SCRIPT = join(import.meta.dirname, '../../scripts/verify-electron.mjs')
const SPEC = 'https://github.com/castlabs/electron-releases#v43.2.0+wvcus'
const COMMIT = '8244344c33634d9323377c0d0fd1d9b7f9b69540'

type Project = {
  spec?: string
  lockSpec?: string
  lockVersion?: string
  resolved?: string
  installed?: string | null
  binary?: string | null
}

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A project folder as `npm ci` would leave it, with the given parts changed. */
function project(parts: Project = {}): string {
  const {
    spec = SPEC,
    lockSpec = spec,
    lockVersion = '43.2.0+wvcus',
    resolved = `git+ssh://git@github.com/castlabs/electron-releases.git#${COMMIT}`,
    installed = '43.2.0+wvcus',
    binary = '43.2.0+wvcus'
  } = parts
  const folder = mkdtempSync(join(tmpdir(), 'bsc-electron-pin-'))
  folders.push(folder)
  const json = (path: string, value: unknown) =>
    writeFileSync(join(folder, path), JSON.stringify(value))
  json('package.json', { devDependencies: { electron: spec } })
  json('package-lock.json', {
    packages: {
      '': { devDependencies: { electron: lockSpec } },
      'node_modules/electron': { version: lockVersion, resolved }
    }
  })
  mkdirSync(join(folder, 'node_modules/electron/dist'), { recursive: true })
  if (installed) json('node_modules/electron/package.json', { version: installed })
  if (binary) writeFileSync(join(folder, 'node_modules/electron/dist/version'), binary)
  return folder
}

function verify(folder: string): { passed: boolean; output: string } {
  const run = spawnSync(process.execPath, [SCRIPT, '--root', folder], { encoding: 'utf8' })
  return { passed: run.status === 0, output: run.stdout }
}

describe('verify-electron', () => {
  it('passes a project whose manifest, lockfile, package and binary all agree', () => {
    const { passed, output } = verify(project())
    expect(passed, output).toBe(true)
    expect(output).not.toContain('FAIL')
  })

  it('catches v0.7.x’s mismatch: the manifest says one build, the lockfile installs another', () => {
    // package.json pinned #v41.1.1+wvcus while the lockfile resolved 42.0.0+wvcus.
    const { passed, output } = verify(
      project({
        spec: 'https://github.com/castlabs/electron-releases#v41.1.1+wvcus',
        lockVersion: '42.0.0+wvcus',
        installed: '42.0.0+wvcus',
        binary: '42.0.0+wvcus'
      })
    )
    expect(passed).toBe(false)
    expect(output).toContain('FAIL  the lockfile resolves that version  (42.0.0+wvcus)')
  })

  it('refuses stock Electron, which has no Widevine', () => {
    expect(verify(project({ spec: '^43.2.0' })).passed).toBe(false)
    const fromRegistry = verify(
      project({ resolved: 'https://registry.npmjs.org/electron/-/electron-43.2.0.tgz' })
    )
    expect(fromRegistry.passed).toBe(false)
    expect(fromRegistry.output).toContain('FAIL  from Castlabs’ repository')
  })

  it('catches a lockfile that no longer matches the manifest', () => {
    const { passed, output } = verify(
      project({ lockSpec: 'https://github.com/castlabs/electron-releases#v42.0.0+wvcus' })
    )
    expect(passed).toBe(false)
    expect(output).toContain('FAIL  the lockfile asks for the same thing')
  })

  it('catches a stale or missing binary, which the lockfile cannot see', () => {
    // The binary is the postinstall's download: an install that skipped scripts keeps the old one.
    expect(verify(project({ binary: '42.0.0+wvcus' })).output).toContain(
      'FAIL  the downloaded binary is that version  (42.0.0+wvcus)'
    )
    expect(verify(project({ binary: null })).passed).toBe(false)
    expect(verify(project({ installed: null })).passed).toBe(false)
  })
})
