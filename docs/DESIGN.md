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
  accent: '#f50'
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
    padding: '8px 10px'
  nav-item-active:
    backgroundColor: '{colors.bg-hover}'
    textColor: '{colors.text-primary}'
  field:
    backgroundColor: '{colors.bg-secondary}'
    textColor: '{colors.text-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: '6px 8px'
  panel:
    backgroundColor: '{colors.bg-primary}'
    rounded: '{rounded.md}'
    width: '760px'
    height: '560px'
---

# Design System: BetterSoundCloud

## Overview

**Creative North Star: "The Quiet Frame"**

BetterSoundCloud is a frame around someone else's picture. SoundCloud's own web app renders
every piece of music UI — the player, the waveforms, the artwork, the navigation — inside a
content view that this design system deliberately never touches. What we own is a 32px strip
along the top, a settings panel that floats over it, and future overlays. That is the entire
canvas, and the frame's job is to hold the picture without competing with it.

This produces a system that is almost aggressively restrained. There is no display type, no
hero, no imagery, no gradient, and no decorative colour anywhere. Controls are transparent
until you hover them. The largest text in the product is 15px. The accent appears only where
something is focused, selected, or on. A user should be able to look at this app all day and
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

- **SoundCloud Orange** (`#f50`): The accent, inherited from the host application rather than
  invented for this one. It signals kinship — this is a SoundCloud client, not a separate
  product wearing SoundCloud as a data source. It appears on focus rings and the checkbox tick
  and nowhere else. Unchanged between light and dark.

### Neutral

The greys carry the entire interface. Each pair is light / dark.

- **Shell Grey** (`#f2f2f2` / `#121212`): The chrome background and the settings panel body.
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
- **Scrim** (`rgb(0 0 0 / 45%)`): Dims SoundCloud behind the settings panel. Not a surface —
  a modality signal.

### Named Rules

**The Borrowed Accent Rule.** The accent is SoundCloud's, not ours. It marks state — focused,
selected, on — and never decorates. If orange appears somewhere that is not a state, remove it.

**The Two-Mode Rule.** Every colour exists twice and is consumed only through a
`--bsc-*` custom property. A literal hex outside `tokens.css` is a bug: it will be correct in
one mode and wrong in the other. The single sanctioned exception is `#fff` on the danger hover,
which must stay white in both modes.

## Typography

**Display Font:** none. This system has no display tier.
**Body Font:** the platform UI stack — `system-ui, -apple-system, 'Segoe UI', Roboto,
'Helvetica Neue', Arial, sans-serif`
**Label/Mono Font:** none.

**Character:** Deliberately anonymous. The chrome uses whatever the operating system uses, so it
reads as part of the window rather than as branded material. A webfont here would be both a
personality the frame should not have and a runtime network load the renderer's CSP forbids.

### Hierarchy

- **Title** (600, 15px): The settings panel heading. The largest text in the entire product.
- **Body** (400, 14px): Setting names — the primary reading size in the panel.
- **Label** (400, 13px): Navigation items, inputs, selects. The dense working tier.
- **Caption** (400, 12px, line-height 1.4): Help text under a setting, and the window title in
  the chrome strip (500 weight there). Always Muted Ink.
- **Overline** (600, 11px, +0.03em, uppercase): One use only — the "Not implemented yet" badge.

### Named Rules

**The 15px Ceiling Rule.** Nothing in BetterSoundCloud's own UI is larger than 15px. The frame
has no headlines because the frame has nothing to announce. If a surface seems to need display
type, it probably belongs to SoundCloud's view, not ours.

**The System Stack Rule.** No webfonts, ever. The chrome inherits the OS UI font so it belongs
to the window; the CSP on every renderer blocks remote font loads regardless.

## Layout

Two independent surfaces, never one page.

**The chrome strip** is a fixed 32px row: a flex line of `[back · forward · reload]`, a centred
elided title that takes the remaining space, and `[settings · minimize · maximize · close]` on
the right. It is a window drag region, and every interactive child opts back out with
`-webkit-app-region: no-drag`. It does not scroll, wrap, or change height at any window size.

**The settings panel** is a centred card, `min(760px, 100% − 48px)` by
`min(560px, 100% − 48px)`, laid out as a two-column grid — a 160px navigation rail beside a
scrolling content column — with a header row spanning both. Only the content column scrolls; the
card itself never does.

Spacing is an observed rhythm rather than an enforced scale: 2px between adjacent chrome
buttons, 4px in the chrome flex line, 8–12px inside controls, 16–20px for panel padding, and a
48px minimum breathing margin around the floating card. Setting rows are 12px vertical padding
separated by hairlines, with the last row's border removed.

### Named Rules

**The 32px Rule.** The chrome is 32px and never grows. Every new affordance either fits in that
strip, moves into settings, or becomes an overlay. Growing the frame steals from the picture.

## Elevation & Depth

**Flat at rest. Depth means modality.**

Surfaces do not float. Separation is done with 1px hairline borders and a single tonal step
between the shell and field colours — nothing in the chrome or the panel body carries a shadow.

