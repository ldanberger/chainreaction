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
 * Every challenge is a chain reaction in rows: dominoes on the floor and on shelves, each row set
 * off by a cannon (or slingshot) that the previous row's last domino fires by landing on a button.
 * Pieces are taken out -- gaps in a row, holes in a shelf, a cannon nobody fires, an empty slingshot
 * -- and the player puts them back. The pieces taken out are the stored solution.
 *
 *   easy       up to 10 objects, 3 pieces to add          (30)
 *   medium     about 30 objects, 10 pieces to add         (40)
 *   hard       about 50 objects, 5 pieces to add          (30)
 *   very hard  about 30 objects, 6-8 pieces of 3 kinds    (30)
 * 10 of the hard / very hard ones have two levels joined by a gateway.
 *
 * tools/challenge-test.html checks every challenge: unsolved as it comes, solved by its solution.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;

// deterministic randomness, so the file is the same every time it's built
let seed = 20261018;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const FLOOR = 880, X0 = 280, GAP = 34, SHELF_L = 120, SHELF_R = 1480;

// ---------------------------------------------------------------- themes (looks only)
const THEMES = [
  { key: 'classic', label: 'Classic', emoji: '🎯', bg: '#eef2ff', title: '#1e3a8a', shelf: '#a0703c', domino: '#f5f0e1', goal: { type: 'giftbox', h: 36, color: '#16a34a', ribbon: '#fde047', name: 'gift' }, decor: [] },
  { key: 'prehistoric', label: 'Prehistoric', emoji: '🦴', bg: '#fef3c7', title: '#78350f', shelf: '#78716c', domino: '#a8a29e', goal: { type: 'potofgold', h: 40, name: 'pot of gold' }, decor: [{ type: 'cave', x: 1500, y: 880, w: 180, h: 120 }] },
  { key: 'barbie', label: 'Barbie', emoji: '💖', bg: '#fce7f3', title: '#be185d', shelf: '#f472b6', domino: '#fbcfe8', goal: { type: 'giftbox', h: 36, color: '#ec4899', ribbon: '#fde047', name: 'gift' }, decor: [] },
  { key: 'halloween', label: 'Halloween', emoji: '🎃', bg: '#ede9fe', title: '#581c87', shelf: '#57534e', domino: '#f97316', goal: { type: 'present', h: 36, color: '#7c3aed', ribbon: '#f97316', name: 'spooky box' }, decor: [] },
  { key: 'space', label: 'Space', emoji: '🚀', bg: '#e0e7ff', title: '#312e81', shelf: '#64748b', domino: '#cbd5e1', gravity: 0.6, goal: { type: 'giftbox', h: 36, color: '#38bdf8', ribbon: '#fde047', name: 'space crate' }, decor: [] },
  { key: 'christmas', label: 'Christmas', emoji: '🎄', bg: '#ecfeff', title: '#166534', shelf: '#92400e', domino: '#16a34a', goal: { type: 'present', h: 36, color: '#dc2626', ribbon: '#facc15', name: 'present' }, decor: [] },
  { key: 'birthday', label: 'Birthday', emoji: '🎂', bg: '#fff7ed', title: '#9a3412', shelf: '#a0703c', domino: '#fbcfe8', goal: { type: 'giftbox', h: 36, color: '#a855f7', ribbon: '#f472b6', name: 'birthday gift' }, decor: [] },
  { key: 'weather', label: 'Weather', emoji: '🌈', bg: '#e0f2fe', title: '#0c4a6e', shelf: '#64748b', domino: '#e2e8f0', goal: { type: 'potofgold', h: 40, name: 'pot of gold' }, decor: [{ type: 'sun', x: 1500, y: 240, r: 40 }] },
];

// ---------------------------------------------------------------- one row of the chain
/*
 * spec: { top, n, gaps: [domino indices taken out], hole: [first, last] | null,
 *         start: 'start' | 'link' | 'manual' | 'sling', end: 'button' | 'goal' | 'gate' }
 * Returns { objects, solution, ids } -- the starter's id, so the previous row's button can fire it.
 */
