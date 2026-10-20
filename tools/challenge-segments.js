/*
 * Building blocks for the built-in challenges ("segments"): small working machines, each fitting
 * in one cell of a level (about 500 px wide, 240 px tall). tools/build-challenges.js strings
 * several together -- the END of each one (a button or detonator plunger) sets off the next one's
 * starter -- and takes pieces out for the player to put back.
 *
 * A segment is built flowing left to right in cell units: u = 0 at the cell's left edge, the
 * ground (or shelf top) at y = g. mirror() flips a finished segment to flow right to left.
 *
 * Objects tagged `_rm: '<key>'` are pieces that may be taken out; `rm` describes each key. The
 * object of type 'END' marks where the segment's last action lands: the builder replaces it with
 * a button / plunger (that sets off the next segment), the goal, or a gateway.
 *
 * Also loaded by tools/segment-lab.html, which checks every segment in the real simulation.
 */
(function (root) {
  'use strict';
  const r1 = (v) => Math.round(v * 10) / 10;
  const D = Math.PI / 180;

  // the rolling thing a theme uses (dropped by cranes, pushed by runners)
  const BALLS = {
    boulder: { type: 'boulder', r: 20, color: '#78716c' },
    marble: { type: 'marble', r: 14 },
    pumpkin: { type: 'pumpkin', r: 20, density: 0.004 },
    ornament: { type: 'ornament', r: 16 },
    stonewheel: { type: 'stonewheel', r: 20 },
  };
  const ball = (th, extra) => Object.assign({}, BALLS[th.ball || 'marble'], extra);

  // a short static post that keeps runaway things inside the cell
  const post = (u, g, h = 50) => ({ type: 'ramp', x: u, y: g - h / 2, w: h, h: 8, angle: 90, color: '#6b7280', _post: true });
  // a fixed block (a wall to jump over, a ledge to stand on)
  const block = (u, y, w, h, color = '#6b7280') => ({ type: 'ramp', x: u, y, w, h, angle: 0, color });

  const S = {};

  // ---------------------------------------------------------------- dominoes
  // A cannon (or a slingshot that needs loading) knocks over a row of dominoes.
  S.dominoes = {
    label: 'domino run',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, r = rand(), sling = r < 0.3, truck = !sling && r < 0.6, objs = [];
      if (truck) { // a dump truck drives into the first domino, then stops and tips out its load
        objs.push({ id, type: 'tipper', x: 75, y: g - 27, w: 110, h: 50, speed: 3, accel: 0.12, dumpAfter: 0.8, load: 8, trigger: 'touch', delay: 0, direction: 1 });
      } else if (sling) {
        objs.push({ id, type: 'slingshot', x: 50, y: g - 20, angle: -8, power: 9, trigger: 'touch', delay: 0 });
        const a = -8 * D;
        objs.push({ type: 'marble', x: r1(50 - Math.cos(a) * 30), y: r1(g - 68 - Math.sin(a) * 30), r: 12, _rm: 'load' });
      } else {
        objs.push({ id, type: 'cannon', x: 55, y: g - 13, angle: -5, power: 7, trigger: 'touch', delay: 0.3 });
      }
      const u0 = sling ? 180 : truck ? 175 : 115, n = Math.floor((W - 110 - u0) / 34) + 1;
      const run = 2 + (rand() < 0.5 ? 1 : 0), a = 2 + Math.floor(rand() * (n - 3 - run));
      for (let i = 0; i < n; i++) {
        const d = { type: 'domino', x: u0 + i * 34, y: g - 30, color: th.domino };
        if (i >= a && i < a + run) d._rm = 'gap';
        objs.push(d);
      }
      objs.push({ type: 'END', x: u0 + (n - 1) * 34 + 40, y: g }, post(W - 6, g));
      return { objs, rm: { gap: 'missing dominoes', load: 'nothing in the slingshot' } };
    },
  };

  // ---------------------------------------------------------------- wrecking ball
  // The ball swings into a row of pillars, which topple like giant dominoes.
  S.wrecking = {
    label: 'wrecking ball',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      objs.push({ id, type: 'wreckingball', x: 70, y: g, boomH: 175, reach: 115, chain: 105, pull: 70, r: 22, density: 0.04, trigger: 'touch', delay: 0, color: th.machine || '#f59e0b' });
      const xs = [230, 310, 390], miss = 1;
      xs.forEach((u, i) => objs.push(Object.assign({ type: 'pillar', x: u, y: g - 60, w: 24, h: 120, color: '#d6d3d1' }, i === miss ? { _rm: 'pillar' } : {})));
      objs.push({ type: 'END', x: 460, y: g });
      return { objs, rm: { pillar: 'a missing pillar' } };
    },
  };

  // ---------------------------------------------------------------- crane drop
  // A tower crane drops its load onto a slope that rolls it to the end.
  S.crane = {
    label: 'crane drop',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [], lid = id + 'ld';
      objs.push({ id, type: 'crane', x: 40, y: g, h: 190, jib: 215, reach: 140, cable: 60, holds: lid, trigger: 'touch', delay: 0, color: th.machine || '#facc15' });
      objs.push(ball(th, { id: lid, x: 180, y: g - 100 }));
      objs.push({ type: 'ramp', x: 240, y: g - 39, w: 250, h: 14, angle: 22, color: th.shelf, _rm: 'ramp' });
      objs.push({ type: 'END', x: 375, y: g }, post(W - 6, g));
      return { objs, rm: { ramp: 'no slope under the crane' } };
    },
  };

  // ---------------------------------------------------------------- fuse
  // A match strikes and lights a fuse that burns to a cannon, which lobs a ball over a wall.
  S.fuse = {
    label: 'fuse and cannon',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      objs.push({ id, type: 'match', x: 40, y: g - 20, angle: 0, burnTime: 5, reach: 30, trigger: 'touch', delay: 0 });
      objs.push({ type: 'fuse', points: [{ x: 52, y: g - 36 }, { x: 70, y: g - 4 }, { x: 150, y: g - 4 }, { x: 196, y: g - 8 }], burnSpeed: 160, trigger: 'fire', delay: 0, _rm: 'fuse' });
      objs.push({ type: 'cannon', x: 225, y: g - 13, angle: -62, power: 6.5, trigger: 'fire', delay: 0.2 });
      objs.push(block(330, g - 40, 20, 80));
      objs.push({ type: 'END', x: 415, y: g }, post(W - 6, g));
      return { objs, rm: { fuse: 'the fuse is missing' } };
    },
  };

  // ---------------------------------------------------------------- car jump
  // A car drives up a launch ramp and jumps a low wall.
  S.carjump = {
    label: 'car jump',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      objs.push({ id, type: th.car || 'car', x: 55, y: g - 16, w: 70, h: 26, speed: 8, accel: 0.3, trigger: 'touch', delay: 0, direction: 1 });
      objs.push({ type: 'ramp', x: 190, y: g - 15, w: 110, h: 10, angle: -16, color: th.shelf, _rm: 'ramp' });
      objs.push(block(300, g - 22, 18, 44));
      objs.push({ type: 'END', x: W - 50, y: g }, post(W - 6, g));
      return { objs, rm: { ramp: 'no ramp to jump the wall' } };
    },
  };

  // ---------------------------------------------------------------- trampoline
  // A cannon on a ledge fires down onto a trampoline, which bounces the ball over a wall.
  S.trampoline = {
    label: 'trampoline bounce',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      objs.push(block(55, g - 140, 90, 12));
      objs.push({ id, type: 'cannon', x: 55, y: g - 159, angle: 25, power: 5, trigger: 'touch', delay: 0.2 });
      objs.push({ type: 'trampoline', x: 200, y: g - 8, w: 100, angle: 0, _rm: 'trampoline' });
      objs.push(block(300, g - 25, 18, 50));
      objs.push({ type: 'END', x: W - 50, y: g }, post(W - 6, g));
      return { objs, rm: { trampoline: 'no trampoline' } };
    },
  };

  // ---------------------------------------------------------------- zig-zag
  // A ball rolls off a high ledge and zig-zags down two ramps, back to the start side.
  S.zigzag = {
    label: 'zig-zag ramps',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      objs.push(block(55, g - 190, 90, 12));
      objs.push({ id, type: 'cannon', x: 40, y: g - 209, angle: 0, power: 3, trigger: 'touch', delay: 0.2 });
      objs.push({ type: 'ramp', x: 220, y: g - 160, w: 230, h: 12, angle: 16, color: th.shelf });
      objs.push({ type: 'ramp', x: 330, y: g - 88, w: 250, h: 12, angle: -16, color: th.shelf, _rm: 'ramp' });
      objs.push({ type: 'cauldron', x: 405, y: g - 27, w: 70 }); // catches the ball if the lower ramp is missing
      objs.push({ type: 'END', x: 50, y: g }, post(6, g));
      return { objs, rm: { ramp: 'a ramp is missing' }, endsLeft: true };
    },
  };

  // ---------------------------------------------------------------- runner and boulder
  // A walker strides along and shoves a ball to the end.
  S.runner = {
    label: 'push along',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [], who = th.walker || 'runner';
      objs.push({ id, type: who, points: [{ x: 40, y: g - 30 }, { x: 330, y: g - 30 }], speed: 150, trigger: 'touch', delay: 0 });
      objs.push(ball(th, { x: 200, y: g - 22, _rm: 'ball' }));
      objs.push({ type: 'END', x: 420, y: g }, post(W - 6, g));
      return { objs, rm: { ball: 'nothing to push' } };
    },
  };

  // ---------------------------------------------------------------- slinky
  // A slinky walks down a stairway and topples a few dominoes.
  S.slinky = {
    label: 'slinky stairs',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [];
      // 4 steps of 50 x 30 going down to the right: tops at g-120 .. g-30, centre (130, g-60)
      objs.push({ type: 'stairs', x: 130, y: g - 60, steps: 4, stepW: 50, stepH: 30, dir: 1, color: '#9ca3af', _rm: 'stairs' });
      objs.push({ id, type: 'slinky', x: 45, y: g - 126, hop: 50, time: 0.5, hops: 12, dir: 1, stopOnFlat: true, trigger: 'touch', delay: 0 });
      for (let i = 0; i < 4; i++) objs.push({ type: 'domino', x: 252 + i * 34, y: g - 30, color: th.domino }); // its last hop lands on the first
      objs.push({ type: 'END', x: 252 + 3 * 34 + 40, y: g }, post(W - 6, g));
      return { objs, rm: { stairs: 'no stairway' } };
    },
  };

  // ---------------------------------------------------------------- escalator
  // Switched on, an escalator carries a ball up to a high ledge, where it rolls to the end.
  S.escalator = {
    label: 'escalator',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [], top = g - 128;
      objs.push({ id, type: 'escalator', x: 220, y: g - 73, w: 260, angle: -28, speed: 150, dir: 1, trigger: 'touch', delay: 0 });
      objs.push(ball(th, { x: 140, y: g - 64, _rm: 'ball' }));
      objs.push(post(100, g, 34)); // keeps the ball on the belt until it starts
      objs.push(block(420, top + 6, 150, 12, th.shelf || '#a0703c'));
      objs.push({ type: 'END', x: 395, y: top }, post(492, top, 30));
      return { objs, rm: { ball: 'nothing on the escalator' } };
    },
  };

  // ---------------------------------------------------------------- balloon and seesaw
  // A crane lets go of a balloon; it rises under the seesaw's low end and tips it, and the box on
  // the high end slides off onto the end.
  S.seesaw = {
    label: 'balloon seesaw',
    build(c, th, rand, id) {
      const g = c.g, W = c.W, objs = [], bid = id + 'bl';
      objs.push({ id, type: 'crane', x: 470, y: g, h: 190, jib: 150, reach: 80, cable: 140, holds: bid, direction: -1, trigger: 'touch', delay: 0, color: th.machine || '#facc15' });
      objs.push({ id: bid, type: th.balloon || 'balloon', x: 390, y: g - 22, trigger: 'none' });
      objs.push({ type: 'seesaw', x: 300, y: g - 100, w: 260, angle: 18, tipTo: -40 });
      objs.push({ type: 'present', x: 210, y: g - 153, trigger: 'none', color: th.box || '#dc2626', _rm: 'box' });
      objs.push({ type: 'END', x: 140, y: g }, post(6, g));
      return { objs, rm: { box: 'nothing on the seesaw' }, endsLeft: true };
    },
  };

  // ---------------------------------------------------------------- mirror a finished segment
  function mirror(objs, cx) {
    const m = (x) => r1(2 * cx - x);
    for (const o of objs) {
      if (o.points) o.points = o.points.map((p) => ({ x: m(p.x), y: p.y }));
      if (o.x != null) o.x = m(o.x);
      switch (o.type) {
        case 'cannon': case 'slingshot': o.angle = -180 - o.angle; break;
        case 'stairs': case 'slinky': o.dir = -(o.dir ?? 1); break;
        case 'seesaw': o.angle = -(o.angle ?? 18); o.tipTo = -(o.tipTo ?? -40); break;
        case 'ramp': if (o.angle !== 90) o.angle = -(o.angle || 0); break;
        case 'car': case 'tipper': case 'crane': case 'wreckingball': case 'monstertruck': case 'tractor': case 'bulldozer': case 'pinkcar':
          o.direction = -(o.direction ?? 1); break;
        default: if (o.angle) o.angle = -o.angle;
      }
    }
    return objs;
  }

  /*
   * Build segment `kind` in cell c = { x0, x1, g, flip } with starter id `id`. Returns the objects in
   * world coordinates (the END marker included) and the removal keys it offers.
   */
  function place(kind, c, th, rand, id) {
    const W = c.x1 - c.x0, seg = S[kind].build({ g: c.g, W }, th, rand, id);
    const objs = seg.objs.filter((o) => o);
    for (const o of objs) {
      if (o.x != null) o.x = r1(o.x + c.x0);
      if (o.points) o.points = o.points.map((p) => ({ x: r1(p.x + c.x0), y: p.y }));
    }
    if (c.flip) mirror(objs, (c.x0 + c.x1) / 2);
    const used = new Set(objs.filter((o) => o._rm).map((o) => o._rm));
    const rm = {};
    for (const k of used) rm[k] = { label: seg.rm[k], n: objs.filter((o) => o._rm === k).length };
    return { objs, rm, endsLeft: !!seg.endsLeft !== !!c.flip };
  }

  const api = { S, place, mirror, BALLS, KINDS: Object.keys(S) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CRSegments = api;
})(typeof window !== 'undefined' ? window : globalThis);
