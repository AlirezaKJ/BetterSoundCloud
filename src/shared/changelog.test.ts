import { describe, expect, it } from 'vitest'
import { changelogEntry, inlineParts } from './changelog'

const REPO = 'https://github.com/AlirezaKJ/BetterSoundCloud'

const CHANGELOG = `# Changelog

## Unreleased

- Not out yet.

## 0.8.0 (2026-11-05)

### Rebuilt from scratch.

The tracks that skipped play now
([#95](https://github.com/AlirezaKJ/BetterSoundCloud/issues/95)).

### Which file?

| You have | Download |
| -------- | -------- |
| Windows  | setup    |

### What is new

- **An equaliser**, six bands, in
  **Settings → Plugins**.
- Plugins can shape the sound ([guide](docs/CUSTOM_PLUGINS.md)), with \`audio\`.

## 0.7.1 (2026-05-08)

- Older.
`

describe('changelogEntry', () => {
  it('reads one version’s entry, and stops at the next', () => {
    const entry = changelogEntry(CHANGELOG, '0.8.0', REPO)
    expect(entry?.heading).toBe('0.8.0 (2026-11-05)')
    expect(entry?.blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'item',
      'item'
    ])
  })

  it('joins a paragraph and a list item across their lines', () => {
    const entry = changelogEntry(CHANGELOG, '0.8.0', REPO)
    expect(entry?.blocks[1]?.parts.map((p) => p.text).join('')).toBe(
      'The tracks that skipped play now (#95).'
    )
    expect(entry?.blocks[3]?.parts).toEqual([
      { text: 'An equaliser', strong: true },
      { text: ', six bands, in ' },
      { text: 'Settings → Plugins', strong: true },
      { text: '.' }
    ])
  })

  it('leaves out tables, and a heading left with nothing under it', () => {
    const entry = changelogEntry(CHANGELOG, '0.8.0', REPO)
    const text = JSON.stringify(entry)
    expect(text).not.toContain('Which file?')
    expect(text).not.toContain('Download')
  })

  it('is null for a version the changelog does not have', () => {
    expect(changelogEntry(CHANGELOG, '9.9.9', REPO)).toBeNull()
  })
})

describe('inlineParts', () => {
  it('points a path in the repository at its page on GitHub', () => {
    expect(inlineParts('a [guide](docs/CUSTOM_PLUGINS.md)', REPO)).toEqual([
      { text: 'a ' },
      { text: 'guide', href: `${REPO}/blob/main/docs/CUSTOM_PLUGINS.md` }
    ])
  })

  it('keeps https links and drops any other kind, keeping the words', () => {
    expect(inlineParts('[x](https://example.org) [y](javascript:alert(1))', REPO)).toEqual([
      { text: 'x', href: 'https://example.org' },
      { text: ' ' },
      { text: 'y' },
      { text: ')' }
    ])
  })

  it('reads code', () => {
    expect(inlineParts('the `audio` permission', REPO)).toEqual([
      { text: 'the ' },
      { text: 'audio', code: true },
      { text: ' permission' }
    ])
  })
})
