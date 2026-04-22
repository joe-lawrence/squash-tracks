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

  /**
   * @param {Document} doc
   * @param {object} opts
   * @param {object[]} opts.segments
   * @param {string} [opts.workoutName]
   * @param {string} opts.defaultWorkoutName
   * @param {number} opts.timeSec — global workout second (caller clamps if needed)
   */
  function renderPresentationIntoDocument(doc, opts) {
    const WP = global.WorkoutPresentation;
    if (!WP || typeof WP.presentationFrame !== "function") return;
    const segments = opts.segments;
    const defaultWorkoutName = opts.defaultWorkoutName || "Workout";
    const maxT = WP.totalWorkoutDuration(segments);
    const t = Math.max(0, Math.min(Number(opts.timeSec) || 0, maxT));
    const frame = WP.presentationFrame(segments, t);
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

  global.WorkoutPresentationShared = {
    PRES_SVG_PLAY,
    PRES_SVG_PAUSE,
    scrubSpeedMultiplier,
    formatPresentationTime,
    formatPresentationElapsedTotal,
    renderPresentationIntoDocument,
  };
})(typeof window !== "undefined" ? window : globalThis);
