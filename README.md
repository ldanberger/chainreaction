# Chain Reaction Workbench

An interactive, browser-only workbench for building Rube Goldberg–style chain reactions.
No backend, no login, no build step, and no internet needed: every resource (including the
Matter.js physics engine in `lib/`) is stored in this folder.

**See it running:** https://ldanberger.github.io/chainreaction/

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
On a phone, the Toolkit/Properties drawer, tab bar and top bar hide while a run is in progress,
so the work area gets the whole screen (portrait or landscape).

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
| Stairway | Fixed flight of steps: number of steps, step depth and height, going down left or right. |
| Brick / Brick wall | Heavy loose bricks; the wall builds rows × columns of them (optionally staggered) that tumble when hit. |
| Text block | Solid letters: things bounce off (and through) the real letter shapes. Rotate it with the handle. |
| **Toys:** Slinky | Flips end over end down a stairway (or any steps), pushing what it lands on. Set *Hop length* to the step depth; it can keep walking on flat ground. |
| **Launchers:** Slingshot | Put a marble (or anything) in the dotted circle at its pouch; when triggered it fires the load along its aim. Use *Size* for a bigger one. |
| **Fire:** Bomb | Once lit, its fuse fizzes for the fuse time, then it blasts nearby objects away and sets off touch-triggered ones. |
| **Vehicles:** Spaceship | Flies its path carrying another object hidden inside (*Carries*), then lets it out at the end of its path or after *Drop after* seconds: walkers and flyers (like the alien) come down a tractor beam to the start of their own path and set off; anything else drops out of the hatch. Then it can fly away. |
| **Controls:** Button | Big push button with an on-screen button in the command bar (and an optional key). Pressing it while running, or bumping something into it, sets off up to three linked objects. |
| **Controls:** Countdown | Counts down on screen (e.g. *T-10*), then sets off up to three linked objects: launch a rocket, fire a cannon, start a car. |
| **Halloween** | Jack-o'-lantern (rolling, glowing), skeleton (walks a path), witch and ghost (fly a path), cauldron (catches things), tombstone (topples). |
| **Christmas** | Christmas tree (lights come on), present (bursts open with confetti and a jack-in-the-box, can trigger another object), snowman (topples), Santa's sleigh (flies a path), ornament (bouncy bauble). |
| **Birthday** | Birthday cake (candles light things above them and pop balloons), arched text ("HAPPY BIRTHDAY", solid rainbow letters), gift box, party popper (confetti blast that pushes things). |
| **Weather** | Light and dark clouds (drift, optionally for a set distance), sun (can fade away and darken the sky), rain (drops stop at the first solid thing they hit, and put out the fires they reach), snow cloud and snow (flakes settle where they land and build up, but not near a lit fire), umbrella (keeps the rain and snow off whatever is under it), rainbow (can fade in after the rain; tick *Solid* to make it a bridge), pot of gold (bursts into a shower of coins when touched or triggered) and lightning (strikes the first thing below, lights or sets it off, flashes the sky, thunder sound). Rain and lightning can *Follow* a cloud. |
| **Machines** | Seesaw (a plank on a pivot; by default it rests tilted and tips over when its low end is pushed — say, by a rising balloon — dropping whatever sits on the high end; or set it to move freely by weight), escalator (a moving stair belt that carries things up or down and drops them off the end; drag its end handles) and elevator (rises, then drops its load off on the exit side by pushing it across onto a ledge level with the top, or by tipping it; a gate keeps the load on board on the way up). People and animals that walk a path ride it too: standing on the platform they're carried up (or down) and then walk on along their path at the new height; the pusher shoves them off like any load, and anyone standing underneath is pushed out of the way as it comes down. Set the elevator's Y so the platform is level with the floor and walkers can step straight on. |
| **Prehistoric** | Caveman and cavewoman (walk or wander a path), triceratops, long-neck and woolly mammoth (heavy walkers), pterodactyl (flies a path), campfire and torch (burn, light things above them, go out in the rain, keep snow away), cave (scenery), boulder and stone wheel (heavy rollers). |
| **Barbie** | Fashion doll, ball-gown doll, roller-skate doll and boy doll (walk or wander a path), pink pony, pink convertible, dream house (scenery), lawn flamingo (topples like a domino), heart balloon, handbag and high heel. |
| **Fire:** Fireworks | A launch tube. Once lit (fire, a fuse, at start or triggered) it shoots *Shells* up one after another; each bursts at about *Burst height* into coloured sparks that light fuses and other things near the burst. |
| **Construction** | Tipper truck (drives, stops after *Dumps after* seconds, tips its bed and dumps a load of dirt), tower crane (holds any object on its hook — pick it under *Holds* — and drops it when triggered), wrecking-ball crane (the ball is held pulled back, then swings when triggered), pillar (a tall concrete column that topples like a giant domino), steel girder, detonator plunger (bump or trigger it and it sets off what its wire leads to, e.g. dynamite), dynamite (blasts like a bomb once lit), dirt mound (fixed, things roll over or launch off it) and traffic cone. |
| **Layers:** Gateway | Doorway to another layer (default: the next one). When something arrives in it (anything already inside at the start doesn't count), it switches to that layer after **Switch after (s)** (default 1) and runs it. Tick **Arrival only** for a gateway that just marks where things come in from another layer. |
| **Fire:** Ring of fire | Hoop things pass through. Dark until a match, fuse, dragon or burning object lights it; whatever passes through a lit ring catches fire and lights fuses it touches. |

**Paths** (fuse, runner, dragon): drag the points; double-click the line to add a point, double-click a point to remove it.
Set **Wander randomly** on anything that follows a path (runner, alien, animals, dragon, flyers) to let it roam from its first point instead of following the path: it turns now and then and bounces off whatever it bumps into. *Along the ground* keeps it at its starting height; *Anywhere* lets it roam in every direction (flying things keep clear of the ground). The randomness is the same on every run, so Step and Run still match.

**Triggers**: active objects start *At start*, *When touched* (bumped by something moving, a fuse ending on them, or dragon fire), *When touched by…* one particular object you pick (only contact with that object counts: not bumps, fire or anything else), or *Never*, with an optional delay. Fuses, cannons, matches and rings of fire are ignitable by fire, a match or a fuse; a fuse set to *Only when lit* ignores bumps.

**Size**: most objects have a *Size* in Properties (the exceptions are fuses and objects with their own size settings, like ramps, stairways, text and walls): 1 = normal, 2 = twice as big, 0.5 = half. It scales the drawing and the physics body.

**Auto-stop**: a run stops by itself once nothing has happened for 3 seconds (nothing moving, burning, waiting on a delay or about to fire). Press Run to carry on.

Dashed runner/dragon paths are editing guides and are hidden while a run is in progress. Pinball layers show a score in the command bar.

## Challenges

**🏆 Challenges** (in the menu) has 130 built-in chain-reaction puzzles in classic, prehistoric, Barbie, Halloween, space (low gravity), Christmas, birthday and weather themes. Object and piece counts are approximate and leave out decoration; any approach that sets off the goal counts.

| Difficulty | Count | Objects in the chain | Pieces to add |
|---|---|---|---|
| Easy | 30 | up to 10 | 3 |
| Medium | 40 | about 30 | 10 |
| Hard | 30 | about 50 | 5 |
| Very hard | 30 | about 30 | about 7, of several kinds |

10 of the hard and very hard ones have two levels linked by gateways. Each challenge has a 🏁 goal object; when it goes off, a **Challenge complete!** banner appears and the challenge is ticked off. The Challenges window shows a solved counter and every challenge, filterable by difficulty, multi-level or not solved yet. Pick one to **Play** (or play again; switching between challenges never asks to save), or **Show solution** to load it with the answer's pieces already placed (a challenge solved that way is marked 💡 rather than ✓). Progress is kept in this browser.

**Challenge files.** Challenges are data, not code. The built-in set is the file `challenges/builtin.json`, made by `node tools/build-challenges.js`, which also writes the copy the app loads, `js/challenges-data.js`. **Load challenges…** (in the menu, or **Load challenge file…** in the Challenges window) adds another set, for example one a friend made. It goes through the same safety check as a project file, is kept in this browser, and can be removed again with **Remove set**. [CHALLENGE-PROMPT.md](CHALLENGE-PROMPT.md) describes the format and has a prompt you can share for making new challenge files, by hand or with an AI assistant. `tools/challenge-test.html` checks any challenge file.

In your own projects, tick **🏁 Completes the challenge** on the object whose going off means success (anything with a trigger can be a goal).

## Challenge mode

Make a puzzle out of a project: build the setup, then turn **Challenge ON** (the button next to Run) and save. Everything already in the project is now locked — players can select things to read their settings, but can't move, change, copy or delete them, or change the layers' settings — and they solve it by adding their own pieces, which stay fully editable.

With the challenge OFF, **Challenge pieces** at the top of the Toolkit sets which pieces players may add: *All*, or *Choose* and tick the pieces on their tiles. With the challenge ON the Toolkit offers only those pieces (marked ✓), and pasting is limited to them too. The challenge setting, the allowed pieces and which objects are locked are all saved in the project file. Turning the challenge OFF unlocks everything again.

## Layers

Each layer is an independent scene shown as a tab. Close a tab with × to put the layer away; reopen it from **Layers ▾**, which also renames, duplicates and deletes layers.

To move or reuse objects on another layer, select them and press **Copy** (Ctrl+C), switch to the other tab and press **Paste** (Ctrl+V). Gateways chain layers into one longer run.

**Selecting several objects**: Shift- or Ctrl-click objects, Shift-drag on empty space to draw a selection box, or press Ctrl+A for everything. On a phone, turn on **Multi** in the ☰ menu, then tap objects or drag a box. Drag any selected object to move them all. Copy, paste, duplicate, delete, the arrow keys and *Size (all)* work on the whole group, and links between copied objects are kept.

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
- **Files from other people are safe to open.** A project file is only data. Every project goes through a safety check (`js/safety.js`): files over 5 MB are refused, and there are limits of 50 layers, 1,500 objects per layer (6,000 in all) and 400 points per path. Every number is clamped to its allowed range (a stairway has at most 100 steps, for example), and colours, choices, text and ids are validated. The app tells you if it had to adjust anything. The page's Content-Security-Policy also blocks all network access and any script that isn't the app's own. See [SECURITY.md](SECURITY.md).
- The run speed is saved with the project too (Dragon's Journey starts at 0.25×).
- Work in progress is also autosaved in the browser, so a refresh doesn't lose it.
- Examples live in `js/examples.js` (same format as a saved file): Chain Reaction, Dragon's Spark, Race Day (3 layers), Pinball, Ring of Fire, Orbits, Zoo Parade, Traffic Jam, Bounce House, Rocket Relay, Alien Visit and Stormy Day (a sunny day with animals wandering at random turns stormy: dark clouds, rain, and lightning that sets off a bomb), Dragon's Journey (7 layers: a dragon flies out of an arrival gateway, across the top of each layer and straight into the next one while a scene plays out below — dominoes, a slinky, a countdown launch, a party, a rainy day with a spaceship and a rainbow, a snowy Stone Age cave, and a pink party that leads back to the start). Dragon's Journey is what opens on a first visit; after that the app restores your autosaved work. Three puzzles show off Challenge mode: **Challenge 1 (easy)** — roll the marble into the gift (add ramps); **Challenge 2 (medium)** — knock over every domino, including the row on the raised platform (add dominoes, ramps, stairways); **Challenge 3 (hard)** — pop the balloon by carrying the torch's fire to the fuse (add rings of fire, ramps, marbles).

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
js/objects-more.js    vehicles, animals and bouncers pack (built on shared behaviours), gateway
js/objects-extra.js   stairway, slinky, button, countdown, text block, spaceship, escalator, elevator
js/objects-themes.js  bricks, bomb, slingshot; Halloween, Christmas and Birthday groups
js/objects-weather.js clouds, sun, rain, snow, umbrella, rainbow, pot of gold, lightning (thunder is made with Web Audio, no sound files)
js/objects-prehistoric.js  cave people, dinosaurs, mammoth, campfire, torch, cave, boulder, stone wheel
js/objects-barbie.js  dolls, pony, pink convertible, dream house, flamingo, heart balloon, handbag, high heel
js/objects-construction.js  fireworks; tipper truck, tower crane, wrecking ball, pillar, girder, detonator plunger, dynamite, dirt mound, traffic cone
js/sim.js             physics simulation (fixed 60 Hz step, so Step and Run match)
js/examples.js        built-in example projects
js/app.js             editor: toolkit, tabs/layers, properties, commands, files
js/safety.js          safety check every project goes through (limits, clamping, validation)
js/theme-init.js      applies the saved light/dark theme before the page draws
tools/scan-code.js    security scan of the code: `node tools/scan-code.js`
tools/safety-test.html  hostile-file test page (open through `python serve.py`)
tools/challenge-test.html  checks every challenge in a challenge file: unsolved as it comes, solved by its solution
tools/build-challenges.js  builds the built-in challenge file: `node tools/build-challenges.js`
challenges/builtin.json  the built-in challenges (130), as a plain challenge file
js/challenges-data.js the same data for the app to load (generated; the page can't fetch files)
CHALLENGE-PROMPT.md   the challenge file format, and a prompt to share for making new ones
```
