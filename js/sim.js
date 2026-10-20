/*
 * Simulation of one layer. Built fresh from the layer's design data, so
 * "Restart" is simply a new Sim. Uses a fixed timestep, so Step and Run
 * produce identical results.
 */
(function () {
  'use strict';
  const CR = window.CR;
  const DT = 1000 / 60;
  // keys currently held (paddles read this); filled by the app's keyboard / on-screen buttons
  CR.input = CR.input || { keys: new Set() };
  const MAX_PARTICLES = 2000;
  // collision categories: things like the elevator leave walkers and the ground to their own logic
  CR.CAT_WALKER = 0x0002;
  CR.CAT_GROUND = 0x0004;
  // seeded random numbers (wandering, lightning bolts), so Step and Run replay identically
  CR.hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  CR.rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Matter mixes friction per contact as min(a, b), which leaves a leaning row of
  // dominoes stuck against each other. Bodies flagged `crSlick` slide freely
  // against one another while keeping their own friction against everything else.
  function patchMatter() {
    const P = window.Matter && Matter.Pair;
    if (!P || P._crPatched) return;
    const orig = P.update;
    P.update = function (pair, collision, timestamp) {
      orig(pair, collision, timestamp);
      const a = pair.bodyA.parent || pair.bodyA, b = pair.bodyB.parent || pair.bodyB;
      if (a.crSlick && b.crSlick) {
        pair.friction = 0;
        pair.frictionStatic = 0;
      } else if (a.crGrip != null || b.crGrip != null) {
        pair.friction = Math.min(a.crGrip ?? 1, b.crGrip ?? 1);
        pair.frictionStatic = 0;
      }
    };
    P._crPatched = true;
  }

  class Sim {
    constructor(layer) {
      const { Engine, Bodies, Composite, Events } = Matter;
      patchMatter();
      this.layer = layer;
      this.W = layer.world;
      this.t = 0;
      this.frame = 0;
      this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
      this.engine.gravity.y = Number(this.W.gravity ?? 1);
      this.world = this.engine.world;
      this.ents = [];
      this.byBody = new Map();
      this.extras = [];
      this.particles = [];
      this.floating = [];
      this._group = 0;
      this._later = [];
      this.burning = new Map(); // body -> time it stops burning
      this.score = 0;

      const W = this.W, top = CR.floorTop(W);
      if (W.floor !== false) {
        Composite.add(this.world, Bodies.rectangle(W.width / 2, top + 50, W.width + 4000, 100, { isStatic: true, friction: 0.6, label: 'floor', collisionFilter: { category: CR.CAT_GROUND } }));
      }
      if (W.walls) {
        Composite.add(this.world, [
          Bodies.rectangle(-25, W.height / 2, 50, W.height * 4, { isStatic: true, label: 'wall' }),
          Bodies.rectangle(W.width + 25, W.height / 2, 50, W.height * 4, { isStatic: true, label: 'wall' }),
        ]);
      }

      for (const src of layer.objects) {
        const T = CR.types[src.type];
        if (!T) continue;
        const e = {
          o: JSON.parse(JSON.stringify(src)), T, id: src.id,
          triggered: false, active: false, done: false, activateAt: Infinity,
          facing: 1, phase: 0, contactFrame: -99,
        };
        e.k = CR.sizeOf(e.o);
        this.ents.push(e);
        if (T.build) T.build(e, this);
        if (e.body) {
          if (e.k !== 1) { // "Size": grow/shrink the body around its own centre
            const fixed = e.body.inertia === Infinity;
            Matter.Body.scale(e.body, e.k, e.k);
            if (fixed) Matter.Body.setInertia(e.body, Infinity);
          }
          Composite.add(this.world, e.body);
          this.byBody.set(e.body.id, e);
        }
      }
      this.substeps = this.ents.some((e) => e.T.substeps) ? 4 : 1;
      for (const e of this.ents) {
        if (e.o.trigger === 'start') {
          e.triggered = true;
          e.activateAt = Number(e.o.delay) || 0;
        }
      }
      // set-up that needs every object built and its trigger armed (e.g. a spaceship hiding its cargo)
      for (const e of this.ents) if (e.T.init) e.T.init(e, this);
      Events.on(this.engine, 'collisionStart', (ev) => this._collide(ev.pairs, true));
      Events.on(this.engine, 'collisionActive', (ev) => this._collide(ev.pairs, false));
    }

    entOf(body) { return this.byBody.get((body.parent || body).id); }
    entById(id) { return this.ents.find((e) => e.id === id); }
    nextGroup() { return -(++this._group); }

    isMoving(body) {
      body = body.parent || body;
      if (body.isStatic) return false;
      const e = this.entOf(body);
      if (e && e.T.kinematic) return e.active && !e.done;
      return body.speed > 0.25;
    }

    _collide(pairs, isStart) {
      for (const p of pairs) {
        const a = p.bodyA, b = p.bodyB;
        const ea = this.entOf(a), eb = this.entOf(b);
        if (ea && !(b.isSensor || a.isSensor)) ea.contactFrame = this.frame;
        if (eb && !(b.isSensor || a.isSensor)) eb.contactFrame = this.frame;
        if (isStart) {
          if (ea && this.isMoving(b)) this.touch(ea, false);
          if (eb && this.isMoving(a)) this.touch(eb, false);
          if (ea && eb && ea.o.trigger === 'by' && ea.o.by === eb.id) this.arm(ea); // "When touched by…" that one
          if (ea && eb && eb.o.trigger === 'by' && eb.o.by === ea.id) this.arm(eb);
          if (ea && ea.o.wander && !b.isSensor) this._bump(ea, a, b, p);
          if (eb && eb.o.wander && !a.isSensor) this._bump(eb, b, a, p);
          if (ea && ea.T.onHit) ea.T.onHit(ea, b.parent || b, this);
          if (eb && eb.T.onHit) eb.T.onHit(eb, a.parent || a, this);
        }
      }
    }

    /** Trigger an object by contact. `ignite` = fire or a fuse ending on it. */
    touch(e, ignite) {
      if (e.triggered) return;
      const tr = e.o.trigger;
      // "When touched by…" waits for its one chosen object, so neither bumps nor fire count
      if (tr === 'touch' || (ignite && e.T.ignitable && tr !== 'none' && tr !== 'by')) this.arm(e);
    }
    /** Start an object's trigger: it activates after its delay. */
    arm(e) {
      if (e.triggered) return;
      e.triggered = true;
      e.activateAt = this.t + (Number(e.o.delay) || 0);
    }

    /** Set off another object (pinball links): flips paddles, otherwise triggers unless "Never". */
    signal(e) {
      if (!e) return;
      if (e.T.onSignal) { e.T.onSignal(e, this); return; }
      if (e.triggered || e.o.trigger === undefined || e.o.trigger === 'none') return;
      e.triggered = true;
      e.activateAt = this.t + (Number(e.o.delay) || 0);
    }
    link(e) { if (e.o.link) this.signal(this.entById(e.o.link)); }
    addScore(n) { this.score += Number(n) || 0; }
    /** Run fn after this step's physics (e.g. to override a bounce the solver just computed). */
    later(fn) { this._later.push(fn); }

    /** Fire at (x, y): lights fuse starts and ignitable objects within r. */
    igniteNear(x, y, r, except) {
      for (const t of this.ents) {
        if (t === except || t.triggered) continue;
        if (t.T.type === 'fuse') {
          const q = t.o.points[0];
          if (Math.hypot(q.x - x, q.y - y) <= r) this.touch(t, true);
        } else if (t.body && t.T.ignitable) {
          const bd = t.body.bounds;
          if (x >= bd.min.x - r && x <= bd.max.x + r && y >= bd.min.y - r && y <= bd.max.y + r) this.touch(t, true);
        }
      }
    }
    /** Moving objects whose centre is inside the circle catch fire for a few seconds. */
    burnBodiesInside(x, y, r) {
      for (const b of Matter.Composite.allBodies(this.world)) {
        if (b.isStatic || b.isSensor) continue;
        if (Math.hypot(b.position.x - x, b.position.y - y) <= r) this.burning.set(b, this.t + 3);
      }
    }

    movingBodyNear(x, y, r) {
      for (const b of Matter.Composite.allBodies(this.world)) {
        if (b.isStatic) continue;
        const bd = b.bounds;
        if (x < bd.min.x - r || x > bd.max.x + r || y < bd.min.y - r || y > bd.max.y + r) continue;
        if (this.isMoving(b)) return true;
      }
      return false;
    }

    fuseEnd(e) {
      const pts = e.o.points, p = pts[pts.length - 1], R = 24;
      this.emit(p.x, p.y, 'spark', 18, { speed: 3 });
      for (const x of this.ents) {
        if (x === e) continue;
        if (x.T.type === 'fuse') {
          const q = x.o.points[0];
          if (Math.hypot(q.x - p.x, q.y - p.y) <= R) this.touch(x, true);
        } else if (x.body) {
          const bd = x.body.bounds;
          if (p.x >= bd.min.x - R && p.x <= bd.max.x + R && p.y >= bd.min.y - R && p.y <= bd.max.y + R) this.touch(x, true);
        }
      }
    }

    // ---- kinematic helpers (runner, dragon)
    float(body) { this.floating.push(body); }
    hold(e, x, y) {
      const { Body } = Matter;
      Body.setPosition(e.body, { x, y });
      Body.setVelocity(e.body, { x: 0, y: 0 });
      this.float(e.body);
    }
    initPathActor(e) {
      const pts = e.o.points;
      e.body.collisionFilter.category = CR.CAT_WALKER;
      e.idx = 1;
      e.restX = pts[0].x;
      e.restY = pts[0].y;
      e.facing = pts.length > 1 && pts[1].x < pts[0].x ? -1 : 1;
    }
    /** A wandering actor touched something: remember the normal pointing away from it. */
    _bump(e, mine, other, pair) {
      const n = pair.collision && pair.collision.normal;
      if (!n) return;
      const me = mine.parent || mine, it = other.parent || other;
      const away = (me.position.x - it.position.x) * n.x + (me.position.y - it.position.y) * n.y;
      e.bumpN = away < 0 ? { x: -n.x, y: -n.y } : { x: n.x, y: n.y };
    }

    /**
     * "Wander randomly": roam anywhere from the first path point, turning now and then and
     * bouncing off whatever it bumps into. Flyers roam in 2D, walkers along the ground.
     */
    wander(e) {
      const { Body } = Matter;
      // "ground" keeps its height; "free" roams in 2D (true, from older files: flyers free, walkers ground)
      const o = e.o, b = e.body, W = this.W;
      const flies = o.wander === 'free' || (o.wander === true && !!e.T.flies);
      if (!e.active || e.done) { this.hold(e, e.restX + (e.offX || 0), e.restY + (e.offY || 0)); return; }
      const sp = Math.max(0, +o.speed || 0) / 60;
      if (!e.wd) {
        const p = o.points;
        let dx = p.length > 1 ? p[1].x - p[0].x : 1, dy = flies && p.length > 1 ? p[1].y - p[0].y : 0;
        if (!flies || Math.hypot(dx, dy) < 1e-6) { dx = dx < 0 ? -1 : 1; dy = 0; }
        const d = Math.hypot(dx, dy);
        e.wd = { x: dx / d, y: dy / d };
        e.rand = CR.rng(CR.hash(e.id));
        e.turnAt = this.t + 1 + e.rand() * 2.5;
        e.lastPos = { x: b.position.x, y: b.position.y };
        e.stuck = 0;
      }
      const d = e.wd, R = e.rand;
      const turn = (a) => { const c = Math.cos(a), s = Math.sin(a); const x = d.x * c - d.y * s; d.y = d.x * s + d.y * c; d.x = x; };
      if (e.bumpN) { // bounce off what it hit
        const n = e.bumpN, dot = d.x * n.x + d.y * n.y;
        e.bumpN = null;
        if (flies) {
          if (dot < 0) { d.x -= 2 * dot * n.x; d.y -= 2 * dot * n.y; turn((R() - 0.5) * 0.6); }
        } else if (Math.abs(n.x) > 0.5 && d.x * n.x < 0) d.x = -d.x;
      }
      // pushing against something it can't move: turn round
      const moved = Math.hypot(b.position.x - e.lastPos.x, b.position.y - e.lastPos.y);
      e.stuck = sp > 0.2 && moved < sp * 0.3 ? e.stuck + 1 : 0;
      if (e.stuck > 6) { d.x = -d.x; d.y = -d.y; if (flies) turn((R() - 0.5) * 1.2); e.stuck = 0; }
      if (this.t >= e.turnAt) { // now and then, change course
        if (flies) turn((R() - 0.5) * 1.8);
        else if (R() < 0.35) d.x = -d.x;
        e.turnAt = this.t + 1 + R() * 3;
      }
      if (!flies) { d.y = 0; d.x = d.x < 0 ? -1 : 1; }
      else { const L = Math.hypot(d.x, d.y) || 1; d.x /= L; d.y /= L; }
      // stay inside the world (flying things keep well clear of the ground; walkers can touch it)
      const m = 40, nx = b.position.x + d.x * sp * 8, ny = b.position.y + d.y * sp * 8;
      const low = CR.floorTop(W) - (e.T.flies ? 150 : (b.bounds.max.y - b.bounds.min.y) / 2 + 2);
      if ((nx < m && d.x < 0) || (nx > W.width - m && d.x > 0)) d.x = -d.x;
      if (flies && ((ny < m && d.y < 0) || (ny > low && d.y > 0))) d.y = -d.y;
      e.lastPos = { x: b.position.x, y: b.position.y };
      Body.setVelocity(b, { x: d.x * sp, y: d.y * sp });
      this.float(b);
      if (Math.abs(d.x) > 0.05) e.facing = d.x > 0 ? 1 : -1;
      e.phase += sp * 0.09;
    }

    /*
     * Path actors can be carried (e.g. by an elevator): while `paused` they stand exactly at
     * `holdAt`, and offX/offY shift their whole path by however far they were carried.
     */
    followPath(e) {
      const { Body } = Matter;
      const o = e.o, b = e.body, pts = o.points, ox = e.offX || 0, oy = e.offY || 0;
      if (e.paused) { const h = e.holdAt || b.position; this.hold(e, h.x, h.y); return; }
      if (o.wander) { this.wander(e); return; }
      if (!e.active || e.done || pts.length < 2) {
        this.hold(e, e.restX + ox, e.restY + oy);
        return;
      }
      const sp = Math.max(0, +o.speed || 0) / 60;
      const at = (i) => ({ x: pts[i].x + ox, y: pts[i].y + oy });
      let tgt = at(e.idx);
      let dx = tgt.x - b.position.x, dy = tgt.y - b.position.y, d = Math.hypot(dx, dy);
      let guard = pts.length + 1;
      while (d <= sp && guard-- > 0) {
        e.idx++;
        if (e.idx >= pts.length) {
          if (o.loop) e.idx = 0;
          else {
            e.done = true;
            e.restX = tgt.x - ox;
            e.restY = tgt.y - oy;
            this.hold(e, tgt.x, tgt.y);
            return;
          }
        }
        tgt = at(e.idx);
        dx = tgt.x - b.position.x; dy = tgt.y - b.position.y; d = Math.hypot(dx, dy);
      }
      if (d < 1e-6 || sp === 0) {
        this.hold(e, b.position.x, b.position.y);
        return;
      }
      Body.setVelocity(b, { x: (dx / d) * sp, y: (dy / d) * sp });
      this.float(b);
      if (Math.abs(dx) > 0.5) e.facing = dx > 0 ? 1 : -1;
      e.phase += sp * 0.09;
    }

    addExtra(body, info) {
      Matter.Composite.add(this.world, body);
      this.extras.push(Object.assign({ body }, info));
    }

    emit(x, y, kind, n, opt = {}) {
      for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
        const a = (opt.dir ?? 0) + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2);
        const sp = (opt.speed ?? 2) * (0.4 + Math.random() * 0.8);
        const life = Math.round((opt.life ?? PDEF[kind].life) * (0.6 + Math.random() * 0.6));
        this.particles.push({
          x, y, kind, life, max: life,
          vx: Math.cos(a) * sp + (opt.vx || 0),
          vy: Math.sin(a) * sp + (opt.vy || 0),
          size: PDEF[kind].size * (0.7 + Math.random() * 0.6),
          col: opt.col || (kind === 'confetti' ? CONFETTI[(Math.random() * CONFETTI.length) | 0] : null),
        });
      }
    }

    step() {
      const { Engine, Composite } = Matter;
      for (const e of this.ents) {
        if (e.triggered && !e.active && this.t >= e.activateAt - 1e-9) {
          e.active = true;
          if (e.T.activate) e.T.activate(e, this);
          if (e.o.goal && this.goalAt == null) this.goalAt = this.t; // "Completes the challenge"
        }
      }
      for (const e of this.ents) if (e.T.update) e.T.update(e, this);

      // physics, in substeps when fast-moving parts (paddles) need them to avoid tunnelling
      const g = this.engine.gravity, n = this.substeps;
      // Matter clears forces after every update, so forces set this frame (balloon lift, fan push)
      // are re-applied in each substep
      const forces = n > 1 ? Composite.allBodies(this.world).filter((b) => b.force.x || b.force.y).map((b) => [b, b.force.x, b.force.y]) : [];
      for (let k = 0; k < n; k++) {
        if (k) for (const [b, fx, fy] of forces) { b.force.x += fx; b.force.y += fy; }
        for (const e of this.ents) if (e.T.substep) e.T.substep(e, this, n);
        for (const b of this.floating) { // cancel gravity on kinematic bodies
          b.force.x -= b.mass * g.x * g.scale;
          b.force.y -= b.mass * g.y * g.scale;
        }
        Engine.update(this.engine, DT / n);
        for (const fn of this._later.splice(0)) fn();
      }
      this.floating.length = 0;

      for (const e of this.ents) if (e.T.post) e.T.post(e, this);

      // objects set alight by a ring of fire trail flames and light what they touch
      for (const [b, until] of this.burning) {
        if (this.t > until) { this.burning.delete(b); continue; }
        const r = b.circleRadius || Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
        this.emit(b.position.x, b.position.y, 'fire', 2, { speed: 0.8, life: 16, vx: -b.velocity.x * 0.3, vy: -0.6 });
        this.igniteNear(b.position.x, b.position.y, r + 8, this.entOf(b));
      }

      // particles
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i], d = PDEF[p.kind];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += d.g;
        p.vx *= d.drag;
        p.vy *= d.drag;
        p.size += d.grow;
        if (--p.life <= 0) {
          ps[i] = ps[ps.length - 1];
          ps.pop();
        }
      }

      // drop cannonballs that fell out of the world
      const limit = this.W.height + 1000;
      for (let i = this.extras.length - 1; i >= 0; i--) {
        const x = this.extras[i];
        if (x.body.position.y > limit || Math.abs(x.body.position.x - this.W.width / 2) > this.W.width * 2) {
          Composite.remove(this.world, x.body);
          this.burning.delete(x.body);
          this.extras.splice(i, 1);
        }
      }

      this.frame++;
      this.t = (this.frame * DT) / 1000;
    }

    /**
     * True when nothing is happening: no particles, nothing waiting on a delay or busy
     * (burning fuse, shots left, ...) and every loose body is at rest or gone out of the world.
     */
    isIdle() {
      if (this.particles.length || this.burning.size || (this.pendingLayer && !this.pendingLayer.done)) return false;
      for (const e of this.ents) {
        if (e.triggered && !e.active) return false;
        if (e.T.busy && e.T.busy(e, this)) return false;
      }
      const W = this.W;
      for (const b of Matter.Composite.allBodies(this.world)) {
        if (b.isStatic) continue;
        const p = b.position;
        if (p.y < -1000 || p.y > W.height + 1000 || p.x < -W.width || p.x > W.width * 2) continue;
        if (b.speed > 0.08 || b.angularSpeed > 0.004) return false;
      }
      return true;
    }

    /** A gateway was reached: the app switches to `layerId` (and runs it) once sim time reaches `at`. */
    requestLayer(layerId, at) {
      if (!this.pendingLayer) this.pendingLayer = { layerId, at };
    }

    stateOf(e) {
      if (e.body) {
        const b = e.body;
        return { x: b.position.x, y: b.position.y, angle: b.angle, facing: e.facing, e, t: this.t };
      }
      return { x: 0, y: 0, angle: 0, facing: 1, e, t: this.t };
    }
  }

  const PDEF = {
    spark: { life: 16, size: 2.2, g: 0.12, drag: 0.96, grow: -0.08 },
    flash: { life: 10, size: 7, g: 0, drag: 0.85, grow: 0.4 },
    smoke: { life: 55, size: 6, g: -0.025, drag: 0.97, grow: 0.25 },
    fire: { life: 24, size: 7, g: -0.04, drag: 0.985, grow: 0.35 },
    dust: { life: 30, size: 3.5, g: 0.02, drag: 0.94, grow: 0.12 },
    confetti: { life: 90, size: 3, g: 0.07, drag: 0.96, grow: 0 },
    rain: { life: 80, size: 1, g: 0.05, drag: 1, grow: 0 },
    coin: { life: 80, size: 4.5, g: 0.2, drag: 0.99, grow: 0 },
    snow: { life: 400, size: 2.4, g: 0, drag: 1, grow: 0 },
    fw: { life: 55, size: 2.6, g: 0.03, drag: 0.97, grow: -0.02 },
  };
  const CONFETTI = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

  function particleStyle(p) {
    const f = p.life / p.max;
    switch (p.kind) {
      case 'spark': return `rgba(255,${(170 + 85 * f) | 0},70,${f})`;
      case 'flash': return `rgba(255,${(200 + 55 * f) | 0},120,${f})`;
      case 'smoke': return `rgba(110,110,115,${0.45 * f})`;
      case 'dust': return `rgba(150,120,90,${0.55 * f})`;
      case 'confetti': return p.col;
      case 'rain': return 'rgba(147,197,253,0.75)';
      case 'coin': return '#facc15';
      case 'snow': return 'rgba(255,255,255,0.95)';
      case 'fw': return p.col || '#fde047';
      case 'fire':
        if (f > 0.75) return `rgba(255,246,176,${0.95})`;
        if (f > 0.5) return `rgba(255,176,48,${0.9})`;
        if (f > 0.25) return `rgba(226,70,31,${0.8 * f + 0.3})`;
        return `rgba(90,80,80,${f * 1.2})`;
    }
    return '#fff';
  }

  CR.drawParticles = function (ctx, ps) {
    ctx.save();
    for (const p of ps) {
      ctx.fillStyle = particleStyle(p);
      if (p.kind === 'rain') { // falling streaks
        ctx.strokeStyle = particleStyle(p);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'fw') { // firework sparks: bright, fading
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (p.kind === 'snow') { // drifting flakes (the sway is just for looks)
        ctx.beginPath();
        ctx.arc(p.x + Math.sin((p.max - p.life) * 0.07 + p.size * 9) * 3, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.kind === 'coin') { // spinning gold coins
        const w = Math.max(0.6, p.size * Math.abs(Math.cos(p.life * 0.35)));
        ctx.globalAlpha = Math.min(1, p.life / 15);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, w, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      if (p.kind === 'confetti') { // little tumbling paper squares
        const w = p.size * Math.abs(Math.cos(p.life * 0.3));
        ctx.globalAlpha = Math.min(1, p.life / 20);
        ctx.fillRect(p.x - w / 2, p.y - p.size / 2, w + 0.5, p.size);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  CR.drawExtra = function (ctx, x) {
    const b = x.body, r = b.circleRadius || 8;
    if (x.color) { // e.g. clods of dirt from a tipper truck
      ctx.fillStyle = x.color;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const g = ctx.createRadialGradient(b.position.x - r * 0.35, b.position.y - r * 0.4, r * 0.1, b.position.x, b.position.y, r);
    g.addColorStop(0, '#8a8f99');
    g.addColorStop(1, '#16181c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  CR.Sim = Sim;
})();
