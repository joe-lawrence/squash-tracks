/**
 * Presentation UI + scrub ramp shared by `editor.html` and `player.html`.
 * Depends on `WorkoutPresentation` from `workoutPresentation.js`.
 */
(function (global) {
  "use strict";

  const PRES_SVG_PLAY =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3" /></svg>';
  const PRES_SVG_PAUSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></svg>';

  const PRES_SCRUB_SPEED_START = 4;
  const PRES_SCRUB_SPEED_CAP = 64;
  const PRES_SCRUB_RAMP_T0 = 0.4;
  const PRES_SCRUB_RAMP_T1 = 1.15;
  const PRES_SCRUB_RAMP_T2 = 2.35;
  const PRES_SCRUB_RAMP_T3 = 4.5;
  const PRES_SCRUB_RAMP_T4 = 6.0;

  function scrubSpeedMultiplier(elapsedWallSec) {
    const e = Math.max(0, elapsedWallSec);
    if (e < PRES_SCRUB_RAMP_T0) return PRES_SCRUB_SPEED_START;
    if (e < PRES_SCRUB_RAMP_T1) {
      const u = (e - PRES_SCRUB_RAMP_T0) / (PRES_SCRUB_RAMP_T1 - PRES_SCRUB_RAMP_T0);
      return PRES_SCRUB_SPEED_START + (8 - PRES_SCRUB_SPEED_START) * u;
    }
    if (e < PRES_SCRUB_RAMP_T2) {
      const u = (e - PRES_SCRUB_RAMP_T1) / (PRES_SCRUB_RAMP_T2 - PRES_SCRUB_RAMP_T1);
      return 8 + (16 - 8) * u;
    }
    if (e < PRES_SCRUB_RAMP_T3) {
      const u = (e - PRES_SCRUB_RAMP_T2) / (PRES_SCRUB_RAMP_T3 - PRES_SCRUB_RAMP_T2);
      return 16 + (32 - 16) * u;
    }
    if (e < PRES_SCRUB_RAMP_T4) {
      const u = (e - PRES_SCRUB_RAMP_T3) / (PRES_SCRUB_RAMP_T4 - PRES_SCRUB_RAMP_T3);
      return 32 + (PRES_SCRUB_SPEED_CAP - 32) * u;
    }
    return PRES_SCRUB_SPEED_CAP;
  }

  function formatPresentationTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    if (s < 60) {
      return (Math.round(s * 10) / 10).toFixed(1) + "s";
    }
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return mins + ":" + String(secs).padStart(2, "0");
  }

  function formatPresentationElapsedTotal(globalSec, totalSec) {
    return formatPresentationTime(globalSec) + " / " + formatPresentationTime(totalSec);
  }

  function parseHexColorToRgb(hex) {
    if (hex == null) return null;
    let s = String(hex).trim();
    if (!s) return null;
    if (s.startsWith("#")) s = s.slice(1);
    if (s.length === 3) {
      const r = parseInt(s[0] + s[0], 16);
      const g = parseInt(s[1] + s[1], 16);
      const b = parseInt(s[2] + s[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    if (s.length === 6) {
      const r = parseInt(s.slice(0, 2), 16);
      const g = parseInt(s.slice(2, 4), 16);
      const b = parseInt(s.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    return null;
  }

  /** Resolve theme string (#hex or rgb/rgba) to RGB for overlay tint. */
  function parseCssColorToRgb(s) {
    const fromHex = parseHexColorToRgb(s);
    if (fromHex) return fromHex;
    const t = String(s || "").trim();
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(t);
    if (!m) return null;
    const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
    return { r, g, b };
  }

  function makePresRng(seed) {
    let s = seed >>> 0;
    return function next() {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SPARKS_PHYS_VEL_SCALE = 1.42;
  const SPARKS_PHYS_DRAG = 0.985;
  const SPARKS_PHYS_MAX_STEPS = 48;
  /** Cap inner integration steps per frame (perf when tab stutters). */
  const SPARKS_STATEFUL_MAX_STEPS_PER_FRAME = 28;
  /** If global time jumps farther than this (s), re-sync particle state from analytic integration. */
  const SPARKS_STATEFUL_SEEK_RESET_SEC = 0.22;
  /** If `relInBurst01` jumps backward or far scrub within one burst, reset state. */
  const SPARKS_STATEFUL_REL_JUMP = 0.12;

  /**
   * One deterministic physics step (same semantics as one substep inside integrateSparkParticle).
   */
  function sparkPhysicsMicroStep(x, y, vx, vy, g, frac) {
    const vs = SPARKS_PHYS_VEL_SCALE * frac;
    const drag = SPARKS_PHYS_DRAG;
    x += vx * vs;
    y += vy * vs;
    vy += g * frac;
    vx *= Math.pow(drag, frac);
    return { x, y, vx, vy };
  }

  /**
   * Deterministic particle integration — fixed-rate substeps scaled by burst progress.
   * Uses a fractional final substep so positions move smoothly with `burstT` (no stair-steps from round(t×N)).
   * @param {number} burstT 0..1 within burst
   */
  function integrateSparkParticle(ox, oy, vx0, vy0, g, burstT) {
    const r = integrateSparkParticleWithVel(ox, oy, vx0, vy0, g, burstT);
    return { x: r.x, y: r.y };
  }

  function integrateSparkParticleWithVel(ox, oy, vx0, vy0, g, burstT) {
    let x = ox;
    let y = oy;
    let vx = vx0;
    let vy = vy0;
    if (burstT <= 0) return { x: ox, y: oy, vx: vx0, vy: vy0 };
    const maxSteps = SPARKS_PHYS_MAX_STEPS;
    const edge = burstT * maxSteps;
    const full = Math.min(maxSteps, Math.max(0, Math.floor(edge + 1e-12)));
    const frac = Math.max(0, edge - full);
    for (let k = 0; k < full; k++) {
      const u = sparkPhysicsMicroStep(x, y, vx, vy, g, 1);
      x = u.x;
      y = u.y;
      vx = u.vx;
      vy = u.vy;
    }
    if (frac > 1e-10) {
      const u = sparkPhysicsMicroStep(x, y, vx, vy, g, frac);
      x = u.x;
      y = u.y;
      vx = u.vx;
      vy = u.vy;
    }
    return { x, y, vx, vy };
  }

  /** @type {WeakMap<Document, object>} */
  const presSparksSimByDoc = new WeakMap();

  function presSparksBurstKey(st, w, h) {
    const kind = st.effectKind != null ? String(st.effectKind) : "sparks";
    const n = Math.max(1, Math.min(256, Math.floor(Number(st.particleCount)) || 120));
    const ax = Number(st.anchorX01);
    const ay = Number(st.anchorY01);
    return [
      kind,
      st.seed >>> 0,
      st.burstIndex | 0,
      n,
      Number(st.speedMul) || 1,
      Number(st.gravityMul) || 2,
      Number(st.hueSpread) || 40,
      Math.round((Number(st.hueCenter) || 0) * 100),
      Math.round(ax * 1e4),
      Math.round(ay * 1e4),
      w | 0,
      h | 0,
    ].join(":");
  }

  /**
   * Build or reset per-burst particle list; `rnd` must be the same stream order as the draw loop.
   */
  function presSparksBuildParticles(ox, oy, dpr, speed, gravMul, hue0, spread, n, rnd) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + rnd() * 0.55;
      const sp = (3.1 + rnd() * 4.6) * dpr * speed;
      const vx0 = Math.cos(ang) * sp * (0.6 + rnd());
      const vy0 = Math.sin(ang) * sp * (0.6 + rnd()) - 0.65 * dpr * gravMul;
      const jx = (rnd() - 0.5) * 2.5 * dpr;
      const jy = (rnd() - 0.5) * 2.5 * dpr;
      const life = Math.max(0.08, 0.35 + rnd() * 0.35);
      const aMul = Math.min(1, 0.4 + rnd() * 0.6);
      const hue = hue0 + (rnd() - 0.5) * 2 * spread;
      const pr = (1.2 + rnd() * 2) * dpr;
      parts.push({
        x: ox,
        y: oy,
        vx: vx0,
        vy: vy0,
        vx0,
        vy0,
        jx,
        jy,
        life,
        aMul,
        hue,
        pr,
      });
    }
    return parts;
  }

  /**
   * Trail emitters: near-horizontal path across the canvas, slightly above the rep progress bar band.
   * Matches demo `trailSparks` speeds; hue from fixed presentation constants.
   */
  function presTrailBuildParticles(w, h, dpr, speed, gravMul, hue0, spread, steps, rnd) {
    const parts = [];
    const denom = Math.max(1, steps - 1);
    for (let i = 0; i < steps; i++) {
      const u = i / denom;
      const ox = w * (0.02 + u * 0.96) + (rnd() - 0.5) * 14 * dpr * speed;
      const oy = h * (0.792 + Math.sin(u * Math.PI) * 0.02) + (rnd() - 0.5) * 10 * dpr;
      const angle = -Math.PI / 2 + (rnd() - 0.5) * 0.85;
      const sp = (2 + rnd() * 3) * dpr * speed;
      const vx0 = Math.cos(angle) * sp * (0.6 + rnd());
      const vy0 = Math.sin(angle) * sp * (0.6 + rnd()) - 0.65 * dpr * gravMul;
      const jx = (rnd() - 0.5) * 2 * dpr;
      const jy = (rnd() - 0.5) * 2 * dpr;
      const life = Math.max(0.08, 0.35 + rnd() * 0.35) * 0.95;
      const aMul = Math.min(1, 0.4 + rnd() * 0.6);
      const hue = hue0 + (rnd() - 0.5) * 2 * spread;
      const pr = (1.05 + rnd() * 1.75) * dpr;
      parts.push({
        x: ox,
        y: oy,
        vx: vx0,
        vy: vy0,
        vx0,
        vy0,
        jx,
        jy,
        life,
        aMul,
        hue,
        pr,
      });
    }
    return parts;
  }

  /**
   * Trail spark FX (fixed 120 steps, hue 10±30°, gravity 100%).
   * @param {object} st — `frame.vfxSparks` with `effectKind: "trail"`
   */
  function drawPresentationVfxTrail(ctx, w, h, st, paintOpts) {
    const cw = Math.max(1, ctx.canvas.clientWidth || 1);
    const dpr = w / cw;
    const t = Math.max(0, Math.min(1, st.relInBurst01));
    const n = Math.max(1, Math.min(256, Math.floor(Number(st.particleCount)) || 120));
    const speed = Number(st.speedMul) || 1;
    const gravMul = Number(st.gravityMul) || 1;
    const gStep = 0.1 * dpr * gravMul;
    const spread = Number(st.hueSpread) || 30;
    const hue0 = Number(st.hueCenter) || 10;
    const burstFade = Math.max(0, 1 - t * 0.98);

    const doc = paintOpts && paintOpts.doc;
    const globalSec = paintOpts && Number(paintOpts.globalSec);
    const useStateful =
      !!doc &&
      paintOpts &&
      paintOpts.statefulSparks !== false &&
      Number.isFinite(globalSec);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    if (useStateful) {
      const burstWallSec =
        global.WorkoutPresentation && Number(global.WorkoutPresentation.SPARKS_BURST_DURATION_SEC) > 0
          ? global.WorkoutPresentation.SPARKS_BURST_DURATION_SEC
          : 0.6;
      const physStepsPerWallSec = SPARKS_PHYS_MAX_STEPS / burstWallSec;
      const burstKey = presSparksBurstKey(st, w, h);
      let sim = presSparksSimByDoc.get(doc);
      const dtWall = sim && Number.isFinite(sim.lastGlobalSec) ? globalSec - sim.lastGlobalSec : 0;
      let reset =
        !sim ||
        sim.burstKey !== burstKey ||
        !Array.isArray(sim.particles) ||
        sim.particleCount !== n ||
        dtWall < -1e-6 ||
        dtWall > SPARKS_STATEFUL_SEEK_RESET_SEC ||
        (sim.lastRel01 != null && t + 1e-9 < sim.lastRel01) ||
        (sim.lastRel01 != null && Math.abs(t - sim.lastRel01) > SPARKS_STATEFUL_REL_JUMP);

      if (reset) {
        const rnd0 = makePresRng((st.seed >>> 0) ^ ((st.burstIndex | 0) * 0x2b893049));
        const particles = presTrailBuildParticles(w, h, dpr, speed, gravMul, hue0, spread, n, rnd0);
        for (let pi = 0; pi < particles.length; pi++) {
          const p = particles[pi];
          const fin = integrateSparkParticleWithVel(p.x, p.y, p.vx0, p.vy0, gStep, t);
          p.x = fin.x;
          p.y = fin.y;
          p.vx = fin.vx;
          p.vy = fin.vy;
        }
        sim = {
          burstKey,
          lastGlobalSec: globalSec,
          lastRel01: t,
          particles,
          particleCount: n,
        };
        presSparksSimByDoc.set(doc, sim);
      } else {
        let steps = 0;
        if (dtWall > 1e-9) {
          steps = Math.round(dtWall * physStepsPerWallSec);
          steps = Math.min(SPARKS_STATEFUL_MAX_STEPS_PER_FRAME, Math.max(1, steps));
        }
        for (let s = 0; s < steps; s++) {
          for (let pi = 0; pi < sim.particles.length; pi++) {
            const p = sim.particles[pi];
            const u = sparkPhysicsMicroStep(p.x, p.y, p.vx, p.vy, gStep, 1);
            p.x = u.x;
            p.y = u.y;
            p.vx = u.vx;
            p.vy = u.vy;
          }
        }
        sim.lastGlobalSec = globalSec;
        sim.lastRel01 = t;
      }

      for (let pi = 0; pi < sim.particles.length; pi++) {
        const p = sim.particles[pi];
        const px = p.x + p.jx;
        const py = p.y + p.jy;
        const aLife = burstFade * Math.min(1, (t + 0.08) / p.life) * p.aMul;
        const a = Math.min(0.95, aLife * 1.25);
        const grd = ctx.createRadialGradient(px, py, 0, px, py, p.pr * 3);
        grd.addColorStop(0, "hsla(" + p.hue + ",100%,70%," + a + ")");
        grd.addColorStop(0.4, "hsla(" + p.hue + ",90%,50%," + a * 0.6 + ")");
        grd.addColorStop(1, "hsla(" + p.hue + ",80%,40%,0)");
        ctx.fillStyle = grd;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, p.pr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const rnd = makePresRng((st.seed >>> 0) ^ ((st.burstIndex | 0) * 0x2b893049));
      const denom = Math.max(1, n - 1);
      for (let i = 0; i < n; i++) {
        const u = i / denom;
        const ox = w * (0.02 + u * 0.96) + (rnd() - 0.5) * 14 * dpr * speed;
        const oy = h * (0.792 + Math.sin(u * Math.PI) * 0.02) + (rnd() - 0.5) * 10 * dpr;
        const angle = -Math.PI / 2 + (rnd() - 0.5) * 0.85;
        const sp = (2 + rnd() * 3) * dpr * speed;
        const vx0 = Math.cos(angle) * sp * (0.6 + rnd());
        const vy0 = Math.sin(angle) * sp * (0.6 + rnd()) - 0.65 * dpr * gravMul;
        const pos = integrateSparkParticle(ox, oy, vx0, vy0, gStep, t);
        const x = pos.x + (rnd() - 0.5) * 2 * dpr;
        const y = pos.y + (rnd() - 0.5) * 2 * dpr;
        const life = Math.max(0.08, 0.35 + rnd() * 0.35) * 0.95;
        const aLife = burstFade * Math.min(1, (t + 0.08) / life) * Math.min(1, 0.4 + rnd() * 0.6);
        const hue = hue0 + (rnd() - 0.5) * 2 * spread;
        const pr = (1.05 + rnd() * 1.75) * dpr;
        const a = Math.min(0.95, aLife * 1.25);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, pr * 3);
        grd.addColorStop(0, "hsla(" + hue + ",100%,70%," + a + ")");
        grd.addColorStop(0.4, "hsla(" + hue + ",90%,50%," + a * 0.6 + ")");
        grd.addColorStop(1, "hsla(" + hue + ",80%,40%,0)");
        ctx.fillStyle = grd;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, pr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * Rich sparks (aligned with samples/vfx-effects-demo.html burst look): additive blend, large radial
   * glows (r → 3r gradient), optional core flash, substepped motion.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w buffer width (px)
   * @param {number} h buffer height (px)
   * @param {object} st from WorkoutPresentation.activeVfxSparksState / frame.vfxSparks
   * @param {{ doc?: Document, globalSec?: number, statefulSparks?: boolean }} [paintOpts]
   */
  function drawPresentationVfxSparks(ctx, w, h, st, paintOpts) {
    ctx.clearRect(0, 0, w, h);
    if (!st || !st.active) return;
    const effectKind = st.effectKind != null ? String(st.effectKind) : "sparks";
    if (effectKind === "trail") {
      drawPresentationVfxTrail(ctx, w, h, st, paintOpts);
      return;
    }
    const cw = Math.max(1, ctx.canvas.clientWidth || 1);
    const dpr = w / cw;
    const ox = st.anchorX01 * w;
    const oy = st.anchorY01 * h;
    const t = Math.max(0, Math.min(1, st.relInBurst01));
    const n = Math.max(1, Math.min(256, Math.floor(Number(st.particleCount)) || 120));
    const speed = Number(st.speedMul) || 1;
    const gravMul = Number(st.gravityMul) || 2;
    const gStep = 0.1 * dpr * gravMul;
    const spread = Number(st.hueSpread) || 40;
    const hue0 = Number(st.hueCenter) || 0;
    const burstFade = Math.max(0, 1 - t * 0.98);

    const doc = paintOpts && paintOpts.doc;
    const globalSec = paintOpts && Number(paintOpts.globalSec);
    const useStateful =
      !!doc &&
      paintOpts &&
      paintOpts.statefulSparks !== false &&
      Number.isFinite(globalSec);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    /* Brief central bloom (early burst) — reads as “impact” like demo combo radial */
    if (t < 0.42) {
      const flash = burstFade * burstFade * (1 - t / 0.42);
      const R = Math.min(w, h) * (0.22 + 0.18 * (1 - t));
      const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, R);
      const a0 = 0.45 * flash;
      gr.addColorStop(0, "hsla(" + (hue0 + 18) + ",100%,92%," + a0 + ")");
      gr.addColorStop(0.25, "hsla(" + hue0 + ",95%,72%," + a0 * 0.55 + ")");
      gr.addColorStop(0.55, "hsla(" + hue0 + ",90%,55%," + a0 * 0.22 + ")");
      gr.addColorStop(1, "hsla(" + hue0 + ",80%,45%,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(ox, oy, R, 0, Math.PI * 2);
      ctx.fill();
    }

    if (useStateful) {
      const burstWallSec =
        global.WorkoutPresentation && Number(global.WorkoutPresentation.SPARKS_BURST_DURATION_SEC) > 0
          ? global.WorkoutPresentation.SPARKS_BURST_DURATION_SEC
          : 0.6;
      const physStepsPerWallSec = SPARKS_PHYS_MAX_STEPS / burstWallSec;
      const burstKey = presSparksBurstKey(st, w, h);
      let sim = presSparksSimByDoc.get(doc);
      const dtWall = sim && Number.isFinite(sim.lastGlobalSec) ? globalSec - sim.lastGlobalSec : 0;
      let reset =
        !sim ||
        sim.burstKey !== burstKey ||
        !Array.isArray(sim.particles) ||
        sim.particleCount !== n ||
        dtWall < -1e-6 ||
        dtWall > SPARKS_STATEFUL_SEEK_RESET_SEC ||
        (sim.lastRel01 != null && t + 1e-9 < sim.lastRel01) ||
        (sim.lastRel01 != null && Math.abs(t - sim.lastRel01) > SPARKS_STATEFUL_REL_JUMP);

      if (reset) {
        const rnd0 = makePresRng((st.seed >>> 0) ^ ((st.burstIndex | 0) * 0x2b893049));
        const particles = presSparksBuildParticles(ox, oy, dpr, speed, gravMul, hue0, spread, n, rnd0);
        for (let pi = 0; pi < particles.length; pi++) {
          const p = particles[pi];
          const fin = integrateSparkParticleWithVel(ox, oy, p.vx0, p.vy0, gStep, t);
          p.x = fin.x;
          p.y = fin.y;
          p.vx = fin.vx;
          p.vy = fin.vy;
        }
        sim = {
          burstKey,
          lastGlobalSec: globalSec,
          lastRel01: t,
          particles,
          particleCount: n,
        };
        presSparksSimByDoc.set(doc, sim);
      } else {
        let steps = 0;
        if (dtWall > 1e-9) {
          steps = Math.round(dtWall * physStepsPerWallSec);
          steps = Math.min(SPARKS_STATEFUL_MAX_STEPS_PER_FRAME, Math.max(1, steps));
        }
        for (let s = 0; s < steps; s++) {
          for (let pi = 0; pi < sim.particles.length; pi++) {
            const p = sim.particles[pi];
            const u = sparkPhysicsMicroStep(p.x, p.y, p.vx, p.vy, gStep, 1);
            p.x = u.x;
            p.y = u.y;
            p.vx = u.vx;
            p.vy = u.vy;
          }
        }
        sim.lastGlobalSec = globalSec;
        sim.lastRel01 = t;
      }

      for (let pi = 0; pi < sim.particles.length; pi++) {
        const p = sim.particles[pi];
        const px = p.x + p.jx;
        const py = p.y + p.jy;
        const aLife = burstFade * Math.min(1, (t + 0.08) / p.life) * p.aMul;
        const a = Math.min(0.95, aLife * 1.25);
        const grd = ctx.createRadialGradient(px, py, 0, px, py, p.pr * 3);
        grd.addColorStop(0, "hsla(" + p.hue + ",100%,70%," + a + ")");
        grd.addColorStop(0.4, "hsla(" + p.hue + ",90%,50%," + a * 0.6 + ")");
        grd.addColorStop(1, "hsla(" + p.hue + ",80%,40%,0)");
        ctx.fillStyle = grd;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, p.pr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const rnd = makePresRng((st.seed >>> 0) ^ ((st.burstIndex | 0) * 0x2b893049));
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + rnd() * 0.55;
        const sp = (3.1 + rnd() * 4.6) * dpr * speed;
        const vx0 = Math.cos(ang) * sp * (0.6 + rnd());
        const vy0 = Math.sin(ang) * sp * (0.6 + rnd()) - 0.65 * dpr * gravMul;
        const pos = integrateSparkParticle(ox, oy, vx0, vy0, gStep, t);
        const x = pos.x + (rnd() - 0.5) * 2.5 * dpr;
        const y = pos.y + (rnd() - 0.5) * 2.5 * dpr;
        const life = Math.max(0.08, 0.35 + rnd() * 0.35);
        const aLife = burstFade * Math.min(1, (t + 0.08) / life) * Math.min(1, 0.4 + rnd() * 0.6);
        const hue = hue0 + (rnd() - 0.5) * 2 * spread;
        const pr = (1.2 + rnd() * 2) * dpr;
        const a = Math.min(0.95, aLife * 1.25);

        const grd = ctx.createRadialGradient(x, y, 0, x, y, pr * 3);
        grd.addColorStop(0, "hsla(" + hue + ",100%,70%," + a + ")");
        grd.addColorStop(0.4, "hsla(" + hue + ",90%,50%," + a * 0.6 + ")");
        grd.addColorStop(1, "hsla(" + hue + ",80%,40%,0)");
        ctx.fillStyle = grd;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, pr * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function resolveVfxTintRgb(doc, vfx) {
    const fallback = { r: 56, g: 189, b: 248 };
    if (!vfx || !vfx.active) return fallback;
    if (vfx.colorMode === "custom" && vfx.customHex) {
      const rgb = parseHexColorToRgb(vfx.customHex);
      if (rgb) return rgb;
    }
    try {
      const root = doc.documentElement;
      const raw =
        getComputedStyle(root).getPropertyValue("--player-pres-vfx-scheme").trim() ||
        getComputedStyle(root).getPropertyValue("--editor-pres-vfx-scheme").trim();
      const rgb = parseCssColorToRgb(raw);
      if (rgb) return rgb;
    } catch (_) {}
    return fallback;
  }

  /**
   * @param {Document} doc
   * @param {object} opts
   * @param {object[]} opts.segments
   * @param {string} [opts.workoutName]
   * @param {string} opts.defaultWorkoutName
   * @param {number} opts.timeSec — global workout second (caller clamps if needed)
   * @param {boolean} [opts.statefulSparks] — when not `false`, carry spark particle velocity across frames (smoother; default on).
   */
  function renderPresentationIntoDocument(doc, opts) {
    const WP = global.WorkoutPresentation;
    if (!WP || typeof WP.presentationFrame !== "function") return;
    const segments = opts.segments;
    const defaultWorkoutName = opts.defaultWorkoutName || "Workout";
    const maxT = WP.totalWorkoutDuration(segments);
    const t = Math.max(0, Math.min(Number(opts.timeSec) || 0, maxT));
    const frame = WP.presentationFrame(segments, t);
    const vfxEl = doc.getElementById("presVfxOverlay");
    if (vfxEl) {
      const vx = frame.vfxOverlay;
      if (vx && vx.active && vx.opacity > 1e-6) {
        const rgb = resolveVfxTintRgb(doc, vx);
        vfxEl.hidden = false;
        vfxEl.style.backgroundColor =
          "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + Math.max(0, Math.min(1, vx.opacity)).toFixed(4) + ")";
      } else {
        vfxEl.hidden = true;
        vfxEl.style.backgroundColor = "transparent";
      }
    }
    const sparksCanvas = doc.getElementById("presVfxSparksCanvas");
    if (sparksCanvas && sparksCanvas.getContext) {
      const parent = sparksCanvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : sparksCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(1, Math.floor(rect.width * dpr));
      const bh = Math.max(1, Math.floor(rect.height * dpr));
      if (sparksCanvas.width !== bw || sparksCanvas.height !== bh) {
        sparksCanvas.width = bw;
        sparksCanvas.height = bh;
      }
      const sctx = sparksCanvas.getContext("2d");
      const vs = frame.vfxSparks;
      if (sctx && vs && vs.active) {
        sparksCanvas.hidden = false;
        sparksCanvas.setAttribute("aria-hidden", "true");
        drawPresentationVfxSparks(sctx, bw, bh, vs, {
          doc,
          globalSec: t,
          statefulSparks: opts.statefulSparks,
        });
      } else {
        if (sctx) sctx.clearRect(0, 0, sparksCanvas.width, sparksCanvas.height);
        sparksCanvas.hidden = true;
        presSparksSimByDoc.delete(doc);
      }
    }
    const titleEl = doc.getElementById("presWorkoutTitle");
    const timeEl = doc.getElementById("presTime");
    const partEl = doc.getElementById("presPartName");
    const partCtrEl = doc.getElementById("presPartCounter");
    const repCtrEl = doc.getElementById("presRepCounter");
    const repNameEl = doc.getElementById("presRepName");
    const barEl = doc.getElementById("presProgressFill");
    if (titleEl) {
      const wn = (opts.workoutName && String(opts.workoutName).trim()) || defaultWorkoutName;
      titleEl.textContent = wn;
    }
    if (timeEl) {
      timeEl.textContent = formatPresentationElapsedTotal(frame.globalSec, frame.workoutTotal);
    }
    const cueHeadEl = doc.getElementById("presCueHeading");
    const cueBodyEl = doc.getElementById("presCueBody");
    const cueActive = !!frame.cuePresentationActive;
    const ch = frame.cueHeading != null ? String(frame.cueHeading) : "";
    const cb = frame.cueBody != null ? String(frame.cueBody) : "";
    if (cueHeadEl) {
      cueHeadEl.textContent = ch;
      cueHeadEl.hidden = !cueActive || !ch;
    }
    if (cueBodyEl) {
      cueBodyEl.classList.remove("presentation-cue-placeholder");
      if (!cueActive) {
        cueBodyEl.textContent = "—";
        cueBodyEl.hidden = false;
        cueBodyEl.classList.add("presentation-cue-placeholder");
      } else if (!ch && !cb) {
        cueBodyEl.textContent = "—";
        cueBodyEl.hidden = false;
        cueBodyEl.classList.add("presentation-cue-placeholder");
      } else if (ch && !cb) {
        cueBodyEl.textContent = "";
        cueBodyEl.hidden = true;
      } else {
        cueBodyEl.textContent = cb;
        cueBodyEl.hidden = false;
      }
    }
    const partInfoWrap = partEl ? partEl.closest(".presentation-part-info") : null;
    const repInfoWrap = repNameEl ? repNameEl.closest(".presentation-rep-info") : null;
    const metaRow = partInfoWrap ? partInfoWrap.closest(".presentation-meta-row") : null;
    const hidePart = !!frame.presentationHidePartInfo;
    const hideRep = !!frame.presentationHideRepInfo;
    if (partInfoWrap) partInfoWrap.style.display = hidePart ? "none" : "";
    if (repInfoWrap) repInfoWrap.style.display = hideRep ? "none" : "";
    if (!hidePart && partEl) partEl.textContent = frame.partName || "—";
    if (!hidePart && partCtrEl) partCtrEl.textContent = frame.partIndex + 1 + " / " + frame.partCount;
    if (!hideRep && repNameEl) repNameEl.textContent = frame.repName || "Rep 1";
    if (!hideRep && repCtrEl) repCtrEl.textContent = frame.repIndex + 1 + " / " + frame.repCount;
    if (metaRow) {
      metaRow.style.display = hidePart && hideRep ? "none" : "";
      metaRow.classList.toggle("presentation-meta-row--rep-only", hidePart && !hideRep);
      metaRow.classList.toggle("presentation-meta-row--part-only", !hidePart && hideRep);
    }
    if (barEl) barEl.style.width = (frame.repProgress01 * 100).toFixed(2) + "%";
  }

  function clearPresentationSparksSim(doc) {
    if (doc) presSparksSimByDoc.delete(doc);
  }

  global.WorkoutPresentationShared = {
    PRES_SVG_PLAY,
    PRES_SVG_PAUSE,
    scrubSpeedMultiplier,
    formatPresentationTime,
    formatPresentationElapsedTotal,
    parseHexColorToRgb,
    parseCssColorToRgb,
    renderPresentationIntoDocument,
    clearPresentationSparksSim,
  };
})(typeof window !== "undefined" ? window : globalThis);
