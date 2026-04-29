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

  /** Workout seconds — drop queued TTS never started this far past its start (large scrub only). */
  const TTS_STALE_SKIP_SEC = 90;
  /** Timeline jitter allowance for “cue is due” (seconds). */
  const TTS_TIMELINE_EPS_SEC = 0.001;
  /** Same-timeline instant: stacked cues share start within this window (seconds) — no interrupt, play in order. */
  const TTS_SAME_START_SEC = 0.0005;
  /** Web Audio lookahead for sample-accurate SFX scheduling (seconds). */
  const SFX_SCHEDULE_LOOKAHEAD_SEC = 0.005;

  function createPlayerPlaybackAudio(opts) {
    if (opts == null || typeof opts !== "object") opts = {};

    let ctx = null;
    const activeNodes = [];
    /** @type {{ text: string, slot: "a"|"b", globalStartSec: number, sourceId?: string, ttsRate?: number, ttsPitch?: number }[]} */
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
          resolve([]);
          return;
        }
        const list0 = syn.getVoices() || [];
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
          resolve(finalList);
        }
        function onVc() {
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
          resolve(false);
          return;
        }
        try {
          if (syn.paused && typeof syn.resume === "function") {
            syn.resume();
          }
        } catch (_) {}
        ensureVoicesLoadedPromise(syn).then(function (voices) {
          try {
            if (syn.paused && typeof syn.resume === "function") syn.resume();
          } catch (_) {}
          const ready = !!(voices && voices.length > 0);
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
      try {
        if (syn.paused && typeof syn.resume === "function") {
          syn.resume();
        }
      } catch (_) {}
      try {
        if (syn.speaking) {
          syn.cancel();
        }
      } catch (_) {}
      return true;
    }

    function pumpTtsQueue() {
      const syn = global.speechSynthesis;
      if (!syn) {
        return;
      }

      pruneStaleTtsQueue();

      const t = lastWorkoutTimeSec;

      if (ttsQueue.length === 0) {
        return;
      }

      const occupied = !!(syn.speaking || syn.pending);
      const next = ttsQueue[0];

      if (occupied) {
        if (t + TTS_TIMELINE_EPS_SEC < next.globalStartSec) {
          return;
        }
        const canPreempt =
          ttsCurrentlyPlaying == null ||
          ttsCurrentlyPlaying.globalStartSec < next.globalStartSec - TTS_SAME_START_SEC;
        if (!canPreempt) {
          return;
        }
        synInterruptForTtsResync();
        return pumpTtsQueue();
      }

      const gen = ttsGen;
      const item = ttsQueue.shift();
      if (!item || !item.text) {
        global.queueMicrotask(pumpTtsQueue);
        return;
      }

      ensureSpeechSynthesisReady(syn).then(function (ready) {
        if (gen !== ttsGen) {
          ttsQueue.unshift(item);
          return;
        }
        if (!ready) {
          item._voiceRetries = (item._voiceRetries || 0) + 1;
          if (item._voiceRetries > 24) {
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

        const u = new SpeechSynthesisUtterance(item.text);
        u.rate = Number.isFinite(item.ttsRate) ? item.ttsRate : 1;
        u.pitch = Number.isFinite(item.ttsPitch) ? item.ttsPitch : 1;
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
          if (gen !== ttsGen) return;
          ttsCurrentlyPlaying = null;
          pumpTtsQueue();
        }
        u.addEventListener("end", function () {
          onDone();
        });
        u.addEventListener("error", function () {
          onDone();
        });
        try {
          if (syn.paused && typeof syn.resume === "function") syn.resume();
        } catch (_) {}
        try {
          syn.speak(u);
        } catch (_) {
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

    function removeOscillatorsFromActive(batch) {
      for (let b = 0; b < batch.length; b++) {
        const o = batch[b];
        const j = activeNodes.indexOf(o);
        if (j >= 0) activeNodes.splice(j, 1);
      }
    }

    /**
     * Synthetic SFX aligned with squash-ghoster-full `scripts.js`:
     * `playShotSound` (1000 Hz sine, 0.1 s, linear gain 3 → exponential decay) and
     * Split: same sequence as squash-ghoster `playSplitStepPowerUp` (8 × triangle, 440×1.15^i), with total
     * duration 0.7s / 0.5s / 0.3s (slow / medium / fast) so cues align to the editor’s 0.1s grid.
     * @param {string} kind "shot" | "split"
     * @param {string|undefined} url optional sample URL
     * @param {string|undefined} sfxSplitSpeed "slow" | "medium" | "fast" (split only; ignored for shot / URL)
     */
    function playSfx(kind, url, sfxSplitSpeed) {
      if (url) {
        try {
          const a = new global.Audio(url);
          a.preload = "auto";
          void a.play().catch(function () {
            playSfx(kind, undefined, sfxSplitSpeed);
          });
        } catch (_) {
          playSfx(kind, undefined, sfxSplitSpeed);
        }
        return;
      }
      const c = ensureCtx();
      if (global._debugAudioTiming) {
        console.log("[AudioTiming] playSfx", kind, "audioCtx state:", c ? c.state : "null", "currentTime:", c ? c.currentTime.toFixed(3) : "N/A");
      }
      if (!c || c.state !== "running") {
        if (global._debugAudioTiming) {
          console.warn("[AudioTiming] playSfx SKIPPED - AudioContext not running");
        }
        return;
      }
      /* Play immediately with small lookahead for sample accuracy. */
      const now = c.currentTime + SFX_SCHEDULE_LOOKAHEAD_SEC;

      if (kind === "shot") {
        const duration = 0.1;
        const frequency = 1000;
        const volume = 3.0;
        const oscillator = c.createOscillator();
        const gainNode = c.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(c.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        gainNode.gain.setValueAtTime(volume, now);
        oscillator.start(now);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, now + duration);
        oscillator.stop(now + duration);
        activeNodes.push(oscillator);
        global.setTimeout(function () {
          removeOscillatorsFromActive([oscillator]);
        }, Math.ceil((duration + 0.02) * 1000));
        return;
      }

      /* Ghoster `pitch` arg defaults to 'medium' (440 Hz); low/high are unused in timeline playback. */
      const baseFrequency = 440;

      const rawSpeed = sfxSplitSpeed != null ? String(sfxSplitSpeed).trim() : "medium";
      const normalizedSpeed = rawSpeed.toLowerCase();
      const numberOfSteps = 8;
      let totalSplitSec;
      switch (normalizedSpeed) {
        case "slow":
          totalSplitSec = 0.7;
          break;
        case "medium":
          totalSplitSec = 0.5;
          break;
        case "fast":
          totalSplitSec = 0.3;
          break;
        case "auto-scale":
          totalSplitSec = 0.5;
          break;
        default:
          return;
      }
      const durationPerStep = totalSplitSec / numberOfSteps;

      /* Ghoster uses attack 0.01 + decay 0.05; scale both (fixed ratio) if a step is shorter than 0.06 s. */
      const ghostEnvSec = 0.06;
      const envSpan = Math.min(ghostEnvSec, durationPerStep * 0.99);
      const attack = (0.01 / ghostEnvSec) * envSpan;
      const decay = (0.05 / ghostEnvSec) * envSpan;
      const oscillatorType = "triangle";
      const volume = 0.8;
      const batch = [];

      for (let i = 0; i < numberOfSteps; i++) {
        const startTime = now + i * durationPerStep;
        const frequency = baseFrequency * Math.pow(1.15, i);
        const oscillator = c.createOscillator();
        const gainNode = c.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(c.destination);
        oscillator.type = oscillatorType;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + attack);
        gainNode.gain.linearRampToValueAtTime(0, startTime + attack + decay);
        oscillator.start(startTime);
        oscillator.stop(startTime + durationPerStep);
        batch.push(oscillator);
        activeNodes.push(oscillator);
        oscillator.onended = function () {
          try {
            oscillator.disconnect();
            gainNode.disconnect();
          } catch (_) {}
        };
      }

      const totalSec = numberOfSteps * durationPerStep + 0.05;
      global.setTimeout(function () {
        removeOscillatorsFromActive(batch);
      }, Math.ceil(totalSec * 1000));
    }

    /**
     * @param {string} text
     * @param {"a"|"b"} slot
     * @param {number} globalStartSec — workout timeline start for this cue (catch-up / stale logic).
     * @param {string|undefined} sourceId
     */
    function speakTts(text, slot, globalStartSec, sourceId, ttsRate, ttsPitch) {
      const syn = global.speechSynthesis;
      if (!syn) {
        return;
      }
      const t = String(text || "")
        .trim()
        .slice(0, 8000);
      if (!t) {
        return;
      }
      const s = slot === "b" ? "b" : "a";
      const g =
        typeof globalStartSec === "number" && Number.isFinite(globalStartSec)
          ? globalStartSec
          : lastWorkoutTimeSec;
      const sid = sourceId != null ? String(sourceId) : "";
      const item = { text: t, slot: s, globalStartSec: g, sourceId: sid };
      const r = Number(ttsRate);
      const p = Number(ttsPitch);
      if (Number.isFinite(r)) item.ttsRate = Math.min(2.5, Math.max(0.25, r));
      if (Number.isFinite(p)) item.ttsPitch = Math.min(2, Math.max(0, p));
      ttsQueue.push(item);
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
      for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        if (!cmd || typeof cmd !== "object") continue;
        if (cmd.type === "sfx")
          playSfx(cmd.kind === "shot" ? "shot" : "split", cmd.url, cmd.sfxSplitSpeed);
        else if (cmd.type === "tts") {
          const gs = cmd.globalStartSec;
          speakTts(
            cmd.text,
            cmd.voiceSlot === "b" ? "b" : "a",
            typeof gs === "number" && Number.isFinite(gs) ? gs : lastWorkoutTimeSec,
            cmd.sourceId,
            cmd.ttsRate,
            cmd.ttsPitch
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
