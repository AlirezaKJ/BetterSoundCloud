/**
 * Castlabs VMP (Verified Media Path) signing.
 *
 * Why this exists: a Castlabs prebuilt carries only a *development* VMP signature, and
 * production Widevine license servers reject development clients. v0.7.1 shipped the
 * Castlabs runtime with no signing step, which is why tracks greyed out and auto-skipped
 * in installed builds while playing fine in a browser (issues #95, #105).
 *
 * Signing has to happen at a different point on each platform, so there are two small
 * wrapper files next to this one:
 *
 *   vmp-after-pack.js  -> macOS, runs BEFORE code signing
 *   vmp-after-sign.js  -> Windows, runs AFTER code signing
 *
 * Linux needs no VMP signature at all.
 *
 * Setup for release builds:
 *   pip install --upgrade castlabs-evs
 *   python -m castlabs_evs.account reauth     (or set EVS_USERNAME / EVS_PASSWORD)
 *
 * To sign a build by hand:
 *   python -m castlabs_evs.vmp sign-pkg <path-to-packaged-app>
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

// In release builds this is set to 'true' so a build that cannot be signed FAILS rather
// than quietly shipping a client that cannot play DRM tracks. Locally it is unset, so
// contributors without an EVS account can still build.
const strict = process.env.STRICT_VMP_SIGNING === 'true'

/** Stop the build in strict mode; otherwise warn loudly and carry on. */
function handleProblem(message) {
  if (strict) {
    console.error(`[vmp] ${message}`)
    console.error('[vmp] STRICT_VMP_SIGNING is on. Aborting build.')
    process.exit(1)
  }
  console.warn(`[vmp] ${message}`)
  console.warn('[vmp] Continuing without VMP signing. This build cannot play DRM tracks.\n')
}

/** Run `python -m castlabs_evs.vmp <command> <appDir>`. Returns its output. */
function runEvs(command, appDir) {
  const result = spawnSync('python', ['-m', 'castlabs_evs.vmp', command, appDir], {
    encoding: 'utf8'
  })

  if (result.error) throw result.error

  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`castlabs_evs.vmp ${command} exited with code ${result.status}`)
  }

  return result.stdout
}

/**
 * Sign the packaged app, then verify the signature.
 *
 * Both wrapper files call this. It is safe to call on any platform — it does nothing on
 * Linux.
 */
export function signPackage(context) {
  if (context.electronPlatformName === 'linux') {
    console.log('[vmp] Linux build. Widevine needs no VMP signature here.')
    return
  }

  if (strict && (!process.env.EVS_USERNAME || !process.env.EVS_PASSWORD)) {
    console.error(
      '[vmp] EVS_USERNAME and EVS_PASSWORD are required when STRICT_VMP_SIGNING=true'
    )
    process.exit(1)
  }

  const appDir = path.resolve(context.appOutDir)

  if (!existsSync(appDir)) {
    handleProblem(`Packaged app not found at ${appDir}`)
    return
  }

  console.log(`[vmp] Signing ${appDir}`)

  try {
    console.log(runEvs('sign-pkg', appDir).trim())
  } catch (error) {
    handleProblem(`Signing failed: ${error.message}`)
    return
  }

  // Verify separately. A zero exit code from the signer is not proof that the resulting
  // package actually validates.
  try {
    console.log(runEvs('verify-pkg', appDir).trim())
    console.log('[vmp] Signature verified.')
  } catch (error) {
    handleProblem(`Verification failed: ${error.message}`)
  }
}
