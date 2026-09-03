/**
 * What the settings panel knows about a theme.
 *
 * The stylesheet itself never crosses IPC — main injects it straight into SoundCloud's view,
 * and the panel only needs enough to draw a list. Keeping the CSS out of this type is what
 * makes that obvious to the next person, rather than a rule they have to remember.
 */
export interface ThemeSummary {
  /** Filename stem, and the value stored in `appearance.theme`. */
  readonly id: string
  readonly name: string
  readonly author: string
  readonly version: string
  readonly description: string
  /** Shipped with the app, as opposed to one the user dropped in their themes folder. */
  readonly builtIn: boolean
}

/**
 * Read a `/** @name … *\/` header off a theme file.
 *
 * Pure and exported so it can be tested without touching the disk. Every field is optional:
 * a theme with no header at all still loads, and just shows up under its filename. Being
 * strict here would mean a typo in a comment stops a stylesheet working, which is a bad
 * trade for metadata that only decorates a list.
 */
export function parseThemeMetadata(
  css: string,
  fallbackName: string
): Omit<ThemeSummary, 'id' | 'builtIn'> {
  const header = /\/\*\*([\s\S]*?)\*\//.exec(css)?.[1] ?? ''

  // `@name Minimal navigation` up to the next `@tag` or the end of the block. The `m` flag
  // plus the leading-star strip is what lets a description wrap over several lines.
  const tag = (name: string): string | null => {
    const body = new RegExp(`@${name}\\s+([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|$)`).exec(header)?.[1]
    if (body === undefined) return null
    return body
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .join(' ')
      .trim()
  }

  return {
    name: tag('name') || fallbackName,
    author: tag('author') || 'Unknown',
    version: tag('version') || '0.0.0',
    description: tag('description') || ''
  }
}
