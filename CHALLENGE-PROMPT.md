# Making a challenge file

A **challenge file** is a `.json` file holding a set of puzzles for Chain Reaction Workbench
(https://ldanberger.github.io/chainreaction/). Players load it with **Load challenges…** (in the menu)
or **Load challenge file…** in the 🏆 Challenges window. It's kept in their browser, appears as its own
set, and their progress is tracked.

The built-in set is itself a challenge file, `challenges/builtin.json`. It's made by
`tools/build-challenges.js`, which is a good example of generating a set with code.

**To check a file before sharing it**, run `python serve.py`, open
`http://localhost/tools/challenge-test.html` and choose your file. Every challenge should say PASS,
which means it isn't solved as it comes and its stored solution does solve it.

---

## The prompt

Copy everything below the line into an AI assistant (or hand it to a person), then add what you'd
like, for example: *"Make 10 easy and 5 medium challenges with a Halloween theme."*

---

You are creating a **challenge file** for *Chain Reaction Workbench*, a browser physics sandbox (built on
Matter.js) for Rube Goldberg machines. Produce **one JSON file** in exactly the format below. Output
only the JSON.

### File format

```json
{
  "format": "chain-reaction-challenges",
  "version": 1,
  "id": "my-halloween-set",
  "name": "Halloween puzzles",
  "author": "Your name",
  "description": "One sentence about the set.",
  "challenges": [ CHALLENGE, CHALLENGE, ... ]
}
```

Each **CHALLENGE**:

```json
{
  "id": "h001",
  "n": 1,
  "name": "#1 Pumpkin run",
  "difficulty": "easy",
  "theme": "Halloween",
  "emoji": "🎃",
  "goal": "Finish the chain reaction to the spooky box",
  "objects": 9,
  "pieces": 3,
  "allowed": ["domino"],
  "project": PROJECT,
  "solution": [ [ OBJECT, OBJECT, OBJECT ] ]
}
```

- `id`: unique within the file. Letters, digits, `.`, `_`, `:`, `-` only, up to 64 characters.
  Also used for the file's `id`.
- `difficulty`: one of `"easy"`, `"medium"`, `"hard"`, `"very hard"`.
- `objects` / `pieces`: roughly how many objects are in the chain, and how many the player must
  add (decoration and text not counted).
- `allowed`: the object types the player may add. They're the only ones offered in their toolkit.
- `solution`: one list per layer of the project, holding the objects that solve it. Players can ask
  to see it ("Show solution").
- `machines` (optional): short names of the contraptions in it, e.g. `["crane drop", "domino run"]`,
  shown in the Challenges window.

**PROJECT** (one puzzle; a project can have several layers, which are levels):

```json
{
  "name": "#1 Pumpkin run",
  "speed": 1,
  "challenge": { "on": true, "allowed": ["domino"] },
  "activeLayerId": "h001L1",
  "layers": [
    {
      "id": "h001L1",
      "name": "Challenge",
      "world": { "width": 1600, "height": 900, "gravity": 1, "floor": true, "walls": true, "background": "#ede9fe" },
      "objects": [ OBJECT, OBJECT, ... ]
    }
  ]
}
```

**OBJECT**: `{ "type": "<type>", "x": …, "y": …, …settings… }`. Add `"locked": true` to **every**
object in the project, so the player can't move what you built. Give an object an `"id"` only when
something refers to it (`link`, `by`, `cargo`, `cloud`, `holds`). Path objects (runners, animals, flyers) use
`"points": [{"x":…,"y":…}, …]` instead of `x`/`y`. Leave out any setting you don't need; defaults
are used.

### Rules that make a good challenge

1. **Exactly one goal per challenge**: on the last layer, set `"goal": true` on the object whose going
   off means success (a gift that opens, a balloon that pops, a popper that fires). When it goes
   off, the player has solved the challenge. Only objects that can be set off work as goals.
2. **It must not solve itself.** Take pieces out of a working machine; those pieces are the
   `solution`. Check that without them the goal never goes off.
3. **It must be solvable** by adding only `allowed` types. The `solution` must work.
4. A **single missing domino is not a gap**: a domino falling over one empty spot still reaches the
   next. Take out at least 2 in a row.
5. Put one **text** object at the top (y 60–130) saying the goal (not which pieces to add; the toolkit shows those), e.g.
   `{"type":"text","x":800,"y":60,"text":"#1 (EASY): Finish the chain to the gift","size":24,"bold":true,"color":"#581c87","locked":true}`.
   Text is solid, so keep it away from moving things. At most 60 characters per text object.
6. **Several levels**: give the project 2–3 layers. Every layer except the last ends in a `gateway`
   that something reaches, e.g. a domino falling into it:
   `{"type":"gateway","x":…,"y":…,"w":110,"h":130,"wait":0.3}`. The gateway switches to the next
   layer, which then runs. Put the goal on the last layer; `solution` has one list per layer.
7. Stay inside the world (x 0–1600, y 0–900). The floor's top is at **y = 880**.

### Proven building blocks (all distances in px; y grows downward)

- **Shelf**: a flat ramp, `{"type":"ramp","x":800,"y":TOP+7,"w":1360,"h":14,"angle":0}`; its top surface is at `TOP`.
  Shelves at TOP = 730, 580, 430, 280 above the floor (TOP = 880).
- **Domino row** standing on TOP: `{"type":"domino","x":X,"y":TOP-30}` (60 tall) every **34 px**
  (x = 280, 314, 348, …).
- **Cannon** at the start of a row: `{"type":"cannon","x":170,"y":TOP-13,"angle":-5,"power":7,"trigger":"start","delay":0.3}`.
  It knocks the first domino over. Use `"trigger":"touch"` for a cannon that something else must
  set off: a marble the player drops on it (`{"type":"marble","x":144,"y":TOP-80,"r":14}`), or a
  button's link.
- **Button** where a row ends: `{"id":"b1","type":"button","x":LASTX+40,"y":TOP-8,"link":"<id of next row's cannon>","onscreen":false}`.
  The last domino falls on it and it fires the linked object. Give that object
  `"trigger":"by","by":"b1"` so nothing else can set it off early (a `"touch"` trigger also works, but
  anything bumping into it fires it). `"onscreen":false` keeps the button out of the command bar,
  so players can't just press it. `link2`/`link3` fire more objects. A detonator `plunger` works the
  same way, with a wire drawn to what it sets off.
- **Goal gift** where the last row ends: `{"type":"giftbox","x":LASTX+36,"y":TOP-18,"trigger":"touch","goal":true}`.
- **Hole in a shelf**: split the shelf into two ramps with a gap of 2–3 domino spacings; the
  solution is a ramp patch over the hole plus the dominoes that stand on it.
- **Slingshot row starter**: `{"id":"s1","type":"slingshot","x":170,"y":TOP-20,"angle":-8,"power":9,"trigger":"touch"}`,
  first domino at x 300. Left empty, it needs a marble in its pouch: `{"type":"marble","x":140.3,"y":TOP-63.8,"r":12}`.
- **Seesaw drop**: `{"type":"seesaw","x":700,"y":780,"w":260,"angle":18,"tipTo":-40}` (its low end
  on the right) with a box resting on the high end (`{"type":"present","x":610,"y":727,"trigger":"none"}`).
  A `balloon` the player places under the low end (`x 790, y 858`) rises, tips it, and the box
  slides off onto a button at x 540.
- **Marble down a ramp**: `{"type":"ramp","x":250,"y":600,"w":300,"angle":20}` with
  `{"type":"marble","x":130,"y":520}` on it rolls off at about x 500 and knocks dominoes starting
  at x 560.
- **Only one object may set something off**: `"trigger":"by","by":"<that object's id>"`.
- **More machines** (they're what the built-in set is made of, in `tools/challenge-segments.js`, with
  exact positions): a `wreckingball` swinging into a row of `pillar`s; a `crane` dropping its `holds`
  object onto a slope; a `match` lighting a `fuse` that ends at a `cannon` lobbing a ball over a wall;
  a `car` jumping a low wall off a ramp; a `cannon` on a ledge firing onto a `trampoline`; a `slinky`
  walking down `stairs` into dominoes; a `crane` letting go of a `balloon` under a `seesaw`; an
  `escalator` carrying a ball up to a ledge; a `runner` (or `caveman`, `skeleton`, …) pushing a ball.

### Object types you can use

Basics: domino, marble, ramp, curve, stairs, text, brick, brickwall ·
Launchers: cannon, fuse, slingshot ·
People: runner, jumper, alien ·
Vehicles: car, monstertruck, bus, firetruck, tractor, motorcycle, bicycle, skateboard, tank, train,
gokart, dumptruck, ambulance, policecar, bulldozer, airplane, helicopter, hotairballoon, rocket, ufo,
blimp, spaceship ·
Animals: dragon, dog, cat, horse, elephant, cheetah, mouse, turtle, penguin, dinosaur, snake, cow,
bird, bee, bat, butterfly, eagle, frog, kangaroo, rabbit ·
Bouncers: trampoline, superball, beachball, basketball, tennisball, springpad, jelly, rubberrail,
bouncycastle, mushroom, balloon, fan ·
Pinball: bumper, target, spinner, paddle ·
Fire: match, firering, bomb, fireworks ·
Layers: gateway ·
Toys: slinky ·
Controls: button, countdown ·
Machines: escalator, elevator, seesaw ·
Halloween: pumpkin, skeleton, witch, ghost, cauldron, tombstone ·
Christmas: xmastree, present, snowman, sleigh, ornament ·
Birthday: cake, giftbox, archtext, popper ·
Weather: cloud, snowcloud, darkcloud, sun, rain, snow, umbrella, rainbow, potofgold, lightning ·
Prehistoric: caveman, cavewoman, triceratops, brontosaurus, pterodactyl, mammoth, campfire, torch,
cave, boulder, stonewheel ·
Barbie: fashiondoll, gowndoll, skaterdoll, boydoll, pony, pinkcar, dreamhouse, flamingo,
heartballoon, handbag, highheel ·
Construction: tipper, crane, wreckingball, pillar, girder, plunger, dynamite, dirtmound, cone.

Most active objects have `"trigger"` (`"start"`, `"touch"`, `"by"`, `"none"`, plus some of their
own such as `"fire"`) and `"delay"` (seconds). Colours are `"#rrggbb"`. To check what settings an
object has, add it in the app and look at its Properties panel; the setting keys match the names
in `js/objects*.js`.

### Limits (a file breaking them is trimmed or refused)

Up to 5 MB, 500 challenges, 50 layers per project, 1,500 objects per layer, 400 points per path.
Numbers are clamped to each setting's range (a stairway has at most 100 steps), text is at most 80
characters (60 in a text block), and ids follow the pattern above.
