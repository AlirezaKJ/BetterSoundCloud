import type { ChromeApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Exposed by src/preload/chrome.ts. Present only in our own chrome renderers. */
    readonly bsc: ChromeApi
  }
}

export {}
