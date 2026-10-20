/*
 * Object pack: Prehistoric -- cave people, dinosaurs, a mammoth, campfire, torch, cave,
 * boulder and stone wheel.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw;
  const { PX, PY, PANGLE, PCOLOR, PDELAY, num } = CR.P;
  const { flyer, walker, poly, ell, box, eye, line, legs4, dark, light } = CR.pack;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;

  // =================================================================== cave people
  // Shared figure: fur outfit with spots, bare arms and legs; `extra` draws hair, club, etc.
  function caveFigure(ctx, o, mv, ph, extra) {
    const skin = o.skin || '#d6a77a', fur = o.color, sw = mv ? Math.sin(ph * 1.4) : 0;
    for (const k of [1, -1]) { // legs
      const a = sw * 0.5 * k;
      line(ctx, [[k * 3, 8], [k * 3 + Math.sin(a) * 9, 18], [k * 3 + Math.sin(a) * 9 + 3, 28]], k > 0 ? skin : dark(skin, -0.15), 4.5);
      ell(ctx, k * 3 + Math.sin(a) * 9 + 5, 29, 5, 2.2, '#5b3a1e');
    }
    line(ctx, [[-2, -14], [-6 - sw * 6, -2], [-4 - sw * 6, 6]], dark(skin, -0.15), 4); // back arm
    poly(ctx, [[-10, -16], [9, -18], [12, 10], [-12, 10]], fur, dark(fur, -0.4), 1);
    poly(ctx, [[-12, 10], [-6, 14], [0, 10], [6, 14], [12, 10]], fur);
    ctx.fillStyle = dark(fur, -0.45);
    for (const [x, y] of [[-5, -10], [4, -6], [-2, 2], [6, 5], [-7, 6]]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); }
    ell(ctx, 1, -25, 8, 8.5, skin); // head
    eye(ctx, 5, -26, 1.4);
    line(ctx, [[3, -22], [7, -22]], dark(skin, -0.5), 1);
    extra(ctx, sw, skin);
  }
  walker('caveman', { label: 'Caveman', category: 'Prehistoric', desc: 'A caveman with a club, walking (or wandering) his path.', w: 30, h: 60, speed: 80, color: '#a16207' }, (ctx, o, f, mv, s, ph) => {
    caveFigure(ctx, o, mv, ph, (c, sw, skin) => {
      poly(c, [[-8, -30], [-2, -36], [6, -35], [10, -28], [9, -24], [3, -31], [-6, -26]], '#3f2a14'); // shaggy hair
      ell(c, 3, -18, 6, 4, '#3f2a14'); // beard
      line(c, [[2, -14], [10 + sw * 6, -4]], skin, 4); // front arm with club
      line(c, [[10 + sw * 6, -4], [16 + sw * 6, -22]], '#78350f', 5);
      ell(c, 17 + sw * 6, -25, 5, 7, '#92400e', 0.3);
    });
  });
  walker('cavewoman', { label: 'Cavewoman', category: 'Prehistoric', desc: 'A cavewoman with a bone in her hair, walking (or wandering) her path.', w: 30, h: 60, speed: 85, color: '#c2410c' }, (ctx, o, f, mv, s, ph) => {
    caveFigure(ctx, o, mv, ph, (c, sw, skin) => {
      c.fillStyle = '#7c2d12'; // long hair
      c.beginPath(); c.ellipse(-1, -24, 10, 11, 0, Math.PI * 0.9, TAU * 1.02); c.fill();
      c.fillRect(-10, -26, 6, 18);
      line(c, [[-8, -34], [4, -36]], '#f5f5f4', 3); // bone
      ell(c, -8, -34, 2.5, 2.5, '#f5f5f4'); ell(c, 4, -36, 2.5, 2.5, '#f5f5f4');
      line(c, [[2, -14], [9 + sw * 6, -3], [12 + sw * 6, 4]], skin, 4);
    });
  });

  // =================================================================== dinosaurs & beasts
  walker('triceratops', { label: 'Triceratops', category: 'Prehistoric', desc: 'A three-horned dinosaur that plods along its path, shoving things aside.', w: 110, h: 60, speed: 60, density: 0.03, color: '#65a30d' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-30, -20, 18, 28], 6, 22, ph * 0.9, mv, dark(c, -0.2), 9);
    poly(ctx, [[-30, -2], [-56, 6], [-30, 10]], c); // tail
    ell(ctx, -4, -4, 36, 20, c);
    for (let i = 0; i < 5; i++) ell(ctx, -22 + i * 9, -14, 3, 2, dark(c, -0.2));
    ctx.fillStyle = light(c, 0.25); // frill
    ctx.beginPath(); ctx.arc(30, -12, 20, -Math.PI * 0.95, Math.PI * 0.35); ctx.closePath(); ctx.fill();
    ell(ctx, 42, -2, 14, 10, c);
    poly(ctx, [[44, -12], [60, -26], [48, -8]], '#f5f5f4');
    poly(ctx, [[36, -14], [50, -32], [40, -10]], '#f5f5f4');
    poly(ctx, [[54, 0], [64, -6], [56, 4]], '#f5f5f4');
    eye(ctx, 44, -6, 1.8);
  });
  walker('brontosaurus', { label: 'Long-neck', category: 'Prehistoric', desc: 'A huge long-necked dinosaur, slow and very heavy.', w: 150, h: 110, speed: 45, density: 0.05, color: '#0d9488' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color, sway = Math.sin(f * 0.8) * 3;
    legs4(ctx, [-30, -18, 16, 28], 14, 38, ph * 0.7, mv, dark(c, -0.2), 12);
    ctx.strokeStyle = c; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-36, 6); ctx.quadraticCurveTo(-70, 10, -78, 30); ctx.stroke(); // tail
    ell(ctx, -4, 4, 42, 24, c);
    ell(ctx, -4, 12, 32, 12, light(c, 0.2));
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(28, -6); ctx.quadraticCurveTo(48, -30, 52 + sway, -52); ctx.stroke(); // neck
    ell(ctx, 58 + sway, -56, 11, 7, c);
    eye(ctx, 61 + sway, -58, 1.6);
  });
  flyer('pterodactyl', { label: 'Pterodactyl', category: 'Prehistoric', desc: 'A flying reptile with a long crest, gliding along its flight path.', w: 80, h: 30, speed: 170, color: '#b45309', flap: 0.35 }, (ctx, o, f) => {
    const c = o.color, l = Math.sin(f) * 16;
    poly(ctx, [[-4, -2], [-30, -10 - l], [-44, -4 - l * 0.6], [-10, 4]], dark(c, -0.15));
    ell(ctx, 0, 0, 16, 5, c);
    poly(ctx, [[12, -4], [34, 0], [12, 3]], c); // beak
    poly(ctx, [[8, -4], [0, -14], [12, -6]], c); // crest
    eye(ctx, 10, -2, 1.3);
    poly(ctx, [[-4, -2], [-28, -12 - l], [-40, -6 - l * 0.6], [-8, 4]], c);
  });
  walker('mammoth', { label: 'Woolly mammoth', category: 'Prehistoric', desc: 'A shaggy mammoth with curving tusks; huge and heavy.', w: 120, h: 92, speed: 55, density: 0.05, color: '#7c4a1e' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-30, -18, 16, 28], 16, 30, ph * 0.8, mv, dark(c, -0.2), 13);
    ell(ctx, -6, -2, 44, 32, c);
    ctx.strokeStyle = dark(c, -0.25); // shaggy fur strands
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const x = -44 + i * 7; ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 2, 30); ctx.stroke(); }
    ell(ctx, 34, -16, 22, 22, c);
    ell(ctx, 26, -38, 14, 8, dark(c, -0.1)); // hump of hair
    ctx.strokeStyle = c; ctx.lineWidth = 10; ctx.lineCap = 'round'; // trunk
    ctx.beginPath(); ctx.moveTo(50, -10); ctx.quadraticCurveTo(62, 14, 54 + Math.sin(f * 2) * 3, 34); ctx.stroke();
    ctx.strokeStyle = '#f5f5f4'; ctx.lineWidth = 5; // tusks
    ctx.beginPath(); ctx.moveTo(44, 0); ctx.quadraticCurveTo(70, 14, 72, -6); ctx.stroke();
    eye(ctx, 42, -20, 2);
  });

  // =================================================================== fire: campfire & torch
  // Lit at start (or by fire); burns for its burn time (0 = for ever), lighting fuses and other
  // ignitable things just above the flames. Rain puts them out; snow melts around them.
  function fireType(name, d) {
    CR.defineType(name, {
      label: d.label,
      category: 'Prehistoric',
      description: d.desc,
      iconSize: d.iconSize,
      ignitable: true,
      defaults: () => ({ trigger: 'start', delay: 0, burnTime: 0, color: d.color }),
      props: [PX(), PY(),
        { key: 'trigger', label: 'Lit', type: 'select', options: [['start', 'At start (after the delay)'], ['fire', 'When fire reaches it'], ['touch', 'When touched or triggered'], ['none', 'Never']] },
        PDELAY, num('burnTime', 'Burn time (s)', 0.5, 0, undefined, '0 = burns for ever'), PCOLOR(d.colorLabel)],
      box: d.box,
      flameAt: (e) => d.flame(e.o, e.k || 1),
      build(e) { e.body = d.body(e.o); },
      activate(e, sim) { e.out = e.o.burnTime > 0 ? sim.t + e.o.burnTime : Infinity; },
      busy: (e, sim) => e.active && !e.done && e.out !== Infinity,
      update(e, sim) {
        if (!e.active || e.done) return;
        const f = d.flame(e.o, e.k);
        if (sim.t >= e.out) {
          e.done = true;
          sim.emit(f.x, f.y, 'smoke', 12, { speed: 0.7, vy: -0.9 });
          return;
        }
        sim.emit(f.x + (Math.random() - 0.5) * d.spread * e.k, f.y, 'fire', d.rate, { dir: -Math.PI / 2, spread: 0.5, speed: 1.1, life: 20 });
        if (sim.frame % 8 === 0) sim.emit(f.x, f.y - 20 * e.k, 'smoke', 1, { speed: 0.4, vy: -0.9 });
        sim.igniteNear(f.x, f.y - 10 * e.k, d.reach * e.k, e);
      },
      draw(ctx, o, s) { d.art(ctx, o, s, s.e && s.e.active && !s.e.done, s.e && s.e.done); },
    });
  }
  function flameShape(ctx, x, y, h, t, seed) {
    const fl = 1 + 0.15 * Math.sin(t * 18 + seed);
    const g = ctx.createRadialGradient(x, y - h * 0.3, 1, x, y - h * 0.3, h * fl);
    g.addColorStop(0, 'rgba(255,250,200,1)');
    g.addColorStop(0.45, 'rgba(255,170,40,0.95)');
    g.addColorStop(1, 'rgba(220,50,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - h * fl);
    ctx.quadraticCurveTo(x + h * 0.45, y - h * 0.3, x, y);
    ctx.quadraticCurveTo(x - h * 0.45, y - h * 0.3, x, y - h * fl);
    ctx.fill();
  }
  fireType('campfire', {
    label: 'Campfire', desc: 'A ring of stones with crackling logs. Lights things just above it; rain puts it out and snow melts around it.',
    color: '#78716c', colorLabel: 'Stones', iconSize: { w: 80, h: 70 }, spread: 26, rate: 3, reach: 34,
    box: (o, s) => ({ x: s.x, y: s.y - 18, w: 76, h: 60, angle: 0 }),
    flame: (o, k = 1) => ({ x: o.x, y: o.y - 14 * k }),
    body: (o) => M().Bodies.rectangle(o.x, o.y, 64, 16, { isStatic: true, friction: 0.6 }),
    art(ctx, o, s, lit) {
      const t = s.t || 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      line(ctx, [[-22, -2], [20, -12]], '#78350f', 7);
      line(ctx, [[22, -2], [-18, -12]], '#92400e', 7);
      if (lit) {
        U.glow(ctx, 0, -18, 50, 'rgba(255,190,80,0.35)', 'rgba(255,140,0,0)');
        flameShape(ctx, -8, -8, 30, t, 1);
        flameShape(ctx, 9, -8, 26, t, 3);
        flameShape(ctx, 0, -6, 40, t, 5);
      }
      for (let i = 0; i < 7; i++) ell(ctx, -30 + i * 10, 2 + (i % 2) * 2, 7, 5.5, i % 2 ? o.color : dark(o.color, -0.15));
      ctx.restore();
    },
  });
  fireType('torch', {
    label: 'Torch', desc: 'A flaming torch on a stake. Lights things that come near its flame; rain puts it out and snow melts around it.',
    color: '#78350f', colorLabel: 'Stake', iconSize: { w: 40, h: 110 }, spread: 8, rate: 1, reach: 16,
    box: (o, s) => ({ x: s.x, y: s.y - 16, w: 22, h: 100, angle: 0 }),
    flame: (o, k = 1) => ({ x: o.x, y: o.y - 50 * k }),
    body: (o) => M().Bodies.rectangle(o.x, o.y, 6, 70, { isStatic: true }),
    art(ctx, o, s, lit) {
      const t = s.t || 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      line(ctx, [[0, 35], [0, -40]], o.color, 6);
      poly(ctx, [[-7, -40], [7, -40], [5, -50], [-5, -50]], '#57534e');
      if (lit) {
        U.glow(ctx, 0, -60, 34, 'rgba(255,190,80,0.4)', 'rgba(255,140,0,0)');
        flameShape(ctx, 0, -48, 26, t, 2);
      }
      ctx.restore();
    },
  });

  // =================================================================== scenery & rocks
  CR.defineType('cave', {
    label: 'Cave',
    category: 'Prehistoric',
    description: 'A rocky cave mouth (scenery: things pass in front of it). Put it near the back with To back.',
    iconSize: { w: 300, h: 200 },
    noScale: true, // has its own size
    defaults: () => ({ w: 340, h: 230, color: '#78716c' }),
    props: [PX('Centre X'), PY('Ground Y'), num('w', 'Width', 5, 60, 4000), num('h', 'Height', 5, 40, 3000), PCOLOR('Rock')],
    box: (o) => ({ x: o.x, y: o.y - o.h / 2, w: o.w, h: o.h, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y - 5, 10, 10, { isStatic: true, isSensor: true }); },
    draw(ctx, o) {
      const w = o.w, h = o.h;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.beginPath(); // the hill of rock
      ctx.moveTo(-w / 2, 0);
      ctx.bezierCurveTo(-w * 0.5, -h * 0.7, -w * 0.25, -h, 0, -h);
      ctx.bezierCurveTo(w * 0.3, -h, w * 0.5, -h * 0.65, w / 2, 0);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -h, 0, 0);
      g.addColorStop(0, light(o.color, 0.2));
      g.addColorStop(1, dark(o.color, -0.2));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.4);
      ctx.lineWidth = 2;
      for (const [x, y, r] of [[-0.3, -0.6, 0.08], [0.25, -0.7, 0.06], [0.33, -0.3, 0.07], [-0.36, -0.25, 0.05]]) {
        ctx.beginPath(); ctx.arc(x * w, y * h, r * w, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
      ctx.beginPath(); // the dark mouth
      ctx.moveTo(-w * 0.22, 0);
      ctx.bezierCurveTo(-w * 0.24, -h * 0.55, w * 0.24, -h * 0.55, w * 0.22, 0);
      ctx.closePath();
      const m = ctx.createRadialGradient(0, -h * 0.1, 4, 0, -h * 0.15, w * 0.3);
      m.addColorStop(0, '#0c0a09');
      m.addColorStop(1, '#292524');
      ctx.fillStyle = m;
      ctx.fill();
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 22, w: 66, h: 44 })); },
  });

  // an irregular rock, the same shape every time for a given id
  function rockPoints(o) {
    const rand = CR.rng ? CR.rng(CR.hash(String(o.id || 'rock'))) : Math.random, n = 9, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = o.r * (0.82 + rand() * 0.3);
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    const c = M().Vertices.centre(pts); // Matter centres bodies on this, so the drawing matches
    return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  }
  CR.defineType('boulder', {
    label: 'Boulder',
    category: 'Prehistoric',
    description: 'A big, heavy, lumpy rock. Rolls (bumpily) down slopes and flattens what it hits.',
    iconScale: 0.7,
    defaults: () => ({ r: 32, angle: 0, color: '#78716c', density: 0.008, vx: 0 }),
    props: [PX(), PY(), num('r', 'Size', 1, 5, 400), PANGLE, PCOLOR(), num('density', 'Density', 0.001, 0.0005), num('vx', 'Start push', 0.5)],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 2.2, h: o.r * 2.2, angle: 0 }),
    build(e) {
      const o = e.o, { Bodies, Body } = M();
      e.body = Bodies.fromVertices(o.x, o.y, [rockPoints(o).map((p) => ({ x: o.x + p.x, y: o.y + p.y }))], { density: o.density, friction: 0.8, restitution: 0.1 });
      Body.setPosition(e.body, { x: o.x, y: o.y });
      if (o.angle) Body.setAngle(e.body, o.angle * D2R);
      if (o.vx) Body.setVelocity(e.body, { x: +o.vx, y: 0 });
    },
    draw(ctx, o, s) {
      const pts = rockPoints(o);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      U.polyPath(ctx, pts);
      ctx.closePath();
      const g = ctx.createRadialGradient(-o.r * 0.3, -o.r * 0.35, o.r * 0.1, 0, 0, o.r * 1.1);
      g.addColorStop(0, light(o.color, 0.3));
      g.addColorStop(1, dark(o.color, -0.35));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-o.r * 0.3, -o.r * 0.1); ctx.lineTo(o.r * 0.1, o.r * 0.25); ctx.stroke();
      ctx.restore();
    },
  });
  CR.defineType('stonewheel', {
    label: 'Stone wheel',
    category: 'Prehistoric',
    description: 'A heavy stone wheel with a hole in the middle. Rolls a long way.',
    iconScale: 0.8,
    defaults: () => ({ r: 30, color: '#a8a29e', density: 0.006, vx: 0 }),
    props: [PX(), PY(), num('r', 'Radius', 1, 5, 400), PCOLOR(), num('density', 'Density', 0.001, 0.0005), num('vx', 'Start push', 0.5)],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 2, h: o.r * 2, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r, { density: o.density, friction: 0.9, restitution: 0.1 });
      if (o.vx) M().Body.setVelocity(e.body, { x: +o.vx, y: 0 });
    },
    draw(ctx, o, s) {
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ell(ctx, 0, 0, r, r, o.color);
      ctx.strokeStyle = dark(o.color, -0.4);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35); ctx.lineTo(Math.cos(a + 0.2) * r * 0.85, Math.sin(a + 0.2) * r * 0.85); ctx.stroke(); }
      ell(ctx, 0, 0, r * 0.25, r * 0.25, '#57534e');
      ctx.restore();
    },
  });
})();
