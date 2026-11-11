/**
 * SoundCloud's newer pages render inside a same-origin iframe of the page: `iframe.webiIframe`,
 * loading `https://soundcloud.com/n/<the same path>` (the signed-in track page, measured
 * 2026-11-10). `webContents.insertCSS` only styles the top frame. The top-frame preload uses
 * this allowlist to apply theme and Glass CSS to those documents through Electron's frame API.
 *
 * Pure, no Electron, no DOM: it is imported by the content preload and by main.
 */
export function isStyledFrameUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'soundcloud.com' &&
      parsed.port === '' &&
      parsed.pathname.startsWith('/n/')
    )
  } catch {
    return false
  }
}
