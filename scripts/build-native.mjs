// Build the native addons into resources/native/ (Windows only).
//
// - window-glass draws the Glass setting's live blur under our window (native/window-glass).
// - media-controls is the playback and volume shortcuts' helper: it presses the system media
//   controls' buttons for our own media session, and sets our volume in the system mixer
//   (native/media-controls, used by src/main/playback.ts).
//
// Each is optional at runtime: without it, its feature says so and does nothing, so a machine
// without the Visual Studio C++ build tools can still build and run the app. `--required` (release
// and CI) makes any failure fatal.
//
// Node-API only, so one build loads in any Electron; still compiled against Electron's headers so
// node-gyp links the delay-load hook that resolves Node-API from electron.exe.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const required = process.argv.includes('--required')

const ADDONS = [
  { name: 'window-glass', built: 'window_glass.node', feature: 'the Glass setting' },
  {
    name: 'media-controls',
    built: 'media_controls.node',
    feature: 'the playback and volume keys'
  }
]

if (process.platform !== 'win32') {
  console.log('[native] the native addons are Windows only; nothing to build here')
  process.exit(0)
}

const require = createRequire(import.meta.url)
const electronVersion = JSON.parse(
  readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')
).version.replace(/\+.*$/, '') // Castlabs tags its builds `43.2.0+wvcus`; the headers are upstream's
const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')
mkdirSync(join(root, 'resources/native'), { recursive: true })

let failed = false
for (const addon of ADDONS) {
  if (!build(addon)) failed = true
}
process.exit(failed && required ? 1 : 0)

/** Build one addon and copy it into resources/native/. Answers whether it is there to ship. */
function build({ name, built, feature }) {
  const source = join(root, 'native', name)
  const result = spawnSync(
    process.execPath,
    [
      nodeGyp,
      'rebuild',
      `--target=${electronVersion}`,
      '--arch=x64',
      '--dist-url=https://electronjs.org/headers',
      '--release'
    ],
    { cwd: source, stdio: 'inherit' }
  )

  if (result.status !== 0) {
    const message = `[native] ${name} did not build; ${feature} will have no effect in this build`
    if (required) console.error(message)
    else console.warn(message)
    return false
  }

  const output = join(source, 'build/Release', built)
  const shipped = join(root, 'resources/native', `${name}.node`)
  // A running dev app has the shipped copy loaded, and Windows will not let a loaded module be
  // overwritten. Unchanged, there is nothing to copy; changed, say what is holding it.
  if (existsSync(shipped) && readFileSync(shipped).equals(readFileSync(output))) {
    console.log(`[native] resources/native/${name}.node is up to date`)
    return true
  }
  try {
    copyFileSync(output, shipped)
    console.log(`[native] resources/native/${name}.node`)
    return true
  } catch (error) {
    const message = `[native] could not replace resources/native/${name}.node (${error.code}): close any running BetterSoundCloud started from this folder`
    if (required) {
      console.error(message)
      return false
    }
    // Not a release: the copy already there is used, just not the one built now.
    console.warn(message + '; packing the existing copy')
    return existsSync(shipped)
  }
}
