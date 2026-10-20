#!/usr/bin/env node
/*
 * Builds the built-in challenge file: `node tools/build-challenges.js`
 *
 * Writes
 *   challenges/builtin.json   the challenge file itself (plain data, the same format any challenge
 *                             file uses -- see CHALLENGE-PROMPT.md)
 *   js/challenges-data.js     the same data wrapped for the app to load with a <script> tag (the page
 *                             can't fetch files: its Content-Security-Policy blocks it, and it must
 *                             also work when index.html is opened straight from disk)
 *
 * A level is a 3 x 3 grid of cells (the floor and two shelves, three cells across). Each cell used
 * holds one small machine from tools/challenge-segments.js -- a wrecking ball and pillars, a crane
 * drop, a fuse and cannon, a car jump, a trampoline, zig-zag ramps, a slinky on a stairway, a
 * balloon and seesaw, an escalator, a walker pushing a ball, a domino run. Each machine ends on a
 * button or detonator plunger wired to the next machine's starter, and the cells are visited in a
 * different order from challenge to challenge (snaking up or down, by columns, a spiral, ...), each
 * machine running left or right. Pieces are taken out of some machines; they're the solution.
 *
 *   easy       2 machines, both missing pieces                    (30)
 *   medium     5 machines, all missing pieces                     (40)
 *   hard       7-8 machines, a few pieces hidden among them       (30)
 *   very hard  5 machines, pieces of at least 3 kinds missing     (30)
 * 10 of the hard / very hard ones have two levels joined by a gateway.
 *
 * tools/challenge-test.html checks every challenge: unsolved as it comes, solved by its solution.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SEG = require('./challenge-segments.js');

const ROOT = path.join(__dirname, '..');

// deterministic randomness, so the file is the same every time it's built
let seed = 20261020;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------------------------------------------------------- themes (looks, and which ball / walker / car)
const THEMES = [
  { key: 'classic', label: 'Classic', emoji: '🎯', bg: '#eef2ff', title: '#1e3a8a', shelf: '#a0703c', domino: '#f5f0e1', ball: 'marble', walker: 'runner', car: 'car', goal: { type: 'giftbox', h: 36, color: '#16a34a', ribbon: '#fde047', name: 'gift' } },
  { key: 'prehistoric', label: 'Prehistoric', emoji: '🦴', bg: '#fef3c7', title: '#78350f', shelf: '#78716c', domino: '#a8a29e', ball: 'boulder', walker: 'caveman', car: 'tractor', machine: '#a16207', goal: { type: 'potofgold', h: 40, name: 'pot of gold' } },
  { key: 'barbie', label: 'Barbie', emoji: '💖', bg: '#fce7f3', title: '#be185d', shelf: '#f472b6', domino: '#fbcfe8', ball: 'marble', walker: 'fashiondoll', car: 'pinkcar', balloon: 'heartballoon', box: '#ec4899', machine: '#f472b6', goal: { type: 'giftbox', h: 36, color: '#ec4899', ribbon: '#fde047', name: 'gift' } },
  { key: 'halloween', label: 'Halloween', emoji: '🎃', bg: '#ede9fe', title: '#581c87', shelf: '#57534e', domino: '#f97316', ball: 'pumpkin', walker: 'skeleton', car: 'monstertruck', box: '#7c3aed', machine: '#f97316', goal: { type: 'present', h: 36, color: '#7c3aed', ribbon: '#f97316', name: 'spooky box' } },
  { key: 'space', label: 'Space', emoji: '🚀', bg: '#e0e7ff', title: '#312e81', shelf: '#64748b', domino: '#cbd5e1', ball: 'marble', walker: 'runner', car: 'car', machine: '#94a3b8', goal: { type: 'giftbox', h: 36, color: '#38bdf8', ribbon: '#fde047', name: 'space crate' } },
  { key: 'christmas', label: 'Christmas', emoji: '🎄', bg: '#ecfeff', title: '#166534', shelf: '#92400e', domino: '#16a34a', ball: 'ornament', walker: 'runner', car: 'car', box: '#dc2626', goal: { type: 'present', h: 36, color: '#dc2626', ribbon: '#facc15', name: 'present' } },
  { key: 'birthday', label: 'Birthday', emoji: '🎂', bg: '#fff7ed', title: '#9a3412', shelf: '#a0703c', domino: '#fbcfe8', ball: 'marble', walker: 'runner', car: 'car', box: '#a855f7', goal: { type: 'giftbox', h: 36, color: '#a855f7', ribbon: '#f472b6', name: 'birthday gift' } },
  { key: 'construction', label: 'Construction', emoji: '🚧', bg: '#fefce8', title: '#854d0e', shelf: '#a8a29e', domino: '#fde68a', ball: 'stonewheel', walker: 'runner', car: 'tractor', machine: '#eab308', goal: { type: 'giftbox', h: 36, color: '#ea580c', ribbon: '#facc15', name: 'site box' } },
  { key: 'weather', label: 'Weather', emoji: '🌈', bg: '#e0f2fe', title: '#0c4a6e', shelf: '#64748b', domino: '#e2e8f0', ball: 'marble', walker: 'cavewoman', car: 'car', goal: { type: 'potofgold', h: 40, name: 'pot of gold' } },
];

// ---------------------------------------------------------------- the grid and the routes through it
const COLS = [[40, 546], [547, 1053], [1054, 1560]], ROWS = [880, 640, 400]; // ground of each row
const cellAt = (col, row) => ({ col, row, x0: COLS[col][0], x1: COLS[col][1], g: ROWS[row] });
// a route is a list of [col, row] (row 0 = the floor)
const ROUTES = {
  'snake up': [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2]],
  'snake down': [[0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0]],
  'right to left': [[2, 0], [1, 0], [0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [0, 2]],
  columns: [[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 1], [2, 0]],
  'columns up': [[2, 0], [2, 1], [2, 2], [1, 2], [1, 1], [1, 0], [0, 0], [0, 1], [0, 2]],
  spiral: [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0], [0, 1], [1, 1]],
  'spiral in': [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1]],
  'criss-cross': [[0, 0], [2, 2], [1, 0], [0, 2], [2, 0], [1, 2], [0, 1], [2, 1], [1, 1]],
  'top down': [[1, 2], [0, 1], [2, 1], [1, 0], [0, 2], [2, 2], [0, 0], [2, 0], [1, 1]],
};
const ROUTE_NAMES = Object.keys(ROUTES);

// ---------------------------------------------------------------- choosing machines
const use = Object.fromEntries(SEG.KINDS.map((k) => [k, 0])); // how often each machine was used, to spread them out
function chooseKinds(n, avoid = new Set()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const pool = SEG.KINDS.filter((k) => !out.includes(k) && !avoid.has(k));
    const least = Math.min(...pool.map((k) => use[k]));
    const k = pick(pool.filter((x) => use[x] <= least + 1));
    use[k]++;
    out.push(k);
  }
  return out;
}

/*
 * One level: `kinds` machines along a route. `holes` = how many of them get pieces taken out;
 * `last` says what the final machine ends on ('goal' or 'gate'). Returns { objects, solution }.
 */