A shadow appears in exactly one circumstance: something has floated above the application and
taken over input. Today that is the settings panel; tomorrow it is any dialog or overlay. When
it happens, two things arrive together — a scrim dimming everything behind, and a two-layer
shadow under the floating surface. They are one signal, never used apart.

### Shadow Vocabulary

- **Overlay** (`box-shadow: 0 12px 40px rgb(0 0 0 / 35%), 0 2px 8px rgb(0 0 0 / 20%)`): The only
  shadow in the system. A wide ambient layer for separation from the page beneath, plus a tight
  contact layer so the card's edge stays crisp. Always paired with the scrim.

### Named Rules

**The Modality Rule.** Shadow is not decoration and not hierarchy — it means "this has taken
over input". A surface that does not block interaction does not get a shadow. If you reach for
elevation to make something look important, use a border and a tonal step instead.

## Shapes

Rectangles with two radii and nothing else.

- **6px** on every control: chrome buttons, navigation items, inputs, selects, the panel's close
  button. Enough to read as a soft target, not enough to read as a pill.
- **10px** on the floating settings card, the one surface that needs to look detached.

There are no pills, no circles, no asymmetric corners, no clipping shapes, and no decorative
geometry anywhere. Borders are always 1px and always the Hairline alpha token.

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
- **Focus:** a 2px SoundCloud Orange outline, inset by 2px so it never clips against a neighbour.
- **Disabled:** glyph drops to Ghost Ink; no hover response. Used for back/forward when there is
  no history.
- **Close, hover:** the one exception — the field fills Danger Red and the glyph turns white.
- **Cursor:** `default`, not `pointer`. These are window chrome, not web links.

### Navigation

The settings rail — a vertical stack of section buttons, 2px apart.

- **Rest:** transparent, Muted Ink, 13px, left-aligned, 8px × 10px padding, 6px radius.
- **Hover:** Hover Wash.
- **Active:** Hover Wash plus Ink text at 600 weight. Weight, not colour, carries selection.
- Labels are written out, never derived from a key. Capitalising identifiers produced "Lastfm";
  the section list now stores real names.

### Inputs / Fields

- **Style:** Field White background, 1px Hairline border, 6px radius, 6px × 8px padding, 13px
  text, 140px minimum width so a row of controls aligns down the right edge.
- **Checkbox:** 16×16 native control with `accent-color` set to SoundCloud Orange — the second
  and last place the accent appears.
- **Disabled:** 50% opacity and a `not-allowed` cursor, paired with the Overline badge in the
  label column.

### Cards / Containers

- **Corner Style:** 10px.
- **Background:** Shell Grey, opaque, over a scrimmed page.
- **Border:** 1px Hairline, in addition to the shadow — the border is what keeps the edge legible
  in dark mode where the shadow largely disappears.
- **Internal Padding:** 10–16px in the header row, 16px × 20px in the content column.
- **Shadow Strategy:** the Overlay shadow, per Elevation & Depth.

### Signature Component: the pending setting

A setting whose feature does not exist yet renders as a full row — label, help text, and a real
control — with the control disabled and an Overline badge reading **NOT IMPLEMENTED YET** beneath
the help text. The label drops to Ghost Ink.

This exists because the settings schema is written ahead of the features, and a toggle that
silently does nothing is worse than one that admits it. It is the clearest visual expression of
the product's voice, and it should be reused for any capability that ships its shape before its
behaviour.

### Motion

One motion pattern, used only for modality. The settings panel enters with a 180ms
`cubic-bezier` ease-out — a 14px upward fly paired with a fade — while the scrim fades in over
the same duration. Exit reverses it. `prefers-reduced-motion: reduce` sets the duration to 0
rather than substituting a different animation.

Everything else is instant. Hover states have no transition; the wash appears on the frame it is
needed.

## Do's and Don'ts

### Do:

- **Do** consume colour through `--bsc-*` custom properties, so every surface works in both modes.
- **Do** keep the accent to state only — focus rings and selection. Its rarity is what makes it
  legible.
- **Do** separate surfaces with 1px Hairline borders and the single tonal step, not with shadow.
- **Do** pair the scrim and the Overlay shadow whenever something takes over input, and use
  neither otherwise.
- **Do** give every new control a visible focus state (2px accent outline, `outline-offset: -2px`)
  and full keyboard operability — the product targets WCAG 2.2 AA for its own chrome.
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
  layer below; duplicating it makes the client a skin. Confirmed anti-reference.
- **Don't** use glassmorphism, backdrop blur, glow, or saturated gradients. They read as a theme
  rather than a tool and destroy legibility in a 32px strip. Confirmed anti-reference.
- **Don't** introduce a webfont. The CSP blocks remote loads, and the OS stack is the point.
- **Don't** add a third radius, a second shadow, or a second accent without retiring one first.
- **Don't** exceed 15px type in BetterSoundCloud's own UI.
- **Don't** grow the chrome past 32px. New affordances go into settings or an overlay.
- **Don't** style SoundCloud's page from a component stylesheet. Page-level appearance is
  CSS-only through `insertCSS`, and no node may be added to their document.
