---
version: 1
slug: 'src-renderer-onboarding-onboarding-svelte'
primary_target: 'src/renderer/onboarding/Onboarding.svelte'
related_targets: ['src/renderer/onboarding/steps.ts']
---

# Onboarding (first run)

Scope: the first-run welcome, `src/renderer/onboarding/Onboarding.svelte`, a view of its own
covering the window below our bar on the first launch, and again from Settings → About. Mode:
Operate (the visitor completes setup), with one named type exception for its questions.

Audience and job: someone who just installed BetterSoundCloud, often coming back from v0.7.x,
mostly not technical. Job: make the few choices that matter before the first track (ad blocking
above all), then get signed in to SoundCloud. Everything stays changeable in Settings.

Asked for by the maintainer, 2026-11-15: "something similar to zen and helium onboarding users
to their web browser ... tons of different settings the user can select and change on the first
view which is important (like ad block) ... we will be modifying it a lot". Confirmed: ad
blocking, look (SoundCloud has its own light/dark setting, so say what ours covers), Discord and
Last.fm, startup and updates; end on sign-in, with the browser sign-in import; a large welcome
allowed as a named exception. Layout chosen on the decision page: one question at a time.

Constraints: the steps live in one plain data file so they are easy to change; every choice is a
real setting written as it is made (setSetting / setPluginEnabled), so Skip keeps what was chosen
and the defaults; nothing touches SoundCloud's page (sign-in is a normal navigation to its own
sign-in page, never a click).

Unresolved: whether existing 0.8.0 users see it once (decided here: no; only a profile with no
settings yet, or the About button).

Decided in the build (finish review, 2026-11-15): the updates and sign-in questions are word
tiles on purpose. One is a policy and the other three actions with conditions in their words;
neither has an honest picture. Every other answer has one. The step count sits in the foot, not
above the question (a label over the heading is an eyebrow). Answer names stay Ink, chosen at 600,
as the theme cards' do.

## Direction contract

THESIS: One question per screen, asked in large type, answered with two or three picture tiles;
the highlighted default is always one Enter away. It refuses the category's wizard of forms and
checkboxes, and the long settings page.

OWN-WORLD: DESIGN.md's Quiet Frame unchanged: Shell Grey ground, Field White tiles, Ink and Muted
Ink, the accent only on the chosen tile's ring and focus; system font; 6px controls, square
pictures; the theme pictures and window line drawings as the tiles' faces.

STORY: The visitor learns what the app adds, chooses ads, look, Discord and Last.fm, startup, and
leaves signed in (or on their way), knowing all of it lives in Settings.

FIRST VIEWPORT: Our 32px bar on top. Left-aligned column from 160px in: the question at
clamp(36px, 4.2vw, 56px) 650, a 15px Muted Ink lead under it (70ch), the tiles in one row below
(two or three, 260–460px each, picture above name and one line). The foot pinned to the bottom:
Back, Continue with its Enter key chip (the primary, Ink on Shell), the step progress (a row of
2px segments and "2 of 10"), and "Skip setup" at the right.

FORM: one question at a time, position 5 on the ordered list, seed:cd033cbefe48f29e.
Signature move: the answer is the picture; choosing a tile moves the accent ring, and Enter (or
1/2/3) carries the step forward with a 180ms slide from the side it came from.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
