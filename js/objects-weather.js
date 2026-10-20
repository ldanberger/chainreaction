/*
 * Object pack: weather -- light and dark clouds, sun, rain, umbrella, rainbow, pot of gold and
 * lightning (with thunder).
 *
 * Rain and lightning can follow a cloud (pick it in "Follow cloud"), so they move with it.
 * Rain puts out rings of fire, matches, cake candles and burning objects underneath it.
 * Lightning strikes the first thing below it, lights or sets it off, and flashes the sky.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const U = CR.draw, D2R = CR.D2R;
  const { PX, PY, PANGLE, PCOLOR, PDELAY, num } = CR.P;
  const rotPt = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  const M = () => window.Matter;
  const TAU = Math.PI * 2;
  const dark = (c, a = -0.35) => U.shade(c, a);
  const light = (c, a = 0.4) => U.shade(c, a);
  const PCLOUD = { key: 'cloud', label: 'Follow cloud', type: 'objref', hint: 'moves with that cloud (optional)' };
  CR.linkKeys = CR.linkKeys.concat('cloud'); // copied along with groups, drawn as a dashed link
  const startSel = (label, extra = []) => ({
    key: 'trigger', label, type: 'select',
    options: [['start', 'At start (after the delay)'], ['touch', 'When touched or triggered'], ...extra, ['none', 'Never']],
  });

  // where a weather effect hangs from: its cloud's underside if it follows one, else its own (x, y)
  function source(e, sim) {
    const c = e.o.cloud && sim.entById(e.o.cloud);
    if (c && c.body) return { x: c.body.position.x, y: c.body.position.y + (c.o.w || 200) * 0.12 * (c.k || 1), w: (c.o.w || 200) * (c.k || 1) };
    return { x: e.o.x, y: e.o.y, w: null };
  }

  // ---------------------------------------------------------------- thunder (Web Audio, no files)
  let audio = null;
  function thunder(delay) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const len = 3, sr = audio.sampleRate, buf = audio.createBuffer(1, sr * len, sr), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { // brown noise: a deep rumble
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
      const src = audio.createBufferSource(), lp = audio.createBiquadFilter(), g = audio.createGain();
      src.buffer = buf;
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const t0 = audio.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(lp).connect(g).connect(audio.destination);
      src.start(t0);
    } catch (err) { /* no audio available */ }
  }

  // ---------------------------------------------------------------- clouds
  function drawCloud(ctx, w, base, shade) {
    const puffs = [[-0.32, 0.02, 0.2], [-0.12, -0.12, 0.26], [0.14, -0.08, 0.24], [0.33, 0.04, 0.17], [0, 0.06, 0.24]];
    const g = ctx.createLinearGradient(0, -w * 0.35, 0, w * 0.2);
    g.addColorStop(0, light(base, 0.15));
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.beginPath();
    for (const [x, y, r] of puffs) { ctx.moveTo(x * w + r * w, y * w); ctx.arc(x * w, y * w, r * w, 0, TAU); }
    ctx.fill();
  }
  function cloudType(name, d) {
    CR.defineType(name, {
      label: d.label,
      category: 'Weather',
      description: d.desc,
      iconSize: { w: 200, h: 110 },
      defaults: () => ({ w: 220, drift: d.drift, distance: 0, trigger: 'start', delay: 0, color: d.color }),
      props: [PX(), PY(), num('w', 'Width', 1, 30, 3000), num('drift', 'Drift (px/s)', 5, undefined, undefined, 'negative = to the left, 0 = stays put'),
        num('distance', 'Drift distance (px)', 10, 0, undefined, '0 = forever (wraps around the layer)'),
        startSel('Starts drifting'), PDELAY, PCOLOR()],
      box: (o, s) => ({ x: s.x, y: s.y - o.w * 0.04, w: o.w, h: o.w * 0.5, angle: 0 }),
      build(e) {
        const o = e.o;
        e.body = M().Bodies.rectangle(o.x, o.y, o.w * 0.9, o.w * 0.35, { isStatic: true, isSensor: true });
        e.moved = 0;
      },
      busy: (e) => e.active && !e.done && e.o.distance > 0 && e.o.drift !== 0,
      update(e, sim) {
        const o = e.o, b = e.body;
        if (!e.active || e.done || !o.drift) return;
        const dx = o.drift / 60;
        let x = b.position.x + dx;
        e.moved += Math.abs(dx);
        if (o.distance > 0 && e.moved >= o.distance) e.done = true;
        if (!(o.distance > 0)) { // wrap around the layer
          const hw = (o.w * e.k) / 2;
          if (x - hw > sim.W.width) x = -hw;
          if (x + hw < 0) x = sim.W.width + hw;
        }
        M().Body.setPosition(b, { x, y: b.position.y });
      },
      draw(ctx, o, s) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.globalAlpha = d.alpha;
        drawCloud(ctx, o.w, o.color, d.shade(o.color));
        ctx.restore();
      },
    });
  }
  cloudType('cloud', {
    label: 'Light cloud', desc: 'A fluffy white cloud that drifts across the sky (and can drift away).',
    color: '#ffffff', drift: 20, alpha: 0.95, shade: (c) => dark(c, -0.12),
  });
  cloudType('snowcloud', {
    label: 'Snow cloud', desc: 'A pale, heavy winter cloud. Hang snow from it with the snow’s "Follow cloud" setting.',
    color: '#e2e8f0', drift: 25, alpha: 1, shade: (c) => dark(c, -0.22),
  });
  cloudType('darkcloud', {
    label: 'Dark cloud', desc: 'A heavy storm cloud. Hang rain and lightning from it with their "Follow cloud" setting.',
    color: '#475569', drift: 40, alpha: 1, shade: (c) => dark(c, -0.45),
  });

  // ---------------------------------------------------------------- sun
  CR.defineType('sun', {
    label: 'Sun',
    category: 'Weather',
    description: 'A shining sun. It can fade away (behind the clouds), darkening the sky as it goes: everything drawn before it (use To back) darkens too, everything after it stays bright.',
    iconSize: { w: 150, h: 150 },
    noScale: true, // has its own radius
    defaults: () => ({ r: 50, trigger: 'none', delay: 0, fade: 3, dim: 0.55, color: '#facc15' }),
    props: [PX(), PY(), num('r', 'Radius', 1, 5, 1000), startSel('Fades away'), PDELAY, num('fade', 'Fade time (s)', 0.5, 0.1, 120),
      num('dim', 'Darken the sky', 0.05, 0, 1, '0 = no change, 1 = night'), PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 3, h: o.r * 3, angle: 0 }),
    build(e) { e.body = M().Bodies.circle(e.o.x, e.o.y, e.o.r, { isStatic: true, isSensor: true }); },
    activate(e, sim) { e.fadeAt = sim.t; },
    busy: (e, sim) => e.active && sim.t - e.fadeAt < e.o.fade,
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, k = e && e.active ? Math.min(1, (t - e.fadeAt) / Math.max(0.1, o.fade)) : 0;
      const W = CR.world;
      if (k > 0 && o.dim > 0 && W) { // the sky darkens
        ctx.fillStyle = `rgba(15,23,42,${o.dim * k})`;
        ctx.fillRect(0, 0, W.width, W.height);
      }
      if (k >= 1) return;
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = 1 - k;
      U.glow(ctx, 0, 0, r * 2.2, 'rgba(253,224,71,0.45)', 'rgba(253,224,71,0)');
      ctx.rotate(t * 0.3);
      ctx.strokeStyle = o.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, r * 0.09);
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12, r0 = r * 1.18, r1 = r * (i % 2 ? 1.45 : 1.6);
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, light(o.color, 0.6));
      g.addColorStop(1, dark(o.color, -0.08));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- rain
  /** For columns 6px wide across [x0, x0 + w]: the y where rain falling from y0 first hits something solid. */
  function coverMap(sim, x0, w, y0) {
    const { Composite, Query } = M();
    const solids = Composite.allBodies(sim.world).filter((b) => !b.isSensor && b.bounds.max.y > y0);
    const cols = Math.max(1, Math.ceil(w / 6)), cw = w / cols, ys = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * cw;
      let best = sim.W.height + 40;
      for (const b of solids) {
        const bd = b.bounds;
        if (x < bd.min.x || x > bd.max.x || bd.min.y >= best) continue;
        for (let y = Math.max(y0, bd.min.y), y1 = Math.min(bd.max.y, best); y <= y1; y += 3) {
          if (Query.point([b], { x, y }).length) { best = y; break; }
        }
      }
      ys[c] = best;
    }
    return { x0, cw, ys };
  }
  CR.defineType('rain', {
    label: 'Rain',
    category: 'Weather',
    description: 'Rain falling from (x, y), or from a cloud it follows. Drops stop at the first solid thing they hit (a ramp, an umbrella, ...), and they put out any ring of fire, match, candle or burning object they reach.',
    iconSize: { w: 120, h: 90 },
    noScale: true, // has its own width
    defaults: () => ({ w: 200, heavy: 1, trigger: 'start', delay: 0, duration: 0, cloud: '', wind: 0 }),
    props: [PX(), PY(), num('w', 'Width', 5, 10, 4000, 'ignored when it follows a cloud'), num('heavy', 'Heaviness', 0.1, 0.1, 5),
      num('wind', 'Wind', 0.5, -10, 10, 'slant: negative = to the left'), PCLOUD, startSel('Starts'), PDELAY,
      num('duration', 'Lasts (s)', 0.5, 0, undefined, '0 = forever')],
    box: (o, s) => ({ x: s.x, y: s.y + 40, w: o.w, h: 90, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 10, 10, { isStatic: true, isSensor: true }); },
    activate(e, sim) { e.until = e.o.duration > 0 ? sim.t + e.o.duration : Infinity; },
    busy: (e, sim) => e.active && !e.done && e.until !== Infinity,
    update(e, sim) {
      if (!e.active || e.done) return;
      if (sim.t >= e.until) { e.done = true; return; }
      const o = e.o, src = source(e, sim), w = (src.w || o.w) * (src.w ? 0.85 : 1), x0 = src.x - w / 2;
      // where the drops stop in each column: the first solid thing below (ramp, umbrella, floor, ...)
      if (!e.cover || sim.frame % 4 === 0 || Math.abs(e.cover.x0 - x0) > 1) e.cover = coverMap(sim, x0, w, src.y);
      const stopAt = (x) => e.cover.ys[Math.max(0, Math.min(e.cover.ys.length - 1, Math.floor((x - x0) / e.cover.cw)))];
      const n = Math.max(1, Math.round((w / 40) * o.heavy)), vx = +o.wind || 0;
      for (let i = 0; i < n && sim.particles.length < 1900; i++) {
        const vy = 9 + Math.random() * 3, y = src.y + Math.random() * 8, x = x0 + Math.random() * w;
        let stop = stopAt(x);
        if (vx) stop = Math.min(stop, stopAt(x + (vx * (stop - y)) / vy)); // slanted: check where it lands too
        const life = Math.round((stop - y) / vy);
        if (life < 1) continue;
        sim.particles.push({ x, y, kind: 'rain', life, max: life, vx, vy, size: 1, col: null });
      }
      if (sim.frame % 10) return;
      // rain puts out fires it actually reaches (not ones sheltered under something)
      const wet = (x, top) => x >= x0 && x <= x0 + w && top >= src.y && stopAt(x) >= top - 3;
      for (const t of sim.ents) {
        if (!t.active || t.done || !FIRES.includes(t.o.type)) continue;
        const p = t.body ? t.body.position : t.o, top = t.body ? t.body.bounds.min.y : p.y;
        if (!wet(p.x, top)) continue;
        t.done = true;
        sim.emit(p.x, p.y - 10, 'smoke', 10, { speed: 0.8, vy: -0.8 });
      }
      for (const b of sim.burning.keys()) if (wet(b.position.x, b.bounds.min.y)) sim.burning.delete(b);
    },
    draw(ctx, o, s) {
      if (s.e) return; // while running, the drops are particles
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = 'rgba(59,130,246,0.6)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const n = Math.max(3, Math.round(o.w / 22));
      for (let i = 0; i < n; i++) {
        const x = -o.w / 2 + ((i + 0.5) * o.w) / n, y = ((i * 37) % 60) + 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (+o.wind || 0) * 1.6, y + 16); ctx.stroke();
      }
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(59,130,246,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-o.w / 2, 0, o.w, 84);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- snow
  // Flakes drift down and stop at the first solid thing below (like rain). With "Settles" on,
  // snow builds up where they land -- in 4px columns, up to Max depth -- except near a lit fire,
  // which also melts any snow close to it. The drifts are for looks; they don't push anything.
  const FIRES = ['firering', 'match', 'cake', 'campfire', 'torch'];
  CR.fireTypes = FIRES;
  const SNOW_COL = 4, MELT_R = 110;
  function heatSources(sim) {
    const out = [];
    for (const t of sim.ents) {
      if (!t.active || t.done || !FIRES.includes(t.o.type)) continue;
      const p = t.T.flameAt ? t.T.flameAt(t) : t.body ? t.body.position : t.o;
      out.push(p);
    }
    for (const b of sim.burning.keys()) out.push(b.position);
    return out;
  }
  const nearHeat = (hs, x, y) => hs.some((h) => Math.abs(h.x - x) < MELT_R && y > h.y - MELT_R * 0.6 && y < h.y + MELT_R);
  CR.defineType('snow', {
    label: 'Snow',
    category: 'Weather',
    description: 'Snow falling from (x, y), or from a cloud it follows. Flakes stop at the first solid thing they reach and (with Settles) pile up there — but not near a lit fire, which melts the snow around it.',
    iconSize: { w: 120, h: 90 },
    noScale: true, // has its own width
    defaults: () => ({ w: 260, heavy: 1, wind: 0.5, cloud: '', trigger: 'start', delay: 0, duration: 0, settle: true, depth: 26 }),
    props: [PX(), PY(), num('w', 'Width', 5, 10, 4000, 'ignored when it follows a cloud'), num('heavy', 'Heaviness', 0.1, 0.1, 5),
      num('wind', 'Wind', 0.25, -5, 5, 'drift: negative = to the left'), PCLOUD, startSel('Starts'), PDELAY,
      num('duration', 'Lasts (s)', 0.5, 0, undefined, '0 = forever'),
      { key: 'settle', label: 'Settles', type: 'checkbox', hint: 'builds up where it lands' }, num('depth', 'Max depth (px)', 1, 1, 300)],
    box: (o, s) => ({ x: s.x, y: s.y + 40, w: o.w, h: 90, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 10, 10, { isStatic: true, isSensor: true });
      e.landing = []; // flakes on their way down: { x, at (frame) }
      e.drift = new Map(); // column -> { y: surface it lies on, d: depth }
      e.acc = 0;
    },
    activate(e, sim) { e.until = e.o.duration > 0 ? sim.t + e.o.duration : Infinity; },
    busy: (e, sim) => e.active && (sim.t < e.until || e.landing.length > 0),
    update(e, sim) {
      const o = e.o;
      if (e.active && sim.t < e.until) {
        const src = source(e, sim), w = (src.w || o.w) * (src.w ? 0.85 : 1), x0 = src.x - w / 2;
        if (!e.cover || sim.frame % 6 === 0 || Math.abs(e.cover.x0 - x0) > 1) e.cover = coverMap(sim, x0, w, src.y);
        const stopAt = (x) => e.cover.ys[Math.max(0, Math.min(e.cover.ys.length - 1, Math.floor((x - x0) / e.cover.cw)))];
        e.acc += (w / 70) * o.heavy * 0.35;
        for (; e.acc >= 1 && sim.particles.length < 1900; e.acc--) {
          const x = x0 + Math.random() * w, y = src.y + Math.random() * 6, vy = 1.1 + Math.random() * 0.9, vx = (+o.wind || 0) * 0.4;
          const col = e.drift.get(Math.floor(x / SNOW_COL));
          const stop = stopAt(x) - (col ? col.d : 0), life = Math.round((stop - y) / vy);
          if (life < 1) continue;
          sim.particles.push({ x, y, kind: 'snow', life, max: life, vx, vy, size: 1.6 + Math.random() * 1.6, col: null });
          if (o.settle) e.landing.push({ x: x + vx * life, at: sim.frame + life, ys: stopAt(x) });
        }
      }
      if (!e.landing.length && !e.drift.size) return;
      const hs = heatSources(sim), keep = [];
      for (const f of e.landing) {
        if (f.at > sim.frame) { keep.push(f); continue; }
        if (nearHeat(hs, f.x, f.ys)) continue; // melts on landing
        const k = Math.floor(f.x / SNOW_COL), c = e.drift.get(k);
        if (!c || Math.abs(c.y - f.ys) > 6) e.drift.set(k, { y: f.ys, d: 0.6 });
        else c.d = Math.min(o.depth, c.d + 0.6);
      }
      e.landing = keep;
      if (sim.frame % 10 === 0 && hs.length) { // fires melt snow around them
        for (const [k, c] of e.drift) {
          if (!nearHeat(hs, k * SNOW_COL, c.y)) continue;
          c.d -= 1.5;
          if (c.d <= 0) e.drift.delete(k);
        }
      }
    },
    draw(ctx, o, s) {
      const e = s.e;
      if (e) { // the drifts
        if (!e.drift.size) return;
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = 'rgba(148,163,184,0.6)';
        ctx.lineWidth = 1;
        for (const [k, c] of e.drift) {
          const x = k * SNOW_COL, d = c.d;
          ctx.fillRect(x - 0.3, c.y - d, SNOW_COL + 0.6, d + 1);
        }
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      const n = Math.max(4, Math.round(o.w / 18));
      for (let i = 0; i < n; i++) {
        const x = -o.w / 2 + ((i + 0.5) * o.w) / n, y = ((i * 37) % 64) + 8;
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
      }
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(100,116,139,0.45)';
      ctx.strokeRect(-o.w / 2, 0, o.w, 84);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- umbrella
  // (x, y) is the tip of the canopy. Canopy: an arc of radius w/2 centred 0.55·R below the rim
  // line; handle: from the tip down `h`. The physics body is the canopy segments plus the shaft.
  const CANOPY_A0 = -160 * D2R, CANOPY_A1 = -20 * D2R, CANOPY_SEGS = 7;
  function umbrellaParts(o) {
    const R = o.w / 2, cy = 0.55 * R, out = [];
    const segL = ((CANOPY_A1 - CANOPY_A0) * R) / CANOPY_SEGS;
    for (let i = 0; i < CANOPY_SEGS; i++) {
      const a = CANOPY_A0 + ((i + 0.5) * (CANOPY_A1 - CANOPY_A0)) / CANOPY_SEGS;
      out.push({ x: Math.cos(a) * R, y: cy + Math.sin(a) * R, w: segL * 1.12, h: 6, a: a + Math.PI / 2 });
    }
    const top = cy - R;
    out.push({ x: 0, y: (top + o.h) / 2, w: 5, h: o.h - top, a: 0 });
    return out;
  }
  // canopy tip and angle, in the editor or following the body while running
  function umbrellaAnchor(o, s) {
    if (s.e && s.e.off) { const r = rotPt(s.e.off.x, s.e.off.y, s.angle); return { x: s.x - r.x, y: s.y - r.y, a: s.angle }; }
    return { x: o.x, y: o.y, a: (o.angle || 0) * D2R };
  }
  CR.defineType('umbrella', {
    label: 'Umbrella',
    category: 'Weather',
    description: 'Keeps the rain off whatever is underneath, so fires under it stay lit. Fixed in place, or untick Fixed to let it fall and tumble.',
    iconSize: { w: 130, h: 160 },
    noScale: true, // has its own width and handle length
    defaults: () => ({ w: 130, h: 110, angle: 0, fixed: true, color: '#ef4444', stripe: '#ffffff' }),
    props: [PX('Tip X'), PY('Tip Y'), PANGLE, num('w', 'Width', 1, 20, 1500), num('h', 'Handle length', 1, 10, 1500),
      { key: 'fixed', label: 'Fixed in place', type: 'checkbox' }, PCOLOR('Canopy'), PCOLOR('Stripes', 'stripe')],
    rot: { offset: -Math.PI / 2, dist: (o) => o.w * 0.25 + 26 },
    box(o, s) {
      const A = umbrellaAnchor(o, s), R = o.w / 2, top = 0.55 * R - R - 3, bottom = o.h + 12;
      const c = rotPt(0, (top + bottom) / 2, A.a);
      return { x: A.x + c.x, y: A.y + c.y, w: o.w * 0.97, h: bottom - top, angle: A.a };
    },
    build(e) {
      const o = e.o, { Bodies, Body } = M();
      const parts = umbrellaParts(o).map((p) => Bodies.rectangle(o.x + p.x, o.y + p.y, p.w, p.h, { angle: p.a }));
      e.body = Body.create({ parts, isStatic: !!o.fixed, friction: 0.3, density: 0.002 });
      e.off = { x: e.body.position.x - o.x, y: e.body.position.y - o.y };
      if (o.angle) Body.rotate(e.body, o.angle * D2R, { x: o.x, y: o.y });
    },
    draw(ctx, o, s) {
      const A = umbrellaAnchor(o, s), R = o.w / 2, cy = 0.55 * R;
      ctx.save();
      ctx.translate(A.x, A.y);
      ctx.rotate(A.a);
      ctx.lineCap = 'round';
      // shaft and hooked handle
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, cy - R); ctx.lineTo(0, o.h); ctx.stroke();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(-8, o.h, 8, 0, Math.PI); ctx.stroke();
      // canopy: panels between the curved top and the scalloped rim, in alternating colours
      const rimY = cy + Math.sin(CANOPY_A0) * R, rimX = Math.cos(CANOPY_A0) * R; // rim runs from -|rimX| to |rimX|
      for (let i = 0; i < 6; i++) {
        const a0 = CANOPY_A0 + (i * (CANOPY_A1 - CANOPY_A0)) / 6, a1 = CANOPY_A0 + ((i + 1) * (CANOPY_A1 - CANOPY_A0)) / 6;
        const x0 = rimX + (i * -2 * rimX) / 6, x1 = rimX + ((i + 1) * -2 * rimX) / 6;
        ctx.beginPath();
        ctx.moveTo(x0, rimY);
        ctx.arc(0, cy, R, a0, a1);
        ctx.lineTo(x1, rimY);
        ctx.quadraticCurveTo((x0 + x1) / 2, rimY + R * 0.1, x0, rimY);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? o.stripe : o.color;
        ctx.fill();
        ctx.strokeStyle = dark(o.color, -0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, cy, R, CANOPY_A0, CANOPY_A1);
      ctx.strokeStyle = dark(o.color, -0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#4b5563';
      ctx.beginPath(); ctx.arc(0, cy - R - 3, 3, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- rainbow
  // An arch standing on (x, y). "Appears": always there, or fading in after its delay / when
  // triggered (e.g. once the rain stops). Solid rainbows are a bridge things can roll along.
  const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#4f46e5', '#a855f7'];
  const setSensor = (b, on) => { b.isSensor = on; for (const p of b.parts) p.isSensor = on; };
  CR.defineType('rainbow', {
    label: 'Rainbow',
    category: 'Weather',
    description: 'A rainbow arch standing on (x, y). It can fade in after a delay or when triggered — after the rain, say. Tick Solid to let things roll along it like a bridge.',
    iconSize: { w: 200, h: 110 },
    noScale: true, // has its own radius and band width
    defaults: () => ({ r: 300, band: 12, trigger: 'always', delay: 0, fade: 2, opacity: 0.85, solid: false }),
    props: [PX('Centre X'), PY('Ground Y'), num('r', 'Radius', 5, 20, 5000), num('band', 'Band width', 1, 2, 200),
      { key: 'trigger', label: 'Appears', type: 'select', options: [['always', 'Always there'], ['start', 'After the delay'], ['touch', 'When triggered']] },
      PDELAY, num('fade', 'Fade in (s)', 0.5, 0, 60), num('opacity', 'Opacity', 0.05, 0.05, 1),
      { key: 'solid', label: 'Solid', type: 'checkbox', hint: 'things can roll along the top of it' }],
    box: (o) => ({ x: o.x, y: o.y - o.r / 2, w: o.r * 2, h: o.r, angle: 0 }),
    hit(o, s, x, y, pad) {
      const d = Math.hypot(x - o.x, y - o.y);
      return y <= o.y + pad && d >= o.r - RAINBOW.length * o.band - pad && d <= o.r + pad;
    },
    build(e) {
      const o = e.o, { Bodies, Body } = M();
      if (!o.solid) { e.body = Bodies.rectangle(o.x, o.y, 10, 10, { isStatic: true, isSensor: true }); return; }
      const th = RAINBOW.length * o.band, R = o.r - th / 2, n = Math.max(6, Math.ceil((Math.PI * R) / 24)), parts = [];
      for (let i = 0; i < n; i++) {
        const a = Math.PI + ((i + 0.5) * Math.PI) / n;
        parts.push(Bodies.rectangle(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R, ((Math.PI * R) / n) * 1.15, th, { angle: a + Math.PI / 2 }));
      }
      e.body = Body.create({ parts, isStatic: true, friction: 0.05 });
      setSensor(e.body, o.trigger !== 'always'); // solid once it's there
    },
    activate(e, sim) {
      e.shownAt = sim.t;
      if (e.o.solid && e.o.trigger !== 'always') setSensor(e.body, false);
    },
    busy: (e, sim) => e.active && sim.t - e.shownAt < e.o.fade,
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0;
      let vis = 1;
      if (e && o.trigger !== 'always') vis = e.active ? Math.min(1, (t - e.shownAt) / Math.max(0.01, o.fade)) : 0;
      if (vis <= 0) return;
      ctx.save();
      ctx.globalAlpha = o.opacity * vis;
      ctx.lineWidth = o.band + 0.6;
      RAINBOW.forEach((col, i) => {
        const r = o.r - (i + 0.5) * o.band;
        if (r <= 0) return;
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, Math.PI, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 14, r: 34, band: 4, opacity: 1 }), { e: null }); },
  });

  // ---------------------------------------------------------------- pot of gold
  CR.defineType('potofgold', {
    label: 'Pot of gold',
    category: 'Weather',
    description: 'The treasure at the end of the rainbow. It sparkles, and when touched or triggered it bursts into a shower of gold coins and can set off another object.',
    iconSize: { w: 80, h: 70 },
    defaults: () => ({ trigger: 'touch', delay: 0, coins: 60, link: '', color: '#1f2937', gold: '#facc15' }),
    props: [PX(), PY(),
      { key: 'trigger', label: 'Bursts', type: 'select', options: [['touch', 'When touched or triggered'], ['start', 'At start (after the delay)'], ['none', 'Never']] },
      PDELAY, num('coins', 'Coins', 5, 0, 400),
      { key: 'link', label: 'When it bursts, trigger', type: 'objref', hint: 'set the target\'s Trigger to "When touched"' },
      PCOLOR('Pot'), PCOLOR('Gold', 'gold')],
    box: (o, s) => ({ x: s.x, y: s.y - 8, w: 72, h: 62, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 60, 40, { isStatic: true, friction: 0.5 }); },
    activate(e, sim) {
      const o = e.o, top = { x: o.x, y: o.y - 22 * e.k };
      e.burstAt = sim.t;
      sim.emit(top.x, top.y, 'coin', Math.round(o.coins), { dir: -Math.PI / 2, spread: 1.5, speed: 7 });
      sim.emit(top.x, top.y, 'flash', 12, { speed: 3 });
      sim.link(e);
    },
    busy: (e, sim) => e.burstAt != null && sim.t - e.burstAt < 1.5,
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, burst = e && e.burstAt != null;
      const { ell, line } = CR.pack;
      ctx.save();
      ctx.translate(s.x, s.y);
      line(ctx, [[-18, 14], [-22, 22]], o.color, 4);
      line(ctx, [[18, 14], [22, 22]], o.color, 4);
      // heap of gold (smaller once it has burst)
      const heap = burst ? 0.35 : 1;
      for (let i = 0; i < 14 * heap; i++) {
        const x = ((i * 37) % 44) - 22, y = -20 - ((i * 13) % 12) * heap;
        ell(ctx, x, y, 6, 3, i % 3 ? o.gold : dark(o.gold, -0.15));
      }
      ell(ctx, 0, -20 - 6 * heap, 22, 8 * heap + 2, o.gold);
      // pot
      ctx.beginPath();
      ctx.moveTo(-26, -16);
      ctx.bezierCurveTo(-36, 22, 36, 22, 26, -16);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      U.rr(ctx, -29, -20, 58, 8, 4);
      ctx.fillStyle = light(o.color, 0.15);
      ctx.fill();
      ell(ctx, -12, -2, 5, 9, 'rgba(255,255,255,0.12)', 0.3);
      // sparkles
      for (let i = 0; i < 4; i++) {
        const ph = (t * 1.6 + i * 0.27) % 1, k = Math.sin(ph * Math.PI);
        if (k < 0.2) continue;
        const x = ((i * 23) % 40) - 20, y = -30 - ((i * 17) % 18), r = 5 * k;
        ctx.fillStyle = `rgba(255,255,255,${k})`;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
        ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- lightning
  function strike(e, sim) {
    const o = e.o, { Composite, Query, Body } = M(), src = source(e, sim);
    const solids = Composite.allBodies(sim.world).filter((b) => !b.isSensor);
    const x = src.x + (e.rand() - 0.5) * (src.w ? src.w * 0.3 : 0);
    let y = src.y, hit = null;
    for (; y < sim.W.height + 50; y += 3) {
      const q = Query.point(solids, { x, y });
      if (q.length) { hit = q[0]; break; }
    }
    // jagged bolt, a little different every strike
    const pts = [{ x, y: src.y }], n = 12;
    for (let i = 1; i < n; i++) pts.push({ x: x + (e.rand() - 0.5) * 50 * (1 - i / n), y: src.y + ((y - src.y) * i) / n });
    pts.push({ x, y });
    e.bolt = { pts, at: sim.t };
    const target = hit && sim.entOf(hit);
    if (target) sim.touch(target, true);
    for (const t of sim.ents) { // anything right at the strike
      if (t === e || !t.body) continue;
      const bd = t.body.bounds;
      if (x >= bd.min.x - 30 && x <= bd.max.x + 30 && y >= bd.min.y - 30 && y <= bd.max.y + 30) sim.touch(t, true);
    }
    sim.igniteNear(x, y, 40, e);
    for (const b of Composite.allBodies(sim.world)) { // a small jolt
      if (b.isStatic) continue;
      const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 90) Body.setVelocity(b, { x: b.velocity.x + (dx / d) * 4 * (1 - d / 90), y: b.velocity.y - 3 * (1 - d / 90) });
    }
    sim.emit(x, y, 'flash', 16, { speed: 4 });
    sim.emit(x, y, 'spark', 24, { speed: 5 });
    if (o.thunder) thunder(0.15 + e.rand() * 0.3);
  }
  CR.defineType('lightning', {
    label: 'Lightning',
    category: 'Weather',
    description: 'Strikes straight down from (x, y), or from a cloud it follows: it lights or sets off the first thing it hits, flashes the sky and booms with thunder.',
    iconSize: { w: 60, h: 120 },
    noScale: true,
    defaults: () => ({ strikes: 1, interval: 1.5, trigger: 'start', delay: 2, cloud: '', thunder: true, color: '#fef08a' }),
    props: [PX(), PY(), num('strikes', 'Strikes', 1, 1, 100), num('interval', 'Time between strikes (s)', 0.1, 0.1, 60),
      PCLOUD, startSel('Starts'), PDELAY, { key: 'thunder', label: 'Thunder sound', type: 'checkbox' }, PCOLOR('Bolt')],
    box: (o, s) => ({ x: s.x, y: s.y + 30, w: 40, h: 80, angle: 0 }),
    build(e) {
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 10, 10, { isStatic: true, isSensor: true });
      e.rand = CR.rng(CR.hash(e.id));
    },
    activate(e, sim) { e.left = Math.max(1, Math.round(e.o.strikes)); e.next = sim.t; },
    busy: (e, sim) => e.active && (e.left > 0 || (e.bolt && sim.t - e.bolt.at < 0.6)),
    update(e, sim) {
      if (!e.active || !(e.left > 0) || sim.t < e.next - 1e-9) return;
      strike(e, sim);
      e.left--;
      e.next = sim.t + Math.max(0.1, e.o.interval);
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0;
      if (!e) { // editing: a little bolt with a dashed line showing it strikes downward
        ctx.save();
        ctx.translate(s.x, s.y);
        U.polyPath(ctx, [{ x: 4, y: 0 }, { x: -6, y: 22 }, { x: 4, y: 22 }, { x: -4, y: 46 }]);
        ctx.strokeStyle = dark(o.color, -0.5);
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(234,179,8,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(0, 120); ctx.stroke();
        ctx.restore();
        return;
      }
      if (!e.bolt) return;
      const age = t - e.bolt.at;
      if (age > 0.35) return;
      const W = CR.world;
      if (W && age < 0.2) { // sky flash
        ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - age / 0.2)})`;
        ctx.fillRect(0, 0, W.width, W.height);
      }
      const flick = age < 0.08 || (age > 0.14 && age < 0.22) ? 1 : 0.35;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      U.polyPath(ctx, e.bolt.pts);
      ctx.strokeStyle = `rgba(250,204,21,${0.35 * flick})`;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = o.color;
      ctx.globalAlpha = flick;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    },
    icon(g) { this.draw(g, this.defaults(), { x: 0, y: -24, e: null }); },
  });
})();
