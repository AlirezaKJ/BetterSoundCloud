# Writing a plugin

## Read this first: what a plugin can do to you

**Installing a plugin means trusting its author with your computer.**

A plugin runs in a process of its own, inside a context with no `require`, no `process` and no
file system — only the `bsc` API described below. Every call through that API is checked
against the permissions you approved when you turned the plugin on. That is real, and it holds
for any plugin that uses the API as written.

It is not a security boundary. Node's `vm`, which provides the context, is documented by Node
itself as not being one, and the process around it is an ordinary program: code written on
purpose to escape can reach it, and from there anything a program on your computer can do. (The
one lock that could have helped — Node's `--permission` flag — has no effect in an Electron
utility process; measured.) The separate process protects the _app_ — a plugin that crashes or
loops forever cannot freeze BetterSoundCloud — not _you_ from a plugin's author.

So: the permission list tells you what an honest plugin will do, and holds it to that. Only add
plugins from people you trust, and read the code of anything you are unsure about. It is plain
JavaScript in a folder.

---

## 1. Where plugins live

| Where                       | What                                                   |
| --------------------------- | ------------------------------------------------------ |
| `resources/plugins/<id>/`   | Shipped with the app. Last.fm is one.                  |
| `<userData>/plugins/<id>/`  | Yours. **Open plugins folder** in Settings → Plugins.  |
| `resources/plugins/lastfm/` | The reference plugin. Read it before writing your own. |

`<userData>` is `%APPDATA%\BetterSoundCloud` on Windows, `~/Library/Application Support/BetterSoundCloud`
on macOS, `~/.config/BetterSoundCloud` on Linux.

A plugin is a folder holding a `plugin.json` and a script. The folder's name must be the
plugin's `id`. A plugin of yours cannot use a built-in plugin's id.

Settings → Plugins looks at the folder each time it opens, so a new plugin appears without a
restart. Turning a plugin off and on again reloads its script.

---

## 2. `plugin.json`

```json
{
  "id": "now-playing-log",
  "name": "Now playing log",
  "version": "1.0.0",
  "author": "You",
  "description": "Logs every track you play.",
  "homepage": "https://example.com",
  "main": "index.js",
  "permissions": ["nowPlaying"],
  "settings": [
    { "key": "verbose", "kind": "boolean", "default": false, "label": "Log the clock too" }
  ]
}
```

| Field         | Required | Rules                                                                    |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `id`          | yes      | Lowercase letters, digits and dashes, up to 40. Equal to the folder name |
| `name`        | yes      | Up to 60 characters                                                      |
| `version`     | yes      | Any short string                                                         |
| `author`      | no       | Up to 60 characters                                                      |
| `description` | no       | Up to 300 characters                                                     |
| `homepage`    | no       | An `https` link                                                          |
| `main`        | no       | A `.js` file inside the folder. Defaults to `index.js`                   |
| `permissions` | no       | See below. An unknown permission makes the whole file invalid            |
| `settings`    | no       | Up to 20. Shown under the plugin in Settings while it is on              |

A plugin with an invalid `plugin.json` is still listed, with the reason, so you can see what to
fix.

### Settings

| `kind`    | Control  | Notes                                                                                             |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| `boolean` | checkbox | `default` is `true` or `false`                                                                    |
| `string`  | text box | `default` is a string, up to 500 characters                                                       |
| `secret`  | password | Stored encrypted by the operating system, never shown again. Read with `bsc.settings.secret(key)` |

Each takes a `key` (letters and digits), a `label` and an optional `help`.

---

## 3. Permissions

| Permission       | Shown as                                 | Lets the plugin                                   |
| ---------------- | ---------------------------------------- | ------------------------------------------------- |
| `nowPlaying`     | See what you’re playing                  | `bsc.nowPlaying.get()` and `.onChange()`          |
| `network:<host>` | Connect to `<host>`                      | `bsc.fetch` to `https://<host>/…`, that host only |
| `browser:<host>` | Open `<host>` in your browser            | `bsc.openInBrowser` for `https://<host>/…`        |
| `secrets`        | Keep secrets on this computer, encrypted | `bsc.secrets`                                     |
| `page`           | Run code inside SoundCloud’s page        | **Nothing yet** — see below                       |

Hosts are exact: `network:api.example.com` does not cover `www.example.com`. No wildcards.

**When a plugin of yours is turned on**, Settings lists its permissions and asks first. Built-in
plugins list theirs on their row without asking.

**When a new version asks for more**, it is not started until you approve again. An update
cannot quietly widen what a plugin may do.

**`page` is not available.** Code inside SoundCloud's page is on hold until the project has a
clean baseline for its sign-in experiments (see `docs/TODO.md`, Milestone 1). A plugin asking for
it is listed as one that cannot be turned on, with that reason. When it arrives it will follow
the rules every in-page code in this project follows: read-only, event-driven, no timers on the
page, no writes into SoundCloud's DOM, no synthetic clicks.

