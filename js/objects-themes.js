/*
 * Object pack: bricks, bomb, slingshot, and the Halloween, Christmas and Birthday
 * theme groups (each theme is its own Toolkit category).
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw;
  const { PX, PY, PANGLE, PCOLOR, PTRIG, PDELAY, num } = CR.P;
  const { flyer, walker, poly, ell, box, eye, line, dark, light } = CR.pack;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;
  const PLINK1 = (label) => ({ key: 'link', label, type: 'objref', hint: 'set the target\'s Trigger to "When touched"' });
  const rotPt = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

  // ---------------------------------------------------------------- brick + brick wall
  function drawBrick(ctx, w, h, color) {
    U.rr(ctx, -w / 2, -h / 2, w, h, 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dark(color, -0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (const [x, y] of [[-0.3, 0.1], [0.15, -0.15], [0.32, 0.2], [-0.05, 0.25]]) ctx.fillRect(x * w, y * h, 2, 2);
  }
  CR.defineType('brick', {
    label: 'Brick',
    category: 'Basics',
    description: 'A heavy brick. Stack them into towers and walls, then knock them down.',
    iconScale: 0.7,
    defaults: () => ({ w: 60, h: 24, angle: 0, color: '#b4532a', density: 0.004, friction: 0.7 }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 4, 600), num('h', 'Height', 1, 4, 300), PCOLOR(),
      num('density', 'Density', 0.0005, 0.0001), num('friction', 'Friction', 0.05, 0, 1)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { angle: o.angle * D2R, density: o.density, friction: o.friction, frictionStatic: 0.9, restitution: 0.05 });
    },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      drawBrick(ctx, o.w, o.h, o.color);
      ctx.restore();
    },
  });

  // A whole wall of loose bricks. (x, y) is the middle of the bottom row.
  function wallBricks(o) {
    const rows = Math.max(1, Math.min(40, Math.round(o.rows))); // at most 1200 bricks (see CR.LIMITS.bricks)
    const out = [], cols = Math.max(1, Math.min(Math.round(o.cols), Math.floor(1200 / rows)));
    const W = cols * o.bw;
    for (let r = 0; r < rows; r++) {
      const off = o.stagger && r % 2 ? o.bw / 2 : 0, y = o.y - r * o.bh;
      for (let c = 0; c < cols; c++) {
        let x0 = o.x - W / 2 + c * o.bw + off, w = o.bw;
        if (off && c === cols - 1) w = o.bw / 2; // keep the wall's edges straight
        out.push({ x: x0 + w / 2, y, w });
        if (off && c === 0) out.push({ x: o.x - W / 2 + o.bw / 4, y, w: o.bw / 2 });
      }
    }
    return out;
  }
  CR.defineType('brickwall', {
    label: 'Brick wall',
    category: 'Basics',
    description: 'A wall of loose bricks that tumbles when something hits it. Set the rows, columns and brick size.',
    iconSize: { w: 120, h: 90 },
    noScale: true, // sized by rows, columns and brick size
    defaults: () => ({ rows: 6, cols: 3, bw: 50, bh: 22, stagger: true, color: '#b4532a', density: 0.003 }),
    props: [PX('Centre X'), PY('Bottom row Y'), num('rows', 'Rows', 1, 1, 40, 'up to 1200 bricks in all'), num('cols', 'Columns', 1, 1, 30),
      num('bw', 'Brick length', 1, 6, 400), num('bh', 'Brick height', 1, 4, 200), { key: 'stagger', label: 'Staggered', type: 'checkbox' },
      PCOLOR(), num('density', 'Density', 0.0005, 0.0001)],
    box: (o) => ({ x: o.x, y: o.y - ((o.rows - 1) * o.bh) / 2, w: o.cols * o.bw, h: o.rows * o.bh, angle: 0 }),
    build(e, sim) {
      const o = e.o, { Bodies, Composite } = M();
      e.bricks = wallBricks(o).map((b) => Bodies.rectangle(b.x, b.y, b.w, o.bh, { density: o.density, friction: 0.8, frictionStatic: 1, restitution: 0.02 }));
      Composite.add(sim.world, e.bricks);
    },
    draw(ctx, o, s) {
      const e = s.e;
      if (e && e.bricks) {
        for (const b of e.bricks) {
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          ctx.rotate(b.angle);
          drawBrick(ctx, brickW(b), o.bh, o.color);
          ctx.restore();
        }
        return;
      }
      for (const b of wallBricks(o)) {
        ctx.save();
        ctx.translate(b.x, b.y);
        drawBrick(ctx, b.w, o.bh, o.color);
        ctx.restore();
      }
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 26, rows: 4, cols: 2, bw: 28, bh: 13 }), { e: null }); },
  });
  // un-rotated width of a rectangular brick body
  function brickW(b) {
    const v = b.vertices;
    return Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y);
  }

  // ---------------------------------------------------------------- bomb
  CR.defineType('bomb', {
    label: 'Bomb',
    category: 'Fire',
    description: 'A round bomb. Once lit (bumped, fire, a fuse or at start) its fuse fizzes for the fuse time, then it blasts everything nearby away and sets off touch-triggered objects.',
    iconScale: 0.9,
    ignitable: true,
    defaults: () => ({ r: 18, trigger: 'touch', delay: 2, radius: 170, power: 14, color: '#1f2937' }),
    props: [PX(), PY(), num('r', 'Radius', 1, 4, 200),
      { key: 'trigger', label: 'Lit', type: 'select', options: [['touch', 'When bumped or lit'], ['fire', 'Only by fire or a fuse'], ['start', 'At start'], ['none', 'Never']] },
      { ...PDELAY, label: 'Fuse time (s)' }, num('radius', 'Blast radius', 5, 10, 2000), num('power', 'Blast power', 0.5, 0, 80), PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y - 4, w: o.r * 2, h: o.r * 2 + 10, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r, { density: 0.004, restitution: 0.2, friction: 0.4 });
    },
    update(e, sim) {
      if (e.triggered && !e.active) {
        const b = e.body, p = rotPt(0, -(e.o.r + 7) * e.k, b.angle);
        sim.emit(b.position.x + p.x, b.position.y + p.y, 'spark', 2, { speed: 1.8, vy: -0.5 });
      }
    },
    activate(e, sim) { // BOOM
      const o = e.o, { Body, Composite } = M(), c = { x: e.body.position.x, y: e.body.position.y };
      const R = o.radius * e.k;
      e.done = true;
      Composite.remove(sim.world, e.body);
      for (const b of Composite.allBodies(sim.world)) {
        if (b.isStatic) continue;
        const dx = b.position.x - c.x, dy = b.position.y - c.y, d = Math.hypot(dx, dy);
        if (d > R || d < 0.01) continue;
        const k = o.power * (1 - d / R);
        Body.setVelocity(b, { x: b.velocity.x + (dx / d) * k, y: b.velocity.y + (dy / d) * k - k * 0.3 });
        Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.2);
      }
      for (const t of sim.ents) {
        if (t === e || !t.body) continue;
        const p = t.body.position;
        if (Math.hypot(p.x - c.x, p.y - c.y) <= R) sim.touch(t, true);
      }
      sim.igniteNear(c.x, c.y, R * 0.5, e);
      sim.emit(c.x, c.y, 'flash', 30, { speed: 7 });
      sim.emit(c.x, c.y, 'fire', 40, { speed: 4, life: 30 });
      sim.emit(c.x, c.y, 'smoke', 30, { speed: 2.5 });
      sim.emit(c.x, c.y, 'spark', 40, { speed: 6 });
    },
    draw(ctx, o, s) {
      const e = s.e;
      if (e && e.done) return;
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, light(o.color, 0.45));
      g.addColorStop(1, dark(o.color, -0.5));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(-r * 0.3, -r - 4, r * 0.6, 6);
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r - 4); ctx.quadraticCurveTo(4, -r - 10, 1, -r - 13); ctx.stroke();
      if (e && e.triggered && !e.active) U.glow(ctx, 1, -r - 13, 9, 'rgba(255,240,150,1)', 'rgba(255,140,0,0)');
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- slingshot
  // Local geometry (before Size): post centred on (x, y), fork tips at (±16, -52), pouch at rest
  // at (0, -48). Anything placed in the pulled-back pouch (dotted circle) is held there and
  // launched along the aim when the slingshot is triggered.
  const SLING_REST = { x: 0, y: -48 }, SLING_PULL = 30, SLING_CATCH = 75; // anything within SLING_CATCH of the pouch is loaded
  const slingPouch = (o, pulled) => {
    const a = o.angle * D2R;
    return pulled ? { x: SLING_REST.x - Math.cos(a) * SLING_PULL, y: SLING_REST.y - Math.sin(a) * SLING_PULL } : SLING_REST;
  };
  CR.defineType('slingshot', {
    label: 'Slingshot',
    category: 'Launchers',
    description: 'Load it by putting a marble (or anything) in or near its pouch — the faint circle shows how near. When triggered it fires the load along its aim. Use Size to make it bigger.',
    iconSize: { w: 60, h: 100 },
    defaults: () => ({ angle: -35, power: 16, trigger: 'start', delay: 1, color: '#8b5a2b', band: '#7c2d12' }),
    props: [PX(), PY(), { key: 'angle', label: 'Aim (°)', type: 'number', step: 1, hint: '0 = right, −90 = up' },
      num('power', 'Power', 0.5, 0, 80), PTRIG, PDELAY, PCOLOR('Frame'), PCOLOR('Band', 'band')],
    rot: { pivot: (o) => ({ x: o.x, y: o.y + SLING_REST.y }), offset: 0, dist: () => 80 },
    box: (o, s) => ({ x: s.x - 8, y: s.y - 20, w: 76, h: 84, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 10, 40, { isStatic: true, friction: 0.5 });
      e.loaded = null;
    },
    update(e, sim) {
      const o = e.o, k = e.k, { Body, Composite } = M();
      const pp = slingPouch(o, true), P = { x: o.x + pp.x * k, y: o.y + pp.y * k };
      if (!e.loaded) {
        e.loaded = Composite.allBodies(sim.world).filter((b) => !b.isStatic && !b.isSensor && Math.hypot(b.position.x - P.x, b.position.y - P.y) <= SLING_CATCH * k);
      }
      if (e.active) return;
      for (const b of e.loaded) { // hold the load in the pouch until it fires
        Body.setPosition(b, P);
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
        sim.float(b);
      }
    },
    activate(e, sim) {
      const o = e.o, a = o.angle * D2R, { Body } = M();
      for (const b of e.loaded || []) Body.setVelocity(b, { x: Math.cos(a) * o.power, y: Math.sin(a) * o.power });
      e.loaded = [];
      e.fired = sim.t;
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0;
      const snap = e && e.active ? Math.min(1, (t - e.fired) / 0.08) : 0;
      const pull = slingPouch(o, true), rest = SLING_REST;
      const pp = { x: pull.x + (rest.x - pull.x) * snap, y: pull.y + (rest.y - pull.y) * snap };
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.lineCap = 'round';
      // back band, frame, front band
      line(ctx, [[16, -52], [pp.x, pp.y]], dark(o.band, -0.2), 3);
      poly(ctx, [[-5, 20], [5, 20], [4, -20], [-4, -20]], o.color, dark(o.color, -0.5));
      line(ctx, [[0, -18], [-16, -52]], o.color, 7);
      line(ctx, [[0, -18], [16, -52]], o.color, 7);
      ctx.fillStyle = dark(o.color, -0.3);
      ctx.fillRect(-5, -6, 10, 5);
      ell(ctx, pp.x, pp.y, 7, 5, '#3f2a1a');
      line(ctx, [[-16, -52], [pp.x, pp.y]], o.band, 3);
      if (!e && !(s.icon)) { // where to put the load
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(124,58,237,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(pull.x, pull.y, 15, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(124,58,237,0.25)'; // how near the load has to be
        ctx.beginPath(); ctx.arc(pull.x, pull.y, SLING_CATCH, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    },
    icon(g) { this.draw(g, this.defaults(), { x: 0, y: 14, e: null, icon: true }); },
  });

  // =================================================================== HALLOWEEN
  CR.defineType('pumpkin', {
    label: 'Jack-o\'-lantern',
    category: 'Halloween',
    description: 'A glowing carved pumpkin that rolls and bumps like a heavy ball.',
    iconScale: 0.85,
    defaults: () => ({ r: 26, color: '#f97316', density: 0.002, restitution: 0.25 }),
    props: [PX(), PY(), num('r', 'Radius', 1, 6, 300), PCOLOR(), num('density', 'Density', 0.0005, 0.0001), num('restitution', 'Bounciness', 0.05, 0, 1)],
    box: (o, s) => ({ x: s.x, y: s.y - 3, w: o.r * 2.1, h: o.r * 2 + 8, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r, { density: o.density, restitution: o.restitution, friction: 0.5 });
    },
    draw(ctx, o, s) {
      const r = o.r, t = s.t || 0, fl = 0.75 + 0.25 * Math.sin(t * 17 + Math.sin(t * 5) * 3);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      for (const [x, rx] of [[-0.45, 0.55], [0.45, 0.55], [0, 0.6]]) ell(ctx, x * r, 0, rx * r, r * 0.95, x ? dark(o.color, -0.12) : o.color);
      line(ctx, [[0, -r * 0.9], [r * 0.12, -r * 1.2]], '#4d7c0f', 4);
      const glowCol = `rgba(253,224,71,${fl})`;
      poly(ctx, [[-r * 0.45, -r * 0.15], [-r * 0.2, -r * 0.15], [-r * 0.32, -r * 0.42]], glowCol);
      poly(ctx, [[r * 0.45, -r * 0.15], [r * 0.2, -r * 0.15], [r * 0.32, -r * 0.42]], glowCol);
      poly(ctx, [[-r * 0.08, 0.02 * r], [r * 0.08, 0.02 * r], [0, -r * 0.14]], glowCol);
      const m = [];
      for (let i = 0; i <= 8; i++) m.push([-r * 0.55 + (i * r * 1.1) / 8, r * 0.25 + (i % 2 ? r * 0.12 : 0)]);
      for (let i = 8; i >= 0; i--) m.push([-r * 0.55 + (i * r * 1.1) / 8, r * 0.45 + (i % 2 ? 0 : r * 0.1)]);
      poly(ctx, m, glowCol);
      ctx.restore();
    },
  });
  walker('skeleton', { label: 'Skeleton', category: 'Halloween', desc: 'A rattling skeleton that walks its path.', w: 26, h: 60, speed: 90, color: '#f5f5f4' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color, bone = dark(c, -0.25), sw = mv ? Math.sin(ph * 1.4) : 0;
    for (const k of [1, -1]) {
      const a = sw * 0.5 * k;
      line(ctx, [[0, 6], [Math.sin(a) * 12, 18], [Math.sin(a) * 12 + 2, 29]], k > 0 ? c : bone, 3);
      line(ctx, [[0, -14], [-Math.sin(a) * 10, -3], [-Math.sin(a) * 10 + 3, 7]], k > 0 ? c : bone, 2.5);
    }
    line(ctx, [[0, -16], [0, 6]], c, 3);
    for (let i = 0; i < 4; i++) line(ctx, [[-7 + i, -12 + i * 4], [7 - i, -12 + i * 4]], c, 2);
    ell(ctx, 0, 6, 7, 3, c);
    ell(ctx, 1, -24, 8, 8.5, c);
    ell(ctx, 3, -19, 5, 3, c);
    ell(ctx, -1, -25, 2.2, 2.6, '#111');
    ell(ctx, 5, -25, 2.2, 2.6, '#111');
    line(ctx, [[1, -18.5], [7, -18.5]], '#111', 0.8);
  });
  flyer('witch', { label: 'Witch', category: 'Halloween', desc: 'A witch on a broomstick, swooping along her flight path.', w: 70, h: 44, speed: 190, color: '#6d28d9', flap: 0.3 }, (ctx, o, f) => {
    const bob = Math.sin(f * 2) * 2;
    ctx.translate(0, bob);
    line(ctx, [[-34, 10], [30, 4]], '#92400e', 3);
    poly(ctx, [[-34, 10], [-48, 2], [-50, 12], [-46, 20]], '#ca8a04');
    poly(ctx, [[-4, -12], [-26, 8 + Math.sin(f * 6) * 3], [6, 6]], o.color);
    ell(ctx, 0, -2, 7, 10, '#1f2937');
    line(ctx, [[0, 4], [8, 9], [10, 6]], '#1f2937', 3);
    ell(ctx, 3, -16, 6.5, 6.5, '#86efac');
    poly(ctx, [[8, -16], [13, -14], [8, -13]], '#4ade80');
    eye(ctx, 5, -18, 1.3);
    poly(ctx, [[-10, -20], [14, -20], [6, -24], [-6, -24]], '#111827');
    poly(ctx, [[-4, -23], [6, -23], [-6, -42]], '#111827');
  });
  flyer('ghost', { label: 'Ghost', category: 'Halloween', desc: 'A wobbly ghost that floats along its path. Not solid unless you tick Solid body.', w: 40, h: 48, speed: 90, color: '#f8fafc', flap: 0.12, idleFlap: 0.08 }, (ctx, o, f) => {
    ctx.translate(0, Math.sin(f * 3) * 3);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-18, 22);
    ctx.lineTo(-18, -4);
    ctx.arc(0, -4, 18, Math.PI, TAU);
    ctx.lineTo(18, 22);
    for (let i = 0; i < 6; i++) {
      const x = 18 - (i + 1) * 6;
      ctx.quadraticCurveTo(x + 3, 22 + (i % 2 ? -6 : 6) * Math.cos(f * 4), x, 22);
    }
    ctx.closePath();
    ctx.fillStyle = o.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,116,139,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ell(ctx, -6, -6, 3, 4.5, '#111');
    ell(ctx, 6, -6, 3, 4.5, '#111');
    ell(ctx, 0, 6, 3, 4, '#111');
  });
  CR.defineType('cauldron', {
    label: 'Cauldron',
    category: 'Halloween',
    description: 'A bubbling witch\'s cauldron. Things that drop in stay in.',
    iconSize: { w: 100, h: 80 },
    noScale: true, // has its own width
    defaults: () => ({ w: 100, color: '#1f2937', brew: '#84cc16' }),
    props: [PX(), PY(), num('w', 'Width', 1, 30, 600), PCOLOR('Pot'), PCOLOR('Brew', 'brew')],
    box: (o) => ({ x: o.x, y: o.y + 4, w: o.w + 12, h: o.w * 0.75 + 14, angle: 0 }),
    build(e) {
      const o = e.o, { Bodies, Body } = M(), w = o.w, h = w * 0.75, th = Math.max(6, w * 0.08);
      e.body = Body.create({
        parts: [
          Bodies.rectangle(o.x, o.y + h / 2 - th / 2, w * 0.8, th),
          Bodies.rectangle(o.x - w / 2 + th / 2, o.y, th, h, { angle: 0.12 }),
          Bodies.rectangle(o.x + w / 2 - th / 2, o.y, th, h, { angle: -0.12 }),
        ],
        isStatic: true, friction: 0.6,
      });
    },
    draw(ctx, o, s) {
      const w = o.w, h = w * 0.75, t = s.t || 0;
      ctx.save();
      ctx.translate(o.x, o.y);
      line(ctx, [[-w * 0.3, h / 2], [-w * 0.4, h / 2 + 8]], o.color, 4);
      line(ctx, [[w * 0.3, h / 2], [w * 0.4, h / 2 + 8]], o.color, 4);
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.bezierCurveTo(-w * 0.62, h * 0.5, w * 0.62, h * 0.5, w / 2, -h / 2);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ell(ctx, 0, -h / 2, w / 2, w * 0.1, o.brew);
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.8 + i * 0.37) % 1, bx = (((i * 37) % 10) / 10 - 0.5) * w * 0.7;
        ctx.globalAlpha = 1 - ph;
        ell(ctx, bx, -h / 2 - ph * 26, 3 + i % 3, 3 + i % 3, light(o.brew, 0.3));
      }
      ctx.globalAlpha = 1;
      U.rr(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, 8, 4);
      ctx.fillStyle = light(o.color, 0.15);
      ctx.fill();
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 0, w: 60 }), { t: 0.3 }); },
  });
  CR.defineType('tombstone', {
    label: 'Tombstone',
    category: 'Halloween',
    description: 'A heavy gravestone that topples like a giant domino.',
    iconScale: 0.55,
    defaults: () => ({ w: 40, h: 56, angle: 0, text: 'RIP', color: '#9ca3af', density: 0.004 }),
    props: [PX(), PY(), PANGLE, num('w', 'Width', 1, 10, 300), num('h', 'Height', 1, 10, 400),
      { key: 'text', label: 'Text', type: 'text', maxLength: 12 }, PCOLOR(), num('density', 'Density', 0.0005, 0.0001)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { angle: o.angle * D2R, density: o.density, friction: 0.6, chamfer: { radius: [o.w / 2 - 1, o.w / 2 - 1, 0, 0] } });
      e.body.crSlick = true;
    },
    draw(ctx, o, s) {
      const w = o.w, h = o.h, r = w / 2;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, -h / 2 + r);
      ctx.arc(0, -h / 2 + r, r, Math.PI, TAU);
      ctx.lineTo(w / 2, h / 2);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.45);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = dark(o.color, -0.5);
      ctx.font = `bold ${Math.max(6, Math.round(w * 0.32))}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.text || '').slice(0, 8), 0, -h * 0.08);
      ctx.restore();
    },
  });

  // =================================================================== CHRISTMAS
  // Tree body is a triangle centred on its centroid, so (x, y) is a third of the way up the canopy.
  const treePts = (o) => [{ x: 0, y: (-2 * o.h) / 3 }, { x: o.w / 2, y: o.h / 3 }, { x: -o.w / 2, y: o.h / 3 }];
  const LIGHTS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#f472b6'];
  CR.defineType('xmastree', {
    label: 'Christmas tree',
    category: 'Christmas',
    description: 'A decorated tree (solid, so things slide off it). Its lights come on at start, or when triggered.',
    iconSize: { w: 120, h: 180 },
    defaults: () => ({ w: 120, h: 150, trigger: 'start', delay: 0, color: '#15803d' }),
    props: [PX(), PY(), num('w', 'Width', 1, 20, 1000), num('h', 'Height', 1, 20, 1200),
      { key: 'trigger', label: 'Lights on', type: 'select', options: [['start', 'At start'], ['touch', 'When touched or triggered'], ['fire', 'When lit'], ['none', 'Never']] },
      PDELAY, PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y + 5, w: o.w, h: o.h + 30, angle: 0 }),
    build(e) {
      const o = e.o, v = treePts(o).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
      e.body = M().Bodies.fromVertices(o.x, o.y, [v], { isStatic: true, friction: 0.2 });
      M().Body.setPosition(e.body, { x: o.x, y: o.y });
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, w = o.w, h = o.h, top = (-2 * h) / 3, base = h / 3, lit = e ? e.active : false;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#7c4a1e';
      ctx.fillRect(-w * 0.08, base, w * 0.16, h * 0.14);
      for (let i = 0; i < 3; i++) { // three layers of branches
        const ty = top + (i * h) / 4, by = base - ((2 - i) * h) / 9, hw = (w / 2) * ((by - top) / h) * 1.05;
        poly(ctx, [[0, ty], [hw, by], [-hw, by]], i % 2 ? dark(o.color, -0.1) : o.color);
      }
      line(ctx, [[-w * 0.3, base - h * 0.2], [w * 0.25, base - h * 0.35]], '#fde047', 2);
      line(ctx, [[-w * 0.18, base - h * 0.48], [w * 0.15, base - h * 0.6]], '#fde047', 2);
      for (let i = 0; i < 12; i++) { // lights / baubles
        const u = (i * 0.618) % 1, yy = top + 18 + ((h - 24) * (i + 1)) / 13, half = ((yy - top) / h) * (w / 2) * 0.85;
        const xx = (u * 2 - 1) * half, col = LIGHTS[i % LIGHTS.length];
        const on = lit && Math.sin(t * 5 + i * 1.7) > -0.3;
        if (on) U.glow(ctx, xx, yy, 9, col + 'cc', col + '00');
        ell(ctx, xx, yy, 3.5, 3.5, on ? light(col, 0.4) : dark(col, -0.2));
      }
      ctx.save();
      ctx.translate(0, top - 4);
      const sp = lit ? 1 + 0.1 * Math.sin(t * 6) : 1;
      ctx.scale(sp, sp);
      const star = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5 : 12; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
      if (lit) U.glow(ctx, 0, 0, 22, 'rgba(253,224,71,0.8)', 'rgba(253,224,71,0)');
      poly(ctx, star, '#facc15', '#a16207', 1);
      ctx.restore();
      ctx.restore();
    },
  });

  // Gift box: opens when triggered (bumped by default): the lid flies off, confetti bursts
  // out, a jack-in-the-box springs up, and it can set off another object.
  function giftType(name, cat, d) {
    CR.defineType(name, {
      label: d.label,
      category: cat,
      description: d.desc,
      iconScale: 0.8,
      defaults: () => ({ w: 44, h: 36, trigger: 'touch', delay: 0, link: '', color: d.color, ribbon: d.ribbon, density: 0.002 }),
      props: [PX(), PY(), num('w', 'Width', 1, 10, 400), num('h', 'Height', 1, 10, 400),
        { key: 'trigger', label: 'Opens', type: 'select', options: [['touch', 'When bumped or triggered'], ['start', 'At start'], ['none', 'Never']] },
        PDELAY, PLINK1('When opened, trigger'), PCOLOR('Paper'), PCOLOR('Ribbon', 'ribbon'), num('density', 'Density', 0.0005, 0.0001)],
      box: (o, s) => ({ x: s.x, y: s.y - 5, w: o.w + 4, h: o.h + 12, angle: s.angle }),
      build(e) {
        const o = e.o;
        e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { density: o.density, friction: 0.6 });
      },
      activate(e, sim) {
        const b = e.body, o = e.o, top = rotPt(0, -o.h / 2 * e.k, b.angle);
        e.openAt = sim.t;
        e.lid = { x: b.position.x + top.x, y: b.position.y + top.y, vx: (Math.random() - 0.5) * 4, vy: -7, a: b.angle, va: (Math.random() - 0.5) * 0.3 };
        sim.emit(e.lid.x, e.lid.y, 'confetti', 70, { dir: -Math.PI / 2 + b.angle, spread: 1.6, speed: 6 });
        sim.link(e);
      },
      busy: (e, sim) => e.openAt != null && sim.t - e.openAt < 1.2,
      update(e) {
        const l = e.lid;
        if (!l) return;
        l.x += l.vx; l.y += l.vy; l.vy += 0.3; l.a += l.va;
      },
      draw(ctx, o, s) {
        const e = s.e, w = o.w, h = o.h, open = e && e.openAt != null, t = s.t || 0;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        if (open) { // jack-in-the-box
          const u = Math.min(1, (t - e.openAt) / 0.35), top = -h / 2 - 34 * u * (1 + 0.15 * Math.sin((t - e.openAt) * 18) * Math.max(0, 1 - (t - e.openAt)));
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) ctx.lineTo(i % 2 ? 5 : -5, -h / 2 + ((top + 8 + h / 2) * i) / 8);
          ctx.stroke();
          ell(ctx, 0, top, 9, 9, '#fde68a');
          eye(ctx, -3, top - 2, 1.5);
          eye(ctx, 3, top - 2, 1.5);
          ell(ctx, 0, top + 3, 2, 2, '#ef4444');
          poly(ctx, [[-8, top - 6], [8, top - 6], [0, top - 20]], '#a855f7');
        }
        box(ctx, -w / 2, -h / 2, w, h, 3, o.color, dark(o.color, -0.45));
        ctx.fillStyle = o.ribbon;
        ctx.fillRect(-w * 0.08, -h / 2, w * 0.16, h);
        if (!open) {
          box(ctx, -w / 2 - 3, -h / 2 - 7, w + 6, 9, 2, light(o.color, 0.12), dark(o.color, -0.45));
          ctx.fillStyle = o.ribbon;
          ctx.fillRect(-w * 0.08, -h / 2 - 7, w * 0.16, 9);
          ell(ctx, -7, -h / 2 - 10, 7, 4, o.ribbon, -0.4);
          ell(ctx, 7, -h / 2 - 10, 7, 4, o.ribbon, 0.4);
        }
        ctx.restore();
        if (open && e.lid) {
          const l = e.lid;
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.a);
          box(ctx, -w / 2 - 3, -7, w + 6, 9, 2, light(o.color, 0.12), dark(o.color, -0.45));
          ctx.fillStyle = o.ribbon;
          ctx.fillRect(-w * 0.08, -7, w * 0.16, 9);
          ctx.restore();
        }
      },
    });
  }
  giftType('present', 'Christmas', { label: 'Present', desc: 'A wrapped present. When bumped (or triggered) it bursts open: the lid flies off, confetti everywhere, and a jack-in-the-box springs up. It can set off another object.', color: '#dc2626', ribbon: '#facc15' });
  CR.defineType('snowman', {
    label: 'Snowman',
    category: 'Christmas',
    description: 'A snowman with a carrot nose. Tall and top-heavy, so it topples when hit.',
    iconScale: 0.45,
    defaults: () => ({ angle: 0, color: '#f8fafc', scarf: '#dc2626', density: 0.002 }),
    props: [PX(), PY(), PANGLE, PCOLOR('Snow'), PCOLOR('Scarf', 'scarf'), num('density', 'Density', 0.0005, 0.0001)],
    rot: { offset: -Math.PI / 2, dist: () => 64 },
    box: (o, s) => ({ x: s.x, y: s.y - 4, w: 48, h: 100, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, 40, 90, { angle: o.angle * D2R, density: o.density, friction: 0.6, chamfer: { radius: 12 } });
    },
    draw(ctx, o, s) {
      const c = o.color, sh = dark(c, -0.12);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      line(ctx, [[-12, -12], [-26, -24]], '#78350f', 2.5);
      line(ctx, [[12, -12], [26, -26]], '#78350f', 2.5);
      ell(ctx, 0, 24, 22, 21, sh); ell(ctx, -2, 22, 20, 19, c);
      ell(ctx, 0, -10, 16, 15, sh); ell(ctx, -1, -11, 15, 14, c);
      ell(ctx, 0, -34, 12, 12, sh); ell(ctx, -1, -35, 11, 11, c);
      for (const y of [-14, -6, 18, 28]) ell(ctx, 0, y, 2, 2, '#1f2937');
      eye(ctx, -4, -38, 1.5); eye(ctx, 4, -38, 1.5);
      poly(ctx, [[0, -34], [14, -32], [0, -31]], '#f97316');
      box(ctx, -13, -26, 26, 6, 3, o.scarf);
      ctx.fillStyle = o.scarf;
      ctx.fillRect(6, -24, 6, 14);
      ctx.fillStyle = '#111827';
      ctx.fillRect(-13, -47, 26, 3);
      ctx.fillRect(-9, -62, 18, 15);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-9, -51, 18, 3);
      ctx.restore();
    },
  });
  flyer('sleigh', { label: 'Santa\'s sleigh', category: 'Christmas', desc: 'Santa and a reindeer flying along the sleigh\'s path.', w: 130, h: 50, speed: 170, color: '#dc2626', flap: 0.35 }, (ctx, o, f) => {
    const g = Math.sin(f * 2) * 4;
    // reindeer
    const rx = 38;
    for (const [i, x] of [[0, rx - 10], [1, rx + 10]]) line(ctx, [[x, -2], [x + Math.sin(f * 2 + i * 3) * 6, 12]], '#78350f', 3);
    ell(ctx, rx, -6, 16, 8, '#a16207');
    line(ctx, [[rx + 12, -10], [rx + 20, -22 + g * 0.3]], '#a16207', 6);
    ell(ctx, rx + 24, -24 + g * 0.3, 7, 5, '#a16207');
    ell(ctx, rx + 31, -24 + g * 0.3, 2.5, 2.5, '#ef4444');
    line(ctx, [[rx + 20, -28], [rx + 16, -38], [rx + 12, -40]], '#78350f', 1.5);
    line(ctx, [[rx + 16, -38], [rx + 20, -42]], '#78350f', 1.5);
    line(ctx, [[rx - 16, -6], [-10, -2]], '#78350f', 1.2);
    // sleigh and Santa
    ell(ctx, -26, -12, 9, 10, o.color);
    ell(ctx, -26, -4, 8, 6, '#f8fafc');
    ell(ctx, -24, -24, 7, 7, '#fde68a');
    eye(ctx, -22, -25, 1.2);
    poly(ctx, [[-31, -27], [-17, -27], [-27, -40]], o.color);
    ell(ctx, -27, -40, 2.5, 2.5, '#fff');
    poly(ctx, [[-50, -10], [-6, -10], [-2, 8], [-44, 10]], o.color, dark(o.color, -0.5));
    line(ctx, [[-54, 16], [2, 16], [8, 8]], '#facc15', 2.5);
    box(ctx, -46, -24, 14, 14, 2, '#22c55e');
  });
  CR.defineType('ornament', {
    label: 'Ornament',
    category: 'Christmas',
    description: 'A shiny glass bauble that rolls and bounces.',
    iconScale: 1.1,
    defaults: () => ({ r: 14, color: '#2563eb', density: 0.001, restitution: 0.5 }),
    props: [PX(), PY(), num('r', 'Radius', 1, 3, 200), PCOLOR(), num('density', 'Density', 0.0005, 0.0001), num('restitution', 'Bounciness', 0.05, 0, 1.2)],
    box: (o, s) => ({ x: s.x, y: s.y - 3, w: o.r * 2, h: o.r * 2 + 6, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r, { density: o.density, restitution: o.restitution, friction: 0.1 });
    },
    draw(ctx, o, s) {
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, light(o.color, 0.7));
      g.addColorStop(0.55, o.color);
      g.addColorStop(1, dark(o.color, -0.4));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.3, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(-r * 0.25, -r - 4, r * 0.5, 5);
      ctx.restore();
    },
  });

  // =================================================================== BIRTHDAY
  // Cake candles: lit at start or by fire; each flame lights things just above it (pops balloons!)
  function candleTops(o, k) {
    const n = Math.max(0, Math.round(o.candles)), out = [], tw = o.w * 0.6;
    for (let i = 0; i < n; i++) out.push({ x: o.x + (-tw / 2 + (tw * (i + 0.5)) / n) * k, y: o.y + (-o.h / 2 - 22) * k });
    return out;
  }
  CR.defineType('cake', {
    label: 'Birthday cake',
    category: 'Birthday',
    description: 'A two-tier cake. Its candles light at start (or when fire reaches them) and their flames light fuses and pop balloons just above.',
    iconSize: { w: 140, h: 110 },
    ignitable: true,
    defaults: () => ({ w: 140, h: 80, candles: 5, trigger: 'start', delay: 0, burnTime: 8, color: '#f9a8d4', frosting: '#fff7ed' }),
    props: [PX(), PY(), num('w', 'Width', 1, 30, 800), num('h', 'Height', 1, 20, 600), num('candles', 'Candles', 1, 0, 30),
      { key: 'trigger', label: 'Candles light', type: 'select', options: [['start', 'At start'], ['fire', 'When lit'], ['touch', 'When touched or triggered'], ['none', 'Never']] },
      PDELAY, num('burnTime', 'Burn time (s)', 0.5, 0, undefined, '0 = burn forever'), PCOLOR('Cake'), PCOLOR('Frosting', 'frosting')],
    box: (o, s) => ({ x: s.x, y: s.y - 12, w: o.w + 16, h: o.h + 40, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { isStatic: true, friction: 0.6 });
    },
    activate(e, sim) { e.out = e.o.burnTime > 0 ? sim.t + e.o.burnTime : Infinity; },
    busy: (e, sim) => e.active && !e.done && e.out !== Infinity,
    update(e, sim) {
      if (!e.active || e.done) return;
      const tops = candleTops(e.o, e.k);
      if (sim.t >= e.out) {
        e.done = true;
        for (const p of tops) sim.emit(p.x, p.y, 'smoke', 3, { speed: 0.5, vy: -0.8 });
        return;
      }
      for (const p of tops) sim.igniteNear(p.x, p.y - 6, 14, e);
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, w = o.w, h = o.h, lit = e && e.active && !e.done;
      ctx.save();
      ctx.translate(s.x, s.y);
      ell(ctx, 0, h / 2, w * 0.62, 6, '#e5e7eb');
      const tier = (y, tw, th, col) => {
        box(ctx, -tw / 2, y, tw, th, 6, col, dark(col, -0.3));
        ctx.fillStyle = o.frosting;
        ctx.beginPath();
        ctx.moveTo(-tw / 2, y + 4);
        for (let i = 0; i <= 10; i++) { const x = -tw / 2 + (tw * i) / 10; ctx.quadraticCurveTo(x - tw / 40, y + 10 + (i % 2) * 7, x, y + 6); }
        ctx.lineTo(tw / 2, y);
        ctx.lineTo(-tw / 2, y);
        ctx.closePath();
        ctx.fill();
      };
      tier(-h * 0.05, w, h * 0.55, o.color);
      tier(-h / 2, w * 0.6, h * 0.45, light(o.color, 0.25));
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = LIGHTS[i % LIGHTS.length];
        ctx.fillRect(-w * 0.42 + ((i * 53) % 100) / 100 * w * 0.84, h * 0.08 + ((i * 29) % 10) / 10 * h * 0.3, 4, 1.6);
      }
      const n = Math.max(0, Math.round(o.candles)), tw = w * 0.6;
      for (let i = 0; i < n; i++) {
        const x = -tw / 2 + (tw * (i + 0.5)) / n;
        ctx.fillStyle = i % 2 ? '#93c5fd' : '#fde68a';
        ctx.fillRect(x - 2.5, -h / 2 - 18, 5, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let k = 0; k < 3; k++) ctx.fillRect(x - 2.5, -h / 2 - 16 + k * 6, 5, 1.5);
        line(ctx, [[x, -h / 2 - 18], [x, -h / 2 - 21]], '#1f2937', 1);
        if (lit) {
          const fl = 1 + 0.15 * Math.sin(t * 20 + i * 2);
          U.glow(ctx, x, -h / 2 - 26, 10, 'rgba(255,230,140,0.8)', 'rgba(255,160,40,0)');
          ell(ctx, x, -h / 2 - 26, 3, 6 * fl, '#fb923c');
          ell(ctx, x, -h / 2 - 25, 1.5, 3 * fl, '#fef3c7');
        }
      }
      ctx.restore();
    },
  });
  giftType('giftbox', 'Birthday', { label: 'Gift box', desc: 'A birthday gift. When bumped (or triggered) it bursts open with confetti and a jack-in-the-box, and can set off another object.', color: '#a855f7', ribbon: '#f472b6' });

  // "HAPPY BIRTHDAY" on an arch: each letter is solid (built from its own letter shape).
  function archLayout(o) {
    const chars = [...String(o.text ?? '')], R = Math.max(20, +o.radius || 400), up = o.curve !== 'down';
    const ws = chars.map((c) => CR.textShape({ text: c, size: o.size, bold: true }).w);
    const gap = o.size * 0.04, L = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
    let acc = 0;
    return chars.map((c, i) => {
      const th = (acc + ws[i] / 2 - L / 2) / R;
      acc += ws[i] + gap;
      const x = o.x + R * Math.sin(th), y = up ? o.y + R * (1 - Math.cos(th)) : o.y - R * (1 - Math.cos(th));
      return { c, x, y, rot: up ? th : -th, w: ws[i], i };
    });
  }
  const RAINBOW = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
  CR.defineType('archtext', {
    label: 'Arched text',
    category: 'Birthday',
    description: 'Words on an arch, like "HAPPY BIRTHDAY". Every letter is solid, so things bounce off them.',
    iconSize: { w: 70, h: 40 },
    noScale: true, // sized by its letter size
    defaults: () => ({ text: 'HAPPY BIRTHDAY', size: 56, radius: 420, curve: 'up', rainbow: true, bounce: 0.5, color: '#db2777' }),
    props: [PX('Centre X'), PY('Middle letter Y'), { key: 'text', label: 'Text', type: 'text', maxLength: 40 }, num('size', 'Letter size', 2, 8, 200),
      num('radius', 'Arch radius', 10, 20, 5000, 'smaller = more curved'),
      { key: 'curve', label: 'Curve', type: 'select', options: [['up', 'Arch ⌒'], ['down', 'Smile ⌣']] },
      { key: 'rainbow', label: 'Rainbow letters', type: 'checkbox' }, num('bounce', 'Bounciness', 0.05, 0, 1.2), PCOLOR()],
    box(o) {
      const ls = archLayout(o), pad = o.size * 0.7;
      if (!ls.length) return { x: o.x, y: o.y, w: 40, h: 40, angle: 0 };
      const b = CR.geom.bboxOf(ls, pad);
      return b;
    },
    hit(o, s, x, y, pad) {
      const h = o.size * 1.1;
      return archLayout(o).some((l) => {
        if (l.c === ' ') return false;
        const p = rotPt(x - l.x, y - l.y, -l.rot);
        return Math.abs(p.x) <= l.w / 2 + pad && Math.abs(p.y) <= h / 2 + pad;
      });
    },
    build(e) {
      const o = e.o, { Bodies, Body } = M(), rs = [];
      for (const l of archLayout(o)) {
        for (const r of CR.textShape({ text: l.c, size: o.size, bold: true }).rects) {
          const c = rotPt(r.x + r.w / 2, r.y + r.h / 2, l.rot);
          rs.push({ x: l.x + c.x, y: l.y + c.y, w: r.w, h: r.h, angle: l.rot });
        }
      }
      if (!rs.length) return;
      const opt = { isStatic: true, restitution: o.bounce, friction: 0.2 };
      e.body = rs.length === 1
        ? Bodies.rectangle(rs[0].x, rs[0].y, rs[0].w, rs[0].h, Object.assign({ angle: rs[0].angle }, opt))
        : Body.create(Object.assign({ parts: rs.map((r) => Bodies.rectangle(r.x, r.y, r.w, r.h, { angle: r.angle })) }, opt));
    },
    draw(ctx, o) {
      ctx.save();
      ctx.font = CR.textFont({ size: o.size, bold: true });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, o.size / 30);
      let n = 0;
      for (const l of archLayout(o)) {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rot);
        const col = o.rainbow ? RAINBOW[n++ % RAINBOW.length] : o.color;
        if (l.c === ' ') n--;
        ctx.strokeStyle = dark(col, -0.5);
        ctx.strokeText(l.c, 0, 0);
        ctx.fillStyle = col;
        ctx.fillText(l.c, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: -2, text: 'YAY!', size: 22, radius: 40 })); },
  });

  CR.defineType('popper', {
    label: 'Party popper',
    category: 'Birthday',
    description: 'Pops a blast of confetti along its aim when triggered, giving a push to anything just in front of it.',
    iconScale: 0.8,
    defaults: () => ({ angle: -60, power: 8, range: 220, trigger: 'touch', delay: 0, color: '#f59e0b' }),
    props: [PX(), PY(), { key: 'angle', label: 'Aim (°)', type: 'number', step: 1, hint: '0 = right, −90 = up' },
      num('power', 'Push', 0.5, 0, 60), num('range', 'Range (px)', 10, 10, 2000),
      { key: 'trigger', label: 'Pops', type: 'select', options: [['touch', 'When touched or triggered'], ['start', 'At start'], ['none', 'Never']] },
      PDELAY, PCOLOR()],
    rot: { offset: 0, dist: () => 46 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 40, h: 40, angle: o.angle * D2R }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 16, 16, { isStatic: true, isSensor: true });
    },
    activate(e, sim) {
      const o = e.o, a = o.angle * D2R, c = Math.cos(a), s = Math.sin(a), k = e.k, { Body, Composite } = M();
      const mx = o.x + c * 22 * k, my = o.y + s * 22 * k;
      e.popped = sim.t;
      sim.emit(mx, my, 'confetti', 90, { dir: a, spread: 0.9, speed: 8 });
      sim.emit(mx, my, 'flash', 10, { dir: a, spread: 0.8, speed: 4 });
      const R = o.range * k;
      for (const b of Composite.allBodies(sim.world)) {
        if (b.isStatic) continue;
        const dx = b.position.x - o.x, dy = b.position.y - o.y, along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
        if (along < 0 || along > R || across > 20 + along * 0.4) continue;
        const f = o.power * (1 - along / R);
        Body.setVelocity(b, { x: b.velocity.x + c * f, y: b.velocity.y + s * f });
      }
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, popped = e && e.popped != null;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(o.angle * D2R);
      poly(ctx, [[-14, -4], [-14, 4], [20, 11], [20, -11]], o.color, dark(o.color, -0.5));
      ctx.fillStyle = '#fff';
      for (const x of [-6, 4, 13]) ctx.fillRect(x, -6 - (x + 14) * 0.18, 3, 12 + (x + 14) * 0.36);
      if (!popped) {
        line(ctx, [[-14, 0], [-22, 6]], '#ef4444', 2);
      } else { // streamers
        const u = Math.min(1, (t - e.popped) / 0.3);
        for (let i = 0; i < 5; i++) {
          const a = (i - 2) * 0.22;
          ctx.strokeStyle = LIGHTS[i];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(20, 0);
          for (let k = 1; k <= 6; k++) {
            const d = 20 + k * 9 * u;
            ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d + Math.sin(k * 1.8 + i) * 3);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  });
})();
