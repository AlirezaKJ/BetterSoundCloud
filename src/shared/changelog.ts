/*
 * "What's new" in Settings → About: one version's entry of CHANGELOG.md, which is also that
 * version's release notes on GitHub, read into plain blocks the panel draws as text. Never
 * markup: nothing here is ever handed to `innerHTML`.
 *
 * It reads the Markdown the changelog actually uses — `###` headings, paragraphs, `-` list items
 * with indented continuation lines, **bold**, `code` and [links](…) — and leaves out tables, which
 * are about downloading the app, not about what changed in it.
 */

/** A run of text: plain, bold, code, or a link. */
export type Inline = { text: string; strong?: true; code?: true; href?: string }

export type ChangelogBlock = { kind: 'heading' | 'paragraph' | 'item'; parts: Inline[] }

export type ChangelogEntry = { heading: string; blocks: ChangelogBlock[] }

/**
 * The entry for `version` ("## 0.8.0 (2026-11-05)"), or null when the changelog has none.
 * Relative links point into the repository, as they do on GitHub.
 */
export function changelogEntry(
  markdown: string,
  version: string,
  repository: string
): ChangelogEntry | null {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => headingVersion(line) === version)
  if (start === -1) return null
  const after = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  const body = lines.slice(start + 1, after === -1 ? undefined : after)

  const blocks: ChangelogBlock[] = []
  let current: { kind: ChangelogBlock['kind']; text: string } | null = null
  const finish = (): void => {
    if (current)
      blocks.push({ kind: current.kind, parts: inlineParts(current.text, repository) })
    current = null
  }

  for (const line of body) {
    if (line.trim() === '' || line.startsWith('|')) {
      finish()
    } else if (line.startsWith('### ')) {
      finish()
      current = { kind: 'heading', text: line.slice(4).trim() }
      finish()
    } else if (line.startsWith('- ')) {
      finish()
      current = { kind: 'item', text: line.slice(2).trim() }
    } else if (current) {
      current.text += ` ${line.trim()}`
    } else {
      current = { kind: 'paragraph', text: line.trim() }
    }
  }
  finish()

  return {
    heading: lines[start]?.slice(3).trim() ?? version,
    blocks: withoutEmptyHeadings(blocks)
  }
}

/** "0.8.0" from "## 0.8.0 (2026-11-05)", or null for any other line. */
function headingVersion(line: string): string | null {
  const match = /^## (\S+)/.exec(line)
  return match?.[1] ?? null
}

/** A heading with nothing under it (its table was left out) goes too. */
function withoutEmptyHeadings(blocks: ChangelogBlock[]): ChangelogBlock[] {
  return blocks.filter(
    (block, i) =>
      block.kind !== 'heading' || (blocks[i + 1] && blocks[i + 1]?.kind !== 'heading')
  )
}

/** **bold**, `code` and [text](link) in one line of Markdown, as runs. */
export function inlineParts(text: string, repository: string): Inline[] {
  const parts: Inline[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > at) parts.push({ text: text.slice(at, index) })
    const [, strong, code, label, target] = match
    if (strong !== undefined) parts.push({ text: strong, strong: true })
    else if (code !== undefined) parts.push({ text: code, code: true })
    else if (label !== undefined && target !== undefined) {
      const href = linkTarget(target, repository)
      parts.push(href ? { text: label, href } : { text: label })
    }
    at = index + match[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

/** An https link as it is; a path in the repository as its page on GitHub; nothing else. */
function linkTarget(target: string, repository: string): string | null {
  if (target.startsWith('https://')) return target
  if (/^[a-z]+:/i.test(target) || target.startsWith('/') || target.startsWith('#')) return null
  return `${repository}/blob/main/${target}`
}
