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

/**
 * Find a Python that has castlabs_evs installed.
 *
 * Which command works varies by machine: Windows installs usually provide `py`, most
 * Linux and macOS setups provide `python3`, and a virtualenv provides `python`. Set
 * EVS_PYTHON to skip the search and use a specific interpreter (a venv path, say).
 *
 * Returns the command name, or null with an explanation already printed.
 */
function findPython() {
  const candidates = process.env.EVS_PYTHON
    ? [process.env.EVS_PYTHON]
    : ['py', 'python3', 'python']

  let foundPython = null

  for (const command of candidates) {
    // Two probes, because "the command exists" is not the same as "Python works".
    // Windows ships stub python.exe / python3.exe shims that only advertise the
    // Microsoft Store; they run, print a notice, and exit non-zero for every input.
    // Checking that Python itself runs first keeps us from reporting a missing package
    // when what is really missing is Python.
    const isPython = spawnSync(command, ['-c', 'print(1)'], { encoding: 'utf8' })
    if (isPython.error || isPython.status !== 0) continue

    foundPython = command

    const hasEvs = spawnSync(command, ['-c', 'import castlabs_evs'], { encoding: 'utf8' })
    if (hasEvs.status === 0) return command
  }

  if (foundPython) {
    console.error(`[vmp] Found ${foundPython}, but castlabs_evs is not installed. Run:`)
    console.error(`[vmp]   ${foundPython} -m pip install --upgrade castlabs-evs`)
  } else {
    console.error(`[vmp] No Python found (tried: ${candidates.join(', ')}).`)
    console.error('[vmp] Install Python, or set EVS_PYTHON to an interpreter path.')
  }

  return null
}

/** Run `<python> -m castlabs_evs.vmp <command> <appDir>`. Returns its output. */
function runEvs(python, command, appDir) {
  const result = spawnSync(python, ['-m', 'castlabs_evs.vmp', command, appDir], {
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

  // Note there is no credentials precondition here. There are two valid ways to be
  // authenticated with EVS — a stored token from `castlabs_evs.account signup/reauth`
  // (what a developer machine uses) and EVS_USERNAME / EVS_PASSWORD (what CI uses).
  // Requiring the env vars, as soundcloud-rpc's script does, fails the build for anyone
  // signed in the normal way. The rule that actually matters is simpler and is enforced
  // below: in strict mode, signing must succeed.

  const appDir = path.resolve(context.appOutDir)

  if (!existsSync(appDir)) {
    handleProblem(`Packaged app not found at ${appDir}`)
    return
  }

  const python = findPython()
  if (!python) {
    handleProblem('castlabs-evs is not available, so the build cannot be VMP signed.')
    return
  }

  console.log(`[vmp] Signing ${appDir}`)

  try {
    console.log(runEvs(python, 'sign-pkg', appDir).trim())
  } catch (error) {
    handleProblem(`Signing failed: ${error.message}`)
    return
  }

  // Verify separately. A zero exit code from the signer is not proof that the resulting
  // package actually validates.
  try {
    console.log(runEvs(python, 'verify-pkg', appDir).trim())
    console.log('[vmp] Signature verified.')
  } catch (error) {
    handleProblem(`Verification failed: ${error.message}`)
  }
}
