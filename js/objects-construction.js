/*
 * Object pack: fireworks, and the Construction group -- tipper truck, tower crane, wrecking-ball
 * crane, pillar, steel girder, detonator plunger, dynamite, dirt mound and traffic cone.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw;
  const { PX, PY, PANGLE, PCOLOR, PDELAY, PDIR, num } = CR.P;
  const { vehicle, poly, ell, box, line, wheel, dark, light } = CR.pack;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;
  const CAT = 'Construction';
  const trig = (label, opts) => ({ key: 'trigger', label, type: 'select', options: opts });
  // toolkit icon for a type drawn from its own (x, y): centre its box on the icon
  const centredIcon = (type) => (g) => {
    const T = CR.types[type], o = Object.assign({ id: 'icon', type, x: 0, y: 0 }, T.defaults()), b = T.box(o, o);
    o.x -= b.x; o.y -= b.y;
    const sc = Math.min(62 / T.iconSize.w, 40 / T.iconSize.h);
    g.scale(sc, sc);
    T.draw(g, o, { x: o.x, y: o.y, angle: 0, facing: 1, e: null, t: 0 });
  };
  const GRAV = 0.2778; // Matter's gravity per step at gravity 1 (px/frame²)

  // =================================================================== fireworks
  // A launch tube. Once lit (fire, a fuse, at start or triggered) it sends up `shots` shells, one
  // every `interval` seconds; each climbs about `height` px and bursts into coloured sparks, lighting
  // fuses and other ignitable things near the burst.
  const FW_COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#38bdf8', '#a855f7', '#ec4899', '#ffffff'];
  CR.defineType('fireworks', {
    label: 'Fireworks',
    category: 'Fire',
    description: 'A fireworks tube. Once lit it shoots shells up into the sky that burst into coloured sparks — which can light fuses and other things near the burst.',
    iconSize: { w: 40, h: 70 },
    noScale: true, // its shells fly in world space
    ignitable: true,
    defaults: () => ({ shots: 5, interval: 0.6, height: 450, trigger: 'start', delay: 0.5, color: '#dc2626' }),
    props: [PX(), PY(), num('shots', 'Shells', 1, 1, 30), num('interval', 'Time between shells (s)', 0.1, 0.1, 10),
      num('height', 'Burst height (px)', 10, 60, 1200),
      trig('Lit', [['start', 'At start (after the delay)'], ['fire', 'When fire reaches it'], ['touch', 'When touched or triggered'], ['none', 'Never']]),
      PDELAY, PCOLOR('Tube')],
    box: (o, s) => ({ x: s.x, y: s.y, w: 26, h: 44, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 22, 40, { isStatic: true });
      e.shells = [];
      e.rand = CR.rng(CR.hash(e.id));
    },
    activate(e, sim) { e.left = Math.max(1, Math.round(e.o.shots)); e.next = sim.t; },
    busy: (e) => e.active && (e.left > 0 || e.shells.length > 0),
    update(e, sim) {
      const o = e.o, k = 1, g = GRAV * (sim.engine.gravity.y || 1), R = e.rand;
      if (e.active && e.left > 0 && sim.t >= e.next - 1e-9) {
        const h = o.height * (0.85 + R() * 0.3);
        e.shells.push({ x: o.x + (R() - 0.5) * 10, y: o.y - 22 * k, vx: (R() - 0.5) * 1.2, vy: -Math.sqrt(2 * g * h), col: FW_COLORS[Math.floor(R() * FW_COLORS.length)] });
        e.left--;
        e.next = sim.t + Math.max(0.1, o.interval);
        sim.emit(o.x, o.y - 22 * k, 'flash', 6, { dir: -Math.PI / 2, spread: 0.8, speed: 2 });
      }
      for (let i = e.shells.length - 1; i >= 0; i--) {
        const sh = e.shells[i];
        sh.x += sh.vx; sh.y += sh.vy; sh.vy += g;
        if (sim.frame % 2 === 0) sim.emit(sh.x, sh.y, 'spark', 1, { speed: 0.4, vy: 0.6, life: 10 });
        if (sh.vy >= 0) { // the top of its climb: burst
          sim.emit(sh.x, sh.y, 'fw', 70, { speed: 4.5, life: 55, col: sh.col });
          sim.emit(sh.x, sh.y, 'fw', 25, { speed: 2, life: 40, col: '#fff7cc' });
          sim.igniteNear(sh.x, sh.y, 60, e);
          e.shells.splice(i, 1);
        }
      }
    },
    draw(ctx, o, s) {
      const e = s.e;
      ctx.save();
      ctx.translate(s.x, s.y);
      ell(ctx, 0, 20, 16, 4, '#57534e');
      box(ctx, -11, -20, 22, 40, 3, o.color, dark(o.color, -0.45));
      ctx.fillStyle = '#facc15';
      for (const y of [-12, 0, 12]) ctx.fillRect(-11, y, 22, 3);
      ell(ctx, 0, -20, 11, 3, dark(o.color, -0.5));
      line(ctx, [[0, -20], [3, -27], [0, -31]], '#a16207', 1.5);
      if (e && e.triggered && !e.active) U.glow(ctx, 0, -31, 8, 'rgba(255,240,150,1)', 'rgba(255,140,0,0)');
      ctx.restore();
      if (e) for (const sh of e.shells) U.glow(ctx, sh.x, sh.y, 6, 'rgba(255,250,210,1)', 'rgba(255,200,80,0)');
    },
  });

  // =================================================================== tipper (dump) truck
  // Drives like the other trucks; `dumpAfter` seconds after it starts it stops, tips its bed and
  // tips out `load` clods of dirt behind it.
  vehicle('tipper', { label: 'Tipper truck', desc: 'A dump truck that drives, then stops, tips its bed and dumps a load of dirt behind it.', w: 130, h: 60, speed: 4, accel: 0.15, density: 0.006, color: '#eab308',
    update(e, sim) {
      const o = e.o;
      if (!e.active) return;
      if (e.dumpAt == null) e.dumpAt = sim.t + Math.max(0, +o.dumpAfter || 0);
      if (sim.t < e.dumpAt) return;
      if (e.tipStart == null) { e.tipStart = sim.t; o.speed = 0; o.accel = 0; } // stop, then tip
      const v = e.body.velocity; // brakes (its wheels have no friction of their own)
      M().Body.setVelocity(e.body, { x: v.x * 0.85, y: v.y });
      if (e.dumped) return;
      if (sim.t - e.tipStart < 0.8) return;
      e.dumped = true;
      const { Bodies, Body } = M(), n = Math.max(0, Math.round(o.load ?? 14)), b = e.body;
      const c = Math.cos(b.angle), sn = Math.sin(b.angle), f = e.facing, w = o.w * e.k, h = o.h * e.k;
      for (let i = 0; i < n; i++) { // out of the back of the bed
        const lx = -f * (w / 2 + 8 + (i % 3) * 7), ly = -h * 0.35 - Math.floor(i / 3) * 9;
        const x = b.position.x + c * lx - sn * ly, y = b.position.y + sn * lx + c * ly;
        const clod = Bodies.circle(x, y, 6 + (i % 3), { density: 0.003, friction: 0.9, restitution: 0.05 });
        Body.setVelocity(clod, { x: -f * (1 + (i % 4) * 0.4), y: 0.5 });
        sim.addExtra(clod, { kind: 'dirt', color: i % 2 ? '#7c4a1e' : '#92573a' });
      }
    },
  }, (ctx, o, rot, s) => {
    const w = o.w, h = o.h, r = h * 0.22, wy = h / 2 - r, e = s.e, t = s.t || 0;
    const tip = e && e.tipStart != null ? Math.min(1, (t - e.tipStart) / 0.8) : 0;
    box(ctx, w * 0.18, -h * 0.28, w * 0.3, h * 0.5, 4, o.color, dark(o.color, -0.5)); // cab
    ctx.fillStyle = '#a8dcff';
    ctx.fillRect(w * 0.26, -h * 0.22, w * 0.16, h * 0.18);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-w * 0.48, h * 0.1, w * 0.96, 6);
    ctx.save(); // the bed, tipping up around its back corner
    ctx.translate(-w * 0.48, h * 0.1);
    ctx.rotate(tip * 45 * D2R);
    poly(ctx, [[0, 0], [w * 0.62, 0], [w * 0.66, -h * 0.5], [-4, -h * 0.5]], dark(o.color, -0.1), dark(o.color, -0.55));
    if (!(e && e.dumped)) ell(ctx, w * 0.32, -h * 0.5, w * 0.3, h * 0.16, '#7c4a1e');
    ctx.restore();
    for (const x of [-w * 0.32, -w * 0.12, w * 0.34]) wheel(ctx, x, wy, r, rot);
  });
  {
    const T = CR.types.tipper, base = T.defaults;
    T.category = CAT;
    T.defaults = () => Object.assign(base(), { dumpAfter: 3, load: 14 });
    T.props = T.props.concat([num('dumpAfter', 'Dumps after (s)', 0.5, 0, 120, 'seconds after it starts driving'), num('load', 'Clods of dirt', 1, 0, 60)]);
  }

  // =================================================================== tower crane
  // (x, y) is where the tower stands. The hook hangs `cable` px below the jib, `reach` px out. Pick
  // any object as its load ("Holds"): it hangs on the hook until the crane is triggered, then drops.
  const hookOf = (o, k = 1) => ({ x: o.x + (o.direction < 0 ? -1 : 1) * o.reach * k, y: o.y - (o.h - o.cable) * k });
  CR.linkKeys = CR.linkKeys.concat('holds');
  CR.defineType('crane', {
    label: 'Tower crane',
    category: CAT,
    description: 'A tower crane. Pick any object as its load ("Holds"): it hangs on the hook and drops when the crane is triggered.',
    iconSize: { w: 260, h: 340 },
    noScale: true, // has its own height and reach
    icon: centredIcon('crane'),
    defaults: () => ({ h: 340, jib: 260, reach: 200, cable: 110, direction: 1, holds: '', trigger: 'start', delay: 2, color: '#facc15' }),
    props: [PX('Tower X'), PY('Ground Y'), num('h', 'Height', 5, 80, 900), num('jib', 'Jib length', 5, 60, 900),
      num('reach', 'Hook reach', 5, 20, 900), num('cable', 'Cable length', 5, 10, 800), PDIR,
      { key: 'holds', label: 'Holds', type: 'objref', hint: 'the object hanging on its hook' },
      trig('Drops it', [['start', 'At start (after the delay)'], ['touch', 'When touched or triggered'], ['none', 'Never']]), PDELAY, PCOLOR()],
    box: (o) => ({ x: o.x + (o.direction < 0 ? -1 : 1) * o.jib / 3, y: o.y - o.h / 2, w: o.jib + 60, h: o.h + 20, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y - e.o.h / 2, 18, e.o.h, { isStatic: true }); },
    init(e, sim) {
      const c = e.o.holds && sim.entById(e.o.holds);
      if (c && c.body && c !== e && !c.body.isStatic) e.load = c;
    },
    update(e, sim) {
      if (!e.load || e.active) return;
      const { Body } = M(), b = e.load.body, hk = hookOf(e.o), hh = (b.bounds.max.y - b.bounds.min.y) / 2;
      Body.setPosition(b, { x: hk.x, y: hk.y + hh + 6 });
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setAngularVelocity(b, 0);
      sim.float(b);
    },
    draw(ctx, o, s) {
      const e = s.e, sd = o.direction < 0 ? -1 : 1, top = o.y - o.h, hk = hookOf(o), dropped = e && e.active;
      ctx.save();
      ctx.strokeStyle = dark(o.color, -0.35);
      ctx.lineWidth = 2;
      ctx.fillStyle = o.color;
      ctx.fillRect(o.x - 9, top, 18, o.h); // lattice tower
      ctx.beginPath();
      for (let y = top; y < o.y - 8; y += 18) { ctx.moveTo(o.x - 9, y); ctx.lineTo(o.x + 9, y + 18); ctx.moveTo(o.x + 9, y); ctx.lineTo(o.x - 9, y + 18); }
      ctx.stroke();
      ctx.fillRect(o.x - 30 * sd, top - 10, (o.jib + 30) * sd, 10); // jib (+ counter-jib)
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(o.x - sd * 30 - (sd > 0 ? 18 : 0), top - 4, 18, 22); // counterweight
      box(ctx, o.x - 14, top - 30, 28, 22, 3, '#f8fafc', dark(o.color, -0.4)); // cab
      line(ctx, [[o.x, top - 30], [o.x, top - 46], [o.x + sd * o.jib, top - 10]], '#57534e', 1.5); // tie
      line(ctx, [[o.x, top - 46], [o.x - sd * 30, top - 10]], '#57534e', 1.5);
      ctx.fillStyle = '#374151';
      ctx.fillRect(hk.x - 8, top, 16, 6); // trolley
      line(ctx, [[hk.x, top + 6], [hk.x, hk.y]], '#111827', 1.5); // cable
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(hk.x - 3, hk.y + 3, 5, -0.5, Math.PI * 0.9); ctx.stroke(); // hook
      if (!e && o.holds && !dropped) { // editing: show where the load will hang
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(124,58,237,0.6)';
        ctx.strokeRect(hk.x - 22, hk.y + 6, 44, 34);
      }
      ctx.restore();
    },
  });

  // =================================================================== wrecking-ball crane
  // A crawler crane with a heavy ball on a chain from the boom tip. The ball is held pulled back
  // by `pull` degrees until triggered, then swings free.
  const pivotOf = (o) => ({ x: o.x + (o.direction < 0 ? -1 : 1) * o.reach, y: o.y - o.boomH });
  const ballRest = (o) => {
    const p = pivotOf(o), a = -(o.direction < 0 ? -1 : 1) * (o.pull || 0) * D2R;
    return { x: p.x + Math.sin(a) * o.chain, y: p.y + Math.cos(a) * o.chain };
  };
  CR.defineType('wreckingball', {
    label: 'Wrecking ball',
    category: CAT,
    description: 'A crane with a heavy wrecking ball on a chain. The ball is held pulled back until triggered, then swings and smashes whatever is in its way.',
    iconSize: { w: 260, h: 300 },
    noScale: true, // has its own size
    icon: centredIcon('wreckingball'),
    defaults: () => ({ boomH: 330, reach: 200, chain: 230, pull: 60, r: 32, density: 0.04, direction: 1, trigger: 'start', delay: 1, color: '#f59e0b' }),
    props: [PX('Crane X'), PY('Ground Y'), num('boomH', 'Boom height', 5, 60, 900), num('reach', 'Boom reach', 5, 20, 900),
      num('chain', 'Chain length', 5, 30, 900), num('pull', 'Pulled back (°)', 1, 0, 100), num('r', 'Ball size', 1, 8, 120),
      num('density', 'Ball weight', 0.005, 0.001, 0.2), PDIR,
      trig('Swings', [['start', 'At start (after the delay)'], ['touch', 'When touched or triggered'], ['none', 'Never']]), PDELAY, PCOLOR()],
    box: (o) => ({ x: o.x + (o.direction < 0 ? -1 : 1) * o.reach / 2, y: o.y - o.boomH / 2, w: o.reach + 140, h: o.boomH + 20, angle: 0 }),
    build(e, sim) {
      const o = e.o, { Bodies, Constraint, Composite } = M(), p = pivotOf(o), rest = ballRest(o);
      e.body = Bodies.rectangle(o.x, o.y - 22, 110, 44, { isStatic: true, friction: 0.6 }); // crawler body
      e.ball = Bodies.circle(rest.x, rest.y, o.r, { density: o.density, friction: 0.3, restitution: 0.1, frictionAir: 0.002 });
      Composite.add(sim.world, [e.ball, Constraint.create({ pointA: p, bodyB: e.ball, pointB: { x: 0, y: 0 }, length: o.chain, stiffness: 1 })]);
    },
    update(e, sim) {
      if (e.active) return;
      const { Body } = M(), rest = ballRest(e.o); // held back until it's let go
      Body.setPosition(e.ball, rest);
      Body.setVelocity(e.ball, { x: 0, y: 0 });
      sim.float(e.ball);
    },
    busy: (e) => e.active && e.ball.speed > 0.3,
    draw(ctx, o, s) {
      const e = s.e, sd = o.direction < 0 ? -1 : 1, p = pivotOf(o), bp = e ? e.ball.position : ballRest(o);
      ctx.save();
      box(ctx, o.x - 55, o.y - 16, 110, 16, 8, '#27272a'); // tracks
      for (let i = 0; i < 6; i++) ell(ctx, o.x - 45 + i * 18, o.y - 8, 6, 6, '#52525b');
      box(ctx, o.x - 40, o.y - 48, 80, 32, 4, o.color, dark(o.color, -0.5)); // cab
      ctx.fillStyle = '#a8dcff';
      ctx.fillRect(o.x - 34 + (sd > 0 ? 40 : 0), o.y - 44, 24, 14);
      ctx.strokeStyle = dark(o.color, -0.3); // lattice boom from the cab to the tip
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(o.x + sd * 20, o.y - 44); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      line(ctx, [[o.x - sd * 20, o.y - 48], [p.x, p.y]], '#57534e', 1.2);
      ctx.strokeStyle = '#3f3f46'; // chain
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(bp.x, bp.y); ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(bp.x - o.r * 0.35, bp.y - o.r * 0.4, o.r * 0.1, bp.x, bp.y, o.r);
      g.addColorStop(0, '#9ca3af');
      g.addColorStop(1, '#111827');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, o.r, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });

  // =================================================================== pillar & girder
  CR.defineType('pillar', {
    label: 'Pillar',
    category: CAT,
    description: 'A tall concrete building pillar. Stand them in a row and they topple like giant dominoes; lay girders across them.',
    iconScale: 0.3,
    defaults: () => ({ w: 34, h: 170, angle: 0, color: '#d6d3d1', density: 0.003 }),
    props: [PX(), PY(), PANGLE, num('w', 'Width', 1, 8, 200), num('h', 'Height', 1, 30, 800), PCOLOR(), num('density', 'Density', 0.0005, 0.0005)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w + 10, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { angle: o.angle * D2R, density: o.density, friction: 0.6, frictionStatic: 0.8 });
      e.body.crSlick = true;
    },
    draw(ctx, o, s) {
      const w = o.w, h = o.h;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      box(ctx, -w / 2, -h / 2 + 8, w, h - 16, 2, o.color, dark(o.color, -0.35));
      ctx.strokeStyle = dark(o.color, -0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -w / 2 + w / 4; x < w / 2; x += w / 4) { ctx.moveTo(x, -h / 2 + 10); ctx.lineTo(x, h / 2 - 10); }
      ctx.stroke();
      box(ctx, -w / 2 - 5, -h / 2, w + 10, 9, 2, light(o.color, 0.15), dark(o.color, -0.4)); // capital
      box(ctx, -w / 2 - 5, h / 2 - 9, w + 10, 9, 2, light(o.color, 0.15), dark(o.color, -0.4)); // base
      ctx.restore();
    },
  });
  CR.defineType('girder', {
    label: 'Steel girder',
    category: CAT,
    description: 'A heavy steel I-beam. Lay it across pillars, or let it fall.',
    iconScale: 0.25,
    defaults: () => ({ w: 240, h: 18, angle: 0, color: '#dc2626', density: 0.005 }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 40, 1500), num('h', 'Depth', 1, 8, 80), PCOLOR(), num('density', 'Density', 0.0005, 0.0005)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { angle: o.angle * D2R, density: o.density, friction: 0.5 });
    },
    draw(ctx, o, s) {
      const w = o.w, h = o.h;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = dark(o.color, -0.25);
      ctx.fillRect(-w / 2, -h * 0.18, w, h * 0.36); // web
      box(ctx, -w / 2, -h / 2, w, h * 0.3, 1, o.color, dark(o.color, -0.5)); // flanges
      box(ctx, -w / 2, h / 2 - h * 0.3, w, h * 0.3, 1, o.color, dark(o.color, -0.5));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = -w / 2 + 14; x < w / 2 - 8; x += 26) { ctx.beginPath(); ctx.arc(x, 0, Math.min(3, h * 0.12), 0, TAU); ctx.fill(); }
      ctx.restore();
    },
  });

  // =================================================================== detonator plunger & dynamite
  // Push the plunger (bump it, at start, or triggered) and it sets off what its wire leads to.
  CR.defineType('plunger', {
    label: 'Detonator plunger',
    category: CAT,
    description: 'A detonator box. Push its plunger — bump it, or trigger it — and it sets off whatever its wire leads to (dynamite, a cannon, …).',
    iconSize: { w: 70, h: 80 },
    defaults: () => ({ link: '', trigger: 'touch', delay: 0, color: '#dc2626' }),
    props: [PX(), PY('Ground Y'), { key: 'link', label: 'Wired to', type: 'objref', hint: 'what it sets off (its Trigger: "When touched", or "When lit" for dynamite)' },
      trig('Pushed', [['touch', 'When something bumps it'], ['start', 'At start (after the delay)'], ['none', 'Never']]), PDELAY, PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y - 34, w: 56, h: 70, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y - 30, 52, 60, { isStatic: true }); },
    activate(e, sim) { e.pushedAt = sim.t; sim.link(e); sim.emit(e.o.x, e.o.y - 64, 'spark', 8, { speed: 2 }); },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, push = e && e.pushedAt != null ? Math.min(1, (t - e.pushedAt) / 0.15) : 0;
      const target = o.link && CR.objectPos && CR.objectPos(o.link);
      ctx.save();
      if (target) { // the wire, sagging along the ground
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x + (target.x < s.x ? -26 : 26), s.y - 10);
        ctx.quadraticCurveTo((s.x + target.x) / 2, Math.max(s.y, target.y) + 6, target.x, target.y);
        ctx.stroke();
      }
      ctx.translate(s.x, s.y);
      const ph = -60 + push * 22; // plunger handle height
      line(ctx, [[0, -46], [0, ph]], '#9ca3af', 4);
      line(ctx, [[-18, ph], [18, ph]], '#374151', 6);
      box(ctx, -26, -46, 52, 46, 4, o.color, dark(o.color, -0.5));
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-16, -32, 32, 12);
      ctx.fillStyle = '#7f1d1d';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TNT', 0, -23);
      ctx.restore();
    },
  });
  CR.defineType('dynamite', Object.assign({}, CR.types.bomb, {
    label: 'Dynamite',
    category: CAT,
    description: 'A bundle of dynamite. Lit by a detonator plunger, a fuse or fire, it fizzes for the fuse time, then blasts everything nearby away.',
    iconScale: 1,
    defaults: () => ({ r: 18, trigger: 'fire', delay: 0.4, radius: 210, power: 16, color: '#dc2626' }),
    box: (o, s) => ({ x: s.x, y: s.y - 4, w: 40, h: 36, angle: s.angle }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 36, 24, { density: 0.004, friction: 0.6 }); },
    draw(ctx, o, s) {
      const e = s.e;
      if (e && e.done) return;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      for (const y of [-8, 0, 8]) box(ctx, -18, y - 4, 36, 8, 4, y ? o.color : light(o.color, 0.1), dark(o.color, -0.5));
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-4, -12, 8, 24);
      line(ctx, [[0, -12], [4, -20], [1, -25]], '#a16207', 1.5);
      if (e && e.triggered && !e.active) U.glow(ctx, 1, -25, 8, 'rgba(255,240,150,1)', 'rgba(255,140,0,0)');
      ctx.restore();
    },
  }));

  // =================================================================== dirt mound & traffic cone
  // The mound's (x, y) is the middle of its base, on the ground.
  const moundPts = (o) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      pts.push({ x: o.x + Math.cos(a) * o.w / 2, y: o.y - Math.sin(a) * o.h });
    }
    return pts;
  };
  CR.defineType('dirtmound', {
    label: 'Dirt mound',
    category: CAT,
    description: 'A fixed mound of dirt: things roll up and over it — or launch off it.',
    iconSize: { w: 300, h: 100 },
    noScale: true, // has its own size
    icon: centredIcon('dirtmound'),
    defaults: () => ({ w: 300, h: 90, color: '#92573a' }),
    props: [PX('Centre X'), PY('Ground Y'), num('w', 'Width', 5, 40, 3000), num('h', 'Height', 2, 10, 800), PCOLOR()],
    box: (o) => ({ x: o.x, y: o.y - o.h / 2, w: o.w, h: o.h, angle: 0 }),
    hit(o, s, x, y, pad) { const dx = (x - o.x) / (o.w / 2); return Math.abs(dx) <= 1 && y <= o.y + pad && y >= o.y - o.h * Math.sqrt(Math.max(0, 1 - dx * dx)) - pad; },
    build(e) {
      const o = e.o, { Bodies } = M();
      e.body = Bodies.fromVertices(o.x, o.y - o.h * 0.4, [moundPts(o)], { isStatic: true, friction: 0.8 });
    },
    draw(ctx, o) {
      ctx.save();
      U.polyPath(ctx, moundPts(o));
      ctx.closePath();
      const g = ctx.createLinearGradient(0, o.y - o.h, 0, o.y);
      g.addColorStop(0, light(o.color, 0.12));
      g.addColorStop(1, dark(o.color, -0.25));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = dark(o.color, -0.35);
      for (let i = 0; i < 14; i++) { // pebbles
        const u = ((i * 37) % 100) / 100 - 0.5, v = ((i * 53) % 100) / 100;
        const x = o.x + u * o.w * 0.8, yTop = o.y - o.h * Math.sqrt(Math.max(0, 1 - (2 * u * 0.8) ** 2));
        ctx.beginPath(); ctx.arc(x, yTop + (o.y - yTop) * (0.2 + v * 0.7), 2.5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  });
  CR.defineType('cone', {
    label: 'Traffic cone',
    category: CAT,
    description: 'A light orange traffic cone that tips over easily.',
    iconScale: 0.9,
    defaults: () => ({ angle: 0, color: '#f97316' }),
    props: [PX(), PY(), PANGLE, PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: () => 34 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 30, h: 40, angle: s.angle }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 26, 38, { angle: e.o.angle * D2R, density: 0.0015, friction: 0.7 }); },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      box(ctx, -15, 15, 30, 5, 1, dark(o.color, -0.3));
      poly(ctx, [[-11, 15], [11, 15], [3, -19], [-3, -19]], o.color, dark(o.color, -0.45), 1);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-7, -4, 14, 5);
      ctx.fillRect(-9, 6, 18, 4);
      ctx.restore();
    },
  });
})();
