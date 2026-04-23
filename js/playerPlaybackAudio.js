/**
 * Minimal workout audio: Web Audio beeps for SFX lane, Speech Synthesis for TTS lane.
 * Text lane stays visual-only. Requires a user gesture before first `resumeIfNeeded()` (call from Play).
 *
 * TTS follows squash-ghoster-full `squash-ghoster/scripts.js`:
 * `ensureVoicesLoaded` → `ensureSpeechSynthesisReady` → `performTTSHealthCheck` → `SpeechSynthesisUtterance`
 * with volume/pitch/rate defaults like `speakUtterance` (no primer utterance — that caused “chirps”).
 */
(function (global) {
  "use strict";

  const TTS_DEBUG =
    typeof global.location !== "undefined" &&
    typeof URLSearchParams !== "undefined" &&
    new URLSearchParams(global.location.search || "").has("ttsDebug");

  /** Workout seconds — drop queued TTS never started this far past its start (large scrub only). */
  const TTS_STALE_SKIP_SEC = 90;
  /** Timeline jitter allowance for “cue is due” (seconds). */
  const TTS_TIMELINE_EPS_SEC = 0.001;
  /** Same-timeline instant: stacked cues share start within this window (seconds) — no interrupt, play in order. */
  const TTS_SAME_START_SEC = 0.0005;
  /** Cap speaking rate when catching up from late start. */
  const TTS_RATE_MAX = 1.42;

  function createPlayerPlaybackAudio(opts) {
    if (opts == null || typeof opts !== "object") opts = {};

    if (TTS_DEBUG) {
      console.log("[TTS] createPlayerPlaybackAudio called");
      console.log("[TTS] speechSynthesis available:", !!global.speechSynthesis);
      console.log("[TTS] SpeechSynthesisUtterance available:", typeof global.SpeechSynthesisUtterance);
      if (global.speechSynthesis) {
        const voices = global.speechSynthesis.getVoices() || [];
        console.log("[TTS] initial voices count:", voices.length);
        if (voices.length > 0) {
          console.log("[TTS] first 5 voices:", voices.slice(0, 5).map(function (v) { return v.name + " (" + v.lang + ")"; }));
        }
      }
    }

    let ctx = null;
    const activeNodes = [];
    /** @type {{ text: string, slot: "a"|"b", globalStartSec: number, sourceId?: string }[]} */
    const ttsQueue = [];
    let ttsGen = 0;
    /** Authoritative workout clock (sec) for TTS catch-up / stale pruning — set each `executeCommands`. */
    let lastWorkoutTimeSec = 0;
    /** @type {{ globalStartSec: number, slot: "a"|"b" } | null} */
    let ttsCurrentlyPlaying = null;

    function clearTtsQueue() {
      ttsQueue.length = 0;
    }

    /**
     * Get filtered English voices using PlayerTtsVoices (same logic as Ghoster).
     */
    function getFilteredEnglishVoices() {
      if (global.PlayerTtsVoices && typeof global.PlayerTtsVoices.getFilteredSpeechVoices === "function") {
        return global.PlayerTtsVoices.getFilteredSpeechVoices();
      }
      const syn = global.speechSynthesis;
      if (!syn || typeof syn.getVoices !== "function") return [];
      const voices = syn.getVoices() || [];
      const english = voices.filter(function (v) {
        return v && v.lang && String(v.lang).startsWith("en-");
      });
      return english.length > 0 ? english : voices;
    }

    /**
     * Pick the best default English voice (first from filtered list, preferring en-US/en-GB).
     */
    function pickDefaultEnglishVoice() {
      const filtered = getFilteredEnglishVoices();
      if (filtered.length === 0) return null;
      let best = filtered[0];
      let bestScore = -1;
      for (let i = 0; i < filtered.length; i++) {
        const v = filtered[i];
        const lang = v.lang != null ? String(v.lang).toLowerCase() : "";
        let score = 0;
        if (lang === "en-us") score += 3;
        else if (lang === "en-gb") score += 2;
        else if (lang.startsWith("en-")) score += 1;
        if (v.default) score += 1;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (TTS_DEBUG) console.log("[TTS] pickDefaultEnglishVoice:", best ? best.name + " (" + best.lang + ")" : "none");
      return best;
    }

    function resolveSpeechVoiceForSlot(slot) {
      const syn = global.speechSynthesis;
      if (!syn || typeof syn.getVoices !== "function") return null;
      const nameRaw =
        slot === "b" && typeof opts.getVoiceBName === "function"
          ? opts.getVoiceBName()
          : typeof opts.getVoiceAName === "function"
            ? opts.getVoiceAName()
            : "Default";
      const name = nameRaw != null ? String(nameRaw).trim() : "";
      if (!name || name === "Default") {
        return pickDefaultEnglishVoice();
      }
      const voices = syn.getVoices() || [];
      const matches = [];
      for (let i = 0; i < voices.length; i++) {
        if (voices[i] && voices[i].name === name) matches.push(voices[i]);
      }
      if (matches.length === 0) return pickDefaultEnglishVoice();
      if (matches.length === 1) return matches[0];
      let best = matches[0];
      let bestScore = -1;
      for (let j = 0; j < matches.length; j++) {
        const v = matches[j];
        const lang = v.lang != null ? String(v.lang).toLowerCase() : "";
        let score = 0;
        if (lang.startsWith("en")) score += 2;
        if (lang === "en-us" || lang === "en-gb") score += 1;
        if (v.default) score += 1;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      return best;
    }

    function synInterruptForTtsResync() {
      const syn = global.speechSynthesis;
      if (!syn) return;
      ttsGen++;
      ttsCurrentlyPlaying = null;
      try {
        syn.cancel();
      } catch (_) {}
    }

    function pruneStaleTtsQueue() {
      const t = lastWorkoutTimeSec;
      let guard = 0;
      while (ttsQueue.length > 0 && guard++ < 500) {
        const head = ttsQueue[0];
        if (t <= head.globalStartSec + TTS_STALE_SKIP_SEC) break;
        ttsQueue.shift();
      }
    }

    /**
     * Ghoster `ensureVoicesLoaded` (scripts.js ~9628).
     * @param {SpeechSynthesis} syn
     * @returns {Promise<SpeechSynthesisVoice[]>}
     */
    function ensureVoicesLoadedPromise(syn) {
      return new Promise(function (resolve) {
        if (!syn || typeof syn.getVoices !== "function") {
          if (TTS_DEBUG) console.warn("[TTS] ensureVoicesLoadedPromise: no speechSynthesis or getVoices");
          resolve([]);
          return;
        }
        const list0 = syn.getVoices() || [];
        if (TTS_DEBUG) console.log("[TTS] ensureVoicesLoadedPromise: initial voices count =", list0.length);
        if (list0.length > 0) {
          resolve(list0);
          return;
        }
        let settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          try {
            syn.removeEventListener("voiceschanged", onVc);
          } catch (_) {}
          try {
            void syn.getVoices();
          } catch (_) {}
          const finalList = syn.getVoices() || [];
          if (TTS_DEBUG) console.log("[TTS] ensureVoicesLoadedPromise: resolved with", finalList.length, "voices");
          resolve(finalList);
        }
        function onVc() {
          if (TTS_DEBUG) console.log("[TTS] voiceschanged event fired");
          if ((syn.getVoices() || []).length > 0) finish();
        }
        syn.addEventListener("voiceschanged", onVc);
        global.setTimeout(finish, 2800);
        try {
          void syn.getVoices();
        } catch (_) {}
      });
    }

    /**
     * Ghoster `ensureSpeechSynthesisReady` (scripts.js ~9645): resume + require at least one voice.
     * @param {SpeechSynthesis} syn
     */
    function ensureSpeechSynthesisReady(syn) {
      return new Promise(function (resolve) {
        if (!syn || !("SpeechSynthesisUtterance" in global)) {
          if (TTS_DEBUG) console.warn("[TTS] ensureSpeechSynthesisReady: speechSynthesis or SpeechSynthesisUtterance not available");
          resolve(false);
          return;
        }
        try {
          if (syn.paused && typeof syn.resume === "function") {
            if (TTS_DEBUG) console.log("[TTS] ensureSpeechSynthesisReady: resuming paused synthesis");
            syn.resume();
          }
        } catch (_) {}
        ensureVoicesLoadedPromise(syn).then(function (voices) {
          try {
            if (syn.paused && typeof syn.resume === "function") syn.resume();
          } catch (_) {}
          const ready = !!(voices && voices.length > 0);
          if (TTS_DEBUG) console.log("[TTS] ensureSpeechSynthesisReady: ready =", ready, "voices =", voices.length);
          resolve(ready);
        });
      });
    }

    /**
     * Ghoster `performTTSHealthCheck` (scripts.js ~9674): resume; cancel only if already speaking
     * (clears stuck output before the next `speak`, without treating `pending` alone as stuck).
     */
    function performTtsHealthCheck(syn) {
      if (!syn) return false;
      if (TTS_DEBUG) console.log("[TTS] performTtsHealthCheck: paused =", syn.paused, "speaking =", syn.speaking, "pending =", syn.pending);
      try {
        if (syn.paused && typeof syn.resume === "function") {
          if (TTS_DEBUG) console.log("[TTS] performTtsHealthCheck: resuming");
          syn.resume();
        }
      } catch (_) {}
      try {
        if (syn.speaking) {
          if (TTS_DEBUG) console.log("[TTS] performTtsHealthCheck: cancelling current speech");
          syn.cancel();
        }
      } catch (_) {}
      return true;
    }

    function pumpTtsQueue() {
      const syn = global.speechSynthesis;
      if (!syn) {
        if (TTS_DEBUG) console.warn("[TTS] pumpTtsQueue: no speechSynthesis");
        return;
      }

      pruneStaleTtsQueue();

      const t = lastWorkoutTimeSec;

      if (ttsQueue.length === 0) {
        if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: queue empty");
        return;
      }

      const occupied = !!(syn.speaking || syn.pending);
      const next = ttsQueue[0];

      if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: queueLen =", ttsQueue.length, "occupied =", occupied, "workoutTime =", t.toFixed(2), "nextCueTime =", next.globalStartSec.toFixed(2));

      if (occupied) {
        if (t + TTS_TIMELINE_EPS_SEC < next.globalStartSec) {
          if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: occupied but next cue not due yet, waiting");
          return;
        }
        const canPreempt =
          ttsCurrentlyPlaying == null ||
          ttsCurrentlyPlaying.globalStartSec < next.globalStartSec - TTS_SAME_START_SEC;
        if (!canPreempt) {
          if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: occupied, cannot preempt current");
          return;
        }
        if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: preempting current for newer cue");
        synInterruptForTtsResync();
        return pumpTtsQueue();
      }

      const gen = ttsGen;
      const item = ttsQueue.shift();
      if (!item || !item.text) {
        if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: empty item, skip");
        global.queueMicrotask(pumpTtsQueue);
        return;
      }

      if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: processing item:", item.text.slice(0, 80), "slot =", item.slot);

      ensureSpeechSynthesisReady(syn).then(function (ready) {
        if (gen !== ttsGen) {
          if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: generation changed, re-queue item");
          ttsQueue.unshift(item);
          return;
        }
        if (!ready) {
          item._voiceRetries = (item._voiceRetries || 0) + 1;
          if (TTS_DEBUG) console.warn("[TTS] pumpTtsQueue: not ready, retry", item._voiceRetries);
          if (item._voiceRetries > 24) {
            if (TTS_DEBUG) console.error("[TTS] pumpTtsQueue: giving up after 24 retries");
            if (gen === ttsGen) {
              ttsCurrentlyPlaying = null;
              pumpTtsQueue();
            }
            return;
          }
          ttsQueue.unshift(item);
          global.setTimeout(function () {
            pumpTtsQueue();
          }, 120);
          return;
        }

        performTtsHealthCheck(syn);

        const lag = Math.max(0, lastWorkoutTimeSec - item.globalStartSec);
        const u = new SpeechSynthesisUtterance(item.text);
        u.rate = Math.min(TTS_RATE_MAX, 1 + lag * 0.28);
        u.pitch = 1;
        if (typeof opts.getAudioDuckingOn === "function" && opts.getAudioDuckingOn()) {
          try {
            u.volume = 0.85;
          } catch (_) {}
        } else {
          try {
            u.volume = 1;
          } catch (_) {}
        }

        let v = null;
        try {
          v = resolveSpeechVoiceForSlot(item.slot === "b" ? "b" : "a");
        } catch (_) {
          v = null;
        }
        if (TTS_DEBUG) console.log("[TTS] pumpTtsQueue: resolved voice =", v ? v.name : "(default)", "lang =", v ? v.lang : "?");
        if (v) {
          try {
            u.voice = v;
            if (v.lang) {
              try {
                u.lang = v.lang;
              } catch (_) {}
            }
          } catch (_) {
            try {
              u.lang = (v && v.lang) || "en-US";
            } catch (_) {}
          }
        } else {
          try {
            u.lang =
              (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "en-US";
          } catch (_) {
            try {
              u.lang = "en-US";
            } catch (_) {}
          }
        }

        ttsCurrentlyPlaying = { globalStartSec: item.globalStartSec, slot: item.slot };

        function onDone() {
          if (TTS_DEBUG) console.log("[TTS] utterance done/error for:", item.text.slice(0, 40));
          if (gen !== ttsGen) return;
          ttsCurrentlyPlaying = null;
          pumpTtsQueue();
        }
        u.addEventListener("end", function () {
          if (TTS_DEBUG) console.log("[TTS] utterance 'end' event");
          onDone();
        });
        u.addEventListener("error", function (ev) {
          if (TTS_DEBUG) console.warn("[TTS] utterance 'error' event:", ev && ev.error);
          onDone();
        });
        try {
          if (syn.paused && typeof syn.resume === "function") syn.resume();
        } catch (_) {}
        try {
          if (TTS_DEBUG) console.log("[TTS] calling syn.speak() with text:", item.text.slice(0, 80), "rate =", u.rate, "volume =", u.volume);
          syn.speak(u);
          if (TTS_DEBUG) console.log("[TTS] syn.speak() returned, speaking =", syn.speaking, "pending =", syn.pending);
        } catch (e) {
          if (TTS_DEBUG) console.error("[TTS] syn.speak() threw:", e);
          onDone();
        }
      });
    }

    function ensureCtx() {
      if (!ctx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
      }
      return ctx;
    }

    function resumeIfNeeded() {
      const c = ensureCtx();
      if (!c) return Promise.resolve();
      if (c.state === "suspended") return c.resume();
      return Promise.resolve();
    }

    function cancelOscillators() {
      for (let i = 0; i < activeNodes.length; i++) {
        try {
          activeNodes[i].stop(0);
        } catch (_) {}
      }
      activeNodes.length = 0;
    }

    /** Short synthetic beep — distinct profiles for shot vs split. */
    /** @param {string} kind @param {string|undefined} url */
    function playSfx(kind, url) {
      if (url) {
        try {
          const a = new global.Audio(url);
          a.preload = "auto";
          void a.play().catch(function () {
            playSfx(kind, undefined);
          });
        } catch (_) {
          playSfx(kind, undefined);
        }
        return;
      }
      const c = ensureCtx();
      if (!c || c.state !== "running") return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      const isShot = kind === "shot";
      const f0 = isShot ? 1400 : 520;
      const f1 = isShot ? 1100 : 380;
      const dur = isShot ? 0.07 : 0.11;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      activeNodes.push(osc);
      global.setTimeout(function () {
        const j = activeNodes.indexOf(osc);
        if (j >= 0) activeNodes.splice(j, 1);
      }, Math.ceil((dur + 0.05) * 1000));
    }

    /**
     * @param {string} text
     * @param {"a"|"b"} slot
     * @param {number} globalStartSec — workout timeline start for this cue (catch-up / stale logic).
     * @param {string|undefined} sourceId
     */
    function speakTts(text, slot, globalStartSec, sourceId) {
      const syn = global.speechSynthesis;
      if (!syn) {
        if (TTS_DEBUG) console.warn("[TTS] speakTts: no speechSynthesis, skipping");
        return;
      }
      const t = String(text || "")
        .trim()
        .slice(0, 8000);
      if (!t) {
        if (TTS_DEBUG) console.warn("[TTS] speakTts: empty text after trim, skipping");
        return;
      }
      const s = slot === "b" ? "b" : "a";
      const g =
        typeof globalStartSec === "number" && Number.isFinite(globalStartSec)
          ? globalStartSec
          : lastWorkoutTimeSec;
      const sid = sourceId != null ? String(sourceId) : "";
      if (TTS_DEBUG) console.log("[TTS] speakTts: queuing text:", t.slice(0, 60), "slot =", s, "globalStart =", g.toFixed(2));
      ttsQueue.push({ text: t, slot: s, globalStartSec: g, sourceId: sid });
    }

    function cancelAll() {
      ttsGen++;
      ttsCurrentlyPlaying = null;
      clearTtsQueue();
      cancelOscillators();
      try {
        if (global.speechSynthesis) global.speechSynthesis.cancel();
      } catch (_) {}
    }

    /**
     * @param {object[]} cmds from WorkoutPlaybackEngine (`type`: `sfx` | `tts`)
     * @param {{ workoutTimeSec?: number }} [meta] — pass `workoutTimeSec` so TTS can catch up to the timeline.
     */
    function executeCommands(cmds, meta) {
      if (!Array.isArray(cmds) || cmds.length === 0) return;
      if (meta != null && typeof meta === "object") {
        const wt = meta.workoutTimeSec;
        if (typeof wt === "number" && Number.isFinite(wt)) lastWorkoutTimeSec = wt;
      }
      if (TTS_DEBUG) console.log("[TTS] executeCommands: received", cmds.length, "commands, workoutTime =", lastWorkoutTimeSec.toFixed(2));
      for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        if (!cmd || typeof cmd !== "object") continue;
        if (TTS_DEBUG) console.log("[TTS] executeCommands: cmd", i, "type =", cmd.type, cmd.type === "tts" ? "text = " + (cmd.text || "").slice(0, 40) : "");
        if (cmd.type === "sfx")
          playSfx(cmd.kind === "shot" ? "shot" : "split", cmd.url);
        else if (cmd.type === "tts") {
          const gs = cmd.globalStartSec;
          speakTts(
            cmd.text,
            cmd.voiceSlot === "b" ? "b" : "a",
            typeof gs === "number" && Number.isFinite(gs) ? gs : lastWorkoutTimeSec,
            cmd.sourceId
          );
        }
      }
      pumpTtsQueue();
    }

    return {
      resumeIfNeeded,
      executeCommands,
      cancelAll,
    };
  }

  global.createPlayerPlaybackAudio = createPlayerPlaybackAudio;
})(typeof window !== "undefined" ? window : globalThis);
