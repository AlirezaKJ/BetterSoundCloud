import { readFile, stat } from 'node:fs/promises'
import type { Session } from 'electron'
import { NOT_AN_EXPORT, SIGN_IN_COOKIES, readSignInCookies } from '@shared/sign-in-cookies'

/**
 * "Import browser sign-in" (Settings → Advanced): bring a browser's SoundCloud sign-in into the
 * app, from a cookie export the user chose in main's own file dialog. Only the sign-in is taken
 * (src/shared/sign-in-cookies.ts); every other cookie in the file, `datadome` above all, is left
 * behind, and the app's own cookies are not touched.
 *
 * The file is read once and nothing is kept: no path, no copy, no value in a log.
 */

/** A cookie export of one site is a few kilobytes; a megabyte is not one. */
const MAX_FILE_BYTES = 1_000_000

export class ImportProblem extends Error {}

/** Returns how many sign-in cookies were set, and how many others in the file were left alone. */
export async function importSignIn(
  session: Session,
  file: string,
  now = Date.now() / 1000
): Promise<{ imported: number; ignored: number }> {
  if ((await stat(file)).size > MAX_FILE_BYTES) throw new ImportProblem(NOT_AN_EXPORT)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    throw new ImportProblem(NOT_AN_EXPORT)
  }

  const result = readSignInCookies(parsed, now)
  if (!result.ok) throw new ImportProblem(result.error)

  // Out with the app's old sign-in first, every part of it, so one account's token can never sit
  // beside another account's refresh token or session.
  for (const cookie of SIGN_IN_COOKIES) {
    await session.cookies.remove(`https://${cookie.host}/`, cookie.name)
  }
  for (const cookie of result.cookies) await session.cookies.set(cookie)
  return { imported: result.cookies.length, ignored: result.ignored }
}
