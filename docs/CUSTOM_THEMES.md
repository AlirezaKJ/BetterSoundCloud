# Writing a theme

A theme is one `.css` file. It restyles SoundCloud's page, and — if you want — BetterSoundCloud's
own windows to match. It is CSS only: it can never run code, which is why installing one is just
dropping a file in a folder.

## 1. The fastest start

1. Settings → **Themes**, pick a built-in theme close to what you want, press **Make an editable
   copy**. Your copy goes into your themes folder and immediately replaces the built-in one.
2. Press **Open file**. Edit, save — the change shows the moment you save, on SoundCloud's page and
   in our windows alike. No reload, no restart.
3. To start from nothing, put any `.css` file in the themes folder (**Open themes folder**). It
   appears in the list straight away.

| Where                | What                                                  |
| -------------------- | ----------------------------------------------------- |
| `<userData>/themes/` | Yours. A file here with a built-in's name replaces it |
| `resources/themes/`  | Built in, inside the app. Copy one to edit it         |

`<userData>` is `%APPDATA%\BetterSoundCloud` on Windows, `~/Library/Application Support/BetterSoundCloud`
on macOS, `~/.config/BetterSoundCloud` on Linux. The file name, without `.css`, is the theme's id:
letters, digits, dots, dashes and underscores. Keep it lowercase — it is a file name on Linux too.

## 2. The header

```css
/**
 * @name Dark Cloud
 * @author You
 * @version 1.0.0
 * @mode dark
 * @description One or two sentences about how it looks.
 * @preview #121212 #1e1e1e #e0e0e0 #ff5500
 * @license MIT
 */
```

Every field is optional; a file with no header still loads, under its file name. `@preview` is up to
five hex colours that sum the theme up — page background, a surface, text, accent — drawn as swatches
in Settings.

`@mode` is `dark` or `light`: which of SoundCloud's two modes you wrote the theme for. Set it. It is
what makes your theme look the same whichever mode SoundCloud is in; section 5 explains how.

`@background required` says your theme is made to sit on a background, as Glassmorphism's
see-through panels are. While it is selected, the Background setting cannot be None: it shows the
playing track's artwork instead, unless the listener chose a picture. Their own choice is kept, and
comes back with the next theme. Leave the line out if your theme looks right on a plain page.

## 3. Sections: where the CSS goes

Everything before the first marker styles SoundCloud's page. A line that is exactly
`/* @target <name> */` starts a section:

| Target                                 | Styles                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `content`                              | SoundCloud's page (the default)                                                         |
| `chrome`                               | All of our own windows: the 32px bar, settings, the right-click menu, the status screen |
| `header`, `settings`, `menu`, `status` | One of those only                                                                       |
| `all`                                  | Everywhere                                                                              |

A marker inside a rule, or after code on the same line, is an ordinary comment. A section for a
target that does not exist is dropped. Sections can repeat; each is appended to its target.

The window buttons drawn on SoundCloud's own bars are not `chrome`: they match the bar beneath them,
so they follow your theme's `@mode`, or SoundCloud's own light or dark setting if it has none.

## 4. Recolouring our windows

Our windows are built entirely from design tokens (`src/renderer/tokens.css`). Set them in a
`chrome` section and everything follows — buttons, focus rings, menus, the settings panel:

```css
/* @target chrome */
:root {
  --bsc-bg-primary: #1a1a1a;
  --bsc-bg-secondary: #2a2a2a;
  --bsc-bg-hover: rgb(255 255 255 / 10%);
  --bsc-text-primary: #e0e0e0;
  --bsc-text-secondary: #b3b3b3;
  --bsc-text-disabled: #5c5c5c;
  --bsc-border: #333;
  --bsc-accent: #f50;
}
```

Keep them readable — our windows are held to WCAG AA: primary text at least 7:1 on
`--bsc-bg-primary`, secondary at least 4.5:1, the accent at least 3:1. The accent marks state (focus,
selection, "on"); a theme that makes it match the background erases the only keyboard focus ring.

A plain `:root` is enough: our defaults are declared with `:where(:root)`, which has no specificity,
so any theme's `:root` beats them. Anything else is different: a theme's CSS is inserted into our
windows ahead of their own stylesheets, so to restyle an element beyond the tokens you need either a
more specific selector than ours or `!important`.

