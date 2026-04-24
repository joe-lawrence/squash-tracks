/**
 * Workout playback engine — timeline from `segments` + clock sync for TTS/SFX.
 * Depends on `WorkoutPresentation` (same time grid as editor / `presentationShared`).
 *
 * With `audioEnabled: true`, `advancePlayback` fills `audioCommands` for TTS/SFX lane fires (text is visual-only).
 * See `docs/presentation-player-architecture.md`.
 */
(function (global) {
  "use strict";

  const LANES = new Set(["text", "tts", "sfx", "vfx"]);

  function ttsTextFromEvent(ev) {
    if (ev.speech != null && String(ev.speech).trim()) {
      return String(ev.speech).trim();
    }
    const parts = [];
    if (ev.name != null && String(ev.name).trim()) parts.push(String(ev.name).trim());
    if (ev.body != null && String(ev.body).trim()) parts.push(String(ev.body).trim());
    if (ev.heading != null && String(ev.heading).trim()) parts.push(String(ev.heading).trim());
    const s = parts.join(". ").trim();
    return s || "TTS cue";
  }

  function audioCommandForEvent(ev, audioEnabled) {
    if (!audioEnabled) {
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
        const events = rep && Array.isArray(rep.events) ? rep.events : [];
        for (let ei = 0; ei < events.length; ei++) {
          const raw = events[ei];
          if (!raw || typeof raw !== "object") continue;
          const lane = raw.lane;
          if (!LANES.has(lane)) continue;
          // Event start times are segment-local (editor timeline position), not rep-local
          const start = WP.snapTime(Number(raw.start) || 0);
          let dur = Number(raw.duration);
          if (!Number.isFinite(dur) || dur < WP.TIME_SNAP_SEC) dur = WP.TIME_SNAP_SEC;
          dur = WP.snapTime(dur);
          const globalStart = WP.snapTime(gSeg + start);
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
            milestone: raw.milestone,
          };
          if (lane === "tts") {
            row.voiceSlot = raw.voiceSlot === "b" ? "b" : "a";
            if (raw.speech != null && String(raw.speech).trim()) row.speech = String(raw.speech).trim();
          }
          if (lane === "vfx") {
            row.vfxKind = raw.vfxKind != null ? String(raw.vfxKind).trim() : "bg_fade";
            row.vfxRepeatCount = raw.vfxRepeatCount;
            row.vfxEffectType =
              raw.vfxEffectType != null ? String(raw.vfxEffectType).trim().toLowerCase() : "background";
            row.vfxBgMode = raw.vfxBgMode != null ? String(raw.vfxBgMode).trim().toLowerCase() : "";
            row.vfxFadeInOnly = !!raw.vfxFadeInOnly;
            row.vfxColorMode = raw.vfxColorMode === "custom" ? "custom" : "scheme";
            row.vfxColor = raw.vfxColor != null ? String(raw.vfxColor) : "";
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
     * @param {object} [opts]
     * @param {number} [opts.strictlyBeforeGlobalSec] — when set, do not fire events with `globalStart` at or after this instant (manual rep gate at rep end).
     * @returns {{ fired: object[], audioCommands: object[] }}
     */
    advancePlayback(fromSec, toSec, opts) {
      const fired = [];
      const audioCommands = [];
      const lo = this._WP.snapTime(Math.min(fromSec, toSec));
      const hi = this._WP.snapTime(Math.max(fromSec, toSec));
      if (hi <= lo + 1e-12) return { fired, audioCommands };
      const cap =
        opts && typeof opts === "object" && Number.isFinite(Number(opts.strictlyBeforeGlobalSec))
          ? Number(opts.strictlyBeforeGlobalSec)
          : null;

      for (let i = 0; i < this.timeline.length; i++) {
        const ev = this.timeline[i];
        /* Inclusive of `lo` so cues exactly at the playhead edge fire; `playedKeys` prevents double-fire. */
        if (ev.globalStart < lo - 1e-9) continue;
        if (ev.globalStart > hi + 1e-9) continue;
        if (cap != null && ev.globalStart >= cap - 1e-12) continue;
        if (!this.playedKeys.has(ev.id)) {
          this.playedKeys.add(ev.id);
          fired.push(ev);
          const ac = audioCommandForEvent(ev, this.audioEnabled);
          if (ac) {
            audioCommands.push(ac);
          }
        }
      }

      return { fired, audioCommands };
    }

    /**
     * Get sorted array of milestone start times (for sticky milestone feature).
     * TTS events default to milestone=true, others default to false.
     * @returns {number[]}
     */
    getMilestones() {
      const milestones = [];
      for (let i = 0; i < this.timeline.length; i++) {
        const ev = this.timeline[i];
        const isMilestone = ev.milestone !== undefined ? ev.milestone : (ev.lane === "tts");
        if (isMilestone) {
          milestones.push(ev.globalStart);
        }
      }
      return milestones;
    }

    /** @deprecated Use getMilestones() instead */
    getTtsMilestones() {
      return this.getMilestones();
    }
  }

  // Sticky milestone state
  let _stickyMilestone = null;
  let _stickyStartTime = 0;
  let _stickyCumulativePush = 0;
  const STICKY_HOLD_MS = 1000;
  const STICKY_PUSH_THRESHOLD = 1.5;

  /**
   * Apply "sticky" resistance when scrubbing near TTS milestones.
   * @param {number} currentTime - current playhead position
   * @param {number} rawTargetTime - where scrubbing wants to go
   * @param {number[]} ttsMilestones - sorted array of TTS start times
   * @param {object} [opts]
   * @returns {{time: number, sticky: boolean}} adjusted target time and whether sticky is active
   */
  function applyTtsStickyMilestones(currentTime, rawTargetTime, ttsMilestones, opts) {
    if (!ttsMilestones || ttsMilestones.length === 0) return { time: rawTargetTime, sticky: false };
    const SNAP_THRESHOLD = (opts && opts.snapThreshold) || 0.4;

    const movingForward = rawTargetTime > currentTime;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Check if we're currently stuck at a milestone
    if (_stickyMilestone !== null) {
      const stuckDuration = now - _stickyStartTime;
      const pushAmount = Math.abs(rawTargetTime - _stickyMilestone);
      _stickyCumulativePush += pushAmount;

      // Release conditions: held long enough OR pushed hard enough
      if (stuckDuration >= STICKY_HOLD_MS || _stickyCumulativePush >= STICKY_PUSH_THRESHOLD) {
        _stickyMilestone = null;
        _stickyStartTime = 0;
        _stickyCumulativePush = 0;
        return { time: rawTargetTime, sticky: false };
      }

      // Still stuck - stay at milestone
      return { time: _stickyMilestone, sticky: true };
    }

    // Check if we should stick to a milestone
    for (let i = 0; i < ttsMilestones.length; i++) {
      const ts = ttsMilestones[i];
      
      // Check if we're crossing or about to cross this milestone
      const wouldCross = movingForward 
        ? (currentTime < ts && rawTargetTime >= ts - SNAP_THRESHOLD)
        : (currentTime > ts && rawTargetTime <= ts + SNAP_THRESHOLD);
      
      if (wouldCross) {
        // Stick to this milestone
        _stickyMilestone = ts;
        _stickyStartTime = now;
        _stickyCumulativePush = 0;
        return { time: ts, sticky: true };
      }
    }

    return { time: rawTargetTime, sticky: false };
  }

  /**
   * Reset sticky state (call when scrubbing stops).
   */
  function resetTtsStickyState() {
    _stickyMilestone = null;
    _stickyStartTime = 0;
    _stickyCumulativePush = 0;
  }

  /**
   * Check if any milestones were crossed and trigger haptic feedback.
   * @param {number} prevTime
   * @param {number} newTime
   * @param {number[]} ttsMilestones
   */
  function checkTtsMilestonesCrossed(prevTime, newTime, ttsMilestones) {
    if (!ttsMilestones || ttsMilestones.length === 0) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    for (let i = 0; i < ttsMilestones.length; i++) {
      const ts = ttsMilestones[i];
      const crossed = (prevTime < ts && newTime >= ts) || (prevTime > ts && newTime <= ts);
      if (crossed) {
        try { navigator.vibrate(12); } catch (_) {}
        return;
      }
    }
  }

  global.WorkoutPlaybackEngine = {
    buildPlaybackTimeline,
    applyTtsStickyMilestones,
    checkTtsMilestonesCrossed,
    resetTtsStickyState,
    create(opts) {
      return new WorkoutPlaybackEngine(Object.assign({ audioEnabled: true }, opts || {}));
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
