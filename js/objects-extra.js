/*
 * Object pack: stairway, slinky, push button, countdown timer, text block, spaceship, and the
 * escalator and elevator machines.
 *
 * Button and countdown set off other objects through up to three links
 * (link, link2, link3), the same way pinball bumpers and targets do: the linked
 * object is triggered unless its Trigger is "Never" (paddles flip).
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw, G = CR.geom;
  const { PX, PY, PANGLE, PCOLOR, PTRIG, PDELAY, num } = CR.P;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;
  const dark = (c, a = -0.35) => U.shade(c, a);
  const light = (c, a = 0.4) => U.shade(c, a);

  const LINKS = ['link', 'link2', 'link3'];
  const linkProps = (label) => LINKS.map((key, i) => ({
    key, label: i ? `…and trigger` : label, type: 'objref', hint: i ? '' : 'set the target\'s Trigger to "When touched"',
  }));
  CR.linkKeys = LINKS.concat('by'); // object references: kept on copy/paste, drawn as dashed links
  function fireLinks(e, sim) {
    for (const k of LINKS) if (e.o[k]) sim.signal(sim.entById(e.o[k]));
  }
  /** Solid static bodies (floor, ramps, stairs, ...) that contain the point. */
  function solidAt(sim, x, y) {
    const bodies = M().Composite.allBodies(sim.world).filter((b) => b.isStatic && !b.isSensor);
    return M().Query.point(bodies, { x, y }).length > 0;
  }

  // ---------------------------------------------------------------- stairway
  // (x, y) is the centre of the whole flight; step 0 is the top step.
  function stairGeom(o) {
    const n = Math.max(1, Math.round(o.steps)), w = o.stepW, h = o.stepH, W = n * w, H = n * h;
    const x0 = o.x - W / 2, y0 = o.y - H / 2, dir = o.dir < 0 ? -1 : 1;
    const cols = [];
    for (let i = 0; i < n; i++) {
      const left = dir > 0 ? x0 + i * w : x0 + W - (i + 1) * w;
      cols.push({ x: left, y: y0 + i * h, w, h: H - i * h });
    }
    return { n, W, H, x0, y0, cols };
  }
  CR.defineType('stairs', {
    label: 'Stairway',
    category: 'Basics',
    description: 'A fixed flight of steps. Set how many steps there are and how wide and tall each one is. A slinky will walk down it.',
    iconSize: { w: 150, h: 90 },
    noScale: true, // sized by its steps
    defaults: () => ({ steps: 6, stepW: 50, stepH: 30, dir: 1, color: '#9ca3af', friction: 0.6 }),
    props: [PX('Centre X'), PY('Centre Y'), num('steps', 'Number of steps', 1, 1, 100), num('stepW', 'Step depth', 1, 5, 400),
      num('stepH', 'Step height', 1, 2, 300),
      { key: 'dir', label: 'Goes down', type: 'select', num: true, options: [[1, 'To the right ↘'], [-1, '↙ To the left']] },
      PCOLOR(), num('friction', 'Friction', 0.05, 0, 1)],
    box(o) { const g = stairGeom(o); return { x: o.x, y: o.y, w: g.W, h: g.H, angle: 0 }; },
    hit(o, s, x, y, pad) {
      for (const c of stairGeom(o).cols) if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) return true;
      return false;
    },
    build(e) {
      const { Bodies, Body } = M();
      const parts = stairGeom(e.o).cols.map((c) => Bodies.rectangle(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h));
      e.body = parts.length === 1
        ? Bodies.rectangle(parts[0].position.x, parts[0].position.y, e.o.stepW, e.o.stepH, { isStatic: true, friction: e.o.friction })
        : Body.create({ parts, isStatic: true, friction: e.o.friction });
    },
    draw(ctx, o) {
      const g = stairGeom(o), dir = o.dir < 0 ? -1 : 1;
      ctx.save();
      ctx.beginPath();
      const bottom = g.y0 + g.H;
      // outline: walk the step tops, then back along the bottom
      const cols = dir > 0 ? g.cols : [...g.cols].reverse();
      ctx.moveTo(cols[0].x, bottom);
      for (const c of cols) { ctx.lineTo(c.x, c.y); ctx.lineTo(c.x + c.w, c.y); }
      ctx.lineTo(cols[cols.length - 1].x + cols[cols.length - 1].w, bottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, g.y0, 0, bottom);
      grad.addColorStop(0, light(o.color, 0.2));
      grad.addColorStop(1, dark(o.color, -0.2));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // tread nosings
      ctx.strokeStyle = light(o.color, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const c of g.cols) { ctx.moveTo(c.x + 1, c.y + 1.5); ctx.lineTo(c.x + c.w - 1, c.y + 1.5); }
      ctx.stroke();
      ctx.restore();
    },
    icon(g) {
      this.draw(g, Object.assign(this.defaults(), { x: 0, y: 0, steps: 4, stepW: 15, stepH: 9 }));
    },
  });

  // ---------------------------------------------------------------- slinky
  // A spring that walks down steps end over end. It looks ahead `hop` pixels for the
  // ground; it hops when that ground is lower and stops at a wall, an edge it can't see
  // the bottom of, or (optionally) flat ground. The body follows the middle of the coil.
  const COIL_H = 18;
  function groundBelow(sim, x, y) {
    if (solidAt(sim, x, y)) return null; // a wall or a higher step
    const lim = sim.W.height + 60;
    for (let yy = y; yy < lim; yy += 2) if (solidAt(sim, x, yy)) return yy;
    return null;
  }
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  function coilPoint(A, B, u) {
    const d = Math.hypot(B.x - A.x, B.y - A.y), p = lerp(A, B, u);
    return { x: p.x, y: p.y - Math.sin(Math.PI * u) * (COIL_H + d * 0.45) };
  }
  function drawCoil(ctx, o, A, B) {
    const rw = o.w / 2, rings = 16;
    ctx.save();
    ctx.lineWidth = 2;
    const d = Math.hypot(B.x - A.x, B.y - A.y);
    for (let i = 0; i < rings; i++) {
      const u = i / (rings - 1);
      let x, y, ang;
      if (d < 2) { // resting: a squashed stack
        x = A.x; y = A.y - 1.5 - u * (COIL_H - 3); ang = 0;
      } else {
        const p = coilPoint(A, B, u), q = coilPoint(A, B, Math.min(1, u + 0.01)), r = coilPoint(A, B, Math.max(0, u - 0.01));
        x = p.x; y = p.y; ang = Math.atan2(q.y - r.y, q.x - r.x) + Math.PI / 2;
      }
      ctx.strokeStyle = i % 2 ? o.color : light(o.color, 0.35);
      ctx.beginPath();
      ctx.ellipse(x, y, rw, 2.6, ang, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  CR.defineType('slinky', {
    label: 'Slinky',
    category: 'Toys',
    description: 'A spring toy that flips end over end down a stairway (or any steps), pushing whatever it lands on. Set Hop length to the step depth.',
    iconSize: { w: 40, h: 40 },
    kinematic: true,
    noScale: true, // has its own width
    defaults: () => ({ hop: 50, time: 0.6, hops: 30, dir: 1, stopOnFlat: true, w: 28, trigger: 'start', delay: 0, color: '#9aa4b1' }),
    props: [PX(), PY(), num('hop', 'Hop length', 1, 5, 400, 'match the stairway\'s step depth'), num('time', 'Time per hop (s)', 0.05, 0.1, 5),
      num('hops', 'Max hops', 1, 1, 500),
      { key: 'dir', label: 'Direction', type: 'select', num: true, options: [[1, 'Right →'], [-1, '← Left']] },
      { key: 'stopOnFlat', label: 'Stop on flat ground', type: 'checkbox' },
      num('w', 'Width', 1, 8, 200), PTRIG, PDELAY, PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w + 6, h: COIL_H + 6, angle: 0 }),
    build(e) {
      const { Bodies, Body } = M(), o = e.o;
      e.body = Bodies.rectangle(o.x, o.y, o.w, COIL_H, { density: 0.01, friction: 0.3, frictionAir: 0 });
      Body.setInertia(e.body, Infinity);
      e.A = null; // feet: A = back end, B = front end
      e.B = null;
      e.hopNo = 0;
    },
    busy: (e) => e.active && !e.done,
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M();
      if (!e.A) { // settle onto whatever is below
        const y = groundBelow(sim, o.x, o.y) ?? o.y + COIL_H / 2;
        e.A = { x: o.x, y };
        e.B = { x: o.x, y };
      }
      if (e.hop) {
        const h = e.hop;
        h.p = Math.min(1, h.p + 1 / (Math.max(0.1, o.time) * 60));
        if (h.p < 0.6) { // front end flips over...
          const u = h.p / 0.6;
          e.A = h.from;
          e.B = lerp(h.from, h.to, u);
          e.B.y -= Math.sin(Math.PI * u) * Math.max(20, o.hop * 0.5);
        } else { // ...then the back end follows
          const u = (h.p - 0.6) / 0.4;
          e.B = h.to;
          e.A = lerp(h.from, h.to, u);
          e.A.y -= Math.sin(Math.PI * u) * 8;
        }
        if (h.p >= 1) {
          e.A = { ...h.to };
          e.B = { ...h.to };
          e.hop = null;
          sim.emit(h.to.x, h.to.y, 'dust', 4, { speed: 1, dir: -Math.PI / 2, spread: Math.PI });
        }
      } else if (e.active && !e.done) {
        const dir = o.dir < 0 ? -1 : 1, tx = e.A.x + dir * o.hop;
        const ty = groundBelow(sim, tx, e.A.y - 6);
        const down = ty != null && ty > e.A.y + 2, flat = ty != null && Math.abs(ty - e.A.y) <= 2;
        if (e.hopNo >= o.hops || ty == null || (!down && !(flat && !o.stopOnFlat))) e.done = true;
        else {
          e.hopNo++;
          e.hop = { from: { ...e.A }, to: { x: tx, y: ty }, p: 0 };
        }
      }
      // the body rides the middle of the coil; driven by velocity so it shoves things
      const m = coilPoint(e.A, e.B, 0.5), tgt = { x: m.x, y: m.y + (Math.hypot(e.B.x - e.A.x, e.B.y - e.A.y) < 2 ? COIL_H / 2 : 0) };
      if (!e.placed) { Body.setPosition(b, tgt); e.placed = true; }
      Body.setVelocity(b, { x: tgt.x - b.position.x, y: tgt.y - b.position.y });
      sim.float(b);
    },
    draw(ctx, o, s) {
      const e = s.e;
      if (e && e.A) drawCoil(ctx, o, e.A, e.B);
      else {
        const f = { x: s.x, y: s.y + COIL_H / 2 };
        drawCoil(ctx, o, f, f);
      }
    },
    icon(g) {
      const o = this.defaults();
      drawCoil(g, o, { x: -14, y: 12 }, { x: 14, y: 12 });
    },
  });

  // ---------------------------------------------------------------- push button
  CR.buttonKey = (o) => (o.key ? CR.normKey(o.key) : 'btn:' + o.id);
  function press(e, sim) {
    if (sim.t < (e.cool || 0)) return;
    e.cool = sim.t + 0.25;
    e.glow = 1;
    sim.emit(e.o.x, e.o.y - 14, 'spark', 8, { speed: 2, dir: -Math.PI / 2, spread: 2 });
    fireLinks(e, sim);
  }
  CR.defineType('button', {
    label: 'Button',
    category: 'Controls',
    description: 'A big push button. Press it with its key or its on-screen button while running (or bump something into it) to set off up to three objects.',
    iconSize: { w: 60, h: 40 },
    defaults: () => ({ label: 'GO', key: '', onscreen: true, link: '', link2: '', link3: '', color: '#dc2626' }),
    props: [PX(), PY(), { key: 'onscreen', label: 'On-screen button', type: 'checkbox', hint: 'a button in the command bar presses it while running' },
      { key: 'label', label: 'Label', type: 'text', hint: 'shown on the on-screen button' },
      { key: 'key', label: 'Key', type: 'key', hint: 'optional; click the box, then press a key' },
      ...linkProps('Press triggers'), PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y - 6, w: 56, h: 32, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 50, 16, { isStatic: true, friction: 0.5 });
      e.glow = 0;
      e.wasDown = false;
    },
    onHit(e, other, sim) { if (!other.isStatic) press(e, sim); },
    update(e, sim) {
      const down = CR.input.keys.has(CR.buttonKey(e.o));
      if (down && !e.wasDown) press(e, sim);
      e.wasDown = down;
      e.glow *= 0.9;
    },
    draw(ctx, o, s, opts) {
      const e = s.e, g = e ? e.glow : 0, push = g > 0.4 ? 4 : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      U.rr(ctx, -25, -2, 50, 10, 3);
      ctx.fillStyle = '#374151';
      ctx.fill();
      if (g > 0.05) U.glow(ctx, 0, -8, 30, `rgba(255,220,120,${0.7 * g})`, 'rgba(255,200,0,0)');
      ctx.fillStyle = g > 0.4 ? light(o.color, 0.3) : o.color;
      ctx.beginPath();
      ctx.ellipse(0, -2 + push, 18, 14 - push, 0, Math.PI, TAU);
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-6, -9 + push, 5, 2.5, -0.3, 0, TAU); ctx.fill();
      if (!(opts && opts.icon)) {
        const lab = o.label || (o.key ? CR.keyLabel(CR.normKey(o.key)) : '');
        if (lab) {
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(30,41,59,0.85)';
          ctx.fillText(lab + (o.key && o.label ? ` (${CR.keyLabel(CR.normKey(o.key))})` : ''), 0, 22);
        }
      }
      ctx.restore();
    },
    icon(g) { this.draw(g, this.defaults(), { x: 0, y: 8, e: null }, { icon: true }); },
  });

  // ---------------------------------------------------------------- countdown timer
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec - 1e-9));
    return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
  }
  CR.defineType('countdown', {
    label: 'Countdown',
    category: 'Controls',
    description: 'A countdown display. When it reaches zero it sets off up to three objects — launch a rocket, fire a cannon, start a car.',
    iconSize: { w: 120, h: 60 },
    defaults: () => ({ seconds: 10, trigger: 'start', delay: 0, go: 'LIFTOFF!', link: '', link2: '', link3: '', color: '#111827' }),
    props: [PX(), PY(), num('seconds', 'Count from (s)', 1, 0, 3600),
      { key: 'trigger', label: 'Starts counting', type: 'select', options: [['start', 'At start'], ['touch', 'When touched or triggered'], ['none', 'Never']] },
      PDELAY, ...linkProps('At zero, trigger'), { key: 'go', label: 'Text at zero', type: 'text' }, PCOLOR('Panel')],
    box: (o, s) => ({ x: s.x, y: s.y, w: 124, h: 60, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 120, 56, { isStatic: true, isSensor: true });
    },
    activate(e, sim) { e.end = sim.t + Math.max(0, +e.o.seconds || 0); },
    busy: (e) => e.active && !e.done,
    update(e, sim) {
      if (!e.active || e.done || sim.t < e.end - 1e-9) return;
      e.done = true;
      e.doneAt = sim.t;
      sim.emit(e.o.x, e.o.y - 30, 'flash', 12, { speed: 3 });
      fireLinks(e, sim);
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0;
      let txt = 'T-' + fmtTime(o.seconds), col = '#f87171';
      if (e && e.done) { txt = o.go || '0'; col = Math.floor((t - e.doneAt) * 4) % 2 ? '#fde047' : '#4ade80'; }
      else if (e && e.active) txt = 'T-' + fmtTime(e.end - t);
      ctx.save();
      ctx.translate(s.x, s.y);
      U.rr(ctx, -60, -28, 120, 56, 8);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = light(o.color, 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
      U.rr(ctx, -52, -20, 104, 40, 4);
      ctx.fillStyle = '#05070a';
      ctx.fill();
      const size = txt.length > 6 ? Math.max(12, Math.floor(150 / txt.length)) : 26;
      ctx.font = `bold ${size}px ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fillStyle = col;
      ctx.fillText(txt, 0, 1);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- text block
  // Solid letters: the text is drawn into a small grid, and every filled run of cells
  // becomes a rectangle of one static compound body, so things bounce off the letter shapes.
  const textFont = (o) => `${o.bold ? 700 : 400} ${o.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const shapeCache = new Map();
  function textShape(o) {
    const text = String(o.text ?? ''), size = Math.max(8, +o.size || 80);
    const key = `${text}\u0000${size}\u0000${o.bold ? 1 : 0}`;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = textFont({ size, bold: o.bold });
    const w = Math.max(1, Math.ceil(g.measureText(text).width)), h = Math.ceil(size * 1.25);
    const cell = Math.max(3, Math.round(size / 14));
    c.width = w; c.height = h;
    g.font = textFont({ size, bold: o.bold });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(text, w / 2, h / 2);
    const px = g.getImageData(0, 0, w, h).data, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    const filled = (cx, cy) => {
      const x = Math.min(w - 1, Math.floor(cx * cell + cell / 2)), y = Math.min(h - 1, Math.floor(cy * cell + cell / 2));
      return px[(y * w + x) * 4 + 3] > 110;
    };
    // horizontal runs per row, then merge identical runs in consecutive rows
    const rects = [], open = new Map();
    for (let r = 0; r <= rows; r++) {
      const runs = new Set();
      if (r < rows) {
        let c0 = -1;
        for (let cc = 0; cc <= cols; cc++) {
          const f = cc < cols && filled(cc, r);
          if (f && c0 < 0) c0 = cc;
          if (!f && c0 >= 0) { runs.add(c0 + ':' + cc); c0 = -1; }
        }
      }
      for (const [k, rc] of open) if (!runs.has(k)) { rects.push(rc); open.delete(k); }
      for (const k of runs) {
        if (open.has(k)) open.get(k).r1 = r + 1;
        else { const [a, b] = k.split(':').map(Number); open.set(k, { c0: a, c1: b, r0: r, r1: r + 1 }); }
      }
    }
    const shape = {
      w, h, cell,
      // rectangles relative to the text centre
      rects: rects.map((q) => ({ x: q.c0 * cell - w / 2, y: q.r0 * cell - h / 2, w: (q.c1 - q.c0) * cell, h: (q.r1 - q.r0) * cell })),
    };
    if (shapeCache.size > 200) shapeCache.clear();
    shapeCache.set(key, shape);
    return shape;
  }
  CR.textShape = textShape; // shared with the arched birthday text
  CR.textFont = textFont;
  CR.defineType('text', {
    label: 'Text block',
    category: 'Basics',
    description: 'Solid letters: marbles and anything else bounce off (and through) the actual letter shapes. Tilt it with the rotate handle.',
    iconSize: { w: 60, h: 40 },
    noScale: true, // sized by its font size
    defaults: () => ({ text: 'BOING', size: 90, bold: true, angle: 0, bounce: 0.4, friction: 0.2, color: '#2563eb' }),
    props: [PX('Centre X'), PY('Centre Y'), { key: 'text', label: 'Text', type: 'text', maxLength: 60 }, num('size', 'Letter size', 2, 8, 300),
      { key: 'bold', label: 'Bold', type: 'checkbox' }, PANGLE, num('bounce', 'Bounciness', 0.05, 0, 1.2),
      num('friction', 'Friction', 0.05, 0, 1), PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: (o) => textShape(o).h / 2 + 22 },
    box(o) { const sh = textShape(o); return { x: o.x, y: o.y, w: sh.w, h: sh.h, angle: (o.angle || 0) * D2R }; },
    hit(o, s, x, y, pad) {
      const a = -(o.angle || 0) * D2R, c = Math.cos(a), sn = Math.sin(a), dx = x - o.x, dy = y - o.y;
      const lx = dx * c - dy * sn, ly = dx * sn + dy * c, p = pad + 4;
      return textShape(o).rects.some((r) => lx >= r.x - p && lx <= r.x + r.w + p && ly >= r.y - p && ly <= r.y + r.h + p);
    },
    build(e) {
      const o = e.o, { Bodies, Body } = M(), rs = textShape(o).rects;
      if (!rs.length) return;
      const opt = { isStatic: true, friction: o.friction, restitution: o.bounce };
      const parts = rs.map((r) => Bodies.rectangle(o.x + r.x + r.w / 2, o.y + r.y + r.h / 2, r.w, r.h));
      e.body = parts.length === 1 ? Bodies.rectangle(parts[0].position.x, parts[0].position.y, rs[0].w, rs[0].h, opt) : Body.create(Object.assign({ parts }, opt));
      if (o.angle) Body.rotate(e.body, o.angle * D2R, { x: o.x, y: o.y });
    },
    draw(ctx, o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate((o.angle || 0) * D2R);
      ctx.font = textFont(o);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, o.size / 30);
      ctx.strokeStyle = dark(o.color, -0.5);
      ctx.strokeText(String(o.text ?? ''), 0, 0);
      ctx.fillStyle = o.color;
      ctx.fillText(String(o.text ?? ''), 0, 0);
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 2, text: 'Aa', size: 34 })); },
  });

  // ---------------------------------------------------------------- spaceship
  // Flies its path carrying one other object ("Carries") hidden inside. When it reaches the end of
  // its path -- or after "Drop after" seconds -- it lets the cargo out: anything that walks or
  // flies a path is lowered in a tractor beam to the start of its own path and then sets off;
  // anything else simply drops out of the hatch. Then, optionally, the ship flies away.
  const SHIP_W = 120, SHIP_H = 44;
  CR.linkKeys = CR.linkKeys.concat('cargo'); // copied along with groups, drawn as a dashed link
  function shipCargo(e, sim) { return e.o.cargo ? sim.entById(e.o.cargo) : null; }
  function releaseCargo(c, sim) {
    c.hidden = false;
    if (c.body) c.body.isSensor = c.wasSensor;
    if (c.o.trigger === 'start') { c.triggered = true; c.activateAt = sim.t + (Number(c.o.delay) || 0); }
    else { c.triggered = false; c.activateAt = Infinity; } // back to its own trigger
  }
  CR.defineType('spaceship', {
    label: 'Spaceship',
    category: 'Vehicles',
    description: 'Flies its path carrying another object hidden inside, then lets it out: walkers and flyers (like the alien) are lowered in a tractor beam to the start of their own path; anything else drops out. Then it can fly away.',
    path: true,
    pathMin: 2,
    showPath: true,
    kinematic: true,
    flies: true,
    pathColor: 'rgba(124,58,237,0.75)',
    iconSize: { w: SHIP_W, h: SHIP_H + 20 },
    defaults: () => ({
      points: [{ x: 0, y: 0 }, { x: -300, y: 40 }], speed: 200, cargo: '', dropAfter: 0, leave: true, solid: false,
      trigger: 'start', delay: 0, color: '#cbd5e1', beam: '#86efac',
    }),
    props: [PX(), PY(), num('speed', 'Speed (px/s)', 10, 0),
      { key: 'cargo', label: 'Carries', type: 'objref', hint: 'the object inside it (e.g. an alien)' },
      num('dropAfter', 'Drop after (s)', 0.5, 0, undefined, '0 = when it reaches the end of its path'),
      { key: 'leave', label: 'Fly away afterwards', type: 'checkbox' },
      { key: 'solid', label: 'Solid body', type: 'checkbox', hint: 'knocks things over as it flies' },
      PTRIG, PDELAY, PCOLOR('Hull'), PCOLOR('Beam', 'beam')],
    box: (o, s) => ({ x: s.x, y: s.y - 6, w: SHIP_W + 8, h: SHIP_H + 20, angle: 0 }),
    build(e, sim) {
      const { Bodies, Body } = M(), p = e.o.points[0];
      e.body = Bodies.rectangle(p.x, p.y, SHIP_W, SHIP_H * 0.6, { isSensor: !e.o.solid, density: 0.02, frictionAir: 0 });
      Body.setInertia(e.body, Infinity);
      sim.initPathActor(e);
    },
    init(e, sim) { // take the cargo on board before anything moves
      const c = shipCargo(e, sim);
      if (!c || c === e || c.carrier) return;
      c.carrier = e;
      e.cargoEnt = c;
      c.hidden = true;
      c.triggered = true; // keeps its own trigger from starting it while it's inside
      c.activateAt = Infinity;
      if (c.body) { c.wasSensor = c.body.isSensor; c.body.isSensor = true; }
    },
    activate(e, sim) { e.startedAt = sim.t; },
    // busy until it has let its cargo out and (if it leaves) flown off
    busy: (e) => e.active && !e.gone && !(e.beamDone != null && !e.o.leave),
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M(), c = shipCargo(e, sim);
      e.blink = (e.blink || 0) + 1;
      if (e.leaving) { // up and away
        Body.setVelocity(b, { x: e.facing * 2, y: -Math.max(3, o.speed / 60) });
        sim.float(b);
        if (b.position.y < -200) e.gone = true;
        return;
      }
      sim.followPath(e);
      const carrying = c && c.carrier === e && c.hidden;
      if (carrying && !(c.T.path && c.body) && c.body) { // loose cargo rides inside the ship
        Body.setPosition(c.body, { x: b.position.x, y: b.position.y });
        Body.setVelocity(c.body, { x: 0, y: 0 });
        sim.float(c.body);
      }
      if (e.active && e.dropped == null) {
        const due = o.dropAfter > 0 ? sim.t >= e.startedAt + o.dropAfter : e.done;
        if (due) {
          e.dropped = sim.t;
          const hatch = { x: b.position.x, y: b.position.y + SHIP_H / 2 };
          if (carrying && c.T.path && c.body) { // tractor beam down to where its path starts
            const to = { x: c.restX, y: c.restY };
            e.beam = { from: hatch, to, at: sim.t, dur: Math.max(0.6, Math.hypot(to.x - hatch.x, to.y - hatch.y) / 220) };
          } else {
            if (carrying && c.body) {
              Body.setPosition(c.body, { x: hatch.x, y: hatch.y + 20 });
              Body.setVelocity(c.body, { x: 0, y: 2 });
              releaseCargo(c, sim);
            }
            e.beamDone = sim.t;
          }
        }
      }
      if (e.beam && sim.t >= e.beam.at + e.beam.dur) {
        if (c && c.hidden) releaseCargo(c, sim);
        e.beam = null;
        e.beamDone = sim.t;
        sim.emit(c ? c.restX : b.position.x, c ? c.restY + 20 : b.position.y, 'dust', 10, { speed: 1.5, dir: -Math.PI / 2, spread: Math.PI });
      }
      if (o.leave && e.beamDone != null && sim.t >= e.beamDone + 0.8) e.leaving = true;
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0;
      if (e && e.beam) { // tractor beam, with the cargo floating down inside it
        const bm = e.beam, u = Math.min(1, (t - bm.at) / bm.dur), hx = s.x, hy = s.y + SHIP_H / 2;
        const g = ctx.createLinearGradient(0, hy, 0, bm.to.y + 30);
        g.addColorStop(0, o.beam + 'cc');
        g.addColorStop(1, o.beam + '22');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(hx - 14, hy);
        ctx.lineTo(hx + 14, hy);
        ctx.lineTo(bm.to.x + 40, bm.to.y + 30);
        ctx.lineTo(bm.to.x - 40, bm.to.y + 30);
        ctx.closePath();
        ctx.fill();
        const c = e.cargoEnt;
        if (c) {
          const x = hx + (bm.to.x - hx) * u, y = hy + 20 + (bm.to.y - hy - 20) * u;
          ctx.save();
          ctx.globalAlpha = 0.6 + 0.4 * u;
          c.T.draw(ctx, c.o, { x, y, angle: 0, facing: c.facing || 1, e: null, t });
          ctx.restore();
        }
      }
      const { ell, poly, line } = CR.pack, w = SHIP_W, h = SHIP_H;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.facing || 1, 1);
      // engine glow at the back
      if (e && e.active && !e.done || (e && e.leaving)) U.glow(ctx, -w / 2 - 4, 2, 16, 'rgba(147,197,253,0.95)', 'rgba(59,130,246,0)');
      poly(ctx, [[-w / 2 + 8, -2], [-w / 2 - 6, -16], [-w / 2 + 20, -6]], dark(o.color, -0.25));
      poly(ctx, [[-w / 2 + 8, 6], [-w / 2 - 6, 18], [-w / 2 + 22, 8]], dark(o.color, -0.25));
      // hull
      ctx.beginPath();
      ctx.moveTo(-w / 2, 4);
      ctx.quadraticCurveTo(-w * 0.1, -h * 0.42, w / 2, 0);
      ctx.quadraticCurveTo(w * 0.1, h * 0.42, -w / 2, 4);
      ctx.closePath();
      const hg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      hg.addColorStop(0, light(o.color, 0.5));
      hg.addColorStop(1, dark(o.color, -0.35));
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ell(ctx, w * 0.1, -h * 0.18, w * 0.17, h * 0.26, 'rgba(125,211,252,0.85)');
      ell(ctx, w * 0.06, -h * 0.26, w * 0.06, h * 0.06, 'rgba(255,255,255,0.7)');
      for (let i = 0; i < 4; i++) { // running lights
        const on = e ? Math.floor(e.blink / 10 + i) % 4 === 0 : i === 0;
        ell(ctx, -w * 0.3 + i * w * 0.14, h * 0.12, 3, 3, on ? '#fde047' : dark('#fde047', -0.45));
      }
      line(ctx, [[-w * 0.05, h * 0.2], [-w * 0.1, h * 0.42]], dark(o.color, -0.4), 2);
      line(ctx, [[w * 0.2, h * 0.16], [w * 0.25, h * 0.4]], dark(o.color, -0.4), 2);
      if (e && e.beam) ell(ctx, 0, h * 0.22, 14, 4, o.beam);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- escalator
  // A fixed sloping belt (like a ramp: drag its end handles). While it runs, anything resting on
  // it is carried along at the belt speed -- up (or down) -- and flies off the far end.
  const BELT_T = 16;
  CR.defineType('escalator', {
    label: 'Escalator',
    category: 'Machines',
    description: 'A moving stair belt. Anything resting on it is carried up (or down) and drops off the end. Tilt it with the rotate handle; drag the square end handles to change its length.',
    iconScale: 0.18,
    defaults: () => ({ w: 360, angle: -30, speed: 150, dir: 1, trigger: 'start', delay: 0, color: '#64748b' }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 40, 4000), num('speed', 'Speed (px/s)', 10, 0, 2000),
      { key: 'dir', label: 'Moves', type: 'select', num: true, options: [[1, 'Up the slope (towards the high end)'], [-1, 'Down the slope']] },
      { ...PTRIG, label: 'Runs' }, PDELAY, PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: () => 46 },
    handles: (o) => CR.types.ramp.handles(o),
    dragHandle: (...a) => CR.types.ramp.dragHandle(...a),
    box: (o, s) => ({ x: s.x, y: s.y + 6, w: o.w, h: BELT_T + 40, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, BELT_T, { isStatic: true, angle: o.angle * D2R, friction: 0.9 });
    },
    activate(e, sim) { e.runAt = sim.t; },
    update(e, sim) {
      if (!e.active) return;
      const o = e.o, { Body, Composite } = M(), a = o.angle * D2R;
      let d = { x: Math.cos(a), y: Math.sin(a) };
      if (d.y > 0) d = { x: -d.x, y: -d.y }; // d points up the slope
      if (o.dir < 0) d = { x: -d.x, y: -d.y };
      const n = { x: Math.sin(a), y: -Math.cos(a) }; // surface normal
      if (n.y > 0) { n.x = -n.x; n.y = -n.y; } // ...pointing up, out of the belt
      const v = Math.max(0, +o.speed || 0) / 60;
      for (const b of Composite.allBodies(sim.world)) {
        if (b.isStatic || b.isSensor) continue;
        const t = sim.entOf(b);
        if (t && t.T.kinematic) continue; // path followers steer themselves
        const rx = b.position.x - o.x, ry = b.position.y - o.y;
        const along = rx * Math.cos(a) + ry * Math.sin(a), out = rx * n.x + ry * n.y;
        const reach = Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2 + BELT_T / 2 + 6;
        if (Math.abs(along) > o.w / 2 || out < 0 || out > reach) continue;
        const vn = b.velocity.x * n.x + b.velocity.y * n.y;
        Body.setVelocity(b, { x: d.x * v + n.x * Math.min(vn, 1), y: d.y * v + n.y * Math.min(vn, 1) });
        Body.setAngularVelocity(b, b.angularVelocity * 0.8);
      }
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, w = o.w, a = (o.angle || 0) * D2R;
      const run = e && e.active ? (t - e.runAt) * (+o.speed || 0) : 0;
      // which local x direction is "up the slope" (for the step motion)
      const upLocal = Math.sin(a) <= 0 ? 1 : -1, shift = ((run * upLocal * (o.dir < 0 ? -1 : 1)) % 22 + 22) % 22;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      // truss under the belt
      ctx.fillStyle = dark(o.color, -0.15);
      ctx.beginPath();
      ctx.moveTo(-w / 2, BELT_T / 2); ctx.lineTo(w / 2, BELT_T / 2); ctx.lineTo(w / 2 - 14, BELT_T / 2 + 22); ctx.lineTo(-w / 2 + 14, BELT_T / 2 + 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = light(o.color, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -w / 2 + 14; x < w / 2 - 14; x += 26) { ctx.moveTo(x, BELT_T / 2); ctx.lineTo(x + 13, BELT_T / 2 + 22); ctx.lineTo(x + 26, BELT_T / 2); }
      ctx.stroke();
      // belt and moving step edges
      U.rr(ctx, -w / 2, -BELT_T / 2, w, BELT_T, 4);
      ctx.fillStyle = '#374151';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      for (let x = -w / 2 - 22 + shift; x < w / 2 + 22; x += 22) { ctx.beginPath(); ctx.moveTo(x, -BELT_T / 2); ctx.lineTo(x - 6, BELT_T / 2); ctx.stroke(); }
      ctx.restore();
      // handrail
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -w / 2 + 10; x <= w / 2 - 10; x += Math.max(30, (w - 20) / 8)) { ctx.moveTo(x, -BELT_T / 2); ctx.lineTo(x, -BELT_T / 2 - 26); }
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-w / 2 + 4, -BELT_T / 2 - 26); ctx.lineTo(w / 2 - 4, -BELT_T / 2 - 26); ctx.stroke();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- elevator
  // A platform in a shaft. (x, y) is where the platform rests at the bottom; it rises `rise`
  // pixels. Each trip: wait at the bottom, go up, drop the load off on the exit side, come back
  // down (and repeat if "Keep going"). It drops off either by a pusher arm sweeping across the
  // platform (onto a ledge level with the top) or by tipping, lifting the far side and pivoting
  // on the exit edge (onto a lower ledge, or just off). The platform and pusher are heavy bodies
  // driven to their positions every step, so the load is carried along.
  const LIFT_T = 12, PUSH_W = 8, PUSH_H = 34, GATE_W = 5, GATE_H = 12;
  const gateX = (o) => o.x + (o.exit < 0 ? -1 : 1) * (o.w / 2 - GATE_W / 2);
  /*
   * People and animals that walk a path ride the elevator: standing on the platform while it
   * moves, they're held still and carried (their path moves with them, so at the top they carry
   * on at the new height). The pusher shoves them off like any load, and anyone standing in the
   * shaft as the platform comes down is pushed out of the way.
   */
  function carryWalkers(e, sim, y0) {
    const o = e.o, sd = o.exit < 0 ? -1 : 1, dy = e.y - y0, moving = dy !== 0 && e.ang === 0;
    const top = y0 - LIFT_T / 2, bottomNew = e.y + LIFT_T / 2;
    const held = new Set();
    for (const t of sim.ents) {
      if (t === e || !t.body || !t.T.kinematic || !t.T.path || t.T.flies || t.hidden || t.o.wander === 'free') continue;
      const bb = t.body.bounds, hw = (bb.max.x - bb.min.x) / 2, cx = t.body.position.x;
      const carry = { x: 0, y: 0 };
      // on board: over the platform with their feet on it (or just below it, as they step on)
      if (e.ang === 0 && bb.max.y > top - 10 && bb.max.y < top + 30 && Math.abs(cx - o.x) < o.w / 2 + 2) {
        if (moving) { carry.y = e.y - LIFT_T / 2 - bb.max.y; held.add(t); } // ride (feet on the platform)
        if (e.pusher && e.phase === 'push') { // the pusher shoves them off
          const lead = pusherX(o, e.pu) + (sd * PUSH_W) / 2, back = cx - sd * hw, gap = sd * (lead - back);
          if (gap > 0) { carry.x = sd * gap; held.add(t); }
        }
      } else if (e.phase === 'down' && bb.min.y < bottomNew + 1 && bb.max.y > bottomNew && Math.abs(cx - o.x) < o.w / 2 + hw) {
        // standing in the shaft as it comes down: push them out of the way
        const dir = Math.sign(cx - o.x) || -sd, need = o.w / 2 + hw + 2 - Math.abs(cx - o.x);
        carry.x = dir * Math.min(6, need);
        held.add(t);
      }
      if (!carry.x && !carry.y) continue;
      t.holdAt = { x: cx + carry.x, y: t.body.position.y + carry.y };
      t.offX = (t.offX || 0) + carry.x;
      t.offY = (t.offY || 0) + carry.y;
    }
    for (const t of e.riders || []) if (!held.has(t)) { t.paused = false; t.holdAt = null; }
    for (const t of held) t.paused = true;
    e.riders = held;
  }
  // pusher x for travel u: from the far side of the platform to just past its exit edge
  function pusherX(o, u) {
    const sd = o.exit < 0 ? -1 : 1, far = o.x - sd * (o.w / 2 - PUSH_W / 2), out = o.x + sd * (o.w / 2 + PUSH_W / 2 + 4);
    return far + (out - far) * u;
  }
  // platform centre for height y and tip angle a; it pivots on the top corner of its exit edge
  function liftCentre(o, y, a) {
    const sd = o.exit < 0 ? -1 : 1, px = o.x + (sd * o.w) / 2, py = y - LIFT_T / 2;
    const lx = (-sd * o.w) / 2, ly = LIFT_T / 2; // centre, seen from the pivot
    return { x: px + lx * Math.cos(a) - ly * Math.sin(a), y: py + lx * Math.sin(a) + ly * Math.cos(a) };
  }
  CR.defineType('elevator', {
    label: 'Elevator',
    category: 'Machines',
    description: 'A lift: its platform waits at the bottom, rises, drops whatever it carries off on the exit side — pushing it across onto a ledge level with the top, or tipping it off — and comes back down. People and animals on it ride along and walk off at the top; anyone underneath is pushed out of the way. Drag the round handle to set how high it goes.',
    iconSize: { w: 110, h: 200 },
    noScale: true, // has its own width and height
    defaults: () => ({ w: 100, rise: 320, speed: 120, wait: 1.5, unload: 'push', tilt: 35, exit: 1, loop: true, trigger: 'start', delay: 0, color: '#475569' }),
    props: [PX('Centre X'), PY('Bottom Y'), num('rise', 'Height', 5, 20, 5000), num('w', 'Platform width', 1, 20, 1000),
      num('speed', 'Speed (px/s)', 10, 5, 2000), num('wait', 'Wait at the bottom (s)', 0.1, 0, 120),
      { key: 'unload', label: 'Drops off by', type: 'select', options: [['push', 'Pushing it across'], ['tip', 'Tipping']],
        hint: 'pushing: put a ledge level with the top; tipping: a lower ledge, or none' },
      num('tilt', 'Tip angle (°)', 1, 0, 80, 'when tipping'),
      { key: 'exit', label: 'Drops off to the', type: 'select', num: true, options: [[1, 'Right →'], [-1, '← Left']] },
      { key: 'loop', label: 'Keep going', type: 'checkbox', hint: 'go up and down again and again' },
      { ...PTRIG, label: 'Starts' }, PDELAY, PCOLOR()],
    handles: (o) => [{ id: 'top', round: true, x: o.x, y: o.y - o.rise }],
    dragHandle(o, orig, id, p, snap) { o.rise = Math.max(20, snap(orig.y - p.y)); },
    box: (o) => ({ x: o.x, y: o.y - o.rise / 2 - 10, w: o.w + 24, h: o.rise + 40, angle: 0 }),
    build(e, sim) {
      const o = e.o, { Bodies, Body, Composite } = M(), group = sim.nextGroup(); // platform and pusher don't collide
      const mask = 0xffffffff & ~(CR.CAT_WALKER | CR.CAT_GROUND); // walkers ride by carryWalkers; it can sit flush with the floor
      e.body = Bodies.rectangle(o.x, o.y, o.w, LIFT_T, { density: 1, friction: 0.25, frictionStatic: 0.5, frictionAir: 0, collisionFilter: { group, mask } });
      Body.setInertia(e.body, Infinity);
      if (o.unload !== 'tip') {
        e.pusher = Bodies.rectangle(pusherX(o, 0), o.y - LIFT_T / 2 - PUSH_H / 2 - 0.5, PUSH_W, PUSH_H, { density: 1, friction: 0.1, frictionAir: 0, collisionFilter: { group, mask } });
        Body.setInertia(e.pusher, Infinity);
        Composite.add(sim.world, e.pusher);
      }
      // a little gate on the exit edge keeps the load on board; it drops while unloading
      e.gate = Bodies.rectangle(gateX(o), o.y - LIFT_T / 2 - GATE_H / 2 - 0.5, GATE_W, GATE_H, { density: 1, frictionAir: 0, collisionFilter: { group, mask } });
      Body.setInertia(e.gate, Infinity);
      Composite.add(sim.world, e.gate);
      e.y = o.y;
      e.ang = 0;
      e.pu = 0; // pusher travel, 0 = far side, 1 = past the exit edge
      e.phase = 'idle';
    },
    activate(e, sim) { e.phase = 'load'; e.until = sim.t + Math.max(0, e.o.wait); },
    busy: (e) => e.active && e.phase !== 'done',
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M(), v = Math.max(5, o.speed) / 60, top = o.y - o.rise;
      const tiltMax = (o.tilt || 0) * D2R * (o.exit < 0 ? -1 : 1), tiltStep = 0.03;
      const y0 = e.y, a0 = e.ang;
      if (e.active) {
        switch (e.phase) {
          case 'load': if (sim.t >= e.until) e.phase = 'up'; break;
          case 'up': e.y = Math.max(top, e.y - v); if (e.y <= top) e.phase = e.pusher ? 'push' : 'tip'; break;
          case 'push': e.pu = Math.min(1, e.pu + 1 / 54); if (e.pu >= 1) e.phase = 'retract'; break;
          case 'retract': e.pu = Math.max(0, e.pu - 1 / 30); if (e.pu <= 0) e.phase = 'down'; break;
          case 'tip':
            e.ang += Math.sign(tiltMax - e.ang) * Math.min(tiltStep, Math.abs(tiltMax - e.ang));
            if (Math.abs(e.ang - tiltMax) < 1e-6) { e.phase = 'hold'; e.until = sim.t + 1; }
            break;
          case 'hold': if (sim.t >= e.until) e.phase = 'level'; break;
          case 'level':
            e.ang -= Math.sign(e.ang) * Math.min(tiltStep, Math.abs(e.ang));
            if (Math.abs(e.ang) < 1e-6) { e.ang = 0; e.phase = 'down'; }
            break;
          case 'down':
            e.y = Math.min(o.y, e.y + v);
            if (e.y >= o.y) { e.phase = o.loop ? 'load' : 'done'; e.until = sim.t + Math.max(0, o.wait); }
            break;
        }
      }
      carryWalkers(e, sim, y0);
      // slippery while tipped, so the load slides off (crGrip: see patchMatter in sim.js)
      b.crGrip = e.phase === 'tip' || e.phase === 'hold' ? 0 : null;
      // drive the platform: placed exactly, with the matching velocity so its load rides along
      const c0 = liftCentre(o, y0, a0), c1 = liftCentre(o, e.y, e.ang);
      Body.setAngle(b, a0);
      Body.setPosition(b, c0);
      Body.setVelocity(b, { x: c1.x - c0.x, y: c1.y - c0.y });
      Body.setAngularVelocity(b, e.ang - a0);
      sim.float(b);
      { // the gate rides on the exit edge (which stays put while tipping), open while unloading
        const g = e.gate, gy = (y) => y - LIFT_T / 2 - GATE_H / 2 - 0.5;
        e.gateOpen = ['push', 'retract', 'tip', 'hold', 'level'].includes(e.phase);
        g.isSensor = e.gateOpen;
        Body.setAngle(g, 0);
        Body.setPosition(g, { x: gateX(o), y: gy(y0) });
        Body.setVelocity(g, { x: 0, y: e.y - y0 });
        sim.float(g);
      }
      if (e.pusher) { // rides on the platform; sweeps across it at the top
        const q = e.pusher, yy = (y) => y - LIFT_T / 2 - PUSH_H / 2 - 0.5;
        const p0 = { x: pusherX(o, e.pu0 ?? 0), y: yy(y0) }, p1 = { x: pusherX(o, e.pu), y: yy(e.y) };
        Body.setAngle(q, 0);
        Body.setPosition(q, p0);
        Body.setVelocity(q, { x: p1.x - p0.x, y: p1.y - p0.y });
        sim.float(q);
        e.pu0 = e.pu;
      }
    },
    draw(ctx, o, s) {
      const e = s.e, w = o.w, top = o.y - o.rise;
      const px = e ? s.x : o.x, py = e ? s.y : o.y, ang = e ? s.angle : 0;
      ctx.save();
      // shaft: two rails, a head frame with a pulley, and the cable down to the platform
      ctx.strokeStyle = dark(o.color, -0.2);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(o.x - w / 2 - 8, o.y + 20); ctx.lineTo(o.x - w / 2 - 8, top - 40);
      ctx.moveTo(o.x + w / 2 + 8, o.y + 20); ctx.lineTo(o.x + w / 2 + 8, top - 40);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = light(o.color, 0.3);
      ctx.beginPath();
      for (let y = o.y + 10; y > top - 40; y -= 30) {
        ctx.moveTo(o.x - w / 2 - 8, y); ctx.lineTo(o.x - w / 2 - 2, y - 15);
        ctx.moveTo(o.x + w / 2 + 8, y); ctx.lineTo(o.x + w / 2 + 2, y - 15);
      }
      ctx.stroke();
      ctx.fillStyle = dark(o.color, -0.3);
      ctx.fillRect(o.x - w / 2 - 14, top - 48, w + 28, 9);
      ctx.beginPath(); ctx.arc(o.x, top - 34, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(o.x, top - 34); ctx.lineTo(px, py - LIFT_T / 2); ctx.stroke();
      // platform
      ctx.translate(px, py);
      ctx.rotate(ang);
      U.rr(ctx, -w / 2, -LIFT_T / 2, w, LIFT_T, 3);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(-w / 2 + 3, -LIFT_T / 2 + 2); ctx.lineTo(w / 2 - 3, -LIFT_T / 2 + 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (!(e && e.gateOpen)) { // exit gate (down while unloading)
        const gx = gateX(o), gy = e && e.gate ? e.gate.position.y : o.y - LIFT_T / 2 - GATE_H / 2;
        ctx.fillStyle = '#facc15';
        ctx.fillRect(gx - GATE_W / 2, gy - GATE_H / 2, GATE_W, GATE_H);
      }
      if (o.unload !== 'tip') { // pusher arm
        const q = e && e.pusher ? e.pusher.position : { x: pusherX(o, 0), y: o.y - LIFT_T / 2 - PUSH_H / 2 };
        U.rr(ctx, q.x - PUSH_W / 2, q.y - PUSH_H / 2, PUSH_W, PUSH_H, 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = dark('#f59e0b', -0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (!e && !s.icon) { // where it drops things off
        ctx.save();
        ctx.fillStyle = 'rgba(124,58,237,0.7)';
        const ax = o.x + (o.exit < 0 ? -1 : 1) * (w / 2 + 22);
        ctx.beginPath();
        ctx.moveTo(ax, top - 8); ctx.lineTo(ax - 10 * (o.exit < 0 ? -1 : 1), top - 16); ctx.lineTo(ax - 10 * (o.exit < 0 ? -1 : 1), top);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 70, rise: 120, w: 60 }), { x: 0, y: 70, e: null, icon: true }); },
  });

  // ---------------------------------------------------------------- seesaw
  // A plank on a pivot at (x, y), on a stand. "Tips when triggered": it rests at its starting tilt
  // and, once set off (by default when something pushes its low end, e.g. a rising balloon), swings
  // over to "Tips over to" -- steeper than things can grip -- so whatever sat on the high end slides
  // off. "Freely": an ordinary seesaw that tilts with the weight on it, up to its maximum tilt.
  CR.defineType('seesaw', {
    label: 'Seesaw',
    category: 'Machines',
    description: 'A plank on a pivot. It can rest tilted and tip over when triggered — say, by a balloon rising into its low end — dropping whatever sits on its high end. Or set it to move freely.',
    iconSize: { w: 260, h: 90 },
    noScale: true, // has its own length
    defaults: () => ({ w: 260, angle: 18, tipTo: -40, mode: 'tip', speed: 2, tilt: 25, stand: 100, trigger: 'low', delay: 0, color: '#d97706' }),
    props: [PX('Pivot X'), PY('Pivot Y'), num('w', 'Length', 1, 40, 1500),
      num('angle', 'Starts tilted (°)', 1, -60, 60, 'positive = right end down'),
      { key: 'mode', label: 'Moves', type: 'select', options: [['tip', 'Tips over when triggered'], ['free', 'Freely (by weight)']] },
      num('tipTo', 'Tips over to (°)', 1, -80, 80, 'steeper than about 35° drops what is on it'),
      num('speed', 'Tip speed (°/frame)', 0.5, 0.2, 30, 'when it tips over'), num('tilt', 'Most tilt (°)', 1, 1, 80, 'when it moves freely'),
      num('stand', 'Stand height', 1, 0, 400),
      { key: 'trigger', label: 'Tips', type: 'select', options: [['low', 'When its low end is pushed'], ['touch', 'When anything touches it'], ['start', 'At start'], ['none', 'Never']] },
      PDELAY, PCOLOR()],
    rot: { offset: 0, dist: (o) => o.w / 2 + 16 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: 16, angle: s.angle }),
    build(e, sim) {
      const o = e.o, { Bodies, Body, Constraint, Composite } = M();
      e.ang = o.angle * D2R;
      if (o.mode === 'free') {
        e.body = Bodies.rectangle(o.x, o.y, o.w, 10, { angle: e.ang, density: 0.004, friction: 0.8, frictionAir: 0.01 });
        Composite.add(sim.world, Constraint.create({ pointA: { x: o.x, y: o.y }, bodyB: e.body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1 }));
      } else {
        e.body = Bodies.rectangle(o.x, o.y, o.w, 10, { angle: e.ang, density: 0.05, friction: 0.8, frictionAir: 0 });
        M().Body.setInertia(e.body, Infinity);
      }
    },
    substeps: true,
    busy: (e) => e.o.mode !== 'free' && e.active && Math.abs(e.ang - e.o.tipTo * D2R) > 1e-3,
    onHit(e, other, sim) { // "low end pushed": something touching the half that's tilted down
      if (e.o.trigger !== 'low' || other.isStatic || e.triggered) return;
      const a = e.body.angle, along = (other.position.x - e.o.x) * Math.cos(a) + (other.position.y - e.o.y) * Math.sin(a);
      if (along * Math.sign(e.o.angle || 1) > 0) sim.arm(e);
    },
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M();
      if (o.mode !== 'free') { sim.float(b); return; }
      const max = (o.tilt || 25) * D2R; // free: stop at the most tilt
      if (Math.abs(b.angle) > max) {
        Body.setAngle(b, Math.sign(b.angle) * max);
        Body.setAngularVelocity(b, 0);
      }
    },
    // tipping: drive the plank to the opposite tilt in small slices (velocities are per 1/60 s, hence * n)
    substep(e, sim, n) {
      const o = e.o, b = e.body, { Body } = M();
      if (o.mode === 'free') return;
      const target = (e.active ? o.tipTo : o.angle) * D2R, max = ((o.speed || 2) * D2R) / n;
      const da = Math.max(-max, Math.min(max, target - e.ang));
      Body.setAngle(b, e.ang);
      Body.setPosition(b, { x: o.x, y: o.y });
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setAngularVelocity(b, da * n);
      e.ang += da;
    },
    draw(ctx, o, s) {
      const w = o.w;
      ctx.save();
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 20, s.y + o.stand); ctx.lineTo(s.x + 20, s.y + o.stand);
      ctx.closePath();
      ctx.fill();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      U.rr(ctx, -w / 2, -5, w, 10, 3);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.45);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = dark(o.color, -0.25);
      for (const x of [-w / 2 + 14, w / 2 - 22]) ctx.fillRect(x, -12, 8, 7); // seat handles
      ctx.restore();
      ctx.fillStyle = '#d6d3d1';
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 0, w: 240, stand: 40 }), { x: 0, y: -10, angle: 18 * D2R, e: null }); },
  });
})();
