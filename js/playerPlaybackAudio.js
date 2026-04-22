/**
 * Minimal workout audio: Web Audio beeps for SFX lane, Speech Synthesis for TTS lane.
 * Text lane stays visual-only. Requires a user gesture before first `resumeIfNeeded()` (call from Play).
 */
(function (global) {
  "use strict";

  function createPlayerPlaybackAudio() {
    let ctx = null;
    const activeNodes = [];
    const ttsQueue = [];
    let ttsGen = 0;

    function clearTtsQueue() {
      ttsQueue.length = 0;
    }

    function pumpTtsQueue() {
      const syn = global.speechSynthesis;
      if (!syn || ttsQueue.length === 0) return;
      if (syn.speaking || syn.pending) return;
      const gen = ttsGen;
      const t = ttsQueue.shift();
      if (!t) return;
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 1;
      function onDone() {
        if (gen !== ttsGen) return;
        pumpTtsQueue();
      }
      u.onend = onDone;
      u.onerror = onDone;
      try {
        syn.speak(u);
      } catch (_) {
        onDone();
      }
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

    function speakTts(text) {
      const syn = global.speechSynthesis;
      if (!syn) return;
      const t = String(text || "")
        .trim()
        .slice(0, 500);
      if (!t) return;
      ttsQueue.push(t);
      global.queueMicrotask(function () {
        pumpTtsQueue();
      });
    }

    function cancelAll() {
      ttsGen++;
      clearTtsQueue();
      cancelOscillators();
      try {
        if (global.speechSynthesis) global.speechSynthesis.cancel();
      } catch (_) {}
    }

    /**
     * @param {object[]} cmds from WorkoutPlaybackEngine (`type`: `sfx` | `tts`)
     */
    function executeCommands(cmds) {
      if (!Array.isArray(cmds) || cmds.length === 0) return;
      for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        if (!cmd || typeof cmd !== "object") continue;
        if (cmd.type === "sfx")
          playSfx(cmd.kind === "shot" ? "shot" : "split", cmd.url);
        else if (cmd.type === "tts") speakTts(cmd.text);
      }
    }

    return {
      resumeIfNeeded,
      executeCommands,
      cancelAll,
    };
  }

  global.createPlayerPlaybackAudio = createPlayerPlaybackAudio;
})(typeof window !== "undefined" ? window : globalThis);
