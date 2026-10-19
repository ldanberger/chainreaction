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
        Composite.add(this.world, Bodies.rectangle(W.width / 2, top + 50, W.width + 4000, 100, { isStatic: true, friction: 0.6, label: 'floor' }));
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
        this.ents.push(e);
        if (T.build) T.build(e, this);
        if (e.body) {
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
          if (ea && ea.T.onHit) ea.T.onHit(ea, b.parent || b, this);
          if (eb && eb.T.onHit) eb.T.onHit(eb, a.parent || a, this);
        }
      }
    }

    /** Trigger an object by contact. `ignite` = fire or a fuse ending on it. */
    touch(e, ignite) {
      if (e.triggered) return;
      const tr = e.o.trigger;
      if (tr === 'touch' || (ignite && e.T.ignitable && tr !== 'none')) {
        e.triggered = true;
        e.activateAt = this.t + (Number(e.o.delay) || 0);
      }
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
      e.idx = 1;
      e.restX = pts[0].x;
      e.restY = pts[0].y;
      e.facing = pts.length > 1 && pts[1].x < pts[0].x ? -1 : 1;
    }
    followPath(e) {
      const { Body } = Matter;
      const o = e.o, b = e.body, pts = o.points;
      if (!e.active || e.done || pts.length < 2) {
        this.hold(e, e.restX, e.restY);
        return;
      }
      const sp = Math.max(0, +o.speed || 0) / 60;
      let tgt = pts[e.idx];
      let dx = tgt.x - b.position.x, dy = tgt.y - b.position.y, d = Math.hypot(dx, dy);
      let guard = pts.length + 1;
      while (d <= sp && guard-- > 0) {
        e.idx++;
        if (e.idx >= pts.length) {
          if (o.loop) e.idx = 0;
          else {
            e.done = true;
            e.restX = tgt.x;
            e.restY = tgt.y;
            this.hold(e, tgt.x, tgt.y);
            return;
          }
        }
        tgt = pts[e.idx];
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
        });
      }
    }

    step() {
      const { Engine, Composite } = Matter;
      for (const e of this.ents) {
        if (e.triggered && !e.active && this.t >= e.activateAt - 1e-9) {
          e.active = true;
          if (e.T.activate) e.T.activate(e, this);
        }
      }
      for (const e of this.ents) if (e.T.update) e.T.update(e, this);

      // physics, in substeps when fast-moving parts (paddles) need them to avoid tunnelling
      const g = this.engine.gravity, n = this.substeps;
      for (let k = 0; k < n; k++) {
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
  };

  function particleStyle(p) {
    const f = p.life / p.max;
    switch (p.kind) {
      case 'spark': return `rgba(255,${(170 + 85 * f) | 0},70,${f})`;
      case 'flash': return `rgba(255,${(200 + 55 * f) | 0},120,${f})`;
      case 'smoke': return `rgba(110,110,115,${0.45 * f})`;
      case 'dust': return `rgba(150,120,90,${0.55 * f})`;
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
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  CR.drawExtra = function (ctx, x) {
    const b = x.body, r = b.circleRadius || 8;
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
