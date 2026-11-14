import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OTHER_ENTRIES } from '@shared/settings-search'

/*
 * Search in Settings finds buttons and keys that are not schema settings by a name written in
 * src/shared/settings-search.ts, and lands on them by an attribute their component draws. Both
 * live in other files, so this reads the components (it sits in src/main because a test in
 * src/shared cannot read files) to keep the two from drifting apart.
 */

const SETTINGS_DIR = join(import.meta.dirname, '..', 'renderer', 'settings')
const read = (file: string): string => readFileSync(join(SETTINGS_DIR, file), 'utf8')

const ALL = ['Settings.svelte', 'BrowserSession.svelte', 'Reset.svelte', 'About.svelte']
  .map(read)
  .join('\n')

describe('what search finds outside the schema', () => {
  it('is named as the panel names it', () => {
    for (const entry of OTHER_ENTRIES) expect(ALL).toContain(entry.name)
  })

  it('lands on an attribute a component draws', () => {
    for (const entry of OTHER_ENTRIES) {
      const attribute = /^\[([a-z-]+)/.exec(entry.target)?.[1] ?? ''
      expect(ALL).toContain(attribute)
    }
  })

  it('lands on schema rows, the background, the theme list, themes and plugins too', () => {
    // The selectors Settings.svelte builds for them, each drawn by its component.
    expect(read('Settings.svelte')).toContain('data-bsc-setting={key}')
    expect(read('Background.svelte')).toContain('data-bsc-setting={slider.key}')
    expect(read('Background.svelte')).toContain('data-bsc-background>')
    expect(read('Themes.svelte')).toContain('data-bsc-theme-list')
    expect(read('Themes.svelte')).toContain('data-bsc-theme={id}')
    expect(read('Plugins.svelte')).toContain('data-bsc-plugin={plugin.id}')
    // A plugin's own settings, both the ordinary rows and the wide ones (a curve, a ruler).
    expect(read('Plugins.svelte').split('data-bsc-plugin-setting={setting.key}').length).toBe(3)
  })
})
