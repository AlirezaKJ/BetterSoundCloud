import { join } from 'node:path'
import { clipboard, WebContentsView } from 'electron'
import type { ContextMenuParams } from 'electron'
import { CH } from '@shared/ipc'
import { cleanUrl } from '@shared/context-menu'
import type { ContextMenuAction, ContextMenuRequest, GoToUrlResult } from '@shared/context-menu'
import { hardenSession, routeNewWindowsToBrowser, openInBrowser } from './session'
import { isDev } from './env'
import { resolveGoToUrl } from './go-to-url'
import { enableDevToolsShortcut, rendererUrl, toggleSettings } from './window'
import type { Shell } from './window'

/**
 * The right-click menu over SoundCloud's page.
 *
 * HOW IT WORKS. Chromium tells main about every right-click on the content view through the
 * `context-menu` event, with what was under the cursor already worked out: the selection,
 * the link, the image, whether it is a text field. Nothing inside SoundCloud's page takes
 * part — the content preload has no code for this at all, and `content.test.ts` pins that.
 * v0.7.x needed `plugins/ctxMenu.js` injected into the page just to learn when to dismiss.
 *
 * Main then shows a transparent WebContentsView covering the whole content area, and the
 * Svelte page inside it (src/renderer/context-menu) draws the menu at the click. Covering
 * the whole area rather than only the menu is what makes dismissal behave like a native
 * menu: a click anywhere outside the menu closes it and goes no further, so nobody dismisses
 * a menu and follows a link or presses Like with the same click. It also stops the wheel
 * scrolling the page out from under an open menu. The one native habit it does not
 * reproduce is "right-click somewhere else while a menu is open moves it there" — that takes
 * two right-clicks here.
 *
 * WHY NOT `Menu.popup`. A native menu would be free, but it cannot be themed at all, and the
 * point of this feature since v0.1.1 is a menu that looks like part of the app. The native
 * route remains the fallback if the overlay ever proves unreliable on some platform.
 *
 * The view is created once and hidden between uses — unlike the settings panel, which is
 * destroyed on close — because a menu that takes 200ms to appear reads as a broken
 * right-click, and this one is used constantly.
 *
 * The renderer sends back VERBS only. Everything acted on — the link, the selection, the
 * click position — is re-read from the request main itself sent, so the overlay cannot make
 * main copy or open anything it was never shown. "Go to URL" is the exception: it carries
 * typed text, which go-to-url.ts validates before anything is loaded.
 */

const SEARCH_URL = 'https://soundcloud.com/search?q='
/** Where v0.7.x's Sign out item went. Still a live route: it answers 401 when signed out. */
const SIGN_OUT_URL = 'https://soundcloud.com/logout'
/** Spelling suggestions offered, matching Chrome's own three. */
const MAX_SUGGESTIONS = 3

export function attachContextMenu(shell: Shell): void {
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

  hardenSession(view.webContents.session, shell.userAgent)
  routeNewWindowsToBrowser(view.webContents)
  // Transparent: only the menu itself paints. The rest of the view is the click-catcher.
  view.setBackgroundColor('#00000000')
  view.setVisible(false)

  shell.contextMenu = view
  shell.window.contentView.addChildView(view)
  // `layout()` owns where every view sits; it positions this one now that it exists.
  shell.layout()

  if (isDev) enableDevToolsShortcut(view)
  void view.webContents.loadURL(rendererUrl('context-menu'))

  shell.content.webContents.on('context-menu', (_event, params) =>
    showContextMenu(shell, params)
  )

  // Anything that moves the page out from under the menu closes it, as it would a native
  // one. A click on our own bar, the embedded buttons or another window arrives as `blur`.
  view.webContents.on('blur', () => hideContextMenu(shell))
  shell.window.on('resize', () => hideContextMenu(shell))
  shell.content.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame) hideContextMenu(shell)
  })
}

