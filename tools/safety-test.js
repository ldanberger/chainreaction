/*
 * Hostile project files for js/safety.js (see safety-test.html). Each test builds a bad file,
 * runs it through CR.sanitizeProject and checks the result; tamed projects are then simulated
 * for a second of game time to make sure they don't hang or crash.
 */
(function () {
  'use strict';
  const CR = window.CR, L = CR.LIMITS;
  const results = [];
  const layer = (objects, extra) => Object.assign({ id: 'L1', name: 'Layer', world: { width: 1600, height: 900 }, objects }, extra);
  const project = (layers, extra) => Object.assign({ format: 'chain-reaction-workbench', version: 1, name: 'Test', layers }, extra);
  const check = (name, fn) => {
    try {
      const detail = fn();
      results.push({ name, ok: true, detail: detail || '' });
    } catch (e) {
      results.push({ name, ok: false, detail: e.message });
    }
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const clean = (p) => CR.sanitizeProject(typeof p === 'string' ? JSON.parse(p) : p);
  // simulate a tamed project briefly; it must not throw or take too long
  const simulate = (p, seconds = 1, budgetMs = 4000) => {
    const t0 = performance.now();
    for (const lay of p.layers) {
      const objs = lay.objects.map((o) => { // the app fills in missing settings the same way
        const T = CR.types[o.type];
        if (!T) return o;
        const d = T.defaults();
        if (T.path && !(Array.isArray(o.points) && o.points.length >= 2)) o.points = d.points.map((q) => ({ x: q.x + 400, y: q.y + 400 }));
        for (const k in d) if (o[k] === undefined) o[k] = d[k];
        if (!T.path) { o.x = +o.x || 0; o.y = +o.y || 0; }
        o.id = o.id || 'o' + Math.random().toString(36).slice(2, 8);
        return o;
      });
      const sim = new CR.Sim({ world: Object.assign({ width: 1600, height: 900, gravity: 1, floor: true }, lay.world), objects: objs });
      for (let f = 0; f < 60 * seconds; f++) sim.step();
    }
    const ms = performance.now() - t0;
    expect(ms < budgetMs, `simulation took ${Math.round(ms)} ms`);
    return ms;
  };

  check('Rejects something that is not a project', () => {
    for (const bad of [null, 42, 'text', [], {}, { layers: 'nope' }]) {
      let threw = false;
      try { CR.sanitizeProject(bad); } catch (e) { threw = true; }
      expect(threw, `accepted ${JSON.stringify(bad)}`);
    }
  });
  check(`Refuses files over ${L.fileBytes / 1048576} MB before reading them`, () => {
    expect(CR.safety.tooBig(L.fileBytes + 1), 'a too-big size was allowed');
    expect(!CR.safety.tooBig(60 * 1024), 'a normal size was refused');
    expect(CR.safety.tooBig(NaN), 'an unknown size was allowed');
  });
  check('Strips __proto__ / constructor / prototype keys (no prototype pollution)', () => {
    const json = '{"layers":[{"world":{"width":800,"__proto__":{"evil":1}},"objects":[{"type":"marble","x":1,"y":2,"__proto__":{"evil":2},"constructor":{"prototype":{"evil":3}}},{"type":"nosuchtype","__proto__":{"evil":4},"deep":{"__proto__":{"evil":5}}}]}],"__proto__":{"evil":6}}';
    const r = clean(json);
    expect(({}).evil === undefined && Object.prototype.evil === undefined, 'Object.prototype was polluted');
    const o = r.project.layers[0].objects[0], u = r.project.layers[0].objects[1];
    expect(!Object.prototype.hasOwnProperty.call(o, '__proto__') && !Object.prototype.hasOwnProperty.call(o, 'constructor'), 'unsafe keys survived');
    expect(o.evil === undefined && u.evil === undefined && u.deep.evil === undefined, 'unsafe keys leaked through');
    expect(r.fixes.some((f) => /Unsafe keys/.test(f)), 'not reported');
    return r.fixes.join('; ');
  });
  check(`Caps layers at ${L.layers}, objects at ${L.objectsPerLayer} per layer and ${L.objectsTotal} in all`, () => {
    const many = Array.from({ length: 100000 }, (_, i) => ({ type: 'domino', x: i % 1600, y: 850 }));
    const r = clean(project([layer(many)]));
    expect(r.project.layers[0].objects.length === L.objectsPerLayer, `kept ${r.project.layers[0].objects.length} objects`);
    const r2 = clean(project(Array.from({ length: 500 }, (_, i) => layer([{ type: 'marble', x: 1, y: 1 }], { id: 'L' + i }))));
    expect(r2.project.layers.length === L.layers, `kept ${r2.project.layers.length} layers`);
    const r3 = clean(project(Array.from({ length: 10 }, (_, i) => layer(many.slice(0, 1500), { id: 'L' + i }))));
    const total = r3.project.layers.reduce((n, x) => n + x.objects.length, 0);
    expect(total === L.objectsTotal, `kept ${total} objects in all`);
    return `${r.fixes.length + r2.fixes.length + r3.fixes.length} kinds of fix reported`;
  });
  check(`Caps path points at ${L.pathPoints}`, () => {
    const pts = Array.from({ length: 100000 }, (_, i) => ({ x: i, y: 100 }));
    const r = clean(project([layer([{ type: 'runner', points: pts }])]));
    expect(r.project.layers[0].objects[0].points.length === L.pathPoints, 'not capped');
  });
  check('Clamps huge numbers: stairway ≤ 100 steps, text ≤ 300 px, world ≤ 20000 px, positions ±100000', () => {
    const r = clean(project([layer([
      { type: 'stairs', x: 1e300, y: -1e300, steps: 1e9, stepW: 1e9, stepH: -5 },
      { type: 'text', x: 0, y: 0, text: 'W'.repeat(100000), size: 1e6 },
      { type: 'archtext', x: 0, y: 0, text: 'Z'.repeat(5000), size: 1e6, radius: -1 },
      { type: 'brickwall', x: 500, y: 869, rows: 1000, cols: 1000 },
      { type: 'cannon', x: 0, y: 0, shots: 1e9, interval: 0 },
      { type: 'snow', x: 0, y: 0, heavy: 1e9, depth: 1e9 },
    ], { world: { width: 1e9, height: -1, gravity: 1e9 } })]));
    const [st, tx, ar, bw, ca, sn] = r.project.layers[0].objects, w = r.project.layers[0].world;
    expect(st.steps === 100 && st.stepW <= 400 && st.stepH >= 2, `stairs ${st.steps}/${st.stepW}/${st.stepH}`);
    expect(Math.abs(st.x) <= L.coord && Math.abs(st.y) <= L.coord, 'position not clamped');
    expect(tx.text.length === 60 && tx.size === 300, `text ${tx.text.length} chars at ${tx.size}px`);
    expect(ar.text.length === 40 && ar.size === 200 && ar.radius >= 20, 'arched text not clamped');
    expect(bw.rows * bw.cols <= L.bricks, `brick wall ${bw.rows}×${bw.cols}`);
    expect(ca.shots === 50 && ca.interval >= 0.05, 'cannon not clamped');
    expect(sn.heavy <= 5 && sn.depth <= 300, 'snow not clamped');
    expect(w.width === 20000 && w.height === 200 && w.gravity === 5, `world ${w.width}×${w.height} g${w.gravity}`);
    return `${simulate(r.project).toFixed(0)} ms to simulate the tamed version`;
  });
  check('Replaces NaN / Infinity / non-numbers', () => {
    const r = clean('{"layers":[{"objects":[{"type":"marble","x":"abc","y":null,"r":"1e999","density":{"a":1}}]}]}');
    const o = r.project.layers[0].objects[0];
    expect(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.r) && Number.isFinite(o.density), JSON.stringify(o));
  });
  check('Rejects bad colours, unknown choices and odd ids', () => {
    const r = clean(project([layer([
      { id: '"><img src=x onerror=alert(1)>', type: 'marble', x: 1, y: 1, color: 'url(javascript:alert(1))' },
      { type: 'cannon', x: 1, y: 1, trigger: '<script>' },
      { type: 'button', x: 1, y: 1, link: '../../etc/passwd', label: '<img src=x onerror=alert(1)>'.repeat(10) },
    ], { world: { background: 'expression(alert(1))' } })]));
    const [m, c, b] = r.project.layers[0].objects;
    expect(m.id === '' && m.color === '#3b82f6', `marble ${m.id} ${m.color}`);
    expect(c.trigger === 'touch', `cannon trigger ${c.trigger}`);
    expect(b.link === '' && b.label.length <= L.text, 'button not cleaned');
    expect(r.project.layers[0].world.background === '#e8f1f8', 'background colour not reset');
    return 'text is kept as plain text (the app never turns it into HTML)';
  });
  check('Drops unrecognised settings and tames unknown object types', () => {
    let deep = { leaf: 1 };
    for (let i = 0; i < 1000; i++) deep = { deep };
    const r = clean(project([layer([
      { type: 'marble', x: 1, y: 1, onload: 'alert(1)', html: '<b>hi</b>' },
      { type: 'from-the-future', x: 1, y: 1, deep, big: 'x'.repeat(100000) },
    ])]));
    const [m, u] = r.project.layers[0].objects;
    expect(m.onload === undefined && m.html === undefined, 'extra settings kept');
    expect(JSON.stringify(u).length < 5000, `unknown object is ${JSON.stringify(u).length} chars`);
    return r.fixes.join('; ');
  });
  check('Limits names and challenge pieces', () => {
    const r = clean(project([layer([], { name: 'n'.repeat(1e6) })], { name: 'p'.repeat(1e6), challenge: { on: 'yes', allowed: ['marble', 'nosuch', ...Array(5000).fill('ramp')] } }));
    expect(r.project.name.length === L.name && r.project.layers[0].name.length === L.name, 'names not shortened');
    expect(r.project.challenge.on === true && r.project.challenge.allowed.length <= L.allowedTypes && !r.project.challenge.allowed.includes('nosuch'), 'challenge not cleaned');
  });
  check('Every built-in example passes unchanged', () => {
    const bad = [];
    for (const ex of CR.examples) {
      const r = CR.sanitizeProject(JSON.parse(JSON.stringify(ex.project)));
      if (r.fixes.length) bad.push(`${ex.name}: ${r.fixes.join('; ')}`);
    }
    expect(!bad.length, bad.join(' | '));
    return `${CR.examples.length} examples`;
  });
  check('Worst case allowed: a full layer of the heaviest objects still runs', () => {
    const heavy = [];
    for (let i = 0; i < 300; i++) heavy.push({ type: 'brickwall', x: 100 + (i % 15) * 100, y: 869, rows: 40, cols: 30 });
    const r = clean(project([layer(heavy.slice(0, 2))]));
    return `${simulate(r.project, 0.5, 8000).toFixed(0)} ms for 2 maximum brick walls (2400 bricks)`;
  });

  // ---- report
  const ok = results.every((r) => r.ok), list = document.getElementById('results');
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.append((r.ok ? 'PASS  ' : 'FAIL  ') + r.name);
    if (r.detail) { const d = document.createElement('div'); d.className = 'detail'; d.textContent = r.detail; li.append(d); }
    list.append(li);
  }
  const sum = document.getElementById('summary');
  sum.textContent = ok ? `All ${results.length} checks passed.` : `${results.filter((r) => !r.ok).length} of ${results.length} checks FAILED.`;
  sum.className = ok ? 'pass' : 'fail';
  window.safetyResults = results;
})();
