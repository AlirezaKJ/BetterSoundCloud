import { signPackage } from './vmp-sign.js'

/**
 * electron-builder `afterSign` hook — Windows only.
 *
 * On Windows the VMP signature must be applied AFTER code signing. macOS is the other way
 * round; see vmp-after-pack.js.
 *
 * soundcloud-rpc registers one hook for both platforms, which is wrong on macOS: the
 * build packages and notarizes fine and then fails Widevine at runtime.
 */
export default function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return

  signPackage(context)
}