function showContextMenu(shell: Shell, params: ContextMenuParams): void {
  const view = shell.contextMenu
  // The page is a few kilobytes and loads long before SoundCloud does, so this only guards
  // the first second of a launch. A right-click then simply does nothing, and the next works.
  if (!view || view.webContents.isLoading()) return

  const { webContents } = shell.content
  const request: ContextMenuRequest = {
    x: params.x,
    y: params.y,
    selectionText: params.selectionText.trim(),
    linkURL: params.linkURL,
    imageURL: params.mediaType === 'image' ? params.srcURL : '',
    isEditable: params.isEditable,
    canCut: params.editFlags.canCut,
    canCopy: params.editFlags.canCopy,
    canPaste: params.editFlags.canPaste,
    misspelledWord: params.misspelledWord,
    suggestions: params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS),
    pageURL: webContents.getURL(),
    canGoBack: webContents.navigationHistory.canGoBack(),
    canGoForward: webContents.navigationHistory.canGoForward(),
    canInspect: isDev
  }
  shell.contextMenuRequest = request

  view.webContents.send(CH.contextMenuShow, request)
  // Re-adding a child that is already present moves it to the top. The embedded and player
  // overlays are created on demand, so any made since the menu was would otherwise sit above it.
  shell.window.contentView.addChildView(view)
  view.setVisible(true)
  // Keyboard focus moves to the menu, so the arrow keys and Escape work straight away.
  view.webContents.focus()

  if (isDev) console.log(`[context-menu] ${describe(request)} at ${params.x},${params.y}`)
}

/**
 * Hide the menu and hand focus back to the page. Safe to call when it is already hidden —
 * several events can report the same dismissal.
 */
export function hideContextMenu(shell: Shell): void {
  const view = shell.contextMenu
  if (!view || !shell.contextMenuRequest) return
  shell.contextMenuRequest = null
  view.setVisible(false)
  // Back to the page, so typing resumes where it was and the keyboard is never left in a
  // hidden view. This also fires the menu's `blur`, which finds nothing left to do.
  shell.content.webContents.focus()
}

/** Carry out a menu item. `text` only means something for `replace-misspelling`. */
export function runContextMenuAction(
  shell: Shell,
  action: ContextMenuAction,
  text: string
): void {
  const request = shell.contextMenuRequest
  if (!request) return
  // Hidden first: the menu should be gone the instant it is chosen, and focus has to be back
  // on the page before an edit command runs against it.
  hideContextMenu(shell)

  const { webContents } = shell.content
  switch (action) {
    case 'cut':
      webContents.cut()
      break
    case 'copy':
      webContents.copy()
      break
    case 'paste':
      webContents.paste()
      break
    case 'select-all':
      webContents.selectAll()
      break
    case 'search-selection':
      if (request.selectionText) {
        void webContents.loadURL(SEARCH_URL + encodeURIComponent(request.selectionText))
      }
      break
    case 'replace-misspelling':
      // Only a word Chromium itself suggested, never free text from the overlay.
      if (request.suggestions.includes(text)) webContents.replaceMisspelling(text)
      break
    case 'add-to-dictionary':
      if (request.misspelledWord) {
        webContents.session.addWordToSpellCheckerDictionary(request.misspelledWord)
      }
      break
    case 'open-link-in-browser':
      openInBrowser(request.linkURL)
      break
    case 'copy-link':
      copyText(request.linkURL)
      break
    case 'copy-clean-link':
      copyText(cleanUrl(request.linkURL))
      break
    case 'copy-image-address':
      copyText(request.imageURL)
      break
    case 'back':
      webContents.navigationHistory.goBack()
      break
    case 'forward':
      webContents.navigationHistory.goForward()
      break
    case 'reload':
      webContents.reload()
      break
    case 'copy-page-link':
      copyText(request.pageURL)
      break
    case 'copy-clean-page-link':
      copyText(cleanUrl(request.pageURL))
      break
    case 'settings':
      toggleSettings(shell)
      break
    case 'sign-out':
      void webContents.loadURL(SIGN_OUT_URL)
      break
    case 'inspect':
      if (isDev) webContents.inspectElement(request.x, request.y)
      break
    default: {
      // A compile error, not a silent no-op, if an action is added to the list without a case.
      const unhandled: never = action
      console.error('[context-menu] no handler for', unhandled)
    }
  }
}

/**
 * The "Go to URL" prompt. Returns what happened so the prompt can either close or explain.
 * On success the menu is hidden here, before navigating, so the prompt is not left over
 * the new page.
 */
export function goToUrlFromMenu(shell: Shell, text: string): GoToUrlResult {
  const { kind, url } = resolveGoToUrl(text)
  if (kind === 'invalid') return kind

  hideContextMenu(shell)
  if (kind === 'internal') void shell.content.webContents.loadURL(url)
  else openInBrowser(url)
  return kind
}

function copyText(text: string): void {
  if (text) clipboard.writeText(text)
}

/** One word for the dev log, so a wrong menu is diagnosable from the terminal. */
function describe(request: ContextMenuRequest): string {
  if (request.isEditable) return 'text field'
  if (request.linkURL) return 'link'
  if (request.imageURL) return 'image'
  if (request.selectionText) return 'selection'
  return 'page'
}
