/**
 * Workout playback engine — timeline from `segments` + clock sync for TTS/SFX.
 * Depends on `WorkoutPresentation` (same time grid as editor / `presentationShared`).
 *
 * With `audioEnabled: true`, `advancePlayback` fills `audioCommands` for TTS/SFX lane fires (text is visual-only).
 * See `docs/presentation-player-architecture.md`.
 */
(function (global) {
  "use strict";

  const LANES = new Set(["text", "tts", "sfx"]);

  function ttsTextFromEvent(ev) {
    const parts = [];
    if (ev.name != null && String(ev.name).trim()) parts.push(String(ev.name).trim());
    if (ev.body != null && String(ev.body).trim()) parts.push(String(ev.body).trim());
    if (ev.heading != null && String(ev.heading).trim()) parts.push(String(ev.heading).trim());
    const s = parts.join(". ").trim();
    return s || "TTS cue";
  }

  function audioCommandForEvent(ev, audioEnabled) {
    if (!audioEnabled) return null;
    if (ev.lane === "text") return null;
    if (ev.lane === "sfx") {
      const kind = ev.sfxKind === "shot" ? "shot" : "split";
      const urlRaw = ev.sfxUrl != null ? String(ev.sfxUrl).trim() : "";
      const cmd = { type: "sfx", kind, sourceId: ev.id };
      if (urlRaw) cmd.url = urlRaw;
      return cmd;
    }
    if (ev.lane === "tts") {
      return { type: "tts", text: ttsTextFromEvent(ev), sourceId: ev.id };
    }
    return null;
  }

  /**
   * @param {object[]} segments
   * @param {object} WP - WorkoutPresentation
   * @returns {object[]}
   */
  function buildPlaybackTimeline(segments, WP) {
    const out = [];
    if (!WP || !Array.isArray(segments)) return out;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const gSeg = WP.cumulativeSegmentStart(segments, si);
      const reps = seg && Array.isArray(seg.reps) ? seg.reps : [];
      for (let ri = 0; ri < reps.length; ri++) {
        const rep = reps[ri];
        const gRep = WP.cumulativeRepStartInSegment(seg, ri);
        const events = rep && Array.isArray(rep.events) ? rep.events : [];
        for (let ei = 0; ei < events.length; ei++) {
          const raw = events[ei];
          if (!raw || typeof raw !== "object") continue;
          const lane = raw.lane;
          if (!LANES.has(lane)) continue;
          const start = WP.snapTime(Number(raw.start) || 0);
          let dur = Number(raw.duration);
          if (!Number.isFinite(dur) || dur < WP.TIME_SNAP_SEC) dur = WP.TIME_SNAP_SEC;
          dur = WP.snapTime(dur);
          const globalStart = WP.snapTime(gSeg + gRep + start);
          const globalEnd = WP.snapTime(globalStart + dur);
          const id = "s" + si + "-r" + ri + "-" + lane + "-" + globalStart.toFixed(3) + "-e" + ei;
          out.push({
            id,
            segmentIndex: si,
            repIndex: ri,
            eventIndex: ei,
            lane,
            globalStart,
            globalEnd,
            name: raw.name != null ? String(raw.name) : "",
            heading: raw.heading,
            body: raw.body,
            sfxKind: raw.sfxKind,
            sfxUrl: raw.sfxUrl != null ? String(raw.sfxUrl) : "",
            elementId: raw.elementId != null ? String(raw.elementId) : "",
          });
        }
      }
    }
    out.sort((a, b) => a.globalStart - b.globalStart || a.id.localeCompare(b.id));
    return out;
  }

  class WorkoutPlaybackEngine {
    /**
     * @param {object} opts
     * @param {object[]} opts.segments
     * @param {boolean} [opts.audioEnabled=true] - when false, `audioCommands` stay empty
     */
    constructor(opts) {
      const WP = global.WorkoutPresentation;
      if (!WP) throw new Error("WorkoutPresentation must load before WorkoutPlaybackEngine");
      this._WP = WP;
      this.audioEnabled = opts.audioEnabled !== false;
      this._segments = Array.isArray(opts.segments) ? opts.segments : [];
      this.timeline = buildPlaybackTimeline(this._segments, WP);
      this.playedKeys = new Set();
    }

    /** Replace workout data and rebuild the timeline. */
    rebuild(segments) {
      this._segments = Array.isArray(segments) ? segments : [];
      this.timeline = buildPlaybackTimeline(this._segments, this._WP);
      this.playedKeys.clear();
    }

    /**
     * After a seek / scrub release / jump: events strictly before `globalSec` are treated as already consumed.
     */
    syncAfterSeek(globalSec) {
      const t = this._WP.snapTime(globalSec);
      this.playedKeys.clear();
      for (let i = 0; i < this.timeline.length; i++) {
        const ev = this.timeline[i];
        if (ev.globalStart < t - 1e-9) this.playedKeys.add(ev.id);
      }
    }

    /**
     * Forward-only step along the workout clock (typical play tick).
     * @returns {{ fired: object[], audioCommands: object[] }}
     */
    advancePlayback(fromSec, toSec) {
      const fired = [];
      const audioCommands = [];
      const lo = this._WP.snapTime(Math.min(fromSec, toSec));
      const hi = this._WP.snapTime(Math.max(fromSec, toSec));
      if (hi <= lo + 1e-12) return { fired, audioCommands };

      for (let i = 0; i < this.timeline.length; i++) {
        const ev = this.timeline[i];
        if (ev.globalStart > lo + 1e-9 && ev.globalStart <= hi + 1e-9) {
          if (!this.playedKeys.has(ev.id)) {
            this.playedKeys.add(ev.id);
            fired.push(ev);
            const ac = audioCommandForEvent(ev, this.audioEnabled);
            if (ac) audioCommands.push(ac);
          }
        }
      }

      return { fired, audioCommands };
    }
  }

  global.WorkoutPlaybackEngine = {
    buildPlaybackTimeline,
    create(opts) {
      return new WorkoutPlaybackEngine(Object.assign({ audioEnabled: true }, opts || {}));
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
