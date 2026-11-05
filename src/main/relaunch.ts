import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { app } from 'electron'

/**
 * `$1` is the process to outlive, `$2` the file to start, and the rest its arguments. Every value
 * arrives as an argument, never pasted into the script. Exported so its test runs it for real.
 *
 * It first closes every file it inherited but stdin, stdout and stderr. Chromium leaves most of
 * its files without close-on-exec (its own launcher closes them; Node's `spawn` does not), so
 * without this the new copy held the old one's profile locks, sockets and shared memory, and its
 * AppImage mount, which then never went away (measured 2026-10-28). Multi-digit descriptors need
 * bash; under dash the closing is skipped and the rest still works.
 */
export const WAIT_THEN_START = [
  'pid=$1; file=$2; shift 2',
  'for fd in /proc/$$/fd/*; do n=${fd##*/}; [ "$n" -gt 2 ] && eval "exec $n>&-"; done 2>/dev/null',
  'while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done',
  'exec "$file" "$@"'
].join('\n')

/** bash where there is one, which every desktop distribution ships; plain sh otherwise. */
const SHELL = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh'

/**
 * Start a fresh copy of the app once this one has exited. Call it, then quit. Every restart goes
 * through here: the page status's Restart button and the updater's "Restart now".
 *
 * Two things on Linux make `app.relaunch()` alone fail, each measured on 2026-10-28:
 *
 *  - Electron sets CHROME_DESKTOP in this process as it starts, the new copy inherits it, and the
 *    Castlabs build dies at startup whenever it is set (CLAUDE.md §1, castlabs#165).
 *  - In an AppImage, `app.relaunch()` leaves a helper running from this copy's own binary, which
 *    lives on the AppImage's FUSE mount. The mount goes away the moment this copy exits, the
 *    helper dies with it, and nothing comes back. So a system shell, which lives outside the
 *    mount, waits for this process to exit and then starts the AppImage file itself.
 *
 * `appImage` is the file to start, when it is not the one running: the updater passes the new
 * version's file, which electron-updater renames when its name carries the version.
 *
 * The new copy gets this one's arguments, as `app.relaunch()` gives them: one started with
 * `--safe-mode` comes back in safe mode. (Without them, a test copy started on a throwaway
 * profile came back on the default one — measured.)
 */
export function relaunchAfterQuit(appImage = process.env['APPIMAGE']): void {
  delete process.env['CHROME_DESKTOP']

  if (process.platform === 'linux' && appImage) {
    const waiter = spawn(
      SHELL,
      [
        '-c',
        WAIT_THEN_START,
        'relaunch',
        String(process.pid),
        appImage,
        ...process.argv.slice(1)
      ],
      { detached: true, stdio: 'ignore', env: process.env }
    )
    waiter.unref()
    return
  }

  app.relaunch()
}
