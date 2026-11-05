import type { NowPlaying } from './now-playing'

/**
 * The API a plugin is written against: the `bsc` object its `activate` receives.
 *
 * This file is the contract. src/main/plugin-sandbox.ts builds the object to this type, the
 * bundled plugins in resources/plugins type-check against it through JSDoc, and
 * docs/CUSTOM_PLUGINS.md documents it for everyone else. Change one, change all three.
 *
 * A plugin is CommonJS-style:
 *
 *   module.exports = {
 *     async activate(bsc) { … },
 *     async deactivate() { … }   // optional
 *   }
 *
 * It runs in a process of its own, in a context with no `require`, no `process` and no file
 * system — only what is here. Anything that reaches outside that process asks main, which
 * checks it against the permissions the user approved when turning the plugin on.
 */
export type PluginApi = {
  readonly plugin: { readonly id: string; readonly version: string }

  /** Write to the app's log, tagged with the plugin's id. */
  log(...values: unknown[]): void
  warn(...values: unknown[]): void

  /** What SoundCloud is playing. Needs the `nowPlaying` permission. */
  readonly nowPlaying: {
    get(): Promise<NowPlaying | null>
    /**
     * Every change: a new track, play or pause, a seek — and the clock, so once a second
     * while a track plays. Returns a function that stops listening.
     */
    onChange(listener: (nowPlaying: NowPlaying | null) => void): () => void
  }

  /** The plugin's own settings, as declared in its plugin.json. Secret ones are read apart. */
  readonly settings: {
    get(): Record<string, boolean | string>
    onChange(listener: (values: Record<string, boolean | string>) => void): () => void
    /** A `secret` setting's value, '' when the user has not set one. */
    secret(key: string): Promise<string>
  }

  /**
   * The line under the plugin in settings, saying whether it is working — the same pattern as
   * Discord's. `lead` is the state in a few words; `detail` the rest of the sentence; `problem`
   * a separate line for something wrong. Null clears it.
   */
  readonly status: { set(status: PluginStatus | null): void }

  /** Buttons under the status line, e.g. "Connect account". Up to four. */
  readonly actions: {
    set(actions: PluginAction[]): void
    onPress(listener: (actionId: string) => void): () => void
  }

  /** Small JSON values kept between runs, for this plugin only. */
  readonly storage: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }

  /**
   * Strings kept encrypted by the operating system (DPAPI, Keychain, libsecret), for this plugin
   * only. Needs the `secrets` permission. Rejects where the system has no real encryption —
   * a Linux desktop without a keyring — rather than pretending.
   */
  readonly secrets: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }

  /**
   * An https request to a host the plugin listed as `network:<host>`. Anything else rejects
   * before a byte is sent. Goes through the app's own network stack, so system proxies apply.
   */
  fetch(url: string, init?: PluginFetchInit): Promise<PluginResponse>

  /** Open an https page on a host the plugin listed as `browser:<host>`, in the user's browser. */
  openInBrowser(url: string): Promise<void>

  /** Hex digests, for APIs that sign their requests (Last.fm signs with MD5). */
  readonly hash: { md5(text: string): string; sha256(text: string): string }
}

export type PluginFetchInit = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

export type PluginResponse = {
  status: number
  ok: boolean
  text(): Promise<string>
  json(): Promise<unknown>
}

export type PluginStatus = { lead: string; detail?: string; problem?: string }

export type PluginAction = { id: string; label: string; disabled?: boolean }

/** What a plugin's script assigns to `module.exports`. */
export type PluginModule = {
  activate(bsc: PluginApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}
