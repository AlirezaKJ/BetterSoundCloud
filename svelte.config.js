import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * Plain Svelte, not SvelteKit — there is no routing or SSR in an Electron shell.
 *
 * No Shadow DOM anywhere: Svelte scopes CSS with a generated hash class in the
 * ordinary document, so a user theme's `.settingitem { ... !important }` still
 * matches our chrome. That property is load-bearing for user theming, which is
 * why Lit was rejected. See the vault note "BetterSoundCloud v2 Tech Stack and
 * Approach" §2.
 */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true
  }
}
