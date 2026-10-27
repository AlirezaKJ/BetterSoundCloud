/**
 * The globals a plugin's script can use — exactly what src/main/plugin-sandbox.ts puts in its
 * context, and nothing more. Type-checks the bundled plugins (tsconfig.plugins.json), and shows
 * plugin authors what exists: there is no `require`, no `process`, no `fetch` but `bsc.fetch`.
 *
 * `plugin-sandbox.test.ts` checks that this list and the sandbox's context agree.
 */

declare const module: { exports: unknown }
declare const exports: unknown

declare function setTimeout(callback: () => void, ms?: number): unknown
declare function clearTimeout(handle: unknown): void
/** At least one second apart. */
declare function setInterval(callback: () => void, ms?: number): unknown
declare function clearInterval(handle: unknown): void

declare const console: {
  log(...values: unknown[]): void
  info(...values: unknown[]): void
  debug(...values: unknown[]): void
  warn(...values: unknown[]): void
  error(...values: unknown[]): void
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string>)
  append(name: string, value: string): void
  get(name: string): string | null
  set(name: string, value: string): void
  toString(): string
}

declare class URL {
  constructor(url: string, base?: string)
  href: string
  protocol: string
  username: string
  password: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  readonly origin: string
  readonly searchParams: URLSearchParams
  toString(): string
}