function level(th, prefix, kinds, holes, last, route) {
  const cells = ROUTES[route].slice(0, kinds.length).map(([c, r]) => cellAt(c, r));
  const ids = kinds.map((_, i) => `${prefix}s${i}`);
  const segs = kinds.map((k, i) => {
    const c = cells[i], nx = cells[i + 1];
    // run towards the next cell when it's in the same row, otherwise either way
    c.flip = nx && nx.row === c.row ? nx.col < c.col : rand() < 0.5;
    if (k === 'zigzag' || k === 'seesaw') c.flip = !c.flip; // these end back where they start
    return SEG.place(k, c, th, rand, ids[i]);
  });
  // which machines lose pieces, and which pieces
  const order = shuffle(segs.map((_, i) => i)).filter((i) => Object.keys(segs[i].rm).length);
  const take = new Map();
  for (const i of order.slice(0, holes)) {
    const keys = Object.keys(segs[i].rm);
    take.set(i, keys.length > 1 && rand() < 0.4 ? keys : [pick(keys)]);
  }
  const objects = [], solution = [];
  // shelves under the cells that are used, above the floor
  for (const c of cells) if (c.g < 880) objects.push({ type: 'ramp', x: (c.x0 + c.x1) / 2, y: c.g + 7, w: c.x1 - c.x0 - 8, h: 14, angle: 0, color: th.shelf });
  segs.forEach((seg, i) => {
    const first = i === 0, final = i === segs.length - 1, gone = take.get(i) || [];
    for (const o of seg.objs) {
      if (o.type === 'END') { objects.push(...endOf(th, o, seg.endsLeft, final ? last : ids[i + 1], ids[i] + 'e')); continue; }
      if (o.id === ids[i]) { // the starter: the first one at the start, the others only by the previous machine's button
        if (first) { o.trigger = 'start'; o.delay = Math.max(0.5, o.delay || 0); } else { o.trigger = 'by'; o.by = ids[i - 1] + 'e'; }
      }
      const k = o._rm;
      delete o._rm;
      delete o._post;
      (k && gone.includes(k) ? solution : objects).push(o);
    }
  });
  return { objects, solution, cells };
}

