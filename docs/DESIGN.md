---
name: BetterSoundCloud
description: The quiet frame around SoundCloud — a 32px chrome that holds someone else's app without competing with it.
colors:
  bg-primary: '#f2f2f2'
  bg-secondary: '#ffffff'
  bg-hover: 'rgb(0 0 0 / 8%)'
  text-primary: '#1a1a1a'
  text-secondary: '#5c5c5c'
  text-disabled: '#a8a8a8'
  border: 'rgb(0 0 0 / 12%)'
  accent: '#e64d00'
  focus: 'var(--bsc-accent)'
  danger: '#d33'
  scrim: 'rgb(0 0 0 / 45%)'
typography:
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '15px'
    fontWeight: 600
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '14px'
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 400
  explanation:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
  overline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '11px'
    fontWeight: 600
    letterSpacing: '0.03em'
rounded:
  sm: '6px'
  md: '10px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
components:
  button-chrome:
    backgroundColor: 'transparent'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    width: '30px'
    height: '26px'
  button-chrome-hover:
    backgroundColor: '{colors.bg-hover}'
  button-chrome-disabled:
    textColor: '{colors.text-disabled}'
  button-close-hover:
    backgroundColor: '{colors.danger}'
    textColor: '#ffffff'
  nav-item:
    backgroundColor: 'transparent'
    textColor: '{colors.text-secondary}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '7px 10px'
  nav-item-active:
    backgroundColor: '{colors.bg-hover}'
    textColor: '{colors.text-primary}'
  field:
    backgroundColor: '{colors.bg-secondary}'
    textColor: '{colors.text-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '6px 8px'
  settings-page:
    backgroundColor: '{colors.bg-primary}'
    textColor: '{colors.text-primary}'
  settings-sidebar:
    backgroundColor: '{colors.bg-primary}'
    width: '220px'
  settings-search:
    backgroundColor: '{colors.bg-secondary}'
    textColor: '{colors.text-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    height: '30px'
  switch:
    backgroundColor: '{colors.bg-secondary}'
    rounded: '{rounded.sm}'
    width: '34px'
    height: '20px'
  switch-on:
    backgroundColor: '{colors.accent}'
  picture-tile:
    backgroundColor: 'transparent'
    rounded: '{rounded.sm}'
    padding: '3px'
  setting-figure:
    width: '120px'
    height: '76px'
  theme-card:
    textColor: '{colors.text-primary}'
    typography: '{typography.body}'
    width: '240px'
  discord-card:
    backgroundColor: '{colors.bg-secondary}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    padding: '12px'
    width: '340px'
---

# Design System: BetterSoundCloud

## Overview

**Creative North Star: "The Quiet Frame"**

BetterSoundCloud is a frame around someone else's picture. SoundCloud's own web app renders
every piece of music UI — the player, the waveforms, the artwork, the navigation — inside a
content view that this design system deliberately never touches. What we own is a 32px strip
along the top, a settings page that stands in for SoundCloud's below it, and future
overlays. That is the entire canvas, and the frame's job is to hold the picture without
competing with it.

This produces a system that is almost aggressively restrained. There is no display type, no
hero, no imagery, no gradient, and no decorative colour anywhere. Controls are transparent
until you hover them. The largest text in the product is 15px, outside two named exceptions
for content read at a distance: lyric lines, and the full-screen showcase. The accent appears only where
something is focused, selected, on, or changed from its default, and in a slider's fill up to its
value. A user should be able to look at this app all day and
never notice the chrome — and then find every control exactly where they left it the moment
they reach for one.

The restraint is architectural before it is aesthetic. Our chrome lives outside SoundCloud's
document precisely so their releases cannot break it, and that same separation is why the frame
must not imitate their surface language: two competing music UIs stacked in one window would
read as a skin, not a client. Depth follows the same logic — surfaces are flat and separated by
hairline borders, and a shadow appears only when something floats above the app and takes over
input.

**Key Characteristics:**

- One 32px chrome strip; nothing else is permanently on screen
- Flat at rest — borders separate, shadows signal modality
- Two radii, two shadows, one type family, one accent
- Controls invisible until hovered; icons are 15px stroked outlines
- Every colour defined twice, light and dark, and never hard-coded outside the token file
- Honesty rendered visually: unbuilt features appear disabled and labelled, never functional-looking

## Colors

A neutral grey system carrying a single inherited accent. Every token is defined twice — a
light default on `:root` and a dark override under `prefers-color-scheme: dark` — and the
frontmatter above records the light default.

### Primary

- **SoundCloud Orange** (`#e64d00` / `#f50`): The accent, inherited from the host application
  rather than invented for this one. It signals kinship — this is a SoundCloud client, not a
  separate product wearing SoundCloud as a data source. It appears on focus rings, a switch that is
  on, the ring round a chosen picture tile or theme card, the mark beside a changed setting and a
  slider's fill, and nowhere else. Dark mode uses SoundCloud's own `#f50` (5.8:1 on Shell
  Grey); light mode deepens it one step, because `#f50` is only 2.86:1 on `#f2f2f2`, under the 3:1
  a focus ring or a state mark needs (measured 2026-10-29, pinned by a test). SoundCloud's page
  keeps its own orange either way.
- **Focus** (`--bsc-focus`): the keyboard focus ring. The accent, unless a theme sets it apart:
  a theme whose accent is meant to be quiet must still show where the keyboard is, at 3:1.

### Neutral

The greys carry the entire interface. Each pair is light / dark.

- **Shell Grey** (`#f2f2f2` / `#121212`): The chrome background and the Settings page.
  The surface the user actually looks at.
- **Field White** (`#ffffff` / `#1c1c1c`): One step of separation from the shell, used for
  inputs and selects so a control reads as inset rather than painted on.
- **Ink** (`#1a1a1a` / `#f2f2f2`): Primary text and active icon strokes.
- **Muted Ink** (`#5c5c5c` / `#a0a0a0`): Secondary text — help copy, the window title, inactive
  navigation items.
- **Ghost Ink** (`#a8a8a8` / `#5c5c5c`): Disabled controls and the "Not implemented yet" note.
  Note the pair inverts: what is muted in light is disabled in dark and vice versa.
- **Hairline** (`rgb(0 0 0 / 12%)` / `rgb(255 255 255 / 14%)`): Every divider and control
  border. Alpha, not solid, so it works over any surface.
- **Hover Wash** (`rgb(0 0 0 / 8%)` / `rgb(255 255 255 / 10%)`): The only hover treatment in the
  system. Alpha for the same reason.

### Tertiary

- **Danger Red** (`#d33`): Reserved entirely for the close button's hover state, where it turns
  a red field with white glyph. It is the one moment of saturated colour in the product, and it
  is a warning, not decoration.
- **Scrim** (`rgb(0 0 0 / 45%)`): Dims SoundCloud behind a dialog — the Go to URL prompt, the
  "not responding" dialog. Not a surface — a modality signal.

### Named Rules

**The Borrowed Accent Rule.** The accent is SoundCloud's, not ours. It marks state — focused,
selected, on — and never decorates. If orange appears somewhere that is not a state, remove it.

