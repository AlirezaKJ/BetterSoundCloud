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
 * Every refusal also says who sent it — SoundCloud's own servers or DataDome's bot check —
 * because a blocked like or sign-in has a different fix in each case. DataDome's lines are
 * tagged `[datadome]` so they can be found at a glance. See `whoAnswered`.
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

/**
 * Who sent a response, read from its headers alone.
 *
 * This is what tells a blocked like or sign-in apart: DataDome's bot check refusing us is a
 * reputation problem we cannot fix in code, while SoundCloud's own API refusing us is an
 * account, permission or request problem that we might. The status code is the same 403
 * either way, so it cannot answer the question on its own.
 *
 * Measured on 2026-10-27, logged out, over a full page load:
 *   - SoundCloud's own servers (soundcloud.com, api-v2, api-auth, secure) answer with
 *     `server: am/2` and carry no DataDome headers — on success and on refusal alike. A
 *     plain request to api-v2 without credentials gets a 401 from am/2.
 *   - DataDome's own server answers with `server: DataDome`; its collector, served under
 *     dwt.soundcloud.com, does exactly that.
 *   - The `datadome` cookie is set on .soundcloud.com by its script, not by a response.
 * So any `x-datadome…` / `x-dd-…` header, a `datadome` cookie being set, or a DataDome
 * server header on a refusal means DataDome made the decision.
 *
 * Headers only, deliberately. Reading response bodies would need the debugger attached to
 * SoundCloud's page, and that is the kind of difference a bot check can notice — this tool
 * must not disturb the thing it is measuring.
 */
export type Sender = {
  by: 'datadome' | 'soundcloud' | 'cloudfront' | 'unknown'
  /** The header that decided it, for the log line. */
  evidence: string
}

const SENDER_LABEL: Record<Sender['by'], string> = {
  datadome: 'from DataDome',
  soundcloud: 'from SoundCloud',
  cloudfront: 'from CloudFront, their CDN',
  unknown: 'sender unknown'
}

export function whoAnswered(headers: Record<string, string[]> = {}): Sender {
  const entries = Object.entries(headers).map(
    ([name, values]) => [name.toLowerCase(), values.join(', ')] as const
  )

  // DataDome's markers win over everything else. Its decision can travel back through
  // SoundCloud's own servers, so an am/2 server header does not rule it out.
  for (const [name, value] of entries) {
    if (name.startsWith('x-datadome') || name.startsWith('x-dd-')) {
      return { by: 'datadome', evidence: `${name}: ${value}` }
    }
    if (name === 'set-cookie' && /(^|[\s,])datadome=/i.test(value)) {
      return { by: 'datadome', evidence: 'sets the datadome cookie' }
    }
  }

  const server = entries.find(([name]) => name === 'server')?.[1] ?? ''
  if (/datadome/i.test(server)) return { by: 'datadome', evidence: `server ${server}` }
  if (/^am\//i.test(server)) return { by: 'soundcloud', evidence: `server ${server}` }
  if (/cloudfront/i.test(server)) return { by: 'cloudfront', evidence: `server ${server}` }
  return { by: 'unknown', evidence: server ? `server ${server}` : 'no server header' }
}

/** DataDome's captcha and device-check pages are served from captcha-delivery.com. */
export function isDataDomeChallenge(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'captcha-delivery.com' || hostname.endsWith('.captcha-delivery.com')
  } catch {
    return false
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
    // A DataDome challenge page loads with a 200, so it is caught before the status check.
    if (isDataDomeChallenge(details.url)) {
      console.warn(`[datadome] challenge shown ${shorten(details.url)}`)
      return
    }
    if (details.statusCode < 400) return

    const { statusCode, method } = details
    const sender = whoAnswered(details.responseHeaders)
    if (sender.by === 'datadome') {
      console.warn(
        `[datadome] blocked ${statusCode} ${method} ${shorten(details.url)} (${sender.evidence})`
      )
      return
    }
    console.warn(
      `[net] ${statusCode} ${method} ${classify(details.url).padEnd(7)} ${shorten(details.url)} ` +
        `(${SENDER_LABEL[sender.by]}: ${sender.evidence})`
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
