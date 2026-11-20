import { signPackage } from './vmp-sign.js'

/**
 * electron-builder `afterSign` hook — Windows only.
 *
 * On Windows the VMP signature must be applied AFTER code signing. macOS is the other way
 * round; see vmp-after-pack.js.
 *
 * soundcloud-rpc registers one hook for both platforms, which is wrong on macOS: the
 * build packages and notarizes fine and then fails Widevine at runtime.
 *
 * Releases are code-signed at SignPath, after electron-builder has finished
 * (.github/workflows/release.yml), so a VMP signature made here would cover the exe as it was
 * before code signing. The workflow sets VMP_SIGN_LATER and adds the VMP signature itself once
 * the code-signed exe is back. Builds by hand are not code-signed, so they sign here as before.
 */
export default function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return

  if (process.env.VMP_SIGN_LATER === 'true') {
    console.log(
      '[vmp] VMP_SIGN_LATER is set: the exe is code-signed after this build, then VMP-signed.'
    )
    return
  }

  signPackage(context)
}
