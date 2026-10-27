import { describe, it, expect } from 'vitest'
import {
  chromeCssFor,
  contentCssOf,
  coverCss,
  parseThemeMetadata,
  splitThemeTargets
} from './themes'

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
      description: 'Darker everything.',
      preview: []
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
      description: '',
      preview: []
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

describe('@preview', () => {
  it('reads up to five hex colours, and ignores anything that is not one', () => {
    const meta = parseThemeMetadata(
      '/**\n * @name P\n * @preview #121212 #1E1E1E red #abc url(x) #ff5500 #000 #fff\n */',
      'p'
    )
    expect(meta.preview).toEqual(['#121212', '#1E1E1E', '#abc', '#ff5500', '#000'])
  })
})

describe('splitThemeTargets', () => {
  it('sends everything to SoundCloud’s page when a theme has no markers, as old themes do', () => {
    const sections = splitThemeTargets('body { color: red; }')
    expect(sections.content).toBe('body { color: red; }')
    expect(sections.chrome).toBe('')
  })

  it('splits a file into its sections, in any order, with repeats appended', () => {
    const sections = splitThemeTargets(
      [
        '.a { x: 1 }',
        '/* @target chrome */',
        ':root { --bsc-accent: #08fc9c; }',
        '/* @target content */',
        '.b { x: 2 }',
        '/* @target settings */',
        'nav { y: 3 }',
        '/* @target chrome */',
        '.c { x: 4 }'
      ].join('\n')
    )
    expect(sections.content).toBe('.a { x: 1 }\n\n.b { x: 2 }')
    expect(sections.chrome).toBe(':root { --bsc-accent: #08fc9c; }\n\n.c { x: 4 }')
    expect(sections.settings).toBe('nav { y: 3 }')
  })

  it('drops a section whose target it does not know, rather than putting it somewhere wrong', () => {
    const sections = splitThemeTargets(
      '.a {}\n/* @target nowhere */\n.lost {}\n/* @target content */\n.b {}'
    )
    expect(Object.values(sections).join('')).not.toContain('.lost')
    expect(sections.content).toBe('.a {}\n\n.b {}')
  })

  it('only treats a marker on a line of its own as a marker', () => {
    // Inside a rule, or after code on the same line, it is an ordinary comment.
    const sections = splitThemeTargets('.a { /* @target chrome */ color: red }')
    expect(sections.content).toBe('.a { /* @target chrome */ color: red }')
    expect(sections.chrome).toBe('')
  })
})

describe('what each view gets', () => {
  const sections = splitThemeTargets(
    '/* @target all */\n.all {}\n/* @target content */\n.page {}\n/* @target chrome */\n.chrome {}\n/* @target menu */\n.menu {}'
  )

  it('gives SoundCloud’s page `all` and `content`, and never our chrome’s CSS', () => {
    expect(contentCssOf(sections)).toBe('.all {}\n.page {}')
  })

  it('gives each of our views `all`, `chrome`, and only its own section', () => {
    expect(chromeCssFor(sections, 'menu')).toBe('.all {}\n.chrome {}\n.menu {}')
    expect(chromeCssFor(sections, 'header')).toBe('.all {}\n.chrome {}')
  })
})

describe('coverCss', () => {
  it('puts SoundCloud artwork into --bsc-cover, more specific than the page default', () => {
    expect(coverCss('https://i1.sndcdn.com/artworks-abc-t500x500.jpg')).toBe(
      'html:root { --bsc-cover: url("https://i1.sndcdn.com/artworks-abc-t500x500.jpg"); }'
    )
  })

  it('writes `none` for anything that could break out of the CSS or is not SoundCloud’s', () => {
    for (const bad of [
      '',
      'https://evil.example/x.jpg',
      'http://i1.sndcdn.com/x.jpg',
      'https://i1.sndcdn.com/x.jpg"); } body { display: none',
      "https://i1.sndcdn.com/x.jpg') }",
      'https://i1.sndcdn.com/a b.jpg'
    ]) {
      expect(coverCss(bad), bad).toBe('html:root { --bsc-cover: none; }')
    }
  })
})