function row(th, k, s) {
  const top = s.top, objects = [], solution = [], onFloor = top === FLOOR;
  const x0 = s.start === 'sling' ? X0 + 20 : X0;
  const dx = (i) => x0 + i * GAP;
  const starter = `r${k}`;
  // the shelf (in two parts around a hole)
  let holeX0 = null, holeX1 = null;
  if (s.hole) { holeX0 = dx(s.hole[0]) - GAP / 2; holeX1 = dx(s.hole[1]) + GAP / 2; }
  const shelf = (a, b) => ({ type: 'ramp', x: r1((a + b) / 2), y: top + 7, w: Math.round(b - a), h: 14, angle: 0, color: th.shelf });
  if (!onFloor) {
    if (s.hole) { objects.push(shelf(SHELF_L, holeX0), shelf(holeX1, SHELF_R)); solution.push(shelf(holeX0 - 12, holeX1 + 12)); }
    else objects.push(shelf(SHELF_L, SHELF_R));
  }
  // what sets the row off
  if (s.start === 'sling') {
    objects.push({ id: starter, type: 'slingshot', x: 170, y: top - 20, angle: -8, power: 9, trigger: 'touch', delay: 0 });
    const a = -8 * D;
    solution.push({ type: 'marble', x: r1(170 - Math.cos(a) * 30), y: r1(top - 68 - Math.sin(a) * 30), r: 12 });
  } else {
    objects.push({ id: starter, type: 'cannon', x: 170, y: top - 13, angle: -5, power: 7, trigger: s.start === 'start' ? 'start' : 'touch', delay: 0.3 });
    if (s.start === 'manual') solution.push({ type: 'marble', x: 144, y: top - 80, r: 14 }); // drops onto the cannon, below any shelf
  }
  // the dominoes, minus the gaps and the hole
  const out = new Set(s.gaps || []);
  if (s.hole) for (let i = s.hole[0]; i <= s.hole[1]; i++) out.add(i);
  for (let i = 0; i < s.n; i++) {
    const d = { type: 'domino', x: dx(i), y: top - 30, color: th.domino };
    (out.has(i) ? solution : objects).push(d);
  }
  // where it ends
  const last = dx(s.n - 1);
  if (s.end === 'button') objects.push({ type: 'button', x: last + 40, y: top - 8, link: s.next, label: '', color: '#16a34a' });
  else if (s.end === 'gate') objects.push({ type: 'gateway', x: last + 62, y: top - 65, w: 110, h: 130, wait: 0.3, color: '#7c3aed' });
  else {
    const g = th.goal, o = { type: g.type, x: last + 36, y: top - g.h / 2, trigger: 'touch', goal: true };
    if (g.color) o.color = g.color;
    if (g.ribbon) o.ribbon = g.ribbon;
    objects.push(o);
  }
  return { objects, solution, starter };
}

/** A whole level: rows stacked from the floor up, each firing the next. */
function level(th, rowsSpec, lastEnd) {
  const rows = rowsSpec.map((s, k) => Object.assign({}, s, { start: s.start || (k ? 'link' : 'start') }));
  const objects = [], solution = [];
  rows.forEach((s, k) => {
    s.end = k < rows.length - 1 ? 'button' : lastEnd;
    s.next = `r${k + 1}`;
    const r = row(th, k, s);
    objects.push(...r.objects);
    solution.push(...r.solution);
  });
  return { objects, solution };
}

// gaps: `count` dominoes taken out in runs of 2 or 3 (a single missing domino is no gap: the one
// before it falls far enough to reach the next), never the first two or the last two of a row
function gapsFor(n, count, avoid = new Set()) {
  const runs = [];
  for (let left = count; left > 0;) { const len = left === 3 || left === 5 ? 3 : 2; runs.push(Math.min(len, left)); left -= len; }
  for (let tries = 0; tries < 500; tries++) {
    const out = new Set(), taken = new Set(avoid);
    let ok = true;
    for (const len of runs) {
      const a = 2 + Math.floor(rand() * (n - 3 - len));
      for (let i = a - 1; i <= a + len; i++) if (taken.has(i)) ok = false; // keep a standing domino between runs
      if (!ok) break;
      for (let i = a; i < a + len; i++) { out.add(i); taken.add(i); }
      taken.add(a - 1); taken.add(a + len);
    }
    if (ok && out.size === count) return [...out].sort((x, y) => x - y);
  }
  throw new Error(`couldn't place ${count} missing dominoes in a row of ${n}`);
}
function holeFor(n, len) {
  const a = 3 + Math.floor(rand() * (n - 5 - len));
  return [a, a + len - 1];
}
const near = (h) => (h ? new Set(Array.from({ length: h[1] - h[0] + 5 }, (_, i) => h[0] - 2 + i)) : new Set());

// ---------------------------------------------------------------- the four difficulties
const SHELVES = [FLOOR, 730, 580, 430, 280];

function easy(i) {
  const form = i % 3;
  if (form === 0) { // a floor row with 3 dominoes missing
    const n = 10;
    return { rows: [{ top: FLOOR, n, gaps: gapsFor(n, 3) }] };
  }
  if (form === 1) { // a shelf with a hole: patch it and put back 2 dominoes
    const n = 7;
    return { rows: [{ top: pick([730, 650, 580]), n, hole: holeFor(n, 2) }] };
  }
  const n = 9; // nobody fires the cannon, and 2 dominoes are missing
  return { rows: [{ top: FLOOR, n, start: 'manual', gaps: gapsFor(n, 2) }] };
}

function medium(i) { // 3 rows of 10, 10 pieces: a hole (ramp + 3), gaps in the other rows, sometimes an unfired cannon
  const manual = i % 2 === 1, holeRow = 1 + (i % 2), n = 10;
  const rows = SHELVES.slice(0, 3).map((top) => ({ top, n }));
  rows[holeRow].hole = holeFor(n, 3);
  if (manual) rows[0].start = 'manual';
  const gapRows = [0, 1, 2].filter((k) => k !== holeRow), gaps = 10 - 4 - (manual ? 1 : 0);
  rows[gapRows[0]].gaps = gapsFor(n, Math.ceil(gaps / 2));
  rows[gapRows[1]].gaps = gapsFor(n, Math.floor(gaps / 2));
  return { rows };
}

