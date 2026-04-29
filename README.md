# squash-tracks

Rep timeline **editor** (`editor.html`), standalone **workout player** (`player.html`), and shared workout presentation logic.

## Cursor / contributors

**Follow [`docs/presentation-player-architecture.md`](docs/presentation-player-architecture.md)** for any work on:

- the standalone **presentation / workout player** (`player.html`, `css/player.css`, `js/playerApp.js`),
- **shared preview** behavior (`js/presentationShared.js`, `js/workoutPresentation.js`),
- or future **playback engine** pieces (TTS, SFX, timeline) that must stay aligned between player and editor preview.

That document defines shell vs engine split, guardrails, and phased audio goals so sessions do not re-decide architecture ad hoc.

For AI-authored ghosting workouts, also follow [`GHOSTING-RULES.md`](GHOSTING-RULES.md) for movement, timing, and JSON-generation constraints.

## Quick links

| Page | Role |
|------|------|
| [`editor.html`](editor.html) | Desktop editor + in-editor preview |
| [`player.html`](player.html) | Full-viewport player (load JSON / `?url=`) |
| [`js/workoutPlaybackEngine.js`](js/workoutPlaybackEngine.js) | Playback timeline + `audioCommands` for TTS/SFX |
| [`js/playerPlaybackAudio.js`](js/playerPlaybackAudio.js) | Web Audio SFX beeps + `speechSynthesis` TTS |
| [`index.html`](index.html) | Hub to mockups and apps |

## Run locally

Serve this directory (so `fetch('samples/...')` works), e.g.:

```bash
cd squash-tracks && python -m http.server 8080
```

Then open `http://localhost:8080/editor.html` or `http://localhost:8080/player.html`.

Player dev: **`?debugEngine=1`** — log timeline size and fired lane events. **`?muteAudio=1`** — keep the engine but skip all sound (layout / timing QA). The **editor** uses the same **`?debugEngine=1`** hook while preview plays (engine has **audio off**).
