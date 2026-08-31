import type { WebContentsView } from 'electron'

/**
 * Dev-only failure classifier for the SoundCloud content view.
 *
 * When a track greys out and skips, the useful question is *which layer failed*, because
 * the fixes are completely different:
 *
 *   stream    — the media manifest or segments failed. Entitlement, geo, or a blocked
 *               request. Nothing to do with DRM.
 *   licence   — the Widevine licence request failed. This is the VMP-signing layer.
 *   api       — api-v2 refused to resolve the track at all.
 *   auth      — sign-in or bot-check interference.
 *
 * v0.7.x had no way to tell these apart, which is why the same symptom got blamed on
 * four different causes across issues #89, #91, #95 and #105.
 *
 * Attached only in dev. It logs; it never modifies a request.
 */

/**
 * First match wins, so the order of these tests is the priority order — most specific
 * first. `/media/` inside an api-v2 URL classifies as `stream`, not `api`, because the
 * stream test comes first.
 */
function classify(url: string): string {
  if (/licen[cs]e|widevine|\/drm\b|cenc/i.test(url)) return 'licence'
  if (/\.m3u8|\/media\/|sndcdn\.com|playlist\.json|\.mp4|\.mp3|hls/i.test(url)) return 'stream'
  if (/api-auth|secure\.soundcloud|sign-in|datadome|captcha|recaptcha/i.test(url)) return 'auth'
  if (/api-v2|api\.soundcloud/i.test(url)) return 'api'
  return 'other'
}

/** URLs are long and query-heavy; keep the log readable. */
function shorten(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin + parsed.pathname
  } catch {
    return url.slice(0, 120)
  }
}

export function attachDiagnostics(view: WebContentsView): void {
  // NOTE: this session is currently shared with the header view — neither view declares a
  // `partition`, so both resolve to `session.defaultSession`. Verified at runtime. So
  // these listeners see our own chrome's requests too (harmless; they are file:// and
  // localhost). If the content view is ever given its own partition, this scopes itself
  // automatically, because it reads the session off the view rather than naming one.
  //
  // Also note Electron allows only ONE listener per webRequest event per session. If
  // anything else registers onCompleted/onErrorOccurred on this session later, it
  // silently replaces these — which is survivable for a dev-only tool, but is why this
  // must not become load-bearing.
  const { webRequest } = view.webContents.session
  const filter = { urls: ['<all_urls>'] }

  webRequest.onCompleted(filter, (details) => {
    if (details.statusCode < 400) return
    console.warn(
      `[net] ${details.statusCode} ${classify(details.url).padEnd(7)} ${shorten(details.url)}`
    )
  })

  webRequest.onErrorOccurred(filter, (details) => {
    // ERR_ABORTED is normal: it fires whenever a navigation or fetch is superseded.
    if (details.error === 'net::ERR_ABORTED') return
    console.warn(
      `[net] ${details.error} ${classify(details.url).padEnd(7)} ${shorten(details.url)}`
    )
  })

  // Errors only. Including warnings here was measured at 48 lines to 1 useful one on a
  // single page load — 28 of them SoundCloud's own Feature-Policy header complaints and
  // the rest Google One Tap deprecation notices. None of it is ours or actionable, and it
  // buried the one line that mattered.
  view.webContents.on('console-message', (details) => {
    if (details.level !== 'error') return
    console.warn(`[page] ${details.message.slice(0, 300)}`)
  })
}
