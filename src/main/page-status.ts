import { join } from 'node:path'
import { app, net, WebContentsView } from 'electron'
import { CH } from '@shared/ipc'
import { describeLoadFailure, hidesPage, retryDelay } from '@shared/page-status'
import type { PageStatus, PageStatusAction } from '@shared/page-status'
import { hardenSession, isInternalUrl, routeNewWindowsToBrowser } from './session'
import { isDev } from './env'
import { closeShowcase, enableDevToolsShortcut, rendererUrl, START_URL } from './window'
import type { Shell } from './window'
import { themeChromeView } from './chrome-theme'

/**
 * The page-status surface: a view of our own over the content area that says what is going
 * on while SoundCloud's page cannot be shown — starting up, a failed load, a crash, a hang.
 *
 * v0.7.x had nothing here. Its only `did-fail-load` handling was none at all, so a failed load
 * was a blank window (#50); v2 until now logged the failure to a console no user ever sees.
 *
 * WHY A VIEW OF OUR OWN, rather than an error page loaded into SoundCloud's view. A page in
 * that view gets the content preload, which by rule exposes nothing (CLAUDE.md §7), so its
 * Retry button could not reach main; it would also get our SoundCloud stylesheet injected on
 * load, SoundCloud's zoom, and an entry in Back/Forward. A separate view has none of that, and
 * it is how every other piece of our UI is drawn.
 *
 * WHAT TAKES IT AWAY. Main does, from the content view's own events: a page arriving
 * (`did-navigate`) or recovering (`responsive`). Nothing inside the status page has to run for
 * it to go away. That is the difference from v0.7.x's `#loadingscreen`, an overlay inside the
 * page dismissed by the last line of an unguarded block — when an earlier line threw, it
 * stayed up for good (#109, #55).
 *
 * The view exists only while it has something to say, like the settings panel: created on
 * demand, destroyed when cleared. `layout()` in window.ts positions it, and while it covers the
 * page it also brings our own 32px bar back, since the window buttons that normally sit over
 * SoundCloud's header have no header to sit over.
 */

/**
 * How long SoundCloud's first page may take before we say anything. Under a second, a launch
 * shows nothing extra at all — which is every launch with Widevine already installed, since
 * that resolves about 100ms after startup (measured 2026-10-27).
 */
const SLOW_START_MS = 1_000

/** A failed load waiting to be retried. `tries` is how far along the retry schedule it is. */
type Retry = { url: string; tries: number; timer: ReturnType<typeof setTimeout> | null }

const retries = new WeakMap<Shell, Retry>()

/**
 * Windows whose page renderer we killed on purpose, to recover from a hang. Its exit then
 * arrives as `render-process-gone`, and must not be reported as a crash.
 */
const killedOnPurpose = new WeakSet<Shell>()

/** Show `status`, creating the view if this is the first thing it has had to say. */
export function showPageStatus(shell: Shell, status: PageStatus): void {
  if (shell.window.isDestroyed()) return
  if (status.kind !== 'load-failed') cancelRetry(shell)
  if (isDev) console.log(`[page-status] ${summarise(status)}`)

  shell.pageStatus = status
  // The showcase covers everything; a status saying SoundCloud's page is gone must be seen, and
  // a crash or failed load has stopped the music anyway.
  if (hidesPage(status)) closeShowcase(shell)
  if (shell.status) sendStatus(shell)
  else createStatusView(shell)
  shell.layout()
}

/** Take the status away and give the window back to SoundCloud's page. */
export function clearPageStatus(shell: Shell): void {
  cancelRetry(shell)
  if (!shell.pageStatus && !shell.status) return
  if (isDev) console.log('[page-status] cleared')

  shell.pageStatus = null
  const view = shell.status
  if (!view) return
  shell.status = null

  const hadFocus = !view.webContents.isDestroyed() && view.webContents.isFocused()
  shell.window.contentView.removeChildView(view)
  view.webContents.close()
  shell.layout()
  // Keyboard focus was in the view we just removed. Hand it to the page, so the user's next
  // key press lands somewhere rather than nowhere.
  if (hadFocus && !shell.settings && shell.window.isFocused()) shell.content.webContents.focus()
}

/**
 * Watch the content view for the moments that need a status. Called once per window.
 */
export function attachPageStatus(shell: Shell): void {
  const { webContents } = shell.content

  webContents.on('did-fail-load', (_event, code, error, url, isMainFrame) => {
    // -3 is ERR_ABORTED: one navigation replaced by another, which is normal.
    if (!isMainFrame || code === -3) return
    console.error(`[content] load failed ${code} ${error} — ${url}`)

    const previous = retries.get(shell)
    if (previous?.timer) clearTimeout(previous.timer)
    const retry: Retry = { url, tries: previous ? previous.tries + 1 : 0, timer: null }
    retries.set(shell, retry)

    showPageStatus(shell, { kind: 'load-failed', code, error, retrying: false })
    if (describeLoadFailure(code).autoRetry) scheduleRetry(shell, retry)
  })

  // A page arrived, so whatever was wrong no longer is. `did-navigate` fires only for a page
  // that committed — Electron reports an error page through `did-fail-load` instead.
  webContents.on('did-navigate', () => {
    retries.delete(shell)
    clearPageStatus(shell)
  })

  webContents.on('render-process-gone', (_event, details) => {
    if (killedOnPurpose.delete(shell)) return
    // A clean exit is the window closing, not the page failing.
    if (details.reason === 'clean-exit' || shell.window.isDestroyed()) return
    showPageStatus(shell, { kind: 'crashed', reason: details.reason })
  })

  webContents.on('unresponsive', () => {
    // Only over a page the user can see. If a status already covers it, "not responding"
    // would add nothing and hide something more specific.
    if (shell.pageStatus) return
    showPageStatus(shell, { kind: 'unresponsive' })
  })

  webContents.on('responsive', () => {
    if (shell.pageStatus?.kind === 'unresponsive') clearPageStatus(shell)
  })
}