**The Two-Mode Rule.** Every colour exists twice and is consumed only through a
`--bsc-*` custom property. A literal hex outside `tokens.css` is a bug: it will be correct in
one mode and wrong in the other. The sanctioned exceptions are `#fff` on the danger hover and on
the knob of a switch that is on (white on the accent, like the close button's glyph on its red),
which must stay white in both modes; and the pictures of a mode on the Light or dark tiles, which
draw that mode's own values from `tokens.css` whatever the panel is in (Theme pictures).

## Typography

**Display Font:** none. This system has no display tier.
**Body Font:** the platform UI stack — `system-ui, -apple-system, 'Segoe UI', Roboto,
'Helvetica Neue', Arial, sans-serif`
**Label/Mono Font:** none.

**Character:** Deliberately anonymous. The chrome uses whatever the operating system uses, so it
reads as part of the window rather than as branded material. A webfont here would be both a
personality the frame should not have and a runtime network load the renderer's CSP forbids.

### Hierarchy

- **Title** (600, 15px): A Settings section's title. The largest text in the entire product.
- **Body** (400, 14px): Setting names — the primary reading size in the panel.
- **Label** (400, 13px): Navigation items, inputs, selects. The dense working tier. At 600 in
  Muted Ink with a Hairline beneath, it is the group heading inside a Settings section.
- **Explanation** (400, 13px, line-height 1.45, at most 70ch): What a setting does, under its
  name in every Settings row and under each search match. It is read, not glanced at, so it sits
  one step above Caption (it was the 12px Caption until 2026-11-14). Always Muted Ink.
- **Caption** (400, 12px, line-height 1.4): When a setting takes effect, status lines and launch
  notices, the version at the foot of the Settings sidebar, the Reset beside a changed setting's name, and the window title in
  the chrome strip (500 weight there). Always Muted Ink.
- **Overline** (600, 11px, +0.03em, uppercase): One use only — the "Not implemented yet" badge.

### Named Rules

**The 15px Ceiling Rule.** Nothing in BetterSoundCloud's own UI is larger than 15px. The frame
has no headlines because the frame has nothing to announce. If a surface seems to need display
type, it probably belongs to SoundCloud's view, not ours.

**The Lyrics Exception** (approved 2026-10-28). One tier sits above the ceiling: **lyric lines, 20px,
line-height 1.4**, in the lyrics pane only. Lyrics are not chrome; they are the content of that
pane, read from arm's length while the listener's attention is elsewhere. Everything around them —
the pane's title, its captions, its buttons — keeps the 15px ceiling. The exception does not
transfer: no other surface may use it.

**The Showcase Exception** (approved 2026-10-28). The full-screen showcase is read from across a
room, so its **title block and lyric lines** go past the ceiling, sized from the screen (the smaller
of `vw` and `vh`, so wide and tall screens keep one proportion): the track title
`clamp(28px, min(3.2vw, 5.6vh), 64px)` at 600, line-height 1.06, −0.02em; the uploader beneath it,
part of the same block, `clamp(16px, min(1.3vw, 2.3vh), 26px)` in Muted Ink; lyric lines
`clamp(22px, min(2.2vw, 3.9vh), 44px)` at 600, line-height 1.22. Everything else there — the clock,
the hint, the credit, the close button — keeps the 15px ceiling. Like the Lyrics Exception, it does
not transfer.

**The Two Sentences Rule** (the maintainer's, 2026-11-14). A setting's explanation is one or two
short sentences, never a paragraph. When it takes effect is not part of it: that is the row's own
Caption note.

**The System Stack Rule.** No webfonts, ever. The chrome inherits the OS UI font so it belongs
to the window; the CSP on every renderer blocks remote font loads regardless.

## Layout

Two independent surfaces, each in its own view, never one page.

**The chrome strip** is a fixed 32px row: a flex line of `[back · forward · reload]`, a centred
elided title that takes the remaining space, and `[settings · minimize · maximize · close]` on
the right. It is a window drag region, and every interactive child opts back out with
`-webkit-app-region: no-drag`. It does not scroll, wrap, or change height at any window size.

**The settings page** covers everything below the 32px bar, which shows above it while it is
open even when the user hid it, so the window can always be moved and closed and the gear closes
it again. It is a two-column grid: a 220px sidebar, full height, beside the content. The content
is a 56px title row that stays put, then a scrolling column of rows up to 720px wide, 40px in
from the sidebar, with 56px of room under the last row. The search field's row is the title row's
56px, so the field and the title share a centre line. Only the column and, when it runs out of
room, the section list scroll; the page itself never does.

Spacing is an observed rhythm rather than an enforced scale: 2px between adjacent chrome
buttons, 4px in the chrome flex line, 8–12px inside controls, 16px inside the Prompt, and 40px
between the Settings sidebar and its column. Settings rows are 14px vertical padding with 24px
between the name and the control (the Background's sliders keep 12px), separated by
hairlines, with the last row's border removed.

A layout setting's row holds its drawing (120×76) between the text and the control, 24px from
each. Picture tiles sit 16px apart. The theme gallery is a grid of cards at least 240px wide, two
to a row in the 720px column, 18px between rows and 14px between cards: a picture of the whole
window needs the room.

### Named Rules

**The 32px Rule.** The chrome is 32px and never grows. Every new affordance either fits in that
strip, moves into settings, or becomes an overlay. Growing the frame steals from the picture.

## Elevation & Depth

**Flat at rest. Depth means modality.**

Surfaces do not float. Separation is done with 1px hairline borders and a single tonal step
between the shell and field colours — nothing in the chrome or the panel body carries a shadow.

A shadow appears in exactly one circumstance: something has floated above the application and
taken over input. Today that is the right-click menu, the Go to URL prompt and the "not
responding" dialog; tomorrow it is any dialog or overlay. The page-status surface and the
Settings page are deliberately not on that list: when they stand in for SoundCloud's page they
ARE the page, so they are flat. For a dialog, two things arrive together — a
scrim dimming everything behind, and a two-layer shadow under the floating surface. A
transient popup — the context menu — gets the shadow alone: it takes input, but any click
dismisses it, and dimming the page for something that brief would read as noise.

### Shadow Vocabulary

- **Overlay** (`box-shadow: 0 12px 40px rgb(0 0 0 / 35%), 0 2px 8px rgb(0 0 0 / 20%)`): The only
  shadow in the system. A wide ambient layer for separation from the page beneath, plus a tight
  contact layer so the card's edge stays crisp. Paired with the scrim on dialogs; alone on the
  context menu.

### Named Rules

**The Modality Rule.** Shadow is not decoration and not hierarchy — it means "this has taken
over input". A surface that does not block interaction does not get a shadow. If you reach for
elevation to make something look important, use a border and a tonal step instead.

**The Transient Rule.** The scrim marks a dialog, something the user has to finish or cancel.
A popup that any click closes — a menu — floats without one. If a surface needs a scrim to be
understood, it is a dialog and should behave like one.

## Shapes

Rectangles with two radii and nothing else.

- **6px** on every control: chrome buttons, navigation items, inputs, selects, the panel's close
  button, a switch's track, a picture tile's frame. Enough to read as a soft target, not enough to read as a pill.
- **10px** on the surfaces that float: the context menu and the Go to URL prompt. The menu's
  10px is its 6px item radius plus its 4px padding, so the corners are concentric rather than a
  third number. Settings is a page, not a floating surface, so it has no corner at all.
- **3px** on the knob of a switch and of a slider, and it is a derivation, not a third radius: a
  switch's 6px track less the 3px between it and the knob, so the corners are concentric, as the
  menu's 10 = 6 + 4 is (2026-11-14). The line drawings give their window the same corners.
- **Square** on a picture of a page: a theme card's picture and the Background tile's small page
  are prints, like the showcase's sleeve, so they have no corners; the tile frame round them keeps
  the control radius.

There are no pills, no circles, no asymmetric corners, no clipping shapes, and no decorative
geometry anywhere. Borders are always 1px and always the Hairline alpha token, with two that carry state: a switch
that is off is outlined in Muted Ink, and a picture tile's frame is a 2px ring (Theme pictures).

Icons are a matched family: 24-unit viewBox rendered at 15×15, `fill: none`, `stroke:
currentcolor`, 1.6 stroke width (1.8 on the panel's close button), round caps and joins. They
inherit colour from their button, which is what makes a single hover rule cover both the field
and the glyph.

### Named Rules

**The Two Radii Rule.** 6px for anything you interact with, 10px for anything that floats. A
third radius is a new concept — justify it or drop it.

## Components

### Buttons

Chrome buttons are the signature component and set the tone for everything else.

- **Shape:** softly rounded (6px), 30×26px — deliberately small, sized for a 32px strip.
- **Rest:** fully transparent background, glyph inheriting the current text colour. Invisible
  until sought.
- **Hover:** the Hover Wash alpha fills the rounded rect. Nothing moves, nothing scales.
- **Focus:** a 2px outline in `--bsc-focus` (the accent), inset by 2px so it never clips against
  a neighbour.
- **Reload becomes Stop** while SoundCloud's page itself loads: the same button, its glyph a
  cross and its label "Stop loading", so keyboard focus survives the change. A move inside the
  page, or a frame within it such as the sign-in box, is not "loading".
- **Disabled:** glyph drops to Ghost Ink; no hover response. Used for back/forward when there is
  no history.
- **Close, hover:** the one exception — the field fills Danger Red and the glyph turns white.
- **Cursor:** `default`, not `pointer`. These are window chrome, not web links.

### Navigation

The Settings sidebar — 220px, full height, a Hairline down its right edge: the search field at
its top (Settings search, below), then a vertical stack of section buttons, 2px apart, then the
foot. Each section has a 15px line icon beside its name, 10px from it, in the system's icon style
(since 2026-11-14): the name is what is read, the icon what the eye finds. The name is always
there; it is not an icon rail.

- **Rest:** transparent, Muted Ink, 13px, left-aligned, 7px × 10px padding, 6px radius.
- **Hover:** Hover Wash.
- **Active:** Hover Wash plus Ink text at 600 weight. Weight, not colour, carries selection.
- Labels are written out, never derived from a key. Capitalising identifiers produced "Lastfm";
  the section list now stores real names.
- **While searching**, no section is shown as active: the column is showing matches, not a
  section.
- **The foot**, above a Hairline: only "BetterSoundCloud" and the version running, in tabular
  figures, 12px Muted Ink, as a quiet button with the Hover Wash and Ink on hover. It opens About,
  where the GitHub and Report a problem links moved (2026-11-14).

### Inputs / Fields

- **Style:** Field White background, 1px Hairline border, 6px radius, 6px × 8px padding, 13px
  text, 140px minimum width so a row of controls aligns down the right edge.
- **Unit:** a number that counts something ("%") shows its unit in 12px Muted Ink beside the
  field, and the field narrows to 120px so the control still spans 140px.
- **Slider:** a number that reads better dragged than typed (Glass tint, the Background's Blur
  and Strength), one style for every view, in `tokens.css`: a 4px square-ended rule, the accent up
  to the value (`--bsc-range-fill`, which the view sets) and Ghost Ink beyond it, and a 12px knob
  in the accent with the switch's 3px corners, ringed 2px in Shell Grey. It replaces Chromium's
  round knob on a pill (2026-11-14). Disabled, rule and knob go to Ghost Ink. In a settings row it
  is 180px, then its value with its unit in a 48px column, 13px tabular Muted Ink, right-aligned.
  The value follows the drag; it is stored on release. Its focus ring sits 2px outside it.
- **Search:** the Field at 30px tall in the Settings sidebar's 56px top row, with a 15px stroked
  magnifier inside its left edge in Muted Ink, the accent caret, and "Search settings" as its
  placeholder in Muted Ink. While it is empty and unfocused, a key chip at its right says
  "Ctrl+F" ("⌘F" on macOS); while it holds text, our own clear ✕ takes that place — a 22px button
  with the Hover Wash, a 15px stroked cross — instead of Chromium's.
- **Switch** (`Switch.svelte`, since 2026-11-14, the maintainer's choice after Windows' and
  Apple's settings): every on/off setting, in the schema's rows and the plugin rows. A real
  checkbox underneath with `role="switch"`. Squared, to keep the Two Radii Rule and no pills: a
  34×20 track at 6px, a 12px knob at 3px, 3px in from the track. Off: the track Field White,
  outlined in Muted Ink, with a Muted Ink knob on the left, as Windows draws it. On: the track in
  the accent, a white knob on the right. The knob slides over 120ms (Motion). Disabled: 50%
  opacity. Focus: the 2px ring, 2px outside. It applies at once; a setting that waits for a
  restart or a reload says so in its note.
- **Disabled:** 50% opacity and a `not-allowed` cursor, paired with the Overline badge in the
  label column.

### Cards / Containers

The surfaces that float: the context menu, the Go to URL prompt and the "not responding" dialog.

- **Corner Style:** 10px.
- **Background:** Shell Grey, opaque, over a scrimmed page for a dialog, over the page itself for
  the menu.
- **Border:** 1px Hairline, in addition to the shadow — the border is what keeps the edge legible
  in dark mode where the shadow largely disappears.
- **Internal Padding:** 16px in the Prompt, 4px in the menu.
- **Shadow Strategy:** the Overlay shadow, per Elevation & Depth.
- **Settings is not a card** (since 2026-11-14): it is a page, flat and opaque, with no corner,
  border, shadow or scrim of its own.

### Settings page

Settings (`src/renderer/settings/Settings.svelte`), in a view of its own covering everything
below our bar. It stands in for SoundCloud's page, like the page-status surface, rather than
floating over it.

- **Flat and opaque:** Shell Grey, no scrim, no shadow. Our 32px bar shows above it while it is
  open, even when the user hid the bar.
- **The title row:** 56px, the section's Title ("Search" while searching) 40px in from the
  sidebar, and the close button at the window's top right: 28px square, 6px radius, a 15px cross
  in Muted Ink, Danger Red with a white glyph on hover. The row stays put while the column scrolls
  and gains a Hairline beneath it once rows pass under it.
- **Rows:** the name (Body, line-height 1.4), the Explanation under it, then any timing note and
  status line at Caption size; the control at the column's right edge, level with the name. A
  Hairline between rows. The rows drawn by their own components — themes, the background,
  plugins, the reset rows, the sign-in import — use the same 13px Explanation. A layout setting's
  row carries its drawing (Theme pictures) before the control.
- **Group headings** inside a section, from the schema's `group` ("Window", "SoundCloud’s page",
  "Player", "With every theme"…): Label size at 600 in Muted Ink, a Hairline beneath, wherever the
  group changes from the row before. The same heading names the rows drawn by hand ("Your sign-in
  and data", "Moving around") and each section's matches in search.
- **A changed setting** (since 2026-11-14) is marked by a 2px accent bar in the gutter, 14px left
  of the row's text and as tall as it, and a "Reset" text button beside its name: 12px Muted Ink
  with the links' quiet underline, Ink on hover, its accessible name saying what it goes back to. This is
  VS Code's mark, the maintainer's explicit choice: the bar is a state, so it is the accent, and it
  marks a changed setting and nothing else — never a card, a notice or a heading.
- **Restart now / Reload SoundCloud:** a setting that waits for a restart or a reload, once
  changed, gets the Prompt's button at 13px under its timing note, which does it now.
- **Escape** clears a search first; with no search, it closes Settings.
- **Focus:** every control on the page has the 2px `--bsc-focus` ring: inset on buttons, fields
  and search matches, 2px outside on switches, sliders and links, 3px outside a picture tile's
  frame and 4px outside a theme card's.

### Settings search

The field at the top of the sidebar looks through the name and explanation of every setting,
every theme and plugin, each plugin's own settings (named "Visualizer: In the full-screen view"),
and the rows drawn by hand (the sign-in import, the reset buttons, the window's keys in
Shortcuts). A plugin's settings show only while it is on, so while it is off its match lands on the
plugin's switch, and its explanation ends "Shown once Visualizer is on." Every word typed must appear, in any order, ignoring case and
accents.

- **The matches take the column's place**, under the title "Search": a count line ("3 matches",
  Caption, tabular figures), then the matches grouped by section, each group under the
  group heading (13px, 600, Muted Ink, a Hairline beneath). A section with a match in a
  name comes first, and within a section, matches by name come first; otherwise the order is the
  sidebar's.
- **Each match is a row you press:** the name at 14px, its explanation beneath at 13px Muted Ink,
  a 15px chevron in Muted Ink at the right. The words searched for are 600 weight in Ink — weight,
  never the accent, which marks state. The Hover Wash on hover, reaching 12px past the column at
  the control radius so the text stays aligned; Hairlines between matches, inside that inset.
- **Nothing found:** "Nothing matches “…”." at 14px, 600, then one Explanation line saying what
  search looks through and suggesting a single word.
- **Choosing a match** opens its section and lands on its row, scrolled to the middle, with focus
  on its control (a radio group's chosen option, as Tab would land). When that control is
  disabled, the row itself takes focus, ringed 2px in `--bsc-focus` 4px outside it at the control
  radius, so the keyboard and a screen reader are where the eye is.
- **Keys:** Ctrl+F (⌘F) focuses and selects the field from anywhere on the page; Enter takes the
  first match; ↓ moves into the matches and ↑ / ↓ through them, ↑ from the first going back to the
  field; Escape clears, and a second Escape closes Settings.

### Context Menu

The right-click menu over SoundCloud's page. It lives in its own transparent view
(`src/renderer/context-menu`), so nothing here is a node in their document.

- **Surface:** Shell Grey, 1px Hairline, 10px radius, the Overlay shadow, no scrim. 4px inner
  padding, 208–320px wide, and it scrolls rather than clips when a window is shorter than it.
- **Placement:** top-left corner at the cursor; flipped to the other side of the cursor when it
  would run off an edge, never clamped so that it covers the click.
- **Note row:** one Caption line above the items, Muted Ink, ellipsized, saying which link,
  image or quoted text the menu is about — so "Copy link" says which link. Absent in a text
  field, where the field is the context.
- **Items:** 28px rows, 13px Ink label, a 15px outline glyph in Muted Ink on a 16px column, 6px
  radius. One highlight — the Hover Wash — driven by state, so the mouse and the keyboard can
  never show two. Keyboard focus adds the 2px accent outline on top. Disabled items drop to
  Ghost Ink and are skipped by the arrow keys. Separators are 1px Hairline with 4px × 8px
  margins.
- **Only items that can act appear.** "Copy clean link" is listed only when the link carries
  something to strip; "Inspect element" only in dev builds; Cut/Paste only in a text field.
- **Motion:** a 100ms fade with a 4px rise on open, none on close — a menu that lingers after a
  click reads as slow. Reduced motion removes the fade.
- **Cursor:** `default`, as on every chrome control.

### Prompt

The Go to URL prompt, and the model for any small dialog that asks for one thing.

- A 460px card at `top: 96px`, centred, 16px padding, the Overlay shadow, and — because it is a
  dialog — the scrim. It enters with the dialogs' 180ms fly (Motion).
- A Body-size label, then one Field with the accent caret and a transparent "Go" button
  beside it, then a Caption help line beneath that doubles as the error line. Errors are
  written in Ink, not red, and say what to try; the field's text is reselected so the next
  attempt overwrites it.

### Page status

What the app says while SoundCloud's page cannot be shown: Widevine setting up, the first page
loading, a failed load, a crash, Widevine failing, a hang. It lives in its own view over the
content area (`src/renderer/status`); every word comes from `describePageStatus` in
`src/shared/page-status.ts`, so the wording is tested rather than scattered through markup.

- **It only appears when there is something to say.** A launch whose first page arrives within a
  second shows nothing extra; that is every normal launch.
- **Standing in for the page** (every status but a hang): an opaque Shell Grey surface, flat, no
  shadow and no scrim — nothing is floating, there is simply no page behind it. One left-aligned
  column, `min(440px, 100%)`, sitting a little above centre. Our own 32px bar comes back while it
  shows, so the window can always be moved and closed.
- **Over the page** (a hang only): the Prompt's dialog — 460px card at `top: 96px`, scrim, the
  Overlay shadow, the 180ms fly. The frozen page stays visible behind it, because it may recover.
- **Content, top to bottom:** a Title, one Body paragraph in Muted Ink, an optional Caption
  detail line (the Chromium error code or the Widevine reason, selectable so it can be pasted
  into a bug report), the wait line when something is in progress, then the buttons.
- **Buttons:** the Prompt's "Go" button, 6px radius, Hairline border, 13px. The first one is the
  default and sits one tonal step forward on Field White; it holds focus, so Enter does the
  expected thing. Emphasis comes from the neutrals, never the accent. A button whose action is in
  progress says so in its label ("Trying again…") and goes to Ghost Ink.
- **Voice:** name the problem, then the way forward, in plain words. No exclamation marks, no
  "Oops". Promise an automatic retry only where one happens — a test pins that.
- **"Couldn't set up playback"** has three buttons: Restart BetterSoundCloud (the default, since it
  is the fix), Continue without Widevine, and Quit. Continuing brings back the auto-skip bug on
  purpose, so the body says what it costs, in the symptom the user would see ("greyed out and
  skip"), before anyone can press it. It also says SoundCloud opens by itself once the download
  finishes, which it does.

### Scrollbars

One treatment across both surfaces — our own panels and the SoundCloud view.

- **Width:** 2px (Chrome's default is 15px, which reads as a grey slab down the side of the
  page and collides with the window buttons drawn over SoundCloud's header).
- **Track and corner:** fully transparent. Only the thumb is ever visible.
- **Thumb:** 4px radius. `--bsc-text-disabled` in our own UI; mid-grey alpha
  (`rgb(128 128 128 / 40%)`) on SoundCloud's page, because our tokens do not exist on their
  origin and their theme may be either light or dark.
- **Hover and active:** the accent. With a slider's fill, this is where the accent appears
  outside focus, selection and "on", and it still obeys the Borrowed Accent Rule — grabbing a
  scrollbar is a state, not decoration.

### Lyrics pane

Synced lyrics, docked at the right of SoundCloud's page (`src/renderer/lyrics`), from under its
header to above its play bar, so SoundCloud stays usable beside it and its player stays reachable
below. 360px wide, never more than two fifths of the window.

- **Flat, because it does not take over input**: Shell Grey, one 1px Hairline down its left edge,
  no shadow, no scrim. It is a pane, not a dialog.
- **Header**: the track's title (Title, 15px 600, ellipsized), the uploader in Caption beneath, and
  the Settings close button (Danger Red on hover).
- **Lines**: the Lyrics Exception's 20px. Every line is Muted Ink; the line being sung is Ink at 600. Weight and ink carry it — no accent, no bar, no glow, no scale. Colour changes over 160ms
  ease-out; nothing else moves but the scroll. The current line rests a third of the way down,
  reached with a smooth scroll. A pause between lines is a 24px Hairline rest that widens to 48px
  while current — never a glyph. Lines fade out under the header and footer (a 20px / 28px mask)
  rather than being cut.
- **Scrolling by hand** stops the following and shows "Back to the current line", the Prompt's
  button, bottom right of the lines; a new track resumes following.
- **Footer**: for timed lyrics, a "Timing" row — two chrome buttons (chevrons, "Earlier" /
  "Later", half a second each) around the offset in Caption tabular figures ("On time", "−1.0 s");
  then the credit, one Caption line: "From LRCLIB · “Track” by Artist", whose tooltip says what is
  sent to lrclib.net and when.
- **Every other state is words, left-aligned at the top**: Body for what happened, Caption for what
  it means — "Looking up lyrics…" (with the page-status wait line), "Instrumental.", "No lyrics
  found." (saying what was searched), "Couldn’t reach LRCLIB." (with "Try again"), "Nothing is
  playing." Untimed lyrics are shown in Ink, under one Caption line saying they will not follow the
  song.
- **Keyboard**: focused on open, so Escape closes it; the lines are a focusable region so they can
  be scrolled by keyboard; arrow keys and paging stop the following like the wheel does.
- **Reduced motion**: no smooth scroll, no colour transition, no wait line.

The player-bar lyrics button is pressed while the pane is open, and turns the accent — the one
state that button has. The showcase button beside it has no pressed state: the showcase covers it
while open.

### Showcase

The playing track as a record sleeve, over the whole screen (`src/renderer/showcase`): the
artwork as a square print on the left; its title, uploader and progress beside it like liner notes,
capitals level with the sleeve's top edge; the line being sung below them, resting on the sleeve's
bottom edge. On a tall screen the sleeve sits above the notes, at their width.

- **One flat colour behind it, taken from the artwork**: the hue that holds the most colour,
  deepened until Ink reads at 7:1 (AAA, for across a room). No blur, no gradient, no glow — the
  anti-reference stands; this is a colour, not the artwork smeared. The colour changes with the
  track over 900ms, so it is felt rather than seen. Before the artwork arrives, and for a sleeve
  with hardly any colour, it is dark Shell Grey or the sleeve's own grey. Its inks are computed
  for that colour and checked: Ink 7:1, Muted Ink 4.5:1; the showcase is always deep, in either
  mode, and follows no theme.
- **The sleeve**: square corners (a print has none), flat, with a hairline of Ink at 12% so a dark
  sleeve keeps its edge; empty while it loads or when there is none, at Ink 5%. A new artwork fades
  in over 320ms.
- **Progress** is a 2px rule, Ink over a faint track, with no knob — nothing here can seek. It
  glides through each second rather than stepping. The clock beside it is 15px tabular figures,
  elapsed in Ink and the length in Muted Ink; "Paused" in Muted Ink before it while paused.
- **Lyrics**: every line at the same 600 weight, so nothing re-wraps as the song moves; the current
  line is Ink, the ones to come Muted Ink, fading out below. The authored moment of the surface is
  the line change: the column moves up over 560ms ease-out (expo-like) as the sung line fades away.
  A pause between lines is a 2px rest that doubles in length while current — never a glyph. Only
  timed lyrics show; untimed or missing lyrics leave the space empty, and the pane is where to read
  them.
- **The only controls are at the corners**: "Press Esc to leave" and the settings close button at
  the top right, the "Lyrics from LRCLIB" credit at the bottom left. They fade (240ms) 2.5s after
  the pointer stops, with the cursor, and return on any movement or key; keyboard focus keeps them.
- **Nothing playing**: the empty sleeve, "Nothing is playing" at the title size in Muted Ink, and
  one line saying what to do.
- **Reduced motion**: no colour change, line movement, fade or glide; everything jumps.

### Visualizer

What SoundCloud plays, drawn as it plays (`src/renderer/lib/Visualizer.svelte`, drawn by
`visualizer-draw.ts`), from the built-in Visualizer plugin. Opt-in decoration: off until the
plugin is turned on, so it is the user's choice, like a theme — the anti-reference on consumer
music-app surface language stands for everything else. It lives in the showcase, which is already
the Experience surface; in a quiet strip standing on SoundCloud's player while browsing; and in a
view of its own over SoundCloud's page, which is an Experience surface too.

- **Flat ink on the room's colour.** The showcase's own Ink, mixed down: bars at 30%, peak marks
  at 70%, the waveform at 62%, the fringe at 42%. Decoration sits well under the text it shares
  the room with. No glow, no gradient, no blur, never the accent (it marks state).
- **Square ends**, like the sleeve, the progress rule and the lyric rests. A peak is a 2px rule
  that holds a moment, then falls back.
- **Bars** stand on the bottom margin, under the sleeve and its notes and exactly as wide as them,
  so the readout belongs to the record rather than to the screen: 64 bars, each 56% of its slot,
  no taller than the room below the sleeve.
- **Around the artwork** is a fringe, not a ring: 2px hairlines standing out from the sleeve's four
  edges, three to a band, blended between bands so the outline swells smoothly; bass at the bottom
  middle, treble at the top, mirrored left and right. A circle would cut into the notes, and thick
  bars round a square read as a chip's pins. No peak marks: they only cluttered it.
- **Waveform** is a flowing line, not an oscilloscope: a smooth curve through the band levels,
  mirrored above and below the middle of the bars' band, a 2px outline at 62% over a flat body at
  12%, its ends easing into the middle line. The raw wave jumped about with real music
  (2026-11-12); the levels move like the bars.
- **Motion is the music's**: a bar rises in about 40ms and falls over about 220ms, eased
  exponentially, so beats snap and decay like a meter. When the sound stops, everything falls and
  the drawing stops.
- **The strip above the player** floats: bars standing on the top edge of SoundCloud's player
  bar, over the bottom of the page, with no backdrop of their own (the maintainer asked for it on
  the player, not in it). SoundCloud's icon colours for the page's light or dark (white, or
  `#333`; the overlay exception). It is peripheral, so it stays quiet: Bars are 2px hairlines
  every 6px at 50%, blended between bands, with no peak marks, inset 16px like the controls;
  Waveform rises from the bar's edge, its body filled down to it (mirrored about a middle line it
  struck through the page's text). It steps aside the moment the pointer comes near it or the
  bar, and fades back in over 180ms once the pointer is well clear, so nothing under it is ever
  out of reach. It goes whenever it would be empty: nothing loaded, the page hidden, or the sound
  engine stepped aside.
- **The view of its own** is the visualizer as the subject: a room over SoundCloud's page area,
  painted from the artwork like the showcase (one flat colour, its inks), the look large across it
  and drawn at twice the decoration's strength (bars 60%, peaks and the line at full ink). Bars
  stand on a margin above the bottom, up to two thirds of the room; the waveform runs through the
  middle. At the top, a two-button switch (13px labels, the showing look in ink on a 14% wash,
  never the accent, which would fight the artwork's colour), the hint "← → change the look · Esc
  closes" (12px, muted) and ✕ with the danger hover. The controls and the cursor go after 2.5s
  still, as in the showcase. Nothing loaded: "Nothing is playing" and what to do, in the middle;
  paused: "Paused". Its player-bar button is a three-bar meter, first in the row so the others
  never move, pressed while open.
- **MilkDrop** is the one look that is not ours: MilkDrop's own presets, full colour, filling the
  room, in the full-screen view and the view of its own (never the strip). In the full-screen view
  it is multiplied into the room's colour, so nothing it draws is lighter than the room and the
  text keeps its 7:1: moving light and shade in the artwork's colour, never a light behind the
  words. In the view of its own it is the subject, at full strength; the controls stand on a plate
  of the room's colour (10px radius and the one shadow: it floats and takes input), with the
  preset's name in ink and two chevron buttons (↑ ↓, the same keys); paused, it sinks into the
  room like the full-screen view's, so "Paused" reads; with nothing loaded it is out of sight. It
  surfaces over 600ms when it first draws; MilkDrop's own blends (2.7s, 1s when asked) do the
  rest.
- **Reduced motion removes it**, rather than freezing it (a still visualizer reads as stuck, as a
  still wait line does), and the plugin's row says "Hidden" and why.
- Decorative: the canvas is hidden from assistive technology and takes no pointer.

### Equaliser curve

An `equaliser` plugin setting (`src/renderer/settings/EqualiserEditor.svelte`), set in under its
plugin's row like every plugin setting. Spotify's interaction without Spotify's costume: no green,
no gradient.

- **The bar**: "Preset" and the settings select (Field White) on the left, the Prompt's "Reset"
  button on the right, disabled while flat. A curve that matches no preset reads "Custom".
- **The plot**, 168px tall beside a 44px scale ("+12 dB", "0", "−12 dB" in 12px tabular Muted
  Ink): Hairline edges, a Hairline column per band, the 0 dB line in Ghost Ink. Bands sit evenly
  spaced, as on a hi-fi; between two bands, x runs in log-frequency.
- **The curve is the sound.** A 1.6px Ink line, drawn from the summed response of the exact filters
  the plugin asks for (Web Audio's own coefficients), over a flat 7% Ink wash between it and 0 dB.
  The filters are tuned so it passes through every point; where neighbouring bands interact, the
  line shows the truth rather than a pleasing spline.
- **The points** are 12px Ink dots with a 2px ring of the panel's colour, each inside a 28px
  target that is a real `role="slider"` (vertical): drag anywhere in a band's column, Tab between
  bands, arrows ±1 dB (Shift ±3), Page ±3, Home and End for the limits, Delete or a double-click
  for 0. Hover or drag grows the dot by 2px. Focus: the 2px focus ring round the target.
- **The value** of the point being moved or focused floats above it in a Field White tag with a
  Hairline, 12px tabular ("+6 dB", with a real minus sign), below it near the top.
- **The note** under the plot, Caption, only while something is boosted: "Everything plays 6.4 dB
  quieter, to make room for the boost without distortion."
- The accent appears only as focus. The plugin's own line says whether the engine is working.

### Pitch ruler

A `pitch` plugin setting (`src/renderer/settings/PitchEditor.svelte`), the Equaliser's sibling:
the same bar, the same point, the same tag, so the two plugins read as one family.

- **The bar**: what it is set to on the left, in words, 13px ("Up 3 semitones", "Down an octave";
  "Original key" in Muted Ink), and the Prompt's "Reset" on the right, disabled at 0.
- **The ruler**, a Hairline baseline across the row with a 1px Hairline tick per semitone: 7px
  tall, 14px at 0 and at the octaves. The 0 tick is Ghost Ink, like the Equaliser's 0 dB line:
  where the song's own key is. Beneath it, 12px tabular Muted Ink: "−12", "0", "+12".
- **The shift is counted, not just read.** A 2px Ink line runs along the baseline from 0 to the
  marker, and the ticks it passes turn Muted Ink: three dark ticks are three semitones.
- **The marker** is the Equaliser's point (12px Ink dot, 2px ring of the panel's colour, 28px
  target, a real horizontal `role="slider"`): drag anywhere along the ruler, arrows a semitone,
  Page keys an octave, Home and End the limits, Delete or a double-click the original key. Hover
  or drag grows the dot by 2px. Its value tag ("+3", real minus sign) floats above the ticks while
  it is focused or dragged.
- **Double-clicks are heard on the surface that captures the pointer** (the ruler here, the plot
  in the Equaliser), never on the dot: a press captures the pointer, so Chromium sends the click
  to the surface and a handler on the dot never runs.
- The accent appears only as focus. The plugin's own line says whether the engine is working.

### Signature Component: the pending setting

A setting whose feature does not exist yet renders as a full row — label, help text, and a real
control — with the control disabled and an Overline badge reading **NOT IMPLEMENTED YET** beneath
the help text. The label drops to Ghost Ink. A switch is drawn off whatever its default, so
it never claims that something which does not exist yet is on, and it is never marked changed.

This exists because the settings schema is written ahead of the features, and a toggle that
silently does nothing is worse than one that admits it. It is the clearest visual expression of
the product's voice, and it should be reused for any capability that ships its shape before its
behaviour.

### The status line

The pending setting's sibling. Where that one says a feature does not exist yet, this one says
whether a feature that does exist is working right now — for settings whose answer can change
without the setting changing. Today that is Discord presence, which needs the Discord app to be
running (`statusFrom: 'discord'` in the schema, `src/renderer/settings/DiscordStatus.svelte`), and
Glass, which needs Windows 11 and hardware acceleration (`statusFrom: 'glass'`,
`GlassStatus.svelte`). Glass's line appears only while its switch is on and there is no glass
("Off in safe mode", "Not showing"): working glass shows itself.

- **Under the help text**, in the label column: one Caption line. The state comes first, in two
  or three words of Ink at 600 ("Connected", "Discord isn’t running"), then a full stop and the
  rest of the sentence in Muted Ink — what it means, or what to do.
- **Words, not a dot.** There are no circles in this system, and the accent marks focus and
  selection, not health. A glance catches the bold state; the sentence carries the meaning.
- **"Connected" is proof, not a claim:** it says what Discord is showing ("Showing “Birahe” by
  Ali Sorena."), or why it shows nothing (paused, or nothing playing).
- **A problem gets its own line in Ink**, never red — Danger Red belongs to the close button.
- **"Try now"** appears only where trying again can change the answer: the Prompt's button at
  13px. A press holds "Looking for Discord…" for 600ms, because the real attempt fails in
  milliseconds and the press would otherwise look like it did nothing.
- Switched off, it shows nothing: the switch already says so.

### Discord card

Above the Discord section's rows (`src/renderer/settings/DiscordCard.svelte`, since 2026-11-14):
what friends see, built by the same function that sends it (`buildActivity`), so the preview and
Discord cannot disagree.

- **In our colours, not Discord's:** Field White behind a Hairline, 6px radius, 12px padding, at
  most 340px wide. "Listening to BetterSoundCloud" (12px, 600, Muted Ink); then the 64px artwork at
  the control radius with our 20px badge in its corner, the title (14px, 600) and the uploader
  (13px, Muted Ink), each ellipsized, and a 2px Ink rule over a Hairline track between the times in
  tabular figures; then Discord's buttons as words in a Hairline box.
- **Nothing on it can be pressed.** It is a preview; its buttons are words in a box.
- **Its caption beneath**, one Caption line: "What your friends see on your Discord profile, right
  now."
- **No card, in words:** in 13px Muted Ink, why there is none — Rich Presence off, nothing
  playing, or paused ("Paused: the card clears until you play again.").

### The safe-mode notice

When the app was started with `--safe-mode`, some settings on screen are not in force: hardware
acceleration, ad blocking and the theme are off for that launch whatever the controls show. The
panel must say so rather than show controls that silently do nothing.

- **At the top of the content column, on every section**, since the settings it overrides live in
  three of them. The status line's shape at Caption size: "Safe mode is on." in Ink at 600, then
  what is off, that nothing was changed, and how to leave it, in Muted Ink, at most 80ch wide. A
  hairline below, across the column, separates it from the first row. `role="status"`,
  `data-bsc-settings-safe-mode`.
- **No colour, no icon, no button.** It is information, not an alarm, and leaving safe mode means
  quitting and starting normally, which no button here can do better.

### The without-Widevine notice

After "Continue without Widevine", protected tracks grey out and skip, which is exactly what the
old bug looked like. Settings says why, so a skipping track reads as expected rather than as a
regression.

- **The safe-mode notice's shape, in the same place**: "Protected tracks won't play yet." in Ink at
  600, then why, that the app keeps trying, and that restarting tries at once, in Muted Ink.
  `role="status"`, `data-bsc-settings-without-widevine`. With both notices showing, they stack,
  separated by one hairline like rows.
- **It goes when Widevine arrives**, read each time Settings opens. No colour, no icon, no button.

### The update line

The status line under "Update automatically" in General (`UpdateStatus.svelte`, words from
`describeUpdateStatus`), and the model for any status line that carries an action.

- **The status line's shape**, with **one button at most**: the Prompt's button at 13px, naming
  its action — "Check now", "Download and install", "Restart now", "Open download page", "Try
  again". Busy states (checking, downloading) offer none.
- **The state names the version**: "Up to date. 0.8.0 is the newest version.", "0.8.1 is
  available. You have 0.8.0.", "0.8.1 is ready. Restart now, or it installs the next time you
  quit." Support replies ask for the version; the line already says it.
- **Progress is words, not a bar**: "Downloading 0.8.1… 42%". The lead ends in an ellipsis, as
  "Checking…" does, so the number reads as part of it, and the line uses tabular figures so it does
  not shift as the number changes.
- **A failure is a problem line in Ink** ("You seem to be offline."), with "Try again".
- **A copy that cannot install itself says how to get the update** ("This portable copy can't
  replace itself, so download the new one.") and offers the download page instead of installing.
- **Outside the panel, one system notification per version**, and only when there is something to
  do: an update ready, or one this copy can only be told about. None while the panel is open.
  Clicking it opens Settings.

### About

Settings → About (`src/renderer/settings/About.svelte`, since 2026-11-14): a section with no
settings, opened from its icon in the list or from the version at the sidebar's foot.

- **The app**: its 56px icon beside "BetterSoundCloud" at the Title size, and one Caption line in
  tabular figures, the version, the licence and the author, separated by middle dots.
- **The update line** (above), then the links in 13px Muted Ink, separated by middle dots: GitHub,
  Report a problem, Every version's notes. They look like links at rest — a quiet underline at 45%
  of their ink, 2px below — and go to Ink with a full underline on hover.
- **"What's new in 0.8.0"**, a group heading, then that version's entry from CHANGELOG.md drawn as
  text, never as markup: its headings at 14px 600 in Ink, its paragraphs and items at 13px Muted
  Ink, line-height 1.5, at most 70ch; each item after the 6×1px dash the plugin rows use; bold in
  Ink at 600. A version whose notes are not in the app says so and links to GitHub.
- **"Built with"**, a group heading, then one paragraph naming what the app ships and where the
  licences are.

### Plugin rows

Settings → Plugins (`src/renderer/settings/Plugins.svelte`), and the model for any list of
things the user switches on that act on their behalf.

- **One row per plugin**, the settings-row shape: a label column and the switch on the right.
  Down the label column: the name (Body), a Caption meta line ("Built in · 1.0.0 · Author" or
  "From your plugins folder · …"), the description, then **what it can do** — one permission per
  line, each after a 6×1px dash in currentcolor, the system's hairline as a list mark instead of
  a bullet glyph or a circle. A built-in plugin's row leaves out "Change how SoundCloud sounds":
  its description already says it.
- **Its status line and buttons** come next, in the status-line pattern above; the plugin writes
  them itself. With nothing of its own to say, the row says the state: Starting…, Stopped (with
  why), Paused (needs approval), Can’t be turned on, Can’t load.
- **Its own settings**, while it is on, sit set in under a 1px Hairline rule on the left, as
  compact rows of their own — so they read as belonging to that plugin and not to the panel. A
  `choice` setting is the panel's own dropdown, at the same size as its other rows'.
- **A plugin that cannot work is still listed**, label in Ghost Ink, switch disabled, with the
  reason. Hiding it would leave the user wondering where their folder went.
- **Asking first.** Switching on a plugin from the user's folder does not switch it on: a confirmation opens
  inside that row — Field White behind a Hairline, 6px radius, inset rather than floating — with
  the permissions again in Ink at 13px, one honest sentence about trust, and **Turn on** / Cancel.
  Not a dialog on top of Settings: the question belongs to the row. Escape closes it
  and only it. **Turn on** is the default, at 600 weight, because inside a Field White box the
  tonal step that marks a default elsewhere disappears.
- **The footer** holds "Open plugins folder" and the plain statement of what the separate process
  does and does not protect. The words may not promise more safety than the code provides.

### Reset rows

Settings → Advanced, after its ordinary rows (`src/renderer/settings/Reset.svelte`): **Reset
settings** and **Clear cache and site data**. Buttons, not settings, and neither can be undone.

- **The settings-row shape**: the name (Body) and what it does (Caption) on the left, one button on
  the right whose label ends in an ellipsis ("Reset settings…", "Clear…"), because a question
  comes before anything happens. The clearing row's caption says when to reach for it: SoundCloud
  saying you've been blocked, or its page not loading.
- **The question opens inside the row**, in the plugin rows' confirmation box: the question in Ink
  at 600, then what it costs and **what it leaves alone** (plugins, Last.fm, the sign-in for a
  reset; settings, plugins, Last.fm for clearing), then the action ("Reset settings", "Clear and
  sign out", 600 weight) and Cancel. The opener is disabled while it is open; Escape closes the
  question and only it.
- **Focus moves to the question, not to its button**, so a second Enter right after the first
  cannot reset or sign anyone out. The box takes no focus ring of its own; Tab reaches the
  buttons, which keep theirs.
- **Then one line in Ink** says what happened ("Done: every setting is back to its default.",
  "Done. SoundCloud is opening again, signed out.") or that it failed and to try again. The
  opener's label says "Resetting…" / "Clearing…" while main works.

### Theme rows

Settings → Themes (`src/renderer/settings/Themes.svelte`). A single choice among files, so it is a
radio group, and the arrow keys move through it. Since 2026-11-14 it is a gallery of cards, not a
list of rows: the maintainer's choice, after Obsidian's theme screenshots, since what a theme
looks like is a picture, not a sentence.

- **The gallery comes first** (the maintainer's order, 2026-11-14: it is the section's main
  choice, and under the other rows no theme showed on a short window), with no visible heading:
  the page's title already says Themes, and "Theme" stays the radio group's accessible name. Its
  footer follows it.
- **The switches come next**, under a group heading, "With every theme", so they never read as
  part of the gallery or its footer: ordinary settings rows drawn by `Settings.svelte`
  (`appearance.minimalNavigation`, then Glass and Glass tint on Windows, right above the
  Background they take the place of).
- **The Background group comes last** (`Background.svelte`): a "Background" group heading, one
  Explanation line saying where it shows, a radio group of three picture tiles — None, the playing
  track's artwork, a picture of your own (Theme pictures) — then "Choose a picture…" / "Choose
  another picture…", and two sliders, Blur and Strength, each with its value in tabular figures at
  the right. The sliders are disabled while None is chosen. Choosing a picture also selects it.
  While Glass is on, the tiles are unavailable and one line says the glass is the background. While the selected theme needs a
  background (Glassmorphism), None is disabled and its caption says why, and the choice shown as on
  is the one in effect — the artwork — not the stored None.
- **"None" heads the gallery**, always: no theme on top of SoundCloud's own look ("SoundCloud’s
  own look", its meta line says). It is a choice, not an absence.
- **One card per theme**: its picture (Theme pictures) in the tile frame, the name (Body; 600 when
  chosen — weight carries selection, the accent stays on the ring), a Caption meta line ("Built in ·
  2.0.0 · Author", "Yours", "Yours — your copy of a built-in theme"), then the whole description at
  the Explanation's size, never cut off.
- **The chosen card** is ringed in the accent; hover rings a card in Hairline. Keyboard focus is
  the 2px ring 4px outside the picture, clear of the chosen ring, so where the keyboard is and
  what is chosen read as two things.
- **No picture yet:** the theme's `@preview` colours as equal bands filling the picture's shape,
  with a "No picture yet" chip in its bottom-left corner (Field White, the control radius, Muted
  Ink); a theme with no colours either gets a Field White blank saying the same. Each stays until
  the theme has been on.
- **The chosen theme's one action sits under the gallery**, above a Hairline, so every card stays
  the same height: "Make an editable copy" for a built-in theme, "Open <name>’s file" for one of
  yours, each with an Explanation line saying that saved changes show at once.
- **A missing theme says so** in Ink below the gallery, rather than silently falling back.
- **The footer** holds "Open themes folder" and one honest sentence: themes are CSS and cannot run
  code, but a picture loaded from the internet on SoundCloud's page tells that site you use it.

A theme may recolour our windows through the `--bsc-*` tokens. That is the point of the token API,
and it is also how a theme can break the one thing the accent is for: a theme's accent must still
show the focus ring. The authors' guide says so; the shipped themes meet 3:1.

### Theme pictures

Pictures of how the window will look, wherever a choice is about looks (the maintainer's choice,
2026-11-14): the Light or dark tiles, the Background's tiles, the theme gallery's pictures, and the
line drawings beside the layout settings. They show; the words still say.

- **The tile frame:** a 2px ring with 3px of air round the picture, at the control radius:
  transparent at rest, Hairline on hover, the accent when chosen. The keyboard's ring sits 3px
  outside it (4px on a theme card). The name beneath, 13px Muted Ink, goes to Ink at 600 when
  chosen. The radio stays underneath for the keyboard and screen readers. A choice that cannot be
  made right now is at half strength, its name in Ghost Ink.
- **Light or dark** (`appearance.colorScheme`, `tiles` in the schema) is three tiles instead of a
  dropdown: our own window in light, in dark, and for System the dark one with the light one laid
  over its left. **A picture of a mode is drawn in that mode's own colours whatever the panel is
  in** — `tokens.css`'s light and dark values, written out in that one place — so Light looks light
  in a dark panel.
- **The Background's tiles** are a small SoundCloud page, square like a print, with the artwork or
  your picture blurred and faded behind its rows, as the Background draws it. With nothing to
  show, the page steps back behind the words: "Nothing playing", "No picture yet".
- **A theme's picture** is the whole window wearing it, 16:9, behind a Hairline: our bar over
  SoundCloud's whole page, never a corner of it (the maintainer: the whole interface, not zoomed
  in). The built-ins ship one, the maintainer's own full-screen screenshots at 1920×1080; once a
  theme has been on, the user's own window wearing it takes that
  picture's place, and again whenever its CSS changes. A window of another shape loses its
  edges in the card, never its top. A page that has not drawn yet, almost all one colour, is
  never kept. Settings, the panels and the overlays are never pictured.
- **The line drawings** (`SettingFigure.svelte`), 120×76, beside a layout setting's row: a window
  with our bar on top, SoundCloud's header, its page and its player bar. 1.4 strokes with round
  ends in mixes of Muted Ink; our bar a shade darker than SoundCloud's header, so the two never
  read as one band; the part the row's setting controls in Ink. Decorative: hidden from assistive
  technology, since the row's words say it all.

**The Same Window Rule.** Every layout drawing is the same window, as all the layout settings have
it right now, so the drawings never disagree and changing one setting changes them all. A drawing
shows the state, never a picture of the setting on its own.

### Motion

One motion pattern, used only for modality. A dialog — the Go to URL prompt, the "not
responding" dialog — enters with a 180ms `cubic-bezier` ease-out — a 14px upward fly paired with
a fade — while the scrim fades in over the same duration. Settings, a page rather than a dialog,
fades in and out as a whole over the same 180ms, with no fly: nothing floats, so nothing rises.
`prefers-reduced-motion: reduce` sets the duration to 0 rather than substituting a different
animation.

Everything else is instant. Hover states have no transition; the wash appears on the frame it is
needed.

**The switch's knob is a second small state motion** (2026-11-14): it slides across the track
over 120ms (`cubic-bezier(0.2, 0.8, 0.2, 1)`), so on and off read as a movement, not a flicker.
The track's colour changes at once. Reduced motion removes the slide.

**The one exception is the wait line** on the page-status surface: a 120×2px Hairline track with
a Muted Ink segment crossing it every 1.4s, shown only while something is in progress. A message
that does not change for twenty seconds reads as frozen, and this is the cheapest honest proof
that it is not. It is square-ended (no third radius), never the accent (waiting is not a state),
and under `prefers-reduced-motion` it is removed rather than frozen, since a still segment reads
as a stuck bar. The words carry the meaning on their own.

**The same wait line runs along the bar** while SoundCloud's page loads: 2px at the bar's bottom
edge, over its hairline, the segment 12% of the bar's width, the same 1.4s and curve. It is the
same pattern in a second place, not a second motion: a frameless window has no spinner of its
own, and a reload otherwise looks like nothing happening. Reduced motion removes it; the Stop
glyph says it alone.

### Keyboard between views

Each part of the window is its own view, and Tab never leaves the one it is in. **F6** moves focus
to the next part, **Shift+F6** back, as in a browser: the bar (or the window buttons over
SoundCloud's header while the bar is hidden), SoundCloud's page (or the status standing in for
it), the lyrics pane, the player buttons — whichever are there. While Settings is open, F6 moves
only between Settings and the bar.

- **Landing in one of our views draws the ring**: on the control it last had, the one it marks
  `data-bsc-focus-first` (Settings: the section showing, or the search field while searching),
  or its first. `focus({ focusVisible:
true })`, because a view last used with the mouse draws no ring for a plain `focus()`.
- **Landing on SoundCloud's page only focuses it**; Tab then goes through the page's own controls.
- **Closing Settings gives focus back** to where it came from, usually the bar's Settings button.
- **Ctrl+, (⌘, on macOS) opens Settings and closes it** from anywhere in the window, as in most
  apps (2026-11-14). Closing by it fades out like Escape.
- **Settings → Shortcuts lists the keys**, F6 and Shift+F6 under "Moving around", Ctrl+, and
  Ctrl+F under "Settings", as rows with key chips: Field White behind a
  Hairline, 6px radius, the system font at 12px. The same chip, tighter and in Muted Ink, is the
  search field's "Ctrl+F" hint.

### Forced colours

In a Windows contrast theme the system's colours replace ours. `tokens.css` maps every token to
a system colour there (Canvas, CanvasText, Highlight, GrayText), so what is drawn with a
background, a border or an outline keeps the user's colours rather than sinking into Canvas: the
focus ring is Highlight, hairlines and key chips CanvasText, disabled controls GrayText. Hover
washes and the close button's red go to transparent. A switch and a slider keep exact
system colours there: a CanvasText track and knob, Highlight when on, so the state still shows.
In a contrast theme, focus shows where you are; hover does not.

## Do's and Don'ts

### Do:

- **Do** consume colour through `--bsc-*` custom properties, so every surface works in both modes.
- **Do** keep the accent to state only — focus rings and selection. Its rarity is what makes it
  legible.
- **Do** separate surfaces with 1px Hairline borders and the single tonal step, not with shadow.
- **Do** pair the scrim and the Overlay shadow whenever something takes over input, and use
  neither otherwise.
- **Do** give every new control a visible focus state (2px `--bsc-focus` outline,
  `outline-offset: -2px`) and full keyboard operability — the product targets WCAG 2.2 AA for its
  own chrome, and a new view takes part in F6 by itself.
- **Do** render an unbuilt capability as a disabled control with the **NOT IMPLEMENTED YET**
  badge rather than hiding it or letting it appear functional.
- **Do** expose stable `data-bsc-*` attributes on themable regions, and treat `tokens.css` plus
  those attributes as the versioned public API for user themes.

### Don't:

- **Don't** target Svelte's generated hash classes (`.s-050uw8y64xWw`) from a theme. They change
  every build. That is what the `data-bsc-*` attributes exist for.
- **Don't** build a generic Electron dashboard — Material-style cards, elevation for its own
  sake, an icon rail, dense chrome competing with the content it wraps. Confirmed anti-reference.
- **Don't** adopt consumer music-app surface language — gradient heroes, artwork bleeding into
  blurred backgrounds, oversized transport controls. SoundCloud already renders all of that one
  layer below; duplicating it makes the client a skin. Confirmed anti-reference. The one exception
  is the user's to turn on: the Visualizer plugin, flat and in the showcase's own ink (above).
- **Don't** use glassmorphism, backdrop blur, glow, or saturated gradients. They read as a theme
  rather than a tool and destroy legibility in a 32px strip. Confirmed anti-reference. **One
  exception, the user's to choose:** the Glass setting (Windows 11, off by default, kept by the
  maintainer 2026-11-11), which puts the whole window on a dark live blur, like a theme does. Our
  chrome on it stays flat: a plain dark fill on the bars, no blur or glow of its own, and dark
  ink whatever the Appearance.
- **Don't** introduce a webfont. The CSP blocks remote loads, and the OS stack is the point.
- **Don't** add a third radius, a second shadow, or a second accent without retiring one first.
- **Don't** exceed 15px type in BetterSoundCloud's own UI, outside the Lyrics and Showcase
  Exceptions.
- **Don't** grow the chrome past 32px. New affordances go into settings or an overlay.
- **Don't** style SoundCloud's page from a component stylesheet. Page-level appearance is
  CSS-only through `insertCSS`, and no node may be added to their document.
