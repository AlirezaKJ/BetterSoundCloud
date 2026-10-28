/**
 * `npm start`: the built app, through `electron-vite preview`, or plain words when there is none.
 *
 * Why it is more than `electron-vite preview`: until v0.8.0, Linux users could install from source
 * with install_bettersoundcloud.sh, whose launcher updates that copy from GitHub's main branch and
 * then runs `npm start`. The first time it pulls v0.8.0 or later, it runs this, in a copy that was
 * never built (its node_modules may still be v0.7.x's), started from the app menu with no terminal
 * to show an error in. So with no build here, this says what to do instead of failing silently: for
 * that install, through the stand-in start.sh (a notification and the download page); for anyone
 * else, in the terminal. It needs nothing but Node itself, so it runs whatever is installed.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

if (existsSync(join(root, 'out/main/index.js'))) {
  const electronVite = join(root, 'node_modules/electron-vite/bin/electron-vite.js')
  const preview = spawnSync(
    process.execPath,
    [electronVite, 'preview', ...process.argv.slice(2)],
    {
      cwd: root,
      stdio: 'inherit'
    }
  )
  process.exit(preview.status ?? 1)
}

// The menu entry install_bettersoundcloud.sh wrote runs a start.sh; nothing else we ship does.
const menuEntry = join(homedir(), '.local/share/applications/BetterSoundCloud.desktop')
const oldInstall =
  existsSync(menuEntry) && /^Exec=.*start\.sh/m.test(readFileSync(menuEntry, 'utf8'))

if (oldInstall) {
  spawnSync('bash', [join(root, 'start.sh')], { stdio: 'inherit' })
  process.exit(0)
}

console.error('There is no built app here yet. To run BetterSoundCloud from its source:')
console.error('  npm run dev                 with live reload, for working on it')
console.error('  npm run build && npm start  the built app')
process.exit(1)
