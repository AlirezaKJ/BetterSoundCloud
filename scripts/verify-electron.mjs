/**
 * Fails unless the Electron that `npm ci` installs is the Castlabs build package.json names.
 *
 * Why it exists: v0.7.x's package.json pinned `#v41.1.1+wvcus` while its package-lock resolved
 * 42.0.0+wvcus, so `npm ci` built a different Electron from the one the manifest declared, and no
 * bug report could be reproduced. `npm ci` trusts the lockfile's commit and never checks it against
 * the tag, so nothing noticed. Electron is the dependency that decides whether DRM plays at all,
 * and the Chromium the user agent is built from (src/shared/identity.ts).
 *
 * Offline, it checks: the Castlabs tag in package.json; the lockfile's entry for it (the same
 * source, the same version, from Castlabs' repository); and the installed package and the binary
 * its postinstall downloaded. `npm run check` runs this.
 *
 * With --remote it also asks GitHub which commit the tag points at, and compares that with the
 * commit the lockfile resolved: the one check that catches a lockfile whose version string is
 * right and whose commit is not. CI runs it that way, after `npm ci`.
 *
 * Usage:
 *   node scripts/verify-electron.mjs [--remote] [--root <project folder>]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPOSITORY = 'https://github.com/castlabs/electron-releases'

const args = process.argv.slice(2)
const remote = args.includes('--remote')
const rootAt = args.indexOf('--root')
const root = rootAt === -1 ? process.cwd() : args[rootAt + 1]

let failed = false
function check(name, pass, detail) {
  if (!pass) failed = true
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

// ── What package.json asks for ──────────────────────────────────────────────────
const manifest = readJson('package.json')
const declared = manifest.devDependencies?.electron ?? manifest.dependencies?.electron ?? ''
const tag = /^https:\/\/github\.com\/castlabs\/electron-releases#(v(.+\+wvcus))$/.exec(declared)
check(
  'package.json asks for a Castlabs Widevine build by tag',
  Boolean(tag),
  declared || 'missing'
)
if (!tag) process.exit(1)
const [, tagName, version] = tag

// ── What the lockfile will install ──────────────────────────────────────────────
const lock = readJson('package-lock.json')
const rootEntry = lock.packages?.['']
const lockedSpec = rootEntry?.devDependencies?.electron ?? rootEntry?.dependencies?.electron
check('the lockfile asks for the same thing', lockedSpec === declared, lockedSpec ?? 'missing')

const locked = lock.packages?.['node_modules/electron'] ?? {}
check(
  'the lockfile resolves that version',
  locked.version === version,
  locked.version ?? 'missing'
)

const commit = /github\.com\/castlabs\/electron-releases\.git#([0-9a-f]{40})$/.exec(
  locked.resolved ?? ''
)?.[1]
check(
  'from Castlabs’ repository, at a fixed commit',
  Boolean(commit),
  locked.resolved ?? 'missing'
)

// ── What is installed ───────────────────────────────────────────────────────────
const installedPackage = join(root, 'node_modules/electron/package.json')
const installed = existsSync(installedPackage)
  ? JSON.parse(readFileSync(installedPackage, 'utf8')).version
  : null
check(
  'the installed package is that version',
  installed === version,
  installed ?? 'not installed'
)

// The binary comes from the package's postinstall, not from the lockfile: a stale one survives an
// `npm ci` that skipped scripts (#99), and runs a different Chromium from everything above.
const binaryVersion = join(root, 'node_modules/electron/dist/version')
const binary = existsSync(binaryVersion) ? readFileSync(binaryVersion, 'utf8').trim() : null
check('the downloaded binary is that version', binary === version, binary ?? 'not downloaded')

// ── Where the tag really points (network) ───────────────────────────────────────
if (remote && commit) {
  let tagged
  try {
    // An annotated tag is a tag object pointing at a commit; `^{}` asks for the commit itself.
    const out = execFileSync(
      'git',
      ['ls-remote', REPOSITORY, `refs/tags/${tagName}`, `refs/tags/${tagName}^{}`],
      { encoding: 'utf8', timeout: 60_000 }
    )
    const lines = out.trim().split('\n').filter(Boolean)
    const peeled = lines.find((line) => line.endsWith('^{}')) ?? lines[0]
    tagged = peeled?.split(/\s+/)[0] ?? null
  } catch (error) {
    tagged = `could not ask GitHub: ${error.message.split('\n')[0]}`
  }
  check(
    `the tag ${tagName} is the commit the lockfile resolved`,
    tagged === commit,
    tagged ?? 'no such tag'
  )
}

process.exit(failed ? 1 : 0)
