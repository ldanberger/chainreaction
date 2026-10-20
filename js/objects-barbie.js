/*
 * Object pack: the pink "Barbie" group -- fashion dolls, a pink convertible, a dream house,
 * pony, lawn flamingo, heart balloon, handbag and high heel.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R, U = CR.draw;
  const { PX, PY, PANGLE, PCOLOR, num } = CR.P;
  const { vehicle, walker, poly, ell, box, eye, line, legs4, wheel, dark, light } = CR.pack;
  const M = () => window.Matter;
  const TAU = Math.PI * 2;
  const CAT = 'Barbie';

  // =================================================================== dolls
  // One figure, 66px tall (feet at +33). `look` picks hair, outfit and extras.
  function doll(ctx, o, mv, ph, look) {
    const skin = '#fcd9c4', hair = look.hair, sw = mv ? Math.sin(ph * (look.skates ? 0.8 : 1.3)) : 0;
    const legs = (shoe) => {
      for (const k of [1, -1]) {
        const a = sw * 0.45 * k;
        line(ctx, [[k * 2.5, 4], [k * 2.5 + Math.sin(a) * 11, 17], [k * 2.5 + Math.sin(a) * 11 + 1, 29]], k > 0 ? skin : dark(skin, -0.1), 3.2);
        shoe(k * 2.5 + Math.sin(a) * 11 + 1, 30);
      }
    };
    if (look.gown) { // a full-length ball gown hides the legs
      poly(ctx, [[-5, -10], [5, -10], [18, 32], [-18, 32]], o.color, dark(o.color, -0.35), 1);
      ctx.strokeStyle = light(o.color, 0.35);
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-18 + i * 9, 32); ctx.lineTo(-4 + i * 2, -6); ctx.stroke(); }
    } else if (look.boy) {
      legs((x, y) => ell(ctx, x + 1, y, 4, 2, '#1f2937'));
      poly(ctx, [[-6, 2], [6, 2], [7, 18], [1, 18], [0, 8], [-1, 18], [-7, 18]], '#60a5fa'); // shorts
      poly(ctx, [[-7, -12], [7, -12], [7, 4], [-7, 4]], o.color, dark(o.color, -0.35), 1);
    } else {
      legs(look.skates
        ? (x, y) => { box(ctx, x - 4, y - 3, 9, 4, 1.5, '#f472b6'); ell(ctx, x - 2, y + 2.5, 1.8, 1.8, '#fde047'); ell(ctx, x + 3, y + 2.5, 1.8, 1.8, '#fde047'); }
        : (x, y) => poly(ctx, [[x - 3, y], [x + 4, y + 1], [x + 4, y - 2], [x - 2, y - 3]], '#db2777'));
      poly(ctx, [[-5, -12], [5, -12], [12, 6], [-12, 6]], o.color, dark(o.color, -0.35), 1); // party dress
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[-4, -2], [3, 0], [-7, 3], [7, 3], [0, -7]]) { ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill(); }
    }
    // arms
    line(ctx, [[-5, -10], [-8 - sw * 5, 0], [-7 - sw * 5, 6]], skin, 2.6);
    line(ctx, [[5, -10], [8 + sw * 5, 0], [7 + sw * 5, 6]], skin, 2.6);
    // head and hair
    if (!look.boy) poly(ctx, [[-8, -24], [8, -24], [9, -2], [-9, -2]], hair); // long hair behind
    ell(ctx, 0, -14, 2, 3, skin);
    ell(ctx, 0, -22, 6.5, 7.5, skin);
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(0, -25, 7.5, 5.5, 0, Math.PI, TAU); ctx.fill();
    if (look.ponytail) ell(ctx, -9, -24, 3, 8, hair, 0.5);
    eye(ctx, 2.5, -23, 1.3);
    eye(ctx, -2.5, -23, 1.3);
    line(ctx, [[-2, -18.5], [2, -18.5]], '#e11d48', 1.2);
    if (look.tiara) poly(ctx, [[-5, -29], [-3, -34], [0, -30], [3, -34], [5, -29]], '#fde047', '#ca8a04', 0.8);
    if (look.bow) { ell(ctx, -6, -30, 3, 2, '#ec4899', 0.4); ell(ctx, -2, -31, 3, 2, '#ec4899', -0.4); }
  }
  const dollType = (name, d, look) => walker(name, Object.assign({ category: CAT, w: 26, h: 66 }, d),
    (ctx, o, f, mv, s, ph) => doll(ctx, o, mv, ph, look));
  dollType('fashiondoll', { label: 'Fashion doll', desc: 'A doll in a sparkly pink party dress, walking (or wandering) her path.', speed: 80, color: '#ec4899' },
    { hair: '#fde047', bow: true });
  dollType('gowndoll', { label: 'Ball-gown doll', desc: 'A doll in a long ball gown and tiara, gliding along her path.', speed: 60, color: '#f9a8d4' },
    { hair: '#a16207', gown: true, tiara: true });
  dollType('skaterdoll', { label: 'Roller-skate doll', desc: 'A doll on pink roller skates — quick along her path.', speed: 160, color: '#c026d3' },
    { hair: '#fde047', skates: true, ponytail: true });
  dollType('boydoll', { label: 'Doll (boy)', desc: 'A boy doll in a pastel shirt, walking (or wandering) his path.', speed: 80, color: '#f0abfc' },
    { hair: '#facc15', boy: true });

  walker('pony', { label: 'Pink pony', category: CAT, desc: 'A pink pony with a rainbow mane, trotting along its path.', w: 70, h: 60, speed: 130, density: 0.01, color: '#f9a8d4' }, (ctx, o, f, mv, s, ph) => {
    const c = o.color, mane = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
    legs4(ctx, [-18, -13, 13, 18], 6, 20, ph * 1.3, mv, dark(c, -0.15), 5);
    mane.forEach((col, i) => line(ctx, [[-22, -4 + i * 1.5], [-32, 4 + i * 3 + Math.sin(f * 4 + i) * 2]], col, 2.5)); // tail
    ell(ctx, 0, -2, 22, 12, c);
    line(ctx, [[16, -6], [24, -22]], c, 11);
    ell(ctx, 28, -24, 10, 7, c, 0.4);
    mane.forEach((col, i) => line(ctx, [[14 + i * 1.5, -12 - i * 2.4], [8 + i * 1.5, -6 - i * 2]], col, 2.5));
    poly(ctx, [[22, -30], [24, -38], [27, -30]], c);
    eye(ctx, 29, -26, 1.6);
    ell(ctx, 35, -21, 1.5, 1.2, dark(c, -0.4));
  });

  // =================================================================== pink convertible
  vehicle('pinkcar', { label: 'Pink convertible', desc: 'A shiny pink convertible with heart hub caps.', w: 110, h: 40, speed: 8, accel: 0.25, color: '#ec4899' }, (ctx, o, rot) => {
    const w = o.w, h = o.h, r = h * 0.28, wy = h / 2 - r;
    poly(ctx, [[-w / 2, wy + r * 0.2], [-w / 2, -h * 0.1], [-w * 0.32, -h * 0.18], [w * 0.1, -h * 0.18], [w * 0.22, -h * 0.4],
      [w * 0.27, -h * 0.4], [w * 0.24, -h * 0.15], [w / 2, -h * 0.06], [w / 2, wy + r * 0.2]], o.color, dark(o.color, -0.45));
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-w / 2 + 4, -h * 0.06, w - 8, 3);
    poly(ctx, [[-w * 0.18, -h * 0.18], [-w * 0.1, -h * 0.42], [-w * 0.02, -h * 0.42], [-w * 0.05, -h * 0.18]], '#f9a8d4'); // seat
    for (const x of [-w * 0.3, w * 0.3]) {
      wheel(ctx, x, wy, r, rot, '#1f2937', '#fbcfe8');
      ctx.fillStyle = '#ec4899';
      ctx.beginPath(); ctx.arc(x - 1.5, wy - 1, 1.8, 0, TAU); ctx.arc(x + 1.5, wy - 1, 1.8, 0, TAU); ctx.moveTo(x - 3.2, wy - 0.5); ctx.lineTo(x, wy + 3); ctx.lineTo(x + 3.2, wy - 0.5); ctx.fill();
    }
  });
  CR.types.pinkcar.category = CAT;

  // =================================================================== dream house (scenery)
  CR.defineType('dreamhouse', {
    label: 'Dream house',
    category: CAT,
    description: 'A big pink dream house (scenery: things pass in front of it). Put it near the back with To back.',
    iconSize: { w: 300, h: 280 },
    noScale: true, // has its own size
    defaults: () => ({ w: 320, h: 280, color: '#f9a8d4', roof: '#db2777' }),
    props: [PX('Centre X'), PY('Ground Y'), num('w', 'Width', 5, 80, 3000), num('h', 'Height', 5, 80, 3000), PCOLOR('Walls'), PCOLOR('Roof', 'roof')],
    box: (o) => ({ x: o.x, y: o.y - o.h / 2, w: o.w + 20, h: o.h, angle: 0 }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y - 5, 10, 10, { isStatic: true, isSensor: true }); },
    draw(ctx, o) {
      const w = o.w, h = o.h, wall = h * 0.7;
      ctx.save();
      ctx.translate(o.x, o.y);
      box(ctx, -w / 2, -wall, w, wall, 4, o.color, dark(o.color, -0.35));
      poly(ctx, [[-w / 2 - 14, -wall], [0, -h], [w / 2 + 14, -wall]], o.roof, dark(o.roof, -0.4));
      box(ctx, w * 0.2, -h * 0.98, w * 0.08, h * 0.2, 2, o.roof); // chimney
      ell(ctx, 0, -wall - h * 0.13, w * 0.07, w * 0.07, '#fff'); // round attic window
      ell(ctx, 0, -wall - h * 0.13, w * 0.05, w * 0.05, '#bae6fd');
      for (const [x, y] of [[-0.32, -0.55], [0.18, -0.55], [-0.32, -0.25]]) { // windows with shutters
        box(ctx, x * w, y * h, w * 0.14, h * 0.15, 2, '#bae6fd', '#fff');
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * w + w * 0.068, y * h, 2, h * 0.15);
        box(ctx, x * w - 7, y * h, 6, h * 0.15, 1, o.roof);
        box(ctx, x * w + w * 0.14 + 1, y * h, 6, h * 0.15, 1, o.roof);
      }
      box(ctx, w * 0.12, -h * 0.4, w * 0.3, 6, 2, '#fff'); // balcony rail
      for (let i = 0; i < 6; i++) ctx.fillRect(w * 0.12 + i * w * 0.058, -h * 0.4, 2, h * 0.08);
      box(ctx, w * 0.16, -h * 0.3, w * 0.16, h * 0.3, 6, '#fff', dark(o.color, -0.3)); // door
      ctx.fillStyle = '#ec4899';
      const hx = w * 0.24, hy = -h * 0.2;
      ctx.beginPath(); ctx.arc(hx - 4, hy, 4.5, 0, TAU); ctx.arc(hx + 4, hy, 4.5, 0, TAU); ctx.moveTo(hx - 8.5, hy + 1); ctx.lineTo(hx, hy + 10); ctx.lineTo(hx + 8.5, hy + 1); ctx.fill();
      ctx.restore();
    },
    icon(g) { this.draw(g, Object.assign(this.defaults(), { x: 0, y: 22, w: 54, h: 46 })); },
  });

  // =================================================================== small things
  CR.defineType('flamingo', {
    label: 'Lawn flamingo',
    category: CAT,
    description: 'A pink plastic lawn flamingo on wire legs. Topples like a domino.',
    iconScale: 0.5,
    defaults: () => ({ angle: 0, color: '#f472b6', density: 0.0015 }),
    props: [PX(), PY(), PANGLE, PCOLOR(), num('density', 'Density', 0.0005, 0.0001)],
    rot: { offset: -Math.PI / 2, dist: () => 52 },
    box: (o, s) => ({ x: s.x, y: s.y, w: 34, h: 72, angle: s.angle }),
    build(e) {
      const o = e.o;
      e.body = M().Bodies.rectangle(o.x, o.y, 16, 70, { angle: o.angle * D2R, density: o.density, friction: 0.5, frictionStatic: 0.8 });
      e.body.crSlick = true; // slides past its neighbours like a domino
    },
    draw(ctx, o, s) {
      const c = o.color;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      line(ctx, [[-2, 0], [-2, 35]], '#374151', 1.5);
      line(ctx, [[2, 0], [3, 18], [-1, 22]], '#374151', 1.5);
      ell(ctx, 0, -6, 13, 8, c);
      ell(ctx, -6, -8, 7, 4, dark(c, -0.15), 0.3);
      ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(9, -9); ctx.bezierCurveTo(18, -16, 4, -26, 8, -32); ctx.stroke();
      ell(ctx, 9, -33, 4, 3.5, c);
      poly(ctx, [[12, -34], [17, -31], [12, -30]], '#1f2937');
      eye(ctx, 9, -34, 1);
      ctx.restore();
    },
  });

  const heart = (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
    ctx.closePath();
  };
  CR.defineType('heartballoon', Object.assign({}, CR.types.balloon, {
    label: 'Heart balloon',
    category: CAT,
    description: 'A heart-shaped balloon that floats upward and bumps off things. Pops if fire reaches it.',
    defaults: () => ({ r: 22, lift: 1.4, trigger: 'fire', color: '#f472b6' }),
    draw(ctx, o, s) {
      if (s.e && s.e.done) return;
      const r = o.r;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, r); ctx.quadraticCurveTo(-6, r * 1.6, 2, r * 2.2); ctx.stroke();
      heart(ctx, 0, 0, r);
      ctx.fillStyle = o.color;
      ctx.fill();
      ell(ctx, -r * 0.4, -r * 0.3, r * 0.15, r * 0.25, 'rgba(255,255,255,0.55)', -0.5);
      ctx.restore();
    },
  }));

  CR.defineType('handbag', {
    label: 'Handbag',
    category: CAT,
    description: 'A little pink handbag with a gold clasp.',
    iconScale: 1,
    defaults: () => ({ angle: 0, color: '#ec4899', density: 0.002 }),
    props: [PX(), PY(), PANGLE, PCOLOR(), num('density', 'Density', 0.0005, 0.0001)],
    box: (o, s) => ({ x: s.x, y: s.y - 6, w: 40, h: 40, angle: s.angle }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 36, 26, { angle: e.o.angle * D2R, density: e.o.density, friction: 0.6, chamfer: { radius: 6 } }); },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeStyle = dark(o.color, -0.3);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -13, 10, Math.PI, TAU); ctx.stroke();
      box(ctx, -18, -13, 36, 26, 7, o.color, dark(o.color, -0.4));
      poly(ctx, [[-18, -8], [18, -8], [0, 4]], light(o.color, 0.2));
      ell(ctx, 0, 3, 3, 3, '#facc15');
      ctx.restore();
    },
  });
  CR.defineType('highheel', {
    label: 'High heel',
    category: CAT,
    description: 'A glittery pink high-heeled shoe.',
    iconScale: 1,
    defaults: () => ({ angle: 0, color: '#db2777', density: 0.002 }),
    props: [PX(), PY(), PANGLE, PCOLOR(), num('density', 'Density', 0.0005, 0.0001)],
    box: (o, s) => ({ x: s.x, y: s.y, w: 40, h: 26, angle: s.angle }),
    build(e) { e.body = M().Bodies.rectangle(e.o.x, e.o.y, 38, 22, { angle: e.o.angle * D2R, density: e.o.density, friction: 0.5 }); },
    draw(ctx, o, s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.moveTo(-18, -8); ctx.quadraticCurveTo(-4, -6, 4, 4); ctx.lineTo(18, 6); ctx.quadraticCurveTo(20, 11, 14, 11);
      ctx.lineTo(-6, 11); ctx.quadraticCurveTo(-12, 2, -18, 0); ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.strokeStyle = dark(o.color, -0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
      poly(ctx, [[-18, 0], [-14, 1], [-15, 11], [-17, 11]], dark(o.color, -0.3)); // heel
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [x, y] of [[-10, -3], [-2, 0], [6, 6], [12, 8]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
  });
})();
