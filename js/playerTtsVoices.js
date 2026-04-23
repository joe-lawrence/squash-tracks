/**
 * Browser TTS voice list for the workout player — filtering mirrors
 * `populateVoiceSelect` in squash-ghoster-full/squash-ghoster/scripts.js (iOS allow-list,
 * English-first elsewhere, then all voices as fallback).
 */
(function (global) {
  "use strict";

  /** Same allow-list as squash-ghoster-full when running on iOS Safari. */
  const IOS_VOICE_NAMES = ["Karen", "Daniel", "Moira", "Rishi", "Samantha"];

  function isLikelyIOS() {
    const userAgent = navigator.userAgent;
    return (
      (/iPad|iPhone|iPod/.test(userAgent) ||
        (userAgent.includes("Mac") && "ontouchend" in document) ||
        (userAgent.includes("Safari") && userAgent.includes("Mac") && navigator.maxTouchPoints > 0)) &&
      !global.MSStream
    );
  }

  /**
   * @returns {SpeechSynthesisVoice[]}
   */
  function getFilteredSpeechVoices() {
    const syn = global.speechSynthesis;
    if (!syn || typeof syn.getVoices !== "function") return [];
    const voices = syn.getVoices() || [];
    let filteredVoices = [];
    if (isLikelyIOS()) {
      filteredVoices = voices.filter(function (voice) {
        return IOS_VOICE_NAMES.indexOf(voice.name) >= 0;
      });
    } else {
      const englishVoices = voices.filter(function (voice) {
        return voice.lang && String(voice.lang).startsWith("en-");
      });
      filteredVoices = englishVoices.length > 0 ? englishVoices : voices;
    }
    if (filteredVoices.length === 0 && voices.length > 0) {
      filteredVoices = voices;
    }
    const out = [];
    const seen = new Set();
    for (let i = 0; i < filteredVoices.length; i++) {
      const v = filteredVoices[i];
      if (!v || !v.name || seen.has(v.name)) continue;
      seen.add(v.name);
      out.push(v);
    }
    return out;
  }

  global.PlayerTtsVoices = {
    IOS_VOICE_NAMES,
    isLikelyIOS,
    getFilteredSpeechVoices,
  };
})(typeof window !== "undefined" ? window : globalThis);
