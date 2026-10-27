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
 * @description One or two sentences about how it looks.
 * @preview #121212 #1e1e1e #e0e0e0 #ff5500
 * @license MIT
 */
```

Every field is optional; a file with no header still loads, under its file name. `@preview` is up to
five hex colours that sum the theme up — page background, a surface, text, accent — drawn as swatches
in Settings.

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

The window buttons drawn on SoundCloud's own bars are not `chrome`: they follow SoundCloud's light
or dark setting so they match the bar beneath them.

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

## 5. What you can use on SoundCloud's page

- **SoundCloud's own light or dark setting**, as a class on `<body>`: `theme-light` or `theme-dark`.
  SoundCloud draws dark icons in light mode and light icons in dark mode, so a rule that inverts or
  recolours icons almost always belongs under one of them. The built-in themes scope their
  `filter: invert(…)` rules to `body.theme-light`.
- **`var(--bsc-cover)`** — the artwork of the track playing, at 500×500, as `url("…")`, or `none`
  when nothing is loaded. It changes once per track. The Glassmorphism theme uses it for a blurred
  backdrop.
- Anything SoundCloud's own stylesheet defines.

## 6. Rules

- **Style what is there; never restructure it.** CSS cannot add or remove SoundCloud's elements,
  and you should not try with tricks either. Pseudo-elements (`::before`, `::after`) on existing
  elements are fine — they add nothing to the page. A selector that stops matching after a
  SoundCloud update is then a harmless no-op, not a broken page.
- **Keep "on" visible.** SoundCloud shows a liked, followed or reposted button through its `color`.
  A theme that sets `color` on every `.sc-button` also erases that, so add a colour for
  `.sc-button.sc-button-selected`, as every built-in theme does.
- **Leave SoundCloud's header 46px tall.** BetterSoundCloud's window buttons are measured against
  it, and the page below is laid out for it.
- **You cannot move SoundCloud's controls under our buttons.** The space reserved for our buttons
  and your full-width setting are applied after every theme, with `!important`, on purpose.
- **Pictures from the internet** load on SoundCloud's page, and tell whoever serves them that you are
  using the theme. In our own windows they are blocked outright. Built-in themes load nothing but
  SoundCloud's own images; anything else is embedded in the file as a `data:` URI.

## 7. The built-in themes

**Minimal navigation is not a theme.** It is the switch at the top of Settings → Themes: Home, Feed
and Library become icons and the upsells beside them are hidden. It goes into SoundCloud's page right
after your theme, so it works with any theme, yours included. Its stylesheet,
`resources/minimal-nav.css`, is still the best example of restyling SoundCloud without touching its
page — every rule says why it is there.

| Theme         | Notes                                                          |
| ------------- | -------------------------------------------------------------- |
| Dark Cloud    | Dark, with its own player and action icons                     |
| Nocturnal     | Deep blue-black, muted text                                    |
| PostMorphic   | Textured dark grey, orange and blue                            |
| Hover         | Purple-black with a bright green accent                        |
| Glassmorphism | Translucent panels over the blurred artwork of what is playing |

All five were ported from BetterSoundCloud v0.7.x. What changed in the port: rules
for v0.7.x's own injected buttons are gone (v2 injects nothing into the page), images that were
hot-linked from the project's repository are embedded, images on hosts that no longer exist are
dropped, Nocturnal's and Hover's 60px header is back to 46px, icon inversion applies only in
SoundCloud's light mode (v0.7.x predates its dark mode), the liked/followed state is visible again,
and each now recolours our windows to match.

Every shipped theme is checked by `src/main/themes.test.ts`: lowercase file name, a header, nothing
loaded from the network but SoundCloud's CDN, nothing aimed at v0.7.x's markup, icon inversion only
under `body.theme-light`, and a `chrome` block that sets tokens and nothing else and meets the
contrast floor above.
