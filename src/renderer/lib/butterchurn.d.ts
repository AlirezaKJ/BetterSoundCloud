/**
 * Butterchurn 3.0's beta (npm `butterchurn`, MIT) and its preset packs (`butterchurn-presets`),
 * as far as lib/milkdrop.ts uses them: neither ships types. Its licence, and those of what it
 * bundles, ship with the app in resources/licenses/butterchurn.txt.
 */
declare module 'butterchurn' {
  /** One preset, as a pack holds it: data, compiled to WebAssembly when loaded. */
  export type MilkdropPreset = Record<string, unknown>

  /** What it draws from: bytes centred on 128, 1024 of them, the mix and each channel. */
  export type AudioLevels = {
    timeByteArray: Uint8Array
    timeByteArrayL: Uint8Array
    timeByteArrayR: Uint8Array
  }

  export type Visualizer = {
    /** Compiles the preset's equations and melts into it over `blendSeconds`. */
    loadPreset(preset: MilkdropPreset, blendSeconds: number): Promise<void>
    /** One frame, from the sound given (without it, it would read an AudioNode of its own). */
    render(options: { audioLevels: AudioLevels; elapsedTime?: number }): void
    setRendererSize(width: number, height: number): void
    /** Frees its WebGL context at once rather than when the garbage collector gets to it. */
    loseGLContext(): void
  }

  const butterchurn: {
    /**
     * With no AudioContext it reads no AudioNode, only what `render` is given. It draws with
     * WebGL 2 on a canvas of its own and copies each frame onto `canvas`.
     */
    createVisualizer(
      context: AudioContext | null,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number; onlyUseWASM: boolean }
    ): Visualizer
  }
  export default butterchurn
}

declare module 'butterchurn-presets/dist/minimal.min.js' {
  /** The pack: presets by name. Its bundle wraps it in a `default` or two, depending on interop. */
  const pack: unknown
  export default pack
}
