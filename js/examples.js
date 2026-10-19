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
  ];
})();
