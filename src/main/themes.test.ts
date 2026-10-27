import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseThemeMetadata, splitThemeTargets } from '@shared/themes'
import type * as ThemesModule from './themes'

/*
 * The theme service against real folders: the shipped themes in resources/themes, and a user
 * folder in a temporary directory. Electron is mocked only for the profile path and for opening
 * files.
 */

const mocks = vi.hoisted(() => ({ userData: '', openPath: vi.fn(() => Promise.resolve('')) }))

vi.mock('electron', () => ({
  app: { getPath: () => mocks.userData },
  shell: { openPath: mocks.openPath }
}))

let themes: typeof ThemesModule

beforeEach(async () => {
  mocks.userData = mkdtempSync(join(tmpdir(), 'bsc-themes-'))
  mocks.openPath.mockClear()
  vi.resetModules()
  themes = await import('./themes')
})

afterEach(() => {
  rmSync(mocks.userData, { recursive: true, force: true })
})

const userDir = () => join(mocks.userData, 'themes')

function writeUserTheme(name: string, css: string) {
  mkdirSync(userDir(), { recursive: true })
  writeFileSync(join(userDir(), name), css)
}

describe('listThemes', () => {
  it('lists the shipped themes, read from resources/themes', () => {
    const shipped = themes.listThemes().filter((t) => t.builtIn)
    expect(shipped.map((t) => t.id)).toContain('darkcloud')
    // Minimal navigation is a switch now, not a theme, so it must not be listed as one.
    expect(shipped.map((t) => t.id)).not.toContain('minimal-nav')
    expect(shipped.every((t) => !t.overridesBuiltIn)).toBe(true)
  })

  it('lets a user theme with a built-in’s id take its place, and says so', () => {
    writeUserTheme('darkcloud.css', '/**\n * @name My cloud\n */\n.x {}')
    const list = themes.listThemes()
    const clouds = list.filter((t) => t.id === 'darkcloud')
    expect(clouds).toHaveLength(1)
    expect(clouds[0]).toMatchObject({
      name: 'My cloud',
      builtIn: false,
      overridesBuiltIn: true
    })
  })

  it('splits each theme into its sections once, as it is read', () => {
    writeUserTheme('split.css', '.page {}\n/* @target chrome */\n:root { --bsc-accent: red; }')
    const theme = themes.findTheme('split')
    expect(theme?.sections.content).toBe('.page {}')
    expect(theme?.sections.chrome).toBe(':root { --bsc-accent: red; }')
  })

  it('never lists `vanilla`, which means no theme, nor a file whose name is not a safe id', () => {
    writeUserTheme('vanilla.css', '.x {}')
    writeUserTheme('two words.css', '.x {}')
    const ids = themes.listThemes().map((t) => t.id)
    expect(ids).not.toContain('vanilla')
    expect(ids).not.toContain('two words')
    expect(themes.findTheme('vanilla')).toBeNull()
  })
})

describe('copyThemeToUserFolder', () => {
  it('copies a built-in theme into the user folder, where it then takes over', () => {
    const target = themes.copyThemeToUserFolder('darkcloud')
    expect(target).toBe(join(userDir(), 'darkcloud.css'))
    expect(readFileSync(target, 'utf8')).toContain('@name Dark Cloud')
    expect(themes.findTheme('darkcloud')).toMatchObject({
      builtIn: false,
      overridesBuiltIn: true
    })
  })

  it('refuses to copy over an existing copy, so a second click cannot wipe someone’s edits', () => {
    themes.copyThemeToUserFolder('darkcloud')
    writeFileSync(join(userDir(), 'darkcloud.css'), '/* my edits */')
    expect(() => themes.copyThemeToUserFolder('darkcloud')).toThrow(/already one of yours/)
    expect(readFileSync(join(userDir(), 'darkcloud.css'), 'utf8')).toBe('/* my edits */')
  })

  it('refuses ids that are not a built-in theme', () => {
    expect(() => themes.copyThemeToUserFolder('nonexistent')).toThrow(/no longer there/)
  })
})

describe('opening files', () => {
  it('opens only the user’s own theme files, never a built-in inside the app', () => {
    writeUserTheme('mine.css', '.x {}')
    themes.openThemeFile('mine')
    themes.openThemeFile('darkcloud')
    themes.openThemeFile('../../etc/passwd')
    expect(mocks.openPath).toHaveBeenCalledOnce()
    expect(mocks.openPath).toHaveBeenCalledWith(join(userDir(), 'mine.css'))
  })

  it('creates the themes folder before opening it', () => {
    themes.openThemesFolder()
    expect(mocks.openPath).toHaveBeenCalledWith(userDir())
    expect(() => readFileSync(join(userDir(), 'missing'))).toThrow(/ENOENT/)
  })
})

