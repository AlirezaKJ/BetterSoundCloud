/**
 * docs/TODO.md as a page to take in at a glance: what is done, in progress and open, milestone by
 * milestone, with every item's notes a click away. `npm run todo` writes it and opens it.
 *
 * Generated, not written by hand, because the backlog changes in nearly every piece of work and a
 * hand-made page would be out of date the next day. The output (docs/todo-overview.html) is
 * gitignored for the same reason; run this again whenever you want it current. One file, nothing
 * loaded from anywhere, in the app's own colours (docs/DESIGN.md), light and dark.
 *
 * Usage:
 *   node scripts/todo-overview.mjs [--open]
 */

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SOURCE = join(ROOT, 'docs/TODO.md')
const OUTPUT = join(ROOT, 'docs/todo-overview.html')
const ISSUES = 'https://github.com/AlirezaKJ/BetterSoundCloud/issues/'

// ── Inline Markdown, the little the backlog uses ────────────────────────────────────────────────

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Code spans first (their contents stay literal), then links, bold, strikes, issue numbers. Each
 * code span waits behind a placeholder in a private-use character, which the backlog never holds.
 */
function inline(text) {
  const codes = []
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`)
    return `${codes.length - 1}`
  })
  html = html
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(/,])#(\d{1,4})\b/g, `$1<a href="${ISSUES}$2">#$2</a>`)
  return html.replace(/(\d+)/g, (_, i) => codes[Number(i)])
}