For that, use the element's `data-bsc-*` attribute, such as `[data-bsc-header]` or
`[data-bsc-settings-panel]`. These are the stable names. **Never target the `svelte-…` hash
classes** — they change with every build.

## 5. SoundCloud's light and dark mode

SoundCloud has a light and a dark mode; each listener picks one in SoundCloud's own settings, and it
marks the choice with a class on `<body>`: `theme-light` or `theme-dark`. Your theme has to look
right in both, and the easy way is to write it for one and say which with `@mode`.

**How SoundCloud switches.** Nearly the whole difference between its two modes is one set of about
110 colour variables, declared on `<body>` — `--surface-color`, `--primary-color` and so on (the full
list, with SoundCloud's dark values, is `resources/soundcloud-palette-dark.css`). Every text colour
and background on the page is drawn from them, and so is every icon: SoundCloud's icons are inline
SVGs filled with `currentColor`, which means they are whatever `color` their button has.

**What `@mode` does.** While SoundCloud shows the other mode, BetterSoundCloud puts SoundCloud's own
colours for your mode back underneath your theme. A `@mode dark` theme on SoundCloud's light mode
therefore sits on exactly the page it was written on, and looks the same as it does there. Your
theme's rules still win over that layer. The window buttons BetterSoundCloud draws over SoundCloud's
header and play bar follow your `@mode` as well, so they stay visible on your colours.

**Without `@mode`**, anything your theme does not paint itself keeps SoundCloud's colours for the
mode the listener chose. A dark theme on SoundCloud's light mode then shows dark text and dark icons
on your dark backgrounds. You can handle the two modes yourself with `body.theme-light …` and
`body.theme-dark …` rules, but `@mode` is less work and cannot miss anything.

**Never invert icons.** Older themes used `filter: invert(1)` to turn SoundCloud's dark icons light.
Today an icon is already light wherever the text is, so inverting it makes it dark again. To recolour
an icon, set `color` on its button.

**Recolouring all of SoundCloud at once.** Because SoundCloud paints itself from those variables, you
can set them to your own palette instead of chasing every element:

```css
body.theme-light,
body.theme-dark {
  --background-surface-color: #1a1b26; /* the page itself, and the header */
  --surface-color: #1a1b26; /* menus, dialogs, plain buttons; the triangle on a play button */
  --primary-color: #e0e0e0; /* main text and icons; the round play button */
  --primary-rgb:
    224, 224, 224; /* the same colour, for SoundCloud's rgba(): keep the two in step */
  --secondary-color: #888; /* secondary text and icons */
  --highlight-color: #2a2a3a; /* secondary buttons and labels */
  --link-color: #74857c;
}
```

Declare them on `body.theme-light, body.theme-dark`, not `:root` or plain `body`. SoundCloud declares
them on `.theme-light` and `.theme-dark`, and a stylesheet BetterSoundCloud inserts loses to the
page's own when the two are equally specific, so yours needs the extra element. The variables are
independent values, not derived from one another: the buttons, inputs, toggles and tags have their own
(`--button-…`, `--input-…`, `--toggle-…`, `--tag-…`), so set those too if you want them to change.

## 6. What you can use on SoundCloud's page

- **SoundCloud's own light or dark setting**, as `theme-light` or `theme-dark` on `<body>` — but read
  the section above first: with `@mode` you rarely need it.
- **SoundCloud's colour variables**, as above.
- **`var(--bsc-cover)`** — the artwork of the track playing, at 500×500, as `url("…")`, or `none`
  when nothing is loaded. It changes once per track. To put it behind the whole page, use the
  Background setting (below) rather than drawing your own layer.
- **`var(--bsc-picture)`** — the listener's own background picture, as `url("…")`, while the
  Background setting is set to it; otherwise unset, so write `var(--bsc-picture, none)`.
- Anything SoundCloud's own stylesheet defines.

**The Background setting and your theme.** Settings → Themes → Background puts the track's artwork
or the listener's own picture behind SoundCloud's page, with any theme. It owns `body::before`, so do
not draw a backdrop of your own there: if your theme needs one, say `@background required` and the
listener's background, with their blur, strength and picture, is yours. While it is on it makes `#app`
and SoundCloud's content column (`.l-container.l-content`) see-through, and the picture fades into
your page colour — the `background` you give `<body>` or `<html>` — so that colour sets the mood: a
dark one deepens the picture, a light or grey one frosts it, as Glassmorphism's does. Everything else
your theme paints stays solid and covers it, which is how a theme decides where the background
shows; translucent panels, as in Glassmorphism, let it show through them.

## 7. Rules

- **Style what is there; never restructure it.** CSS cannot add or remove SoundCloud's elements,
  and you should not try with tricks either. Pseudo-elements (`::before`, `::after`) on existing
  elements are fine — they add nothing to the page. A selector that stops matching after a
  SoundCloud update is then a harmless no-op, not a broken page.
- **Keep "on" visible.** SoundCloud shows a liked, followed or reposted button through its `color`.
  A theme that sets `color` on every `.sc-button` also erases that, so add a colour for
  `.sc-button.sc-button-selected`, as every built-in theme does.
- **Keep the play buttons round and solid.** SoundCloud draws a play or pause button (`.sc-button-play`,
  `.sc-button-pause`) as a round `background-color` with the triangle in the page colour. A theme
  that makes that background transparent, or the same colour as the page, leaves the most used
  button on every track list invisible. Give it a colour that stands out, as the built-in themes do.
- **Move boxes with margins, not `position: relative; left`.** A relative offset moves a box without
  making room for it, so a box near the right edge ends up outside the window and the whole page
  scrolls sideways.
- **Leave SoundCloud's header 46px tall.** BetterSoundCloud's window buttons are measured against
  it, and the page below is laid out for it.
- **You cannot move SoundCloud's controls under our buttons.** The space reserved for our buttons
  and your full-width setting are applied after every theme, with `!important`, on purpose.
- **Pictures from the internet** load on SoundCloud's page, and tell whoever serves them that you are
  using the theme. In our own windows they are blocked outright. Built-in themes load nothing but
  SoundCloud's own images; anything else is embedded in the file as a `data:` URI.

## 8. The built-in themes

**Minimal navigation is not a theme.** It is the switch at the top of Settings → Themes: Home, Feed
and Library become icons and the upsells beside them are hidden. It goes into SoundCloud's page right
after your theme, so it works with any theme, yours included. Its stylesheet,
`resources/minimal-nav.css`, is still the best example of restyling SoundCloud without touching its
page — every rule says why it is there.

| Theme         | Notes                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Dark Cloud    | Dark, with its own player and action icons                                  |
| Nocturnal     | Deep blue-black, muted text                                                 |
| PostMorphic   | Textured dark grey, orange and blue                                         |
| Hover         | Purple-black with a bright green accent                                     |
| Glassmorphism | Translucent panels over your background; needs one (`@background required`) |

All five were ported from BetterSoundCloud v0.7.x, and all five are `@mode dark`: they look the same
in both of SoundCloud's modes. What changed in the port: rules for v0.7.x's own injected buttons are
gone (v2 injects nothing into the page), images that were hot-linked from the project's repository are
embedded, images on hosts that no longer exist are dropped, Nocturnal's and Hover's 60px header is
back to 46px, and each now recolours our windows to match. v0.7.x predates SoundCloud's dark mode and
its SVG icons, so these went too: the icon inversions (they turned today's light icons dark), Dark
Cloud's own PNG play-bar icons (they drew a second icon behind SoundCloud's), the transparent play
buttons in Hover and Nocturnal (they hid the triangle), and Hover's sideways nudge of the sidebar
(it made the page scroll sideways). The liked/followed state is visible again in every theme.

Every shipped theme is checked by `src/main/themes.test.ts`: lowercase file name, a header with
`@mode dark`, nothing loaded from the network but SoundCloud's CDN, nothing aimed at v0.7.x's markup,
no rules for one SoundCloud mode only and no inverted icons, no `position: relative; left` nudges, and
a `chrome` block that sets tokens and nothing else and meets the contrast floor above.
