# Security Policy

## Supported versions

Only the latest version (the one on the `main` branch and published at
https://ldanberger.github.io/chainreaction/) receives fixes.

## How the app handles data

Chain Reaction Workbench is a static, browser-only app:

- **No backend, accounts or analytics.** Nothing you build is sent anywhere.
- **No third-party content.** Every script, stylesheet, image and icon is served from this
  repository (the Matter.js physics engine is vendored in `lib/`). The app loads nothing from a CDN.
- **No network access at all.** The page's Content-Security-Policy (below) blocks every network
  connection, so even a bug couldn't send data anywhere.
- **Local storage only.** Work in progress is autosaved in your browser's `localStorage`. The
  light/dark theme choice and which built-in challenges you've solved are remembered there too. The
  challenge progress is read back strictly: only challenge ids and dates. Projects are saved as `.json` files on your own
  device.

## Opening project files from other people

A project file is **only ever treated as data**. Nothing in it is run: it is read with `JSON.parse`,
and text from it (names, labels, the words in a text block) is only ever shown as plain text, never
as HTML. A file also can't read anything else on your computer: the browser only gives the app the
one file you chose.

Because a hand-made file could still try to freeze the page with enormous values, every project goes
through a safety check (`js/safety.js`) before it's used. This applies to opened files, the browser
autosave and the built-in examples:

| Check | Limit |
|---|---|
| File size | 5 MB (bigger files are refused before they're read) |
| Layers | 50 |
| Objects | 1,500 per layer, 6,000 in all |
| Path points | 400 per path |
| Numbers | Must be real numbers, clamped to the range their Properties field allows (e.g. a stairway has at most 100 steps). Positions stay within ±100,000 px, and layers are 200–20,000 px |
| Heavy objects | A brick wall has at most 1,200 bricks; a text block has at most 60 characters at 300 px |
| Text | Names up to 100 characters, other text up to 80 (less where noted) |
| Colours, choices, ids | Must be a `#rrggbb` colour, one of the listed choices, and a plain id; anything else is reset |
| Unexpected data | Unrecognised settings are dropped; `__proto__`, `constructor` and `prototype` keys are never copied; object types this version doesn't know are kept (hidden) but trimmed |

If anything had to be changed, the app says so when the file opens ("Opened with adjustments: …"),
and the browser console lists every change.

**Challenge files** (loaded with *Load challenges…*) get the same treatment. A file over 5 MB is
refused, a set holds at most 500 challenges, every challenge's project and every solution object go
through the same checks, and loaded sets may use at most 4 MB of the browser's storage. A challenge
file, like a project file, is only ever data.

## Content-Security-Policy

`index.html` sets this policy, so the browser enforces the rules above even if the app had a bug:

```
default-src 'self'; script-src 'self' file:; style-src 'self' file:; img-src 'self' file:;
font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none';
child-src 'none'; worker-src 'none'; manifest-src 'self' file:; base-uri 'none'; form-action 'none'
```

- Only the site's own scripts, styles and images can load. There are no inline scripts
  (`js/theme-init.js` holds the one that used to be inline), and `eval` and the like are blocked.
- `connect-src 'none'`: no network requests of any kind.
- No plug-ins, frames, workers, `<base>` tag tricks or form submissions.
- `file:` only matters when you open `index.html` straight from your disk; a web page can never load
  `file:` URLs.

The policy is set with a `<meta>` tag because GitHub Pages can't add custom HTTP headers. So the
directives that only work as headers (`frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`)
aren't sent from GitHub Pages. The local server, `serve.py`, sends them. It also refuses to serve
hidden files and folders such as `.git`, since it's reachable from other devices on your Wi-Fi.

## Checking it yourself

- `node tools/scan-code.js` scans the app's code for anything that could turn file data into running
  code or reach the network: `eval`, `new Function`, HTML built from variables, `fetch` and similar.
  It also checks that `index.html` still has the Content-Security-Policy and no inline scripts.
  Run it after changing the code; it exits with an error if it finds something.
- `tools/safety-test.html` (open it through `python serve.py`) feeds the safety check a set of hostile
  project files (huge numbers, millions of objects, prototype-pollution keys, script-like text) and
  checks that each is refused or tamed and still runs.

`serve.py` / `start-server.bat` are a plain static file server for local and same-Wi-Fi testing.
They aren't meant to be exposed to the internet.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through GitHub:
open the repository's **Security** tab and choose **Report a vulnerability**
(see [GitHub's guide](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Please include:

- what the problem is and what someone could do with it
- steps to reproduce it (a sample project `.json` file helps)
- the browser and device you used

You should get a reply within about a week. Once a fix is published, the report can be made public.