const plain = (text) => text.replace(/[`*~_]/g, '')

/** Lines of prose into paragraphs, lists and tables. */
function blocks(lines) {
  const out = []
  let paragraph = []
  let list = []
  let table = []
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`)
    if (table.length) {
      const rows = table
        .filter((row) => !/^\|\s*-/.test(row))
        .map((row) => row.replace(/^\||\|$/g, '').split('|'))
      const [head, ...body] = rows
      out.push(
        `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c.trim())}</th>`).join('')}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      )
    }
    paragraph = []
    list = []
    table = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
    } else if (line.startsWith('|')) {
      if (paragraph.length || list.length) flush()
      table.push(line)
    } else if (/^[-*] /.test(line)) {
      if (paragraph.length || table.length) flush()
      list.push(line.slice(2))
    } else if (list.length && /^\s{2,}/.test(raw)) {
      list[list.length - 1] += ` ${line}`
    } else {
      if (list.length || table.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return out.join('')
}

// ── Reading the backlog ─────────────────────────────────────────────────────────────────────────

const markdown = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n')
const sections = markdown.split(/^## /m).slice(1)

const milestones = []
const extras = { before: [], future: [], decisions: [], declined: [] }

/*
 * An item's status note opens in capitals: "DONE 2026-10-28, SEEN ON WINDOWS THE SAME DAY". On the
 * page it reads as a sentence, each word spelt the way the rest of the backlog spells it, so
 * WINDOWS becomes Windows, API stays API and DONE becomes done.
 */
const CAPITALS = /^[A-Z][A-Z0-9 ,.;:'’()+\-–/]*[A-Z0-9)](?![A-Za-z])/
const WORD = /[A-Za-z][A-Za-z0-9-]*/g
/** An unticked item whose note says part of it is done. */
const PART_DONE = /\b(PARTLY|HALF|CORE|DONE|PASSED|DECIDED|WRITTEN)\b/
/** Long notes keep only their capitals as the caption; the rest opens the details. */
const SHORT_NOTE = 72

const spellings = new Map()
const prose = markdown.replace(/^(- \[[ x]\] \*\*.+?\*\*)(?=\s|$).*$/gm, '$1') // without the notes
for (const word of prose.match(WORD) ?? []) {
  const counts = spellings.get(word.toLowerCase()) ?? new Map()
  counts.set(word, (counts.get(word) ?? 0) + 1)
  spellings.set(word.toLowerCase(), counts)
}

/** The spelling the backlog uses most; on a tie, the lowercase one. */
function respell(word) {
  const counts = spellings.get(word.toLowerCase())
  if (!counts) return word.length <= 4 ? word : word.toLowerCase() // short: likely an acronym
  let best = word.toLowerCase()
  let bestCount = counts.get(best) ?? 0
  for (const [spelling, count] of counts) {
    if (count > bestCount) {
      best = spelling
      bestCount = count
    }
  }
  return best
}

const capitalFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function readItem(head, bodyLines) {
  // The closing ** is followed by a space or the end: a title can hold `resources/plugins/**`.
  const [, mark, title, rest = ''] = /^- \[( |x)\] \*\*(.+?)\*\*(?=\s|$)(.*)$/.exec(head)
  const note = rest.replace(/^\s*—\s*/, '').trim()
  let capitals = CAPITALS.exec(note)?.[0] ?? ''
  if (!/[A-Z]{2}/.test(capitals)) capitals = ''
  const spoken = capitals.replace(WORD, respell)
  const short = note.length <= SHORT_NOTE
  const caption = capitalFirst(short ? spoken + note.slice(capitals.length) : spoken)
  const lead = short ? '' : note.slice(capitals.length).replace(/^[\s:,;]+/, '')

  const meta = bodyLines.find((line) => /^\s*`source:/.test(line)) ?? ''
  const lines = bodyLines.filter((line) => line !== meta)
  const split = lines.findIndex((line) => line.trim() === '**Original scope:**')
  const now = split === -1 ? [] : lines.slice(0, split)
  const original = split === -1 ? lines : lines.slice(split + 1)
  const body = (lead ? [capitalFirst(lead), ''] : []).concat(now)

  const done = mark === 'x'
  const partDone = PART_DONE.test(capitals) || /\*\*Partial progress/.test(lines.join(' '))
  return {
    title: inline(title),
    caption: inline(caption),
    status: done ? 'done' : partDone ? 'progress' : 'open',
    effort: /`effort: (XL|L|M|S)`/.exec(meta)?.[1] ?? '',
    source: /`source: ([^`]+)`/.exec(meta)?.[1] ?? '',
    evidence: inline(/`evidence: ([^`]+)`/.exec(meta)?.[1] ?? ''),
    now: blocks(body),
    original: blocks(original),
    text: plain([title, note, ...lines].join(' ')).toLowerCase()
  }
}

/** `- **Title.** text` bullets, as the sections after the milestones write them. */
function readBullets(lines) {
  const bullets = []
  for (const line of lines) {
    if (/^- /.test(line)) bullets.push(line.slice(2))
    else if (bullets.length && line.trim()) bullets[bullets.length - 1] += ` ${line.trim()}`
  }
  return bullets.map((bullet) => {
    const struck = /^~~\*\*(.+?)\*\*~~\s*(.*)$/.exec(bullet)
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(bullet)
    const [title, text] = struck
      ? [struck[1], struck[2]]
      : bold
        ? [bold[1], bold[2]]
        : ['', bullet]
    return {
      title: inline(title.replace(/[.:]$/, '')),
      html: inline(capitalFirst(text.replace(/^—\s*/, ''))),
      decided: Boolean(struck),
      effort: /`(XL|L|M|S)`\s*$/.exec(text)?.[1] ?? '',
      text: plain(bullet).toLowerCase()
    }
  })
}

for (const section of sections) {
  const [heading, ...lines] = section.split('\n')
  const milestone = /^Milestone (\d+) — (.+)$/.exec(heading)
  if (milestone) {
    const items = []
    let current = null
    for (const line of lines) {
      if (/^- \[( |x)\] \*\*/.test(line)) {
        if (current) items.push(readItem(current.head, current.body))
        current = { head: line, body: [] }
      } else if (current && line.trim() !== '---') {
        current.body.push(line)
      }
    }
    if (current) items.push(readItem(current.head, current.body))
    milestones.push({ number: Number(milestone[1]), title: inline(milestone[2]), items })
  } else if (heading.startsWith('Already done')) {
    extras.before = readBullets(lines)
  } else if (heading.startsWith('Future')) {
    extras.future = readBullets(lines)
  } else if (heading.startsWith('Open decisions')) {
    extras.decisions = readBullets(lines)
  } else if (heading.startsWith('Explicitly declined')) {
    extras.declined = readBullets(lines)
  }
}

const data = {
  generated: new Date().toISOString(),
  milestones,
  ...extras
}

// ── The page ────────────────────────────────────────────────────────────────────────────────────

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BetterSoundCloud backlog</title>
<link rel="icon" href="data:,">
<style>
:root {
  --bg: #f2f2f2; --field: #ffffff; --ink: #1a1a1a; --muted: #5c5c5c; --ghost: #a8a8a8;
  --hairline: rgb(0 0 0 / 12%); --wash: rgb(0 0 0 / 6%); --accent: #e64d00;
  --track: rgb(0 0 0 / 9%); --radius: 6px; --card: 10px;
  --shadow: 0 12px 40px rgb(0 0 0 / 18%), 0 2px 8px rgb(0 0 0 / 12%);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121212; --field: #1c1c1c; --ink: #f2f2f2; --muted: #a0a0a0; --ghost: #5c5c5c;
    --hairline: rgb(255 255 255 / 12%); --wash: rgb(255 255 255 / 7%); --accent: #f50;
    --track: rgb(255 255 255 / 10%);
    --shadow: 0 12px 40px rgb(0 0 0 / 45%), 0 2px 8px rgb(0 0 0 / 30%);
  }
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--ink); }
body {
  margin: 0; font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
::selection { background: color-mix(in srgb, var(--accent) 28%, transparent); }
a { color: inherit; text-decoration-color: var(--ghost); text-underline-offset: 2px; }
a:hover { text-decoration-color: currentColor; }
code {
  font: 12px/1.4 ui-monospace, 'Cascadia Mono', Consolas, monospace; padding: 1px 4px;
  border-radius: 4px; background: var(--wash); overflow-wrap: anywhere;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius); }
button { font: inherit; color: inherit; cursor: pointer; }

.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; }
header.top { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px 32px; margin-bottom: 24px; }
h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.overall { flex: 1 1 320px; min-width: 260px; }
.overall .figures { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
.overall .figures strong { color: var(--ink); font-variant-numeric: tabular-nums; }

/* A stacked bar: done, in progress, open, 2px of surface between, rounded ends. */
.bar { display: flex; gap: 2px; height: 8px; }
.bar.big { height: 12px; }
.bar span { border-radius: 2px; min-width: 2px; }
.bar span:first-child { border-radius: 4px 2px 2px 4px; }
.bar span:last-child { border-radius: 2px 4px 4px 2px; }
.bar span:only-child { border-radius: 4px; }
.seg-done { background: var(--accent); }
.seg-progress { background: var(--muted); }
.seg-open { background: var(--track); }

.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
.tile {
  padding: 14px 16px; border: 1px solid var(--hairline); border-radius: var(--card); background: var(--field);
  text-align: left;
}
button.tile:hover { background: color-mix(in srgb, var(--field) 85%, var(--ink) 4%); }
.tile .label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; }
.tile .value { display: block; margin-top: 4px; font-size: 30px; font-weight: 650; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tile .hint { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }

.layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 28px; align-items: start; }
/* Milestone names never wrap; without this they widen the column past a phone's screen. */
.layout > * { min-width: 0; }
aside { position: sticky; top: 16px; }
.panel { border: 1px solid var(--hairline); border-radius: var(--card); background: var(--field); overflow: hidden; }
.panel h2 { margin: 0; padding: 12px 14px 10px; font-size: 13px; font-weight: 600; color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 0 14px 10px; font-size: 12px; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.ms {
  display: block; width: 100%; padding: 9px 14px; border: 0; border-top: 1px solid var(--hairline);
  background: transparent; text-align: left;
}
.ms:hover { background: var(--wash); }
.ms[aria-pressed='true'] { background: var(--wash); box-shadow: inset 2px 0 0 var(--accent); }
.ms .row { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }
.ms .num { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 22px; }
.ms .name { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms[aria-pressed='true'] .name { font-weight: 600; }
.ms .count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

.tabs {
  display: flex; gap: 2px; margin-bottom: 14px; border-bottom: 1px solid var(--hairline);
  overflow-x: auto; scrollbar-width: none;
}
.tab { flex: none; white-space: nowrap; }
.tab {
  padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
  background: transparent; color: var(--muted); font-size: 13px;
}
.tab[aria-selected='true'] { color: var(--ink); font-weight: 600; border-bottom-color: var(--accent); }
.tab .n { margin-left: 4px; color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }

.filters { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-bottom: 14px; }
.group { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--hairline); border-radius: 8px; background: var(--field); }
.chip { padding: 4px 10px; border: 0; border-radius: var(--radius); background: transparent; color: var(--muted); font-size: 13px; }
.chip:hover { color: var(--ink); }
.chip[aria-pressed='true'] { background: var(--wash); color: var(--ink); font-weight: 600; }
.chip .n { margin-left: 4px; font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
.search { flex: 1 1 200px; position: relative; }
.search input {
  width: 100%; padding: 7px 10px 7px 32px; border: 1px solid var(--hairline); border-radius: 8px;
  background: var(--field); color: var(--ink); font: inherit; font-size: 13px; caret-color: var(--accent);
}
.search input:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
.search svg { position: absolute; left: 10px; top: 50%; translate: 0 -50%; width: 14px; height: 14px; }
.clear { padding: 4px 8px; border: 0; background: transparent; color: var(--muted); font-size: 13px; text-decoration: underline; text-underline-offset: 2px; }

.mgroup { margin-bottom: 22px; }
.mgroup h3 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.mgroup h3 .num { color: var(--muted); font-weight: 500; }
.mgroup h3 .count { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 400; white-space: nowrap; font-variant-numeric: tabular-nums; }
.items { border: 1px solid var(--hairline); border-radius: var(--card); background: var(--field); overflow: hidden; }
.item + .item { border-top: 1px solid var(--hairline); }
.item > button {
  display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: start;
  width: 100%; padding: 11px 14px; border: 0; background: transparent; text-align: left;
}
.item > button:hover { background: var(--wash); }
.item .title { font-size: 14px; }
.item[data-status='done'] .title { color: var(--muted); }
.item .badge { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; letter-spacing: 0.01em; }
.tags { display: flex; gap: 6px; align-items: center; padding-top: 1px; }
.size {
  min-width: 26px; padding: 0 6px; border: 1px solid var(--hairline); border-radius: var(--radius);
  font-size: 11px; font-weight: 600; text-align: center; color: var(--muted); line-height: 18px;
}
.chev { width: 14px; height: 14px; transition: rotate 120ms ease-out; }
.item.open .chev { rotate: 90deg; }
.icon { width: 18px; height: 18px; margin-top: 1px; }
.details { padding: 0 14px 14px 42px; color: var(--ink); font-size: 13px; }
.details p { margin: 0 0 8px; }
.details ul { margin: 0 0 8px; padding-left: 18px; }
.details li { margin-bottom: 4px; }
.details .meta { margin-top: 10px; color: var(--muted); font-size: 12px; }
.details summary { cursor: pointer; color: var(--muted); font-size: 12px; margin: 6px 0; }
.details details[open] summary { margin-bottom: 8px; }
.table { overflow-x: auto; margin: 0 0 8px; }
table { border-collapse: collapse; font-size: 12px; }
th, td { padding: 5px 8px; border: 1px solid var(--hairline); text-align: left; vertical-align: top; }
th { background: var(--wash); font-weight: 600; }

.cards { display: grid; gap: 10px; }
.card { padding: 12px 14px; border: 1px solid var(--hairline); border-radius: var(--card); background: var(--field); font-size: 13px; }
.card h4 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.card h4 .size { margin-left: auto; }
.card p { margin: 0; color: var(--ink); }
.card.decided { opacity: 0.62; }
.card.decided h4 { text-decoration: line-through; text-decoration-color: var(--ghost); }
.note { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.empty { padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--hairline); border-radius: var(--card); }

.tip {
  position: fixed; z-index: 10; max-width: 320px; padding: 8px 10px; border: 1px solid var(--hairline);
  border-radius: 8px; background: var(--field); box-shadow: var(--shadow); font-size: 12px; pointer-events: none;
}
.tip strong { display: block; margin-bottom: 4px; font-size: 12px; }
.tip ul { margin: 0; padding-left: 16px; color: var(--muted); }
.tip[hidden] { display: none; }

@media (max-width: 920px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  aside { position: static; }
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .wrap { padding: 20px 16px 48px; }
  .details { padding-left: 14px; }
}
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
@media (forced-colors: active) {
  .seg-done { background: Highlight; } .seg-progress { background: CanvasText; } .seg-open { background: GrayText; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>BetterSoundCloud backlog</h1>
      <p class="sub" id="generated"></p>
    </div>
    <div class="overall" id="overall"></div>
  </header>
  <section class="tiles" id="tiles" aria-label="At a glance"></section>
  <div class="layout">
    <aside>
      <div class="panel">
        <h2>Milestones</h2>
        <div class="legend" aria-hidden="true">
          <span><i class="seg-done"></i>Done</span><span><i class="seg-progress"></i>In progress</span><span><i class="seg-open"></i>Open</span>
        </div>
        <div id="milestones"></div>
      </div>
    </aside>
    <main>
      <div class="tabs" role="tablist" id="tabs"></div>
      <div id="view"></div>
    </main>
  </div>
</div>
<div class="tip" id="tip" hidden></div>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById('data').textContent)
  const STATUS = { done: 'Done', progress: 'In progress', open: 'Open' }
  const ICONS = {
    done: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="var(--accent)"/><path d="m8 12.5 2.7 2.7L16 9.8" fill="none" stroke="var(--field)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    progress: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="var(--muted)" stroke-width="1.6"/><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="var(--muted)"/></svg>',
    open: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="var(--ghost)" stroke-width="1.6"/></svg>'
  }
  const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const SIZES = ['S', 'M', 'L', 'XL']
  const all = data.milestones.flatMap((m) => m.items.map((item) => ({ ...item, milestone: m.number })))
  const state = { tab: 'backlog', status: 'all', sizes: new Set(), milestone: null, query: '', open: new Set() }
  const count = (items, status) => items.filter((i) => i.status === status).length
  const $ = (id) => document.getElementById(id)

  // ── Header and tiles ──
  const when = new Date(data.generated)
  $('generated').innerHTML = 'From <code>docs/TODO.md</code> · ' + when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + ' · <code>npm run todo</code> to refresh'
  const totals = { done: count(all, 'done'), progress: count(all, 'progress'), open: count(all, 'open') }
  $('overall').innerHTML =
    '<div class="figures"><span><strong>' + totals.done + '</strong> of ' + all.length + ' items done</span><span><strong>' +
    Math.round((totals.done / all.length) * 100) + '%</strong></span></div>' + bar(all, 'big', 'All milestones')
  const waiting = data.decisions.filter((d) => !d.decided)
  const openSizes = SIZES.map((s) => s + ' ' + all.filter((i) => i.status !== 'done' && i.effort === s).length).join(' · ')
  $('tiles').innerHTML = [
    tile('done', 'Done', totals.done, 'of ' + all.length + ' backlog items'),
    tile('progress', 'In progress', totals.progress, 'part built or part verified'),
    tile('open', 'Open', totals.open, 'by size: ' + openSizes),
    '<button class="tile" data-tab="decisions"><span class="label">Your decisions</span><span class="value">' + waiting.length +
      '</span><span class="hint">waiting on you · ' + (data.decisions.length - waiting.length) + ' settled</span></button>'
  ].join('')
  function tile(status, label, value, hint) {
    return '<button class="tile" data-status="' + status + '"><span class="label">' + ICONS[status].replace('class="icon"', 'class="icon" style="width:14px;height:14px"') +
      label + '</span><span class="value">' + value + '</span><span class="hint">' + hint + '</span></button>'
  }
  $('tiles').addEventListener('click', (e) => {
    const t = e.target.closest('.tile')
    if (!t) return
    if (t.dataset.tab) { state.tab = t.dataset.tab } else { state.tab = 'backlog'; state.status = t.dataset.status; state.milestone = null }
    render()
  })

  // ── Bars, with a tooltip listing what each part holds ──
  function bar(items, size, label) {
    const parts = ['done', 'progress', 'open'].map((s) => [s, items.filter((i) => i.status === s)]).filter(([, list]) => list.length)
    return '<div class="bar ' + (size || '') + '" role="img" aria-label="' + label + ': ' +
      parts.map(([s, list]) => list.length + ' ' + STATUS[s].toLowerCase()).join(', ') + '">' +
      parts.map(([s, list]) => '<span class="seg-' + s + '" style="flex:' + list.length + '" data-tip="' + s + '" data-titles="' +
        encodeURIComponent(JSON.stringify(list.map((i) => i.title))) + '"></span>').join('') + '</div>'
  }
  const tip = $('tip')
  document.addEventListener('pointermove', (e) => {
    const seg = e.target.closest && e.target.closest('[data-tip]')
    if (!seg) { tip.hidden = true; return }
    const titles = JSON.parse(decodeURIComponent(seg.dataset.titles))
    const shown = titles.slice(0, 8)
    tip.innerHTML = '<strong>' + STATUS[seg.dataset.tip] + ': ' + titles.length + '</strong><ul>' +
      shown.map((t) => '<li>' + t + '</li>').join('') + (titles.length > shown.length ? '<li>and ' + (titles.length - shown.length) + ' more</li>' : '') + '</ul>'
    tip.hidden = false
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8)
    const y = e.clientY + 18 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 18
    tip.style.left = x + 'px'; tip.style.top = y + 'px'
  })

  // ── Milestones ──
  $('milestones').innerHTML = data.milestones.map((m) => {
    const done = count(m.items, 'done')
    return '<button class="ms" data-ms="' + m.number + '" aria-pressed="false"><span class="row"><span class="num">M' + m.number +
      '</span><span class="name" title="' + m.title.replace(/<[^>]+>/g, '') + '">' + m.title + '</span><span class="count">' + done + '/' + m.items.length +
      '</span></span>' + bar(m.items, '', 'Milestone ' + m.number) + '</button>'
  }).join('')
  $('milestones').addEventListener('click', (e) => {
    const b = e.target.closest('.ms')
    if (!b) return
    const n = Number(b.dataset.ms)
    state.milestone = state.milestone === n ? null : n
    state.tab = 'backlog'
    render()
    if (state.milestone !== null) document.querySelector('.mgroup')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  // ── Tabs ──
  const TABS = [
    ['backlog', 'Backlog', all.length],
    ['decisions', 'Decisions', waiting.length],
    ['future', 'Future ideas', data.future.length],
    ['declined', 'Declined', data.declined.length],
    ['before', 'Done before the backlog', data.before.length]
  ]
  $('tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab')
    if (t) { state.tab = t.dataset.tab; render() }
  })

  // ── The view ──
  function filtered() {
    const q = state.query.trim().toLowerCase()
    return all.filter((i) =>
      (state.status === 'all' || i.status === state.status) &&
      (state.sizes.size === 0 || state.sizes.has(i.effort)) &&
      (state.milestone === null || i.milestone === state.milestone) &&
      (!q || i.text.includes(q)))
  }

  function backlogView() {
    const inScope = all.filter((i) => state.milestone === null || i.milestone === state.milestone)
    const items = filtered()
    const statusChips = ['all', 'open', 'progress', 'done'].map((s) =>
      '<button class="chip" data-status="' + s + '" aria-pressed="' + (state.status === s) + '">' + (s === 'all' ? 'All' : STATUS[s]) +
      '<span class="n">' + (s === 'all' ? inScope.length : count(inScope, s)) + '</span></button>').join('')
    const sizeChips = SIZES.map((s) => '<button class="chip" data-size="' + s + '" aria-pressed="' + state.sizes.has(s) + '" title="Effort ' + s + '">' + s + '</button>').join('')
    const filtering = state.status !== 'all' || state.sizes.size || state.milestone !== null || state.query
    let html = '<div class="filters"><div class="group" role="group" aria-label="Status">' + statusChips + '</div>' +
      '<div class="group" role="group" aria-label="Size">' + sizeChips + '</div>' +
      '<label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="var(--muted)" stroke-width="1.8"/><path d="m16 16 4 4" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '<input id="q" type="search" placeholder="Search titles and notes" aria-label="Search" value="' + state.query.replace(/"/g, '&quot;') + '"></label>' +
      (filtering ? '<button class="clear" id="clear">Clear filters</button>' : '') + '</div>'
    if (!items.length) return html + '<div class="empty">Nothing matches these filters.</div>'
    for (const m of data.milestones) {
      const list = items.filter((i) => i.milestone === m.number)
      if (!list.length) continue
      html += '<section class="mgroup"><h3><span class="num">M' + m.number + '</span><span>' + m.title + '</span><span class="count">' +
        count(m.items, 'done') + ' of ' + m.items.length + ' done</span></h3><div class="items">' +
        list.map(itemHtml).join('') + '</div></section>'
    }
    return html
  }

  function itemHtml(i) {
    const id = i.milestone + ':' + i.title
    const open = state.open.has(id)
    const details = open ? '<div class="details" id="d-' + encodeURIComponent(id) + '">' + (i.now || '') +
      (i.original ? (i.now ? '<details><summary>Original plan</summary>' + i.original + '</details>' : i.original) : '') +
      '<p class="meta">' + [STATUS[i.status], i.effort && 'size ' + i.effort, i.source && 'from ' + i.source].filter(Boolean).join(' · ') +
      (i.evidence ? '<br>Evidence: ' + i.evidence : '') + '</p></div>' : ''
    return '<div class="item' + (open ? ' open' : '') + '" data-status="' + i.status + '"><button aria-expanded="' + open + '" data-item="' + encodeURIComponent(id) + '">' +
      ICONS[i.status] + '<span><span class="title">' + i.title + '</span>' + (i.caption ? '<span class="badge">' + i.caption + '</span>' : '') +
      '</span><span class="tags">' + (i.effort ? '<span class="size" title="Effort">' + i.effort + '</span>' : '') + CHEVRON + '</span></button>' + details + '</div>'
  }

  function cardsView(list, note, withSettled) {
    const cards = (withSettled ? list : list.filter((c) => !c.decided))
    return '<p class="note">' + note + '</p><div class="cards">' + cards.map((c) =>
      '<article class="card' + (c.decided ? ' decided' : '') + '">' +
      (c.title || c.effort ? '<h4>' + c.title + (c.effort ? '<span class="size">' + c.effort + '</span>' : '') + '</h4>' : '') +
      '<p>' + c.html + '</p></article>').join('') + '</div>'
  }

  function render() {
    $('tabs').innerHTML = TABS.map(([key, label, n]) =>
      '<button class="tab" role="tab" data-tab="' + key + '" aria-selected="' + (state.tab === key) + '">' + label + '<span class="n">' + n + '</span></button>').join('')
    document.querySelectorAll('.ms').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ms) === state.milestone)))
    const view = $('view')
    if (state.tab === 'backlog') view.innerHTML = backlogView()
    else if (state.tab === 'decisions') view.innerHTML = cardsView(data.decisions, 'Waiting on you first; settled ones are struck through below them.', true)
    else if (state.tab === 'future') view.innerHTML = cardsView(data.future, 'After 1.0, not parity work. Nothing here is scheduled.', true)
    else if (state.tab === 'declined') view.innerHTML = cardsView(data.declined, 'Recorded so they are not proposed again, with the reasons.', true)
    else view.innerHTML = cardsView(data.before, 'Finished before the backlog was written.', true)
    const q = $('q')
    if (q && document.activeElement?.id !== 'q' && state.focusSearch) { q.focus(); q.setSelectionRange(q.value.length, q.value.length) }
  }

  $('view').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip')
    if (chip?.dataset.status) { state.status = chip.dataset.status; render(); return }
    if (chip?.dataset.size) { const s = chip.dataset.size; state.sizes.has(s) ? state.sizes.delete(s) : state.sizes.add(s); render(); return }
    if (e.target.closest('#clear')) { state.status = 'all'; state.sizes.clear(); state.milestone = null; state.query = ''; render(); return }
    const item = e.target.closest('[data-item]')
    if (item) { const id = decodeURIComponent(item.dataset.item); state.open.has(id) ? state.open.delete(id) : state.open.add(id); render()
      document.querySelector('[data-item="' + item.dataset.item + '"]')?.focus() }
  })
  $('view').addEventListener('input', (e) => {
    if (e.target.id !== 'q') return
    state.query = e.target.value
    state.focusSearch = true
    render()
    state.focusSearch = false
  })
  // Sort the decisions so the ones waiting on you come first.
  data.decisions.sort((a, b) => Number(a.decided) - Number(b.decided))
  render()
})()
</script>
</body>
</html>
`

writeFileSync(OUTPUT, page)
const counts = milestones
  .flatMap((m) => m.items)
  .reduce((acc, i) => ((acc[i.status] = (acc[i.status] ?? 0) + 1), acc), {})
console.log(
  `wrote ${OUTPUT}: ${milestones.length} milestones, ${counts.done ?? 0} done, ${counts.progress ?? 0} in progress, ${counts.open ?? 0} open`
)

if (process.argv.includes('--open')) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', OUTPUT]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [OUTPUT]]
  spawn(command, args, { stdio: 'ignore', detached: true }).unref()
}