/**
 * Say something if SoundCloud's first page has not arrived within a second.
 *
 * `current` answers what is holding it up at that moment — Widevine still installing, or the
 * page itself — which only index.ts knows.
 */
export function noticeSlowStart(shell: Shell, current: () => PageStatus): void {
  let arrived = false
  shell.content.webContents.once('did-navigate', () => (arrived = true))
  setTimeout(() => {
    if (arrived || shell.pageStatus || shell.window.isDestroyed()) return
    showPageStatus(shell, current())
  }, SLOW_START_MS)
}

/**
 * A button on the status view. Checked against the status actually showing, so a press that
 * arrives late — the view is a separate process — cannot do something the screen no longer
 * offers.
 */
export function runPageStatusAction(shell: Shell, action: PageStatusAction): void {
  const status = shell.pageStatus
  if (!status) return

  switch (action) {
    case 'retry':
      if (status.kind === 'load-failed' && !status.retrying) retryNow(shell)
      return

    case 'reload':
      if (status.kind === 'unresponsive') {
        // A hung renderer cannot reload itself. Electron's documented recovery: end the
        // process, then reload, which starts a fresh one.
        killedOnPurpose.add(shell)
        shell.content.webContents.forcefullyCrashRenderer()
      } else if (status.kind !== 'crashed') {
        return
      }
      // Say "loading" at once, so the button visibly did something; the page arriving or
      // failing replaces it.
      showPageStatus(shell, { kind: 'loading' })
      shell.content.webContents.reload()
      return

    case 'wait':
      if (status.kind === 'unresponsive') clearPageStatus(shell)
      return

    case 'restart':
      // Widevine's install cannot be retried in-process: after one failure, every later
      // `components.whenReady()` returns that same rejection, even once the network is back
      // (measured 2026-10-27). A fresh launch is the retry.
      if (status.kind === 'setup-failed' || status.kind === 'setting-up') {
        app.relaunch()
        app.quit()
      }
      return

    case 'quit':
      if (status.kind === 'setup-failed') app.quit()
      return
  }
}

function retryNow(shell: Shell): void {
  const retry = retries.get(shell)
  const status = shell.pageStatus
  if (!retry || status?.kind !== 'load-failed') return

  // A press of Try again overtakes the scheduled retry rather than racing it.
  cancelRetry(shell)
  showPageStatus(shell, { ...status, retrying: true })
  // A failed main-frame load can only have been on SoundCloud — anything else is sent to the
  // browser before it loads — but the URL came from Chromium, so check it rather than trust it.
  const url = isInternalUrl(retry.url) ? retry.url : START_URL
  // The promise rejects when the load fails, which `did-fail-load` above already handles.
  shell.content.webContents.loadURL(url).catch(() => undefined)
}

function scheduleRetry(shell: Shell, retry: Retry): void {
  retry.timer = setTimeout(() => {
    retry.timer = null
    if (shell.window.isDestroyed() || retries.get(shell) !== retry) return
    if (!net.isOnline()) {
      // Asking again while offline cannot work. Move along the schedule and wait; the status
      // view also asks for a retry the moment the network comes back.
      retry.tries += 1
      scheduleRetry(shell, retry)
      return
    }
    retryNow(shell)
  }, retryDelay(retry.tries))
}

function cancelRetry(shell: Shell): void {
  const retry = retries.get(shell)
  if (retry?.timer) {
    clearTimeout(retry.timer)
    retry.timer = null
  }
}

function createStatusView(shell: Shell): void {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/chrome.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  })

  hardenSession(view.webContents.session, shell.identity)
  routeNewWindowsToBrowser(view.webContents)
  // Transparent, because a hang is asked about in a dialog over the page, which shows through
  // the scrim. Every other status paints its own opaque surface.
  view.setBackgroundColor('#00000000')

  shell.status = view
  shell.window.contentView.addChildView(view)
  themeChromeView(view, 'status')
  // A panel the user opened stays above what we put up underneath it. Re-adding a child view
  // moves it to the top.
  if (shell.settings) shell.window.contentView.addChildView(shell.settings)
  if (isDev) enableDevToolsShortcut(view)

  view.webContents.once('did-finish-load', () => {
    if (shell.status !== view) return
    // Anything that changed while the page was loading arrives here in one message.
    sendStatus(shell)
    // So Enter and Tab reach the buttons without a click first — but only within a window
    // the user is already in. Focusing a view raises its window, and a status appearing must
    // never pull the user out of another app.
    if (!shell.settings && shell.window.isFocused()) view.webContents.focus()
  })
  void view.webContents.loadURL(rendererUrl('status'))
}

function sendStatus(shell: Shell): void {
  const view = shell.status
  if (view && shell.pageStatus && !view.webContents.isDestroyed()) {
    view.webContents.send(CH.pageStatusChanged, shell.pageStatus)
  }
}

/** One line for the dev log. */
function summarise(status: PageStatus): string {
  switch (status.kind) {
    case 'setting-up':
      return status.slow ? 'setting up Widevine (slow)' : 'setting up Widevine'
    case 'loading':
      return 'loading SoundCloud'
    case 'setup-failed':
      return `Widevine failed: ${status.detail}`
    case 'load-failed':
      return `load failed ${status.code} ${status.error}${status.retrying ? ' (retrying)' : ''}`
    case 'crashed':
      return `page renderer gone: ${status.reason}`
    case 'unresponsive':
      return 'page not responding'
  }
}
