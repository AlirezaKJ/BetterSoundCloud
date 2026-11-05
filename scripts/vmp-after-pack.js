import { signPackage } from './vmp-sign.js'

/**
 * electron-builder `afterPack` hook — macOS only.
 *
 * On macOS the VMP signature must be applied BEFORE code signing, so this is the right
 * moment. Windows signs later; see vmp-after-sign.js.
 *
 * This also runs after electron-builder has applied the `electronFuses` from
 * electron-builder.yml, which matters: flipping a fuse rewrites bytes that the signature
 * covers, so signing any earlier would produce a signature that no longer validates.
 */
export default function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  signPackage(context)
}
