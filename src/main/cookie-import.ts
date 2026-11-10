import { readFile } from 'node:fs/promises'
import type { Session } from 'electron'

type ExportedCookie = {
  domain?: unknown
  name?: unknown
  value?: unknown
  path?: unknown
  secure?: unknown
  httpOnly?: unknown
  expirationDate?: unknown
}

/** Import only SoundCloud cookies from a user supplied Cookie-Editor JSON export. */
export async function importSoundCloudCookies(sess: Session, file: string): Promise<number> {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('Cookie export must be a JSON array')

  let imported = 0
  for (const entry of parsed as ExportedCookie[]) {
    if (!entry || typeof entry !== 'object') continue
    const { domain, name, value } = entry
    if (typeof domain !== 'string' || typeof name !== 'string' || typeof value !== 'string')
      continue
    const host = domain.replace(/^\./, '').toLowerCase()
    if (host !== 'soundcloud.com' && !host.endsWith('.soundcloud.com')) continue
    if (!/^[a-z0-9.-]+$/.test(host) || !name) continue

    await sess.cookies.set({
      url: `https://${host}${typeof entry.path === 'string' && entry.path.startsWith('/') ? entry.path : '/'}`,
      name,
      value,
      domain,
      path: typeof entry.path === 'string' && entry.path.startsWith('/') ? entry.path : '/',
      secure: entry.secure === true,
      httpOnly: entry.httpOnly === true,
      ...(typeof entry.expirationDate === 'number' && entry.expirationDate > Date.now() / 1000
        ? { expirationDate: entry.expirationDate }
        : {})
    })
    imported++
  }
  return imported
}
