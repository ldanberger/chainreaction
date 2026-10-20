/*
 * Object type registry.
 *
 * Each type is registered with CR.defineType(name, spec). A spec may provide:
 *   label, category, description   toolkit text
 *   defaults()                     default property values (path types return relative `points`)
 *   props[]                        property-panel schema {key,label,type,step,min,max,options,hint}
 *   path, pathMin, showPath        object is defined by a polyline of `points`
 *   ignitable                      fire / a fuse ending on it lights it regardless of "touch"
 *   rot {pivot(o), offset, dist(o)} rotate handle (edits o.angle)
 *   box(o, s)                      selection box {x,y,w,h,angle}
 *   hit(o, s, x, y, pad)           optional custom hit test
 *   build(e, sim)                  create the physics body (e.body) for a sim entity
 *   init(e, sim)                   once every object is built (e.g. to take hold of another one)
 *   activate(e, sim)               called once when the trigger fires (after delay)
 *   update(e, sim)                 called every step before physics
 *   post(e, sim)                   called every step after physics
 *   draw(ctx, o, s)                render; s = {x, y, angle, facing, e (sim entity or null), t}
 *
 * To add a new object, define it here (or in a new file loaded after this one).
 */
(function () {
  'use strict';
  const CR = (window.CR = window.CR || {});
  const D2R = Math.PI / 180;
  CR.D2R = D2R;
  CR.types = {};
  CR.typeOrder = [];
  CR.defineType = function (name, spec) {
    spec.type = name;
    CR.types[name] = spec;
    CR.typeOrder.push(name);
  };
  CR.floorTop = (W) => W.height - 20;
  // "Size" multiplier (o.scale) shared by every object except lines (fuse) and pieces that
  // resize with their own end/radius handles, which already set their exact dimensions.
  CR.scalable = (T) => !!T && !T.handles && !T.noScale;
  CR.sizeOf = (o) => (CR.scalable(CR.types[o.type]) && +o.scale > 0 ? +o.scale : 1);

  // ---------------------------------------------------------------- geometry
  const G = (CR.geom = {
    polyLength(pts) {
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return L;
    },
    pointAt(pts, d) {
      if (pts.length < 2) return { x: pts[0].x, y: pts[0].y };
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= L || i === pts.length - 1) {
          const t = L ? Math.min(1, Math.max(0, d / L)) : 0;
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        d -= L;
      }
      return { x: pts[0].x, y: pts[0].y };
    },
    distToSeg(px, py, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - a.x) * dx + (py - a.y) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + dx * t, y = a.y + dy * t;
      return { d: Math.hypot(px - x, py - y), x, y, t };
    },
    distToPoly(px, py, pts) {
      let best = { d: Infinity, seg: -1 };
      for (let i = 1; i < pts.length; i++) {
        const r = G.distToSeg(px, py, pts[i - 1], pts[i]);
        if (r.d < best.d) { best = r; best.seg = i; }
      }
      return best;
    },
    inBox(px, py, b, pad) {
      const c = Math.cos(-b.angle), s = Math.sin(-b.angle);
      const dx = px - b.x, dy = py - b.y;
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
    },
    bboxOf(pts, pad = 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2, angle: 0 };
    },
  });

  // ---------------------------------------------------------------- drawing helpers
  const U = (CR.draw = {
    rr(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    shade(hex, amt) {
      let c = String(hex || '#888').replace('#', '');
      if (c.length === 3) c = c.split('').map((x) => x + x).join('');
      const n = parseInt(c, 16) || 0;
      let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
      r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
      return `rgb(${r},${g},${b})`;
    },
    polyPath(ctx, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    },
    polyRange(pts, d0, d1) {
      const out = [];
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const s0 = acc, s1 = acc + L;
        if (L > 0 && s1 >= d0 && s0 <= d1) {
          const t0 = Math.max(0, (d0 - s0) / L), t1 = Math.min(1, (d1 - s0) / L);
          if (!out.length) out.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
          out.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
        }
        acc = s1;
      }
      return out;
    },
    glow(ctx, x, y, r, inner, outer) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
  });

  // Stick person, origin at body centre, 56px tall. pose: stand | run | jump | crouch
  function seg(ctx, x, y, a, len) {
    const x2 = x + Math.sin(a) * len, y2 = y + Math.cos(a) * len;
    ctx.lineTo(x2, y2);
    return { x: x2, y: y2 };
  }
  function limb(ctx, x, y, a1, a2, l1, l2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const k = seg(ctx, x, y, a1, l1);
    const end = seg(ctx, k.x, k.y, a2, l2);
    ctx.stroke();
    return end;
  }
  function drawPerson(ctx, x, y, shirt, skin, pose, phase, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing || 1, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pants = '#2b3a55', shoe = '#1d1d1d';
    let hipY = 4, lean = 0;
    let L = [[0.1, 0.1], [-0.1, -0.1]]; // legs [thigh, shin] back, front
    let A = [[0.2, 0.4], [-0.2, 0.1]]; // arms [upper, fore] back, front
    if (pose === 'run') {
      lean = 4;
      for (let i = 0; i < 2; i++) {
        const ph = phase + i * Math.PI;
        const s = Math.sin(ph), c = Math.cos(ph);
        const th = 0.75 * s;
        L[i] = [th, th - (0.2 + 0.9 * Math.max(0, c))];
        const up = -0.85 * s;
        A[i] = [up, up + 1.3];
      }
    } else if (pose === 'jump') {
      L = [[0.9, -0.3], [0.5, -0.6]];
      A = [[2.6, 2.8], [2.9, 3.0]];
    } else if (pose === 'crouch') {
      hipY = 9;
      L = [[1.1, -0.5], [0.9, -0.6]];
      A = [[-0.7, -0.2], [-0.5, 0]];
      lean = 3;
    }
    const sx = lean, sy = -13 + (hipY - 4);
    const backLeg = U.shade(pants, -0.3), backArm = U.shade(skin, -0.25);
    // back limbs
    let f = limb(ctx, 0, hipY, L[0][0], L[0][1], 12, 12, backLeg, 4.5);
    ctx.fillStyle = shoe; ctx.fillRect(f.x - 2, f.y - 1.5, 7, 3);
    limb(ctx, sx, sy + 1, A[0][0], A[0][1], 9, 9, backArm, 3.5);
    // torso
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(sx + 1, sy - 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.arc(sx + 0.5, sy - 11, 7, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(sx + 4, sy - 9.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
    // front limbs
    f = limb(ctx, 0, hipY, L[1][0], L[1][1], 12, 12, pants, 4.5);
    ctx.fillStyle = shoe; ctx.fillRect(f.x - 2, f.y - 1.5, 7, 3);
    limb(ctx, sx, sy + 1, A[1][0], A[1][1], 9, 9, skin, 3.5);
    ctx.restore();
  }
  CR.drawPerson = drawPerson;

  function wing(ctx, bx, by, flap, col) {
    const lift = Math.sin(flap);
    const ty = by - 6 - 36 * lift;
    ctx.beginPath();
    ctx.moveTo(bx - 12, by);
    ctx.lineTo(bx - 6, ty);
    ctx.lineTo(bx + 30, ty + 8 * lift + 4);
    ctx.quadraticCurveTo(bx + 18, (ty + by) / 2, bx + 14, by);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = U.shade(col, -0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - 6, ty);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 12, ty + 3 * lift + 2);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 30, ty + 8 * lift + 4);
    ctx.stroke();
  }
  function drawDragon(ctx, x, y, color, wingCol, facing, flap, breath) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing || 1, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dark = U.shade(color, -0.35), belly = U.shade(color, 0.5);
    // tail
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-22, 2);
    ctx.bezierCurveTo(-45, 20 + Math.sin(flap * 0.5) * 4, -62, -12, -80, -4);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-78, -4);
    ctx.lineTo(-93, -13);
    ctx.lineTo(-90, 4);
    ctx.closePath();
    ctx.fill();
    wing(ctx, -4, -8, flap + 0.5, U.shade(wingCol, -0.25));
    // legs
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 10); ctx.lineTo(-15, 21);
    ctx.moveTo(12, 10); ctx.lineTo(15, 21);
    ctx.stroke();
    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(4, 6, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // spikes
    ctx.fillStyle = dark;
    for (let i = -18; i <= 14; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i - 3, -13); ctx.lineTo(i, -20); ctx.lineTo(i + 3, -13);
      ctx.fill();
    }
    // neck & head
    ctx.strokeStyle = color;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.quadraticCurveTo(32, -8, 37, -18);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(42, -20, 12, 8.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(52, -17, 8, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(37, -26); ctx.lineTo(30, -36);
    ctx.moveTo(42, -27); ctx.lineTo(38, -38);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(43, -23, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(44, -23, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(46, -14); ctx.lineTo(59, -15 + (breath ? 3 : 0));
    ctx.stroke();
    if (breath > 0) U.glow(ctx, 60, -15, 14 * breath, 'rgba(255,220,120,0.9)', 'rgba(255,120,20,0)');
    wing(ctx, 2, -10, flap, wingCol);
    ctx.restore();
  }

  // ---------------------------------------------------------------- shared props
  const PX = (label = 'X') => ({ key: 'x', label, type: 'number', step: 1 });
  const PY = (label = 'Y') => ({ key: 'y', label, type: 'number', step: 1 });
  const PANGLE = { key: 'angle', label: 'Angle (°)', type: 'number', step: 1 };
  const PCOLOR = (label = 'Color', key = 'color') => ({ key, label, type: 'color' });
  const PTRIG = {
    key: 'trigger', label: 'Trigger', type: 'select',
    options: [['start', 'At start'], ['touch', 'When touched'], ['none', 'Never']],
  };
  const PDELAY = { key: 'delay', label: 'Delay (s)', type: 'number', step: 0.1, min: 0 };
  const PDIR = { key: 'direction', label: 'Direction', type: 'select', num: true, options: [[1, 'Right →'], [-1, '← Left']] };
  const num = (key, label, step, min, max, hint) => ({ key, label, type: 'number', step, min, max, hint });
  const PWANDER = {
    key: 'wander', label: 'Wander randomly', type: 'select',
    options: [['', 'Off (follow the path)'], ['ground', 'Along the ground'], ['free', 'Anywhere']],
    hint: 'roam from the first point, turning when it bumps into things',
  };
  // shared with object packs in other files (e.g. objects-more.js)
  CR.P = { PX, PY, PANGLE, PCOLOR, PTRIG, PDELAY, PDIR, PWANDER, num };

  const M = () => window.Matter;

  // ---------------------------------------------------------------- domino
  CR.defineType('domino', {
    label: 'Domino',
    category: 'Basics',
    description: 'A tall tile that topples into its neighbour.',
    iconScale: 0.55,
    defaults: () => ({ w: 12, h: 60, angle: 0, color: '#f5f0e1', density: 0.002, friction: 0.5 }),
    props: [PX(), PY(), PANGLE, num('w', 'Thickness', 1, 2, 120), num('h', 'Height', 1, 8, 400), PCOLOR(),
      num('density', 'Density', 0.0005, 0.0001), num('friction', 'Friction', 0.05, 0, 1)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, {
        angle: o.angle * D2R, density: o.density, friction: o.friction, frictionStatic: 0.8, restitution: 0.05,
      });
      e.body.crSlick = true;
    },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      const w = o.w, h = o.h, edge = U.shade(o.color, -0.6);
      U.rr(ctx, -w / 2, -h / 2, w, h, Math.min(3, w / 3));
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 2, 0);
      ctx.lineTo(w / 2 - 2, 0);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = edge;
      const pr = Math.max(1, Math.min(w * 0.18, 3));
      for (const py of [-h / 4, h / 4]) {
        ctx.beginPath();
        ctx.arc(0, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- marble
  CR.defineType('marble', {
    label: 'Marble',
    category: 'Basics',
    description: 'A heavy glass ball that rolls and bounces.',
    iconScale: 1.2,
    defaults: () => ({ r: 12, color: '#3b82f6', density: 0.004, restitution: 0.35, friction: 0.02, vx: 0, vy: 0 }),
    props: [PX(), PY(), num('r', 'Radius', 1, 2, 200), PCOLOR(), num('density', 'Density', 0.0005, 0.0001),
      num('restitution', 'Bounciness', 0.05, 0, 1), num('friction', 'Friction', 0.01, 0, 1),
      num('vx', 'Start velocity X', 0.5, undefined, undefined, 'pixels per frame'), num('vy', 'Start velocity Y', 0.5)],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 2, h: o.r * 2, angle: 0 }),
    build(e) {
      const o = e.o, { Bodies, Body } = M();
      e.body = Bodies.circle(o.x, o.y, o.r, {
        density: o.density, restitution: o.restitution, friction: o.friction, frictionAir: 0.0008, frictionStatic: 0.2,
      });
      if (o.vx || o.vy) Body.setVelocity(e.body, { x: +o.vx || 0, y: +o.vy || 0 });
    },
    draw(ctx, o, s) {
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, U.shade(o.color, 0.7));
      g.addColorStop(0.5, o.color);
      g.addColorStop(1, U.shade(o.color, -0.45));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(s.angle);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, -0.6, 1.4);
      ctx.stroke();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- shared handles
  // Square handles at both ends of a straight piece (ramp, trampoline): drag one to
  // stretch or shrink the piece while the opposite end stays put.
  function endHandles(o) {
    const a = o.angle * D2R, c = Math.cos(a), s = Math.sin(a), hw = o.w / 2;
    return [{ id: 'endA', x: o.x - c * hw, y: o.y - s * hw }, { id: 'endB', x: o.x + c * hw, y: o.y + s * hw }];
  }
  function dragEnd(o, orig, id, p, snap) {
    const a = orig.angle * D2R, c = Math.cos(a), s = Math.sin(a), side = id === 'endB' ? 1 : -1;
    const fx = orig.x - (side * c * orig.w) / 2, fy = orig.y - (side * s * orig.w) / 2; // the end that stays fixed
    const w = Math.max(20, snap(((p.x - fx) * c + (p.y - fy) * s) * side));
    o.w = w;
    o.x = Math.round(fx + (side * c * w) / 2);
    o.y = Math.round(fy + (side * s * w) / 2);
  }

  // ---------------------------------------------------------------- ramp
  CR.defineType('ramp', {
    label: 'Ramp',
    category: 'Basics',
    description: 'A fixed plank. Tilt it into a slope, or set the angle to 0 for a shelf. Drag the square end handles to change its length.',
    iconScale: 0.2,
    defaults: () => ({ w: 300, h: 14, angle: 15, color: '#a0703c', friction: 0.1 }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 10, 4000), num('h', 'Thickness', 1, 4, 200), PCOLOR(),
      num('friction', 'Friction', 0.05, 0, 1)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 24 },
    handles: endHandles,
    dragHandle: dragEnd,
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { isStatic: true, angle: o.angle * D2R, friction: o.friction });
    },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      const w = o.w, h = o.h;
      U.rr(ctx, -w / 2, -h / 2, w, h, 3);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = U.shade(o.color, -0.45);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = U.shade(o.color, -0.2);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const yy = -h / 2 + (h * (i + 1)) / 4;
        ctx.beginPath();
        ctx.moveTo(-w / 2, yy);
        for (let xx = -w / 2; xx <= w / 2; xx += 40) ctx.quadraticCurveTo(xx + 10, yy + (i % 2 ? 1.5 : -1.5), xx + 20, yy);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- cannon
  function cannonPivot(o) { return { x: o.x, y: o.y - 8 }; }
  function fuseHole(o, k = 1) {
    const a = o.angle * D2R, c = Math.cos(a), s = Math.sin(a), p = { x: o.x, y: o.y - 8 * k };
    return { x: p.x + (c * -14 - s * -10) * k, y: p.y + (s * -14 + c * -10) * k };
  }
  function fireCannon(e, sim) {
    const { Bodies, Body } = M();
    const o = e.o, k = e.k, a = o.angle * D2R, c = Math.cos(a), s = Math.sin(a), p = { x: o.x, y: o.y - 8 * k };
    const L = 50 * k + o.ballRadius;
    const ball = Bodies.circle(p.x + c * L, p.y + s * L, o.ballRadius, {
      density: 0.006, restitution: 0.25, friction: 0.05, frictionAir: 0.0005, collisionFilter: { group: e.group },
    });
    Body.setVelocity(ball, { x: c * o.power, y: s * o.power });
    sim.addExtra(ball, { kind: 'ball' });
    e.recoil = 1;
    const mx = p.x + c * 52 * k, my = p.y + s * 52 * k;
    sim.emit(mx, my, 'flash', 14, { dir: a, spread: 0.9, speed: 5 });
    sim.emit(mx, my, 'smoke', 16, { dir: a, spread: 1.1, speed: 2.2 });
  }
  CR.defineType('cannon', {
    label: 'Cannon',
    category: 'Launchers',
    description: 'Fires a cannonball when lit — by a fuse line ending on it, a bump, dragon fire, or at start.',
    iconScale: 0.5,
    ignitable: true,
    defaults: () => ({ angle: -35, power: 18, ballRadius: 11, shots: 1, interval: 1, trigger: 'touch', delay: 0.5, color: '#3d4451' }),
    props: [PX(), PY(), { key: 'angle', label: 'Barrel angle (°)', type: 'number', step: 1, hint: '0 = right, −90 = up, 180 = left' },
      num('power', 'Power', 0.5, 0), num('ballRadius', 'Ball radius', 1, 3, 60), num('shots', 'Shots', 1, 1, 50),
      num('interval', 'Shot interval (s)', 0.1, 0.05), PTRIG, { ...PDELAY, label: 'Fuse delay (s)' }, PCOLOR('Barrel')],
    rot: { pivot: cannonPivot, offset: 0, dist: () => 72 },
    box: (o, s) => ({ x: s.x + 6, y: s.y - 14, w: 104, h: 64, angle: 0 }),
    hit(o, s, x, y, pad) {
      if (G.inBox(x, y, { x: s.x, y: s.y, w: 60, h: 30, angle: 0 }, pad)) return true;
      const a = o.angle * D2R, p = cannonPivot({ x: s.x, y: s.y });
      return G.inBox(x, y, { x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, w: 70, h: 22, angle: a }, pad);
    },
    build(e, sim) {
      e.group = sim.nextGroup();
      e.body = M().Bodies.rectangle(e.o.x, e.o.y, 56, 26, { isStatic: true, collisionFilter: { group: e.group }, friction: 0.5 });
      e.recoil = 0;
    },
    activate(e, sim) {
      e.shotsLeft = Math.max(1, Math.round(e.o.shots));
      e.nextShot = sim.t;
    },
    busy: (e) => e.active && e.shotsLeft > 0,
    update(e, sim) {
      const o = e.o;
      e.recoil *= 0.85;
      if (e.triggered && !e.active) {
        const p = fuseHole(o, e.k);
        sim.emit(p.x, p.y, 'spark', 2, { speed: 1.8, vy: -0.5 });
      }
      if (e.active && e.shotsLeft > 0 && sim.t >= e.nextShot - 1e-9) {
        fireCannon(e, sim);
        e.shotsLeft--;
        e.nextShot = sim.t + Math.max(0.05, o.interval);
      }
    },
    draw(ctx, o, s) {
      const e = s.e;
      ctx.save();
      ctx.translate(s.x, s.y);
      // barrel
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(o.angle * D2R);
      ctx.translate(-(e ? e.recoil : 0) * 9, 0);
      const g = ctx.createLinearGradient(0, -10, 0, 10);
      g.addColorStop(0, U.shade(o.color, 0.35));
      g.addColorStop(0.45, o.color);
      g.addColorStop(1, U.shade(o.color, -0.5));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-20, -11);
      ctx.lineTo(44, -7.5);
      ctx.lineTo(44, 7.5);
      ctx.lineTo(-20, 11);
      ctx.arc(-20, 0, 11, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      U.rr(ctx, 41, -9.5, 9, 19, 2);
      ctx.fill();
      ctx.fillStyle = U.shade(o.color, -0.3);
      ctx.beginPath();
      ctx.arc(-31, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(4, -9, 3, 18);
      // wick
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -9);
      ctx.quadraticCurveTo(-16, -14, -12, -17);
      ctx.stroke();
      ctx.restore();
      // carriage
      ctx.fillStyle = '#7a5230';
      ctx.strokeStyle = '#4a3018';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-28, 13);
      ctx.lineTo(28, 13);
      ctx.lineTo(16, -6);
      ctx.lineTo(-14, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // wheel
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath();
      ctx.arc(0, 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2e1c0c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(0, 2);
        ctx.lineTo(Math.cos(a) * 10, 2 + Math.sin(a) * 10);
      }
      ctx.stroke();
      ctx.fillStyle = '#c9a26b';
      ctx.beginPath();
      ctx.arc(0, 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (e && e.triggered && !e.active) {
        const p = fuseHole(o);
        U.glow(ctx, p.x, p.y, 9, 'rgba(255,240,150,1)', 'rgba(255,140,0,0)');
      }
    },
  });

  // ---------------------------------------------------------------- fuse line
  CR.defineType('fuse', {
    label: 'Fuse line',
    category: 'Launchers',
    description: 'Burns from its start (yellow dot) to its end, lighting whatever sits at the end — a cannon, another fuse, or any touch-triggered object.',
    path: true,
    pathMin: 2,
    showPath: false,
    ignitable: true,
    noScale: true,
    busy: (e) => e.active && !e.done,
    defaults: () => ({ points: [{ x: -120, y: 0 }, { x: -40, y: -12 }, { x: 40, y: 0 }, { x: 120, y: 0 }], burnSpeed: 90, trigger: 'start', delay: 0, color: '#b5814a' }),
    props: [PX('Start X'), PY('Start Y'), num('burnSpeed', 'Burn speed (px/s)', 5, 1),
      { key: 'trigger', label: 'Trigger', type: 'select', options: [['start', 'At start'], ['touch', 'When bumped or lit'], ['fire', 'Only when lit (fire, fuse, match)'], ['none', 'Never']] },
      PDELAY, PCOLOR('Cord')],
    hit: (o, s, x, y, pad) => G.distToPoly(x, y, o.points).d <= 6 + pad,
    box: (o) => G.bboxOf(o.points, 8),
    build(e) {
      e.len = G.polyLength(e.o.points);
      e.burned = 0;
    },
    post(e, sim) {
      const o = e.o;
      if (e.active && !e.done) {
        e.burned = Math.min(e.len, e.burned + Math.max(1, o.burnSpeed) / 60);
        const p = G.pointAt(o.points, e.burned);
        sim.emit(p.x, p.y, 'spark', 3, { speed: 1.6, vy: -0.6 });
        if (sim.frame % 3 === 0) sim.emit(p.x, p.y, 'smoke', 1, { speed: 0.4, vy: -0.7 });
        if (e.burned >= e.len) {
          e.done = true;
          sim.fuseEnd(e);
        }
      } else if (!e.triggered && o.trigger === 'touch') {
        const p = o.points[0];
        if (sim.movingBodyNear(p.x, p.y, 8)) sim.touch(e, true);
      }
    },
    draw(ctx, o, s) {
      const e = s.e, pts = o.points;
      const len = e ? e.len : G.polyLength(pts);
      const b = e ? e.burned : 0;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (b > 0) {
        U.polyPath(ctx, U.polyRange(pts, 0, b));
        ctx.strokeStyle = '#5b5b5b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const rest = e && e.done ? [] : b > 0 ? U.polyRange(pts, b, len) : pts;
      if (rest.length > 1) {
        U.polyPath(ctx, rest);
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = U.shade(o.color, -0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e && e.active && !e.done) {
        const p = G.pointAt(pts, b);
        U.glow(ctx, p.x, p.y, 12, 'rgba(255,245,170,1)', 'rgba(255,120,0,0)');
      }
      if (!e && pts.length) {
        const a = pts[0], z = pts[pts.length - 1];
        ctx.fillStyle = '#ffcc4d';
        ctx.strokeStyle = '#a65c00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#7a4a1a';
        ctx.beginPath();
        ctx.arc(z.x, z.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    icon(g) {
      const o = { points: [{ x: -28, y: 8 }, { x: -10, y: -6 }, { x: 8, y: 6 }, { x: 28, y: -4 }], color: '#b5814a' };
      this.draw(g, o, { e: null });
      U.glow(g, -28, 8, 8, 'rgba(255,245,170,1)', 'rgba(255,120,0,0)');
    },
  });

  // ---------------------------------------------------------------- runner
  CR.defineType('runner', {
    label: 'Runner',
    category: 'People',
    description: 'A person who runs along the path you draw, shoving anything in the way.',
    path: true,
    pathMin: 2,
    showPath: true,
    kinematic: true,
    pathColor: 'rgba(228,87,46,0.75)',
    iconScale: 0.7,
    defaults: () => ({ points: [{ x: 0, y: 0 }, { x: 320, y: 0 }], speed: 160, loop: false, trigger: 'start', delay: 0, color: '#e4572e', skin: '#f1c27d' }),
    props: [PX(), PY(), num('speed', 'Speed (px/s)', 10, 0), { key: 'loop', label: 'Loop path', type: 'checkbox' }, PWANDER, PTRIG, PDELAY,
      PCOLOR('Shirt'), PCOLOR('Skin', 'skin')],
    box: (o, s) => ({ x: s.x, y: s.y, w: 30, h: 60, angle: 0 }),
    build(e, sim) {
      const { Bodies, Body } = M();
      const p = e.o.points[0];
      e.body = Bodies.rectangle(p.x, p.y, 22, 56, { density: 0.01, friction: 0.1, frictionAir: 0 });
      Body.setInertia(e.body, Infinity);
      sim.initPathActor(e);
    },
    update(e, sim) { sim.followPath(e); },
    draw(ctx, o, s) {
      const e = s.e;
      const moving = e && e.active && !e.done;
      drawPerson(ctx, s.x, s.y, o.color, o.skin, moving ? 'run' : 'stand', e ? e.phase : 0.6, s.facing);
    },
  });

  // ---------------------------------------------------------------- jumper
  CR.defineType('jumper', {
    label: 'Jumper',
    category: 'People',
    description: 'A person who leaps when triggered — bumped, scorched by dragon fire, or at a set time.',
    iconScale: 0.7,
    defaults: () => ({ jumpVy: 11, jumpVx: 3, jumps: 1, interval: 1.2, direction: 1, trigger: 'touch', delay: 0, color: '#2a9d8f', skin: '#e0ac69' }),
    props: [PX(), PY(), num('jumpVy', 'Jump power', 0.5, 0), num('jumpVx', 'Forward push', 0.5), num('jumps', 'Jumps', 1, 1, 100),
      num('interval', 'Time between jumps (s)', 0.1, 0.1), PDIR, PTRIG, PDELAY, PCOLOR('Shirt'), PCOLOR('Skin', 'skin')],
    box: (o, s) => ({ x: s.x, y: s.y, w: 30, h: 60, angle: 0 }),
    build(e) {
      const { Bodies, Body } = M();
      const o = e.o;
      e.body = Bodies.rectangle(o.x, o.y, 22, 56, { density: 0.004, friction: 0.6, frictionStatic: 1 });
      Body.setInertia(e.body, Infinity);
      e.facing = o.direction < 0 ? -1 : 1;
    },
    activate(e, sim) {
      e.jumpsLeft = Math.max(1, Math.round(e.o.jumps));
      e.nextJump = sim.t;
    },
    busy: (e) => e.active && e.jumpsLeft > 0,
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M();
      const grounded = e.contactFrame >= sim.frame - 2;
      e.air = !grounded;
      if (e.active && e.jumpsLeft > 0 && grounded && sim.t >= e.nextJump - 1e-9) {
        Body.setVelocity(b, { x: b.velocity.x + o.jumpVx * e.facing, y: -Math.abs(o.jumpVy) });
        e.jumpsLeft--;
        e.jumped = true;
        e.nextJump = sim.t + Math.max(0.1, o.interval);
        sim.emit(b.position.x, b.position.y + 28 * e.k, 'dust', 10, { speed: 1.5, dir: -Math.PI / 2, spread: Math.PI });
      }
    },
    draw(ctx, o, s) {
      const e = s.e;
      let pose = 'stand';
      if (e) {
        if (e.air && e.jumped) pose = 'jump';
        else if (e.triggered && (!e.active || e.jumpsLeft > 0)) pose = 'crouch';
      }
      drawPerson(ctx, s.x, s.y, o.color, o.skin, pose, 0, s.facing);
    },
  });

  // ---------------------------------------------------------------- race car
  CR.defineType('car', {
    label: 'Race car',
    category: 'Vehicles',
    description: 'Accelerates to top speed whenever its wheels touch the ground. Great with ramps.',
    iconScale: 0.6,
    defaults: () => ({ w: 84, h: 30, angle: 0, speed: 9, accel: 0.25, direction: 1, trigger: 'start', delay: 0, color: '#d62828', number: '7', density: 0.003 }),
    props: [PX(), PY(), PANGLE, num('speed', 'Top speed', 0.5, 0, undefined, 'pixels per frame'), num('accel', 'Acceleration', 0.05, 0),
      PDIR, PTRIG, PDELAY, PCOLOR('Paint'), { key: 'number', label: 'Race number', type: 'text', maxLength: 4 },
      num('w', 'Length', 1, 20, 400), num('h', 'Height', 1, 10, 200), num('density', 'Density', 0.0005, 0.0001)],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 20 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, {
        angle: o.angle * D2R, chamfer: { radius: Math.min(8, o.h / 3) }, friction: 0, frictionStatic: 0, frictionAir: 0.002, density: o.density,
      });
      // any non-zero contact friction caps a velocity-driven body at ~1px/frame in Matter,
      // so the virtual wheels get none; update() supplies the traction
      e.body.crGrip = 0;
      e.wheel = 0;
      e.facing = o.direction < 0 ? -1 : 1;
    },
    update(e, sim) {
      const b = e.body, o = e.o, { Body } = M();
      const dir = e.facing, c = Math.cos(b.angle), s = Math.sin(b.angle);
      const fwd = (b.velocity.x * c + b.velocity.y * s) * dir;
      e.wheel += fwd / (o.h * 0.33);
      if (!e.active || e.contactFrame < sim.frame - 2) return;
      if (fwd < o.speed) {
        const add = Math.min(o.accel, o.speed - fwd);
        Body.setVelocity(b, { x: b.velocity.x + c * add * dir, y: b.velocity.y + s * add * dir });
      }
      if (sim.frame % 3 === 0 && fwd > 1.5) {
        const w = o.w * e.k, h = o.h * e.k;
        const rx = b.position.x - c * dir * w * 0.45 - s * h * 0.4, ry = b.position.y - s * dir * w * 0.45 + c * h * 0.4;
        sim.emit(rx, ry, 'dust', 2, { speed: 1.2, dir: dir > 0 ? Math.PI + 0.4 : -0.4, spread: 0.8 });
      }
    },
    draw(ctx, o, s) {
      const e = s.e, w = o.w, h = o.h, r = h * 0.33, wy = h / 2 - r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.scale(s.facing || 1, 1);
      ctx.lineJoin = 'round';
      // spoiler
      ctx.fillStyle = U.shade(o.color, -0.4);
      ctx.fillRect(-w / 2 - 2, -h * 0.5, 12, 3.5);
      ctx.fillRect(-w / 2 + 3, -h * 0.5, 3, h * 0.35);
      // shell
      ctx.beginPath();
      ctx.moveTo(-w / 2, wy + r * 0.3);
      ctx.lineTo(-w / 2, -h * 0.12);
      ctx.lineTo(-w * 0.36, -h * 0.2);
      ctx.lineTo(-w * 0.16, -h * 0.22);
      ctx.lineTo(-w * 0.04, -h * 0.48);
      ctx.lineTo(w * 0.16, -h * 0.48);
      ctx.lineTo(w * 0.3, -h * 0.16);
      ctx.lineTo(w / 2, -h * 0.02);
      ctx.lineTo(w / 2, wy + r * 0.3);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = U.shade(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // window
      ctx.fillStyle = '#a8dcff';
      ctx.beginPath();
      ctx.moveTo(-w * 0.01, -h * 0.42);
      ctx.lineTo(w * 0.14, -h * 0.42);
      ctx.lineTo(w * 0.25, -h * 0.18);
      ctx.lineTo(-w * 0.06, -h * 0.18);
      ctx.closePath();
      ctx.fill();
      // stripe & number
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-w / 2 + 2, -h * 0.04, w - 4, h * 0.1);
      ctx.beginPath();
      ctx.arc(-w * 0.2, -h * 0.02, h * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.scale(s.facing || 1, 1);
      ctx.fillStyle = '#111';
      ctx.font = `bold ${Math.round(h * 0.26)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.number ?? '').slice(0, 2), -w * 0.2 * (s.facing || 1), -h * 0.02 + 0.5);
      ctx.restore();
      // wheels
      const rot = e ? e.wheel : 0;
      for (const wx of [-w * 0.3, w * 0.3]) {
        ctx.fillStyle = '#151515';
        ctx.beginPath();
        ctx.arc(wx, wy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9aa0a6';
        ctx.beginPath();
        ctx.arc(wx, wy, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = rot + (i * Math.PI * 2) / 3;
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + Math.cos(a) * r * 0.5, wy + Math.sin(a) * r * 0.5);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- dragon
  const FIRE_TILT = 0.55, FIRE_HALF = 0.7;
  function dragonMouth(e) {
    const b = e.body;
    return { x: b.position.x + 58 * e.k * e.facing, y: b.position.y - 15 * e.k };
  }
  function dragonFire(e, sim) {
    const o = e.o;
    if (o.fireMode === 'off' || !e.active) {
      e.breath = Math.max(0, (e.breath || 0) - 0.1);
      return;
    }
    const m = dragonMouth(e), f = e.facing;
    const dir = f > 0 ? FIRE_TILT : Math.PI - FIRE_TILT;
    const R = Math.max(20, o.fireRange) * e.k;
    const targets = [];
    for (const x of sim.ents) {
      if (x === e || x.triggered || x.o.trigger === 'none') continue;
      let p;
      if (x.T.type === 'fuse') p = x.o.points[0];
      else if (x.body && (x.o.trigger === 'touch' || x.T.ignitable)) p = x.body.position;
      else continue;
      const dx = p.x - m.x, dy = p.y - m.y;
      if (Math.hypot(dx, dy) > R) continue;
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= FIRE_HALF) targets.push(x);
    }
    const breathing = o.fireMode === 'always' || targets.length > 0;
    e.breath = breathing ? Math.min(1, (e.breath || 0) + 0.25) : Math.max(0, (e.breath || 0) - 0.08);
    if (breathing) {
      sim.emit(m.x, m.y, 'fire', 4, { dir, spread: FIRE_HALF * 1.1, speed: R / 24, life: 24 });
      for (const t of targets) sim.touch(t, true);
    }
  }
  CR.defineType('dragon', {
    label: 'Dragon',
    category: 'Animals',
    description: 'Flies along its flight path. Its fire breath lights fuses and cannons and startles touch-triggered objects.',
    path: true,
    pathMin: 2,
    showPath: true,
    kinematic: true,
    flies: true,
    pathColor: 'rgba(76,154,42,0.8)',
    iconScale: 0.4,
    defaults: () => ({ points: [{ x: 0, y: 0 }, { x: 260, y: -60 }, { x: 520, y: 0 }], speed: 170, loop: false, fireMode: 'near', fireRange: 200, solid: false, trigger: 'start', delay: 0, color: '#4c9a2a', wing: '#8fd16a' }),
    props: [PX(), PY(), num('speed', 'Speed (px/s)', 10, 0), { key: 'loop', label: 'Loop path', type: 'checkbox' }, PWANDER,
      { key: 'fireMode', label: 'Fire breath', type: 'select', options: [['near', 'When near a target'], ['always', 'Always'], ['off', 'Off']] },
      num('fireRange', 'Fire range (px)', 10, 20), { key: 'solid', label: 'Solid body', type: 'checkbox', hint: 'knocks things over as it flies' },
      PTRIG, PDELAY, PCOLOR('Scales'), PCOLOR('Wings', 'wing')],
    box: (o, s) => ({ x: s.x - 16 * (s.facing || 1), y: s.y - 8, w: 156, h: 66, angle: 0 }),
    build(e, sim) {
      const { Bodies, Body } = M();
      const p = e.o.points[0];
      e.body = Bodies.rectangle(p.x, p.y, 90, 34, { isSensor: !e.o.solid, density: 0.02, frictionAir: 0 });
      Body.setInertia(e.body, Infinity);
      sim.initPathActor(e);
      e.flap = 0;
      e.breath = 0;
    },
    update(e, sim) {
      sim.followPath(e);
      e.flap += e.active ? 0.32 : 0.12;
      dragonFire(e, sim);
    },
    draw(ctx, o, s) {
      const e = s.e;
      if (e && e.breath > 0) {
        const m = { x: s.x + 58 * s.facing, y: s.y - 15 };
        const dir = s.facing > 0 ? FIRE_TILT : Math.PI - FIRE_TILT;
        const R = o.fireRange * 0.9;
        ctx.save();
        ctx.globalAlpha = 0.35 * e.breath;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, R);
        g.addColorStop(0, 'rgba(255,230,120,1)');
        g.addColorStop(0.5, 'rgba(255,120,20,0.6)');
        g.addColorStop(1, 'rgba(200,30,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.arc(m.x, m.y, R, dir - FIRE_HALF * 0.7, dir + FIRE_HALF * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      drawDragon(ctx, s.x, s.y, o.color, o.wing, s.facing, e ? e.flap : 0.9, e ? e.breath : 0);
    },
  });
  // ---------------------------------------------------------------- curved ramp
  function arcInfo(o) {
    const a0 = o.start * D2R, a1 = o.end * D2R;
    return { a0, a1, sweep: a1 - a0, R: o.radius + o.h / 2 };
  }
  function arcPts(o, n) {
    const { a0, sweep, R } = arcInfo(o), pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push({ x: o.x + Math.cos(a) * R, y: o.y + Math.sin(a) * R });
    }
    return pts;
  }
  CR.defineType('curve', {
    label: 'Curved ramp',
    category: 'Basics',
    description: 'A fixed curved track (quarter-pipe, bowl, loop section). Drag the square end handles to lengthen it, the round outer handle to change its radius.',
    dropOffset: { x: -110, y: -110 },
    defaults: () => ({ radius: 160, start: 0, end: 90, h: 14, color: '#a0703c', friction: 0.05 }),
    props: [PX('Centre X'), PY('Centre Y'), num('radius', 'Radius', 1, 10, 3000),
      num('start', 'Start angle (°)', 1, undefined, undefined, '0 = right, 90 = down, 180 = left'), num('end', 'End angle (°)', 1),
      num('h', 'Thickness', 1, 4, 200), PCOLOR(), num('friction', 'Friction', 0.05, 0, 1)],
    box: (o) => G.bboxOf(arcPts(o, 24), o.h / 2),
    hit(o, s, x, y, pad) {
      const { a0, sweep, R } = arcInfo(o);
      if (Math.abs(Math.hypot(x - o.x, y - o.y) - R) > o.h / 2 + pad) return false;
      const T2 = Math.PI * 2;
      let a = (Math.atan2(y - o.y, x - o.x) - a0) * Math.sign(sweep || 1);
      a = ((a % T2) + T2) % T2;
      return a <= Math.abs(sweep) + pad / R;
    },
    handles(o) {
      const { a0, a1, R } = arcInfo(o), am = (a0 + a1) / 2, Ro = o.radius + o.h + 20;
      return [
        { id: 'start', x: o.x + Math.cos(a0) * R, y: o.y + Math.sin(a0) * R },
        { id: 'end', x: o.x + Math.cos(a1) * R, y: o.y + Math.sin(a1) * R },
        { id: 'radius', round: true, x: o.x + Math.cos(am) * Ro, y: o.y + Math.sin(am) * Ro },
      ];
    },
    dragHandle(o, orig, id, p, snap) {
      if (id === 'radius') {
        o.radius = Math.max(10, snap(Math.hypot(p.x - o.x, p.y - o.y) - o.h - 20));
        return;
      }
      let deg = Math.atan2(p.y - o.y, p.x - o.x) / D2R;
      deg += Math.round((orig[id] - deg) / 360) * 360; // stay continuous with the old angle
      o[id] = Math.round(deg);
      const other = id === 'start' ? 'end' : 'start';
      if (Math.abs(o[id] - o[other]) > 355) o[id] = o[other] + Math.sign(o[id] - o[other]) * 355;
    },
    build(e) {
      const o = e.o, { Bodies, Body } = M(), { a0, sweep, R } = arcInfo(o);
      const n = Math.max(3, Math.ceil((Math.abs(sweep) * R) / 16));
      const segL = ((Math.abs(sweep) * R) / n) * 1.15;
      const parts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + ((i + 0.5) * sweep) / n;
        parts.push(Bodies.rectangle(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R, segL, o.h, { angle: a + Math.PI / 2 }));
      }
      e.body = Body.create({ parts, isStatic: true, friction: o.friction });
    },
    draw(ctx, o) {
      const { a0, a1, R } = arcInfo(o), ccw = a1 < a0;
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(o.x, o.y, R, a0, a1, ccw);
      ctx.strokeStyle = U.shade(o.color, -0.45);
      ctx.lineWidth = o.h + 3;
      ctx.stroke();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.h;
      ctx.stroke();
      ctx.strokeStyle = U.shade(o.color, -0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(o.x, o.y, R - o.h * 0.15, a0, a1, ccw);
      ctx.stroke();
      ctx.restore();
    },
    icon(g) {
      this.draw(g, Object.assign(this.defaults(), { x: -26, y: -30, radius: 46, h: 8 }));
    },
  });

  // ---------------------------------------------------------------- trampoline
  CR.defineType('trampoline', {
    label: 'Trampoline',
    category: 'Bouncers',
    description: 'A springy bed that bounces marbles (or anything) back up. Tilt it to aim the bounce; drag the end handles to resize.',
    iconScale: 0.42,
    defaults: () => ({ w: 120, angle: 0, bounce: 1.05, minBounce: 6, color: '#1d4ed8', frame: '#374151' }),
    props: [PX(), PY(), PANGLE, num('w', 'Width', 1, 30, 1000),
      num('bounce', 'Bounce', 0.05, 0, 3, '1 = same speed back up, more = livelier'),
      num('minBounce', 'Minimum bounce', 0.5, 0, 50, 'pixels per frame'), PCOLOR('Bed'), PCOLOR('Frame', 'frame')],
    rot: { offset: -Math.PI / 2, dist: () => 30 },
    handles: endHandles,
    dragHandle: dragEnd,
    box(o, s) {
      return { x: s.x - Math.sin(s.angle) * 13, y: s.y + Math.cos(s.angle) * 13, w: o.w + 6, h: 36, angle: s.angle };
    },
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, 8, { isStatic: true, angle: o.angle * D2R, friction: 0.3 });
      e.dip = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const a = e.body.angle, nx = Math.sin(a), ny = -Math.cos(a);
      const vin = -(other.velocity.x * nx + other.velocity.y * ny); // speed into the bed
      if (vin < 0.3) return;
      e.dip = Math.min(1, vin / 10);
      const o = e.o;
      sim.later(() => {
        const v = other.velocity, vn = v.x * nx + v.y * ny, out = Math.max(vin * o.bounce, o.minBounce);
        M().Body.setVelocity(other, { x: v.x + (out - vn) * nx, y: v.y + (out - vn) * ny });
      });
    },
    update(e) { e.dip *= 0.82; },
    draw(ctx, o, s) {
      const e = s.e, w = o.w, dip = e ? e.dip * 12 : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.lineCap = 'round';
      ctx.strokeStyle = o.frame;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 + 8, 28);
      ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 - 8, 28);
      ctx.moveTo(-w / 2 + 2, 28); ctx.lineTo(-w / 2 + 16, 28);
      ctx.moveTo(w / 2 - 2, 28); ctx.lineTo(w / 2 - 16, 28);
      ctx.stroke();
      // springs
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#9ca3af';
      for (let i = 1; i < 6; i++) {
        const x = -w / 2 + (w * i) / 6;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let k = 1; k <= 4; k++) ctx.lineTo(x + (k % 2 ? 3 : -3), 2 + k * 1.5 + dip * (1 - Math.abs(x) / (w / 2)) * 0.25);
        ctx.stroke();
      }
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, dip * 2, w / 2, 0);
      ctx.stroke();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------- pinball
  const PLINK = { key: 'link', label: 'When hit, trigger', type: 'objref', hint: 'another object to set off' };
  const PPOINTS = num('points', 'Points', 10, 0);
  CR.normKey = (k) => (k == null ? '' : k.length === 1 ? k.toLowerCase() : k);
  CR.keyLabel = (k) => ({ ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', '': '—' }[k] ?? (k.length === 1 ? k.toUpperCase() : k));

  CR.defineType('bumper', {
    label: 'Bumper',
    category: 'Pinball',
    description: 'Kicks anything that touches it back out, scores points and can set off another object.',
    iconScale: 0.75,
    defaults: () => ({ r: 26, kick: 10, points: 100, link: '', color: '#e11d48' }),
    props: [PX(), PY(), num('r', 'Radius', 1, 6, 200), num('kick', 'Kick strength', 0.5, 0, 60), PPOINTS, PLINK, PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 2, h: o.r * 2, angle: 0 }),
    build(e) {
      e.body = M().Bodies.circle(e.o.x, e.o.y, e.o.r, { isStatic: true, restitution: 0.6 });
      e.flash = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const o = e.o;
      e.flash = 1;
      sim.addScore(o.points);
      sim.link(e);
      sim.later(() => {
        const dx = other.position.x - o.x, dy = other.position.y - o.y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.max(o.kick, Math.hypot(other.velocity.x, other.velocity.y));
        M().Body.setVelocity(other, { x: (dx / d) * sp, y: (dy / d) * sp });
      });
      sim.emit(o.x, o.y - o.r, 'spark', 6, { speed: 2 });
    },
    update(e) { e.flash *= 0.86; },
    draw(ctx, o, s) {
      const f = s.e ? s.e.flash : 0, r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (f > 0.05) U.glow(ctx, 0, 0, r * (1.4 + f * 0.6), `rgba(255,230,120,${0.8 * f})`, 'rgba(255,200,0,0)');
      ctx.fillStyle = U.shade(o.color, -0.45);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = f > 0.3 ? U.shade(o.color, 0.4) : o.color;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = o.color;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  });

  CR.defineType('target', {
    label: 'Target',
    category: 'Pinball',
    description: 'Scores when hit. A drop target falls flat after one hit. Can set off another object.',
    iconScale: 0.8,
    defaults: () => ({ h: 44, angle: 0, drop: true, points: 500, link: '', color: '#f59e0b' }),
    props: [PX(), PY(), PANGLE, num('h', 'Height', 1, 10, 300), { key: 'drop', label: 'Drop when hit', type: 'checkbox' },
      PPOINTS, PLINK, PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 18 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 12, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, 12, o.h, { isStatic: true, angle: o.angle * D2R, restitution: 0.3 });
      e.flash = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic || e.down || sim.t < (e.cool || 0)) return;
      e.cool = sim.t + 0.3;
      e.flash = 1;
      sim.addScore(e.o.points);
      sim.link(e);
      if (e.o.drop) {
        e.down = true;
        sim.later(() => { e.body.isSensor = true; });
      }
    },
    update(e) { e.flash *= 0.9; },
    draw(ctx, o, s) {
      const e = s.e, f = e ? e.flash : 0, down = e && e.down;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      const h = down ? 8 : o.h;
      if (f > 0.05) U.glow(ctx, 0, 0, o.h * 0.8, `rgba(255,240,150,${0.8 * f})`, 'rgba(255,200,0,0)');
      ctx.globalAlpha = down ? 0.45 : 1;
      U.rr(ctx, -6, down ? o.h / 2 - 8 : -h / 2, 12, h, 3);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = U.shade(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!down) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  });

  CR.defineType('spinner', {
    label: 'Spinner',
    category: 'Pinball',
    description: 'A bar on a centre pin. With motor speed 0 it spins freely when hit; otherwise it turns on its own and sweeps things along.',
    iconScale: 0.55,
    defaults: () => ({ w: 90, h: 10, angle: 0, motor: 0, damping: 0.02, points: 10, color: '#64748b' }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 10, 1000), num('h', 'Thickness', 1, 3, 100),
      num('motor', 'Motor speed (°/s)', 15, undefined, undefined, '0 = spins freely when hit; negative = anticlockwise'),
      num('damping', 'Spin damping', 0.005, 0, 1), PPOINTS, PCOLOR()],
    rot: { offset: 0, dist: (o) => o.w / 2 + 16 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, {
        angle: o.angle * D2R, density: o.motor ? 0.03 : 0.002, frictionAir: 0, friction: 0.2, chamfer: { radius: Math.min(4, o.h / 2) },
      });
      e.turn = 0;
    },
    update(e, sim) {
      const o = e.o, b = e.body, { Body } = M();
      Body.setPosition(b, { x: o.x, y: o.y });
      Body.setVelocity(b, { x: 0, y: 0 });
      sim.float(b);
      const av = o.motor ? (o.motor * D2R) / 60 : b.angularVelocity * (1 - o.damping);
      Body.setAngularVelocity(b, av);
      e.turn += Math.abs(av);
      if (e.turn >= Math.PI && o.points) {
        e.turn -= Math.PI;
        if (!o.motor) sim.addScore(o.points);
      }
    },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      U.rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, Math.min(4, o.h / 2));
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = U.shade(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(o.w / 2 - 10, -o.h / 2, 6, o.h);
      ctx.fillRect(-o.w / 2 + 4, -o.h / 2, 6, o.h);
      ctx.restore();
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d1d5db';
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2); ctx.fill();
    },
  });

  // paddle (flipper): pivots on (x, y); angles are mirrored for a right-hand paddle
  const padAng = (o, deg) => (o.side === 'right' ? 180 - deg : deg) * D2R;
  const padCentre = (o, a) => ({ x: o.x + Math.cos(a) * o.length / 2, y: o.y + Math.sin(a) * o.length / 2 });
  CR.defineType('paddle', {
    label: 'Paddle',
    category: 'Pinball',
    description: 'A flipper that swings up while its key is held (or the on-screen button is pressed), or when triggered.',
    iconScale: 0.55,
    defaults: () => ({ side: 'left', key: 'z', length: 110, width: 18, rest: 30, flip: -30, speed: 10, trigger: 'none', hold: 0.25, delay: 0, color: '#2563eb' }),
    props: [PX('Pivot X'), PY('Pivot Y'),
      { key: 'side', label: 'Side', type: 'select', options: [['left', 'Left (points right)'], ['right', 'Right (points left)']] },
      { key: 'key', label: 'Flip key', type: 'key', hint: 'click the box, then press a key' },
      num('length', 'Length', 1, 20, 600), num('width', 'Width', 1, 6, 80),
      num('rest', 'Rest angle (°)', 1, -180, 180), num('flip', 'Flipped angle (°)', 1, -180, 180),
      num('speed', 'Flip speed (°/frame)', 1, 1, 90),
      { key: 'trigger', label: 'Also flip', type: 'select', options: [['none', 'Only with the key'], ['start', 'At start'], ['touch', 'When touched']] },
      num('hold', 'Auto-flip hold (s)', 0.05, 0.05), PDELAY, PCOLOR()],
    box(o, s) {
      const a = s.e ? s.angle : padAng(o, o.rest), c = padCentre(o, a);
      return { x: c.x, y: c.y, w: o.length + o.width, h: o.width + 2, angle: a };
    },
    handles(o) {
      const tip = (deg) => { const a = padAng(o, deg); return { x: o.x + Math.cos(a) * o.length, y: o.y + Math.sin(a) * o.length }; };
      return [{ id: 'rest', round: true, ...tip(o.rest) }, { id: 'flip', round: true, ghost: true, ...tip(o.flip) }];
    },
    dragHandle(o, orig, id, p) {
      let deg = Math.atan2(p.y - o.y, p.x - o.x) / D2R;
      if (o.side === 'right') deg = 180 - deg;
      o[id] = Math.round(((deg + 540) % 360) - 180);
    },
    build(e) {
      const o = e.o, a = padAng(o, o.rest), c = padCentre(o, a);
      e.body = M().Bodies.rectangle(c.x, c.y, o.length, o.width, {
        angle: a, density: 0.05, friction: 0.1, restitution: 0.2, frictionAir: 0, chamfer: { radius: o.width / 2 - 1 },
      });
      e.ang = a;
      e.pulse = -1;
    },
    activate(e, sim) { e.pulse = sim.t + e.o.hold; },
    onSignal(e, sim) { e.pulse = sim.t + e.o.hold; },
    busy: (e, sim) => e.pulse > sim.t || CR.input.keys.has(CR.normKey(e.o.key)),
    substeps: true,
    update(e, sim) { sim.float(e.body); },
    // drive the paddle to its rest / flipped angle in small slices (velocities are per 1/60 s, hence * n)
    substep(e, sim, n) {
      const o = e.o, b = e.body, { Body } = M();
      const on = CR.input.keys.has(CR.normKey(o.key)) || e.pulse > sim.t;
      const target = padAng(o, on ? o.flip : o.rest);
      const max = ((on ? o.speed : o.speed * 0.5) * D2R) / n;
      const da = Math.max(-max, Math.min(max, target - e.ang));
      const c0 = padCentre(o, e.ang), c1 = padCentre(o, e.ang + da);
      Body.setAngle(b, e.ang);
      Body.setPosition(b, c0);
      Body.setAngularVelocity(b, da * n);
      Body.setVelocity(b, { x: (c1.x - c0.x) * n, y: (c1.y - c0.y) * n });
      e.ang += da;
    },
    draw(ctx, o, s, opts) {
      const a = s.e ? s.angle : padAng(o, o.rest), L = o.length, r0 = o.width / 2, r1 = o.width * 0.28;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.arc(0, 0, r0, Math.PI / 2, Math.PI * 1.5);
      ctx.lineTo(L - r1, -r1);
      ctx.arc(L - r1, 0, r1, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = U.shade(o.color, -0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath(); ctx.arc(0, 0, r0 * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (!s.e && o.key && !(opts && opts.icon)) {
        ctx.save();
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(30,41,59,0.75)';
        ctx.fillText(CR.keyLabel(CR.normKey(o.key)), o.x, o.y - o.width - 4);
        ctx.restore();
      }
    },
    icon(g) {
      this.draw(g, Object.assign(this.defaults(), { x: -34, y: -8, length: 76, width: 14 }), { e: null }, { icon: true });
    },
  });

  // ---------------------------------------------------------------- fire: match & ring of fire
  CR.defineType('match', {
    label: 'Match',
    category: 'Fire',
    description: 'Strikes when bumped (or at a set time) and lights any fuse start, cannon, ring of fire or other match within reach.',
    iconScale: 0.8,
    ignitable: true,
    defaults: () => ({ angle: 0, burnTime: 5, reach: 30, trigger: 'touch', delay: 0, color: '#e8c48a' }),
    props: [PX(), PY(), PANGLE, num('burnTime', 'Burn time (s)', 0.5, 0.2), num('reach', 'Ignite reach (px)', 2, 2, 300),
      { key: 'trigger', label: 'Trigger', type: 'select', options: [['touch', 'When bumped or lit'], ['start', 'At start'], ['none', 'Never']] },
      PDELAY, PCOLOR('Stick')],
    rot: { offset: -Math.PI / 2, dist: () => 38 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 8, h: 42, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, 6, 40, { angle: o.angle * D2R, density: 0.001, friction: 0.5, frictionStatic: 0.8 });
    },
    busy: (e) => e.active && !e.done,
    activate(e, sim) {
      e.out = sim.t + e.o.burnTime;
      const h = matchHead(e.body, e.k);
      sim.emit(h.x, h.y, 'spark', 14, { speed: 2.5 });
    },
    update(e, sim) {
      if (!e.active || e.done) return;
      if (sim.t >= e.out) {
        e.done = true;
        const h = matchHead(e.body, e.k);
        sim.emit(h.x, h.y, 'smoke', 6, { speed: 0.6, vy: -0.8 });
        return;
      }
      const h = matchHead(e.body, e.k);
      sim.emit(h.x, h.y, 'fire', 1, { dir: -Math.PI / 2, spread: 0.6, speed: 1.2, life: 16 });
      sim.igniteNear(h.x, h.y, e.o.reach, e);
    },
    draw(ctx, o, s) {
      const e = s.e;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = o.color;
      ctx.strokeStyle = U.shade(o.color, -0.45);
      ctx.lineWidth = 1;
      ctx.fillRect(-3, -14, 6, 34);
      ctx.strokeRect(-3, -14, 6, 34);
      ctx.fillStyle = e && e.done ? '#1f1f1f' : '#c0262d';
      ctx.beginPath();
      ctx.ellipse(0, -16, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (e && e.active && !e.done) {
        const fl = 1 + Math.sin(e.flick = (e.flick || 0) + 0.6) * 0.12;
        const g = ctx.createRadialGradient(0, -24, 1, 0, -22, 12 * fl);
        g.addColorStop(0, 'rgba(255,250,200,1)');
        g.addColorStop(0.4, 'rgba(255,170,40,0.9)');
        g.addColorStop(1, 'rgba(230,60,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -38 * fl);
        ctx.quadraticCurveTo(8, -22, 0, -15);
        ctx.quadraticCurveTo(-8, -22, 0, -38 * fl);
        ctx.fill();
      }
      ctx.restore();
    },
  });
  function matchHead(b, k = 1) {
    return { x: b.position.x + Math.sin(b.angle) * 17 * k, y: b.position.y - Math.cos(b.angle) * 17 * k };
  }

  CR.defineType('firering', {
    label: 'Ring of fire',
    category: 'Fire',
    description: 'A hoop things can pass through. It stays dark until a match, fuse, dragon or burning object lights it; anything passing through a lit ring catches fire and can light fuses in turn.',
    iconScale: 0.42,
    ignitable: true,
    defaults: () => ({ r: 60, th: 8, stand: true, burnTime: 0, trigger: 'fire', delay: 0, color: '#9ca3af' }),
    props: [PX(), PY(), num('r', 'Radius', 1, 15, 600), num('th', 'Ring thickness', 1, 2, 60),
      { key: 'stand', label: 'Stand', type: 'checkbox', hint: 'post down to the floor' },
      num('burnTime', 'Burn time (s)', 0.5, 0, undefined, '0 = burns forever once lit'),
      { key: 'trigger', label: 'Lights', type: 'select', options: [['fire', 'When ignited'], ['start', 'At start'], ['none', 'Never']] },
      PDELAY, PCOLOR('Ring')],
    box: (o, s) => ({ x: s.x, y: s.y, w: (o.r + o.th) * 2, h: (o.r + o.th) * 2, angle: 0 }),
    hit: (o, s, x, y, pad) => Math.abs(Math.hypot(x - s.x, y - s.y) - o.r) <= o.th / 2 + pad + 4,
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r + o.th / 2, { isStatic: true, isSensor: true });
    },
    busy: (e) => e.active && !e.done,
    activate(e, sim) {
      e.until = e.o.burnTime > 0 ? sim.t + e.o.burnTime : Infinity;
      sim.emit(e.o.x, e.o.y - e.o.r * e.k, 'flash', 16, { speed: 3 });
    },
    update(e, sim) {
      if (!e.active || e.done) return;
      const o = e.o, r = o.r * e.k, th = o.th * e.k;
      if (sim.t >= e.until) {
        e.done = true;
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          sim.emit(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 'smoke', 1, { speed: 0.5, vy: -0.6 });
        }
        return;
      }
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        sim.emit(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 'fire', 1,
          { dir: -Math.PI / 2, spread: 0.8, speed: 0.9, life: 18, vx: Math.cos(a) * 0.4, vy: Math.sin(a) * 0.4 });
      }
      sim.igniteNear(o.x, o.y, r + th, e);
      sim.burnBodiesInside(o.x, o.y, r + th / 2);
    },
    draw(ctx, o, s) {
      const e = s.e, lit = e && e.active && !e.done;
      ctx.save();
      if (o.stand) {
        // the drawing is scaled by Size around (x, y): keep the post ending on the floor
        const bottom = CR.floorY != null ? o.y + (CR.floorY - o.y) / CR.sizeOf(o) : o.y + o.r + 120;
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(o.x - 3, o.y + o.r, 6, Math.max(0, bottom - o.y - o.r));
        ctx.fillRect(o.x - 14, bottom - 4, 28, 4);
      }
      if (lit) {
        ctx.strokeStyle = 'rgba(255,140,30,0.35)';
        ctx.lineWidth = o.th + 16;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = e && e.done ? '#3f3f46' : U.shade(o.color, -0.4);
      ctx.lineWidth = o.th + 2;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = lit ? '#fb923c' : e && e.done ? '#52525b' : o.color;
      ctx.lineWidth = o.th - 2;
      ctx.stroke();
      if (lit) {
        // flickering flame tongues around the hoop
        const t = s.t || 0;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const len = 10 + 6 * Math.sin(t * 14 + i * 2.3);
          const bx = o.x + Math.cos(a) * o.r, by = o.y + Math.sin(a) * o.r;
          const g = ctx.createLinearGradient(bx, by, bx, by - len);
          g.addColorStop(0, 'rgba(255,200,60,0.95)');
          g.addColorStop(1, 'rgba(230,60,10,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(bx - 5, by);
          ctx.quadraticCurveTo(bx, by - len * 1.6, bx + 5, by);
          ctx.fill();
        }
      }
      ctx.restore();
    },
    icon(g) {
      this.draw(g, Object.assign(this.defaults(), { x: 0, y: -4, r: 17, th: 4, stand: false }), { e: { active: true }, t: 0.3 });
    },
  });
})();
