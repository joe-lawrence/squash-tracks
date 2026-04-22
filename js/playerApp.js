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
    const darkBtn = document.createElement("button");
    darkBtn.type = "button";
    darkBtn.className = "player-theme-menu-btn";
    darkBtn.innerHTML = "<span>Dark themes</span>" + chevron;
    darkBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      playerThemeMenuState.current = "dark";
      populatePlayerThemeTier3();
    });
    container.appendChild(darkBtn);

    const lightBtn = document.createElement("button");
    lightBtn.type = "button";
    lightBtn.className = "player-theme-menu-btn";
    lightBtn.innerHTML = "<span>Light themes</span>" + chevron;
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

  const Sh = () => window.WorkoutPresentationShared;
  const WP = () => window.WorkoutPresentation;
  const urlParams =
    typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const debugEngine = urlParams.has("debugEngine");
  const muteAudio = urlParams.has("muteAudio");
  const playerAudio =
    typeof createPlayerPlaybackAudio === "function" ? createPlayerPlaybackAudio() : null;
  let playbackEngine = null;

  let playerTransportRevealTimer = 0;
  let lastPresentationCueSig = "";

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

  function maybePulsePresentationCue() {
    const head = document.getElementById("presCueHeading");
    const body = document.getElementById("presCueBody");
    const sig =
      (head && !head.hidden ? String(head.textContent || "") : "") +
      "\0" +
      (body ? String(body.textContent || "") : "");
    if (sig === lastPresentationCueSig) return;
    lastPresentationCueSig = sig;
    const wrap = document.querySelector(".presentation-cue-wrap");
    if (!wrap) return;
    wrap.classList.remove("presentation-cue-pulse");
    void wrap.offsetWidth;
    wrap.classList.add("presentation-cue-pulse");
    window.setTimeout(function () {
      wrap.classList.remove("presentation-cue-pulse");
    }, 700);
  }

  function rebuildPlaybackEngine() {
    playbackEngine = null;
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
    };
    Object.keys(map).forEach(function (k) {
      const el = document.getElementById(map[k]);
      if (el) el.hidden = k !== view;
    });
    const openBtn = document.getElementById("playerMenuOpenBtn");
    const themeBtn = document.getElementById("playerMenuThemeBtn");
    if (openBtn) openBtn.setAttribute("aria-expanded", view === "load" ? "true" : "false");
    if (themeBtn) {
      themeBtn.setAttribute(
        "aria-expanded",
        view === "theme" || view === "theme-schemes" ? "true" : "false"
      );
    }
  }

  function closePlayerMenu() {
    playerThemeMenuState.current = "main";
    const schemeOpts = document.getElementById("playerThemeSchemeOptions");
    if (schemeOpts) schemeOpts.replaceChildren();
    populatePlayerThemeTier2();
    showPlayerMenuView("main");
    const btn = document.getElementById("playerMenuBtn");
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
    const btn = document.getElementById("playerMenuBtn");
    const dd = document.getElementById("playerMenuDropdown");
    if (!btn || !dd) return;
    document.body.classList.add("player-menu-open");
    btn.setAttribute("aria-expanded", "true");
    dd.hidden = false;
    const openBtn = document.getElementById("playerMenuOpenBtn");
    if (openBtn) openBtn.focus();
  }

  function onPlayerMenuPointerDownOutside(ev) {
    const dd = document.getElementById("playerMenuDropdown");
    if (!dd || dd.hidden) return;
    const btn = document.getElementById("playerMenuBtn");
    const panel = document.getElementById("playerMenuPanel");
    const t = ev.target;
    if (btn && btn.contains(t)) return;
    if (!dd.contains(t)) {
      closePlayerMenu();
      return;
    }
    if (panel && !panel.contains(t)) {
      closePlayerMenu();
    }
  }

  function wirePlayerMenu() {
    const btn = document.getElementById("playerMenuBtn");
    const dd = document.getElementById("playerMenuDropdown");
    const openBtn = document.getElementById("playerMenuOpenBtn");
    const aboutLink = document.getElementById("playerAboutLink");
    const loadFile = document.getElementById("playerLoadFileItem");
    const loadUrl = document.getElementById("playerLoadUrlItem");
    const loadPaste = document.getElementById("playerLoadPasteItem");
    const themeBtn = document.getElementById("playerMenuThemeBtn");
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

  function presentationRender() {
    if (!Sh() || !WP()) return;
    presClampTimeToWorkout();
    Sh().renderPresentationIntoDocument(document, {
      segments,
      workoutName,
      defaultWorkoutName: DEFAULT_WORKOUT_NAME,
      timeSec: presTimeSec,
    });
    maybePulsePresentationCue();
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
    presStopRaf();
    presSyncPlayButton();
    setPlayerPlayingUi(false);
    if (playerAudio) playerAudio.cancelAll();
  }

  function presPause() {
    presPlaying = false;
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
    const prevT = presTimeSec;
    const dt = (now - presWallLast) / 1000;
    presWallLast = now;
    const maxT = w.totalWorkoutDuration(segments);
    presTimeSec = Math.min(presTimeSec + dt, maxT);
    if (playbackEngine) {
      const { fired, audioCommands } = playbackEngine.advancePlayback(prevT, presTimeSec);
      if (debugEngine && fired.length) console.debug("[WorkoutPlaybackEngine] fired:", fired);
      if (!muteAudio && playerAudio && audioCommands.length) {
        playerAudio.executeCommands(audioCommands);
      }
    }
    presentationRender();
    if (presTimeSec >= maxT - 1e-6) {
      presPlaying = false;
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

  function presStopScrubAndSync() {
    presScrubInternalStop();
    const w = WP();
    if (!w) return;
    presTimeSec = w.snapTime(presTimeSec);
    presClampTimeToWorkout();
    presentationRender();
    syncPlaybackEngineAfterSeek();
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
    presTimeSec = Math.max(0, Math.min(presTimeSec + delta, maxT));
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
    pausePreviewForSeek();
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
    presScrubInternalStop();
    pausePreviewForSeek();
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
    presentationRender();
    syncPlaybackEngineAfterSeek();
  }

  function presWorkoutEnd() {
    const w = WP();
    if (!w) return;
    presScrubInternalStop();
    pausePreviewForSeek();
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
    presentationRender();
    syncPlaybackEngineAfterSeek();
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
    lastPresentationCueSig = "";
    workoutName = wn;
    segments = segs;
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
