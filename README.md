# Chain Reaction Workbench

An interactive, browser-only workbench for building Rube Goldberg–style chain reactions.
No backend, no login, no build step, and no internet needed: every resource (including the
Matter.js physics engine in `lib/`) is stored in this folder.

Current version: see `js/version.js` (shown next to the title in the app).

## Running

- **Desktop, quickest:** open `index.html` directly in a browser.
- **Hosted / phone testing (default port 80):** run `start-server.bat` (or `python serve.py`). It prints
  `http://localhost/` plus a LAN address such as `http://192.168.x.x/` to open on a
  phone on the same Wi-Fi. It's a plain static file server (no app backend) with caching disabled.
  Windows may ask to allow Python through the firewall the first time.
- **Phone home screen:** open the LAN address, then *Add to Home Screen* (iOS Safari) or
  *Install app* / *Add to Home screen* (Android Chrome). It opens full-screen; **pull down on the
  top bar** to refresh, since installed apps have no browser refresh button.

Layouts adapt to desktop, phone portrait (work area on top, Toolkit/Properties drawer below)
and phone landscape (narrow side column). On touch screens: tap a Toolkit item to add it,
drag objects to move them, pinch with two fingers to zoom, double-tap a path to add/remove points.

## Versioning

The version starts at 1.00 and goes up by **0.01 with every change**. When bumping it, update
`js/version.js` **and** the `?v=` numbers on the `<link>`/`<script>` tags in `index.html`,
so phones and home-screen installs load the new files instead of cached copies.

## Layout

| Area | What it does |
|---|---|
| Toolkit (upper left) | Drag an object into the work area (or double-click it to drop it in the centre). |
| Properties (lower left) | Edit the selected object; with nothing selected, edit the layer (size, gravity, floor, walls, background). |
| Work area (centre) | One tab per open layer. Click to select, drag to move, round handle to rotate, drag empty space to pan, wheel to zoom. |
| Command bar (bottom) | Restart · Step · Run/Pause · speed − / + (0.1× – 8×), plus time and frame counter. |

The Toolkit shows icons only — hover (or long-press) a tile to see its name and description. Press **?** in the app for all mouse and keyboard shortcuts. The ☾ / ☀ button switches between light (default) and dark themes.

## Objects

| Object | Notes |
|---|---|
| Domino | Topples into its neighbour. Spacing about ½–¾ of its height works best. |
| Marble | Rolls and bounces; optional start velocity. |
| Ramp | Fixed plank; angle 0 makes a shelf. Drag the square end handles to change its length. |
| Curved ramp | Fixed arc (quarter-pipe, bowl). End handles change where it starts/ends; the round handle changes the radius. |
| Cannon | Fires when lit. Barrel angle 0 = right, −90 = up. Multiple shots supported. |
| Fuse line | Path that burns from its start (yellow dot) to its end, lighting whatever is at the end. |
| Runner | Person who runs along a drawn path, shoving things. |
| Alien | The green alien from `alien.jpeg`, cut out of the photo and animated (8-frame walk, arms up when climbing). Walks a drawn path like the runner. |
| Jumper | Person who jumps when triggered. |
| Race car | Accelerates while touching the ground; launches off ramps. |
| Dragon | Flies a drawn path; fire breath lights fuses/cannons and triggers touch-triggered objects. |
| **Pinball:** Bumper | Kicks the ball away, scores, can set off a linked object. |
| **Pinball:** Target | Scores when hit; a drop target falls flat. Can set off a linked object ("When hit, trigger"). |
| **Pinball:** Spinner | Bar on a pin: spins freely when hit, or turns by itself with a motor speed. |
| **Pinball:** Paddle | Flipper. Assign its **Flip key** in Properties (click the box, press a key); on-screen buttons appear for touch screens. Can also flip when triggered. Drag the round tip handles to set rest/flipped angles. |
| **Fire:** Match | Strikes when bumped (or at a set time) and lights fuses, cannons, rings and matches within reach. |
| **Vehicles** (20) | Race car, monster truck, bus, fire truck, tractor, motorcycle, bicycle, skateboard, tank, steam train, go-kart, dump truck, ambulance, police car, bulldozer drive along the ground; airplane, helicopter, hot-air balloon, rocket (its exhaust lights fuses) and UFO / blimp fly a drawn path. |
| **Animals** (20) | Dog, cat, horse, elephant, cheetah, mouse, turtle, penguin, dinosaur, snake and cow walk a drawn path; bird, bee, bat, butterfly, eagle and the dragon fly one; frog, kangaroo and rabbit hop. |
| **Bouncers** (12) | Trampoline, spring pad, jelly block, rubber rail, bouncy castle, bouncy mushroom; super ball, beach ball, basketball, tennis ball; a balloon that floats (and pops near fire) and a fan that blows things away. |
| **Fire:** Ring of fire | Hoop things pass through. Dark until a match, fuse, dragon or burning object lights it; whatever passes through a lit ring catches fire and lights fuses it touches. |