describe('watchUserThemes', () => {
  it('reloads once per burst of saves, not once per file event', async () => {
    const onChange = vi.fn()
    themes.watchUserThemes(onChange)
    // An editor's save is several events in quick succession.
    for (let i = 0; i < 5; i++) writeUserTheme('live.css', `.x { order: ${i} }`)
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2_000 })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(onChange).toHaveBeenCalledOnce()
  })
})

// The Minimal navigation stylesheet, in detail. Not a theme any more (it goes on top of any
// theme), but still the best-commented example of restyling SoundCloud without touching it.
// These read the shipped stylesheet off disk, so they live on the main side: `src/shared`
// is type-checked against the web tsconfig, which has no Node types.
describe('the Minimal navigation stylesheet', () => {
  const minimalNavigationCss = () => themes.minimalNavigationCss()
  const css = readFileSync(join(import.meta.dirname, '../../resources/minimal-nav.css'), 'utf8')

  it('is read by the switch, and needs no theme header', () => {
    expect(minimalNavigationCss()).toBe(css)
    expect(css).not.toMatch(/@name|@version/)
  })

  it('targets nav links by href, never by position', () => {
    // `:nth-child` would put the wrong icon on the wrong link the day SoundCloud reorders
    // its menu — a silently wrong theme rather than an obviously broken one. Comments are
    // stripped first, or this matches the comment that explains the rule.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const href of ['/discover', '/feed', '/you/library']) {
      expect(rules).toContain(`[href='${href}']`)
    }
    expect(rules).not.toMatch(/nth-child/)
  })

  it('restyles only — it must never try to restructure SoundCloud', () => {
    // A theme is CSS reaching the page through insertCSS, so it cannot execute anything.
    // These guard the authoring rule that goes with that: no imports, no remote fetches.
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/url\(\s*['"]?https?:/)
  })

  it('hides labels without hiding them from screen readers', () => {
    // `font-size: 0` keeps the anchor's accessible name. `display: none` on the text, or
    // replacing it, would have cost the link its label.
    expect(css).toContain('font-size: 0')
  })

  it('gives every icon an identical box, so they line up', () => {
    // Measured regression. Without these three the anchors collapse to their content: the
    // row ended up with boxes 22, 24 and 46 tall, so each icon sat at a different height,
    // and baseline alignment of an inline-flex box also grew SoundCloud's 46px header to
    // 51.3px. With them, all four icon centres land on 23.0px from the header top.
    expect(css).toContain('height: 46px')
    expect(css).toContain('box-sizing: border-box')
    expect(css).toContain('vertical-align: middle')
  })

  it('centres the icon by position, not by flex', () => {
    // The selected nav item carries a 2px bottom border. Centring with `align-items` would
    // let that border shift its icon up relative to the others; pinning the icon at half the
    // bar height makes the border irrelevant.
    expect(css).toContain('top: 23px')
    expect(css).toContain('translate(-50%, -50%)')
  })

  it('hides the right-hand links rather than iconifying them', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const sel of [
      '.header__fanUpsell',
      '.creatorSubscriptionsButton',
      '.header__forArtistsButton',
      '.uploadButton'
    ]) {
      expect(rules).toContain(sel)
    }
    // If any of them were still iconified it would need a mask image of its own. Only the
    // three nav links carry icons.
    expect(rules).not.toContain('--bsc-icon-upload')
    expect(rules).not.toContain('--bsc-icon-studio')
    const icons = [...rules.matchAll(/--bsc-icon-([a-z]+):/g)].map((m) => m[1]).sort()
    expect(icons).toEqual(['feed', 'home', 'library'])
  })

  it('closes the gap the hidden links left beside the avatar', () => {
    // SoundCloud's 16px right margin on the avatar button separated it from the promo links.
    // With those hidden it became a stray gap between the account chevron and the bell —
    // measured at exactly 16px, now 0.
    expect(css).toContain('.header__userNav .header__userNavButton')
    expect(css).toContain('margin-right: 0 !important')
  })
})

/*
 * Every theme that ships, held to the same rules. These are what make a bundled theme safe to
 * turn on: it loads nothing from anyone but SoundCloud, depends on no markup v0.7.x injected,
 * and recolours our own windows only through the design tokens.
 */