// hard: 4 rows of 10 (about 50 objects), 5 pieces hidden among them: a hole (ramp + 2) and a
// 2-domino gap. Two-level ones split the same 4 rows over two levels.
function hard(i, part) {
  const n = part ? 11 : 10, rows = SHELVES.slice(0, part ? 2 : 4).map((top) => ({ top, n }));
  if (part === 1) { rows[i % 2].gaps = gapsFor(n, 2); return { rows }; }
  if (part === 2) { rows[1].hole = holeFor(n, 2); return { rows }; } // holes only make sense in a shelf
  const hr = 1 + (i % 3);
  rows[hr].hole = holeFor(n, 2);
  rows[[3, 1, 2][i % 3] === hr ? 0 : [3, 1, 2][i % 3]].gaps = gapsFor(n, 2);
  return { rows };
}

// very hard: 3 rows of 9 (about 30 objects), 7 pieces of 3 kinds: an unfired cannon, an empty
// slingshot, a hole (ramp + 2) and 2 gaps. Two-level ones split them over two levels.
function veryHard(i, part) {
  if (part === 1) {
    const n = 8, rows = SHELVES.slice(0, 2).map((top) => ({ top, n }));
    rows[0].start = 'manual'; rows[1].start = 'sling'; rows[0].gaps = gapsFor(n, 2);
    return { rows };
  }
  if (part === 2) {
    const n = 8, rows = SHELVES.slice(0, 2).map((top) => ({ top, n }));
    rows[1].hole = holeFor(n, 2);
    return { rows };
  }
  const n = 9, rows = SHELVES.slice(0, 3).map((top) => ({ top, n }));
  rows[0].start = 'manual';
  const sr = 1 + (i % 2), hr = 3 - sr;
  rows[sr].start = 'sling';
  rows[hr].hole = holeFor(n, 2);
  rows[sr].gaps = gapsFor(n, 2);
  return { rows };
}

// ---------------------------------------------------------------- assemble
const PLAN = [];
for (let i = 0; i < 30; i++) PLAN.push({ d: 'easy', make: () => [easy(i)] });
for (let i = 0; i < 40; i++) PLAN.push({ d: 'medium', make: () => [medium(i)] });
for (let i = 0; i < 30; i++) {
  if (i % 6 === 5) PLAN.push({ d: 'hard', make: () => [hard(i, 1), hard(i, 2)] }); // 5 two-level
  else PLAN.push({ d: 'hard', make: () => [hard(i)] });
}
for (let i = 0; i < 30; i++) {
  if (i % 6 === 5) PLAN.push({ d: 'very hard', make: () => [veryHard(i, 1), veryHard(i, 2)] }); // 5 two-level
  else PLAN.push({ d: 'very hard', make: () => [veryHard(i)] });
}

const DLABEL = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', 'very hard': 'VERY HARD' };
const challenges = PLAN.map((c, idx) => {
  const n = idx + 1, id = 'c' + String(n).padStart(3, '0'), th = THEMES[idx % THEMES.length];
  const levels = c.make(), layers = [], solution = [];
  let objectCount = 0, pieceCount = 0;
  const allowed = new Set();
  levels.forEach((lv, li) => {
    const last = li === levels.length - 1;
    const built = level(th, lv.rows, last ? 'goal' : 'gate');
    built.solution.forEach((o) => allowed.add(o.type));
    objectCount += built.objects.length;
    pieceCount += built.solution.length;
    const goal = last ? `Finish the chain to the ${th.goal.name}` : 'Finish the chain into the gateway';
    const head = levels.length > 1 ? `#${n} LEVEL ${li + 1} OF ${levels.length}: ${goal}` : `#${n} (${DLABEL[c.d]}): ${goal}`;
    const lines = [head.slice(0, 60)]; // the goal only: working out what to add is the puzzle
    const text = lines.map((t, i) => ({ type: 'text', x: 800, y: 60 + i * 32, text: t, size: i ? 20 : 24, bold: true, color: th.title }));
    layers.push({
      id: `${id}L${li + 1}`, name: levels.length > 1 ? `Level ${li + 1}` : 'Challenge',
      world: { width: 1600, height: 900, gravity: th.gravity || 1, floor: true, walls: true, background: th.background || th.bg },
      objects: [...th.decor, ...text, ...built.objects].map((o) => Object.assign({ locked: true }, o)),
    });
    solution.push(built.solution);
  });
  const name = `#${n} ${levels.length > 1 ? `${levels.length}-level ` : ''}${th.label} chain`;
  return {
    id, n, name, difficulty: c.d, theme: th.label, emoji: th.emoji, levels: levels.length,
    goal: `Finish the chain reaction to the ${th.goal.name}`, objects: objectCount, pieces: pieceCount,
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
