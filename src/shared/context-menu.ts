/**
 * What main and the right-click menu agree on.
 *
 * The menu is a Svelte page in its own transparent view (see src/main/context-menu.ts). Main
 * sends it a `ContextMenuRequest` describing the click; the page sends back one of the verbs
 * in `CONTEXT_MENU_ACTIONS`. Only verbs cross back — the link, the selection and the click
 * position are re-read by main from the request it sent, so the page can never ask main to
 * copy or open something it was not shown.
 */

/** Everything the menu needs to know about one right-click, distilled from Electron's params. */
export type ContextMenuRequest = {
  /**
   * Where the click landed, in the content view's own pixels. The menu view covers exactly
   * the same rectangle, so these are its page coordinates too.
   */
  x: number
  y: number
  selectionText: string
  /** The href under the cursor, or '' when there is none. */
  linkURL: string
  /** The image under the cursor, or '' when the cursor is not on one. */
  imageURL: string
  isEditable: boolean
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  /** The misspelled word under the cursor in a text field, or '' — with Chromium's suggestions. */
  misspelledWord: string
  suggestions: string[]
  pageURL: string
  canGoBack: boolean
  canGoForward: boolean
  /** Dev builds only: offer "Inspect element". */
  canInspect: boolean
}

/**
 * The verbs the menu can send back. Each one is a `case` in `runContextMenuAction`, and the
 * compiler refuses a list entry without a case, so the two cannot drift.
 */
export const CONTEXT_MENU_ACTIONS = [
  'cut',
  'copy',
  'paste',
  'select-all',
  'search-selection',
  'replace-misspelling',
  'add-to-dictionary',
  'open-link-in-browser',
  'copy-link',
  'copy-clean-link',
  'copy-image-address',
  'back',
  'forward',
  'reload',
  'copy-page-link',
  'copy-clean-page-link',
  'settings',
  'sign-out',
  'inspect'
] as const

export type ContextMenuAction = (typeof CONTEXT_MENU_ACTIONS)[number]

export function isContextMenuAction(value: unknown): value is ContextMenuAction {
  return (
    typeof value === 'string' && (CONTEXT_MENU_ACTIONS as readonly string[]).includes(value)
  )
}

/** What "Go to URL" did with the text: loaded it here, handed it to the browser, or refused. */
export type GoToUrlResult = 'internal' | 'external' | 'invalid'

/** Query parameters that only exist to record who shared a link. Stripped from any site. */
const TRACKING_PARAMS = ['si', 'fbclid', 'gclid']

/**
 * SoundCloud's older share links add these three as well (`?ref=clipboard&p=i&c=1`). They are
 * only stripped on SoundCloud's own links — on another site `p` or `c` could mean anything.
 */
const SOUNDCLOUD_TRACKING_PARAMS = ['ref', 'p', 'c']

/**
 * A link without its tracking parameters. Issue #49 asked for this: SoundCloud's share
 * button produces `…?si=…&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing`,
 * and nobody wants to paste that. Anything that is not a URL comes back unchanged.
 */
export function cleanUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  const onSoundCloud =
    url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com')

  for (const key of [...url.searchParams.keys()]) {
    const tracking =
      key.startsWith('utm_') ||
      TRACKING_PARAMS.includes(key) ||
      (onSoundCloud && SOUNDCLOUD_TRACKING_PARAMS.includes(key))
    if (tracking) url.searchParams.delete(key)
  }

  return url.toString()
}

/**
 * A link as a person would say it: host and path, no scheme, no `www.`, no query.
 * Shown at the top of the menu so "Copy link" says which link.
 */
export function shortUrl(raw: string): string {
  try {
    const url = new URL(raw)
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '')
  } catch {
    return raw
  }
}

/** Collapse whitespace and cut to `max` characters, with an ellipsis when something was cut. */
export function elide(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1).trimEnd() + '…'
}
