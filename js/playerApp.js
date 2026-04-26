/**
 * Standalone workout player — uses WorkoutPresentation + WorkoutPresentationShared
 * so transport + on-screen preview stay aligned with editor.html.
 */
(function () {
  "use strict";

  const DEFAULT_WORKOUT_NAME = "Workout";
  const PRES_REP_BOUNDARY_SEC = 1;

  /**
   * Same scheme ids + display names as squash-ghoster-full (themeSchemes in scripts.js).
   * localStorage keys: theme, darkScheme, lightScheme.
   */
  const PLAYER_THEME_SCHEMES = {
    dark: {
      "blue-ocean": { name: "Blue Ocean" },
      "purple-nebula": { name: "Purple Nebula" },
      "forest-night": { name: "Forest Night" },
      "crimson-shadow": { name: "Crimson Shadow" },
      "midnight-teal": { name: "Midnight Teal" },
    },
    light: {
      "cloud-silver": { name: "Cloud Silver" },
      "warm-sunset": { name: "Warm Sunset" },
      "fresh-mint": { name: "Fresh Mint" },
      "rose-gold": { name: "Rose Gold" },
      "arctic-blue": { name: "Arctic Blue" },
      "lavender-mist": { name: "Lavender Mist" },
    },
  };

  let playerThemeMenuState = { current: "main" };

  function readPlayerThemeState() {
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    let theme = localStorage.getItem("theme") || (prefersDark ? "dark" : "light");
    if (theme !== "light" && theme !== "dark") theme = prefersDark ? "dark" : "light";
    let darkScheme = localStorage.getItem("darkScheme") || "blue-ocean";
    let lightScheme = localStorage.getItem("lightScheme") || "cloud-silver";
    if (!PLAYER_THEME_SCHEMES.dark[darkScheme]) darkScheme = "blue-ocean";
    if (!PLAYER_THEME_SCHEMES.light[lightScheme]) lightScheme = "cloud-silver";
    return { theme: theme, darkScheme: darkScheme, lightScheme: lightScheme };
  }

  function applyPlayerThemeToDocument(state) {
    const scheme = state.theme === "dark" ? state.darkScheme : state.lightScheme;
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.setAttribute("data-color-scheme", scheme);
    try {
      localStorage.setItem("theme", state.theme);
      localStorage.setItem("darkScheme", state.darkScheme);
      localStorage.setItem("lightScheme", state.lightScheme);
    } catch (_) {}
  }

  function selectPlayerThemeScheme(themeType, schemeId) {
    if (themeType !== "dark" && themeType !== "light") return;
    const bucket = PLAYER_THEME_SCHEMES[themeType];
    if (!bucket || !bucket[schemeId]) return;
    const st = readPlayerThemeState();
    if (themeType === "dark") st.darkScheme = schemeId;
    else st.lightScheme = schemeId;
    st.theme = themeType;
    applyPlayerThemeToDocument(st);
    playerThemeMenuState.current = "main";
    closePlayerMenu();
  }

  function populatePlayerThemeTier2() {
    const container = document.getElementById("playerThemeOptions");
    if (!container) return;
    container.replaceChildren();
    const chevron =
      '<span class="player-theme-menu-chevron" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>';
    /* Lucide moon — https://lucide.dev/icons/moon (ISC) */
    const moonIcon =
      '<span class="player-theme-menu-btn-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg></span>';
    /* Lucide sun-medium — https://lucide.dev/icons/sun-medium (ISC) */
    const sunIcon =
      '<span class="player-theme-menu-btn-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v1" /><path d="M12 20v1" /><path d="M3 12h1" /><path d="M20 12h1" /><path d="m18.364 5.636-.707.707" /><path d="m6.343 17.657-.707.707" /><path d="m5.636 5.636.707.707" /><path d="m17.657 17.657.707.707" /></svg></span>';
    const darkBtn = document.createElement("button");
    darkBtn.type = "button";
    darkBtn.className = "player-theme-menu-btn";
    darkBtn.innerHTML = moonIcon + "<span>Dark themes</span>" + chevron;
    darkBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      playerThemeMenuState.current = "dark";
      populatePlayerThemeTier3();
    });
    container.appendChild(darkBtn);

    const lightBtn = document.createElement("button");
    lightBtn.type = "button";
    lightBtn.className = "player-theme-menu-btn";
    lightBtn.innerHTML = sunIcon + "<span>Light themes</span>" + chevron;
    lightBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      playerThemeMenuState.current = "light";
      populatePlayerThemeTier3();
    });
    container.appendChild(lightBtn);
  }

  function populatePlayerThemeTier3() {
    const container = document.getElementById("playerThemeSchemeOptions");
    if (!container) return;
    if (playerThemeMenuState.current === "main") {
      container.replaceChildren();
      return;
    }

    container.replaceChildren();

    const mode = playerThemeMenuState.current;
    const schemes = PLAYER_THEME_SCHEMES[mode];
    const st = readPlayerThemeState();
    Object.keys(schemes).forEach(function (schemeId) {
      const schemeData = schemes[schemeId];
      const isActive =
        st.theme === mode &&
        ((mode === "dark" && st.darkScheme === schemeId) ||
          (mode === "light" && st.lightScheme === schemeId));
      const option = document.createElement("button");
      option.type = "button";
      option.className = "player-theme-option" + (isActive ? " player-theme-option--active" : "");
      const preview = document.createElement("span");
      preview.className = "player-theme-preview " + schemeId;
      preview.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "player-theme-name";
      label.textContent = schemeData.name;
      option.appendChild(preview);
      option.appendChild(label);
      option.addEventListener("click", function (e) {
        e.stopPropagation();
        selectPlayerThemeScheme(mode, schemeId);
      });
      container.appendChild(option);
    });
    showPlayerMenuView("theme-schemes");
  }

  function populatePlayerThemePanels() {
    populatePlayerThemeTier2();
    populatePlayerThemeTier3();
  }

  function readStoredTtsVoiceA() {
    try {
      const x = localStorage.getItem("playerTtsVoiceA");
      return x != null && String(x).trim() !== "" ? String(x).trim() : "Default";
    } catch (_) {
      return "Default";
    }
  }

  function readStoredTtsVoiceB() {
    try {
      const x = localStorage.getItem("playerTtsVoiceB");
      return x != null && String(x).trim() !== "" ? String(x).trim() : "Default";
    } catch (_) {
      return "Default";
    }
  }

  function writeStoredTtsVoices(a, b) {
    try {
      localStorage.setItem("playerTtsVoiceA", a);
      localStorage.setItem("playerTtsVoiceB", b);
    } catch (_) {}
  }

  function ttsSelectVoiceForBothSlots(valueName) {
    writeStoredTtsVoices(valueName, valueName);
  }

  function ttsRowAssignmentState(valueName) {
    const a = readStoredTtsVoiceA();
    const b = readStoredTtsVoiceB();
    const isA = a === valueName;
    const isB = b === valueName;
    if (isA && isB) return "both";
    if (isA) return "a";
    if (isB) return "b";
    return "none";
  }

  function ttsAssignVoiceSlot(slot, valueName) {
    try {
      if (slot === "a") localStorage.setItem("playerTtsVoiceA", valueName);
      else localStorage.setItem("playerTtsVoiceB", valueName);
    } catch (_) {}
  }

  function readPlayerAudioDuckingOn() {
    try {
      return localStorage.getItem("playerAudioDucking") === "on";
    } catch (_) {
      return false;
    }
  }

  function syncPlayerAudioDuckingButton() {
    const btn = document.getElementById("playerMenuAudioDuckingBtn");
    if (!btn) return;
    const on = document.documentElement.getAttribute("data-player-audio-ducking") === "on";
    btn.classList.toggle("player-menu-audio-duck-btn--on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // --- Audio Ducking Heartbeat ---
  // Keeps speechSynthesis active so the OS doesn't constantly adjust system sound levels.
  let duckingHeartbeatInterval = null;

  function stopDuckingHeartbeat() {
    if (duckingHeartbeatInterval) {
      clearInterval(duckingHeartbeatInterval);
      duckingHeartbeatInterval = null;
    }
  }

  function startDuckingHeartbeat(announce) {
    stopDuckingHeartbeat();
    const syn = window.speechSynthesis;
    if (!syn) return;

    // Optionally speak "Audio ducking enabled" once at normal volume
    if (announce) {
      try {
        const msg = new SpeechSynthesisUtterance("Audio ducking enabled");
        msg.lang = navigator.language || "en-US";
        msg.volume = 1.0;
        syn.speak(msg);
      } catch (_) {}
    }

    // Every 1 second, speak an empty utterance at volume 0 to keep synthesis active
    duckingHeartbeatInterval = setInterval(function () {
      if (document.documentElement.getAttribute("data-player-audio-ducking") !== "on") {
        stopDuckingHeartbeat();
        return;
      }
      if (syn && !syn.speaking && !syn.pending) {
        try {
          const silent = new SpeechSynthesisUtterance("");
          silent.lang = "en-US";
          silent.volume = 0.0;
          syn.speak(silent);
        } catch (_) {}
      }
    }, 1000);
  }

  function applyPlayerAudioDuckingFromStorage() {
    const on = readPlayerAudioDuckingOn();
    document.documentElement.setAttribute("data-player-audio-ducking", on ? "on" : "off");
    syncPlayerAudioDuckingButton();
    // Start heartbeat if ducking was already enabled (but don't announce — user knows from previous session)
    if (on) {
      startDuckingHeartbeat(false);
    }
  }

  function setPlayerAudioDucking(on) {
    try {
      localStorage.setItem("playerAudioDucking", on ? "on" : "off");
    } catch (_) {}
    document.documentElement.setAttribute("data-player-audio-ducking", on ? "on" : "off");
    syncPlayerAudioDuckingButton();
    if (on) {
      startDuckingHeartbeat(true);
    } else {
      stopDuckingHeartbeat();
    }
  }

  function togglePlayerAudioDucking() {
    const cur = document.documentElement.getAttribute("data-player-audio-ducking") === "on";
    setPlayerAudioDucking(!cur);
  }

  function populatePlayerTtsVoiceMenus() {
    const list = document.getElementById("playerTtsVoiceList");
    if (!list) return;

    function speechIconWrap() {
      const wrap = document.createElement("span");
      wrap.className = "player-menu-tts-speech-wrap";
      wrap.setAttribute("aria-hidden", "true");
      wrap.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20"/><path d="M19.8 17.8a7.5 7.5 0 0 0 .003-10.603"/><path d="M17 15a3.5 3.5 0 0 0-.025-4.975"/></svg>';
      return wrap;
    }

    function describeAssignment(st) {
      if (st === "both") return "Pattern A B: this voice on A and B.";
      if (st === "a") return "Pattern A _: this voice on A only.";
      if (st === "b") return "Pattern _ B: this voice on B only.";
      return "Pattern _ _: not assigned.";
    }

    function makeVoiceRow(label, valueName) {
      const st = ttsRowAssignmentState(valueName);
      const row = document.createElement("div");
      row.className = "player-menu-tts-voice-row" + (st !== "none" ? " player-menu-tts-voice-row--on" : "");

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className = "player-menu-tts-voice-main";
      mainBtn.setAttribute(
        "aria-label",
        label +
          ". " +
          describeAssignment(st) +
          " Click name to use this voice for both A and B. Use the A or B button to set only that slot."
      );
      mainBtn.appendChild(speechIconWrap());
      const lab = document.createElement("span");
      lab.className = "player-menu-tts-voice-label";
      lab.textContent = label;
      mainBtn.appendChild(lab);
      mainBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        ttsSelectVoiceForBothSlots(valueName);
        populatePlayerTtsVoiceMenus();
      });
      row.appendChild(mainBtn);

      const badgeA = document.createElement("button");
      badgeA.type = "button";
      badgeA.className =
        "player-menu-tts-badge" + (st === "a" || st === "both" ? " player-menu-tts-badge--on" : "");
      badgeA.textContent = "A";
      badgeA.setAttribute("aria-label", "Set Voice A to " + label);
      badgeA.addEventListener("click", function (e) {
        e.stopPropagation();
        ttsAssignVoiceSlot("a", valueName);
        populatePlayerTtsVoiceMenus();
      });
      row.appendChild(badgeA);

      const badgeB = document.createElement("button");
      badgeB.type = "button";
      badgeB.className =
        "player-menu-tts-badge" + (st === "b" || st === "both" ? " player-menu-tts-badge--on" : "");
      badgeB.textContent = "B";
      badgeB.setAttribute("aria-label", "Set Voice B to " + label);
      badgeB.addEventListener("click", function (e) {
        e.stopPropagation();
        ttsAssignVoiceSlot("b", valueName);
        populatePlayerTtsVoiceMenus();
      });
      row.appendChild(badgeB);

      return row;
    }

    const T = window.PlayerTtsVoices;
    const filtered =
      T && typeof T.getFilteredSpeechVoices === "function" ? T.getFilteredSpeechVoices() : [];

    list.replaceChildren();

    const rows = [{ valueName: "Default", label: "Default" }];
    for (let i = 0; i < filtered.length; i++) {
      const v = filtered[i];
      if (!v || !v.name) continue;
      rows.push({ valueName: v.name, label: v.name });
    }

    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      list.appendChild(makeVoiceRow(r.label, r.valueName));
    }
  }

  let segments = [];
  let workoutName = DEFAULT_WORKOUT_NAME;
  let presTimeSec = 0;
  let presPlaying = false;
  let presRafId = 0;
  let presWallLast = 0;

  let presScrubDir = 0;
  let presScrubAnimId = 0;
  let presScrubLastFrameTs = 0;
  let presScrubHoldStartMs = 0;
  let presScrubPointerAc = null;
  let presScrubCaptureEl = null;
  let presScrubCapturePid = -1;

  /** Manual rep `transition`: freeze at rep end until user swipes the chevron gate (FF/rew/skip still move time). */
  let presManualRepGateAwaiting = false;
  /** While gate is up, presentation/audio stay on this rep until continue (segmentIndex / repIndex of the manual rep). */
  let presManualRepGateMeta = null;
  let presManualGateAckTimer = 0;
  let presManualGateDragState = null;
  const PRES_MANUAL_GATE_SWIPE_MIN_PX = 42;
  const PRES_MANUAL_GATE_LOCK_RATIO = 1.35;
  const PRES_MANUAL_GATE_MAX_DX_PX = 120;
  const PRES_MANUAL_GATE_MAX_DY_PX = 120;
  const PRES_MANUAL_GATE_THROW_MIN_PX = 92;
  const PRES_MANUAL_GATE_THROW_MAX_PX = 172;

  function presResetManualGateButtonUi() {
    if (presManualGateAckTimer) {
      clearTimeout(presManualGateAckTimer);
      presManualGateAckTimer = 0;
    }
    const gateBtn = document.getElementById("presManualRepGateBtn");
    if (gateBtn) {
      gateBtn.classList.remove(
        "presentation-manual-rep-gate__btn--ack-pending",
        "presentation-manual-rep-gate__btn--dragging",
        "presentation-manual-rep-gate__btn--throwing"
      );
      gateBtn.style.setProperty("--pres-manual-gate-dx", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-dy", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-throw-dx", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-throw-dy", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-throw-target", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-throw-target-y", "0px");
      gateBtn.style.setProperty("--pres-manual-gate-scale", "1");
    }
    presManualGateDragState = null;
  }

  function presClearManualRepGate() {
    presManualRepGateAwaiting = false;
    presManualRepGateMeta = null;
    presResetManualGateButtonUi();
  }

  function presDismissManualRepGate() {
    if (!presManualRepGateAwaiting) return;
    presManualRepGateAwaiting = false;
    presManualRepGateMeta = null;
    presResetManualGateButtonUi();
    presWallLast = performance.now();
    const w = WP();
    if (w && Array.isArray(segments) && segments.length) {
      const maxT = w.totalWorkoutDuration(segments);
      const t0 = w.snapTime(presTimeSec);
      presTimeSec = Math.min(t0 + w.TIME_SNAP_SEC, maxT);
    }
    if (playbackEngine) playbackEngine.syncAfterSeek(presTimeSec);
    presentationRender();
    if (presPlaying && !presRafId) {
      presRafId = requestAnimationFrame(presTick);
    }
  }

  const Sh = () => window.WorkoutPresentationShared;
  const WP = () => window.WorkoutPresentation;
  const urlParams =
    typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const debugEngine = urlParams.has("debugEngine");
  const muteAudio = urlParams.has("muteAudio");
  const playerAudio =
    typeof createPlayerPlaybackAudio === "function"
      ? createPlayerPlaybackAudio({
          getVoiceAName: readStoredTtsVoiceA,
          getVoiceBName: readStoredTtsVoiceB,
          getAudioDuckingOn: readPlayerAudioDuckingOn,
        })
      : null;
  let playbackEngine = null;

  let playerTransportRevealTimer = 0;

  function setPlayerPlayingUi(playing) {
    document.body.classList.toggle("player-playing", !!playing);
    if (!playing) {
      if (playerTransportRevealTimer) {
        clearTimeout(playerTransportRevealTimer);
        playerTransportRevealTimer = 0;
      }
      document.body.classList.remove("player-transport-open");
    }
  }

  function revealPlayerTransportBriefly() {
    if (!document.body.classList.contains("player-playing")) return;
    document.body.classList.add("player-transport-open");
    if (playerTransportRevealTimer) clearTimeout(playerTransportRevealTimer);
    playerTransportRevealTimer = window.setTimeout(function () {
      document.body.classList.remove("player-transport-open");
      playerTransportRevealTimer = 0;
    }, 4200);
  }

  function rebuildPlaybackEngine() {
    playbackEngine = null;
    lastTicksRepKey = ""; // Reset tick cache so milestones re-render
    if (!WP() || typeof WorkoutPlaybackEngine === "undefined") return;
    try {
      playbackEngine = WorkoutPlaybackEngine.create({ segments, audioEnabled: !muteAudio });
      playbackEngine.syncAfterSeek(presTimeSec);
      if (debugEngine && playbackEngine) {
        console.log("[WorkoutPlaybackEngine] timeline events:", playbackEngine.timeline.length);
      }
    } catch (e) {
      playbackEngine = null;
      if (debugEngine) console.warn("WorkoutPlaybackEngine:", e);
    }
  }

  function syncPlaybackEngineAfterSeek() {
    if (playerAudio) playerAudio.cancelAll();
    if (playbackEngine) playbackEngine.syncAfterSeek(presTimeSec);
  }

  function setStatus(msg) {
    const el = document.getElementById("playerStatus");
    if (el) el.textContent = msg || "";
  }

  function showPlayerMenuView(view) {
    const map = {
      main: "playerMenuMainView",
      load: "playerMenuLoadView",
      theme: "playerMenuThemeView",
      "theme-schemes": "playerMenuThemeSchemesView",
      tts: "playerMenuTtsView",
    };
    Object.keys(map).forEach(function (k) {
      const el = document.getElementById(map[k]);
      if (el) el.hidden = k !== view;
    });
    const openBtn = document.getElementById("playerMenuOpenBtn");
    const themeBtn = document.getElementById("playerMenuThemeBtn");
    const ttsBtn = document.getElementById("playerMenuTtsBtn");
    if (openBtn) openBtn.setAttribute("aria-expanded", view === "load" ? "true" : "false");
    if (themeBtn) {
      themeBtn.setAttribute(
        "aria-expanded",
        view === "theme" || view === "theme-schemes" ? "true" : "false"
      );
    }
    if (ttsBtn) {
      ttsBtn.setAttribute("aria-expanded", view === "tts" ? "true" : "false");
    }
  }

  function closePlayerMenu() {
    playerThemeMenuState.current = "main";
    const schemeOpts = document.getElementById("playerThemeSchemeOptions");
    if (schemeOpts) schemeOpts.replaceChildren();
    populatePlayerThemeTier2();
    showPlayerMenuView("main");
    const btn = document.getElementById("presWorkoutTitle");
    const dd = document.getElementById("playerMenuDropdown");
    document.body.classList.remove("player-menu-open");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (dd) dd.hidden = true;
    if (btn) btn.focus();
  }

  function openPlayerMenu() {
    playerThemeMenuState.current = "main";
    const schemeOpts = document.getElementById("playerThemeSchemeOptions");
    if (schemeOpts) schemeOpts.replaceChildren();
    populatePlayerThemePanels();
    showPlayerMenuView("main");
    const btn = document.getElementById("presWorkoutTitle");
    const dd = document.getElementById("playerMenuDropdown");
    if (!btn || !dd) return;
    document.body.classList.add("player-menu-open");
    btn.setAttribute("aria-expanded", "true");
    dd.hidden = false;
    populatePlayerTtsVoiceMenus();
    syncPlayerAudioDuckingButton();
    const openBtn = document.getElementById("playerMenuOpenBtn");
    if (openBtn) openBtn.focus();
  }

  function onPlayerMenuPointerDownOutside(ev) {
    const dd = document.getElementById("playerMenuDropdown");
    if (!dd || dd.hidden) return;
    const anchor = document.getElementById("playerMenuAnchor");
    const panel = document.getElementById("playerMenuPanel");
    const t = ev.target;
    if (anchor && anchor.contains(t)) return;
    if (!dd.contains(t)) {
      closePlayerMenu();
      return;
    }
    if (panel && !panel.contains(t)) {
      closePlayerMenu();
    }
  }

  function wirePlayerMenu() {
    const btn = document.getElementById("presWorkoutTitle");
    const dd = document.getElementById("playerMenuDropdown");
    const openBtn = document.getElementById("playerMenuOpenBtn");
    const aboutLink = document.getElementById("playerAboutLink");
    const loadFile = document.getElementById("playerLoadFileItem");
    const loadUrl = document.getElementById("playerLoadUrlItem");
    const loadPaste = document.getElementById("playerLoadPasteItem");
    const themeBtn = document.getElementById("playerMenuThemeBtn");
    const ttsBtn = document.getElementById("playerMenuTtsBtn");
    const input = document.getElementById("playerFileInput");
    if (!btn || !dd) return;

    document.addEventListener("pointerdown", onPlayerMenuPointerDownOutside, true);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (btn.getAttribute("aria-expanded") === "true") closePlayerMenu();
      else openPlayerMenu();
    });

    if (openBtn) {
      openBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const loadV = document.getElementById("playerMenuLoadView");
        if (loadV && !loadV.hidden) {
          showPlayerMenuView("main");
          return;
        }
        playerThemeMenuState.current = "main";
        const schemeOpts = document.getElementById("playerThemeSchemeOptions");
        if (schemeOpts) schemeOpts.replaceChildren();
        populatePlayerThemeTier2();
        showPlayerMenuView("load");
      });
    }

    if (themeBtn) {
      themeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const themeV = document.getElementById("playerMenuThemeView");
        const schV = document.getElementById("playerMenuThemeSchemesView");
        if ((themeV && !themeV.hidden) || (schV && !schV.hidden)) {
          playerThemeMenuState.current = "main";
          const schemeOpts = document.getElementById("playerThemeSchemeOptions");
          if (schemeOpts) schemeOpts.replaceChildren();
          populatePlayerThemeTier2();
          showPlayerMenuView("main");
          return;
        }
        playerThemeMenuState.current = "main";
        const schemeOpts = document.getElementById("playerThemeSchemeOptions");
        if (schemeOpts) schemeOpts.replaceChildren();
        populatePlayerThemePanels();
        showPlayerMenuView("theme");
      });
    }

    if (ttsBtn) {
      ttsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const ttsV = document.getElementById("playerMenuTtsView");
        if (ttsV && !ttsV.hidden) {
          showPlayerMenuView("main");
          return;
        }
        populatePlayerTtsVoiceMenus();
        showPlayerMenuView("tts");
      });
    }

    const audioDuckBtn = document.getElementById("playerMenuAudioDuckingBtn");
    if (audioDuckBtn) {
      audioDuckBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        togglePlayerAudioDucking();
      });
    }

    const ttsBack = document.getElementById("playerMenuTtsBackBtn");
    if (ttsBack) {
      ttsBack.addEventListener("click", function (e) {
        e.stopPropagation();
        showPlayerMenuView("main");
        const tb = document.getElementById("playerMenuTtsBtn");
        if (tb) tb.focus();
      });
    }

    const loadBack = document.getElementById("playerMenuLoadBackBtn");
    if (loadBack) {
      loadBack.addEventListener("click", function (e) {
        e.stopPropagation();
        showPlayerMenuView("main");
        const ob = document.getElementById("playerMenuOpenBtn");
        if (ob) ob.focus();
      });
    }

    const themeBack = document.getElementById("playerMenuThemeBackBtn");
    if (themeBack) {
      themeBack.addEventListener("click", function (e) {
        e.stopPropagation();
        playerThemeMenuState.current = "main";
        const schemeOpts = document.getElementById("playerThemeSchemeOptions");
        if (schemeOpts) schemeOpts.replaceChildren();
        showPlayerMenuView("main");
        const tb = document.getElementById("playerMenuThemeBtn");
        if (tb) tb.focus();
      });
    }

    const schemesBack = document.getElementById("playerMenuThemeSchemesBackBtn");
    if (schemesBack) {
      schemesBack.addEventListener("click", function (e) {
        e.stopPropagation();
        playerThemeMenuState.current = "main";
        const schemeOpts = document.getElementById("playerThemeSchemeOptions");
        if (schemeOpts) schemeOpts.replaceChildren();
        populatePlayerThemeTier2();
        showPlayerMenuView("theme");
        const tbb = document.getElementById("playerMenuThemeBackBtn");
        if (tbb) tbb.focus();
      });
    }

    if (aboutLink) {
      aboutLink.addEventListener("click", function () {
        closePlayerMenu();
      });
    }

    if (loadFile && input) {
      loadFile.addEventListener("click", function () {
        closePlayerMenu();
        input.click();
      });
    }

    if (loadUrl) {
      loadUrl.addEventListener("click", function () {
        closePlayerMenu();
        void handleLoadWorkoutFromUrlPrompt();
      });
    }

    if (loadPaste) {
      loadPaste.addEventListener("click", function () {
        closePlayerMenu();
        void handlePasteWorkoutJson();
      });
    }

    try {
      if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", function () {
          const ttsV = document.getElementById("playerMenuTtsView");
          if (ttsV && !ttsV.hidden) populatePlayerTtsVoiceMenus();
        });
      }
    } catch (_) {}
  }

  async function handlePasteWorkoutJson() {
    let text = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (_) {}
    if (!text || !String(text).trim()) {
      text = window.prompt("Paste workout JSON:", "") || "";
    }
    if (!String(text).trim()) {
      setStatus("");
      return;
    }
    try {
      const data = JSON.parse(text);
      loadWorkoutFromObject(data);
      setStatus("");
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e));
    }
  }

  async function handleLoadWorkoutFromUrlPrompt() {
    const url = window.prompt("Enter workout JSON URL:", "");
    if (!url || !String(url).trim()) return;
    let fetchUrl = String(url).trim();
    if (fetchUrl.includes("hastebin.com/") && !fetchUrl.includes("/raw/")) {
      const parts = fetchUrl.split("/").filter(Boolean);
      const key = parts[parts.length - 1];
      if (key) fetchUrl = "https://hastebin.com/raw/" + key;
    }
    try {
      setStatus("Loading…");
      const res = await fetch(fetchUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const bodyText = await res.text();
      let data;
      try {
        data = JSON.parse(bodyText);
      } catch (_) {
        const m = bodyText.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("No JSON object found in response");
        data = JSON.parse(m[0]);
      }
      if (Array.isArray(data)) data = data[0];
      loadWorkoutFromObject(data);
      setStatus("");
    } catch (e) {
      setStatus((e && e.message) || String(e));
    }
  }

  function normalizeLoadedWorkout(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid JSON root");
    const wnRaw = data.workoutName != null ? String(data.workoutName).trim() : "";
    const wn = (wnRaw || DEFAULT_WORKOUT_NAME).slice(0, 64);
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      return { workoutName: wn, segments: structuredClone(data.segments) };
    }
    if (Array.isArray(data.reps)) {
      const partName = (data.name != null && String(data.name).trim()) || "Part 1";
      return {
        workoutName: wn,
        segments: [
          {
            name: partName.slice(0, 48),
            elementId: String(data.elementId != null ? data.elementId : "p1").slice(0, 80),
            defaultIntervalSec:
              Number(data.defaultIntervalSec) > 0 ? Number(data.defaultIntervalSec) : 4.5,
            reps: structuredClone(data.reps),
          },
        ],
      };
    }
    throw new Error('Need a "segments" array or single-part "reps" array (editor export).');
  }

  function presClampTimeToWorkout() {
    const w = WP();
    if (!w) return;
    const maxT = w.totalWorkoutDuration(segments);
    presTimeSec = Math.max(0, Math.min(presTimeSec, maxT));
  }

  let lastTicksRepKey = "";

  function renderTtsTicks() {
    const ticksEl = document.getElementById("presProgressTicks");
    if (!ticksEl) return;
    const w = WP();
    if (!w) return;

    // Get current rep info (during manual gate, stay on the finishing rep, not the next)
    let seg;
    let segIndex;
    let rIdx;
    if (presManualRepGateAwaiting && presManualRepGateMeta) {
      segIndex = presManualRepGateMeta.segmentIndex | 0;
      rIdx = presManualRepGateMeta.repIndex | 0;
      seg = segments[segIndex];
    } else {
      const loc = w.locateGlobalTime(segments, presTimeSec);
      seg = loc.segment;
      segIndex = loc.segmentIndex;
      rIdx = w.repIndexAtLocalSec(seg, loc.localSec);
    }
    if (!seg || !Array.isArray(seg.reps)) {
      ticksEl.innerHTML = "";
      return;
    }
    const repKey = segIndex + "-" + rIdx;

    // Only update if rep changed
    if (repKey === lastTicksRepKey) return;
    lastTicksRepKey = repKey;

    const segStart = w.cumulativeSegmentStart(segments, segIndex);
    const g0 = w.cumulativeRepStartInSegment(seg, rIdx);
    const repStartGlobal = segStart + g0;
    const repDur = w.repDurationForDefault(seg.reps[rIdx], seg.defaultIntervalSec);
    
    if (repDur <= 0) {
      ticksEl.innerHTML = "";
      return;
    }

    // Get TTS milestones in this rep
    const milestones = playbackEngine && typeof playbackEngine.getTtsMilestones === "function"
      ? playbackEngine.getTtsMilestones() : [];
    
    const repEndGlobal =
      typeof w.globalSecAtRepEnd === "function"
        ? w.globalSecAtRepEnd(segments, segIndex, rIdx)
        : repStartGlobal + repDur;
    const ticksInRep = milestones.filter(function(ts) {
      return ts >= repStartGlobal - 0.001 && ts < repEndGlobal + 0.001;
    });

    // Render ticks positioned relative to rep progress
    let html = "";
    for (let i = 0; i < ticksInRep.length; i++) {
      const ts = ticksInRep[i];
      const pct = ((ts - repStartGlobal) / repDur) * 100;
      html += '<div class="presentation-progress-tick" style="left:' + pct.toFixed(4) + '%"></div>';
    }
    ticksEl.innerHTML = html;
  }

  function presentationRender() {
    if (!Sh() || !WP()) return;
    presClampTimeToWorkout();
    Sh().renderPresentationIntoDocument(document, {
      segments,
      workoutName,
      defaultWorkoutName: DEFAULT_WORKOUT_NAME,
      timeSec: presTimeSec,
      manualRepTransitionAwaiting: presManualRepGateAwaiting,
      holdManualRep:
        presManualRepGateAwaiting && presManualRepGateMeta
          ? {
              segmentIndex: presManualRepGateMeta.segmentIndex,
              repIndex: presManualRepGateMeta.repIndex,
            }
          : null,
    });
    renderTtsTicks();
  }

  function presStopRaf() {
    if (presRafId) {
      cancelAnimationFrame(presRafId);
      presRafId = 0;
    }
  }

  function presSyncPlayButton() {
    const btn = document.getElementById("presBtnPlayPause");
    const S = Sh();
    if (!btn || !S) return;
    if (presPlaying) {
      btn.innerHTML = S.PRES_SVG_PAUSE;
      btn.setAttribute("aria-label", "Pause workout");
      btn.setAttribute("title", "Pause");
    } else {
      btn.innerHTML = S.PRES_SVG_PLAY;
      btn.setAttribute("aria-label", "Play workout");
      btn.setAttribute("title", "Play");
    }
  }

  function pausePreviewForSeek() {
    presPlaying = false;
    presClearManualRepGate();
    presStopRaf();
    presSyncPlayButton();
    setPlayerPlayingUi(false);
    if (playerAudio) playerAudio.cancelAll();
  }

  /** Sync engine after seek without stopping playback. */
  function seekPreviewKeepPlaying() {
    syncPlaybackEngineAfterSeek();
  }

  function presPause() {
    presPlaying = false;
    presClearManualRepGate();
    presStopRaf();
    presSyncPlayButton();
    setPlayerPlayingUi(false);
    if (playerAudio) playerAudio.cancelAll();
    presentationRender();
  }

  function presTick(now) {
    presRafId = 0;
    if (!presPlaying) return;
    const w = WP();
    if (!w) {
      presPlaying = false;
      presSyncPlayButton();
      setPlayerPlayingUi(false);
      return;
    }
    const maxT = w.totalWorkoutDuration(segments);
    if (presManualRepGateAwaiting) {
      presentationRender();
      if (presTimeSec >= maxT - 1e-6) {
        presPlaying = false;
        presClearManualRepGate();
        presSyncPlayButton();
        setPlayerPlayingUi(false);
        if (playerAudio) playerAudio.cancelAll();
        presentationRender();
        return;
      }
      presRafId = requestAnimationFrame(presTick);
      return;
    }
    const prevT = presTimeSec;
    const dt = (now - presWallLast) / 1000;
    presWallLast = now;
    let candidate = Math.min(presTimeSec + dt, maxT);
    const hit = w.firstManualRepBoundaryBetween(segments, prevT, candidate);
    if (hit) candidate = hit.globalSec;
    presTimeSec = candidate;
    if (playbackEngine) {
      const advOpts =
        hit && Number.isFinite(hit.globalSec) ? { strictlyBeforeGlobalSec: hit.globalSec } : undefined;
      const { fired, audioCommands } = playbackEngine.advancePlayback(prevT, presTimeSec, advOpts);
      if (debugEngine && fired.length) console.debug("[WorkoutPlaybackEngine] fired:", fired);
      if (!muteAudio && playerAudio && audioCommands.length) {
        playerAudio.executeCommands(audioCommands, { workoutTimeSec: presTimeSec });
      }
    }
    if (hit) {
      presManualRepGateAwaiting = true;
      presManualRepGateMeta = { segmentIndex: hit.segmentIndex, repIndex: hit.repIndex };
    }
    presentationRender();
    if (presTimeSec >= maxT - 1e-6) {
      presPlaying = false;
      presClearManualRepGate();
      presSyncPlayButton();
      setPlayerPlayingUi(false);
      if (playerAudio) playerAudio.cancelAll();
      presentationRender();
      return;
    }
    presRafId = requestAnimationFrame(presTick);
  }

  function presPlay() {
    const w = WP();
    if (!w) return;
    presScrubInternalStop();
    presClampTimeToWorkout();
    const maxT = w.totalWorkoutDuration(segments);
    if (presTimeSec >= maxT - 1e-6) presTimeSec = 0;
    syncPlaybackEngineAfterSeek();
    if (!muteAudio && playerAudio) {
      void playerAudio.resumeIfNeeded().catch(function () {});
    }
    presPlaying = true;
    setPlayerPlayingUi(true);
    presWallLast = performance.now();
    presSyncPlayButton();
    presStopRaf();
    presRafId = requestAnimationFrame(presTick);
  }

  function presTogglePlayPause() {
    if (presPlaying) presPause();
    else presPlay();
  }

  function presScrubInternalStop() {
    presScrubDir = 0;
    if (presScrubAnimId) {
      cancelAnimationFrame(presScrubAnimId);
      presScrubAnimId = 0;
    }
    presScrubLastFrameTs = 0;
    if (presScrubPointerAc) {
      presScrubPointerAc.abort();
      presScrubPointerAc = null;
    }
    if (presScrubCaptureEl && presScrubCapturePid >= 0) {
      try {
        if (presScrubCaptureEl.hasPointerCapture(presScrubCapturePid)) {
          presScrubCaptureEl.releasePointerCapture(presScrubCapturePid);
        }
      } catch (_) {}
    }
    presScrubCaptureEl = null;
    presScrubCapturePid = -1;
    presScrubHoldStartMs = 0;
  }

  let presScrubWasPlaying = false;

  function presStopScrubAndSync() {
    presClearManualRepGate();
    presScrubInternalStop();
    const WPE = typeof WorkoutPlaybackEngine !== "undefined" ? WorkoutPlaybackEngine : null;
    if (WPE && typeof WPE.resetTtsStickyState === "function") {
      WPE.resetTtsStickyState();
    }
    const w = WP();
    if (!w) return;
    // Allow 0.0s exactly, otherwise snap to grid
    presTimeSec = presTimeSec <= 0.05 ? 0 : w.snapTime(presTimeSec);
    presClampTimeToWorkout();
    if (presScrubWasPlaying) {
      presScrubWasPlaying = false;
      syncPlaybackEngineAfterSeek();
      presWallLast = performance.now();
      presRafId = requestAnimationFrame(presTick);
    }
    presentationRender();
  }

  function presScrubFrame(ts) {
    if (!presScrubDir) return;
    const w = WP();
    const S = Sh();
    if (!w || !S) {
      presStopScrubAndSync();
      return;
    }
    if (presScrubLastFrameTs === 0) presScrubLastFrameTs = ts;
    const dtWall = (ts - presScrubLastFrameTs) / 1000;
    presScrubLastFrameTs = ts;
    const maxT = w.totalWorkoutDuration(segments);
    const elapsedWall =
      presScrubHoldStartMs > 0 ? (performance.now() - presScrubHoldStartMs) / 1000 : 0;
    const mult = S.scrubSpeedMultiplier(elapsedWall);
    const delta = presScrubDir * mult * dtWall;
    let rawTarget = Math.max(0, Math.min(presTimeSec + delta, maxT));

    const WPE = typeof WorkoutPlaybackEngine !== "undefined" ? WorkoutPlaybackEngine : null;
    const milestones = playbackEngine && typeof playbackEngine.getTtsMilestones === "function"
      ? playbackEngine.getTtsMilestones() : null;
    if (WPE && milestones && milestones.length > 0) {
      const prevTime = presTimeSec;
      const result = WPE.applyTtsStickyMilestones(presTimeSec, rawTarget, milestones);
      rawTarget = result.time;
      WPE.checkTtsMilestonesCrossed(prevTime, rawTarget, milestones);
    }

    presClearManualRepGate();
    presTimeSec = rawTarget;
    presentationRender();
    if (presTimeSec <= 1e-9 && presScrubDir < 0) {
      presStopScrubAndSync();
      return;
    }
    if (presTimeSec >= maxT - 1e-9 && presScrubDir > 0) {
      presStopScrubAndSync();
      return;
    }
    presScrubAnimId = requestAnimationFrame(presScrubFrame);
  }

  function presStartScrub(dir, captureEl, pointerId) {
    const w = WP();
    if (!w) return;
    presScrubInternalStop();
    presScrubWasPlaying = presPlaying;
    presStopRaf();
    if (!presScrubWasPlaying) {
      presPlaying = false;
      presSyncPlayButton();
      setPlayerPlayingUi(false);
      if (playerAudio) playerAudio.cancelAll();
    }
    syncPlaybackEngineAfterSeek();
    presScrubDir = dir;
    presScrubLastFrameTs = 0;
    presScrubHoldStartMs = performance.now();
    if (captureEl != null && pointerId != null) {
      presScrubCaptureEl = captureEl;
      presScrubCapturePid = pointerId;
      try {
        captureEl.setPointerCapture(pointerId);
      } catch (_) {}
    }
    presScrubPointerAc = new AbortController();
    const sig = presScrubPointerAc.signal;
    const end = () => {
      presStopScrubAndSync();
    };
    window.addEventListener("pointerup", end, { signal: sig, capture: true });
    window.addEventListener("pointercancel", end, { signal: sig, capture: true });
    presScrubAnimId = requestAnimationFrame(presScrubFrame);
  }

  function presBindScrubButton(btn, dir) {
    if (!btn) return;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      presStartScrub(dir, btn, e.pointerId);
    });
  }

  function presNextRepStartGlobal(w, segmentIndex, repIndex) {
    const seg = segments[segmentIndex];
    const reps = seg && Array.isArray(seg.reps) ? seg.reps : [];
    const n = reps.length;
    if (repIndex + 1 < n) return w.globalSecAtRepStart(segments, segmentIndex, repIndex + 1);
    if (segmentIndex + 1 < segments.length) return w.globalSecAtRepStart(segments, segmentIndex + 1, 0);
    return w.totalWorkoutDuration(segments);
  }

  function presLastSnapInRepGlobal(w, segmentIndex, repIndex) {
    const nextS = presNextRepStartGlobal(w, segmentIndex, repIndex);
    const repStart = w.globalSecAtRepStart(segments, segmentIndex, repIndex);
    const t = w.snapTime(nextS - w.TIME_SNAP_SEC);
    return Math.max(repStart, Math.min(t, nextS - 1e-9));
  }

  function presIsLastRepOfWorkout(segmentIndex, repIndex) {
    if (segmentIndex < 0 || segmentIndex >= segments.length) return true;
    const seg = segments[segmentIndex];
    const n = seg && Array.isArray(seg.reps) ? seg.reps.length : 0;
    if (n === 0) return true;
    return segmentIndex === segments.length - 1 && repIndex === n - 1;
  }

  function presWorkoutStart() {
    const w = WP();
    if (!w) return;
    presClearManualRepGate();
    presScrubInternalStop();
    const wasPlaying = presPlaying;
    if (!wasPlaying) pausePreviewForSeek();
    presClampTimeToWorkout();
    const loc = w.locateGlobalTime(segments, presTimeSec);
    const { segmentIndex, localSec, segment } = loc;
    if (!segment || !Array.isArray(segment.reps) || segment.reps.length === 0) {
      presTimeSec = 0;
      presClampTimeToWorkout();
    } else {
      const rIdx = w.repIndexAtLocalSec(segment, localSec);
      const repStart = w.globalSecAtRepStart(segments, segmentIndex, rIdx);
      const fromStart = presTimeSec - repStart;
      let target;
      if (fromStart <= PRES_REP_BOUNDARY_SEC + 1e-9) {
        if (rIdx > 0) {
          target = w.globalSecAtRepStart(segments, segmentIndex, rIdx - 1);
        } else if (segmentIndex > 0) {
          const prevSeg = segments[segmentIndex - 1];
          const pn = prevSeg && Array.isArray(prevSeg.reps) ? prevSeg.reps.length : 0;
          target =
            pn > 0
              ? w.globalSecAtRepStart(segments, segmentIndex - 1, pn - 1)
              : w.cumulativeSegmentStart(segments, segmentIndex - 1);
        } else {
          target = repStart;
        }
      } else {
        target = repStart;
      }
      presTimeSec = w.snapTime(target);
      presClampTimeToWorkout();
    }
    if (wasPlaying) {
      seekPreviewKeepPlaying();
      presWallLast = performance.now();
    }
    presentationRender();
  }

  function presWorkoutEnd() {
    const w = WP();
    if (!w) return;
    presClearManualRepGate();
    presScrubInternalStop();
    const wasPlaying = presPlaying;
    if (!wasPlaying) pausePreviewForSeek();
    presClampTimeToWorkout();
    const loc = w.locateGlobalTime(segments, presTimeSec);
    const { segmentIndex, localSec, segment } = loc;
    if (!segment || !Array.isArray(segment.reps) || segment.reps.length === 0) {
      presTimeSec = w.totalWorkoutDuration(segments);
      presClampTimeToWorkout();
    } else {
      const rIdx = w.repIndexAtLocalSec(segment, localSec);
      const target = presIsLastRepOfWorkout(segmentIndex, rIdx)
        ? presLastSnapInRepGlobal(w, segmentIndex, rIdx)
        : presNextRepStartGlobal(w, segmentIndex, rIdx);
      presTimeSec = w.snapTime(Math.max(0, Math.min(target, w.totalWorkoutDuration(segments))));
      presClampTimeToWorkout();
    }
    if (wasPlaying) {
      seekPreviewKeepPlaying();
      presWallLast = performance.now();
    }
    presentationRender();
  }

  function bindPresentationControls() {
    if (!WP()) {
      setStatus("workoutPresentation.js failed to load.");
      return;
    }
    if (!Sh()) {
      setStatus("presentationShared.js failed to load.");
      return;
    }
    if (typeof WorkoutPlaybackEngine === "undefined") {
      console.warn("workoutPlaybackEngine.js missing — timeline playback disabled.");
    }
    if (typeof createPlayerPlaybackAudio === "undefined") {
      console.warn("playerPlaybackAudio.js missing — TTS/SFX playback disabled.");
    }
    const bSkip0 = document.getElementById("presBtnSkipStart");
    const bRew = document.getElementById("presBtnRewind");
    const bPlay = document.getElementById("presBtnPlayPause");
    const bFF = document.getElementById("presBtnFastForward");
    const bSkip1 = document.getElementById("presBtnSkipEnd");
    if (bSkip0) bSkip0.addEventListener("click", () => presWorkoutStart());
    presBindScrubButton(bRew, -1);
    if (bPlay) bPlay.addEventListener("click", () => presTogglePlayPause());
    presBindScrubButton(bFF, 1);
    if (bSkip1) bSkip1.addEventListener("click", () => presWorkoutEnd());
    presSyncPlayButton();

    const gateBtn = document.getElementById("presManualRepGateBtn");
    if (gateBtn) {
      function presManualGateAckAndDismiss(releaseDxPx, releaseDyPx) {
        if (!presManualRepGateAwaiting) return;
        if (gateBtn.classList.contains("presentation-manual-rep-gate__btn--ack-pending")) return;
        const dx = releaseDxPx || 0;
        const dy = releaseDyPx || 0;
        const dist = Math.hypot(dx, dy);
        const throwMag = Math.max(
          PRES_MANUAL_GATE_THROW_MIN_PX,
          Math.min(PRES_MANUAL_GATE_THROW_MAX_PX, Math.round(Math.abs(dx) * 1.45))
        );
        const ux = dist > 0.5 ? dx / dist : 1;
        const uy = dist > 0.5 ? dy / dist : 0;
        const throwTx = Math.round(throwMag * ux);
        const throwTy = Math.round(throwMag * uy);
        gateBtn.classList.remove("presentation-manual-rep-gate__btn--dragging");
        gateBtn.classList.add("presentation-manual-rep-gate__btn--throwing");
        gateBtn.style.setProperty("--pres-manual-gate-throw-target", throwTx + "px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-target-y", throwTy + "px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-dx", throwTx + "px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-dy", throwTy + "px");
        gateBtn.classList.add("presentation-manual-rep-gate__btn--ack-pending");
        presManualGateAckTimer = window.setTimeout(function () {
          presManualGateAckTimer = 0;
          presDismissManualRepGate();
        }, 420);
      }

      function presManualGateResetDragVisual() {
        gateBtn.classList.remove(
          "presentation-manual-rep-gate__btn--dragging",
          "presentation-manual-rep-gate__btn--throwing"
        );
        gateBtn.style.setProperty("--pres-manual-gate-dx", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-dy", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-dx", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-dy", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-target", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-throw-target-y", "0px");
        gateBtn.style.setProperty("--pres-manual-gate-scale", "1");
      }

      gateBtn.addEventListener(
        "pointerdown",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!presManualRepGateAwaiting) return;
          if (gateBtn.classList.contains("presentation-manual-rep-gate__btn--ack-pending")) return;
          presManualGateDragState = {
            pointerId: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
          };
          gateBtn.classList.add("presentation-manual-rep-gate__btn--dragging");
          gateBtn.style.setProperty("--pres-manual-gate-scale", "1.06");
          if (typeof gateBtn.setPointerCapture === "function") {
            try {
              gateBtn.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
        },
        true
      );

      gateBtn.addEventListener(
        "pointermove",
        function (e) {
          if (!presManualGateDragState || e.pointerId !== presManualGateDragState.pointerId) return;
          const dx = e.clientX - presManualGateDragState.x0;
          const dy = e.clientY - presManualGateDragState.y0;
          const clamped = Math.max(-PRES_MANUAL_GATE_MAX_DX_PX, Math.min(PRES_MANUAL_GATE_MAX_DX_PX, dx));
          const clampedY = Math.max(-PRES_MANUAL_GATE_MAX_DY_PX, Math.min(PRES_MANUAL_GATE_MAX_DY_PX, dy));
          gateBtn.style.setProperty("--pres-manual-gate-dx", Math.round(clamped) + "px");
          gateBtn.style.setProperty("--pres-manual-gate-dy", Math.round(clampedY) + "px");
          if (Math.abs(dx) > 6) gateBtn.classList.add("presentation-manual-rep-gate__btn--dragging");
          else gateBtn.classList.remove("presentation-manual-rep-gate__btn--dragging");
        },
        true
      );

      gateBtn.addEventListener(
        "pointerup",
        function (e) {
          if (!presManualGateDragState || e.pointerId !== presManualGateDragState.pointerId) return;
          const dx = e.clientX - presManualGateDragState.x0;
          const dy = e.clientY - presManualGateDragState.y0;
          const horizontalEnough = dx >= PRES_MANUAL_GATE_SWIPE_MIN_PX;
          const directionLocked = Math.abs(dx) > Math.abs(dy) * PRES_MANUAL_GATE_LOCK_RATIO;
          presManualGateDragState = null;
          if (horizontalEnough && directionLocked) {
            presManualGateAckAndDismiss(dx, dy);
          } else {
            presManualGateResetDragVisual();
          }
        },
        true
      );

      gateBtn.addEventListener(
        "pointercancel",
        function () {
          presManualGateDragState = null;
          presManualGateResetDragVisual();
        },
        true
      );

      gateBtn.addEventListener(
        "lostpointercapture",
        function () {
          presManualGateDragState = null;
          if (!gateBtn.classList.contains("presentation-manual-rep-gate__btn--ack-pending")) {
            presManualGateResetDragVisual();
          }
        },
        true
      );
    }

    const presProgressBar = document.getElementById("presProgressBar");
    if (presProgressBar) {
      let progressDragging = false;
      let progressWasPlaying = false;
      let progressTargetPct = 0;
      let progressGlideRafId = 0;
      let progressGlideStartMs = 0;
      let progressGlideLastTs = 0;
      let progressLastClickTime = 0;
      let progressStartX = 0;
      let progressDirectDrag = false;
      const DOUBLE_CLICK_MS = 350;
      const DRAG_THRESHOLD_PX = 5;

      function getRepInfo() {
        const w = WP();
        if (!w) return null;
        const loc = w.locateGlobalTime(segments, presTimeSec);
        const seg = loc.segment;
        if (!seg || !Array.isArray(seg.reps)) return null;
        const rIdx = w.repIndexAtLocalSec(seg, loc.localSec);
        const segStart = w.cumulativeSegmentStart(segments, loc.segmentIndex);
        const g0 = w.cumulativeRepStartInSegment(seg, rIdx);
        const repStartGlobal = segStart + g0;
        const rep = seg.reps[rIdx];
        const repDur = w.repDurationForDefault(rep, seg.defaultIntervalSec);
        return { repStartGlobal, repDur, segmentIndex: loc.segmentIndex, repIndex: rIdx };
      }

      function getCurrentRepPct() {
        const info = getRepInfo();
        if (!info || info.repDur <= 0) return 0;
        const offset = presTimeSec - info.repStartGlobal;
        return Math.max(0, Math.min(1, offset / info.repDur));
      }

      let progressLockedRepInfo = null;

      function applyRepPct(pct, skipSticky) {
        const w = WP();
        const info = progressLockedRepInfo || getRepInfo();
        if (!w || !info) return;
        
        const clampedPct = Math.max(0, Math.min(1, pct));
        let targetGlobal = info.repStartGlobal + clampedPct * info.repDur;
        
        // Clamp to rep boundaries
        const repEnd = info.repStartGlobal + info.repDur - 0.001;
        targetGlobal = Math.max(info.repStartGlobal, Math.min(repEnd, targetGlobal));

        let stickyApplied = false;
        if (!skipSticky) {
          const WPE = typeof WorkoutPlaybackEngine !== "undefined" ? WorkoutPlaybackEngine : null;
          const milestones = playbackEngine && typeof playbackEngine.getTtsMilestones === "function"
            ? playbackEngine.getTtsMilestones() : null;
          if (WPE && milestones && milestones.length > 0) {
            const prevTime = presTimeSec;
            const result = WPE.applyTtsStickyMilestones(presTimeSec, targetGlobal, milestones);
            targetGlobal = result.time;
            stickyApplied = result.sticky;
            WPE.checkTtsMilestonesCrossed(prevTime, targetGlobal, milestones);
          }
        }

        presClearManualRepGate();
        presTimeSec = stickyApplied ? targetGlobal : w.snapTime(targetGlobal);
        presClampTimeToWorkout();
        presentationRender();
      }

      function progressGlideFrame(ts) {
        if (!progressDragging || progressDirectDrag) {
          progressGlideRafId = 0;
          return;
        }
        if (progressGlideLastTs === 0) progressGlideLastTs = ts;
        const dt = (ts - progressGlideLastTs) / 1000;
        progressGlideLastTs = ts;

        const currentPct = getCurrentRepPct();
        const diff = progressTargetPct - currentPct;

        if (Math.abs(diff) < 0.005) {
          applyRepPct(progressTargetPct);
          progressGlideRafId = requestAnimationFrame(progressGlideFrame);
          return;
        }

        const elapsedSec = (performance.now() - progressGlideStartMs) / 1000;
        const S = Sh();
        const speedMult = S && typeof S.scrubSpeedMultiplier === "function"
          ? S.scrubSpeedMultiplier(elapsedSec)
          : 4;

        const info = progressLockedRepInfo || getRepInfo();
        const repDur = info ? info.repDur : 1;
        const stepPct = (speedMult * dt) / Math.max(0.1, repDur);

        let newPct;
        if (Math.abs(diff) <= stepPct) {
          newPct = progressTargetPct;
        } else {
          newPct = currentPct + (diff > 0 ? stepPct : -stepPct);
        }
        applyRepPct(Math.max(0, Math.min(1, newPct)));
        progressGlideRafId = requestAnimationFrame(progressGlideFrame);
      }

      function stopProgressGlide() {
        if (progressGlideRafId) {
          cancelAnimationFrame(progressGlideRafId);
          progressGlideRafId = 0;
        }
        progressGlideLastTs = 0;
      }

      presProgressBar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        stopProgressGlide();

        const now = performance.now();
        const isDoubleClick = (now - progressLastClickTime) < DOUBLE_CLICK_MS;
        progressLastClickTime = now;

        progressDragging = true;
        progressDirectDrag = false;
        progressStartX = e.clientX;
        progressWasPlaying = presPlaying;
        presStopRaf();
        if (!progressWasPlaying) {
          presPlaying = false;
          presSyncPlayButton();
          setPlayerPlayingUi(false);
          if (playerAudio) playerAudio.cancelAll();
        }
        syncPlaybackEngineAfterSeek();
        try {
          presProgressBar.setPointerCapture(e.pointerId);
        } catch (_) {}

        const rect = presProgressBar.getBoundingClientRect();
        progressTargetPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        // Lock rep info at drag start to prevent jumping to next rep
        progressLockedRepInfo = getRepInfo();

        if (isDoubleClick) {
          progressDirectDrag = true;
          applyRepPct(progressTargetPct, true);
        } else {
          progressGlideStartMs = performance.now();
          progressGlideLastTs = 0;
          progressGlideRafId = requestAnimationFrame(progressGlideFrame);
        }
      });

      presProgressBar.addEventListener("pointermove", (e) => {
        if (!progressDragging) return;
        const rect = presProgressBar.getBoundingClientRect();
        const newPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (!progressDirectDrag && Math.abs(e.clientX - progressStartX) > DRAG_THRESHOLD_PX) {
          progressDirectDrag = true;
          stopProgressGlide();
        }

        if (progressDirectDrag) {
          applyRepPct(newPct, false);
        } else {
          progressTargetPct = newPct;
        }
      });

      function endProgressDrag(e) {
        if (!progressDragging) return;
        progressDragging = false;
        progressDirectDrag = false;
        progressLockedRepInfo = null;
        stopProgressGlide();
        const WPE = typeof WorkoutPlaybackEngine !== "undefined" ? WorkoutPlaybackEngine : null;
        if (WPE && WPE.resetTtsStickyState) WPE.resetTtsStickyState();
        if (progressWasPlaying) {
          syncPlaybackEngineAfterSeek();
          presWallLast = performance.now();
          presRafId = requestAnimationFrame(presTick);
        }
        try {
          presProgressBar.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }

      presProgressBar.addEventListener("pointerup", endProgressDrag);
      presProgressBar.addEventListener("pointercancel", endProgressDrag);
    }

    const presScreen = document.querySelector(".player-main .presentation-device-screen");
    if (presScreen) {
      presScreen.addEventListener(
        "pointerup",
        function (e) {
          if (!document.body.classList.contains("player-playing")) return;
          const t = e.target;
          if (t && t.closest && t.closest(".presentation-panel-footer")) return;
          if (t && t.closest && t.closest(".presentation-panel-header")) return;
          revealPlayerTransportBriefly();
        },
        { passive: true }
      );
    }
    window.addEventListener("keydown", function (e) {
      const menuDd = document.getElementById("playerMenuDropdown");
      if (menuDd && !menuDd.hidden) {
        if (e.key === "Escape") {
          e.preventDefault();
          const schV = document.getElementById("playerMenuThemeSchemesView");
          if (schV && !schV.hidden) {
            playerThemeMenuState.current = "main";
            const schemeOpts = document.getElementById("playerThemeSchemeOptions");
            if (schemeOpts) schemeOpts.replaceChildren();
            populatePlayerThemeTier2();
            showPlayerMenuView("theme");
            const bk = document.getElementById("playerMenuThemeBackBtn");
            if (bk) bk.focus();
            return;
          }
          const themeV = document.getElementById("playerMenuThemeView");
          if (themeV && !themeV.hidden) {
            playerThemeMenuState.current = "main";
            const schemeOpts = document.getElementById("playerThemeSchemeOptions");
            if (schemeOpts) schemeOpts.replaceChildren();
            showPlayerMenuView("main");
            const tb = document.getElementById("playerMenuThemeBtn");
            if (tb) tb.focus();
            return;
          }
          const ttsV = document.getElementById("playerMenuTtsView");
          if (ttsV && !ttsV.hidden) {
            showPlayerMenuView("main");
            const tbn = document.getElementById("playerMenuTtsBtn");
            if (tbn) tbn.focus();
            return;
          }
          const loadV = document.getElementById("playerMenuLoadView");
          if (loadV && !loadV.hidden) {
            showPlayerMenuView("main");
            const ob = document.getElementById("playerMenuOpenBtn");
            if (ob) ob.focus();
            return;
          }
          closePlayerMenu();
          return;
        }
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          return;
        }
      }
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      if (e.key === "Escape" && document.body.classList.contains("player-playing")) {
        e.preventDefault();
        revealPlayerTransportBriefly();
        return;
      }
      if (e.key === " " || e.code === "Space") {
        if (ae && (ae.tagName === "BUTTON" || ae.tagName === "A")) return;
        e.preventDefault();
        presTogglePlayPause();
      }
    });
    presentationRender();
  }

  function loadWorkoutFromObject(data) {
    const { workoutName: wn, segments: segs } = normalizeLoadedWorkout(data);
    if (playerAudio) playerAudio.cancelAll();
    presScrubInternalStop();
    presPlaying = false;
    presStopRaf();
    presSyncPlayButton();
    setPlayerPlayingUi(false);
    workoutName = wn;
    segments = segs;
    presClearManualRepGate();
    presTimeSec = 0;
    presClampTimeToWorkout();
    rebuildPlaybackEngine();
    presentationRender();
    setStatus("");
  }

  async function loadDemoSample() {
    const res = await fetch("samples/player-demo-workout.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load samples/player-demo-workout.json");
    const data = await res.json();
    loadWorkoutFromObject(data);
  }

  function wireFileInput() {
    const input = document.getElementById("playerFileInput");
    if (!input) return;
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || "{}"));
          loadWorkoutFromObject(data);
        } catch (e) {
          setStatus(e && e.message ? e.message : String(e));
        }
      };
      reader.onerror = () => setStatus("Could not read file.");
      reader.readAsText(f, "utf-8");
      input.value = "";
    });
  }

  async function boot() {
    applyPlayerThemeToDocument(readPlayerThemeState());
    applyPlayerAudioDuckingFromStorage();
    bindPresentationControls();
    wireFileInput();
    wirePlayerMenu();

    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    if (urlParam) {
      try {
        const res = await fetch(urlParam, { cache: "no-store" });
        if (!res.ok) throw new Error("Fetch failed: " + res.status);
        const data = await res.json();
        loadWorkoutFromObject(data);
        return;
      } catch (e) {
        setStatus((e && e.message) || String(e));
      }
    }

    try {
      await loadDemoSample();
    } catch (e) {
      setStatus((e && e.message) || String(e));
      segments = [];
      rebuildPlaybackEngine();
      presentationRender();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
