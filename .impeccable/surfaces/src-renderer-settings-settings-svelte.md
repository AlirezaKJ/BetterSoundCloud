---
version: 1
slug: 'src-renderer-settings-settings-svelte'
primary_target: 'src/renderer/settings/Settings.svelte'
related_targets: []
---

# Settings, as a page

Mode: Operate. Listeners, mostly not technical, open it rarely: to change one thing, or because
something is wrong. Success: find the setting in seconds, know what it does before touching it,
leave with Esc or the gear.

Confirmed by the maintainer 2026-11-14: covers everything below our bar (the bar comes back while
it is open); the explanation sits in each row, one or two short sentences, never a paragraph;
first pass includes search in the sidebar and the version with two links at its foot; every
setting's text redrafted for review.

## Direction contract

THESIS: Settings is a page standing in for SoundCloud's, not a dialog floating over it: one
sidebar, one readable column, every setting explained in a sentence or two. It refuses the centred
modal card and the icon-rail dashboard.

OWN-WORLD: The Quiet Frame, unchanged: Shell Grey ground, hairline dividers, the system font,
nothing over 15px, orange only on focus and checked state, Field White fields, 6px controls, no
shadow, no scrim, no card.

STORY: The listener finds the setting by its section or by search, reads what it does in its own
row, changes it, and leaves; nothing asks them to read more than two sentences.

FIRST VIEWPORT: Our 32px bar on top. A 220px sidebar, full height: the search field at its top,
the seven sections, the version and two links at its foot. The content column: the section's
title (15px, 600) at the top of a reading column up to 720px wide, the close button at the
window's top right, then rows: 14px name, 13px explanation in muted ink, the control at the
column's right edge, a hairline between rows.

FORM: sidebar and reading column, pinned by the maintainer (no roll). Signature interaction:
search, where matches come grouped by section with the matched words in bold, and choosing one
lands on its row with focus on its control. Motion: one 180ms fade of the whole page, in and out.
seed: none (structure pinned by the maintainer, in their words: "replace the small settings
menu we currently have, with a fullscreen one … it should have a sidebar just like the one we have
now, for each setting section"). No roll ran, per the playbook: "Never run the
script for a local extension or a precisely specified narrow request; shape those directly", and
"a user- or brief-pinned direction beats the roll, always"

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Round three — 2026-11-14

The maintainer asked to make Settings friendlier and more polished, looking at modern apps, with
real images for each theme as the example, and chose all twelve proposals:

- A theme gallery of pictures of the app wearing each theme: shipped for the built-ins, then
  the user's own window once a theme has been on ("captured as you use them"). Each picture is
  the whole window, two cards to a row ("actual fullscreen photos, to show the whole interface.
  not zoomed in ones", 2026-11-14).
- Picture tiles for Light or dark and the Background; line drawings beside the layout settings,
  drawn in the setting's current state.
- Squared switches (6px track, 3px knob: concentric, no third radius); a changed setting marked
  in the gutter with Reset; Restart now / Reload SoundCloud; group headings inside sections.
- Section icons; About (version, updates, What's new from the changelog, links); the Discord
  card's preview; Ctrl+, opens Settings.

The world is unchanged: Shell Grey, hairlines, system font, nothing over 15px, the accent only for
state (focus, on, chosen, changed).

## Open

- The insides of Plugins, Themes, Background and the editors are not redesigned in this pass.

## Shortcuts — 2026-11-15

The maintainer asked for keys that play, pause, skip and go back, every key changeable in Settings
(with GitHub #127: "while I'm in another app", "edit the bind as well"), and chose in discovery:
the system's media controls as the mechanism; each key choosing whether it works in other apps;
volume up, down and mute; the window's keys changeable; reload, back and zoom; the media-keys
switch removed (it cannot be separated from the media session); the tray's playback items on.

- Every shortcut is a schema row of kind `keys`, in groups: Playback, Volume, SoundCloud's page,
  Moving around, Settings. Same row as every setting: name, one-sentence explanation, control on the
  right, the changed mark and Reset.
- The control: a key combination is a button of key chips, pressed to record a new one ("Press
  keys…", the held modifiers as chips); up to two, "or" between them, "+" to add the second; "Set a
  key" when there is none. Esc keeps, Backspace removes, Tab leaves.
- What cannot be used is said in a Caption line in Ink under the explanation, and recording goes on.
- Playback and volume keys get "Also in other apps" (a switch, on by default) once a key is set; a
  key another app holds is said in its row.
