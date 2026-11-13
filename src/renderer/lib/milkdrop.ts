// MilkDrop is drawn by Butterchurn 3.0's beta (MIT) with its `minimal` preset pack (MIT). Their
// licences, and those of what Butterchurn bundles, ship with the app in
// resources/licenses/butterchurn.txt, since the bundler drops licence comments.
import type { Visualizer } from 'butterchurn'
import { readPresetPack } from '@shared/visualizer'
import type { MilkdropPreset } from '@shared/visualizer'

/*
 * Loading MilkDrop for lib/MilkDrop.svelte (CLAUDE.md §22). Both libraries are loaded only when
 * MilkDrop is first drawn, so a view that never shows it never parses them.
 *
 * Butterchurn compiles each preset's equations to WebAssembly (`onlyUseWASM`), so the views that
 * draw it add `'wasm-unsafe-eval'` to their CSP and nothing else: the presets it would otherwise
 * compile with `new Function` are refused, and our packs hold none (measured 2026-11-13: all 29
 * of `minimal` load and draw under that policy, and none under the standard one).
 */

export type Milkdrop = {
  visualizer: Visualizer
  presets: { name: string; preset: MilkdropPreset }[]
}

/** Butterchurn and the presets, on a canvas of `width` × `height` pixels. Rejects if it cannot. */
export async function startMilkdrop(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Milkdrop> {
  const [library, pack] = await Promise.all([
    import('butterchurn'),
    import('butterchurn-presets/dist/minimal.min.js')
  ])
  const presets = readPresetPack(pack)
  if (presets.length === 0) throw new Error('the preset pack holds no presets it can run')
  // No AudioContext: it reads no sound of its own, only the channels each frame is given.
  const visualizer = library.default.createVisualizer(null, canvas, {
    width,
    height,
    onlyUseWASM: true
  })
  return { visualizer, presets }
}

/**
 * Whether WebGL 2 runs on the graphics card here. Software WebGL (SwiftShader, Windows' WARP,
 * Mesa's llvmpipe) draws MilkDrop at 12 to 112 ms a frame (measured 2026-11-13), which would slow
 * the whole app; main already turns MilkDrop into Bars without hardware acceleration, and this
 * catches a graphics card Chromium has fallen back from since.
 *
 * The views ask as they start, whatever their look. That costs no time before they paint: asked
 * lazily instead, only once MilkDrop was wanted, both first painted about 20 ms later (an A/B on
 * built views, 2026-11-13), likely because the early context readies the graphics card's channel
 * the first frame needs anyway.
 */
export function hardwareWebgl(): boolean {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !/swiftshader|basic render driver|llvmpipe|softpipe/i.test(String(renderer))
  } catch {
    return false
  }
}
