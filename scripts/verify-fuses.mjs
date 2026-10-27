/**
 * Reads Electron's fuses back out of a packaged executable and fails unless each one matches
 * `electronFuses` in electron-builder.yml.
 *
 * Why it exists: electron-builder flips the fuses while packing, and nothing else ever reads them
 * back. If that step silently did nothing on the Castlabs build, the release would still pack,
 * sign and pass `verify-pkg` (which checks the Widevine signature, not the fuses), and ship with
 * `onlyLoadAppFromAsar` and the archive integrity check off: the two that keep the v0.7.x
 * remote-code class of bug from coming back. The release workflow runs this on every build.
 *
 * It reads them with the same copy of @electron/fuses that electron-builder flips them with.
 *
 * Usage:
 *   node scripts/verify-fuses.mjs <packaged executable>
 *   e.g. release/win-unpacked/BetterSoundCloud.exe, release/linux-unpacked/bettersoundcloud
 */

import { existsSync, readFileSync } from 'node:fs'
// A CommonJS package whose exports Node cannot see as named ones, so take them off the default.
import fuses from '@electron/fuses'

const { FuseV1Options, getCurrentFuseWire } = fuses

// Each fuse is one byte on the wire: '1' on, '0' off ('r' means removed). @electron/fuses has an
// enum for these but does not export it from its entry point.
const ON = '1'.charCodeAt(0)
const OFF = '0'.charCodeAt(0)
const describe = (state) => (state === ON ? 'on' : state === OFF ? 'off' : `byte ${state}`)

// Settings in the electronFuses block that are electron-builder options, not fuses.
const NOT_FUSES = new Set(['resetAdHocDarwinSignature'])

/** The `name: true|false` lines of the `electronFuses:` block, up to the next top-level line. */
function expectedFuses(yaml) {
  const block = yaml.split(/^electronFuses:[ \t]*$/m)[1]?.split(/^\S/m)[0]
  if (!block) throw new Error('electron-builder.yml has no electronFuses block')

  const wanted = new Map()
  for (const [, name, value] of block.matchAll(/^ {2}(\w+): (true|false)[ \t]*$/gm)) {
    if (!NOT_FUSES.has(name)) wanted.set(name, value === 'true')
  }
  return wanted
}

const binary = process.argv[2]
if (!binary || !existsSync(binary)) {
  console.error(`No packaged executable at ${binary ?? '(none given)'}.`)
  console.error('Usage: node scripts/verify-fuses.mjs <packaged executable>')
  process.exit(2)
}

const wanted = expectedFuses(readFileSync('electron-builder.yml', 'utf8'))
const wire = await getCurrentFuseWire(binary)
let failures = 0

for (const [name, on] of wanted) {
  // electron-builder's keys are the enum names with a lower-case first letter.
  const fuse = FuseV1Options[name[0].toUpperCase() + name.slice(1)]
  if (fuse === undefined) {
    console.error(`FAIL  ${name}: not a fuse this version of @electron/fuses knows`)
    failures++
    continue
  }

  const state = wire[fuse]
  const expected = on ? ON : OFF
  const pass = state === expected
  if (!pass) failures++

  const wantedText = pass ? '' : `, wanted ${describe(expected)}`
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${describe(state)}${wantedText}`)
}

if (wanted.size === 0) {
  console.error('FAIL  no fuses found in electron-builder.yml to check')
  failures++
}

process.exit(failures === 0 ? 0 : 1)
