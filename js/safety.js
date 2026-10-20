/*
 * Safety checks for project data that comes from outside: opened files, the browser autosave,
 * and anything else that goes through CR.sanitizeProject (app.js runs every project through it).
 *
 * A project file is only ever data -- nothing in it is run -- but a hand-made file could still
 * try to freeze the page with enormous numbers or counts, or carry odd keys such as __proto__.
 * So before a project is used, it is rebuilt from scratch keeping only what's expected:
 *   - the file must be under LIMITS.fileBytes and look like a Chain Reaction project
 *   - layers, objects per layer, objects in total and path points are capped
 *   - every number is made finite and clamped to the range its Properties field allows
 *     (or a general limit), colours must be #rrggbb, choices must be one of the listed options,
 *     text and ids are shortened, and unexpected keys are dropped
 *   - __proto__ / constructor / prototype keys are never copied
 * Whatever had to be changed is reported back so the app can say so.
 */
(function () {
  'use strict';
  const CR = window.CR;

  const LIMITS = (CR.LIMITS = {
    fileBytes: 5 * 1024 * 1024, // 5 MB: far more than any real project (Dragon's Journey is ~60 KB)
    layers: 50,
    objectsPerLayer: 1500,
    objectsTotal: 6000,
    pathPoints: 400,
    coord: 100000, // x / y anywhere within ±100,000 px
    number: 1e6, // any other number without its own limit
    text: 80, // a text setting (labels, the text block's words, ...)
    name: 100, // project and layer names
    id: 64,
    allowedTypes: 500,
    challenges: 500, // challenges in one challenge file
    storedSets: 4 * 1024 * 1024, // loaded challenge files kept in this browser, in all
    bricks: 1200, // rows × columns in one brick wall
    unknownDepth: 4, // objects of a type this version doesn't know are kept, but only this deep
  });
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const COLOR = /^#[0-9a-f]{6}$/i;
  const ID = /^[\w.:-]{1,64}$/;

  CR.safety = {
    /** True when a file of `bytes` is too big to open. */
    tooBig: (bytes) => !(bytes <= LIMITS.fileBytes),
  };

  function makeReport() {
    const counts = new Map();
    return {
      add(msg) { counts.set(msg, (counts.get(msg) || 0) + 1); },
      list() { return [...counts].map(([m, n]) => (n > 1 ? `${m} (×${n})` : m)); },
      get size() { return counts.size; },
    };
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** A plain copy of unknown data: no special keys, bounded depth, size and string length. */
  function plain(v, depth, R) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.max(-LIMITS.number, Math.min(LIMITS.number, v)) : 0;
    if (typeof v === 'string') return v.slice(0, 200);
    if (typeof v === 'boolean' || v === null) return v;
    if (depth <= 0) { R.add('Some deeply nested data was dropped'); return null; }
    if (Array.isArray(v)) return v.slice(0, 200).map((x) => plain(x, depth - 1, R));
    if (!isObj(v)) return null;
    const out = {};
    for (const k of Object.keys(v).slice(0, 100)) {
      if (BAD_KEYS.has(k)) { R.add('Unsafe keys were removed'); continue; }
      out[k] = plain(v[k], depth - 1, R);
    }
    return out;
  }
  function cleanId(v, R) {
    if (v == null || v === '') return '';
    const s = String(v);
    if (ID.test(s)) return s;
    R.add('Some object ids were invalid and replaced');
    return '';
  }
  function num(v, min, max, dflt, R, what) {
    let n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) { R.add(`Invalid numbers were reset (${what})`); return dflt; }
    const lo = min ?? -LIMITS.number, hi = max ?? LIMITS.number;
    if (n < lo || n > hi) { R.add(`Values out of range were adjusted (${what})`); n = Math.max(lo, Math.min(hi, n)); }
    return n;
  }
  function text(v, max, R, what) {
    const s = String(v ?? '');
    if (s.length > max) { R.add(`Text was shortened (${what})`); return s.slice(0, max); }
    return s;
  }
  function color(v, dflt, R) {
    if (typeof v === 'string' && COLOR.test(v)) return v;
    R.add('Invalid colours were reset');
    return dflt;
  }

  /** One setting of a known object type, checked against its Properties field (`def`). */
  function value(T, key, def, v, dflt, R) {
    const what = `${T.label} ${def ? def.label || key : key}`;
    if (key === 'x' || key === 'y') return num(v, -LIMITS.coord, LIMITS.coord, 0, R, what);
    if (!def) { // a setting with no field of its own: go by its default's kind
      if (typeof dflt === 'number') return num(v, null, null, dflt, R, what);
      if (typeof dflt === 'boolean') return !!v;
      if (typeof dflt === 'string') return text(v, LIMITS.text, R, what);
      return plain(v, 3, R);
    }
    switch (def.type) {
      case 'number': return num(v, def.min, def.max, typeof dflt === 'number' ? dflt : def.min ?? 0, R, what);
      case 'checkbox': return !!v;
      case 'color': return color(v, typeof dflt === 'string' ? dflt : '#888888', R);
      case 'text': return text(v, def.maxLength || LIMITS.text, R, what);
      case 'key': return text(v, 20, R, what);
      case 'objref': case 'layerref': return cleanId(v, R);
      case 'select': {
        if (key === 'wander' && typeof v === 'boolean') return v; // older files; the app converts it
        const opts = def.options.map(([o]) => o);
        if (key === 'trigger') opts.push('by');
        const hit = opts.find((o) => String(o) === String(v));
        if (hit !== undefined) return hit;
        R.add(`Unknown choices were reset (${what})`);
        return dflt !== undefined ? dflt : opts[0];
      }
      default: return plain(v, 3, R);
    }
  }

  // settings every object type may carry besides its Properties fields and defaults
  const EXTRA = {
    by: { type: 'objref' },
    scale: { type: 'number', min: 0.1, max: 10, label: 'Size' },
    locked: { type: 'checkbox' },
    goal: { type: 'checkbox' }, // "Completes the challenge"
  };

  function sanitizeObject(o, R) {
    if (!isObj(o)) { R.add('Broken objects were dropped'); return null; }
    const type = typeof o.type === 'string' ? o.type.slice(0, 40) : '';
    const T = CR.types[type];
    if (!T) { // a type this version doesn't have: kept (hidden) so it survives a re-save, but tamed
      const keep = plain(o, LIMITS.unknownDepth, R);
      keep.type = type;
      keep.id = cleanId(o.id, R);
      return keep;
    }
    const defaults = T.defaults(), defs = new Map(T.props.map((d) => [d.key, d]));
    const keys = new Set(['id', 'type', 'x', 'y', 'points', ...Object.keys(defaults), ...defs.keys(), ...Object.keys(EXTRA)]);
    const out = { id: cleanId(o.id, R), type };
    for (const k of Object.keys(o)) {
      if (BAD_KEYS.has(k)) { R.add('Unsafe keys were removed'); continue; }
      if (!keys.has(k)) { R.add('Unrecognised settings were dropped'); continue; }
      if (k === 'id' || k === 'type') continue;
      if (k === 'points') {
        if (!T.path || !Array.isArray(o.points)) continue;
        let pts = o.points;
        if (pts.length > LIMITS.pathPoints) { R.add(`Paths were shortened to ${LIMITS.pathPoints} points`); pts = pts.slice(0, LIMITS.pathPoints); }
        out.points = pts.filter(isObj).map((p) => ({
          x: num(p.x, -LIMITS.coord, LIMITS.coord, 0, R, `${T.label} path`),
          y: num(p.y, -LIMITS.coord, LIMITS.coord, 0, R, `${T.label} path`),
        }));
        continue;
      }
      out[k] = value(T, k, defs.get(k) || EXTRA[k], o[k], defaults[k], R);
    }
    // limits that depend on two settings together
    if (type === 'brickwall' && (out.rows || defaults.rows) * (out.cols || defaults.cols) > LIMITS.bricks) {
      const rows = out.rows || defaults.rows;
      out.cols = Math.max(1, Math.floor(LIMITS.bricks / rows));
      R.add(`Brick walls were limited to ${LIMITS.bricks} bricks`);
    }
    return out;
  }

  function sanitizeWorld(w, R) {
    w = isObj(w) ? w : {};
    const out = {};
    if (own(w, 'width')) out.width = num(w.width, 200, 20000, 1600, R, 'layer width');
    if (own(w, 'height')) out.height = num(w.height, 200, 20000, 900, R, 'layer height');
    if (own(w, 'gravity')) out.gravity = num(w.gravity, -5, 5, 1, R, 'gravity');
    if (own(w, 'floor')) out.floor = !!w.floor;
    if (own(w, 'walls')) out.walls = !!w.walls;
    if (own(w, 'background')) out.background = color(w.background, '#e8f1f8', R);
    return out;
  }

  /**
   * Rebuild a project from untrusted data. Returns { project, fixes } where fixes lists what had
   * to be changed. Throws if it isn't a project at all.
   */
  CR.sanitizeProject = function (raw) {
    if (!isObj(raw) || !Array.isArray(raw.layers)) throw new Error('This is not a Chain Reaction project (no "layers" list).');
    const R = makeReport();
    for (const k of Object.keys(raw)) if (BAD_KEYS.has(k)) R.add('Unsafe keys were removed');
    const p = {
      format: 'chain-reaction-workbench',
      version: num(raw.version ?? 1, 1, 1000, 1, R, 'file version'),
      name: text(raw.name ?? 'Untitled project', LIMITS.name, R, 'project name'),
      activeLayerId: cleanId(raw.activeLayerId, R),
      layers: [],
    };
    if (own(raw, 'appVersion')) p.appVersion = text(raw.appVersion, 20, R, 'app version');
    if (own(raw, 'speed')) p.speed = num(raw.speed, 0.1, 8, 1, R, 'speed');
    if (own(raw, 'challengeId')) p.challengeId = cleanId(raw.challengeId, R); // a built-in challenge
    if (own(raw, 'solutionShown')) p.solutionShown = !!raw.solutionShown;
    if (isObj(raw.challenge)) {
      const c = raw.challenge;
      let allowed = 'all';
      if (Array.isArray(c.allowed)) {
        allowed = c.allowed.slice(0, LIMITS.allowedTypes).filter((t) => typeof t === 'string' && CR.types[t]);
        if (allowed.length < c.allowed.length) R.add('Unknown challenge pieces were dropped');
      }
      p.challenge = { on: !!c.on, allowed };
    }
    let layers = raw.layers;
    if (layers.length > LIMITS.layers) { R.add(`Only the first ${LIMITS.layers} layers were kept`); layers = layers.slice(0, LIMITS.layers); }
    let total = 0;
    for (const L of layers) {
      if (!isObj(L)) { R.add('Broken layers were dropped'); continue; }
      let objs = Array.isArray(L.objects) ? L.objects : [];
      if (objs.length > LIMITS.objectsPerLayer) { R.add(`Layers were limited to ${LIMITS.objectsPerLayer} objects`); objs = objs.slice(0, LIMITS.objectsPerLayer); }
      if (total + objs.length > LIMITS.objectsTotal) { R.add(`The project was limited to ${LIMITS.objectsTotal} objects`); objs = objs.slice(0, Math.max(0, LIMITS.objectsTotal - total)); }
      const objects = objs.map((o) => sanitizeObject(o, R)).filter(Boolean);
      total += objects.length;
      p.layers.push({
        id: cleanId(L.id, R),
        name: text(L.name ?? 'Layer', LIMITS.name, R, 'layer name'),
        open: L.open !== false,
        world: sanitizeWorld(L.world, R),
        objects,
      });
    }
    return { project: p, fixes: R.list() };
  };

  /*
   * A challenge file (see CHALLENGE-PROMPT.md): { format: 'chain-reaction-challenges', id, name,
   * challenges: [{ id, name, difficulty, project, solution: [[objects to add] per layer], ... }] }.
   * Each project goes through sanitizeProject and each solution object through the same object
   * check, so a challenge file is held to exactly the same limits as a project file.
   */
  const DIFFICULTIES = ['easy', 'medium', 'hard', 'very hard'];
  CR.sanitizeChallengeSet = function (raw) {
    if (!isObj(raw) || raw.format !== 'chain-reaction-challenges' || !Array.isArray(raw.challenges)) {
      throw new Error('This is not a Chain Reaction challenge file (it needs "format": "chain-reaction-challenges" and a "challenges" list).');
    }
    const R = makeReport();
    let list = raw.challenges;
    if (list.length > LIMITS.challenges) { R.add(`Only the first ${LIMITS.challenges} challenges were kept`); list = list.slice(0, LIMITS.challenges); }
    const set = {
      format: 'chain-reaction-challenges', version: 1,
      id: cleanId(raw.id, R) || 'set',
      name: text(raw.name ?? 'Challenges', LIMITS.name, R, 'set name'),
      author: text(raw.author ?? '', LIMITS.name, R, 'author'),
      description: text(raw.description ?? '', 300, R, 'description'),
      challenges: [],
    };
    const seen = new Set();
    list.forEach((c, i) => {
      if (!isObj(c)) { R.add('Broken challenges were dropped'); return; }
      const id = cleanId(c.id, R);
      if (!id || seen.has(id)) { R.add('Challenges without a unique id were dropped'); return; }
      let checked;
      try { checked = CR.sanitizeProject(c.project); } catch (e) { R.add('Challenges without a valid project were dropped'); return; }
      checked.fixes.forEach((f) => R.add(f));
      const project = checked.project;
      const solution = (Array.isArray(c.solution) ? c.solution : []).slice(0, project.layers.length).map((objs) => {
        if (!Array.isArray(objs)) return [];
        if (objs.length > LIMITS.objectsPerLayer) R.add('Solutions were shortened');
        return objs.slice(0, LIMITS.objectsPerLayer).map((o) => sanitizeObject(o, R)).filter(Boolean);
      });
      const allowed = (Array.isArray(c.allowed) ? c.allowed : (project.challenge && project.challenge.allowed) || []).filter((t) => typeof t === 'string' && CR.types[t]).slice(0, LIMITS.allowedTypes);
      seen.add(id);
      set.challenges.push({
        id, n: num(c.n ?? i + 1, 1, 100000, i + 1, R, 'challenge number'),
        name: text(c.name ?? `Challenge ${i + 1}`, LIMITS.name, R, 'challenge name'),
        difficulty: DIFFICULTIES.includes(c.difficulty) ? c.difficulty : 'medium',
        theme: text(c.theme ?? '', 40, R, 'theme'),
        emoji: text(c.emoji ?? '🧩', 8, R, 'emoji'),
        levels: project.layers.length,
        goal: text(c.goal ?? '', 200, R, 'goal'),
        objects: num(c.objects ?? 0, 0, 100000, 0, R, 'object count'),
        pieces: num(c.pieces ?? 0, 0, 100000, 0, R, 'piece count'),
        allowed,
        project,
        solution,
      });
    });
    return { set, fixes: R.list() };
  };
})();