// what a machine ends on: a button or plunger wired to the next machine, the goal, or a gateway
function endOf(th, at, left, next, id) {
  const s = left ? -1 : 1;
  if (next === 'goal') {
    const g = th.goal, o = { type: g.type, x: at.x + s * 4, y: at.y - g.h / 2, trigger: 'touch', goal: true };
    if (g.color) o.color = g.color;
    if (g.ribbon) o.ribbon = g.ribbon;
    return [o];
  }
  if (next === 'gate') return [{ type: 'gateway', x: at.x + s * 12, y: at.y - 65, w: 110, h: 130, wait: 0.3, color: '#7c3aed' }];
  if (rand() < 0.3) return [{ id, type: 'plunger', x: at.x + s * 4, y: at.y, link: next, trigger: 'touch', color: '#dc2626' }];
  return [{ id, type: 'button', x: at.x, y: at.y - 8, link: next, label: '', onscreen: false, color: '#16a34a' }];
}

// ---------------------------------------------------------------- the four difficulties
// each returns a list of levels: { kinds, holes }
const PLANS = {
  easy: () => [{ kinds: chooseKinds(2), holes: 2 }],
  medium: () => [{ kinds: chooseKinds(5), holes: 5 }],
  hard: (two) => {
    if (two) { const a = chooseKinds(4), b = chooseKinds(4, new Set(a)); return [{ kinds: a, holes: 1 }, { kinds: b, holes: 2 }]; }
    return [{ kinds: chooseKinds(7 + (rand() < 0.5 ? 1 : 0)), holes: 3 }];
  },
  'very hard': (two) => {
    if (two) { const a = chooseKinds(3), b = chooseKinds(3, new Set(a)); return [{ kinds: a, holes: 3 }, { kinds: b, holes: 3 }]; }
    return [{ kinds: chooseKinds(5), holes: 5 }];
  },
};

const PLAN = [];
for (let i = 0; i < 30; i++) PLAN.push({ d: 'easy' });
for (let i = 0; i < 40; i++) PLAN.push({ d: 'medium' });
for (let i = 0; i < 30; i++) PLAN.push({ d: 'hard', two: i % 6 === 5 }); // 5 two-level
for (let i = 0; i < 30; i++) PLAN.push({ d: 'very hard', two: i % 6 === 5 }); // 5 two-level

