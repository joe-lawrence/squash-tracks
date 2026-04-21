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
   */
  function presentationFrame(segments, globalSec) {
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
  };
})(typeof window !== "undefined" ? window : globalThis);
