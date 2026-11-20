/**
 * Bring the Windows update feed back in line with the installer after it has been code-signed.
 *
 * electron-builder writes `latest.yml` (the sha512 and size electron-updater checks every download
 * against) and the setup's `.blockmap` (what a differential update compares, block by block) while
 * it builds the installer. .github/workflows/release.yml has SignPath sign the installer after
 * that, and signing changes its bytes: left alone, every user's update would fail its checksum.
 * This rebuilds the blockmap from the signed file with electron-builder's own code, and writes the
 * new hash and size into latest.yml.
 *
 * Usage: node scripts/refresh-windows-feed.mjs [folder holding latest.yml, default: release]
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function fail(message) {
  console.error(`[feed] ${message}`)
  process.exit(1)
}

const folder = path.resolve(process.argv[2] ?? 'release')
const feedFile = path.join(folder, 'latest.yml')
if (!existsSync(feedFile)) fail(`No update feed at ${feedFile}.`)
const feed = readFileSync(feedFile, 'utf8')

// What electron-builder writes for one NSIS installer: the file's hash twice (at the top and in
// its one entry under `files`), and its size once, in that entry. Anything else is a feed this
// script does not understand, and guessing at it would ship a feed that breaks every update.
const setupName = feed.match(/^path: (.+)$/m)?.[1]
const oldSha512 = feed.match(/^sha512: (.+)$/m)?.[1]
const sizeLines = feed.match(/^ {4}size: \d+$/gm) ?? []
if (
  !setupName ||
  !oldSha512 ||
  feed.split(oldSha512).length - 1 !== 2 ||
  sizeLines.length !== 1
) {
  fail(
    `${feedFile} does not look like electron-builder's feed for one installer. Left unchanged.`
  )
}

const setupFile = path.join(folder, setupName)
if (!existsSync(setupFile)) fail(`The feed describes ${setupName}, which is not in ${folder}.`)

// electron-builder's own blockmap code, from the app-builder-lib that electron-builder installed,
// so the blockmap is exactly the one it would have written for this file.
const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js')
const blockMap = await buildBlockMap(setupFile, 'gzip', `${setupFile}.blockmap`)

// electron-updater checks the base64 SHA-512 of the whole file. Computed here as well, so a change
// in what buildBlockMap returns cannot slip a wrong hash into the feed.
const sha512 = createHash('sha512').update(readFileSync(setupFile)).digest('base64')
if (blockMap.sha512 !== sha512) fail(`buildBlockMap's hash of ${setupName} is not its SHA-512.`)

writeFileSync(
  feedFile,
  feed.replaceAll(oldSha512, sha512).replace(/^( {4}size: )\d+$/m, `$1${blockMap.size}`)
)
console.log(
  `[feed] ${setupName}: latest.yml now has its signed hash and size, and the blockmap is rebuilt.`
)
