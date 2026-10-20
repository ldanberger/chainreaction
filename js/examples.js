/*
 * Built-in example projects. Each `project` uses exactly the same format as a
 * saved .json project file (ids are filled in automatically when loaded).
 * Kept as a script (not .json files) so it works when index.html is opened
 * straight from disk with no web server.
 */
(function () {
  'use strict';
  const CR = (window.CR = window.CR || {});

  const world = (o) => Object.assign({ width: 1600, height: 900, gravity: 1, floor: true, walls: false, background: '#e8f1f8' }, o || {});
  const pts = (...xy) => { const a = []; for (let i = 0; i < xy.length; i += 2) a.push({ x: xy[i], y: xy[i + 1] }); return a; };
  const dominoes = (x0, n, gap, opt) => Array.from({ length: n }, (_, i) => Object.assign(
    { type: 'domino', x: x0 + i * gap, y: 850, w: 12, h: 60, angle: 0, color: i % 2 ? '#f5f0e1' : '#ffe3a3', density: 0.002, friction: 0.5 }, opt));
  // closed circular path (use with loop: true), starting at startDeg and going clockwise
  const circle = (cx, cy, r, startDeg) => {
    const n = Math.max(12, Math.round((2 * Math.PI * r) / 28)), a0 = (startDeg * Math.PI) / 180;
    return Array.from({ length: n }, (_, i) => {
      const a = a0 + (i * 2 * Math.PI) / n;
      return { x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) };
    });
  };
  // Orbits: rings of flyers; each ring inward takes a lap ~18% quicker than the one outside it
  const orbits = () => {
    const rings = [
      ['dragon', 420, '#4c9a2a'], ['eagle', 380, '#78350f'], ['eagle', 345, '#57534e'], ['bird', 312, '#2563eb'],
      ['bat', 280, '#3f3f46'], ['bird', 250, '#dc2626'], ['bat', 220, '#6d28d9'], ['butterfly', 190, '#f472b6'],
      ['bird', 162, '#f59e0b'], ['butterfly', 135, '#22d3ee'], ['bee', 108, '#facc15'], ['bee', 82, '#fb923c'],
      ['bee', 58, '#a3e635'], ['butterfly', 36, '#e879f9'],
    ];
    const lap0 = 60; // seconds for the outermost ring
    return rings.map(([type, r, color], i) => {
      const lap = lap0 / Math.pow(1.18, i);
      const o = { type, points: circle(800, 450, r, i * 47), loop: true, speed: Math.round((2 * Math.PI * r) / lap), trigger: 'start', color };
      if (type === 'dragon') Object.assign(o, { fireMode: 'off' });
      return o;
    });
  };

  // Dragon's Journey: the dragon comes out of an arrival gateway (top left), flies across the
  // top of the layer -- looping the loop at the `loops` x positions to give the layer below time
  // to play out -- and into the exit gateway (top right). The exit switches layers the moment the
  // dragon is centred in it (wait = the last 55px at its speed), so the flight carries straight on.
  const GATE_Y = 150, LOOP_R = 90, LOOP_TOP = 112, DRAGON_SPEED = 150;
  const journey = (opt = {}) => {
    const p = [[175, GATE_Y], [420, LOOP_TOP]];
    for (const cx of opt.loops || []) {
      for (let d = -90; d <= 270; d += 30) {
        const a = (d * Math.PI) / 180;
        p.push([Math.round(cx + LOOP_R * Math.cos(a)), Math.round(LOOP_TOP + LOOP_R + LOOP_R * Math.sin(a))]);
      }
    }
    p.push([1500, GATE_Y]);
    return [
      { type: 'gateway', x: 95, y: GATE_Y, w: 110, h: 130, arrival: true, color: '#7c3aed' },
      { type: 'dragon', points: pts(...p.flat()), speed: DRAGON_SPEED, fireMode: opt.fireMode || 'off', trigger: 'start', delay: 0 },
      { type: 'gateway', x: 1500, y: GATE_Y, w: 110, h: 130, wait: 0.35, target: opt.target || '', color: '#7c3aed' },
    ];
  };

  // Challenges: everything is locked (Challenge mode ON); the player solves them by adding the allowed pieces
  const locked = (objs) => objs.map((o) => Object.assign({ locked: true }, o));
  const say = (lines, color = '#1e3a8a') => lines.map((t, i) => ({ type: 'text', x: 800, y: 60 + i * 36, text: t, size: i ? 22 : 28, bold: true, color }));

  CR.examples = [
    {
      name: 'Chain Reaction',
      description: 'A marble rolls down two ramps and topples a row of dominoes into a jumper.',
      project: {
        name: 'Chain Reaction',
        layers: [{
          name: 'Domino Run',
          world: world({ walls: true }),
          objects: [
            { type: 'ramp', x: 300, y: 380, w: 440, h: 14, angle: 18, color: '#a0703c' },
            { type: 'ramp', x: 760, y: 600, w: 460, h: 14, angle: 14, color: '#a0703c' },
            { type: 'marble', x: 120, y: 270, r: 14, color: '#3b82f6' },
            ...dominoes(1180, 10, 34),
            { type: 'jumper', x: 1530, y: 852, trigger: 'touch', jumpVy: 10, jumpVx: 0, jumps: 3, interval: 0.9, color: '#2a9d8f' },
          ],
        }],
      },
    },
    {
      name: "Dragon's Spark",
      description: 'A dragon swoops down and lights a fuse; the cannon fires into the dominoes.',
      project: {
        name: "Dragon's Spark",
        layers: [{
          name: 'Dragon',
          world: world({ background: '#f3e9dc', walls: true }),
          objects: [
            { type: 'dragon', points: pts(1500, 180, 1150, 380, 820, 700, 500, 720, 150, 300), speed: 220, fireRange: 240, fireMode: 'near', trigger: 'start' },
            { type: 'fuse', points: pts(640, 872, 500, 866, 380, 874, 235, 860), burnSpeed: 110, trigger: 'touch' },
            { type: 'cannon', x: 200, y: 866, angle: -40, power: 17, trigger: 'touch', delay: 0.5 },
            ...dominoes(1240, 8, 36),
            { type: 'jumper', x: 1560, y: 852, trigger: 'touch', jumpVy: 12, jumpVx: 0, direction: -1 },
          ],
        }],
      },
    },
    {
      name: 'Race Day (3 layers)',
      description: 'Three scenes in one project: a car ramp jump, a runner relay, and a closed fuse-chain layer.',
      project: {
        name: 'Race Day',
        layers: [
          {
            name: 'Ramp Jump',
            world: world({ walls: true }),
            objects: [
              { type: 'car', x: 120, y: 864, speed: 11, accel: 0.3, trigger: 'start', color: '#d62828', number: '7' },
              { type: 'ramp', x: 520, y: 856, w: 260, h: 14, angle: -14, color: '#8d99ae' },
              ...dominoes(1000, 10, 36, { h: 80, y: 840 }),
            ],
          },
          {
            name: 'Runner Relay',
            world: world({ background: '#eaf6ea', walls: true }),
            objects: [
              { type: 'runner', points: pts(80, 852, 330, 852), speed: 150, trigger: 'start' },
              ...dominoes(290, 10, 36),
              { type: 'jumper', x: 680, y: 852, trigger: 'touch', jumpVy: 11, jumpVx: 4, color: '#7b2cbf' },
              { type: 'cannon', x: 955, y: 866, angle: -20, power: 14, trigger: 'touch', delay: 0.5 },
              ...dominoes(1260, 8, 36, { color: '#cde7ff' }),
            ],
          },
          {
            name: 'Fuse Chain',
            open: false,
            world: world({ background: '#1f2a3a', walls: true }),
            objects: [
              { type: 'fuse', points: pts(80, 872, 160, 860, 240, 872), trigger: 'start', burnSpeed: 100 },
              { type: 'cannon', x: 280, y: 866, angle: -45, power: 17.5, trigger: 'touch', delay: 0.3 },
              { type: 'ramp', x: 1000, y: 600, w: 220, h: 14, angle: 0, color: '#6c757d' },
              { type: 'fuse', points: pts(1100, 592, 1180, 560, 1260, 592, 1330, 620, 1360, 860), trigger: 'touch', burnSpeed: 160 },
              { type: 'cannon', x: 1400, y: 866, angle: -150, power: 15, trigger: 'touch', delay: 0.3, color: '#7a2e2e' },
              ...dominoes(560, 8, 36, { color: '#ffd6a5' }),
            ],
          },
        ],
      },
    },
    {
      name: 'Pinball',
      description: 'A playable table: the cannon launches three balls; flip with ← and → (or the on-screen buttons). A trampoline saves balls between the flippers; balls down the outlanes behind them are lost.',
      project: {
        name: 'Pinball',
        layers: [{
          name: 'Table',
          world: world({ width: 1000, height: 1000, gravity: 0.8, walls: true, background: '#0f172a' }),
          objects: [
            { type: 'curve', x: 500, y: 480, radius: 470, start: 180, end: 360, h: 14, color: '#94a3b8' },
            { type: 'cannon', x: 960, y: 640, angle: -92, power: 20, ballRadius: 11, shots: 3, interval: 8, trigger: 'start', delay: 0.5, color: '#475569' },
            { type: 'ramp', x: 203, y: 814, w: 277, h: 12, angle: 23, color: '#94a3b8' },
            { type: 'ramp', x: 797, y: 814, w: 277, h: 12, angle: -23, color: '#94a3b8' },
            { type: 'trampoline', x: 500, y: 952, w: 128, angle: 0, bounce: 1, minBounce: 13, color: '#22d3ee', frame: '#334155' },
            { type: 'paddle', x: 330, y: 880, side: 'left', key: 'ArrowLeft', length: 120, width: 18, rest: 30, flip: -30, color: '#2563eb' },
            { type: 'paddle', x: 670, y: 880, side: 'right', key: 'ArrowRight', length: 120, width: 18, rest: 30, flip: -30, color: '#2563eb' },
            { type: 'trampoline', x: 235, y: 700, w: 110, angle: 65, bounce: 1.15, minBounce: 7, color: '#f43f5e' },
            { type: 'trampoline', x: 735, y: 700, w: 110, angle: -65, bounce: 1.15, minBounce: 7, color: '#f43f5e' },
            { type: 'bumper', x: 370, y: 300, r: 30, kick: 9, points: 100, color: '#e11d48' },
            { type: 'bumper', x: 610, y: 300, r: 30, kick: 9, points: 100, color: '#e11d48' },
            { type: 'bumper', x: 490, y: 440, r: 30, kick: 9, points: 100, color: '#e11d48' },
            { type: 'spinner', x: 490, y: 150, w: 90, h: 10, points: 10, color: '#64748b' },
            { type: 'target', x: 120, y: 470, h: 44, angle: 10, drop: true, points: 500, color: '#f59e0b' },
            { type: 'target', x: 130, y: 540, h: 44, angle: 10, drop: true, points: 500, color: '#f59e0b' },
            { type: 'target', x: 860, y: 520, h: 44, angle: -10, drop: false, points: 250, color: '#22c55e' },
          ],
        }],
      },
    },
    {
      name: 'Ring of Fire',
      description: 'Runner → dominoes → match → fuse lights the ring → second fuse fires the cannon through the flames → the burning ball lights the finale.',
      project: {
        name: 'Ring of Fire',
        layers: [{
          name: 'Ring of Fire',
          world: world({ walls: true, background: '#1c2333' }),
          objects: [
            { type: 'runner', points: pts(80, 852, 270, 852, 320, 824), speed: 150, trigger: 'start' },
            ...dominoes(300, 7, 36),
            { type: 'match', x: 576, y: 860, trigger: 'touch', burnTime: 6, reach: 25 },
            { type: 'fuse', points: pts(640, 874, 780, 868, 900, 874, 940, 790), trigger: 'fire', burnSpeed: 120 },
            { type: 'firering', x: 1000, y: 720, r: 55, th: 8, stand: true, trigger: 'fire' },
            { type: 'fuse', points: pts(1005, 778, 1010, 874, 1120, 868, 1215, 872), trigger: 'fire', burnSpeed: 120 },
            { type: 'cannon', x: 1250, y: 866, angle: -150, power: 14, trigger: 'touch', delay: 0.4, color: '#7a2e2e' },
            { type: 'fuse', points: pts(548, 862, 505, 800, 460, 740, 430, 712), trigger: 'fire', burnSpeed: 120 },
            { type: 'firering', x: 400, y: 640, r: 60, th: 10, stand: false, trigger: 'fire' },
          ],
        }],
      },
    },
    {
      name: 'Orbits',
      description: 'Fourteen rings of flyers circling one centre: the dragon takes a slow minute per lap, and each ring inside it laps a little faster.',
      project: {
        name: 'Orbits',
        layers: [{
          name: 'Orbits',
          world: world({ floor: false, gravity: 0, background: '#0b1026' }),
          objects: orbits(),
        }],
      },
    },
    {
      name: 'Zoo Parade',
      description: 'Ten animals march right, fastest at the front; hoppers bound along a shelf and flyers circle overhead.',
      project: {
        name: 'Zoo Parade',
        layers: [{
          name: 'Parade',
          world: world({ walls: true, background: '#e0f2e9' }),
          objects: [
            { type: 'cheetah', points: pts(760, 865, 1550, 865), speed: 340, trigger: 'start' },
            { type: 'horse', points: pts(660, 850, 1465, 850), speed: 230, trigger: 'start' },
            { type: 'dog', points: pts(570, 865, 1390, 865), speed: 180, trigger: 'start' },
            { type: 'cat', points: pts(505, 867, 1338, 867), speed: 140, trigger: 'start' },
            { type: 'mouse', points: pts(460, 875, 1300, 875), speed: 130, trigger: 'start' },
            { type: 'dinosaur', points: pts(395, 840, 1235, 840), speed: 120, trigger: 'start' },
            { type: 'elephant', points: pts(270, 840, 1120, 840), speed: 70, trigger: 'start' },
            { type: 'penguin', points: pts(185, 860, 1040, 860), speed: 55, trigger: 'start' },
            { type: 'cow', points: pts(110, 852, 960, 852), speed: 50, trigger: 'start' },
            { type: 'turtle', points: pts(35, 870, 880, 870), speed: 25, trigger: 'start' },
            { type: 'ramp', x: 800, y: 560, w: 1000, h: 14, angle: 0, color: '#8b5e34' },
            { type: 'kangaroo', x: 360, y: 517, jumps: 2, interval: 1.4, trigger: 'start', delay: 0.5 },
            { type: 'rabbit', x: 470, y: 537, jumps: 3, interval: 1, trigger: 'start', delay: 1 },
            { type: 'frog', x: 560, y: 541, jumps: 3, interval: 1.1, trigger: 'start', delay: 1.5 },
            { type: 'eagle', points: circle(400, 260, 140, 0), loop: true, speed: 160, trigger: 'start' },
            { type: 'bird', points: circle(800, 220, 100, 90), loop: true, speed: 150, trigger: 'start' },
            { type: 'bat', points: circle(1200, 260, 120, 200), loop: true, speed: 170, trigger: 'start' },
            { type: 'butterfly', points: circle(1000, 380, 60, 0), loop: true, speed: 70, trigger: 'start' },
            { type: 'bee', points: circle(620, 400, 45, 0), loop: true, speed: 90, trigger: 'start' },
          ],
        }],
      },
    },
    {
      name: 'Traffic Jam',
      description: 'Cars, a bus and a monster truck head right over a jump while a dump truck and a tank come the other way.',
      project: {
        name: 'Traffic Jam',
        layers: [{
          name: 'Road',
          world: world({ walls: true, background: '#dbeafe' }),
          objects: [
            { type: 'ramp', x: 900, y: 860, w: 200, h: 14, angle: -18, color: '#6b7280' },
            { type: 'policecar', x: 220, y: 864, speed: 10, trigger: 'start' },
            { type: 'bus', x: 450, y: 855, speed: 6, trigger: 'start' },
            { type: 'monstertruck', x: 70, y: 845, speed: 9, trigger: 'start', delay: 1.5 },
            { type: 'tank', x: 1300, y: 857, direction: -1, trigger: 'start' },
            { type: 'dumptruck', x: 1480, y: 852, direction: -1, trigger: 'start', delay: 1 },
            { type: 'helicopter', points: circle(800, 260, 150, 180), loop: true, speed: 160, trigger: 'start' },
            { type: 'hotairballoon', points: pts(1450, 200, 150, 160), speed: 45, trigger: 'start' },
            { type: 'airplane', points: pts(80, 90, 1520, 110), loop: true, speed: 260, trigger: 'start', delay: 2 },
          ],
        }],
      },
    },
    {
      name: 'Bounce House',
      description: 'Every kind of bouncer: trampolines, a spring pad, jelly, a rubber rail, a mushroom and a bouncy castle — plus a fan and a balloon that floats up into a ring of fire.',
      project: {
        name: 'Bounce House',
        layers: [{
          name: 'Bounce House',
          world: world({ walls: true, background: '#fdf2f8' }),
          objects: [
            { type: 'trampoline', x: 220, y: 860, w: 120 },
            { type: 'superball', x: 220, y: 300 },
            { type: 'trampoline', x: 520, y: 860, w: 120, color: '#16a34a' },
            { type: 'basketball', x: 520, y: 250 },
            { type: 'trampoline', x: 820, y: 860, w: 120, color: '#9333ea' },
            { type: 'tennisball', x: 820, y: 300 },
            { type: 'springpad', x: 1080, y: 860, w: 60 },
            { type: 'beachball', x: 1080, y: 500 },
            { type: 'bouncycastle', x: 1380, y: 864, w: 220 },
            { type: 'superball', x: 1380, y: 400, color: '#06b6d4' },
            { type: 'mushroom', x: 660, y: 520, r: 34 },
            { type: 'basketball', x: 670, y: 120, color: '#c2410c' },
            { type: 'jelly', x: 1000, y: 600, w: 140, h: 40 },
            { type: 'superball', x: 990, y: 350, color: '#f43f5e' },
            { type: 'rubberrail', x: 1250, y: 500, w: 160, angle: -25 },
            { type: 'tennisball', x: 1230, y: 300, color: '#fef08a' },
            { type: 'fan', x: 60, y: 820, angle: -30, strength: 1.2, trigger: 'start' },
            { type: 'beachball', x: 160, y: 760, color: '#3b82f6' },
            { type: 'balloon', x: 1500, y: 780 },
            { type: 'firering', x: 1500, y: 250, r: 50, th: 8, stand: false, trigger: 'start' },
          ],
        }],
      },
    },
    {
      name: 'Alien Visit',
      description: 'A UFO swoops down and drops off the alien, who strolls over and tips a row of dominoes into a kangaroo.',
      project: {
        name: 'Alien Visit',
        layers: [{
          name: 'Alien Visit',
          world: world({ walls: true, background: '#1e1b4b' }),
          objects: [
            { type: 'ufo', points: pts(80, 140, 600, 260, 800, 700), speed: 260, trigger: 'start' },
            { type: 'alien', points: pts(800, 850, 1080, 850, 1130, 822), speed: 90, trigger: 'start', delay: 3.4 },
            ...dominoes(1110, 10, 36, { color: '#c4b5fd' }),
            { type: 'kangaroo', x: 1500, y: 845, trigger: 'touch', jumps: 3, direction: -1 },
          ],
        }],
      },
    },
    {
      name: 'Rocket Relay',
      description: "A rocket's exhaust lights a fuse, the fuse starts a race car, the car drives through a ring of fire and its flames light the finale.",
      project: {
        name: 'Rocket Relay',
        layers: [{
          name: 'Rocket Relay',
          world: world({ walls: true, background: '#1e293b' }),
          objects: [
            { type: 'rocket', points: pts(80, 120, 380, 660, 520, 850, 700, 660, 1000, 120), speed: 300, trigger: 'start' },
            { type: 'fuse', points: pts(480, 872, 640, 872, 705, 866), trigger: 'fire', burnSpeed: 130 },
            { type: 'car', x: 750, y: 865, speed: 9, trigger: 'touch', color: '#f97316', number: '9' },
            { type: 'firering', x: 1000, y: 830, r: 46, th: 8, stand: false, trigger: 'start' },
            { type: 'fuse', points: pts(1180, 874, 1300, 874, 1390, 800), trigger: 'fire', burnSpeed: 130 },
            { type: 'firering', x: 1450, y: 740, r: 60, th: 10, stand: true, trigger: 'fire' },
            { type: 'kangaroo', x: 1540, y: 845, direction: -1, trigger: 'touch', jumps: 3 },
          ],
        }],
      },
    },
    {
      name: "Dragon's Journey (7 layers)",
      description: 'A dragon flies out of a gateway, across the top of each layer and straight into the next one, while each layer plays out its own scene below: dominoes, a slinky, a countdown, a party, a rainy day with a spaceship and a rainbow, a snowy Stone Age cave and a pink party.',
      project: {
        name: "Dragon's Journey",
        activeLayerId: 'dj1',
        speed: 0.25, // starts slow so you can follow it
        layers: [
          {
            id: 'dj1', name: '1 · Domino Valley',
            world: world({ walls: true }),
            objects: [
              ...journey({ loops: [1250] }),
              { type: 'text', x: 800, y: 300, text: "DRAGON'S JOURNEY", size: 60, bold: true, color: '#4c9a2a' },
              { type: 'text', x: 800, y: 380, text: 'PRESS RUN ▶', size: 40, bold: true, color: '#f59e0b' },
              { type: 'ramp', x: 300, y: 380, w: 440, h: 14, angle: 18, color: '#a0703c' },
              { type: 'ramp', x: 760, y: 600, w: 460, h: 14, angle: 14, color: '#a0703c' },
              { type: 'marble', x: 120, y: 270, r: 14, color: '#3b82f6' },
              ...dominoes(1180, 10, 34),
              { type: 'jumper', x: 1530, y: 852, trigger: 'touch', jumpVy: 10, jumpVx: 0, jumps: 3, interval: 0.9, color: '#2a9d8f' },
            ],
          },
          {
            id: 'dj2', name: '2 · Slinky Stairs',
            world: world({ walls: true, background: '#eef6ea' }),
            objects: [
              ...journey({ loops: [700] }),
              { type: 'stairs', x: 330, y: 740, steps: 7, stepW: 60, stepH: 40, dir: 1, color: '#a8a29e' },
              { type: 'slinky', x: 150, y: 585, hop: 60, time: 0.5, hops: 9, stopOnFlat: false, trigger: 'start', delay: 0.5, color: '#94a3b8' },
              ...dominoes(650, 10, 34),
              { type: 'button', x: 1030, y: 872, label: 'Go', link: 'dj2car', color: '#16a34a' },
              { id: 'dj2car', type: 'car', x: 1120, y: 865, speed: 8, trigger: 'touch', color: '#2563eb', number: '2' },
              ...dominoes(1330, 6, 36, { color: '#cde7ff' }),
            ],
          },
          {
            id: 'dj3', name: '3 · Countdown',
            world: world({ walls: true, background: '#1e293b' }),
            objects: [
              ...journey({ loops: [850] }),
              { type: 'countdown', x: 330, y: 760, seconds: 3, link: 'dj3rocket' },
              { id: 'dj3rocket', type: 'rocket', points: pts(150, 830, 150, 500, 380, 660, 520, 850, 700, 660, 1000, 380), speed: 300, trigger: 'touch' },
              { type: 'fuse', points: pts(480, 872, 640, 872, 705, 866), trigger: 'fire', burnSpeed: 130 },
              { type: 'car', x: 750, y: 865, speed: 9, trigger: 'touch', color: '#f97316', number: '3' },
              { type: 'firering', x: 1000, y: 830, r: 46, th: 8, stand: false, burnTime: 6, trigger: 'start' },
              { type: 'fuse', points: pts(1180, 874, 1300, 874, 1390, 800), trigger: 'fire', burnSpeed: 130 },
              { type: 'firering', x: 1450, y: 740, r: 60, th: 10, stand: true, burnTime: 5, trigger: 'fire' },
              { type: 'kangaroo', x: 1540, y: 845, direction: -1, trigger: 'touch', jumps: 2 },
            ],
          },
          {
            id: 'dj4', name: '4 · Party',
            world: world({ walls: true, background: '#fdf2f8' }),
            objects: [
              ...journey({ loops: [800], fireMode: 'always' }),
              { type: 'text', x: 760, y: 560, text: 'HOORAY!', size: 120, bold: true, bounce: 0.6, color: '#db2777' },
              { type: 'superball', x: 520, y: 300, r: 12, color: '#a855f7' },
              { type: 'basketball', x: 760, y: 280, r: 20 },
              { type: 'superball', x: 1000, y: 320, r: 12, color: '#22c55e' },
              { type: 'countdown', x: 230, y: 700, seconds: 3, go: 'GO!', link: 'dj4car', link2: 'dj4ring' },
              { id: 'dj4car', type: 'car', x: 160, y: 865, speed: 9, trigger: 'touch', color: '#7c3aed', number: '4' },
              { id: 'dj4ring', type: 'firering', x: 1080, y: 830, r: 46, th: 8, stand: false, burnTime: 5, trigger: 'fire' },
              ...dominoes(1300, 7, 36, { color: '#fbcfe8' }),
              // a marble rolls off the little slope onto "Boom" (or press it yourself): the cannon fires at the letters
              { type: 'ramp', x: 470, y: 300, w: 110, h: 10, angle: -12, color: '#be185d' },
              { type: 'marble', x: 512, y: 280, r: 12, color: '#f59e0b' },
              { type: 'ramp', x: 330, y: 470, w: 240, h: 14, angle: 0, color: '#be185d' },
              { type: 'button', x: 400, y: 456, label: 'Boom', link: 'dj4cannon', color: '#dc2626' },
              { id: 'dj4cannon', type: 'cannon', x: 260, y: 449, angle: -30, power: 13, trigger: 'touch', delay: 0 },
            ],
          },
          {
            id: 'dj5', name: '5 · Visitors',
            world: world({ walls: true, background: '#bfe3ff' }),
            objects: [
              // a sunny day... (the sun darkens everything listed before it)
              { type: 'cloud', x: 420, y: 330, w: 200, drift: 50, distance: 1500, trigger: 'start', delay: 1.5 },
              { type: 'cloud', x: 1000, y: 390, w: 170, drift: 60, distance: 900, trigger: 'start', delay: 1 },
              { type: 'sun', x: 1380, y: 430, r: 55, trigger: 'start', delay: 3, fade: 4, dim: 0.55 },
              ...journey({ loops: [600, 1050] }),
              // ...turns to rain
              { id: 'dj5cloudA', type: 'darkcloud', x: -250, y: 360, w: 260, drift: 120, distance: 750, trigger: 'start', delay: 3 },
              { id: 'dj5cloudB', type: 'darkcloud', x: 1850, y: 340, w: 300, drift: -120, distance: 650, trigger: 'start', delay: 3 },
              { type: 'rain', cloud: 'dj5cloudA', x: 400, y: 420, w: 220, trigger: 'start', delay: 6.5, duration: 6 },
              { type: 'rain', cloud: 'dj5cloudB', x: 1200, y: 400, w: 260, trigger: 'start', delay: 7, duration: 5.5 },
              // ...and when the rain stops, a rainbow, with a pot of gold at its end
              { type: 'rainbow', x: 1180, y: 880, r: 330, band: 12, trigger: 'start', delay: 12.5, fade: 2.5 },
              { type: 'potofgold', x: 1468, y: 860, trigger: 'start', delay: 14.5, coins: 70 },
              // a spaceship flies in, beams the alien down, and leaves; the alien shelters under the umbrella
              { type: 'umbrella', x: 560, y: 700, w: 150, h: 110, color: '#a855f7', stripe: '#fde047' },
              { id: 'dj5alien', type: 'alien', points: pts(900, 850, 560, 850), speed: 90, trigger: 'start' },
              { type: 'spaceship', points: pts(1750, 540, 900, 540), speed: 220, cargo: 'dj5alien', leave: true, trigger: 'start', delay: 2 },
            ],
          },
          {
            id: 'dj6', name: '6 · Stone Age',
            world: world({ walls: true, background: '#dbeafe' }),
            objects: [
              { type: 'cave', x: 300, y: 880, w: 380, h: 260 },
              ...journey({ loops: [700, 1100] }),
              // snow settles everywhere... except around the campfire and the torches
              { id: 'dj6cloudA', type: 'snowcloud', x: 330, y: 340, w: 320, drift: 18, distance: 360, trigger: 'start' },
              { id: 'dj6cloudB', type: 'snowcloud', x: 1180, y: 330, w: 360, drift: -14, distance: 300, trigger: 'start' },
              { type: 'snow', cloud: 'dj6cloudA', x: 330, y: 380, heavy: 1.4, wind: 0.4, trigger: 'start', delay: 0.5 },
              { type: 'snow', cloud: 'dj6cloudB', x: 1180, y: 370, heavy: 1.4, wind: -0.3, trigger: 'start', delay: 1 },
              { type: 'torch', x: 175, y: 845 },
              { type: 'torch', x: 425, y: 845 },
              { type: 'campfire', x: 760, y: 872 },
              { type: 'caveman', points: pts(300, 850, 690, 850), speed: 70, trigger: 'start', delay: 1 },
              { type: 'cavewoman', points: pts(260, 850, 640, 850), speed: 70, trigger: 'start', delay: 2.5 },
              { type: 'pterodactyl', points: pts(520, 440, 800, 400, 1080, 450, 800, 490), loop: true, speed: 120, trigger: 'start' },
              // a boulder rolls down the slope towards the mammoth, who walks on into a stack of stones
              { type: 'ramp', x: 1000, y: 770, w: 220, h: 14, angle: 32, color: '#78716c' },
              { type: 'boulder', x: 918, y: 670, r: 26 },
              { type: 'brickwall', x: 1300, y: 869, rows: 6, cols: 1, bw: 44, bh: 22, color: '#a8a29e' },
              { type: 'mammoth', points: pts(1540, 834, 1180, 834), speed: 50, trigger: 'start', delay: 2 },
            ],
          },
          {
            id: 'dj7', name: '7 · Pink Party',
            world: world({ walls: true, background: '#fce7f3' }),
            objects: [
              { type: 'dreamhouse', x: 1200, y: 880, w: 360, h: 300 },
              ...journey({ loops: [700], target: 'dj1' }),
              { type: 'archtext', x: 640, y: 340, text: 'PINK PARTY', size: 56, radius: 420, rainbow: false, color: '#ec4899' },
              // the pink convertible knocks over the flamingos and opens the gift, which pops the party popper
              { type: 'pinkcar', x: 120, y: 860, speed: 6, trigger: 'start', delay: 0.5 },
              ...[0, 1, 2, 3, 4].map((i) => ({ type: 'flamingo', x: 320 + i * 38, y: 845 })),
              { type: 'giftbox', x: 560, y: 862, link: 'dj7popper', color: '#ec4899', ribbon: '#fde047' },
              { id: 'dj7popper', type: 'popper', x: 660, y: 860, angle: -70, trigger: 'touch' },
              { type: 'ramp', x: 720, y: 840, w: 80, h: 14, angle: 90, color: '#f9a8d4' },
              // a ring of fire that only the dark pink heart balloon can light: the pale one floats through first
              { type: 'firering', x: 300, y: 450, r: 70, th: 8, stand: false, trigger: 'by', by: 'dj7heart' },
              { type: 'heartballoon', x: 286, y: 690, r: 20, lift: 1.1, color: '#f9a8d4', trigger: 'none' },
              { id: 'dj7heart', type: 'heartballoon', x: 318, y: 790, r: 22, lift: 1.1, color: '#db2777' },
              // dolls and a pony out in front of the dream house
              { type: 'fashiondoll', points: pts(790, 847, 980, 847), speed: 70, trigger: 'start' },
              { type: 'boydoll', points: pts(1460, 847, 1240, 847), speed: 60, trigger: 'start' },
              { type: 'skaterdoll', points: pts(1560, 847, 1330, 847), speed: 150, trigger: 'start', delay: 2 },
              { type: 'pony', points: pts(1060, 850, 1120, 850), speed: 90, wander: 'ground', trigger: 'start' },
              { type: 'handbag', x: 1010, y: 867 },
              { type: 'highheel', x: 940, y: 869 },
            ],
          },
        ],
      },
    },
    {
      name: 'Stormy Day',
      description: 'A sunny day with animals roaming at random turns stormy: dark clouds roll in, the sun fades, rain pours (putting out a ring of fire, but not the one under the umbrella) and lightning sets off a bomb and startles a jumper.',
      project: {
        name: 'Stormy Day',
        layers: [{
          name: 'Storm',
          world: world({ walls: true, background: '#bfe3ff' }),
          objects: [
            // sunny day: fair-weather clouds drift off and from 5 s the sun fades and the sky
            // darkens (the sun darkens everything listed before it, so the clouds come first)
            { type: 'cloud', x: 330, y: 130, w: 220, drift: 70, distance: 1500, trigger: 'start', delay: 3 },
            { type: 'cloud', x: 780, y: 230, w: 160, drift: 60, distance: 1100, trigger: 'start', delay: 3.5 },
            { type: 'cloud', x: 1040, y: 110, w: 180, drift: 80, distance: 800, trigger: 'start', delay: 2.5 },
            { type: 'sun', x: 1320, y: 150, r: 60, trigger: 'start', delay: 5, fade: 5, dim: 0.6 },
            // animals wandering at random
            { type: 'bird', points: pts(520, 330, 620, 300), speed: 150, wander: 'free', trigger: 'start', color: '#2563eb' },
            { type: 'bird', points: pts(1150, 420, 1050, 380), speed: 130, wander: 'free', trigger: 'start', color: '#dc2626' },
            { type: 'butterfly', points: pts(700, 640, 760, 610), speed: 70, wander: 'free', trigger: 'start' },
            { type: 'dog', points: pts(160, 865, 260, 865), speed: 120, wander: 'ground', trigger: 'start' },
            { type: 'ramp', x: 420, y: 838, w: 84, h: 14, angle: 90, color: '#8b6b4a' }, // the dog's fence post
            // what the storm sets off
            { type: 'bomb', x: 600, y: 862, trigger: 'fire', delay: 1, radius: 190, power: 15 },
            { type: 'brickwall', x: 760, y: 869, rows: 7, cols: 2, bw: 46, bh: 22 },
            ...dominoes(880, 6, 34, { color: '#e2e8f0' }),
            { type: 'jumper', x: 1100, y: 852, trigger: 'touch', jumpVy: 10, jumpVx: 0, jumps: 3, interval: 0.8, color: '#f59e0b' },
            // two rings of fire: the rain puts out the open one; the one under the umbrella stays lit
            { type: 'firering', x: 1000, y: 735, r: 34, th: 7, stand: true, trigger: 'start' },
            { type: 'firering', x: 1205, y: 735, r: 34, th: 7, stand: true, trigger: 'start' },
            { type: 'umbrella', x: 1205, y: 630, w: 130, h: 50, color: '#2563eb', stripe: '#facc15' },
            { type: 'xmastree', x: 1420, y: 765, w: 110, h: 140, trigger: 'none', color: '#166534' },
            // the storm rolls in from both sides
            { id: 'sdA', type: 'darkcloud', x: -260, y: 170, w: 280, drift: 110, distance: 860, trigger: 'start', delay: 4 },
            { id: 'sdB', type: 'darkcloud', x: 1860, y: 140, w: 320, drift: -110, distance: 760, trigger: 'start', delay: 4 },
            { type: 'darkcloud', x: -420, y: 70, w: 400, drift: 120, distance: 1250, trigger: 'start', delay: 5, color: '#334155' },
            { type: 'rain', cloud: 'sdA', x: 300, y: 260, w: 240, heavy: 1.2, wind: -1, trigger: 'start', delay: 9 },
            { type: 'rain', cloud: 'sdB', x: 1300, y: 240, w: 280, heavy: 1.2, wind: -1, trigger: 'start', delay: 9.5 },
            { type: 'lightning', cloud: 'sdA', x: 300, y: 200, strikes: 1, trigger: 'start', delay: 12 },
            { type: 'lightning', cloud: 'sdB', x: 1300, y: 180, strikes: 2, interval: 1.4, trigger: 'start', delay: 14 },
          ],
        }],
      },
    },
    {
      name: 'Challenge 1 (easy)',
      description: 'Puzzle: roll the blue marble into the gift. You may add ramps and curved ramps.',
      project: {
        name: 'Challenge 1 (easy)',
        challenge: { on: true, allowed: ['ramp', 'curve'] },
        layers: [{
          name: 'Challenge 1',
          world: world({ walls: true, background: '#ecfdf5' }),
          objects: locked([
            ...say(['CHALLENGE 1 (EASY): roll the blue marble into the gift', 'Press Run to test it; Restart and try again']),
            { type: 'ramp', x: 300, y: 330, w: 420, h: 14, angle: 15, color: '#a0703c' },
            { id: 'c1marble', type: 'marble', x: 120, y: 270, r: 14, color: '#2563eb' },
            { type: 'ramp', x: 1300, y: 600, w: 300, h: 14, angle: 0, color: '#64748b' },
            { type: 'giftbox', x: 1350, y: 575, trigger: 'by', by: 'c1marble', link: 'c1pop', color: '#16a34a', ribbon: '#fde047', goal: true },
            { id: 'c1pop', type: 'popper', x: 1430, y: 580, angle: -100, trigger: 'touch' },
          ]),
        }],
      },
    },
    {
      name: 'Challenge 2 (medium)',
      description: 'Puzzle: knock over every domino; the last one presses the button. You may add dominoes, ramps and stairways.',
      project: {
        name: 'Challenge 2 (medium)',
        challenge: { on: true, allowed: ['domino', 'ramp', 'stairs'] },
        layers: [{
          name: 'Challenge 2',
          world: world({ walls: true, background: '#eff6ff' }),
          objects: locked([
            ...say(['CHALLENGE 2 (MEDIUM): knock over every domino', 'The last domino must press the green button']),
            { type: 'ramp', x: 250, y: 600, w: 300, h: 14, angle: 20, color: '#a0703c' },
            { type: 'marble', x: 130, y: 520, r: 14, color: '#3b82f6' },
            ...dominoes(500, 5, 34),
            { type: 'ramp', x: 1050, y: 820, w: 380, h: 14, angle: 0, color: '#64748b' },
            ...dominoes(900, 8, 34, { y: 783, color: '#bfdbfe' }),
            { type: 'button', x: 1200, y: 806, label: '', link: 'c2pop', link2: 'c2jump', color: '#16a34a' },
            { id: 'c2pop', type: 'popper', x: 1340, y: 860, angle: -90, trigger: 'touch', goal: true },
            { id: 'c2jump', type: 'jumper', x: 1470, y: 852, trigger: 'touch', jumpVy: 10, jumpVx: 0, jumps: 3, interval: 0.8, direction: -1, color: '#16a34a' },
          ]),
        }],
      },
    },
    {
      name: 'Challenge 3 (hard)',
      description: 'Puzzle: pop the red balloon by getting the torch’s fire to the fuse. You may add rings of fire, ramps and marbles.',
      project: {
        name: 'Challenge 3 (hard)',
        challenge: { on: true, allowed: ['firering', 'ramp', 'marble'] },
        layers: [{
          name: 'Challenge 3',
          world: world({ walls: true, background: '#fef2f2' }),
          objects: locked([
            ...say(['CHALLENGE 3 (HARD): pop the red balloon', 'Only fire lights the fuse, and the only fire is the torch', 'Hint: roll a marble through a lit ring of fire to light it'], '#7f1d1d'),
            { type: 'torch', x: 150, y: 845 },
            { type: 'fuse', points: pts(700, 872, 900, 868, 1000, 700, 1150, 520, 1250, 345), trigger: 'fire', burnSpeed: 140 },
            { type: 'ramp', x: 1300, y: 372, w: 200, h: 14, angle: 0, color: '#64748b' },
            { type: 'bomb', x: 1285, y: 347, r: 18, trigger: 'fire', delay: 1, radius: 200, power: 12 },
            { type: 'ramp', x: 1350, y: 170, w: 260, h: 14, angle: 0, color: '#64748b' },
            { type: 'balloon', x: 1380, y: 220, r: 26, lift: 1.4, trigger: 'fire', color: '#ef4444', goal: true },
          ]),
        }],
      },
    },
  ];
})();
