import { describe, it, expect } from 'vitest'
import { parseThemeMetadata } from './themes'

describe('parseThemeMetadata', () => {
  it('reads every field out of a header', () => {
    const meta = parseThemeMetadata(
      `/**
        * @name Midnight
        * @author Someone
        * @version 2.1.0
        * @description Darker everything.
        */
       body { background: #000; }`,
      'midnight'
    )
    expect(meta).toEqual({
      name: 'Midnight',
      author: 'Someone',
      version: '2.1.0',
      description: 'Darker everything.'
    })
  })

  it('joins a description that wraps over several lines', () => {
    const meta = parseThemeMetadata(
      `/**
        * @name Wrapped
        * @description One sentence that runs on
        *              across two lines.
        */`,
      'wrapped'
    )
    expect(meta.description).toBe('One sentence that runs on across two lines.')
  })

  it('loads a theme that has no header at all', () => {
    // The whole point: a stylesheet is a valid theme. Metadata only decorates the list, so
    // being strict here would mean a missing comment stops a working theme from loading.
    const meta = parseThemeMetadata('body { color: red; }', 'my-theme')
    expect(meta).toEqual({
      name: 'my-theme',
      author: 'Unknown',
      version: '0.0.0',
      description: ''
    })
  })

  it('falls back per field, not all or nothing', () => {
    const meta = parseThemeMetadata('/**\n * @name Half\n */', 'half')
    expect(meta.name).toBe('Half')
    expect(meta.author).toBe('Unknown')
  })

  it('ignores an @tag that appears later in ordinary CSS', () => {
    // `@media` and `@supports` are everywhere in a stylesheet; only the leading `/** */`
    // block is metadata.
    const meta = parseThemeMetadata(
      '/**\n * @name Real\n */\n@media (min-width: 100px) { .x { color: red } }',
      'real'
    )
    expect(meta.name).toBe('Real')
  })
})
