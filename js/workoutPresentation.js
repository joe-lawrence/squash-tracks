/**
 * Read-only workout timeline helpers for presentation / playback.
 * Mirrors editor time semantics: 0.1s snap grid, rep durations, segment-local global cue times.
 */
(function (global) {
  const TIME_SNAP_SEC = 0.1;
  const DEFAULT_INTERVAL_FALLBACK = 4.5;

  function snapTime(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return TIME_SNAP_SEC;
    const f = Math.round(n * (1 / TIME_SNAP_SEC)) / (1 / TIME_SNAP_SEC);
    const d = f < TIME_SNAP_SEC ? TIME_SNAP_SEC : f;
    return Math.round(d * 1e6) / 1e6;
  }

  function repDurationForDefault(rep, defaultSec) {
    const di0 = Number(defaultSec);
    const di = Number.isFinite(di0) && di0 > 0 ? di0 : DEFAULT_INTERVAL_FALLBACK;
    if (!rep) return Math.max(TIME_SNAP_SEC, snapTime(di));
    const o = rep.intervalSec;
    if (o !== undefined && o !== null) {
      const n = Number(o);
      if (!Number.isNaN(n) && n > 0) return Math.max(TIME_SNAP_SEC, snapTime(n));
    }
    return Math.max(TIME_SNAP_SEC, snapTime(di));
  }

  function cumulativeRepStartInSegment(segment, rIndex) {
    const reps = segment && Array.isArray(segment.reps) ? segment.reps : [];
    const diRaw = segment && segment.defaultIntervalSec;
    const diN = Number(diRaw);
    const di = Number.isFinite(diN) && diN > 0 ? diN : DEFAULT_INTERVAL_FALLBACK;
    let s = 0;
    for (let i = 0; i < rIndex && i < reps.length; i++) {
      s = snapTime(s + repDurationForDefault(reps[i], di));
    }
    return s;
  }

  function segmentTimelineDuration(segment) {
    if (!segment || !Array.isArray(segment.reps) || segment.reps.length === 0) {
      return TIME_SNAP_SEC;
    }
    let t = 0;
    const diRaw = segment.defaultIntervalSec;
    const diN = Number(diRaw);
    const di = Number.isFinite(diN) && diN > 0 ? diN : DEFAULT_INTERVAL_FALLBACK;
    for (let r = 0; r < segment.reps.length; r++) {
      t = snapTime(t + repDurationForDefault(segment.reps[r], di));
    }
    return Math.max(t, TIME_SNAP_SEC);
  }

  function cumulativeSegmentStart(segments, segIndex) {
    let s = 0;
    for (let i = 0; i < segIndex && i < segments.length; i++) {
      s = snapTime(s + segmentTimelineDuration(segments[i]));
    }
    return s;
  }

  function totalWorkoutDuration(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return TIME_SNAP_SEC;
    let t = 0;
    for (let i = 0; i < segments.length; i++) {
      t = snapTime(t + segmentTimelineDuration(segments[i]));
    }
    return Math.max(t, TIME_SNAP_SEC);
  }

  function repIndexAtLocalSec(segment, posSec) {
    const reps = segment && Array.isArray(segment.reps) ? segment.reps : [];
    const n = reps.length;
    if (n <= 0) return 0;
    const totalT = segmentTimelineDuration(segment);
    const p = Math.max(0, Math.min(posSec, totalT));
    if (p >= totalT - 1e-6) return Math.max(0, n - 1);
    for (let r = n - 1; r >= 0; r--) {
      if (p + 1e-9 >= cumulativeRepStartInSegment(segment, r)) return r;
    }
    return 0;
  }

  /**
   * @returns {{ segmentIndex: number, localSec: number, segment: object, workoutTotal: number }}
   */
  function locateGlobalTime(segments, globalSec) {
    const workoutTotal = totalWorkoutDuration(segments);
    const t = Math.max(0, Math.min(globalSec, workoutTotal));
    if (!Array.isArray(segments) || segments.length === 0) {
      return { segmentIndex: 0, localSec: 0, segment: null, workoutTotal };
    }
    let acc = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const sd = segmentTimelineDuration(seg);
      const end = snapTime(acc + sd);
      const isLast = si === segments.length - 1;
      if (t < end - 1e-9 || isLast) {
        const localSec = Math.min(Math.max(0, snapTime(t - acc)), sd);
        return { segmentIndex: si, localSec, segment: seg, workoutTotal };
      }
      acc = end;
    }
    const last = segments.length - 1;
    return {
      segmentIndex: last,
      localSec: segmentTimelineDuration(segments[last]),
      segment: segments[last],
      workoutTotal,
    };
  }

  function repDisplayName(segment, repIndex) {
    const reps = segment && Array.isArray(segment.reps) ? segment.reps : [];
    const rep = reps[repIndex];
    const n = rep && rep.name != null ? String(rep.name).trim() : "";
    return n || "Rep " + (repIndex + 1);
  }

  /**
   * Active text-lane cue at segment-local timeline second `localSec`.
   * Cue `start` / `duration` use the same segment-global coordinates as the editor.
   */
  const TEXT_CUE_HEADING_BODY_MAX = 8000;

  function normalizeTextCueField(s) {
    if (s == null) return "";
    return String(s)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim()
      .slice(0, TEXT_CUE_HEADING_BODY_MAX);
  }

  const VFX_PEAK_OPACITY = 0.55;

  function clampVfxRepeatCount(n) {
    const k = Math.floor(Number(n));
    if (!Number.isFinite(k) || k < 1) return 1;
    return Math.min(99, k);
  }

  /** @param {"flash"|"fade_in"|"fade_in_out"} bgMode */
  function resolveVfxBgMode(ev) {
    const m = ev && ev.vfxBgMode != null ? String(ev.vfxBgMode).trim().toLowerCase() : "";
    if (m === "flash" || m === "fade_in" || m === "fade_in_out") return m;
    if (ev && ev.vfxFadeInOnly === true) return "fade_in";
    return "fade_in_out";
  }

  /**
   * Opacity multiplier [0,1] within one VFX clip, before peak scaling.
   * `repeats` = number of cycles across the clip duration.
   */
  function vfxBgWaveOpacity01(relInClip01, repeats, bgMode) {
    const r = clampVfxRepeatCount(repeats);
    const u = ((relInClip01 * r) % 1 + 1) % 1;
    if (bgMode === "flash") {
      return u < 0.5 - 1e-12 ? 1 : 0;
    }
    if (bgMode === "fade_in") {
      return u;
    }
    /* fade_in_out */
    if (u < 0.5 - 1e-12) return u * 2;
    return (1 - u) * 2;
  }

  /** @returns {{ ev: object, rel01: number } | null} */
  function findWinningVfxEvent(segment, localSec) {
    if (!segment || !Array.isArray(segment.reps)) return null;
    const t = snapTime(localSec);
    let best = null;
    let bestStart = -Infinity;
    for (const rep of segment.reps) {
      if (!rep || !Array.isArray(rep.events)) continue;
      for (const ev of rep.events) {
        if (!ev || ev.lane !== "vfx") continue;
        const kind = ev.vfxKind != null ? String(ev.vfxKind).trim() : "bg_fade";
        if (kind !== "bg_fade") continue;
        const a = snapTime(ev.start);
        const b = snapTime(ev.start + ev.duration);
        if (t + 1e-9 >= a && t < b - 1e-9) {
          if (a >= bestStart - 1e-9) {
            bestStart = a;
            best = ev;
          }
        }
      }
    }
    if (!best) return null;
    const dur = Math.max(TIME_SNAP_SEC, snapTime(best.duration));
    const rel = snapTime(t - snapTime(best.start)) / dur;
    const rel01 = Math.max(0, Math.min(1, rel));
    return { ev: best, rel01 };
  }

  function vfxEffectTypeOf(ev) {
    const eff = ev && ev.vfxEffectType != null ? String(ev.vfxEffectType).trim().toLowerCase() : "background";
    if (eff === "fireworks" || eff === "sparks") return "fireworks";
    if (eff === "fireballs" || eff === "trail") return "fireballs";
    return "background";
  }

  /** Deterministic 32-bit mix for seeds (no Math.random in presentation math). */
  function vfxMix32(a, b) {
    let x = (Math.imul(a | 0, 0xcc9e2d51) ^ (b | 0)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    return x >>> 0;
  }

  const SPARKS_PARTICLE_COUNT = 120;
  const SPARKS_SPEED_MUL = 1;
  const SPARKS_HUE_SPREAD = 40;
  const SPARKS_GRAVITY_MUL = 2;

  const TRAIL_PARTICLE_COUNT = 120;
  const TRAIL_SPEED_MUL = 1;
  const TRAIL_HUE_CENTER = 10;
  const TRAIL_HUE_SPREAD = 30;
  const TRAIL_GRAVITY_MUL = 1;
  /** Wall-clock length of one full fireworks burst (0.1 s snap grid: 5 × TIME_SNAP_SEC). */
  const SPARKS_BURST_DURATION_SEC = 0.5;

  /**
   * Burst count for a fireworks cue from its duration (editor and playback agree).
   * @param {number} durSec snapped cue duration in seconds
   */
  function sparksBurstCountFromCueDurationSec(durSec) {
    const d = Math.max(TIME_SNAP_SEC, snapTime(durSec));
    const b = SPARKS_BURST_DURATION_SEC;
    let n = Math.round(d / b);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(99, n);
    while (n > 1 && snapTime(n * b) > d + 1e-9) n--;
    return n;
  }

  /**
   * Fireworks overlay snapshot for canvas rendering (deterministic from time + event).
   * Bursts: each full burst plays for `SPARKS_BURST_DURATION_SEC`; count is derived from cue duration
   * (see `sparksBurstCountFromCueDurationSec`). Bursts are sequential in wall time, not compressed into rel01.
   */
  function activeVfxSparksState(segment, localSec, vfxVisualSalt) {
    const salt = Number(vfxVisualSalt) >>> 0;
    const inactive = {
      active: false,
      relInBurst01: 0,
      burstIndex: 0,
      burstCount: 1,
      seed: 0,
      fireworksEventId: "",
      anchorX01: 0.5,
      anchorY01: 0.5,
      hueCenter: 0,
      particleCount: SPARKS_PARTICLE_COUNT,
      speedMul: SPARKS_SPEED_MUL,
      hueSpread: SPARKS_HUE_SPREAD,
      gravityMul: SPARKS_GRAVITY_MUL,
    };
    const win = findWinningVfxEvent(segment, localSec);
    if (!win) return inactive;
    const best = win.ev;
    if (vfxEffectTypeOf(best) !== "fireworks") return inactive;
    const dur = Math.max(TIME_SNAP_SEC, snapTime(best.duration));
    const burstCount = sparksBurstCountFromCueDurationSec(dur);
    const burstSpan = snapTime(burstCount * SPARKS_BURST_DURATION_SEC);
    const t0 = snapTime(localSec - snapTime(best.start));
    if (t0 < 0 || t0 >= dur || t0 >= burstSpan - 1e-9) return inactive;
    const burstIndex = Math.min(
      burstCount - 1,
      Math.max(0, Math.floor(t0 / SPARKS_BURST_DURATION_SEC + 1e-12))
    );
    const relInBurst01 = Math.max(
      0,
      Math.min(1, (t0 - burstIndex * SPARKS_BURST_DURATION_SEC) / SPARKS_BURST_DURATION_SEC)
    );
    let idHash = 0;
    const idStr = best.elementId != null ? String(best.elementId) : "";
    for (let i = 0; i < idStr.length; i++) {
      idHash = (Math.imul(idHash, 31) + idStr.charCodeAt(i)) >>> 0;
    }
    const seedBase = vfxMix32(
      vfxMix32(Math.floor(snapTime(best.start) * 1000), Math.floor(dur * 1000)),
      vfxMix32(idHash, burstIndex * 0x9e3779b9)
    );
    const seed = vfxMix32(seedBase, salt);
    const rngHue = vfxMix32(seed, 1);
    const rngAnchor = vfxMix32(seed, 2);
    const hueCenter = (rngHue % 36000) / 100;
    const anchorX01 = 0.12 + (rngAnchor % 10000) / 10000 * 0.76;
    const anchorY01 = 0.12 + ((rngAnchor >>> 14) % 10000) / 10000 * 0.76;
    return {
      active: true,
      relInBurst01,
      burstIndex,
      burstCount,
      seed,
      fireworksEventId: idStr,
      anchorX01,
      anchorY01,
      hueCenter,
      particleCount: SPARKS_PARTICLE_COUNT,
      speedMul: SPARKS_SPEED_MUL,
      hueSpread: SPARKS_HUE_SPREAD,
      gravityMul: SPARKS_GRAVITY_MUL,
    };
  }

  /**
   * Fireballs overlay: fixed hue (10 / 30°), emitters along a band near the bottom of the stage.
   * Exactly one wall-clock burst per cue: active only for `min(cue duration, SPARKS_BURST_DURATION_SEC)` from cue start.
   */
  function activeVfxTrailState(segment, localSec) {
    const inactive = {
      active: false,
      relInBurst01: 0,
      burstIndex: 0,
      burstCount: 1,
      seed: 0,
      anchorX01: 0.5,
      anchorY01: 0.8,
      hueCenter: TRAIL_HUE_CENTER,
      particleCount: TRAIL_PARTICLE_COUNT,
      speedMul: TRAIL_SPEED_MUL,
      hueSpread: TRAIL_HUE_SPREAD,
      gravityMul: TRAIL_GRAVITY_MUL,
    };
    const win = findWinningVfxEvent(segment, localSec);
    if (!win) return inactive;
    const best = win.ev;
    if (vfxEffectTypeOf(best) !== "fireballs") return inactive;
    const B = SPARKS_BURST_DURATION_SEC;
    const durStored = Math.max(TIME_SNAP_SEC, snapTime(best.duration));
    const playEnd = Math.min(durStored, B);
    const t0 = snapTime(localSec - snapTime(best.start));
    if (t0 < 0 || t0 >= playEnd - 1e-9) return inactive;
    const relInBurst01 = Math.max(0, Math.min(1, t0 / B));
    let idHash = 0;
    const idStr = best.elementId != null ? String(best.elementId) : "";
    for (let i = 0; i < idStr.length; i++) {
      idHash = (Math.imul(idHash, 31) + idStr.charCodeAt(i)) >>> 0;
    }
    const seedBase = vfxMix32(
      vfxMix32(Math.floor(snapTime(best.start) * 1000), Math.floor(durStored * 1000)),
      vfxMix32(idHash, 0)
    );
    return {
      active: true,
      relInBurst01,
      burstIndex: 0,
      burstCount: 1,
      seed: seedBase,
      anchorX01: 0.5,
      anchorY01: 0.8,
      hueCenter: TRAIL_HUE_CENTER,
      particleCount: TRAIL_PARTICLE_COUNT,
      speedMul: TRAIL_SPEED_MUL,
      hueSpread: TRAIL_HUE_SPREAD,
      gravityMul: TRAIL_GRAVITY_MUL,
    };
  }

  /** Which VFX event wins when several overlap (latest start wins, same as text lane). */
  function activeVfxOverlayState(segment, localSec) {
    const empty = { active: false, opacity: 0, colorMode: "scheme", customHex: "" };
    const win = findWinningVfxEvent(segment, localSec);
    if (!win) return empty;
    const best = win.ev;
    if (vfxEffectTypeOf(best) !== "background") return empty;
    const rel01 = win.rel01;
    const repeats = clampVfxRepeatCount(best.vfxRepeatCount != null ? best.vfxRepeatCount : 1);
    const bgMode = resolveVfxBgMode(best);
    const wave = vfxBgWaveOpacity01(rel01, repeats, bgMode);
    const op = Math.max(0, Math.min(1, wave * VFX_PEAK_OPACITY));
    const colorMode = best.vfxColorMode === "custom" ? "custom" : "scheme";
    const customHex =
      best.vfxColor != null && String(best.vfxColor).trim() ? String(best.vfxColor).trim().slice(0, 32) : "";
    return {
      active: op > 1e-5,
      opacity: op,
      colorMode,
      customHex,
    };
  }

  /** Active text-lane cue content for presentation (heading + body, not cue name). */
  function activeTextCuePresentation(segment, localSec) {
    if (!segment || !Array.isArray(segment.reps)) {
      return { active: false, heading: "", body: "" };
    }
    const t = snapTime(localSec);
    let best = null;
    let bestStart = -Infinity;
    for (const rep of segment.reps) {
      if (!rep || !Array.isArray(rep.events)) continue;
      for (const ev of rep.events) {
        if (!ev || ev.lane !== "text") continue;
        const a = snapTime(ev.start);
        const b = snapTime(ev.start + ev.duration);
        if (t + 1e-9 >= a && t < b - 1e-9) {
          if (a >= bestStart - 1e-9) {
            bestStart = a;
            best = ev;
          }
        }
      }
    }
    if (!best) return { active: false, heading: "", body: "" };
    return {
      active: true,
      heading: normalizeTextCueField(best.heading),
      body: normalizeTextCueField(best.body),
    };
  }

  /**
   * @returns {object} Snapshot for one UI frame.
   * @param {object} [frameOpts]
   * @param {number} [frameOpts.vfxVisualSalt] — XOR’d into fireworks RNG seed (e.g. per-play salt from the shell).
   */
  function presentationFrame(segments, globalSec, frameOpts) {
    const fo = frameOpts && typeof frameOpts === "object" ? frameOpts : null;
    const vfxVisualSalt = fo && Number.isFinite(Number(fo.vfxVisualSalt)) ? Number(fo.vfxVisualSalt) >>> 0 : 0;
    const { segmentIndex, localSec, segment, workoutTotal } = locateGlobalTime(segments, globalSec);
    const partCount = Array.isArray(segments) ? segments.length : 0;
    if (!segment) {
      return {
        workoutTotal,
        globalSec: Math.min(globalSec, workoutTotal),
        partIndex: 0,
        partCount: Math.max(1, partCount),
        partName: "",
        presentationHidePartInfo: false,
        repIndex: 0,
        repCount: 0,
        repName: "",
        presentationHideRepInfo: false,
        repProgress01: 0,
        cuePresentationActive: false,
        cueHeading: "",
        cueBody: "",
        vfxOverlay: { active: false, opacity: 0, colorMode: "scheme", customHex: "" },
        vfxSparks: {
          active: false,
          effectKind: "fireworks",
          relInBurst01: 0,
          burstIndex: 0,
          burstCount: 1,
          seed: 0,
          fireworksEventId: "",
          anchorX01: 0.5,
          anchorY01: 0.5,
          hueCenter: 0,
          particleCount: 120,
          speedMul: 1,
          hueSpread: 40,
          gravityMul: 2,
        },
      };
    }
    const reps = segment.reps || [];
    const nReps = reps.length;
    const rIdx = repIndexAtLocalSec(segment, localSec);
    const g0 = cumulativeRepStartInSegment(segment, rIdx);
    const rDur = repDurationForDefault(reps[rIdx], segment.defaultIntervalSec);
    const offset = Math.max(0, Math.min(snapTime(localSec - g0), rDur));
    const prog = rDur > 1e-9 ? offset / rDur : 0;
    const rawPartName = segment.name != null ? String(segment.name).trim() : "";
    const presentationHidePartInfo = rawPartName.startsWith(".");
    const partName = presentationHidePartInfo ? "" : rawPartName || "Part";
    const rep = reps[rIdx];
    const rawRepName = rep && rep.name != null ? String(rep.name).trim() : "";
    const presentationHideRepInfo = rawRepName.startsWith(".");
    const repName = presentationHideRepInfo ? "" : repDisplayName(segment, rIdx);
    const cuePres = activeTextCuePresentation(segment, localSec);
    const vfx = activeVfxOverlayState(segment, localSec);
    const trailSt = activeVfxTrailState(segment, localSec);
    const sparksSt = activeVfxSparksState(segment, localSec, vfxVisualSalt);
    let vfxSparks;
    if (trailSt.active) {
      vfxSparks = Object.assign({ effectKind: "fireballs" }, trailSt);
    } else if (sparksSt.active) {
      vfxSparks = Object.assign({ effectKind: "fireworks" }, sparksSt);
    } else {
      vfxSparks = {
        active: false,
        effectKind: "fireworks",
        relInBurst01: 0,
        burstIndex: 0,
        burstCount: 1,
        seed: 0,
        fireworksEventId: "",
        anchorX01: 0.5,
        anchorY01: 0.5,
        hueCenter: 0,
        particleCount: 120,
        speedMul: 1,
        hueSpread: 40,
        gravityMul: 2,
      };
    }
    return {
      workoutTotal,
      globalSec: Math.min(Math.max(0, globalSec), workoutTotal),
      partIndex: segmentIndex,
      partCount: Math.max(1, partCount),
      partName,
      presentationHidePartInfo,
      repIndex: rIdx,
      repCount: Math.max(1, nReps),
      repName,
      presentationHideRepInfo,
      repProgress01: Math.max(0, Math.min(1, prog)),
      cuePresentationActive: cuePres.active,
      cueHeading: cuePres.heading,
      cueBody: cuePres.body,
      vfxOverlay: vfx,
      vfxSparks,
    };
  }

  function globalSecAtRepStart(segments, segmentIndex, repIndex) {
    if (!Array.isArray(segments) || segmentIndex < 0 || segmentIndex >= segments.length) {
      return 0;
    }
    const seg = segments[segmentIndex];
    const reps = seg && Array.isArray(seg.reps) ? seg.reps : [];
    if (repIndex < 0 || repIndex >= reps.length) return cumulativeSegmentStart(segments, segmentIndex);
    return snapTime(cumulativeSegmentStart(segments, segmentIndex) + cumulativeRepStartInSegment(seg, repIndex));
  }

  global.WorkoutPresentation = {
    TIME_SNAP_SEC,
    SPARKS_BURST_DURATION_SEC,
    sparksBurstCountFromCueDurationSec,
    snapTime,
    repDurationForDefault,
    cumulativeRepStartInSegment,
    segmentTimelineDuration,
    cumulativeSegmentStart,
    totalWorkoutDuration,
    repIndexAtLocalSec,
    locateGlobalTime,
    presentationFrame,
    globalSecAtRepStart,
    activeTextCuePresentation,
    repDisplayName,
    activeVfxOverlayState,
    activeVfxSparksState,
    activeVfxTrailState,
    findWinningVfxEvent,
  };
})(typeof window !== "undefined" ? window : globalThis);
