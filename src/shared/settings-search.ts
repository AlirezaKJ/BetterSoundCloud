/*
 * Search in Settings: which settings, themes, plugins and buttons match what was typed, and
 * which of their words to mark. Pure, so it is tested without a browser; the settings view
 * builds the entries and draws the matches.
 *
 * Every word of the query has to appear somewhere in the entry's name or its explanation, in
 * any order, ignoring case and accents: "tray minimize" finds "Minimize to tray on close".
 */

import { SECTIONS } from './settings-schema'
import type { Section } from './settings-schema'

/** One thing Settings can find. */
export type SearchEntry = {
  section: Section
  name: string
  /** What it does, as the panel says it. Searched, and shown under the name. */
  text: string
  /** A CSS selector for the row it lands on, inside the settings view. */
  target: string
}

/** A run of text, marked when it is part of a word that was searched for. */
export type TextPart = { text: string; match: boolean }

export type SearchHit = { entry: SearchEntry; name: TextPart[]; text: TextPart[] }

export type SearchGroup = { section: Section; hits: SearchHit[] }

/**
 * A selector for the element whose attribute is exactly this value. Theme ids are file names the
 * user chose, so a quote or a backslash in one must not end the selector early.
 */
export function attributeSelector(attribute: string, value: string): string {
  return `[${attribute}="${value.replace(/["\\]/g, '\\$&')}"]`
}

/**
 * One character, folded for comparing: lower case, no accent, a curly apostrophe made straight.
 * Always the same length as what it replaces, so a position in the folded text is the same
 * position in the original, which is what marking the matches needs.
 */
function foldCharacter(character: string): string {
  if (character === '’' || character === '‘') return "'"
  const folded = character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return folded.length === character.length ? folded : character
}

function fold(text: string): string {
  return Array.from(text, foldCharacter).join('')
}

/** The words searched for, folded, each once. Empty when nothing but spaces was typed. */
export function searchWords(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))]
}

/** `text` cut into runs, the ones covered by any of `words` marked. */
export function markMatches(text: string, words: readonly string[]): TextPart[] {
  const folded = fold(text)
  const marked: boolean[] = Array.from({ length: text.length }, () => false)
  for (const word of words) {
    let at = folded.indexOf(word)
    while (at !== -1) {
      for (let i = at; i < at + word.length; i++) marked[i] = true
      at = folded.indexOf(word, at + word.length)
    }
  }

  const parts: TextPart[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      parts.push({ text: text.slice(start, i), match: marked[start] === true })
      start = i
    }
  }
  return parts
}

/**
 * The entries every word of `query` appears in, grouped by section. An entry whose name holds every
 * word comes before one found only through its explanation, and so does its section: "dark cloud"
 * leads with the Dark Cloud theme, not with the Appearance setting that says "dark" and
 * "SoundCloud". Otherwise the order is the sidebar's, and within a section the panel's own.
 */
export function searchSettings(entries: readonly SearchEntry[], query: string): SearchGroup[] {
  const words = searchWords(query)
  if (words.length === 0) return []

  const named: SearchGroup[] = []
  const groups: SearchGroup[] = []
  for (const section of SECTIONS) {
    const byName: SearchHit[] = []
    const byText: SearchHit[] = []
    for (const entry of entries) {
      if (entry.section !== section) continue
      const name = fold(entry.name)
      const both = `${name} ${fold(entry.text)}`
      if (!words.every((word) => both.includes(word))) continue
      const hit = {
        entry,
        name: markMatches(entry.name, words),
        text: markMatches(entry.text, words)
      }
      if (words.every((word) => name.includes(word))) byName.push(hit)
      else byText.push(hit)
    }
    const group = { section, hits: [...byName, ...byText] }
    if (byName.length > 0) named.push(group)
    else if (byText.length > 0) groups.push(group)
  }
  return [...named, ...groups]
}

/**
 * What Settings shows that is not a setting in the schema: buttons and keys drawn by their own
 * components. Their names are the ones on screen (a test reads the components to keep it so);
 * the text is a short summary of the row, for finding it, not a copy of its explanation.
 */
export const OTHER_ENTRIES: readonly SearchEntry[] = [
  {
    section: 'shortcuts',
    name: 'Move focus to the next part of the window',
    text: 'F6. From the top bar to SoundCloud’s page, the lyrics pane and the player buttons.',
    target: attributeSelector('data-bsc-settings-key', 'next-part')
  },
  {
    section: 'shortcuts',
    name: 'Move focus back',
    text: 'Shift+F6. The same parts of the window, the other way round.',
    target: attributeSelector('data-bsc-settings-key', 'previous-part')
  },
  {
    section: 'advanced',
    name: 'Import browser sign-in',
    text: 'Sign in with the account you use in your browser, from a cookie export of soundcloud.com.',
    target: '[data-bsc-browser-session]'
  },
  {
    section: 'advanced',
    name: 'Reset settings',
    text: 'Puts every setting outside Plugins back to its default.',
    target: attributeSelector('data-bsc-settings-reset', 'settings')
  },
  {
    section: 'advanced',
    name: 'Clear cache and site data',
    text:
      'Signs you out of SoundCloud. Try this first if SoundCloud keeps saying you’ve been ' +
      'blocked, or its page won’t load properly.',
    target: attributeSelector('data-bsc-settings-reset', 'site-data')
  }
]
