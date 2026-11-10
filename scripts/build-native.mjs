// Build native/window-glass into resources/native/window-glass.node (Windows only).
//
// The addon draws the Glass setting's live blur under our window (see
// native/window-glass/window_glass.cc). It is optional at runtime: without it the Glass setting
// has no effect, so a machine without the Visual Studio C++ build tools can still build and run
// the app. `--required` (release and CI) makes a failure fatal.
//
// Node-API only, so one build loads in any Electron; it is still compiled against Electron's
// headers so node-gyp links the delay-load hook that resolves Node-API from electron.exe.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const required = process.argv.includes('--required')

if (process.platform !== 'win32') {
  console.log('[native] window-glass is Windows only; nothing to build here')
  process.exit(0)
}

const require = createRequire(import.meta.url)
const electronVersion = JSON.parse(
  readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')
).version.replace(/\+.*$/, '') // Castlabs tags its builds `43.2.0+wvcus`; the headers are upstream's
const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')
const source = join(root, 'native/window-glass')

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
  const message =
    '[native] window-glass did not build; the Glass setting will have no effect in this build'
  if (required) {
    console.error(message)
    process.exit(1)
  }
  console.warn(message)
  process.exit(0)
}

const built = join(source, 'build/Release/window_glass.node')
const shipped = join(root, 'resources/native/window-glass.node')
mkdirSync(join(root, 'resources/native'), { recursive: true })
// A running dev app has the shipped copy loaded, and Windows will not let a loaded module be
// overwritten. Unchanged, there is nothing to copy; changed, say what is holding it.
if (existsSync(shipped) && readFileSync(shipped).equals(readFileSync(built))) {
  console.log('[native] resources/native/window-glass.node is up to date')
} else {
  try {
    copyFileSync(built, shipped)
    console.log('[native] resources/native/window-glass.node')
  } catch (error) {
    const message = `[native] could not replace resources/native/window-glass.node (${error.code}): close any running BetterSoundCloud started from this folder`
    if (required) {
      console.error(message)
      process.exit(1)
    }
    // Not a release: the copy already there is used, just not the one built now.
    console.warn(message + '; packing the existing copy')
  }
}
