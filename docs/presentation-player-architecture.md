# Presentation player architecture (squash-tracks)

**Audience:** Cursor sessions and humans extending the standalone workout **player** (`player.html`) and keeping it aligned with the **editor preview** — without building a second editor, main menu, or full Ghoster-style app shell.

## Goals

- **Player:** mobile-first, full-viewport execution surface; eventually **TTS**, **SFX**, and polished motion — **not** multitrack editing, library UI, or full “preview app” chrome.
- **Editor:** desktop-first; preview stays in sync with the player via **shared modules**, not copy-paste.
- **Inspiration:** Squash Ghoster’s presentation mode (immersive full screen, timeline-driven audio, strong hero type). **Do not** import Ghoster wholesale; adopt **patterns** and a **thin playback engine** on our JSON model.

## Current stack (do not blur these roles)

| Layer | File(s) | Responsibility |
|--------|---------|------------------|
| Read-only time / text cue math | `js/workoutPresentation.js` | `presentationFrame`, `locateGlobalTime`, snap grid, etc. |
| Shared DOM for preview UI | `js/presentationShared.js` | `renderPresentationIntoDocument`, scrub ramp, play/pause SVG strings, time formatting |
| Standalone shell + transport | `player.html`, `css/player.css`, `js/playerApp.js` | Full-viewport layout, file open / `?url=`, play/pause/scrub/skip, calls shared render |
| Playback timeline + audio commands | `js/workoutPlaybackEngine.js` | Builds sorted **text / tts / sfx** lane events; `advancePlayback` returns **`audioCommands`** for TTS/SFX (text visual-only); `syncAfterSeek` |
| Player audio output | `js/playerPlaybackAudio.js` | Web Audio **beeps** for SFX lane, **`speechSynthesis`** for TTS; cancel on seek/pause/load; **`resumeIfNeeded`** on Play |
| Editor integration | `editor.html` | Same `presentationShared` + timeline hooks; loads **`workoutPlaybackEngine.js`** with **`audioEnabled: false`** so timeline / `playedKeys` stay aligned with the player (no sound). Dev: **`?debugEngine=1`** logs fired lane events during preview play |

**Rule:** New **playback** behavior (audio, timeline firing, countdown) belongs in a **dedicated engine module**, not in `playerApp.js` as a growing monolith.

## Target architecture: shell vs engine

### Shell (keep thin)

- **Owns:** layout, safe-area, optional auto-hide chrome, file load, URL param, `requestAnimationFrame` or clock tick **orchestration**.
- **Calls:** engine + `WorkoutPresentationShared.renderPresentationIntoDocument`.

### Engine (`js/workoutPlaybackEngine.js`)

**Single place** for:

- Normalized workout reference + **sorted timeline** of audiovisual events derived from `segments` (snapped to shared `TIME_SNAP_SEC` semantics).
- For each wall-clock step: given `globalTimeSec`, `dt`, and “was seek”:
  - advance **which events fire**;
  - return **visual** inputs (may stay “text only” for a long time, or extend `presentationFrame` later);
  - expose **audio commands** (start SFX, speak TTS, cancel on seek).

**Editor preview (later):** same engine with flags, e.g. `audioEnabled: false` or `mode: 'preview'`, so timing matches the player without surprising audio in meetings.

### Contracts (keep stable)

- **Input:** `{ segments, workoutName }` after the same load/validation path the editor trusts (eventually a shared `workoutNormalize` / `parseWorkoutJson` if import logic grows).
- **Clock:** one authoritative **`globalTimeSec`**; scrub/play/pause only move that clock and call `engine.sync(time)` / `engine.onSeekEnd()`.

## UI polish direction (“Ghoster-like” without Ghoster’s codebase)

- **Full-viewport stage:** already the direction for `player.html` — avoid competing “phone bezel” chrome that shrinks the stage unless we explicitly want a device mock again.
- **Typography:** combine **container queries** (`cqmin`, good for density inside the stage) with **viewport-relative** clamps (`vw` / `vmin`) for the **primary cue line** so fullscreen phones and large desktop windows both feel intentional; use **`@media` for short height / landscape** to tighten padding and caps (see Ghoster’s `clamp(..., vw, ...)` + orientation rules as a reference pattern, not a copy).
- **Motion:** prefer **class toggles** on a stable DOM node for pulse/glow; avoid replacing large HTML strings every frame if animations are added.
- **Chrome:** optional **auto-hide** transport after play starts; tap-to-reveal — improves immersion without hiding critical controls forever.

## Audio roadmap (phased, low regret)

1. **Skeleton (done for player):** `workoutPlaybackEngine.js` sorted **timeline** from `segments`, `syncAfterSeek`, `advancePlayback`. Dev: **`?debugEngine=1`** logs timeline size and fired lane events.
2. **SFX (initial done for player):** synthetic **Web Audio** beeps in `playerPlaybackAudio.js` (`shot` vs `split`); **played** markers in engine; **cancel** on seek/pause/load/end.
3. **TTS (initial done for player):** **`speechSynthesis`** for TTS lane; **cancel** before new utterance and on seek.
4. **TTS overlap / optional assets / editor (done for now):** TTS **queue** in `playerPlaybackAudio.js` (sequential utterances, cancel-safe); optional per-event **`sfxUrl`** for SFX (HTMLAudio, beep on failure); **`editor.html`** loads the engine with **`audioEnabled: false`** and calls `advancePlayback` on preview ticks (**`?debugEngine=1`** logs fires).
5. **Next:** ship default **sampled SFX** (bundled URLs) in exports or samples; richer overlap / mix rules only if needed.
6. **Prep / beeps (optional):** dedicated timeline event types or metronome layer.
7. **Quality path (optional later):** pre-rendered TTS / sampled SFX — same `audioCommands` shape where possible.

**Mobile:** resume **AudioContext** (and speech where required) on first **user-initiated Play**, same pattern as serious web audio apps.

## Guardrails (what we are *not* building here)

- No second **main menu**, **library**, or **multitrack editor** inside the player route.
- No re-implementing **Ghoster’s** `WorkoutLib` / full webapp — only **ideas** and a **small timeline** over our JSON.
- Avoid duplicating **presentation DOM** logic outside `presentationShared.js` unless we split it deliberately (e.g. `presentationShell.html` partials later).

## File / dependency discipline

- **Shared:** `workoutPresentation.js`, `presentationShared.js`, `workoutPlaybackEngine.js` (player + editor preview), `playerPlaybackAudio.js` (player-only until preview wants sound), future `workoutIO.js` (parse/normalize only if duplicated).
- **Player-only:** `player.html`, `player.css`, `playerApp.js` stay orchestration + UX, not business logic sprawl.
- **Editor-only:** timeline, save, undo — never required for standalone play.

## Checklist before adding a feature

- [ ] Does this belong in the **engine** (time + events + audio) or the **shell** (layout + gestures)?
- [ ] Can the **editor preview** reuse it with a flag?
- [ ] Does DOM update stay in **`presentationShared`** (or a deliberate sibling)?
- [ ] After seek/scrub, is **audio state** (played keys, cancelled speech) correct?

## Related paths

- Demo workout: `samples/player-demo-workout.json`
- Hub link: `index.html` → Workout player

---

*Last updated: playback engine emits `audioCommands`; `playerPlaybackAudio.js` plays TTS/SFX in the player. **`?muteAudio=1`** silences output while keeping the timeline. Update when editor preview shares the engine or audio shapes change.*
