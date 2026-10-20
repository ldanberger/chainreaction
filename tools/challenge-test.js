/*
 * Checks every challenge in a challenge file (see challenge-test.html): unsolved as it comes,
 * solved with its stored solution. Starts with the built-in set; a file can be chosen on the page.
 * CR.solveChallenge(c, withSolution) is also handy from the console.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const LAYER_SECONDS = 60;
  const IDLE_FRAMES = 150; // the app stops a run after 3 s (180 frames at 1x) with nothing moving; stricter here

  // the same clean-up the app does: safety check, then fill in missing settings
  function prepare(project) {
    const p = CR.sanitizeProject(JSON.parse(JSON.stringify(project))).project;
    let n = 0;
    for (const L of p.layers) {
      L.world = Object.assign({ width: 1600, height: 900, gravity: 1, floor: true, walls: false, background: '#e8f1f8' }, L.world);
      L.objects = L.objects.map((o) => {
        const T = CR.types[o.type];
        if (!T) return o;
        const d = T.defaults();
        o.id = o.id || 'auto' + n++;
        if (T.path && !(Array.isArray(o.points) && o.points.length >= 2)) o.points = d.points;
        delete d.points;
        for (const k in d) if (o[k] === undefined) o[k] = d[k];
        if (!T.path) { o.x = +o.x || 0; o.y = +o.y || 0; }
        if (typeof o.wander === 'boolean') o.wander = o.wander ? (T.flies ? 'free' : 'ground') : '';
        return o;
      });
    }
    return p;
  }

  /** Run a challenge from its first layer, through gateways; returns { solved, at, layer, note }. */
  CR.solveChallenge = function (c, withSolution) {
    const proj = JSON.parse(JSON.stringify(c.project));
    if (withSolution) proj.layers.forEach((L, i) => { L.objects.push(...JSON.parse(JSON.stringify(c.solution[i] || []))); });
    const p = prepare(proj);
    let li = 0, total = 0, guard = 0;
    while (li < p.layers.length && guard++ < 10) {
      const sim = new CR.Sim(p.layers[li]);
      let next = null, idle = 0;
      for (let f = 0; f < 60 * LAYER_SECONDS; f++) {
        sim.step();
        if (sim.goalAt != null) return { solved: true, at: total + sim.t, layer: li + 1 };
        const pl = sim.pendingLayer;
        if (pl && sim.t >= pl.at - 1e-9) { next = pl.layerId ? p.layers.findIndex((L) => L.id === pl.layerId) : li + 1; break; }
        idle = sim.isIdle() ? idle + 1 : 0;
        if (idle >= IDLE_FRAMES) break; // the app would stop the run here
      }
      total += sim.t;
      if (next == null || next < 0) return { solved: false, layer: li + 1, note: next == null ? `stuck on level ${li + 1} at ${sim.t.toFixed(1)}s` : 'gateway to nowhere' };
      li = next;
    }
    return { solved: false, layer: li + 1, note: 'ran out of levels' };
  };

  const list = document.getElementById('results'), sum = document.getElementById('summary');
  let results = [], challenges = [], i = 0, runId = 0;
  function start(set, fixes) {
    challenges = set.challenges;
    results = window.challengeResults = [];
    window.challengeTestDone = false;
    i = 0;
    list.textContent = '';
    if (fixes && fixes.length) {
      const li = document.createElement('li');
      li.className = 'fail';
      li.textContent = 'The safety check had to adjust this file: ' + fixes.join('; ');
      list.append(li);
    }
    const my = ++runId;
    setTimeout(() => nextBatch(my), 50);
  }
  function nextBatch(my) {
    if (my !== runId) return; // a newer file was chosen
    const t0 = performance.now();
    while (i < challenges.length && performance.now() - t0 < 300) {
      const c = challenges[i++];
      let r;
      try {
        const as = CR.solveChallenge(c, false), sol = CR.solveChallenge(c, true);
        const ok = !as.solved && sol.solved;
        r = { id: c.id, name: c.name, ok, detail: (as.solved ? `SOLVED WITHOUT HELP at ${as.at.toFixed(1)}s; ` : '') + (sol.solved ? `solution works (${sol.at.toFixed(1)}s)` : `SOLUTION FAILS: ${sol.note}`) };
      } catch (e) {
        r = { id: c.id, name: c.name, ok: false, detail: 'ERROR ' + e.message };
      }
      results.push(r);
      const li = document.createElement('li');
      li.className = r.ok ? 'pass' : 'fail';
      li.append(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} [${c.difficulty}${c.levels > 1 ? `, ${c.levels} levels` : ''}]`);
      const d = document.createElement('div'); d.className = 'detail'; d.textContent = r.detail; li.append(d);
      list.append(li);
    }
    const bad = results.filter((r) => !r.ok).length;
    sum.textContent = `${results.length} / ${challenges.length} checked, ${bad} failing`;
    if (i < challenges.length) setTimeout(() => nextBatch(my), 0);
    else {
      sum.textContent = bad ? `${bad} of ${results.length} challenges FAILED.` : `All ${results.length} challenges passed.`;
      sum.className = bad ? 'fail' : 'pass';
      window.challengeTestDone = true;
    }
  }
  document.getElementById('setFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      if (CR.safety.tooBig(f.size)) throw new Error('the file is over the size limit');
      const r = CR.sanitizeChallengeSet(JSON.parse(await f.text()));
      sum.textContent = `Checking “${r.set.name}”…`;
      sum.className = '';
      start(r.set, r.fixes);
    } catch (e) {
      sum.textContent = 'Could not read that challenge file: ' + e.message;
      sum.className = 'fail';
    }
  });
  if (location.hash !== '#lab') start(CR.sanitizeChallengeSet(window.CR_CHALLENGE_DATA).set); // #lab: just load, for console experiments
})();
