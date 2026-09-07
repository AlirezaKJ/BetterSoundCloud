import { isInternalUrl } from './session'
import type { GoToUrlResult } from '@shared/context-menu'

/**
 * Turn what somebody typed into the "Go to URL" box into somewhere to go.
 *
 * Forgiving on purpose: `soundcloud.com/x` and `sleeptoken/sets/x` both work without a
 * scheme, because the box exists for pasting and there is no address bar to correct it in.
 * Strict where it matters: only http and https are ever loaded, and anything off SoundCloud
 * goes to the system browser, the same rule `routeNewWindowsToBrowser` applies to links.
 */
export function resolveGoToUrl(input: string): { kind: GoToUrlResult; url: string } {
  const text = input.trim()
  // A space cannot appear in a link. Encoding it would silently turn "sleep token" into a
  // request for a page that does not exist.
  if (!text || /\s/.test(text)) return { kind: 'invalid', url: '' }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : addScheme(text)

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { kind: 'invalid', url: '' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid', url: '' }

  return { kind: isInternalUrl(url.href) ? 'internal' : 'external', url: url.href }
}

/** `example.org/x` gets https; `artist/track` is taken as a path on SoundCloud. */
function addScheme(text: string): string {
  const firstSegment = text.split('/')[0] ?? ''
  const looksLikeHost = firstSegment.includes('.')
  return looksLikeHost
    ? `https://${text}`
    : `https://soundcloud.com/${text.replace(/^\/+/, '')}`
}
