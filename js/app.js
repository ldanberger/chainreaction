/*
 * Editor / UI: toolkit, layers (tabs), work area, properties, commands, file I/O.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const D2R = CR.D2R;
  const G = CR.geom;
  const $ = (s) => document.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };

  const canvas = $('#canvas'), ctx = canvas.getContext('2d'), stage = $('#stage');
  const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8];
  const STORE_KEY = 'chainreaction.autosave.v1';
  const FORMAT = 'chain-reaction-workbench';

  const S = {
    project: null,
    selId: null,
    sim: null,
    running: false,
    speedIdx: 3,
    acc: 0,
    views: {},
    undo: [],
    redo: [],
    pending: null,
    savedSnap: '',
    fileHandle: null,
    snap: false,
    showPaths: true,
    dirty: true,
  };
  let dpr = 1, cw = 0, ch = 0;

  // ================================================================ project model
  CR.uid = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const defaultWorld = () => ({ width: 1600, height: 900, gravity: 1, floor: true, walls: false, background: '#e8f1f8' });
  const newLayer = (name) => ({ id: CR.uid('L'), name, open: true, world: defaultWorld(), objects: [] });
  function newProject() {
    const L = newLayer('Layer 1');
    return { format: FORMAT, version: 1, name: 'Untitled project', activeLayerId: L.id, layers: [L] };
  }
  CR.createObject = function (type, x, y) {
    const T = CR.types[type];
    const o = Object.assign({ id: CR.uid('o'), type }, T.defaults());
    if (T.path) o.points = o.points.map((p) => ({ x: Math.round(p.x + x), y: Math.round(p.y + y) }));
    else {
      const off = T.dropOffset || { x: 0, y: 0 };
      o.x = Math.round(x + off.x);
      o.y = Math.round(y + off.y);
    }
    return o;
  };
  function normalizeObject(o) {
    const T = CR.types[o.type];
    o.id = o.id || CR.uid('o');
    if (!T) return o;
    const d = T.defaults();
    if (T.path) {
      if (!Array.isArray(o.points) || o.points.length < 2) {
        const ox = +o.x || 0, oy = +o.y || 0;
        o.points = d.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
      }
      delete o.x; delete o.y; delete d.points;
    } else {
      o.x = +o.x || 0; o.y = +o.y || 0;
    }
    for (const k in d) if (o[k] === undefined) o[k] = d[k];
    return o;
  }
  function normalizeProject(p) {
    if (!p || !Array.isArray(p.layers)) throw new Error('This is not a Chain Reaction project (no "layers" list).');
    p.format = FORMAT;
    p.version = p.version || 1;
    p.name = p.name || 'Untitled project';
    for (const L of p.layers) {
      L.id = L.id || CR.uid('L');
      L.name = L.name || 'Layer';
      L.open = L.open !== false;
      L.world = Object.assign(defaultWorld(), L.world || {});
      L.objects = (L.objects || []).map(normalizeObject);
    }
    const act = p.layers.find((l) => l.id === p.activeLayerId && l.open);
    if (!act) p.activeLayerId = (p.layers.find((l) => l.open) || {}).id || null;
    return p;
  }
  const layer = () => (S.project ? S.project.layers.find((l) => l.id === S.project.activeLayerId) || null : null);
  const selObj = () => {
    const L = layer();
    return (L && L.objects.find((o) => o.id === S.selId)) || null;
  };
  const snapshot = () => JSON.stringify(S.project);
  const snapV = (v) => (S.snap ? Math.round(v / 10) * 10 : Math.round(v));

  // ================================================================ undo / autosave
  function beginEdit() { if (!S.pending) S.pending = snapshot(); }
  function endEdit() {
    if (!S.pending) return;
    const before = S.pending;
    S.pending = null;
    if (snapshot() !== before) {
      S.undo.push(before);
      if (S.undo.length > 150) S.undo.shift();
      S.redo = [];
      scheduleAutosave();
    }
    updateTopbar();
  }
  function edit(fn) {
    beginEdit();
    fn();
    changed();
    endEdit();
  }
  function changed() {
    if (S.sim) resetSim();
    S.dirty = true;
  }
  function restore(json) {
    S.project = normalizeProject(JSON.parse(json));
    resetSim();
    if (!selObj()) S.selId = null;
    $('#projName').value = S.project.name;
    renderTabs();
    buildProps();
    scheduleAutosave();
    S.dirty = true;
  }
  function undo() {
    endEdit();
    if (!S.undo.length) return;
    S.redo.push(snapshot());
    restore(S.undo.pop());
    updateTopbar();
  }
  function redo() {
    if (!S.redo.length) return;
    S.undo.push(snapshot());
    restore(S.redo.pop());
    updateTopbar();
  }
  let autosaveTimer = 0;
  function flushAutosave() {
    clearTimeout(autosaveTimer);
    try { localStorage.setItem(STORE_KEY, snapshot()); } catch (e) { /* storage unavailable */ }
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, snapshot()); } catch (e) { /* storage unavailable */ }
      updateTopbar();
    }, 400);
  }

  // ================================================================ view
  function computeFit(L) {
    const W = L.world, pad = 24;
    const sc = Math.min((cw - pad * 2) / W.width, (ch - pad * 2) / W.height);
    const scale = Math.max(0.05, isFinite(sc) && sc > 0 ? sc : 1);
    return { scale, ox: (cw - W.width * scale) / 2, oy: (ch - W.height * scale) / 2, auto: true };
  }
  function view() {
    const L = layer();
    if (!L) return { scale: 1, ox: 0, oy: 0 };
    return S.views[L.id] || (S.views[L.id] = computeFit(L));
  }
  function fitView() {
    const L = layer();
    if (L) S.views[L.id] = computeFit(L);
    S.dirty = true;
  }
  const toWorld = (cx, cy) => {
    const v = view();
    return { x: (cx - v.ox) / v.scale, y: (cy - v.oy) / v.scale };
  };
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const first = !cw;
    cw = r.width;
    ch = r.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    // views the user hasn't panned/zoomed keep fitting the window
    for (const id of Object.keys(S.views)) if (first || S.views[id].auto) delete S.views[id];
    S.dirty = true;
  }

  // ================================================================ rendering
  function editState(o) {
    const T = CR.types[o.type];
    if (T.path) {
      const p = o.points;
      return { x: p[0].x, y: p[0].y, angle: 0, facing: p.length > 1 && p[1].x < p[0].x ? -1 : 1, e: null, t: 0 };
    }
    return { x: o.x, y: o.y, angle: (o.angle || 0) * D2R, facing: o.direction < 0 ? -1 : 1, e: null, t: 0 };
  }
  function stateFor(o) {
    if (S.sim) {
      const e = S.sim.entById(o.id);
      if (e) return S.sim.stateOf(e);
    }
    return editState(o);
  }

  function drawGrid(W, v) {
    ctx.save();
    ctx.lineWidth = 1 / v.scale;
    for (let x = 0; x <= W.width; x += 50) {
      ctx.strokeStyle = x % 250 ? 'rgba(0,30,60,0.05)' : 'rgba(0,30,60,0.11)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, W.height); ctx.stroke();
    }
    for (let y = 0; y <= W.height; y += 50) {
      ctx.strokeStyle = y % 250 ? 'rgba(0,30,60,0.05)' : 'rgba(0,30,60,0.11)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W.width, y); ctx.stroke();
    }
    ctx.restore();
  }
  function drawGround(W) {
    if (W.floor !== false) {
      const top = CR.floorTop(W);
      const g = ctx.createLinearGradient(0, top, 0, W.height);
      g.addColorStop(0, '#8b6b4a');
      g.addColorStop(1, '#5d4630');
      ctx.fillStyle = g;
      ctx.fillRect(0, top, W.width, W.height - top);
      ctx.fillStyle = '#6aa84f';
      ctx.fillRect(0, top - 2, W.width, 5);
    }
    if (W.walls) {
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(0, 0, 6, W.height);
      ctx.fillRect(W.width - 6, 0, 6, W.height);
    }
  }
  function drawPathGuide(o, T, selected) {
    const pts = o.points;
    ctx.save();
    ctx.strokeStyle = T.pathColor || 'rgba(60,60,60,0.6)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.setLineDash([8, 6]);
    CR.draw.polyPath(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = T.pathColor || 'rgba(60,60,60,0.6)';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(6, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (o.loop && pts.length > 2) {
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.stroke();
    }
    ctx.restore();
  }
  function handlesFor(o) {
    const T = CR.types[o.type], hs = [];
    if (T.path) o.points.forEach((p, i) => hs.push({ kind: 'pt', i, x: p.x, y: p.y }));
    if (T.rot) {
      const pv = T.rot.pivot ? T.rot.pivot(o) : { x: o.x, y: o.y };
      const a = (o.angle || 0) * D2R + (T.rot.offset || 0), d = T.rot.dist(o);
      hs.push({ kind: 'rot', x: pv.x + Math.cos(a) * d, y: pv.y + Math.sin(a) * d, pivot: pv });
    }
    if (T.handles) for (const h of T.handles(o)) hs.push(Object.assign({ kind: 'custom' }, h));
    return hs;
  }
  function drawSelection(o) {
    const T = CR.types[o.type], v = view(), s = stateFor(o);
    const b = T.box(o, s);
    const px = 1 / v.scale;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([5 * px, 4 * px]);
    ctx.strokeRect(-b.w / 2 - 4 * px, -b.h / 2 - 4 * px, b.w + 8 * px, b.h + 8 * px);
    ctx.restore();
    if (S.sim) return;
    // dashed line to the object this one sets off (pinball links)
    const linked = o.link && layer().objects.find((x) => x.id === o.link);
    if (linked && CR.types[linked.type]) {
      const ls = editState(linked);
      ctx.save();
      ctx.strokeStyle = 'rgba(124,58,237,0.8)';
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ls.x, ls.y); ctx.stroke();
      ctx.restore();
    }
    for (const h of handlesFor(o)) {
      ctx.save();
      if (h.kind === 'custom') {
        if (h.ghost) {
          ctx.strokeStyle = 'rgba(37,99,235,0.6)';
          ctx.lineWidth = 2 * px;
          ctx.setLineDash([5 * px, 4 * px]);
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(h.x, h.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = h.ghost ? '#dbeafe' : '#fff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        if (h.round) ctx.arc(h.x, h.y, 6 * px, 0, Math.PI * 2);
        else ctx.rect(h.x - 5.5 * px, h.y - 5.5 * px, 11 * px, 11 * px);
        ctx.fill(); ctx.stroke();
      } else if (h.kind === 'rot') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2 * px;
        ctx.beginPath(); ctx.moveTo(h.pivot.x, h.pivot.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(h.x, h.y, 6 * px, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2 * px; ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(h.x, h.y, 2.2 * px, 0, Math.PI * 2); ctx.fill();
      } else {
        const first = h.i === 0, last = h.i === o.points.length - 1;
        ctx.fillStyle = first ? '#22c55e' : last ? '#ef4444' : '#fff';
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath(); ctx.arc(h.x, h.y, (first ? 6.5 : 5.5) * px, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = layer();
    $('#emptyState').hidden = !!L;
    if (!L) return;
    const v = view(), W = L.world;
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.scale, v.scale);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = W.background || '#e8f1f8';
    ctx.fillRect(0, 0, W.width, W.height);
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W.width, W.height);
    ctx.clip();
    if (!S.sim) drawGrid(W, v);
    drawGround(W);
    CR.floorY = W.floor !== false ? CR.floorTop(W) : null;
    if (S.showPaths && !S.sim) { // path guides are for editing; hidden while a run is in progress
      for (const o of L.objects) {
        const T = CR.types[o.type];
        if (T && T.path && T.showPath) drawPathGuide(o, T, o.id === S.selId);
      }
    }
    if (S.sim) {
      for (const e of S.sim.ents) e.T.draw(ctx, e.o, S.sim.stateOf(e));
      for (const x of S.sim.extras) CR.drawExtra(ctx, x);
      CR.drawParticles(ctx, S.sim.particles);
    } else {
      for (const o of L.objects) {
        const T = CR.types[o.type];
        if (T) T.draw(ctx, o, editState(o));
      }
      if (!L.objects.length) {
        ctx.fillStyle = 'rgba(30,50,70,0.35)';
        ctx.font = '600 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Drag objects from the Toolkit and drop them here', W.width / 2, W.height / 2 - 20);
      }
    }
    ctx.restore();
    const so = selObj();
    if (so && CR.types[so.type]) drawSelection(so);
    ctx.restore();
  }

  // ================================================================ hit testing
  let touchMode = false; // last canvas pointer was a finger: use bigger hit areas
  function hitObject(x, y) {
    const L = layer();
    if (!L) return null;
    const pad = (touchMode ? 10 : 3) / view().scale;
    for (let i = L.objects.length - 1; i >= 0; i--) {
      const o = L.objects[i], T = CR.types[o.type];
      if (!T) continue;
      const s = stateFor(o);
      if (T.hit ? T.hit(o, s, x, y, pad) : G.inBox(x, y, T.box(o, s), pad)) return o;
    }
    if (S.showPaths && !S.sim) {
      for (let i = L.objects.length - 1; i >= 0; i--) {
        const o = L.objects[i], T = CR.types[o.type];
        if (T && T.path && T.showPath && G.distToPoly(x, y, o.points).d <= pad + 3) return o;
      }
    }
    return null;
  }
  function hitHandle(o, p) {
    const r = (touchMode ? 20 : 9) / view().scale;
    const hs = handlesFor(o);
    for (let i = hs.length - 1; i >= 0; i--) if (Math.hypot(p.x - hs[i].x, p.y - hs[i].y) <= r) return hs[i];
    return null;
  }

  // ================================================================ object ops
  function getProp(o, k) {
    const T = CR.types[o.type];
    if (T && T.path && (k === 'x' || k === 'y')) return o.points[0][k];
    return o[k];
  }
  function setProp(o, k, v) {
    const T = CR.types[o.type];
    if (T && T.path && (k === 'x' || k === 'y')) {
      const d = v - o.points[0][k];
      o.points.forEach((p) => (p[k] += d));
    } else o[k] = v;
  }
  function moveObj(o, orig, dx, dy) {
    const T = CR.types[o.type];
    if (T.path) {
      const a = orig.points[0];
      const ndx = snapV(a.x + dx) - a.x, ndy = snapV(a.y + dy) - a.y;
      o.points = orig.points.map((p) => ({ x: p.x + ndx, y: p.y + ndy }));
    } else {
      o.x = snapV(orig.x + dx);
      o.y = snapV(orig.y + dy);
    }
  }
  function select(id) {
    if (S.selId === id) return;
    S.selId = id;
    buildProps();
    S.dirty = true;
  }
  function addObject(type, x, y) {
    const L = layer();
    if (!L) { toast('Open or create a layer first'); return; }
    edit(() => {
      const o = CR.createObject(type, snapV(x), snapV(y));
      L.objects.push(o);
      S.selId = o.id;
    });
    buildProps();
  }
  function deleteSelected() {
    const L = layer(), o = selObj();
    if (!o) return;
    edit(() => { L.objects = L.objects.filter((x) => x !== o); S.selId = null; });
    buildProps();
  }
  function duplicateSelected() {
    const L = layer(), o = selObj();
    if (!o) return;
    edit(() => {
      const c = JSON.parse(JSON.stringify(o));
      c.id = CR.uid('o');
      moveObj(c, JSON.parse(JSON.stringify(c)), 24, 24);
      L.objects.splice(L.objects.indexOf(o) + 1, 0, c);
      S.selId = c.id;
    });
    buildProps();
  }
  function reorderSelected(toFront) {
    const L = layer(), o = selObj();
    if (!o) return;
    edit(() => {
      L.objects = L.objects.filter((x) => x !== o);
      toFront ? L.objects.push(o) : L.objects.unshift(o);
    });
  }
  function nudge(dx, dy) {
    const o = selObj();
    if (!o) return;
    edit(() => moveObj(o, JSON.parse(JSON.stringify(o)), dx, dy));
    refreshPropValues();
  }

  // ================================================================ pointer interaction (mouse, pen, touch)
  let drag = null;
  let pinch = null;
  const pointers = new Map(); // active pointers on the canvas, for two-finger pinch
  let lastTap = { t: 0, x: 0, y: 0 };
  const canvasPt = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { cx: ev.clientX - r.left, cy: ev.clientY - r.top };
  };
  function startPinch() {
    const [a, b] = [...pointers.values()], v = view();
    pinch = {
      d: Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1,
      mx: (a.cx + b.cx) / 2, my: (a.cy + b.cy) / 2,
      scale: v.scale, ox: v.ox, oy: v.oy,
    };
  }
  function updatePinch() {
    const [a, b] = [...pointers.values()], v = view();
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1;
    const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
    const ns = Math.min(8, Math.max(0.05, pinch.scale * (d / pinch.d)));
    // keep the world point that was under the fingers' midpoint under it
    const wx = (pinch.mx - pinch.ox) / pinch.scale, wy = (pinch.my - pinch.oy) / pinch.scale;
    v.scale = ns;
    v.ox = mx - wx * ns;
    v.oy = my - wy * ns;
    v.auto = false;
    S.dirty = true;
  }
  /** Double-click / double-tap on a selected path: add a point on the line, or remove the point under it. */
  function editPathAt(cx, cy) {
    const o = selObj();
    if (!o || S.sim) return false;
    const T = CR.types[o.type];
    if (!T.path) return false;
    const p = toWorld(cx, cy);
    const h = hitHandle(o, p);
    if (h && h.kind === 'pt') {
      if (o.points.length <= (T.pathMin || 2)) toast(`A ${T.label.toLowerCase()} needs at least ${T.pathMin || 2} points`);
      else edit(() => o.points.splice(h.i, 1));
    } else {
      const r = G.distToPoly(p.x, p.y, o.points);
      if (r.d * view().scale > (touchMode ? 20 : 10)) return false;
      edit(() => o.points.splice(r.seg, 0, { x: snapV(r.x), y: snapV(r.y) }));
    }
    buildProps();
    return true;
  }
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerdown', (ev) => {
    if (!layer()) return;
    touchMode = ev.pointerType === 'touch';
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* pointer already gone */ }
    const { cx, cy } = canvasPt(ev), p = toWorld(cx, cy), v = view();
    pointers.set(ev.pointerId, { cx, cy });
    if (pointers.size === 2) {
      endDrag();
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    if (ev.button === 1 || ev.button === 2) {
      drag = { mode: 'pan', cx, cy, ox: v.ox, oy: v.oy };
      return;
    }
    if (ev.button !== 0) return;
    const now = performance.now();
    const isDouble = now - lastTap.t < 350 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < (touchMode ? 24 : 6);
    lastTap = { t: isDouble ? 0 : now, x: cx, y: cy };
    if (isDouble && editPathAt(cx, cy)) return;
    const so = selObj();
    if (so && !S.sim) {
      const h = hitHandle(so, p);
      if (h) {
        beginEdit();
        drag = { mode: h.kind, h, o: so, orig: JSON.parse(JSON.stringify(so)) };
        return;
      }
    }
    const o = hitObject(p.x, p.y);
    if (o) {
      select(o.id);
      beginEdit();
      drag = { mode: 'move', o, start: p, orig: JSON.parse(JSON.stringify(o)), moved: false };
    } else {
      select(null);
      drag = { mode: 'pan', cx, cy, ox: v.ox, oy: v.oy };
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const { cx, cy } = canvasPt(ev), p = toWorld(cx, cy);
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { cx, cy });
    if (pinch) {
      if (pointers.size >= 2) updatePinch();
      return;
    }
    if (layer() && ev.pointerType !== 'touch') $('#cursorVal').textContent = `x ${Math.round(p.x)}  y ${Math.round(p.y)}`;
    if (!drag) {
      if (ev.pointerType === 'touch') return;
      const so = selObj();
      let cur = 'default';
      if (so && !S.sim && hitHandle(so, p)) cur = 'pointer';
      else if (hitObject(p.x, p.y)) cur = S.sim ? 'pointer' : 'move';
      canvas.style.cursor = cur;
      return;
    }
    const v = view();
    if (drag.mode === 'pan') {
      if (cx !== drag.cx || cy !== drag.cy) v.auto = false;
      v.ox = drag.ox + cx - drag.cx;
      v.oy = drag.oy + cy - drag.cy;
      canvas.style.cursor = 'grabbing';
    } else if (drag.mode === 'move') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) * v.scale < (touchMode ? 6 : 3)) return;
      drag.moved = true;
      if (S.sim) resetSim();
      moveObj(drag.o, drag.orig, dx, dy);
      refreshPropValues();
    } else if (drag.mode === 'pt') {
      drag.o.points[drag.h.i] = { x: snapV(p.x), y: snapV(p.y) };
      refreshPropValues();
    } else if (drag.mode === 'custom') {
      CR.types[drag.o.type].dragHandle(drag.o, drag.orig, drag.h.id, p, snapV);
      refreshPropValues();
    } else if (drag.mode === 'rot') {
      const T = CR.types[drag.o.type];
      let deg = (Math.atan2(p.y - drag.h.pivot.y, p.x - drag.h.pivot.x) - (T.rot.offset || 0)) / D2R;
      deg = ((deg + 540) % 360) - 180;
      deg = ev.shiftKey || S.snap ? Math.round(deg / 15) * 15 : Math.round(deg);
      drag.o.angle = deg;
      refreshPropValues();
    }
    S.dirty = true;
  });
  function endDrag() {
    if (drag && drag.mode !== 'pan') {
      changed();
      endEdit();
    }
    drag = null;
  }
  const pointerEnd = (ev) => {
    pointers.delete(ev.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null; // remaining finger does nothing until lifted
      return;
    }
    endDrag();
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', (ev) => {
    if (!layer()) return;
    ev.preventDefault();
    const { cx, cy } = canvasPt(ev), v = view();
    const k = Math.exp(-ev.deltaY * 0.0015);
    const ns = Math.min(8, Math.max(0.05, v.scale * k));
    const f = ns / v.scale;
    v.ox = cx - (cx - v.ox) * f;
    v.oy = cy - (cy - v.oy) * f;
    v.scale = ns;
    v.auto = false;
    S.dirty = true;
  }, { passive: false });

  // ================================================================ toolkit
  function drawIcon(c, T, w, h) {
    const r = window.devicePixelRatio || 1;
    c.width = w * r;
    c.height = h * r;
    const g = c.getContext('2d');
    g.scale(r, r);
    g.translate(w / 2, h / 2);
    const fit = Math.min(w / 72, h / 48); // icons are designed for a 72x48 box
    g.scale(fit, fit);
    if (T.icon) { T.icon(g); return; }
    const o = Object.assign({ id: 'icon', type: T.type }, T.defaults());
    const sc = T.iconScale || (T.iconSize ? Math.min(62 / T.iconSize.w, 40 / T.iconSize.h) : 0.5);
    if (T.type === 'ramp') o.angle = -18;
    g.scale(sc, sc);
    if (T.path) {
      o.points = o.points.map((p) => ({ x: p.x, y: p.y }));
      T.draw(g, o, { x: 0, y: 0, angle: 0, facing: 1, e: null, t: 0 });
    } else {
      T.draw(g, o, { x: 0, y: T.type === 'cannon' ? 14 : 0, angle: (o.angle || 0) * D2R, facing: 1, e: null, t: 0 });
    }
  }
  function addAtCentre(type) {
    const p = toWorld(cw / 2, ch / 2);
    addObject(type, p.x, p.y);
  }
  const overStage = (x, y) => {
    const r = stage.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  /*
   * Mouse/pen: drag a card into the work area (pointer-based, so it behaves the
   * same in every browser). Touch: a tap adds the object to the middle of the
   * view; the finger stays free to scroll the toolkit.
   */
  function wireTool(card, T) {
    let td = null, lastType = 'mouse';
    card.addEventListener('pointerdown', (ev) => {
      lastType = ev.pointerType;
      if (ev.pointerType === 'touch' || ev.button !== 0) return;
      ev.preventDefault();
      card.setPointerCapture(ev.pointerId);
      td = { x: ev.clientX, y: ev.clientY, ghost: null };
    });
    card.addEventListener('pointermove', (ev) => {
      if (!td) return;
      if (!td.ghost) {
        if (Math.hypot(ev.clientX - td.x, ev.clientY - td.y) < 5) return;
        td.ghost = el('canvas', { class: 'tool-ghost' });
        drawIcon(td.ghost, T, 72, 48);
        document.body.append(td.ghost);
      }
      td.ghost.style.left = ev.clientX + 'px';
      td.ghost.style.top = ev.clientY + 'px';
      stage.classList.toggle('drop-target', overStage(ev.clientX, ev.clientY));
    });
    const finish = (ev, ok) => {
      if (!td) return;
      if (td.ghost) {
        td.ghost.remove();
        stage.classList.remove('drop-target');
        if (ok && overStage(ev.clientX, ev.clientY)) {
          const { cx, cy } = canvasPt(ev), p = toWorld(cx, cy);
          addObject(T.type, p.x, p.y);
        }
      }
      td = null;
    };
    card.addEventListener('pointerup', (ev) => finish(ev, true));
    card.addEventListener('pointercancel', (ev) => finish(ev, false));
    card.addEventListener('click', () => {
      if (lastType !== 'touch') return;
      addAtCentre(T.type);
      toast(`Added ${T.label} — drag it into place`);
    });
    card.addEventListener('dblclick', () => { if (lastType !== 'touch') addAtCentre(T.type); });
  }
  function buildToolkit() {
    const list = $('#toolList');
    list.innerHTML = '';
    const cats = {};
    for (const name of CR.typeOrder) {
      const T = CR.types[name];
      (cats[T.category || 'Other'] = cats[T.category || 'Other'] || []).push(T);
    }
    for (const [cat, arr] of Object.entries(cats)) {
      list.append(el('div', { class: 'tool-cat' }, cat));
      const grid = el('div', { class: 'tool-grid' });
      for (const T of arr) {
        const c = el('canvas');
        drawIcon(c, T, 48, 34);
        const card = el('div', {
          class: 'tool', role: 'button', 'aria-label': T.label,
          title: `${T.label} — ${T.description}\n\nDrag into the work area, double-click (or tap) to add.`,
        }, c);
        wireTool(card, T);
        grid.append(card);
      }
      list.append(grid);
    }
    if (window.matchMedia('(pointer: coarse)').matches) $('#toolHint').textContent = 'tap to add';
  }

  // ================================================================ properties panel
  let propInputs = [];
  function makeInput(def, get, set) {
    let inp;
    const val = get();
    if (def.type === 'select') {
      inp = el('select');
      for (const [v, label] of def.options) inp.append(el('option', { value: String(v) }, label));
      inp.value = String(val);
      inp.addEventListener('change', () => {
        beginEdit();
        set(def.num ? Number(inp.value) : inp.value);
        changed();
        endEdit();
      });
    } else if (def.type === 'checkbox') {
      inp = el('input', { type: 'checkbox' });
      inp.checked = !!val;
      inp.addEventListener('change', () => { beginEdit(); set(inp.checked); changed(); endEdit(); });
    } else if (def.type === 'color') {
      inp = el('input', { type: 'color' });
      inp.value = /^#[0-9a-f]{6}$/i.test(val) ? val : '#888888';
      inp.addEventListener('input', () => { beginEdit(); set(inp.value); changed(); });
      inp.addEventListener('change', () => endEdit());
    } else if (def.type === 'key') {
      // press a key while this box has focus to assign it; Backspace/Delete clears it
      inp = el('input', { type: 'text', readOnly: true, class: 'key-input', placeholder: 'press a key' });
      inp.value = val ? CR.keyLabel(CR.normKey(val)) : '';
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Tab' || ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta') return;
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape') { inp.blur(); return; }
        const k = ev.key === 'Backspace' || ev.key === 'Delete' ? '' : CR.normKey(ev.key);
        edit(() => set(k));
        inp.value = k ? CR.keyLabel(k) : '';
        updateFlipButtons();
      });
    } else if (def.type === 'text') {
      inp = el('input', { type: 'text' });
      inp.value = val ?? '';
      inp.addEventListener('input', () => { beginEdit(); set(inp.value); changed(); });
      inp.addEventListener('change', () => endEdit());
    } else {
      inp = el('input', { type: 'number' });
      if (def.step != null) inp.step = def.step;
      if (def.min != null) inp.min = def.min;
      if (def.max != null) inp.max = def.max;
      inp.value = fmt(val);
      inp.addEventListener('input', () => {
        let v = parseFloat(inp.value);
        if (isNaN(v)) return;
        if (def.min != null) v = Math.max(def.min, v);
        if (def.max != null) v = Math.min(def.max, v);
        beginEdit();
        set(v);
        changed();
      });
      inp.addEventListener('change', () => { inp.value = fmt(get()); endEdit(); });
    }
    propInputs.push({ inp, def, get });
    return inp;
  }
  const fmt = (v) => (typeof v === 'number' ? String(+v.toFixed(4)) : v ?? '');
  function refreshPropValues() {
    for (const { inp, def, get } of propInputs) {
      if (inp === document.activeElement) continue;
      const v = get();
      if (def.type === 'checkbox') inp.checked = !!v;
      else if (def.type === 'key') inp.value = v ? CR.keyLabel(CR.normKey(v)) : '';
      else if (def.type === 'number') inp.value = fmt(v);
      else inp.value = String(v ?? '');
    }
    const pc = $('#pointCount');
    const o = selObj();
    if (pc && o && o.points) pc.textContent = o.points.length;
  }
  function row(def, inp) {
    const id = 'p_' + Math.random().toString(36).slice(2, 8);
    inp.id = id;
    const r = el('div', { class: 'prow' }, el('label', { htmlFor: id }, def.label), inp);
    if (def.hint) r.append(el('div', { class: 'hint' }, def.hint));
    return r;
  }
  function buildProps() {
    const o0 = selObj();
    $('#psProps').textContent = o0 && CR.types[o0.type] ? 'Properties · ' + CR.types[o0.type].label : 'Properties';
    const body = $('#propBody');
    body.innerHTML = '';
    propInputs = [];
    const L = layer();
    if (!L) {
      $('#propTitle').textContent = 'Properties';
      body.append(el('p', { class: 'prop-note' }, 'No layer is open.'));
      return;
    }
    const o = selObj();
    if (o && CR.types[o.type]) buildObjectProps(body, o);
    else buildLayerProps(body, L);
  }
  function buildObjectProps(body, o) {
    const T = CR.types[o.type];
    $('#propTitle').textContent = 'Properties — ' + T.label;
    const ic = el('canvas');
    drawIcon(ic, T, 48, 32);
    body.append(el('div', { class: 'prop-head' }, ic, el('div', {}, el('div', { class: 'name' }, T.label), el('div', { class: 'muted' }, o.id))));
    body.append(el('p', { class: 'prop-desc' }, T.description));
    for (let def of T.props) {
      if (def.type === 'objref') {
        const others = layer().objects.filter((x) => x.id !== o.id && CR.types[x.type]);
        const opts = [['', '(nothing)'], ...others.map((x) => {
          const st = editState(x);
          return [x.id, `${CR.types[x.type].label} @ ${Math.round(st.x)}, ${Math.round(st.y)}`];
        })];
        def = Object.assign({}, def, { type: 'select', options: opts });
      }
      body.append(row(def, makeInput(def, () => getProp(o, def.key), (v) => setProp(o, def.key, v))));
    }
    if (T.path) {
      body.append(el('hr', { class: 'prop-sep' }));
      const pc = el('b', { id: 'pointCount' }, String(o.points.length));
      body.append(el('div', { class: 'prop-note' }, 'Path points: ', pc, ' — drag points in the work area; double-click the line to add one, double-click a point to remove it.'));
      body.append(el('div', { class: 'prop-actions' },
        el('button', { class: 'btn small', onclick: () => {
          edit(() => {
            const p = o.points, a = p[p.length - 2], b = p[p.length - 1];
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            p.push({ x: Math.round(b.x + (dx / d) * 100), y: Math.round(b.y + (dy / d) * 100) });
          });
          refreshPropValues();
        } }, '+ Point'),
        el('button', { class: 'btn small', onclick: () => {
          if (o.points.length <= (T.pathMin || 2)) return;
          edit(() => o.points.pop());
          refreshPropValues();
        } }, '− Point'),
        el('button', { class: 'btn small', onclick: () => { edit(() => o.points.reverse()); refreshPropValues(); } }, 'Reverse'),
      ));
    }
    body.append(el('hr', { class: 'prop-sep' }));
    body.append(el('div', { class: 'prop-actions' },
      el('button', { class: 'btn small', onclick: duplicateSelected, title: 'Ctrl+D' }, 'Duplicate'),
      el('button', { class: 'btn small', onclick: () => reorderSelected(true) }, 'To front'),
      el('button', { class: 'btn small', onclick: () => reorderSelected(false) }, 'To back'),
      el('button', { class: 'btn small danger', onclick: deleteSelected, title: 'Delete' }, 'Delete'),
    ));
  }
  function buildLayerProps(body, L) {
    $('#propTitle').textContent = 'Properties — Layer';
    body.append(el('p', { class: 'prop-desc' }, 'Nothing selected. These settings apply to the whole layer. Click an object to edit it.'));
    const W = L.world;
    const defs = [
      [{ key: 'name', label: 'Layer name', type: 'text' }, () => L.name, (v) => { L.name = v; renderTabs(); }],
      [{ key: 'width', label: 'Width', type: 'number', step: 50, min: 200, max: 20000 }, () => W.width, (v) => { W.width = v; }],
      [{ key: 'height', label: 'Height', type: 'number', step: 50, min: 200, max: 20000 }, () => W.height, (v) => { W.height = v; }],
      [{ key: 'gravity', label: 'Gravity', type: 'number', step: 0.1, min: -5, max: 5, hint: '1 = normal, 0 = space' }, () => W.gravity, (v) => { W.gravity = v; }],
      [{ key: 'floor', label: 'Floor', type: 'checkbox' }, () => W.floor, (v) => { W.floor = v; }],
      [{ key: 'walls', label: 'Side walls', type: 'checkbox' }, () => W.walls, (v) => { W.walls = v; }],
      [{ key: 'background', label: 'Background', type: 'color' }, () => W.background, (v) => { W.background = v; }],
    ];
    for (const [def, get, set] of defs) body.append(row(def, makeInput(def, get, set)));
    body.append(el('p', { class: 'prop-note' }, `${L.objects.length} object${L.objects.length === 1 ? '' : 's'} in this layer.`));
    body.append(el('div', { class: 'prop-actions' },
      el('button', { class: 'btn small', onclick: fitView }, 'Fit view'),
      el('button', { class: 'btn small danger', onclick: () => {
        if (!L.objects.length || !confirm(`Remove all ${L.objects.length} objects from "${L.name}"?`)) return;
        edit(() => { L.objects = []; S.selId = null; });
        buildProps();
      } }, 'Clear layer'),
    ));
  }

  // ================================================================ layers (tabs)
  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    for (const L of S.project.layers) {
      if (!L.open) continue;
      const name = el('span', { class: 'tname', title: 'Double-click to rename' }, L.name);
      const t = el('div', { class: 'tab' + (L.id === S.project.activeLayerId ? ' active' : ''), onclick: () => activateLayer(L.id) },
        name,
        el('button', { class: 'x', title: 'Close tab (layer stays in the project)', onclick: (ev) => { ev.stopPropagation(); closeLayer(L); } }, '×'));
      name.addEventListener('dblclick', (ev) => { ev.stopPropagation(); inlineRename(name, L); });
      tabs.append(t);
    }
    renderLayerMenu();
    updateTopbar();
  }
  function inlineRename(span, L) {
    const inp = el('input', { type: 'text', value: L.name });
    span.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (ok && v && v !== L.name) edit(() => { L.name = v; });
      renderTabs();
      buildProps();
    };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); ev.stopPropagation(); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (ev) => ev.stopPropagation());
  }
  function activateLayer(id) {
    const L = S.project.layers.find((l) => l.id === id);
    if (!L) return;
    L.open = true;
    if (S.project.activeLayerId !== id) {
      S.project.activeLayerId = id;
      S.selId = null;
      resetSim();
    }
    renderTabs();
    buildProps();
    scheduleAutosave();
    S.dirty = true;
  }
  function closeLayer(L) {
    L.open = false;
    if (S.project.activeLayerId === L.id) {
      const open = S.project.layers.filter((l) => l.open);
      const idx = S.project.layers.indexOf(L);
      const next = open.find((l) => S.project.layers.indexOf(l) > idx) || open[open.length - 1];
      S.project.activeLayerId = next ? next.id : null;
      S.selId = null;
      resetSim();
    }
    renderTabs();
    buildProps();
    scheduleAutosave();
    S.dirty = true;
  }
  function addLayer() {
    const n = S.project.layers.length + 1;
    let name = 'Layer ' + n, i = n;
    while (S.project.layers.some((l) => l.name === name)) name = 'Layer ' + ++i;
    const L = newLayer(name);
    edit(() => { S.project.layers.push(L); });
    activateLayer(L.id);
  }
  function duplicateLayer(L) {
    const c = JSON.parse(JSON.stringify(L));
    c.id = CR.uid('L');
    c.name = L.name + ' copy';
    c.open = true;
    c.objects.forEach((o) => (o.id = CR.uid('o')));
    edit(() => S.project.layers.splice(S.project.layers.indexOf(L) + 1, 0, c));
    activateLayer(c.id);
  }
  function deleteLayer(L) {
    if (!confirm(`Delete layer "${L.name}" and its ${L.objects.length} objects? (Undo is available.)`)) return;
    edit(() => {
      const wasActive = S.project.activeLayerId === L.id;
      S.project.layers = S.project.layers.filter((l) => l !== L);
      if (wasActive) {
        S.project.activeLayerId = (S.project.layers.find((l) => l.open) || {}).id || null;
        S.selId = null;
      }
    });
    renderTabs();
    buildProps();
  }
  function renderLayerMenu() {
    const m = $('#layerMenu');
    m.innerHTML = '';
    m.append(el('div', { class: 'mtitle' }, 'All layers'));
    for (const L of S.project.layers) {
      const r = el('div', { class: 'lrow' + (L.open ? '' : ' closed') + (L.id === S.project.activeLayerId ? ' active' : '') },
        el('button', { title: L.open ? 'Close tab' : 'Open tab', onclick: (ev) => { ev.stopPropagation(); L.open ? closeLayer(L) : activateLayer(L.id); } }, L.open ? '◉' : '○'),
        el('span', { class: 'lname', title: L.open ? 'Show this layer' : 'Open this layer', onclick: () => { activateLayer(L.id); m.hidden = true; } }, L.name),
        el('span', { class: 'count', title: 'Objects' }, String(L.objects.length)),
        el('button', { title: 'Rename', onclick: () => { const v = prompt('Layer name', L.name); if (v && v.trim()) { edit(() => (L.name = v.trim())); renderTabs(); buildProps(); } } }, '✎'),
        el('button', { title: 'Duplicate layer', onclick: () => { duplicateLayer(L); } }, '⧉'),
        el('button', { title: 'Delete layer', onclick: () => deleteLayer(L) }, '🗑'),
      );
      m.append(r);
    }
    m.append(el('hr'));
    m.append(el('button', { class: 'btn', onclick: () => { m.hidden = true; addLayer(); } }, '+ New layer'));
  }
  $('#btnLayers').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const m = $('#layerMenu');
    renderLayerMenu();
    m.hidden = !m.hidden;
  });
  $('#layerMenu').addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => { $('#layerMenu').hidden = true; });
  $('#btnAddLayer').addEventListener('click', addLayer);
  $('#btnEmptyNew').addEventListener('click', addLayer);

  // ================================================================ simulation commands
  function ensureSim() {
    if (S.sim) return S.sim;
    const L = layer();
    if (!L) return null;
    if (!window.Matter) {
      toast('Physics engine failed to load — lib/matter.min.js is missing');
      return null;
    }
    S.sim = new CR.Sim(L);
    return S.sim;
  }
  function resetSim() {
    S.sim = null;
    S.running = false;
    S.acc = 0;
    updateCmd();
    S.dirty = true;
  }
  function restart() {
    const wasRunning = S.running;
    endEdit();
    resetSim();
    if (wasRunning && ensureSim()) S.running = true;
    updateCmd();
  }
  function step(n = 1) {
    endEdit();
    const sim = ensureSim();
    if (!sim) return;
    S.running = false;
    for (let i = 0; i < n; i++) sim.step();
    S.dirty = true;
    updateCmd();
  }
  function toggleRun() {
    endEdit();
    if (S.running) S.running = false;
    else if (ensureSim()) {
      S.running = true;
      S.acc = 0;
    }
    updateCmd();
  }
  function setSpeed(d) {
    S.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, S.speedIdx + d));
    updateCmd();
  }
  // ---- pinball: paddle keys, on-screen flipper buttons, score
  function paddleKeys() {
    const L = layer(), ks = new Set();
    if (L) for (const o of L.objects) if (o.type === 'paddle' && o.key) ks.add(CR.normKey(o.key));
    return ks;
  }
  let flipSig = null;
  function updateFlipButtons() {
    const keys = [...paddleKeys()];
    const sig = keys.join('|');
    if (sig === flipSig) return;
    flipSig = sig;
    const box = $('#flipBtns');
    box.innerHTML = '';
    for (const k of keys) {
      const b = el('button', { class: 'cmd flip', title: `Flip paddles bound to "${CR.keyLabel(k)}" (hold)` }, CR.keyLabel(k));
      const down = (ev) => { ev.preventDefault(); CR.input.keys.add(k); b.classList.add('on'); };
      const up = () => { CR.input.keys.delete(k); b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (ev) => ev.preventDefault());
      box.append(b);
    }
  }
  function updateCmd() {
    updateFlipButtons();
    const L = layer();
    const pinball = L && L.objects.some((o) => CR.types[o.type] && CR.types[o.type].category === 'Pinball');
    $('#scoreVal').hidden = !pinball;
    if (pinball) $('#scoreVal').textContent = 'Score ' + (S.sim ? S.sim.score : 0).toLocaleString();
    $('#btnRun').innerHTML = S.running ? '&#x23F8; Pause' : '&#x25B6; Run';
    const sp = SPEEDS[S.speedIdx];
    $('#speedVal').textContent = (sp < 1 ? sp : sp.toFixed(0)) + '×';
    $('#btnSlower').disabled = S.speedIdx === 0;
    $('#btnFaster').disabled = S.speedIdx === SPEEDS.length - 1;
    const t = S.sim ? S.sim.t : 0;
    $('#timeVal').innerHTML = `t = ${t.toFixed(2)} s<span class="frame-part"> · frame ${S.sim ? S.sim.frame : 0}</span>`;
    $('#statusVal').textContent = S.running ? 'Running' : S.sim ? 'Paused — edit anything to reset' : 'Editing';
  }
  $('#btnRestart').addEventListener('click', restart);
  $('#btnStep').addEventListener('click', (ev) => step(ev.shiftKey ? 10 : 1));
  $('#btnRun').addEventListener('click', toggleRun);
  $('#btnSlower').addEventListener('click', () => setSpeed(-1));
  $('#btnFaster').addEventListener('click', () => setSpeed(1));

  function frame() {
    if (S.running && S.sim) {
      S.acc += SPEEDS[S.speedIdx];
      let n = 0;
      while (S.acc >= 1 && n < 12) {
        S.sim.step();
        S.acc -= 1;
        n++;
      }
      if (n === 12) S.acc = 0;
      S.dirty = true;
      updateCmd();
    }
    if (S.dirty) {
      S.dirty = false;
      render();
    }
    requestAnimationFrame(frame);
  }

  // ================================================================ files
  function isDirty() { return snapshot() !== S.savedSnap; }
  function markSaved() { S.savedSnap = snapshot(); updateTopbar(); }
  function updateTopbar() {
    $('#btnUndo').disabled = !S.undo.length;
    $('#btnRedo').disabled = !S.redo.length;
    document.title = (S.project && isDirty() ? '• ' : '') + (S.project ? S.project.name + ' — ' : '') + 'Chain Reaction Workbench';
  }
  function setProject(p, handle = null) {
    S.project = p;
    S.selId = null;
    S.views = {};
    S.undo = [];
    S.redo = [];
    S.pending = null;
    S.fileHandle = handle;
    resetSim();
    $('#projName').value = p.name;
    markSaved();
    renderTabs();
    buildProps();
    scheduleAutosave();
    S.dirty = true;
  }
  const confirmDiscard = () => !isDirty() || confirm('Discard unsaved changes to the current project?');
  function fileNameFor() {
    return ((S.project.name || 'chain-reaction').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'chain-reaction') + '.json';
  }
  const pickerTypes = [{ description: 'Chain Reaction project', accept: { 'application/json': ['.json'] } }];
  async function saveProject(saveAs) {
    endEdit();
    S.project.appVersion = CR.VERSION;
    const json = JSON.stringify(S.project, null, 2);
    if (!saveAs && S.fileHandle) {
      try {
        const w = await S.fileHandle.createWritable();
        await w.write(json);
        await w.close();
        markSaved();
        toast('Saved ' + S.fileHandle.name);
        return;
      } catch (e) { /* fall through to Save As */ }
    }
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: fileNameFor(), types: pickerTypes });
        const w = await h.createWritable();
        await w.write(json);
        await w.close();
        S.fileHandle = h;
        markSaved();
        toast('Saved ' + h.name);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: fileNameFor() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    markSaved();
    toast('Downloaded ' + fileNameFor());
  }
  function loadText(text, handle, label) {
    try {
      const p = normalizeProject(JSON.parse(text));
      setProject(p, handle);
      const unknown = new Set();
      p.layers.forEach((L) => L.objects.forEach((o) => { if (!CR.types[o.type]) unknown.add(o.type); }));
      toast(`Opened ${label || p.name}` + (unknown.size ? ` (unknown object types kept but hidden: ${[...unknown].join(', ')})` : ''));
    } catch (err) {
      alert('Could not open that file:\n' + err.message);
    }
  }
  async function openProject() {
    if (!confirmDiscard()) return;
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: pickerTypes });
        const f = await h.getFile();
        loadText(await f.text(), h, f.name);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    $('#fileInput').click();
  }
  $('#fileInput').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (f) loadText(await f.text(), null, f.name);
  });
  $('#btnNew').addEventListener('click', () => { if (confirmDiscard()) { setProject(newProject()); toast('New project'); } });
  $('#btnOpen').addEventListener('click', openProject);
  $('#btnSave').addEventListener('click', () => saveProject(false));
  $('#btnSaveAs').addEventListener('click', () => saveProject(true));
  $('#projName').addEventListener('input', (ev) => { S.project.name = ev.target.value; scheduleAutosave(); updateTopbar(); });
  $('#projName').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });

  function loadExample(i) {
    const ex = CR.examples[i];
    if (!ex || !confirmDiscard()) return;
    const p = normalizeProject(JSON.parse(JSON.stringify(ex.project)));
    setProject(p);
    toast('Loaded example: ' + ex.name);
  }
  function buildExamples() {
    const sel = $('#exampleSel');
    (CR.examples || []).forEach((ex, i) => sel.append(el('option', { value: String(i), title: ex.description || '' }, ex.name)));
    sel.addEventListener('change', () => {
      if (sel.value !== '') loadExample(+sel.value);
      sel.value = '';
    });
  }

  // ================================================================ misc UI
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnFit').addEventListener('click', fitView);

  // theme: light by default, remembered per browser
  const THEME_KEY = 'chainreaction.theme';
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const b = $('#btnTheme');
    b.innerHTML = t === 'dark' ? '&#x2600;' : '&#x263E;';
    b.title = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    S.dirty = true;
  }
  let theme = 'light';
  try { theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { /* storage unavailable */ }
  applyTheme(theme);
  $('#btnTheme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage unavailable */ }
  });
  $('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
  $('#snapChk').addEventListener('change', (ev) => (S.snap = ev.target.checked));
  $('#pathsChk').addEventListener('change', (ev) => { S.showPaths = ev.target.checked; S.dirty = true; });

  document.addEventListener('keyup', (ev) => CR.input.keys.delete(CR.normKey(ev.key)));
  window.addEventListener('blur', () => CR.input.keys.clear());
  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveProject(ev.shiftKey); return; }
    if (mod && ev.key.toLowerCase() === 'o') { ev.preventDefault(); openProject(); return; }
    if (typing || $('#helpDlg').open) return;
    if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicateSelected(); return; }
    if (mod) return;
    // paddle keys win over shortcuts while a run is in progress
    const pk = CR.normKey(ev.key);
    if (S.sim && paddleKeys().has(pk)) {
      ev.preventDefault();
      CR.input.keys.add(pk);
      return;
    }
    const big = ev.shiftKey ? 10 : 1;
    switch (ev.key) {
      case ' ': ev.preventDefault(); toggleRun(); break;
      case '.': case '>': step(ev.shiftKey ? 10 : 1); break;
      case 'r': case 'R': restart(); break;
      case '+': case '=': setSpeed(1); break;
      case '-': case '_': setSpeed(-1); break;
      case 'f': case 'F': fitView(); break;
      case 'Delete': case 'Backspace': ev.preventDefault(); deleteSelected(); break;
      case 'Escape': select(null); break;
      case 'ArrowLeft': if (selObj()) { ev.preventDefault(); nudge(-big, 0); } break;
      case 'ArrowRight': if (selObj()) { ev.preventDefault(); nudge(big, 0); } break;
      case 'ArrowUp': if (selObj()) { ev.preventDefault(); nudge(0, -big); } break;
      case 'ArrowDown': if (selObj()) { ev.preventDefault(); nudge(0, big); } break;
    }
  });

  // ================================================================ phone layout helpers
  // Toolkit / Properties switcher (only visible on small screens)
  document.querySelectorAll('#panelSwitch .ps-btn').forEach((b) => b.addEventListener('click', () => {
    $('#left').classList.toggle('show-props', b.dataset.panel === 'props');
    document.querySelectorAll('#panelSwitch .ps-btn').forEach((x) => x.classList.toggle('active', x === b));
  }));

  // collapsible top menu (file commands, examples, snap, paths) on small screens
  const topbar = $('#topbar');
  const setMenu = (open) => {
    topbar.classList.toggle('menu-open', open);
    $('#btnMenu').setAttribute('aria-expanded', String(open));
  };
  $('#btnMenu').addEventListener('click', (ev) => { ev.stopPropagation(); setMenu(!topbar.classList.contains('menu-open')); });
  $('#topMenu').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (ev.target.closest('button')) setMenu(false);
  });
  $('#exampleSel').addEventListener('change', () => setMenu(false));
  document.addEventListener('click', () => setMenu(false));

  // pull down on the top bar / tab bar to reload (home-screen apps have no browser refresh)
  (function pullToRefresh() {
    const ptr = $('#ptr'), label = ptr.querySelector('.ptr-text'), TRIGGER = 80;
    let startY = null, dy = 0;
    const show = (y, anim) => {
      ptr.classList.toggle('anim', !!anim);
      ptr.style.transform = `translate(-50%, ${Math.min(y, 110) - 60}px)`;
      ptr.style.opacity = y > 8 ? Math.min(1, y / TRIGGER) : 0;
    };
    for (const z of [$('#topbar'), $('#tabbar')]) {
      z.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1 || ev.target.closest('input, select, textarea, .menu, .top-menu')) return;
        startY = ev.touches[0].clientY;
        dy = 0;
      }, { passive: true });
    }
    document.addEventListener('touchmove', (ev) => {
      if (startY == null) return;
      dy = Math.max(0, (ev.touches[0].clientY - startY) * 0.6);
      show(dy, false);
      ptr.classList.toggle('ready', dy >= TRIGGER);
      label.textContent = dy >= TRIGGER ? 'Release to refresh' : 'Pull to refresh';
    }, { passive: true });
    const end = () => {
      if (startY == null) return;
      startY = null;
      if (dy >= TRIGGER) {
        ptr.classList.add('refreshing');
        label.textContent = 'Refreshing…';
        show(TRIGGER, true);
        endEdit();
        flushAutosave(); // the reload restores the project from autosave
        setTimeout(() => location.reload(), 250);
      } else show(0, true);
      dy = 0;
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  })();

  // ================================================================ boot
  function boot() {
    $('#versionVal').textContent = 'v' + CR.VERSION;
    $('#helpVersion').textContent = 'v' + CR.VERSION;
    resize();
    new ResizeObserver(() => { resize(); }).observe(stage);
    buildToolkit();
    buildExamples();
    // image-based objects finish loading after boot: refresh icons and the view when they arrive
    let assetTimer = 0;
    CR.onAssetsChanged = () => {
      clearTimeout(assetTimer);
      assetTimer = setTimeout(() => { buildToolkit(); if (selObj()) buildProps(); S.dirty = true; }, 30);
    };
    let p = null;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) p = normalizeProject(JSON.parse(saved));
    } catch (e) { p = null; }
    if (p) {
      setProject(p);
      S.savedSnap = '';
      updateTopbar();
    } else if (CR.examples && CR.examples.length) {
      setProject(normalizeProject(JSON.parse(JSON.stringify(CR.examples[0].project))));
    } else setProject(newProject());
    updateCmd();
    if (!window.Matter) toast('Physics engine failed to load — lib/matter.min.js is missing');
    requestAnimationFrame(frame);
  }

  // exposed for debugging / automated checks
  CR.app = { S, layer, view, loadExample, ensureSim, step, restart, normalizeProject };
  boot();
})();
