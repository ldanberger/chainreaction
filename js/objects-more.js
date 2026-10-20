/*
 * Object pack: vehicles, animals and bouncers.
 *
 * Most of these reuse a handful of behaviours from objects.js and only differ in
 * size, defaults and drawing:
 *   vehicle()  drives along the ground like the race car
 *   flyer()    follows a drawn flight path (planes, birds, ...)
 *   walker()   follows a drawn path on foot (dog, horse, ...)
 *   hopper()   jumps when triggered, like the jumper
 *   ball()     a bouncy dynamic ball
 * plus a few one-off bouncers (spring pad, jelly block, rubber rail, ...).
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw, G = CR.geom;
  const { PX, PY, PANGLE, PCOLOR, PTRIG, PDELAY, PDIR, PWANDER, num } = CR.P;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- small drawing helpers
  function wheel(ctx, x, y, r, rot, tire = '#151515', hub = '#9aa0a6') {
    ctx.fillStyle = tire;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = hub;
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * TAU) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    }
    ctx.stroke();
  }
  function spokeWheel(ctx, x, y, r, rot, col = '#222') {
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * Math.PI) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
  }
  function poly(ctx, pts, fill, stroke, lw = 1.5) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function ell(ctx, x, y, rx, ry, fill, rot = 0) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fill();
  }
  function box(ctx, x, y, w, h, r, fill, stroke) {
    U.rr(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function eye(ctx, x, y, r = 2) {
    ell(ctx, x, y, r, r, '#fff');
    ell(ctx, x + r * 0.3, y, r * 0.55, r * 0.55, '#111');
  }
  function line(ctx, pts, col, w) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  }
  /** Four walking legs hanging from y=top; pairs swing in opposite phase. */
  function legs4(ctx, xs, top, len, phase, moving, col, w) {
    xs.forEach((x, i) => {
      const a = moving ? Math.sin(phase + (i % 2 ? Math.PI : 0)) * 0.55 : 0;
      line(ctx, [[x, top], [x + Math.sin(a) * len, top + Math.cos(a) * len]], col, w);
    });
  }
  const dark = (c, a = -0.35) => U.shade(c, a);
  const light = (c, a = 0.4) => U.shade(c, a);

  // ---------------------------------------------------------------- behaviour: ground vehicle
  function vehicle(name, d, art) {
    const car = CR.types.car;
    CR.defineType(name, {
      label: d.label,
      category: 'Vehicles',
      description: d.desc,
      iconSize: { w: d.w, h: d.h },
      defaults: () => ({ w: d.w, h: d.h, angle: 0, speed: d.speed, accel: d.accel, direction: 1, trigger: 'start', delay: 0, color: d.color, density: d.density || 0.003 }),
      props: [PX(), PY(), PANGLE, num('speed', 'Top speed', 0.5, 0, undefined, 'pixels per frame'), num('accel', 'Acceleration', 0.05, 0),
        PDIR, PTRIG, PDELAY, PCOLOR('Paint'), num('w', 'Length', 1, 10, 600), num('h', 'Height', 1, 6, 300), num('density', 'Density', 0.0005, 0.0001)],
      rot: car.rot,
      box: car.box,
      build: car.build,
      update(e, sim) {
        car.update(e, sim);
        if (d.update) d.update(e, sim);
      },
      draw(ctx, o, s) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.scale(s.facing || 1, 1);
        ctx.lineJoin = 'round';
        art(ctx, o, s.e ? s.e.wheel : 0, s);
        ctx.restore();
      },
    });
  }
  // point at local (lx, ly) on a driven body, world coordinates
  function local(e, lx, ly) {
    const b = e.body, c = Math.cos(b.angle), s = Math.sin(b.angle), f = e.facing;
    lx *= e.k; ly *= e.k;
    return { x: b.position.x + c * lx * f - s * ly, y: b.position.y + s * lx * f + c * ly };
  }

  // ---------------------------------------------------------------- behaviour: path followers
  function pathType(name, d, art, flying) {
    CR.defineType(name, {
      label: d.label,
      category: d.category,
      description: d.desc,
      path: true,
      pathMin: 2,
      showPath: true,
      kinematic: true,
      flies: !!flying,
      pathColor: d.pathColor || (flying ? 'rgba(14,116,144,0.75)' : 'rgba(146,64,14,0.75)'),
      iconSize: { w: d.w, h: d.h },
      defaults: () => Object.assign({
        points: flying ? [{ x: 0, y: 0 }, { x: 260, y: -50 }, { x: 520, y: 0 }] : [{ x: 0, y: 0 }, { x: 320, y: 0 }],
        speed: d.speed, loop: false, trigger: 'start', delay: 0, color: d.color,
      }, flying ? { solid: false } : {}),
      props: [PX(), PY(), num('speed', 'Speed (px/s)', 10, 0), { key: 'loop', label: 'Loop path', type: 'checkbox' }, PWANDER,
        ...(flying ? [{ key: 'solid', label: 'Solid body', type: 'checkbox', hint: 'knocks things over as it goes' }] : []),
        PTRIG, PDELAY, PCOLOR()],
      box: (o, s) => ({ x: s.x, y: s.y, w: d.w + 8, h: d.h + 8, angle: 0 }),
      build(e, sim) {
        const { Bodies, Body } = M();
        const p = e.o.points[0];
        e.body = Bodies.rectangle(p.x, p.y, d.w, d.h, {
          isSensor: flying ? !e.o.solid : false, density: d.density || 0.01, friction: 0.1, frictionAir: 0,
        });
        Body.setInertia(e.body, Infinity);
        sim.initPathActor(e);
        e.flap = 0;
        const p1 = e.o.points[1];
        e.heading = Math.atan2(p1.y - p.y, p1.x - p.x);
      },
      update(e, sim) {
        sim.followPath(e);
        const v = e.body.velocity;
        if (Math.hypot(v.x, v.y) > 0.05) e.heading = Math.atan2(v.y, v.x);
        e.flap += e.active && !e.done ? d.flap || 0.3 : (d.idleFlap ?? 0.1);
        if (d.update) d.update(e, sim);
      },
      draw(ctx, o, s) {
        const e = s.e;
        let heading = e ? e.heading : Math.atan2(o.points[1].y - o.points[0].y, o.points[1].x - o.points[0].x);
        ctx.save();
        ctx.translate(s.x, s.y);
        if (d.rotate) ctx.rotate(heading);
        else ctx.scale(s.facing || 1, 1);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        art(ctx, o, e ? e.flap : 0.8, !!(e && e.active && !e.done), s, e ? e.phase : 0.6);
        ctx.restore();
      },
    });
  }
  const flyer = (name, d, art) => pathType(name, d, art, true);
  const walker = (name, d, art) => pathType(name, Object.assign({ flap: 0.15 }, d), art, false);

  // ---------------------------------------------------------------- behaviour: hopper
  function hopper(name, d, art) {
    const J = CR.types.jumper;
    CR.defineType(name, {
      label: d.label,
      category: 'Animals',
      description: d.desc,
      iconSize: { w: d.w, h: d.h },
      defaults: () => ({ jumpVy: d.vy, jumpVx: d.vx, jumps: 5, interval: 0.9, direction: 1, trigger: 'start', delay: 0, color: d.color }),
      props: [PX(), PY(), num('jumpVy', 'Jump power', 0.5, 0), num('jumpVx', 'Forward push', 0.5), num('jumps', 'Jumps', 1, 1, 100),
        num('interval', 'Time between jumps (s)', 0.1, 0.1), PDIR, PTRIG, PDELAY, PCOLOR()],
      box: (o, s) => ({ x: s.x, y: s.y, w: d.w + 6, h: d.h + 6, angle: 0 }),
      build(e) {
        const { Bodies, Body } = M(), o = e.o;
        e.body = Bodies.rectangle(o.x, o.y, d.w, d.h, { density: d.density || 0.004, friction: 0.6, frictionStatic: 1, chamfer: { radius: 4 } });
        Body.setInertia(e.body, Infinity);
        e.facing = o.direction < 0 ? -1 : 1;
      },
      activate: J.activate,
      update: J.update,
      busy: J.busy,
      draw(ctx, o, s) {
        const e = s.e, air = !!(e && e.air && e.jumped);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.facing || 1, 1);
        ctx.lineCap = 'round';
        art(ctx, o, air);
        ctx.restore();
      },
    });
  }

  // ---------------------------------------------------------------- behaviour: bouncy ball
  function ball(name, d, art) {
    CR.defineType(name, {
      label: d.label,
      category: 'Bouncers',
      description: d.desc,
      iconSize: { w: d.r * 2.2, h: d.r * 2.2 },
      defaults: () => ({ r: d.r, color: d.color, density: d.density, restitution: d.rest, air: d.air || 0.001, vx: 0, vy: 0 }),
      props: [PX(), PY(), num('r', 'Radius', 1, 2, 300), PCOLOR(), num('density', 'Density', 0.0002, 0.0001),
        num('restitution', 'Bounciness', 0.05, 0, 1.2), num('air', 'Air drag', 0.002, 0, 0.5),
        num('vx', 'Start velocity X', 0.5), num('vy', 'Start velocity Y', 0.5)],
      box: (o, s) => ({ x: s.x, y: s.y, w: o.r * 2, h: o.r * 2, angle: 0 }),
      build(e) {
        const o = e.o, { Bodies, Body } = M();
        e.body = Bodies.circle(o.x, o.y, o.r, { density: o.density, restitution: o.restitution, friction: 0.05, frictionAir: o.air });
        if (o.vx || o.vy) Body.setVelocity(e.body, { x: +o.vx || 0, y: +o.vy || 0 });
      },
      draw(ctx, o, s) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.clip();
        ctx.rotate(s.angle);
        art(ctx, o, o.r);
        ctx.restore();
        ctx.save();
        const g = ctx.createRadialGradient(s.x - o.r * 0.4, s.y - o.r * 0.45, o.r * 0.05, s.x, s.y, o.r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.45, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, TAU); ctx.fill();
        ctx.restore();
      },
    });
  }

  // ---------------------------------------------------------------- bounce helpers (static bouncers)
  // Override the solver's bounce: send `other` back out along normal n at max(vin*bounce, min).
  function bounceAlong(sim, other, nx, ny, bounce, min) {
    const vin = -(other.velocity.x * nx + other.velocity.y * ny);
    if (vin < 0.3) return 0;
    sim.later(() => {
      const v = other.velocity, vn = v.x * nx + v.y * ny, out = Math.max(vin * bounce, min);
      M().Body.setVelocity(other, { x: v.x + (out - vn) * nx, y: v.y + (out - vn) * ny });
    });
    return vin;
  }
  // outward normal of the side of a (rotated) box that `other` is on
  function boxNormal(b, w, h, other) {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const dx = other.position.x - b.position.x, dy = other.position.y - b.position.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    let nlx = 0, nly = 0;
    if (Math.abs(lx) / (w / 2) > Math.abs(ly) / (h / 2)) nlx = Math.sign(lx) || 1;
    else nly = Math.sign(ly) || -1;
    return { x: nlx * c - nly * s, y: nlx * s + nly * c };
  }

  // =================================================================== VEHICLES (ground)
  vehicle('monstertruck', { label: 'Monster truck', desc: 'Huge wheels — climbs and crushes.', w: 110, h: 70, speed: 8, accel: 0.3, density: 0.004, color: '#16a34a' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.33, wy = h / 2 - r;
    ctx.fillStyle = '#374151';
    ctx.fillRect(-w * 0.36, wy - r * 0.35, w * 0.72, 5);
    box(ctx, -w * 0.46, -h / 2 + 4, w * 0.92, h * 0.3, 5, o.color, dark(o.color, -0.5));
    poly(ctx, [[-w * 0.05, -h / 2 + 4], [w * 0.05, -h / 2 - 8], [w * 0.28, -h / 2 - 8], [w * 0.34, -h / 2 + 4]], o.color, dark(o.color, -0.5));
    poly(ctx, [[w * 0.07, -h / 2 + 2], [w * 0.1, -h / 2 - 5], [w * 0.26, -h / 2 - 5], [w * 0.3, -h / 2 + 2]], '#a8dcff');
    for (const x of [-w * 0.3, w * 0.3]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('bus', { label: 'Bus', desc: 'A long, steady school bus.', w: 150, h: 50, speed: 6, accel: 0.12, color: '#facc15' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.2, wy = h / 2 - r;
    box(ctx, -w / 2, -h / 2, w, h - r * 0.8, 6, o.color, dark(o.color, -0.5));
    ctx.fillStyle = '#111';
    ctx.fillRect(-w / 2, -h * 0.02, w, 3);
    ctx.fillStyle = '#a8dcff';
    for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2 + 8 + i * (w - 30) / 6, -h / 2 + 6, (w - 30) / 6 - 4, h * 0.28);
    ctx.fillRect(w / 2 - 16, -h / 2 + 6, 12, h * 0.4);
    for (const x of [-w * 0.32, w * 0.3]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('firetruck', { label: 'Fire truck', desc: 'Red engine with a ladder on top.', w: 140, h: 50, speed: 7, accel: 0.18, density: 0.004, color: '#dc2626' }, (ctx, o, rot, s) => {
    const w = o.w, h = o.h, r = h * 0.22, wy = h / 2 - r;
    box(ctx, -w / 2, -h * 0.25, w * 0.72, h * 0.6, 3, o.color, dark(o.color, -0.5));
    box(ctx, w * 0.22, -h / 2, w * 0.28, h * 0.85, 4, o.color, dark(o.color, -0.5));
    ctx.fillStyle = '#a8dcff';
    ctx.fillRect(w * 0.3, -h / 2 + 5, w * 0.16, h * 0.28);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.46, -h * 0.4, w * 0.6, 6);
    for (let x = -w * 0.44; x < w * 0.12; x += 9) { ctx.beginPath(); ctx.moveTo(x, -h * 0.4); ctx.lineTo(x, -h * 0.4 + 6); ctx.stroke(); }
    const on = s.e && s.e.active && Math.floor((s.t || 0) * 6) % 2;
    ell(ctx, w * 0.36, -h / 2 - 3, 4, 3, on ? '#fde047' : '#b91c1c');
    for (const x of [-w * 0.32, w * 0.33]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('tractor', { label: 'Tractor', desc: 'Slow and strong, with a big rear wheel.', w: 80, h: 56, speed: 4, accel: 0.12, density: 0.006, color: '#16a34a' }, (ctx, o, rot, s) => {
    const w = o.w, h = o.h, R = h * 0.4, r = h * 0.22;
    box(ctx, -w * 0.2, -h * 0.05, w * 0.65, h * 0.3, 3, o.color, dark(o.color, -0.5));
    box(ctx, -w * 0.35, -h / 2, w * 0.3, h * 0.5, 2, null, dark(o.color, -0.5));
    ctx.fillStyle = 'rgba(168,220,255,0.6)';
    ctx.fillRect(-w * 0.33, -h / 2 + 2, w * 0.26, h * 0.45);
    ctx.fillStyle = '#374151';
    ctx.fillRect(w * 0.25, -h * 0.35, 4, h * 0.32);
    wheel(ctx, -w * 0.22, h / 2 - R, R, rot, '#1f2937', '#facc15');
    wheel(ctx, w * 0.32, h / 2 - r, r, rot * 1.8, '#1f2937', '#facc15');
  });
  vehicle('motorcycle', { label: 'Motorcycle', desc: 'Fast and light — good for stunt jumps.', w: 64, h: 40, speed: 11, accel: 0.35, color: '#111827' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.3, wy = h / 2 - r;
    line(ctx, [[-w * 0.33, wy], [-w * 0.05, -h * 0.05], [w * 0.2, -h * 0.05], [w * 0.33, wy]], '#6b7280', 3);
    box(ctx, -w * 0.15, -h * 0.2, w * 0.36, h * 0.2, 4, o.color);
    line(ctx, [[w * 0.2, -h * 0.05], [w * 0.26, -h * 0.4]], '#9ca3af', 2);
    ell(ctx, -w * 0.02, -h * 0.32, 5, 6, '#ef4444');
    for (const x of [-w * 0.33, w * 0.33]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('bicycle', { label: 'Bicycle', desc: 'A gentle, light bike.', w: 60, h: 38, speed: 5, accel: 0.15, density: 0.002, color: '#0ea5e9' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.32, wy = h / 2 - r;
    for (const x of [-w * 0.33, w * 0.33]) spokeWheel(ctx, x, wy, r, rot);
    line(ctx, [[-w * 0.33, wy], [-w * 0.05, wy], [w * 0.18, -h * 0.15], [-w * 0.12, -h * 0.15], [-w * 0.05, wy]], o.color, 2.5);
    line(ctx, [[w * 0.33, wy], [w * 0.18, -h * 0.15], [w * 0.2, -h * 0.35]], o.color, 2.5);
    line(ctx, [[-w * 0.16, -h * 0.25], [-w * 0.05, -h * 0.25]], '#111', 3);
  });
  vehicle('skateboard', { label: 'Skateboard', desc: 'Low deck on tiny wheels.', w: 50, h: 14, speed: 7, accel: 0.2, density: 0.002, color: '#a855f7' }, (ctx, o, rot) => {
    const w = o.w, h = o.h;
    poly(ctx, [[-w / 2, -h * 0.35], [-w * 0.42, -h * 0.1], [w * 0.42, -h * 0.1], [w / 2, -h * 0.35], [w * 0.44, -h * 0.05], [-w * 0.44, -h * 0.05]], o.color, dark(o.color, -0.5), 1);
    for (const x of [-w * 0.3, w * 0.3]) wheel(ctx, x, h / 2 - 3.5, 3.5, rot, '#f8fafc', '#94a3b8');
  });
  vehicle('tank', { label: 'Tank', desc: 'Very heavy and slow; shoves almost anything.', w: 110, h: 46, speed: 2.5, accel: 0.08, density: 0.012, color: '#4d5d33' }, (ctx, o, rot) => {
    const w = o.w, h = o.h;
    box(ctx, -w / 2, h * 0.05, w, h * 0.45, h * 0.22, '#27272a');
    for (let i = 0; i < 6; i++) wheel(ctx, -w * 0.4 + (i * w * 0.8) / 5, h * 0.27, h * 0.12, rot, '#52525b', '#a1a1aa');
    box(ctx, -w * 0.42, -h * 0.1, w * 0.84, h * 0.2, 4, o.color, dark(o.color, -0.5));
    box(ctx, -w * 0.2, -h * 0.4, w * 0.36, h * 0.32, 8, light(o.color, 0.1), dark(o.color, -0.5));
    ctx.fillStyle = dark(o.color, -0.2);
    ctx.fillRect(w * 0.14, -h * 0.3, w * 0.42, 5);
  });
  vehicle('train', { label: 'Steam train', desc: 'A puffing locomotive.', w: 140, h: 60, speed: 6, accel: 0.1, density: 0.008, color: '#1f2937',
    update(e, sim) {
      if (e.active && sim.frame % 6 === 0) { const p = local(e, e.o.w * 0.3, -e.o.h * 0.65); sim.emit(p.x, p.y, 'smoke', 2, { speed: 0.6, vy: -1.2 }); }
    } }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.18, wy = h / 2 - r;
    box(ctx, -w * 0.15, -h * 0.25, w * 0.55, h * 0.45, h * 0.2, o.color, '#000');
    box(ctx, -w / 2, -h / 2, w * 0.36, h * 0.72, 3, '#b91c1c', '#000');
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-w * 0.44, -h * 0.4, w * 0.22, h * 0.2);
    ctx.fillStyle = '#111';
    ctx.fillRect(w * 0.25, -h * 0.55, 10, h * 0.32);
    poly(ctx, [[w * 0.4, h * 0.2], [w / 2, h * 0.45], [w * 0.4, h * 0.45]], '#9ca3af');
    for (const x of [-w * 0.35, -w * 0.12, w * 0.1, w * 0.3]) wheel(ctx, x, wy, r, rot, '#111', '#dc2626');
    line(ctx, [[-w * 0.35, wy], [w * 0.1, wy]], '#9ca3af', 2);
  });
  vehicle('gokart', { label: 'Go-kart', desc: 'Small, quick and low.', w: 56, h: 24, speed: 10, accel: 0.4, color: '#f97316' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.3, wy = h / 2 - r;
    box(ctx, -w * 0.45, -h * 0.05, w * 0.9, h * 0.28, 3, o.color, dark(o.color, -0.5));
    ell(ctx, -w * 0.05, -h * 0.3, 6, 6, '#2563eb');
    ctx.fillStyle = '#111';
    ctx.fillRect(-w * 0.05, -h * 0.34, 6, 3);
    for (const x of [-w * 0.33, w * 0.33]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('dumptruck', { label: 'Dump truck', desc: 'Heavy hauler with a big tipper bed.', w: 120, h: 56, speed: 5, accel: 0.12, density: 0.007, color: '#eab308' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.24, wy = h / 2 - r;
    poly(ctx, [[-w / 2, -h / 2], [w * 0.15, -h / 2], [w * 0.1, h * 0.1], [-w * 0.45, h * 0.1]], o.color, dark(o.color, -0.5));
    box(ctx, w * 0.18, -h * 0.3, w * 0.32, h * 0.45, 4, o.color, dark(o.color, -0.5));
    ctx.fillStyle = '#a8dcff';
    ctx.fillRect(w * 0.25, -h * 0.25, w * 0.18, h * 0.18);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-w * 0.45, h * 0.1, w * 0.95, 5);
    for (const x of [-w * 0.32, -w * 0.12, w * 0.34]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('ambulance', { label: 'Ambulance', desc: 'Lights flashing, on its way.', w: 110, h: 50, speed: 9, accel: 0.25, color: '#f8fafc' }, (ctx, o, rot, s) => {
    const w = o.w, h = o.h, r = h * 0.2, wy = h / 2 - r;
    box(ctx, -w / 2, -h / 2 + 4, w * 0.7, h * 0.72, 4, o.color, '#9ca3af');
    poly(ctx, [[w * 0.2, -h * 0.15], [w * 0.38, -h * 0.15], [w / 2, h * 0.05], [w / 2, h * 0.3], [w * 0.2, h * 0.3]], o.color, '#9ca3af');
    ctx.fillStyle = '#a8dcff';
    ctx.fillRect(w * 0.26, -h * 0.1, w * 0.12, h * 0.15);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-w / 2, h * 0.05, w, 4);
    ctx.fillRect(-w * 0.2, -h * 0.25, 18, 6);
    ctx.fillRect(-w * 0.2 + 6, -h * 0.25 - 6, 6, 18);
    const on = s.e && s.e.active && Math.floor((s.t || 0) * 8) % 2;
    ell(ctx, -w * 0.3, -h / 2 + 1, 4, 3, on ? '#3b82f6' : '#ef4444');
    for (const x of [-w * 0.3, w * 0.32]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('policecar', { label: 'Police car', desc: 'Siren lights flash when it is moving.', w: 90, h: 32, speed: 10, accel: 0.3, color: '#1e3a8a' }, (ctx, o, rot, s) => {
    const w = o.w, h = o.h, r = h * 0.3, wy = h / 2 - r;
    box(ctx, -w / 2, -h * 0.1, w, h * 0.45, 6, o.color, '#0f172a');
    poly(ctx, [[-w * 0.25, -h * 0.1], [-w * 0.15, -h * 0.45], [w * 0.2, -h * 0.45], [w * 0.3, -h * 0.1]], '#f8fafc', '#0f172a');
    ctx.fillStyle = '#a8dcff';
    ctx.fillRect(-w * 0.12, -h * 0.4, w * 0.13, h * 0.24);
    ctx.fillRect(w * 0.04, -h * 0.4, w * 0.13, h * 0.24);
    const on = s.e && s.e.active && Math.floor((s.t || 0) * 8) % 2;
    ell(ctx, -w * 0.03, -h * 0.52, 5, 3, on ? '#ef4444' : '#7f1d1d');
    ell(ctx, w * 0.08, -h * 0.52, 5, 3, on ? '#1e40af' : '#60a5fa');
    for (const x of [-w * 0.3, w * 0.3]) wheel(ctx, x, wy, r, rot);
  });
  vehicle('bulldozer', { label: 'Bulldozer', desc: 'Pushes piles of things with its blade.', w: 110, h: 52, speed: 2.5, accel: 0.08, density: 0.012, color: '#f59e0b' }, (ctx, o, rot) => {
    const w = o.w, h = o.h;
    box(ctx, -w * 0.42, h * 0.05, w * 0.72, h * 0.45, h * 0.22, '#27272a');
    for (let i = 0; i < 5; i++) wheel(ctx, -w * 0.33 + (i * w * 0.54) / 4, h * 0.27, h * 0.1, rot, '#52525b', '#a1a1aa');
    box(ctx, -w * 0.38, -h * 0.15, w * 0.62, h * 0.22, 3, o.color, dark(o.color, -0.5));
    box(ctx, -w * 0.3, -h / 2, w * 0.28, h * 0.36, 3, null, dark(o.color, -0.5));
    poly(ctx, [[w * 0.38, -h * 0.3], [w / 2, -h * 0.25], [w / 2, h / 2], [w * 0.4, h / 2]], '#71717a', '#27272a');
    line(ctx, [[w * 0.2, -h * 0.05], [w * 0.4, -h * 0.1]], '#3f3f46', 4);
  });

  // =================================================================== VEHICLES (flying)
  flyer('airplane', { label: 'Airplane', category: 'Vehicles', desc: 'Flies its flight path, propeller spinning.', w: 100, h: 30, speed: 220, color: '#e5e7eb', flap: 0.9 }, (ctx, o, f) => {
    box(ctx, -45, -8, 90, 16, 8, o.color, '#6b7280');
    poly(ctx, [[-45, -6], [-50, -24], [-36, -24], [-28, -6]], '#ef4444', '#6b7280');
    ell(ctx, 0, 2, 26, 4, dark(o.color, -0.15));
    ctx.fillStyle = '#60a5fa';
    for (let i = 0; i < 5; i++) ctx.fillRect(-24 + i * 9, -4, 5, 4);
    poly(ctx, [[30, -6], [42, -4], [44, 0], [30, 0]], '#93c5fd');
    const pl = 13 * Math.abs(Math.cos(f * 3));
    line(ctx, [[47, -pl], [47, pl]], '#374151', 3);
  });
  flyer('helicopter', { label: 'Helicopter', category: 'Vehicles', desc: 'Hovers along its flight path.', w: 90, h: 40, speed: 140, color: '#2563eb', flap: 1.1, idleFlap: 0.6 }, (ctx, o, f) => {
    ell(ctx, 8, 2, 22, 14, o.color);
    ell(ctx, 18, -1, 10, 9, '#bfdbfe');
    line(ctx, [[-12, 0], [-42, -4]], o.color, 6);
    const tr = 8 * Math.cos(f * 4);
    line(ctx, [[-42, -4 - tr], [-42, -4 + tr]], '#374151', 2);
    line(ctx, [[8, -12], [8, -17]], '#374151', 3);
    const rl = 44 * Math.cos(f * 2.3);
    line(ctx, [[8 - rl, -18], [8 + rl, -18]], '#374151', 3);
    line(ctx, [[-6, 17], [24, 17]], '#374151', 2.5);
    line(ctx, [[0, 14], [0, 17]], '#374151', 2);
    line(ctx, [[18, 14], [18, 17]], '#374151', 2);
  });
  flyer('hotairballoon', { label: 'Hot-air balloon', category: 'Vehicles', desc: 'Drifts slowly along its path.', w: 70, h: 100, speed: 60, color: '#ef4444', flap: 0.2 }, (ctx, o, f, moving) => {
    const cols = [o.color, '#facc15', '#3b82f6', '#facc15', o.color];
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.beginPath(); ctx.arc(0, -18, 32, 0, TAU); ctx.clip();
      ctx.fillStyle = cols[i];
      ctx.fillRect(-32 + i * 12.8, -50, 12.8, 70);
      ctx.restore();
    }
    poly(ctx, [[-26, 2], [26, 2], [10, 24], [-10, 24]], cols[1]);
    line(ctx, [[-10, 24], [-8, 36]], '#78350f', 1);
    line(ctx, [[10, 24], [8, 36]], '#78350f', 1);
    box(ctx, -10, 36, 20, 13, 2, '#92400e', '#451a03');
    if (moving) U.glow(ctx, 0, 28, 8 + Math.sin(f * 9) * 2, 'rgba(255,220,120,1)', 'rgba(255,120,20,0)');
  });
  flyer('rocket', {
    label: 'Rocket', category: 'Vehicles', desc: 'Fast, points where it flies; its exhaust lights fuses and rings of fire it passes.', w: 70, h: 24, speed: 300, color: '#f8fafc', rotate: true, flap: 1,
    update(e, sim) {
      if (!e.active || e.done) return;
      const b = e.body.position, h = e.heading, tx = b.x - Math.cos(h) * 40 * e.k, ty = b.y - Math.sin(h) * 40 * e.k;
      sim.emit(tx, ty, 'fire', 3, { dir: h + Math.PI, spread: 0.5, speed: 3, life: 14 });
      if (sim.frame % 2 === 0) sim.emit(tx, ty, 'smoke', 1, { dir: h + Math.PI, spread: 0.6, speed: 1 });
      sim.igniteNear(tx, ty, 24, e);
    },
  }, (ctx, o, f, moving) => {
    box(ctx, -30, -9, 52, 18, 6, o.color, '#6b7280');
    poly(ctx, [[22, -9], [38, 0], [22, 9]], '#ef4444', '#6b7280');
    poly(ctx, [[-30, -9], [-38, -18], [-20, -9]], '#ef4444');
    poly(ctx, [[-30, 9], [-38, 18], [-20, 9]], '#ef4444');
    ell(ctx, 6, 0, 5, 5, '#60a5fa');
    if (moving) U.glow(ctx, -36, 0, 12, 'rgba(255,240,170,1)', 'rgba(255,120,0,0)');
  });
  flyer('ufo', { label: 'UFO', category: 'Vehicles', desc: 'A wobbling flying saucer.', w: 80, h: 30, speed: 180, color: '#9ca3af', flap: 0.25 }, (ctx, o, f, moving) => {
    ctx.save();
    ctx.rotate(Math.sin(f) * 0.08);
    ell(ctx, 0, -6, 15, 12, 'rgba(147,197,253,0.85)');
    ell(ctx, 0, 3, 38, 9, o.color);
    ell(ctx, 0, 6, 24, 4, dark(o.color));
    for (let i = 0; i < 5; i++) ell(ctx, -26 + i * 13, 4, 2.5, 2.5, (Math.floor(f * 3) + i) % 2 ? '#fde047' : '#22c55e');
    ctx.restore();
    if (moving) {
      ctx.fillStyle = 'rgba(190,242,100,0.18)';
      poly(ctx, [[-12, 10], [12, 10], [26, 70], [-26, 70]], 'rgba(190,242,100,0.15)');
    }
  });
  flyer('blimp', { label: 'Blimp', category: 'Vehicles', desc: 'A big slow airship.', w: 140, h: 44, speed: 70, color: '#cbd5e1', flap: 0.6 }, (ctx, o, f) => {
    poly(ctx, [[-56, -4], [-72, -22], [-62, -4]], '#ef4444');
    poly(ctx, [[-56, 4], [-72, 20], [-62, 4]], '#ef4444');
    ell(ctx, 0, -4, 64, 18, o.color);
    ell(ctx, 0, -10, 50, 6, light(o.color, 0.5));
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHAIN', 0, -1);
    box(ctx, -14, 14, 28, 8, 3, '#475569');
    line(ctx, [[-64, 0], [-64 + 3 * Math.cos(f * 5), 0]], '#374151', 2);
  });

  // =================================================================== ANIMALS (walkers)
  walker('dog', { label: 'Dog', category: 'Animals', desc: 'Runs along its path, tail wagging.', w: 50, h: 30, speed: 180, color: '#b45309' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-13, -9, 9, 13], 3, 12, ph * 1.4, mv, dark(c), 3.5);
    ell(ctx, 0, -1, 18, 8, c);
    line(ctx, [[-16, -3], [-24, -12 + Math.sin(f * 6) * 3]], c, 3);
    ell(ctx, 18, -8, 7, 7, c);
    ell(ctx, 25, -6, 5, 3.5, light(c, 0.2));
    ell(ctx, 29, -7, 1.6, 1.4, '#111');
    ell(ctx, 15, -7, 3, 6, dark(c, -0.4), 0.4);
    eye(ctx, 20, -10, 1.6);
  });
  walker('cat', { label: 'Cat', category: 'Animals', desc: 'Pads along its path.', w: 44, h: 26, speed: 140, color: '#6b7280' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-11, -8, 8, 11], 3, 10, ph * 1.4, mv, dark(c), 3);
    ell(ctx, 0, -1, 15, 6.5, c);
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(-26, -6, -22, -18 + Math.sin(f * 3) * 2); ctx.stroke();
    ell(ctx, 16, -7, 6.5, 6, c);
    poly(ctx, [[11, -11], [12, -18], [16, -12]], c);
    poly(ctx, [[17, -12], [21, -18], [21, -10]], c);
    eye(ctx, 18, -8, 1.5);
    line(ctx, [[22, -6], [28, -7]], '#e5e7eb', 0.7);
    line(ctx, [[22, -5], [28, -4]], '#e5e7eb', 0.7);
  });
  walker('horse', { label: 'Horse', category: 'Animals', desc: 'Gallops along its path; strong enough to shove dominoes.', w: 90, h: 60, speed: 230, density: 0.02, color: '#7c2d12' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-24, -19, 19, 24], 2, 28, ph * 1.2, mv, dark(c), 4.5);
    ell(ctx, 0, -6, 30, 13, c);
    line(ctx, [[22, -12], [33, -27]], c, 10);
    ell(ctx, 38, -27, 11, 6, c, 0.35);
    eye(ctx, 37, -30, 1.8);
    line(ctx, [[20, -16], [29, -32]], '#1c1917', 4);
    ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-29, -10); ctx.quadraticCurveTo(-42, -4 + Math.sin(f * 5) * 3, -38, 14); ctx.stroke();
  });
  walker('elephant', { label: 'Elephant', category: 'Animals', desc: 'Huge and slow; pushes almost anything.', w: 110, h: 80, speed: 70, density: 0.05, color: '#9ca3af' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-28, -18, 16, 26], 10, 30, ph * 0.9, mv, dark(c, -0.15), 11);
    ell(ctx, -4, -4, 40, 26, c);
    ell(ctx, 34, -14, 18, 18, c);
    ell(ctx, 28, -14, 11, 16, dark(c, -0.2));
    ctx.strokeStyle = c; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(48, -6); ctx.quadraticCurveTo(58, 10, 54 + Math.sin(f * 2) * 3, 26); ctx.stroke();
    line(ctx, [[44, 2], [52, 6]], '#f8fafc', 3);
    eye(ctx, 40, -18, 2);
    line(ctx, [[-43, -8], [-48, 6]], dark(c), 2);
  });
  walker('cheetah', { label: 'Cheetah', category: 'Animals', desc: 'Very fast runner.', w: 70, h: 30, speed: 340, color: '#f59e0b' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-18, -13, 13, 18], 2, 13, ph * 1.6, mv, dark(c), 3);
    ell(ctx, 0, -2, 24, 7, c);
    for (const [x, y] of [[-14, -4], [-6, -6], [2, -3], [9, -6], [-10, 1], [5, 1], [15, -2]]) ell(ctx, x, y, 1.6, 1.6, '#1c1917');
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-23, -3); ctx.quadraticCurveTo(-34, 0, -38, -8 + Math.sin(f * 4) * 2); ctx.stroke();
    ell(ctx, 27, -6, 6, 5.5, c);
    eye(ctx, 29, -8, 1.5);
    line(ctx, [[29, -6], [30, -2]], '#1c1917', 1);
  });
  walker('mouse', { label: 'Mouse', category: 'Animals', desc: 'Tiny and quick.', w: 22, h: 10, speed: 130, density: 0.002, color: '#9ca3af' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    line(ctx, [[-8, 0], [-16, -2 + Math.sin(ph * 2) * 2], [-22, 1]], '#f9a8d4', 1);
    ell(ctx, 0, 0, 8, 4.5, c);
    ell(ctx, 8, -1, 4, 3.2, c);
    ell(ctx, 6, -4, 2.2, 2.2, '#f9a8d4');
    ell(ctx, 12, -1, 0.9, 0.9, '#111');
    eye(ctx, 9, -2, 0.9);
    if (mv) { line(ctx, [[-4, 4], [-4 + Math.sin(ph * 2) * 2, 5]], dark(c), 1.2); line(ctx, [[4, 4], [4 - Math.sin(ph * 2) * 2, 5]], dark(c), 1.2); }
  });
  walker('turtle', { label: 'Turtle', category: 'Animals', desc: 'Slow and steady.', w: 44, h: 20, speed: 25, color: '#15803d' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-12, -8, 8, 12], 4, 6, ph * 3, mv, '#84cc16', 4);
    ell(ctx, 19, 1, 6, 4.5, '#84cc16');
    eye(ctx, 21, 0, 1.3);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 3, 18, 13, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = dark(c);
    ctx.lineWidth = 1.2;
    for (const x of [-9, 0, 9]) { ctx.beginPath(); ctx.arc(x, -3, 4, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = light(c, 0.3);
    ctx.fillRect(-18, 2, 36, 3);
  });
  walker('penguin', { label: 'Penguin', category: 'Animals', desc: 'Waddles along its path.', w: 26, h: 40, speed: 55, color: '#111827' }, (ctx, o, f, mv, s, ph) => {
    ctx.save();
    ctx.rotate(mv ? Math.sin(ph * 2) * 0.14 : 0);
    ell(ctx, -3, 18, 5, 2, '#f97316');
    ell(ctx, 4, 18, 5, 2, '#f97316');
    ell(ctx, 0, 2, 11, 16, o.color);
    ell(ctx, 2, 4, 7, 12, '#f8fafc');
    ell(ctx, 1, -12, 7, 7, o.color);
    eye(ctx, 3, -13, 1.4);
    poly(ctx, [[7, -12], [12, -10], [7, -9]], '#f97316');
    ell(ctx, -9, 3, 3, 9, dark(o.color, 0.2), 0.3);
    ctx.restore();
  });
  walker('dinosaur', { label: 'Dinosaur', category: 'Animals', desc: 'A stomping T-rex.', w: 90, h: 80, speed: 120, density: 0.03, color: '#4d7c0f' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    for (const [i, x] of [[0, -8], [1, 4]]) {
      const a = mv ? Math.sin(ph + i * Math.PI) * 0.45 : 0;
      line(ctx, [[x, 8], [x + Math.sin(a) * 14, 22], [x + Math.sin(a) * 18 + 4, 38]], i ? c : dark(c), 8);
    }
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-14, -12); ctx.quadraticCurveTo(-40, -10, -46, 6); ctx.quadraticCurveTo(-30, 2, -12, 8); ctx.fill();
    ell(ctx, -2, -4, 22, 16, c, -0.3);
    line(ctx, [[14, -8], [20, -2]], dark(c), 3);
    ell(ctx, 24, -28, 16, 10, c, 0.15);
    poly(ctx, [[14, -22], [40, -22], [36, -16], [16, -17]], dark(c));
    ctx.fillStyle = '#fff';
    for (let x = 18; x < 38; x += 5) poly(ctx, [[x, -22], [x + 2, -19], [x + 4, -22]], '#fff');
    eye(ctx, 26, -32, 2);
  });
  walker('snake', { label: 'Snake', category: 'Animals', desc: 'Slithers along its path.', w: 70, h: 12, speed: 60, density: 0.003, color: '#65a30d' }, (ctx, o, f, mv, s, ph) => {
    const pts = [];
    for (let x = -34; x <= 26; x += 4) pts.push([x, Math.sin(x * 0.18 + ph * 3) * 3]);
    line(ctx, pts, o.color, 7);
    line(ctx, pts, light(o.color, 0.3), 2);
    ell(ctx, 30, Math.sin(26 * 0.18 + ph * 3) * 3, 6, 4.5, o.color);
    eye(ctx, 32, -1 + Math.sin(26 * 0.18 + ph * 3) * 3, 1.2);
    if (Math.sin(f * 3) > 0) line(ctx, [[36, 0], [41, 0], [43, -2]], '#dc2626', 1);
  });
  walker('cow', { label: 'Cow', category: 'Animals', desc: 'Ambles along its path.', w: 90, h: 56, speed: 50, density: 0.03, color: '#f8fafc' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color;
    legs4(ctx, [-26, -20, 18, 24], 6, 22, ph, mv, dark(c, -0.2), 5);
    ell(ctx, -2, -6, 34, 17, c);
    for (const [x, y, rx, ry] of [[-14, -10, 9, 6], [8, -2, 7, 5], [16, -14, 5, 4]]) ell(ctx, x, y, rx, ry, '#1f2937');
    ell(ctx, 10, 11, 5, 3, '#f9a8d4');
    ell(ctx, 36, -14, 10, 9, c);
    ell(ctx, 42, -10, 6, 5, '#f9a8d4');
    line(ctx, [[30, -22], [27, -28]], '#d6d3d1', 2.5);
    line(ctx, [[38, -23], [40, -29]], '#d6d3d1', 2.5);
    eye(ctx, 37, -16, 1.6);
    line(ctx, [[-35, -10], [-40, 4 + Math.sin(f * 4) * 2]], c, 2);
  });

  // =================================================================== PHOTO SPRITES
  // Image-based characters. A sprite sheet is one row of equal frames; footY is the
  // pixel row (within a frame) where the feet are, topY where the head starts.
  CR.sprites = CR.sprites || {};
  CR.loadSprite = function (name, src, opt) {
    const img = new Image();
    const sp = Object.assign({ img, ready: false }, opt);
    img.onload = () => { sp.ready = true; if (CR.onAssetsChanged) CR.onAssetsChanged(); };
    img.src = src; // scan-ok: only the built-in sprite paths below
    CR.sprites[name] = sp;
    return sp;
  };
  /** Draw frame `i` so the figure is `h` tall with its feet on y = bottom (current transform). */
  CR.drawSpriteFrame = function (ctx, sp, i, bottom, h) {
    if (!sp || !sp.ready) return false;
    const k = h / (sp.footY - sp.topY), dw = sp.fw * k, dh = sp.fh * k;
    ctx.drawImage(sp.img, (i % sp.frames) * sp.fw, 0, sp.fw, sp.fh, -dw / 2, bottom - sp.footY * k, dw, dh);
    return true;
  };
  const alienSheet = CR.loadSprite('alien', 'img/alien-sheet.png?v=1', { fw: 148, fh: 220, frames: 10, footY: 214, topY: 18 });
  const alienIcon = CR.loadSprite('alien-icon', 'img/alien-icon.png?v=1', { fw: 64, fh: 64, frames: 1, footY: 62, topY: 2 });
  walker('alien', {
    label: 'Alien', category: 'People', w: 30, h: 60, speed: 100, color: '#a3e635', flap: 0.2,
    desc: 'A little green alien (from your photo) that walks along its path: 8-frame walk, arms up when it climbs.',
  }, (ctx, o, f, moving, s, ph) => {
    const e = s.e;
    let frame = 0;
    if (moving) {
      frame = 1 + ((Math.floor((ph / (2 * Math.PI)) * 8) % 8) + 8) % 8;
      if (e && e.body.velocity.y < -0.5) frame = 9; // climbing / rising: arms up
    }
    if (!CR.drawSpriteFrame(ctx, alienSheet, frame, 30, 60)) {
      // image not loaded yet: simple stand-in
      ell(ctx, 0, -18, 9, 11, o.color);
      box(ctx, -7, -8, 14, 26, 6, o.color);
      ell(ctx, -4, -18, 2.5, 3.5, '#b91c1c');
      ell(ctx, 4, -18, 2.5, 3.5, '#b91c1c');
    }
  });
  CR.types.alien.icon = function (g) {
    if (alienIcon.ready) g.drawImage(alienIcon.img, -23, -23, 46, 46);
  };

  // =================================================================== ANIMALS (flyers)
  const wings =(ctx, f, span, col, y = -2) => {
    const lift = Math.sin(f);
    poly(ctx, [[-6, y], [2, y - span * lift], [10, y]], col);
  };
  flyer('bird', { label: 'Bird', category: 'Animals', desc: 'Flaps along its flight path.', w: 40, h: 20, speed: 200, color: '#2563eb', flap: 0.45 }, (ctx, o, f) => {
    poly(ctx, [[-12, 0], [-20, -4], [-20, 4]], dark(o.color));
    ell(ctx, 0, 0, 11, 6, o.color);
    ell(ctx, 3, 3, 7, 3, '#fde68a');
    ell(ctx, 10, -3, 5, 5, o.color);
    poly(ctx, [[14, -4], [20, -2], [14, -1]], '#f59e0b');
    eye(ctx, 11, -4, 1.3);
    wings(ctx, f, 14, light(o.color, 0.2));
  });
  flyer('bee', { label: 'Bee', category: 'Animals', desc: 'Buzzes along its flight path.', w: 24, h: 16, speed: 120, color: '#facc15', flap: 1.6, idleFlap: 1.2 }, (ctx, o, f) => {
    const wl = 7 * Math.abs(Math.cos(f));
    ell(ctx, -2, -7, 5, wl, 'rgba(219,234,254,0.8)');
    ell(ctx, 3, -7, 4, wl * 0.8, 'rgba(219,234,254,0.8)');
    ell(ctx, 0, 0, 10, 6, o.color);
    ctx.fillStyle = '#111';
    for (const x of [-5, 0, 5]) ctx.fillRect(x - 1, -5.5, 2.4, 11);
    ell(ctx, 10, -1, 4, 4, '#111');
    poly(ctx, [[-10, 0], [-14, 0], [-10, 2]], '#111');
  });
  flyer('bat', { label: 'Bat', category: 'Animals', desc: 'Flits along its flight path.', w: 40, h: 18, speed: 170, color: '#3f3f46', flap: 0.7 }, (ctx, o, f) => {
    const l = Math.sin(f) * 10;
    poly(ctx, [[0, -2], [-8, -6 - l], [-16, -2 - l], [-20, 2 - l * 0.6], [-12, 0], [-8, 3], [0, 2]], o.color);
    poly(ctx, [[0, -2], [8, -6 - l], [16, -2 - l], [20, 2 - l * 0.6], [12, 0], [8, 3], [0, 2]], o.color);
    ell(ctx, 0, 0, 5, 6, dark(o.color, -0.2));
    poly(ctx, [[-3, -5], [-2, -10], [0, -5]], o.color);
    poly(ctx, [[1, -5], [3, -10], [4, -5]], o.color);
    ell(ctx, 2, -2, 1, 1, '#fde047');
  });
  flyer('butterfly', { label: 'Butterfly', category: 'Animals', desc: 'Flutters along its flight path.', w: 30, h: 24, speed: 80, color: '#f472b6', flap: 0.5, idleFlap: 0.2 }, (ctx, o, f) => {
    const k = 0.25 + 0.75 * Math.abs(Math.cos(f));
    ctx.save();
    ctx.scale(1, k);
    ell(ctx, -6, -6, 8, 9, o.color);
    ell(ctx, 6, -6, 8, 9, light(o.color, 0.15));
    ell(ctx, -5, 7, 6, 6, '#a78bfa');
    ell(ctx, 5, 7, 6, 6, '#a78bfa');
    ctx.restore();
    line(ctx, [[0, -9], [0, 10]], '#1f2937', 2.5);
    line(ctx, [[0, -9], [4, -15]], '#1f2937', 0.8);
  });
  flyer('eagle', { label: 'Eagle', category: 'Animals', desc: 'Soars along its flight path on broad wings.', w: 70, h: 26, speed: 230, color: '#78350f', flap: 0.25, density: 0.02 }, (ctx, o, f) => {
    poly(ctx, [[-22, 0], [-34, -6], [-34, 6]], '#f8fafc');
    ell(ctx, 0, 0, 22, 8, o.color);
    ell(ctx, 22, -4, 7, 6, '#f8fafc');
    poly(ctx, [[27, -5], [34, -2], [28, 1]], '#facc15');
    eye(ctx, 23, -5, 1.4);
    const l = Math.sin(f) * 22;
    poly(ctx, [[-10, -3], [-4, -3 - l], [22, -6 - l * 0.9], [12, -3]], dark(o.color, -0.15));
  });

  // =================================================================== ANIMALS (hoppers)
  hopper('frog', { label: 'Frog', desc: 'Hops along when triggered.', w: 34, h: 22, vy: 8, vx: 4, color: '#22c55e' }, (ctx, o, air) => {
    const c = o.color;
    if (air) line(ctx, [[-10, 4], [-22, 10]], dark(c), 5);
    else ell(ctx, -9, 6, 9, 5, dark(c));
    ell(ctx, 0, 0, 15, 9, c);
    ell(ctx, 1, 4, 10, 4, '#bbf7d0');
    ell(ctx, 8, -8, 5, 5, c);
    ell(ctx, 0, -8, 5, 5, c);
    eye(ctx, 9, -9, 2.2);
    eye(ctx, 1, -9, 2.2);
    line(ctx, [[12, 7], [16, 11]], dark(c), 3);
  });
  hopper('kangaroo', { label: 'Kangaroo', desc: 'Big bounding hops.', w: 50, h: 70, vy: 11, vx: 5, color: '#c2410c', density: 0.005 }, (ctx, o, air) => {
    const c = o.color;
    ctx.strokeStyle = c; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-10, 14); ctx.quadraticCurveTo(-26, 26, -30, air ? 18 : 34); ctx.stroke();
    if (air) line(ctx, [[0, 18], [-12, 30], [-2, 34]], dark(c), 7);
    else line(ctx, [[0, 18], [8, 28], [16, 34]], dark(c), 7);
    ell(ctx, 0, 6, 13, 20, c, 0.2);
    ell(ctx, 4, 12, 6, 7, '#fdba74');
    line(ctx, [[10, -6], [16, 2]], dark(c), 3);
    ell(ctx, 8, -20, 8, 7, c, 0.3);
    ell(ctx, 16, -18, 5, 4, c);
    ell(ctx, 2, -30, 2.5, 6, c, -0.3);
    ell(ctx, 7, -31, 2.5, 6, c, 0.1);
    eye(ctx, 10, -22, 1.6);
  });
  hopper('rabbit', { label: 'Rabbit', desc: 'Quick little hops.', w: 30, h: 30, vy: 7, vx: 3, color: '#e7e5e4' }, (ctx, o, air) => {
    const c = o.color;
    ell(ctx, -13, 4, 4, 4, '#fff');
    ell(ctx, -6, air ? 8 : 10, 7, 4, dark(c, -0.15));
    ell(ctx, -2, 4, 12, 9, c);
    ell(ctx, 9, -5, 6, 6, c);
    ell(ctx, 6, -15, 2.5, 8, c, -0.2);
    ell(ctx, 11, -15, 2.5, 8, c, 0.15);
    ell(ctx, 6, -15, 1.2, 6, '#fbcfe8', -0.2);
    eye(ctx, 11, -6, 1.4);
    ell(ctx, 15, -4, 1.2, 1, '#f472b6');
  });

  // =================================================================== BOUNCERS (balls)
  ball('superball', { label: 'Super ball', desc: 'A small rubber ball that bounces almost forever.', r: 10, color: '#a855f7', density: 0.003, rest: 0.92 }, (ctx, o, r) => {
    ctx.fillStyle = o.color; ctx.fillRect(-r, -r, r * 2, r * 2);
    line(ctx, [[-r, -r * 0.2], [r, r * 0.3]], '#facc15', r * 0.35);
  });
  ball('beachball', { label: 'Beach ball', desc: 'Big, light and floaty.', r: 30, color: '#ef4444', density: 0.0004, rest: 0.8, air: 0.012 }, (ctx, o, r) => {
    const cols = [o.color, '#f8fafc', '#3b82f6', '#f8fafc', '#facc15', '#f8fafc'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, (i * TAU) / 6, ((i + 1) * TAU) / 6); ctx.fill();
    }
    ell(ctx, 0, 0, r * 0.18, r * 0.18, '#f8fafc');
  });
  ball('basketball', { label: 'Basketball', desc: 'A bouncy basketball.', r: 20, color: '#ea580c', density: 0.0012, rest: 0.78 }, (ctx, o, r) => {
    ctx.fillStyle = o.color; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 1.1, 0, r * 0.8, -1, 1); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.1, 0, r * 0.8, Math.PI - 1, Math.PI + 1); ctx.stroke();
  });
  ball('tennisball', { label: 'Tennis ball', desc: 'A fuzzy, lively little ball.', r: 9, color: '#d9f99d', density: 0.002, rest: 0.72 }, (ctx, o, r) => {
    ctx.fillStyle = o.color; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-r, 0, r * 0.75, -1.2, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(r, 0, r * 0.75, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke();
  });

  // =================================================================== BOUNCERS (static & special)
  const PBOUNCE = num('bounce', 'Bounce', 0.05, 0, 3, '1 = same speed back, more = livelier');
  const PMIN = num('minBounce', 'Minimum bounce', 0.5, 0, 60, 'pixels per frame');

  CR.defineType('springpad', {
    label: 'Spring pad',
    category: 'Bouncers',
    description: 'Launches anything that lands on it at a fixed speed, whatever speed it arrived at.',
    iconSize: { w: 56, h: 30 },
    defaults: () => ({ w: 50, angle: 0, launch: 14, color: '#ef4444' }),
    props: [PX(), PY(), PANGLE, num('w', 'Width', 1, 16, 300), num('launch', 'Launch speed', 0.5, 0, 80, 'pixels per frame'), PCOLOR('Top')],
    rot: { offset: -Math.PI / 2, dist: () => 34 },
    box: (o, s) => ({ x: s.x - Math.sin(s.angle) * 6, y: s.y + Math.cos(s.angle) * 6, w: o.w + 4, h: 26, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, 8, { isStatic: true, angle: o.angle * D2R, friction: 0.3 });
      e.squash = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const a = e.body.angle, n = { x: Math.sin(a), y: -Math.cos(a) };
      if (-(other.velocity.x * n.x + other.velocity.y * n.y) < -0.5) return; // approaching from below
      e.squash = 1;
      sim.later(() => {
        const v = other.velocity, vn = v.x * n.x + v.y * n.y, out = e.o.launch;
        M().Body.setVelocity(other, { x: v.x + (out - vn) * n.x, y: v.y + (out - vn) * n.y });
      });
    },
    update(e) { e.squash *= 0.8; },
    draw(ctx, o, s) {
      const q = s.e ? s.e.squash : 0, w = o.w, top = -4 + q * 6;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      box(ctx, -w / 2, 14, w, 5, 2, '#4b5563');
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      for (const x of [-w * 0.28, w * 0.28]) {
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) ctx.lineTo(x + (k % 2 ? 5 : -5), 14 - (k * (14 - top)) / 6);
        ctx.stroke();
      }
      box(ctx, -w / 2, top - 4, w, 6, 2, o.color, dark(o.color, -0.5));
      ctx.restore();
    },
  });

  CR.defineType('jelly', {
    label: 'Jelly block',
    category: 'Bouncers',
    description: 'A wobbly block that bounces things off any side.',
    iconSize: { w: 120, h: 50 },
    defaults: () => ({ w: 120, h: 40, angle: 0, bounce: 1.0, minBounce: 4, color: '#22c55e' }),
    props: [PX(), PY(), PANGLE, num('w', 'Width', 1, 10, 1000), num('h', 'Height', 1, 10, 600), PBOUNCE, PMIN, PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: (o) => o.h / 2 + 20 },
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { isStatic: true, angle: o.angle * D2R, friction: 0.2, chamfer: { radius: Math.min(10, o.h / 3) } });
      e.wob = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const n = boxNormal(e.body, e.o.w, e.o.h, other);
      const vin = bounceAlong(sim, other, n.x, n.y, e.o.bounce, e.o.minBounce);
      if (vin) e.wob = Math.min(1, vin / 8);
    },
    update(e) { e.wob *= 0.9; e.t = (e.t || 0) + 1; },
    draw(ctx, o, s) {
      const e = s.e, k = e ? e.wob * Math.sin(e.t * 0.9) * 0.08 : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.scale(1 + k, 1 - k);
      box(ctx, -o.w / 2, -o.h / 2, o.w, o.h, Math.min(10, o.h / 3), o.color + 'cc', dark(o.color, -0.4));
      ell(ctx, -o.w * 0.25, -o.h * 0.2, o.w * 0.15, o.h * 0.12, 'rgba(255,255,255,0.45)');
      ctx.restore();
    },
  });

  CR.defineType('rubberrail', {
    label: 'Rubber rail',
    category: 'Bouncers',
    description: 'A thin springy wall that kicks things back off either side. Drag the end handles to resize.',
    iconSize: { w: 120, h: 30 },
    defaults: () => ({ w: 160, angle: 0, bounce: 1.2, minBounce: 6, color: '#f43f5e' }),
    props: [PX(), PY(), PANGLE, num('w', 'Length', 1, 20, 2000), PBOUNCE, PMIN, PCOLOR()],
    rot: { offset: -Math.PI / 2, dist: () => 24 },
    handles: CR.types.ramp.handles,
    dragHandle: CR.types.ramp.dragHandle,
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: 10, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, 10, { isStatic: true, angle: o.angle * D2R, chamfer: { radius: 4 } });
      e.flash = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const n = boxNormal(e.body, e.o.w, 10, other);
      if (bounceAlong(sim, other, n.x, n.y, e.o.bounce, e.o.minBounce)) e.flash = 1;
    },
    update(e) { e.flash *= 0.85; },
    draw(ctx, o, s) {
      const f = s.e ? s.e.flash : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      box(ctx, -o.w / 2, -5, o.w, 10, 5, f > 0.3 ? light(o.color, 0.4) : o.color, dark(o.color, -0.5));
      ctx.fillStyle = '#e5e7eb';
      for (const x of [-o.w / 2 + 6, o.w / 2 - 6]) { ctx.beginPath(); ctx.arc(x, 0, 2.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
  });

  CR.defineType('bouncycastle', {
    label: 'Bouncy castle',
    category: 'Bouncers',
    description: 'A big inflatable: whatever lands on the floor of it gets bounced high.',
    iconSize: { w: 200, h: 110 },
    defaults: () => ({ w: 200, bounce: 1.1, minBounce: 9, color: '#ec4899' }),
    props: [PX(), PY(), num('w', 'Width', 1, 80, 1000), PBOUNCE, PMIN, PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y - 30, w: o.w + 10, h: 100, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, 16, { isStatic: true, friction: 0.4 });
      e.dip = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const vin = bounceAlong(sim, other, 0, -1, e.o.bounce, e.o.minBounce);
      if (vin) e.dip = Math.min(1, vin / 10);
    },
    update(e) { e.dip *= 0.85; },
    draw(ctx, o, s) {
      const w = o.w, d = s.e ? s.e.dip * 6 : 0, c = o.color;
      ctx.save();
      ctx.translate(s.x, s.y);
      for (const x of [-w / 2, w / 2 - 22]) {
        box(ctx, x, -78, 22, 80, 8, light(c, 0.15), dark(c, -0.4));
        poly(ctx, [[x - 2, -78], [x + 11, -96], [x + 24, -78]], '#facc15', dark(c, -0.4));
      }
      box(ctx, -w / 2 + 18, -46, w - 36, 40, 10, light(c, 0.35), dark(c, -0.3));
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = -w / 2 + 30; x < w / 2 - 30; x += 22) ctx.fillRect(x, -42, 8, 30);
      box(ctx, -w / 2, -8 + d, w, 16, 8, c, dark(c, -0.4));
      ctx.restore();
    },
  });

  CR.defineType('mushroom', {
    label: 'Bouncy mushroom',
    category: 'Bouncers',
    description: 'A springy toadstool cap that bounces things away from its centre.',
    iconSize: { w: 70, h: 70 },
    defaults: () => ({ r: 30, bounce: 1.15, minBounce: 7, color: '#dc2626' }),
    props: [PX(), PY(), num('r', 'Cap radius', 1, 8, 300), PBOUNCE, PMIN, PCOLOR('Cap')],
    box: (o, s) => ({ x: s.x, y: s.y + o.r * 0.3, w: o.r * 2, h: o.r * 2.6, angle: 0 }),
    build(e) {
      e.body = M().Bodies.circle(e.o.x, e.o.y, e.o.r, { isStatic: true });
      e.pulse = 0;
    },
    onHit(e, other, sim) {
      if (other.isStatic) return;
      const dx = other.position.x - e.o.x, dy = other.position.y - e.o.y, d = Math.hypot(dx, dy) || 1;
      if (bounceAlong(sim, other, dx / d, dy / d, e.o.bounce, e.o.minBounce)) e.pulse = 1;
    },
    update(e) { e.pulse *= 0.85; },
    draw(ctx, o, s) {
      const r = o.r * (1 + (s.e ? s.e.pulse * 0.08 : 0));
      ctx.save();
      ctx.translate(s.x, s.y);
      box(ctx, -r * 0.3, 0, r * 0.6, r * 1.3, r * 0.15, '#fef3c7', '#d6d3d1');
      ctx.fillStyle = o.color;
      ctx.beginPath(); ctx.arc(0, r * 0.15, r, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      for (const [x, y, k] of [[-0.45, -0.35, 0.16], [0.2, -0.6, 0.13], [0.55, -0.15, 0.12], [-0.05, -0.1, 0.1]]) {
        ctx.beginPath(); ctx.arc(x * r, y * r, k * r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  });

  CR.defineType('balloon', {
    label: 'Balloon',
    category: 'Bouncers',
    description: 'Floats upward and bumps off things. Pops if fire, a match or a burning object reaches it.',
    iconSize: { w: 40, h: 70 },
    ignitable: true,
    defaults: () => ({ r: 22, lift: 1.4, trigger: 'fire', color: '#ef4444' }),
    props: [PX(), PY(), num('r', 'Radius', 1, 6, 200), num('lift', 'Lift', 0.1, 0, 10, '1 = floats in place, more = rises'),
      { key: 'trigger', label: 'Pops', type: 'select', options: [['fire', 'When fire reaches it'], ['touch', 'When touched'], ['none', 'Never']] },
      PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y + o.r * 0.6, w: o.r * 2, h: o.r * 3.2, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.circle(o.x, o.y, o.r, { density: 0.0004, restitution: 0.6, frictionAir: 0.03 });
    },
    activate(e, sim) { // pop!
      e.done = true;
      const b = e.body;
      sim.emit(b.position.x, b.position.y, 'flash', 10, { speed: 3 });
      sim.emit(b.position.x, b.position.y, 'spark', 14, { speed: 3 });
      M().Composite.remove(sim.world, b);
    },
    update(e, sim) {
      if (e.done) return;
      const b = e.body, g = sim.engine.gravity;
      b.force.y -= b.mass * g.y * g.scale * e.o.lift;
    },
    draw(ctx, o, s) {
      if (s.e && s.e.done) return;
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, r); ctx.quadraticCurveTo(-6, r * 1.6, 2, r * 2.2); ctx.stroke();
      ell(ctx, 0, 0, r * 0.88, r, o.color);
      poly(ctx, [[-3, r * 0.95], [3, r * 0.95], [0, r * 1.12]], dark(o.color));
      ell(ctx, -r * 0.35, -r * 0.4, r * 0.18, r * 0.3, 'rgba(255,255,255,0.5)', -0.4);
      ctx.restore();
    },
  });

  CR.defineType('fan', {
    label: 'Fan',
    category: 'Bouncers',
    description: 'Blows anything in front of it away; stronger up close. Point it with the rotate handle.',
    iconSize: { w: 50, h: 50 },
    defaults: () => ({ angle: 0, range: 300, strength: 1, trigger: 'start', delay: 0, color: '#64748b' }),
    props: [PX(), PY(), { key: 'angle', label: 'Blow direction (°)', type: 'number', step: 1, hint: '0 = right, −90 = up' },
      num('range', 'Range (px)', 10, 20, 2000), num('strength', 'Strength', 0.1, 0, 20), PTRIG, PDELAY, PCOLOR()],
    rot: { offset: 0, dist: () => 40 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 44, h: 54, angle: o.angle * D2R }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, 20, 50, { isStatic: true, angle: o.angle * D2R });
      e.spin = 0;
    },
    update(e, sim) {
      if (!e.active) return;
      const o = e.o, a = o.angle * D2R, c = Math.cos(a), s = Math.sin(a);
      e.spin += 0.6;
      for (const b of M().Composite.allBodies(sim.world)) {
        if (b.isStatic || b.isSensor) continue;
        const dx = b.position.x - o.x, dy = b.position.y - o.y;
        const along = dx * c + dy * s, across = -dx * s + dy * c;
        if (along < 0 || along > o.range || Math.abs(across) > 30 + along * 0.25) continue;
        // up to ~1.5x gravity right in front of the blades, fading to nothing at the edge of its range
        const k = 0.0015 * o.strength * (1 - along / o.range);
        b.force.x += c * b.mass * k;
        b.force.y += s * b.mass * k;
      }
      if (sim.frame % 4 === 0) sim.emit(o.x + c * 24 * e.k, o.y + s * 24 * e.k, 'dust', 1, { dir: a, spread: 0.5, speed: 4, life: 20 });
    },
    draw(ctx, o, s) {
      const e = s.e;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(o.angle * D2R);
      box(ctx, -18, -6, 10, 12, 2, '#475569');
      line(ctx, [[-14, 6], [-14, 22]], '#475569', 4);
      line(ctx, [[-22, 24], [-6, 24]], '#475569', 4);
      ell(ctx, -2, 0, 6, 25, o.color);
      ctx.fillStyle = '#e2e8f0';
      const sp = e ? e.spin || 0 : 0.4;
      for (let i = 0; i < 3; i++) {
        const y = Math.sin(sp + (i * TAU) / 3) * 18;
        ell(ctx, 0, y / 2, 3, 9, '#e2e8f0');
      }
      ctx.strokeStyle = dark(o.color);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-2, 0, 6, 25, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    },
  });

  // shared with the themed object packs (objects-themes.js)
  CR.pack = { vehicle, flyer, walker, hopper, ball, poly, ell, box, eye, line, legs4, wheel, dark, light };

  // =================================================================== LAYERS: gateway
  // A doorway to another layer. Anything that arrives (its centre enters the doorway) sets it
  // off; whatever was already inside when the run started doesn't count. After `wait` seconds
  // the app shows the target layer and runs it (see sim.requestLayer / app.js).
  function archPath(ctx, w, h) {
    const r = Math.min(w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.arc(0, -h / 2 + r, w / 2, Math.PI, TAU);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
  }
  CR.defineType('gateway', {
    label: 'Gateway',
    category: 'Layers',
    description: 'A doorway to another layer. When something arrives (anything already inside at the start doesn\'t count), it switches to that layer after the set time and runs it.',
    iconSize: { w: 70, h: 100 },
    noScale: true, // has its own width and height
    defaults: () => ({ w: 70, h: 100, target: '', wait: 1, arrival: false, color: '#7c3aed' }),
    props: [PX(), PY(), num('w', 'Width', 1, 10, 2000), num('h', 'Height', 1, 10, 2000),
      { key: 'target', label: 'Leads to', type: 'layerref', hint: 'the layer to show and run' },
      num('wait', 'Switch after (s)', 0.1, 0, 60, 'seconds after something arrives'),
      { key: 'arrival', label: 'Arrival only', type: 'checkbox', hint: 'just marks where things come in from another layer; never switches' },
      PCOLOR()],
    box: (o, s) => ({ x: s.x, y: s.y, w: o.w, h: o.h, angle: 0 }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, o.w, o.h, { isStatic: true, isSensor: true });
      e.start = null;
      e.arrived = -1;
    },
    post(e, sim) {
      if (e.arrived >= 0 || e.o.arrival) return;
      const o = e.o, inside = new Set();
      for (const b of M().Composite.allBodies(sim.world)) {
        if (b.isStatic) continue;
        if (Math.abs(b.position.x - o.x) <= o.w / 2 && Math.abs(b.position.y - o.y) <= o.h / 2) inside.add(b);
      }
      if (!e.start) { e.start = inside; return; } // first step: these were here from the beginning
      for (const b of inside) {
        if (e.start.has(b)) continue;
        e.arrived = sim.t;
        sim.requestLayer(o.target || '', sim.t + Math.max(0, +o.wait || 0));
        sim.emit(o.x, o.y, 'flash', 18, { speed: 3 });
        sim.emit(o.x, o.y, 'spark', 24, { speed: 3 });
        return;
      }
    },
    draw(ctx, o, s) {
      const e = s.e, t = s.t || 0, w = o.w, h = o.h;
      const on = e && e.arrived >= 0, k = on ? Math.min(1, (t - e.arrived) / Math.max(0.05, o.wait || 0)) : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      archPath(ctx, w, h);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(w, h) * 0.6);
      g.addColorStop(0, on ? 'rgba(255,255,255,0.95)' : light(o.color, 0.6));
      g.addColorStop(1, o.color);
      ctx.fillStyle = g;
      ctx.globalAlpha = on ? 0.85 + 0.15 * k : 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
      // swirl
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      const spin = t * (on ? 9 : 2);
      for (let i = 0; i < 3; i++) {
        const r = Math.min(w, h) * (0.15 + i * 0.13);
        ctx.beginPath();
        ctx.arc(0, h * 0.08, r, spin + i * 2.1, spin + i * 2.1 + 3.6);
        ctx.stroke();
      }
      ctx.restore();
      archPath(ctx, w, h);
      ctx.strokeStyle = dark(o.color, -0.45);
      ctx.lineWidth = 4;
      ctx.stroke();
      if (on) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -h / 2 - 14, 8, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }
      const name = o.arrival ? '' : CR.layerLabel ? CR.layerLabel(o.target) : '';
      if (name && !(s.icon)) {
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = dark(o.color, -0.5);
        ctx.fillText('→ ' + name, 0, h / 2 + 16);
      }
      ctx.restore();
    },
    icon(g) {
      this.draw(g, Object.assign(this.defaults(), { x: 0, y: 0, w: 26, h: 38 }), { x: 0, y: 0, e: null, t: 0, icon: true });
    },
  });
})();