const THEMES_DIR = join(import.meta.dirname, '../../resources/themes')
const SHIPPED = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css'))

describe.each(SHIPPED)('the shipped theme %s', (file) => {
  const css = readFileSync(join(THEMES_DIR, file), 'utf8')
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('is named in lowercase, so it loads on case-sensitive file systems too', () => {
    // v0.7.x loaded `themes/glassmorphism.css` while the file was `Glassmorphism.css`: fine on
    // Windows, ENOENT on ext4.
    expect(file).toBe(file.toLowerCase())
  })

  it('declares a name, a version and a description', () => {
    const meta = parseThemeMetadata(css, file)
    expect(meta.name).not.toBe(file)
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(meta.description.length).toBeGreaterThan(20)
  })

  it('loads nothing from the network but SoundCloud’s own image CDN', () => {
    expect(rules).not.toMatch(/@import/)
    for (const [, url = ''] of rules.matchAll(/url\(\s*['"]?([^'")\s]+)/g)) {
      const allowed =
        url.startsWith('data:') ||
        url.startsWith('var(') ||
        url.startsWith('https://a-v2.sndcdn.com/')
      expect(allowed, url.slice(0, 80)).toBe(true)
    }
  })

  it('styles nothing that only v0.7.x’s injected markup had', () => {
    expect(rules).not.toMatch(
      /header__app|playControls__(plugin|theme|lyric|showcase)btn|\.custombg|bgblurrer|issciloaded/
    )
  })

  it('recolours our own windows only by setting design tokens', () => {
    const chrome = splitThemeTargets(css)
      .chrome.replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    if (!chrome) return
    expect(chrome).toMatch(/^:root\s*\{[^{}]*\}$/)
    for (const [, property] of chrome.matchAll(/(--?[\w-]+)\s*:/g)) {
      expect(property, property).toMatch(/^--bsc-/)
    }
  })

  it('inverts icons only while SoundCloud itself is light', () => {
    // v0.7.x themes inverted SoundCloud's dark icons to make them light. In SoundCloud's dark
    // mode the icons are light already, and inverting them made the play button vanish.
    for (const match of rules.matchAll(/([^{}]+)\{([^{}]*invert\([^{}]*)\}/g)) {
      const selectors = (match[1] ?? '').split(',').map((s) => s.trim())
      for (const selector of selectors) {
        if (selector.includes('__image')) continue // a picture, not an icon
        expect(selector, selector).toMatch(/^body\.theme-light /)
      }
    }
  })

  it('keeps our windows readable: WCAG AA against its own background', () => {
    // A theme that sets the accent near the background erases the only keyboard focus ring,
    // and one with low-contrast text makes settings unreadable. Primary text is held to 7:1
    // because the 13px captions in settings use it too.
    const tokens = chromeTokens(splitThemeTargets(css).chrome)
    const background = tokens.get('--bsc-bg-primary') ?? ''
    for (const [token, floor] of [
      ['--bsc-text-primary', 7],
      ['--bsc-text-secondary', 4.5],
      ['--bsc-accent', 3]
    ] as const) {
      const ratio = contrast(tokens.get(token) ?? '', background)
      expect(ratio, `${token} on --bsc-bg-primary`).toBeGreaterThanOrEqual(floor)
    }
  })
})

describe('our design tokens', () => {
  it('lose to any theme’s plain `:root`, whatever order the sheets arrive in', () => {
    // A theme reaches our views through insertCSS, and Chromium cascades inserted sheets BEFORE
    // the document's own. With the defaults on `:root` they won at equal specificity, and no
    // theme could recolour our windows (measured 2026-10-27). `:where()` has no specificity.
    const tokens = readFileSync(join(import.meta.dirname, '../renderer/tokens.css'), 'utf8')
    const rules = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/(^|[\s}])(html)?:root\s*\{/)
    expect(rules.match(/:where\(:root\)\s*\{/g)).toHaveLength(2)
  })
})

/** The `--bsc-*: value` pairs in a chrome section. */
function chromeTokens(chrome: string): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const [, name = '', value = ''] of chrome.matchAll(/(--bsc-[\w-]+)\s*:\s*([^;}]+)/g)) {
    tokens.set(name, value.trim())
  }
  return tokens
}

/** WCAG 2 contrast ratio of two opaque hex colours; 0 for anything else, which then fails. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number | null => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
    if (!m?.[1]) return null
    const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    const [r = 0, g = 0, bl = 0] = [0, 2, 4].map((i) => {
      const c = parseInt(full.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return 0
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
