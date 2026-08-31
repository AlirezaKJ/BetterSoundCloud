#!/usr/bin/env node
/**
 * Castlabs VMP (Verified Media Path) signing.
 *
 * Why this file exists at all: a Castlabs prebuilt carries only a *development*
 * VMP signature, and production Widevine license proxies reject development
 * clients. v0.7.1 shipped the Castlabs runtime with no signing step, which is why
 * `navigator.requestMediaKeySystemAccess()` resolved (a local CDM capability probe
 * that never contacts a license server) while users kept getting greyed-out,
 * auto-skipping tracks. See issues #95 and #105.
 *
 * Ordering is platform-specific and Castlabs is explicit about it:
 *   macOS   -> VMP sign BEFORE code signing  => electron-builder `afterPack`
 *   Windows -> VMP sign AFTER  code signing  => electron-builder `afterSign`
 *   Linux   -> Widevine needs no VMP signature at all
 *
 * electron-builder is configured to call this file from BOTH hooks; each
 * invocation no-ops unless it is the right hook for the platform being built.
 *
 * Requires the `castlabs-evs` Python package and an EVS account:
 *   pip install --upgrade castlabs-evs
 *   python -m castlabs_evs.account reauth      (or set EVS_USERNAME / EVS_PASSWORD)
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const STRICT = process.env.STRICT_VMP_SIGNING === 'true'

function fail(message) {
  if (STRICT) {
    console.error(`[vmp] ${message}`)
    console.error('[vmp] STRICT_VMP_SIGNING is enabled. Aborting build.')
    process.exit(1)
  }
  console.warn(`[vmp] ${message}`)
  console.warn('[vmp] Continuing WITHOUT VMP signing. This build will not play DRM tracks.\n')
}

function runEvs(args) {
  const result = spawnSync('python', ['-m', 'castlabs_evs.vmp', ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const err = new Error(`castlabs_evs.vmp ${args[0]} exited with code ${result.status}`)
    err.stdout = result.stdout
    err.stderr = result.stderr
    throw err
  }
  return result.stdout
}

function signPackage(appOutDir) {
  if (STRICT && (!process.env.EVS_USERNAME || !process.env.EVS_PASSWORD)) {
    console.error(
      '[vmp] EVS_USERNAME and EVS_PASSWORD are required when STRICT_VMP_SIGNING=true'
    )
    process.exit(1)
  }

  const packageDir = path.resolve(appOutDir)
  if (!existsSync(packageDir)) {
    fail(`Package directory not found: ${packageDir}`)
    return
  }

  console.log(`[vmp] Signing ${packageDir}`)
  try {
    console.log(runEvs(['sign-pkg', packageDir]).trim())
  } catch (error) {
    if (error.stdout) console.error('[vmp] stdout:', error.stdout)
    if (error.stderr) console.error('[vmp] stderr:', error.stderr)
    fail(`Signing failed: ${error.message}`)
    return
  }

  // Never trust the signer's exit code alone — verify, and fail the release on a bad verdict.
  try {
    console.log(runEvs(['verify-pkg', packageDir]).trim())
    console.log('[vmp] Signature verified.')
  } catch (error) {
    if (error.stdout) console.error('[vmp] stdout:', error.stdout)
    if (error.stderr) console.error('[vmp] stderr:', error.stderr)
    fail(`Verification failed: ${error.message}`)
  }
}

/**
 * electron-builder calls this from both `afterPack` and `afterSign`. The hook we are
 * currently in is inferred from the context: `afterSign` receives a context without
 * `targets`, so we branch on platform instead and let each hook fire exactly once per
 * platform by checking which one is correct for it.
 */
export default function (context) {
  const platform = context.electronPlatformName
  const hook = context.__bscHook

  if (platform === 'linux') {
    console.log('[vmp] Linux build — Widevine requires no VMP signature. Skipping.')
    return
  }

  // `afterPack` sets `arch`/`targets`; `afterSign` does not. That distinction is how we
  // tell the two invocations apart without electron-builder telling us directly.
  const isAfterPack = Object.prototype.hasOwnProperty.call(context, 'targets')
  const wantPack = platform === 'darwin'

  if (hook === undefined && isAfterPack !== wantPack) {
    console.log(
      `[vmp] ${platform}: skipping ${isAfterPack ? 'afterPack' : 'afterSign'} ` +
        `(this platform signs on ${wantPack ? 'afterPack' : 'afterSign'}).`
    )
    return
  }

  signPackage(context.appOutDir)
}

// Manual invocation: node scripts/sign-vmp.js <path-to-packaged-app>
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const dir = process.argv[2]
  if (dir) signPackage(dir)
}
