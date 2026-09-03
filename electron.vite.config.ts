import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/**
 * Three build targets from one config.
 *
 * main    → ESM (package.json is `"type": "module"`; Electron >= 28 supports it).
 * preload → CJS. Sandboxed preloads cannot be ESM, and both of ours run with
 *           `sandbox: true`, so these are emitted as `.cjs` deliberately.
 * renderer→ two HTML entries, our own chrome only. SoundCloud itself is never
 *           rendered here — it gets its own WebContentsView.
 *
 * The alias block must be repeated per target: electron-vite builds each one with its
 * own Vite config, so a top-level `resolve` would not reach main or preload. It must
 * also stay in step with the `paths` in tsconfig.base.json and with vitest.config.ts.
 */
const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer')
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },

  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          chrome: resolve('src/preload/chrome.ts'),
          content: resolve('src/preload/content.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
          /*
           * Each preload must be ONE self-contained file: a sandboxed preload's `require`
           * resolves only Electron's allowlist, never a relative path, so a shared chunk
           * makes it fail to load outright. Rollup will hoist any module two entries both
           * import, and it cannot be talked out of it — so the rule is enforced in the
           * preloads themselves (see the channel constant in content.ts), and pinned by a
           * test that fails if a chunk ever appears here.
           */
        }
      }
    }
  },

  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    // `root` is src/renderer, so the plugin would look for svelte.config.js there.
    // It lives at the repo root because eslint.config.js imports it too.
    plugins: [svelte({ configFile: resolve('svelte.config.js') })],
    build: {
      rollupOptions: {
        input: {
          header: resolve('src/renderer/header/index.html'),
          settings: resolve('src/renderer/settings/index.html'),
          embedded: resolve('src/renderer/embedded/index.html'),
          player: resolve('src/renderer/player/index.html')
        }
      }
    }
  }
})
