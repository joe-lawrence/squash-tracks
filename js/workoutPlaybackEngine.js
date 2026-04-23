/**
 * Workout playback engine — timeline from `segments` + clock sync for TTS/SFX.
 * Depends on `WorkoutPresentation` (same time grid as editor / `presentationShared`).
 *
 * With `audioEnabled: true`, `advancePlayback` fills `audioCommands` for TTS/SFX lane fires (text is visual-only).
 * See `docs/presentation-player-architecture.md`.
 */
(function (global) {
  "use strict";

  const ENGINE_DEBUG =
    typeof global.location !== "undefined" &&
    typeof URLSearchParams !== "undefined" &&
    new URLSearchParams(global.location.search || "").has("ttsDebug");

  const LANES = new Set(["text", "tts", "sfx"]);

  function ttsTextFromEvent(ev) {
    if (ev.speech != null && String(ev.speech).trim()) {
      if (ENGINE_DEBUG) console.log("[Engine] ttsTextFromEvent: using ev.speech =", String(ev.speech).trim().slice(0, 60));
      return String(ev.speech).trim();
    }
    const parts = [];
    if (ev.name != null && String(ev.name).trim()) parts.push(String(ev.name).trim());
    if (ev.body != null && String(ev.body).trim()) parts.push(String(ev.body).trim());
    if (ev.heading != null && String(ev.heading).trim()) parts.push(String(ev.heading).trim());
    const s = parts.join(". ").trim();
    if (ENGINE_DEBUG) console.log("[Engine] ttsTextFromEvent: fallback text =", (s || "TTS cue").slice(0, 60));
    return s || "TTS cue";
  }

  function audioCommandForEvent(ev, audioEnabled) {
    if (!audioEnabled) {
      if (ENGINE_DEBUG && ev.lane === "tts") console.log("[Engine] audioCommandForEvent: audioEnabled=false, skipping TTS");
      return null;
    }
    if (ev.lane === "text") return null;
    if (ev.lane === "sfx") {
      const kind = ev.sfxKind === "shot" ? "shot" : "split";
      const urlRaw = ev.sfxUrl != null ? String(ev.sfxUrl).trim() : "";
      const cmd = { type: "sfx", kind, sourceId: ev.id };
      if (urlRaw) cmd.url = urlRaw;
      return cmd;
    }
    if (ev.lane === "tts") {
      const cmd = {
        type: "tts",
        text: ttsTextFromEvent(ev),
        sourceId: ev.id,
        globalStartSec: ev.globalStart,
        voiceSlot: ev.voiceSlot === "b" ? "b" : "a",
      };
      if (ENGINE_DEBUG) console.log("[Engine] audioCommandForEvent: TTS command created, text =", cmd.text.slice(0, 60));
      return cmd;
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
          const row = {
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
          };
          if (lane === "tts") {
            row.voiceSlot = raw.voiceSlot === "b" ? "b" : "a";
            if (raw.speech != null && String(raw.speech).trim()) row.speech = String(raw.speech).trim();
          }
          out.push(row);
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
      if (ENGINE_DEBUG) {
        console.log("[Engine] WorkoutPlaybackEngine created: audioEnabled =", this.audioEnabled, "timeline events =", this.timeline.length);
        const ttsEvents = this.timeline.filter(function (e) { return e.lane === "tts"; });
        console.log("[Engine] TTS events in timeline:", ttsEvents.length);
        if (ttsEvents.length > 0) {
          console.log("[Engine] First TTS event:", ttsEvents[0]);
        }
      }
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
        /* Inclusive of `lo` so cues exactly at the playhead edge fire; `playedKeys` prevents double-fire. */
        if (ev.globalStart >= lo - 1e-9 && ev.globalStart <= hi + 1e-9) {
          if (!this.playedKeys.has(ev.id)) {
            this.playedKeys.add(ev.id);
            fired.push(ev);
            const ac = audioCommandForEvent(ev, this.audioEnabled);
            if (ac) {
              audioCommands.push(ac);
              if (ENGINE_DEBUG && ac.type === "tts") {
                console.log("[Engine] advancePlayback: TTS fired at", ev.globalStart.toFixed(2), "text =", ac.text.slice(0, 40));
              }
            }
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