---

## 4. The script

```js
// @ts-check
module.exports = {
  /** @param {import('…/src/shared/plugin-api').PluginApi} bsc */
  async activate(bsc) {
    bsc.status.set({ lead: 'Listening' })
    bsc.nowPlaying.onChange((track) => {
      if (track) bsc.log(`${track.artist} — ${track.title}`)
    })
  },

  // Optional. Runs when the plugin is turned off or the app quits.
  async deactivate() {}
}
```

- **`activate` gets the API and has 10 seconds to finish.** If it throws, the plugin's row shows
  "Couldn’t start" with your error message.
- **`deactivate` is optional and also has 10 seconds.** Afterwards every timer and listener the
  plugin left behind is cleared, whether you remembered to or not.
- **The script runs in strict mode.** Assigning to an undeclared name throws.
- **Top-level code has 5 seconds.** An endless loop there ends the plugin instead of hanging it.

### What exists in the script's scope

Exactly what `resources/plugins/sandbox.d.ts` declares, and a test keeps that file honest:

`module`, `exports`, `console` (goes to the app's log), `setTimeout`, `clearTimeout`,
`setInterval` (at least one second apart), `clearInterval`, `URL`, `URLSearchParams` — and
JavaScript's own built-ins. Nothing else: no `require`, `process`, `Buffer`, `fetch` or DOM.

---

## 5. The `bsc` API

The full, typed contract is `src/shared/plugin-api.ts`.

| Call                                        | Needs            | What it does                                                                                                   |
| ------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `bsc.plugin`                                |                  | `{ id, version }`                                                                                              |
| `bsc.log(…)`, `bsc.warn(…)`                 |                  | The app's log, tagged `[plugin:<id>]`. Warnings are kept in every build                                        |
| `bsc.nowPlaying.get()`                      | `nowPlaying`     | The current track, or `null`                                                                                   |
| `bsc.nowPlaying.onChange(fn)`               | `nowPlaying`     | Every change — including the clock, once a second while playing                                                |
| `bsc.settings.get()`                        |                  | Your non-secret settings' current values                                                                       |
| `bsc.settings.onChange(fn)`                 |                  | When the user changes one                                                                                      |
| `bsc.settings.secret(key)`                  |                  | A `secret` setting's value, or `''`                                                                            |
| `bsc.status.set({ lead, detail, problem })` |                  | The line under your plugin in Settings. `null` clears it                                                       |
| `bsc.actions.set([{ id, label }])`          |                  | Up to four buttons under that line                                                                             |
| `bsc.actions.onPress(fn)`                   |                  | Called with the button's `id`                                                                                  |
| `bsc.storage.get(key)` / `.set(key, value)` |                  | JSON values kept between runs. Up to 200 keys, 100 KB each                                                     |
| `bsc.secrets.get/set/delete(key)`           | `secrets`        | Strings encrypted by the OS. Rejects where there is no real encryption                                         |
| `bsc.fetch(url, { method, headers, body })` | `network:<host>` | An https request through the app's network stack (proxies apply). Resolves to `{ status, ok, text(), json() }` |
| `bsc.openInBrowser(url)`                    | `browser:<host>` | Opens an https page in the user's browser                                                                      |
| `bsc.hash.md5(text)`, `.sha256(text)`       |                  | Hex digests, for APIs that sign requests                                                                       |

A track (`NowPlaying`) is `{ title, artist, url, artwork, elapsed, duration, playing, liked }`:
`artist` is the uploader, `url` the track page, `artwork` a 500×500 image, `elapsed` and
`duration` whole seconds. It updates about once a second while playing; a seek is a jump in
`elapsed`.

### The status line

Say what your plugin is doing, the way the app does: the state in two or three words as `lead`
("Connected as akj"), the rest as `detail`, and anything wrong as `problem` on its own line.
A user should never have to guess whether a plugin is working.

---

## 6. Testing a plugin

- **Type-check it.** Start the script with `// @ts-check` and type `bsc` with a JSDoc import of
  `src/shared/plugin-api.ts`, as `resources/plugins/lastfm/index.js` does. The bundled plugins
  are checked by `npm run check` through `tsconfig.plugins.json`.
- **Run it in the real sandbox from a test.** `runPlugin` in `src/main/plugin-sandbox.ts` takes
  your script's text and a fake bridge, with no Electron involved. `src/main/lastfm-plugin.test.ts`
  runs the Last.fm plugin against a fake Last.fm that way.
- **Watch it run.** In `npm run dev`, its `bsc.log` lines appear in the terminal as
  `[plugin:<id>]`.