**Paths** (fuse, runner, dragon): drag the points; double-click the line to add a point, double-click a point to remove it.

**Triggers**: active objects start *At start*, *When touched* (bumped by something moving, a fuse ending on them, or dragon fire) or *Never*, with an optional delay. Fuses, cannons, matches and rings of fire are ignitable by fire, a match or a fuse; a fuse set to *Only when lit* ignores bumps.

Dashed runner/dragon paths are editing guides and are hidden while a run is in progress. Pinball layers show a score in the command bar.

## Layers

Each layer is an independent scene shown as a tab. Close a tab with × to put the layer away; reopen it from **Layers ▾**, which also renames, duplicates and deletes layers.

## Files

Everything is saved in **one JSON file**:

```json
{
  "format": "chain-reaction-workbench",
  "version": 1,
  "name": "My project",
  "activeLayerId": "L…",
  "layers": [
    {
      "id": "L…", "name": "Layer 1", "open": true,
      "world": { "width": 1600, "height": 900, "gravity": 1, "floor": true, "walls": false, "background": "#e8f1f8" },
      "objects": [
        { "id": "o…", "type": "domino", "x": 400, "y": 850, "w": 12, "h": 60, "angle": 0, "color": "#f5f0e1" },
        { "id": "o…", "type": "fuse", "points": [{ "x": 100, "y": 872 }, { "x": 300, "y": 872 }], "trigger": "start" }
      ]
    }
  ]
}
```

- **Save** writes back to the file you opened (Chrome/Edge); other browsers download a copy. **Save As…** picks a new file.
- Missing properties are filled with defaults when a file is opened; unknown object types are kept but not shown.
- Work in progress is also autosaved in the browser, so a refresh doesn't lose it.
- Examples live in `js/examples.js` (same format as a saved file): Chain Reaction, Dragon's Spark, Race Day (3 layers), Pinball, Ring of Fire, Orbits, Zoo Parade, Traffic Jam, Bounce House, Rocket Relay and Alien Visit.

## Adding new object types

Object types are registered in `js/objects.js` with `CR.defineType(name, spec)` — the comment at the top of that file lists every hook (`defaults`, `props`, `build`, `update`, `draw`, …). The toolkit, properties panel, save/load and simulation pick new types up automatically.

```
index.html            page layout
manifest.webmanifest  home-screen install info; icons/ holds the app icons
serve.py              static server on the default port 80 (start-server.bat runs it); `python serve.py 8932` for another port
lib/matter.min.js     Matter.js 0.19.0 physics engine (MIT licence)
img/                  photo-based sprites (alien sprite sheet, still, icon)
tools/                Python scripts that build img/ from alien.jpeg (see tools/README.md)
js/version.js         app version
css/styles.css        styling, light/dark themes
js/objects.js         object type registry + core objects
js/objects-more.js    vehicles, animals and bouncers pack (built on shared behaviours)
js/sim.js             physics simulation (fixed 60 Hz step, so Step and Run match)
js/examples.js        built-in example projects
js/app.js             editor: toolkit, tabs/layers, properties, commands, files
```