// ---------------------------------------------------------------- assemble
const DLABEL = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', 'very hard': 'VERY HARD' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
let routeNo = 0;
const challenges = PLAN.map((c, idx) => {
  const n = idx + 1, id = 'm' + String(n).padStart(3, '0'), th = THEMES[idx % THEMES.length]; // 'm': not the old row-of-dominoes set's 'c' ids, so old progress doesn't carry over
  const plan = PLANS[c.d](c.two), layers = [], solution = [];
  let objectCount = 0, pieceCount = 0;
  const allowed = new Set(), kindsUsed = [];
  plan.forEach((lv, li) => {
    const lastLevel = li === plan.length - 1;
    const route = ROUTE_NAMES[(routeNo++ * 5) % ROUTE_NAMES.length]; // steps through every route
    const built = level(th, `${id}L${li + 1}`, lv.kinds, lv.holes, lastLevel ? 'goal' : 'gate', route);
    kindsUsed.push(...lv.kinds);
    built.solution.forEach((o) => allowed.add(o.type));
    objectCount += built.objects.length;
    pieceCount += built.solution.length;
    const goal = lastLevel ? `Set off the chain reaction to the ${th.goal.name}` : 'Get the chain reaction into the gateway';
    const head = plan.length > 1 ? `#${n} LEVEL ${li + 1} OF ${plan.length}: ${goal}` : `#${n} (${DLABEL[c.d]}): ${goal}`;
    const text = { type: 'text', x: 800, y: 60, text: head.slice(0, 60), size: 24, bold: true, color: th.title };
    layers.push({
      id: `${id}L${li + 1}`, name: plan.length > 1 ? `Level ${li + 1}` : 'Challenge',
      world: { width: 1600, height: 900, gravity: 1, floor: true, walls: true, background: th.bg },
      objects: [text, ...built.objects].map((o) => Object.assign({ locked: true }, o)),
    });
    solution.push(built.solution);
  });
  const title = kindsUsed.slice(0, 2).map((k) => SEG.S[k].label).join(' & ');
  const name = `#${n} ${cap(title)}`;
  return {
    id, n, name, difficulty: c.d, theme: th.label, emoji: th.emoji, levels: plan.length,
    goal: `Set off the chain reaction to the ${th.goal.name}`, objects: objectCount, pieces: pieceCount,
    machines: kindsUsed.map((k) => SEG.S[k].label),
    allowed: [...allowed],
    project: { name, challengeId: id, speed: 1, challenge: { on: true, allowed: [...allowed] }, activeLayerId: layers[0].id, layers },
    solution,
  };
});

const file = {
  format: 'chain-reaction-challenges', version: 1,
  id: 'builtin', name: 'Built-in challenges', author: 'Chain Reaction Workbench',
  description: '130 chain-reaction puzzles: 30 easy, 40 medium, 30 hard and 30 very hard.',
  challenges,
};
// one challenge per line: easy to read and to diff
const json = '{\n' + Object.entries(file).filter(([k]) => k !== 'challenges').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')
  + '\n  "challenges": [\n' + challenges.map((c) => '    ' + JSON.stringify(c)).join(',\n') + '\n  ]\n}\n';
fs.mkdirSync(path.join(ROOT, 'challenges'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'challenges', 'builtin.json'), json);
fs.writeFileSync(path.join(ROOT, 'js', 'challenges-data.js'),
  '/* Generated by tools/build-challenges.js from the same data as challenges/builtin.json -- data only, do not edit.\n'
  + ' * (A <script> because the page may not fetch files, and must also work when opened straight from disk.) */\n'
  + 'window.CR_CHALLENGE_DATA = ' + json.trim() + ';\n');

const by = {};
for (const c of challenges) {
  const b = (by[c.difficulty] = by[c.difficulty] || { n: 0, objects: [], pieces: [], multi: 0 });
  b.n++; b.objects.push(c.objects); b.pieces.push(c.pieces); if (c.levels > 1) b.multi++;
}
const span = (a) => (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}-${Math.max(...a)}`);
console.log(`Wrote challenges/builtin.json (${(json.length / 1024).toFixed(0)} KB) and js/challenges-data.js`);
for (const [d, b] of Object.entries(by)) console.log(`  ${d.padEnd(9)} ${b.n} challenges, objects ${span(b.objects)}, pieces to add ${span(b.pieces)}${b.multi ? `, ${b.multi} multi-level` : ''}`);
console.log('  machines used: ' + Object.entries(use).map(([k, v]) => `${k} ${v}`).join(', '));
const combos = new Set(challenges.map((c) => c.machines.slice().sort().join('+') + '|' + c.project.layers.length));
console.log(`  ${combos.size} different machine combinations in ${challenges.length} challenges`);
