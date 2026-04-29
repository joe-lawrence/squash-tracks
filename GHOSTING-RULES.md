# Ghosting Workout Generation Rules

Use this document when an AI creates a squash ghosting workout for this project.

## Canonical Data Source

- Machine-readable source of truth: `data/ghosting-model.json`.
- This markdown file is the human-readable explanation of that same model.
- If shot constraints, semantics, canonical shot names, or transition weights change, update both files in the same edit.
- On any conflict, treat `data/ghosting-model.json` as authoritative for generation/validation logic, then reconcile this doc to match.

## Goal

Produce a complete, importable workout JSON for `squash-tracks` that:

- uses the project's v2 workout structure;
- gives clear movement prompts for solo ghosting;
- includes both on-screen text and spoken coaching cues;
- balances work and rest with progressive intensity.

## Always Use This Data Shape

- Top-level object includes:
  - `version: 2`
  - `workoutName` (short and descriptive)
  - `segments` (array)
- Each segment includes:
  - `name`
  - `elementId` (unique string)
  - `defaultIntervalSec`
  - `reps` (array)
- Each rep includes:
  - `name`
  - `elementId` (unique string)
  - `order` (typically `["text", "tts", "sfx"]`)
  - `events` (array)
  - optional `intervalSec` when rep duration differs from segment default

Do not output legacy v1 shape (`name` + `reps` at root with no `segments`).

## Event Rules

- `text` lane event:
  - include `heading` and optional `body`;
  - start at `0` for continuous rep-level instructions;
  - set duration to rep length.
  - **Ghosting exception:** in ghosting rally beats (see **Ghosting rep structure**), short `text` cues use explicit `start` / `duration` for that beat (spot line, shot-type body, etc.). Do **not** rely on a single full-rep `text` with `start: 0` spanning the entire rep unless the drill is intentionally one long caption.
- `tts` lane event:
  - include `speech` text that is concise and coach-like;
  - use `voiceSlot: "a"` or `"b"` (alternate by segment when helpful);
  - optional **`ttsRate`** / **`ttsPitch`** per cue (Web Speech API; omit for engine defaults);
  - for long reps, use short cues at useful checkpoints (for example start, mid, final push).
- `sfx` lane event:
  - use `sfxKind: "shot"` or `sfxKind: "split"` only;
  - keep beeps sparse and meaningful (not constant noise).

## Ghosting rep structure (lanes + timing)

Ghosting workouts use **v2** `segments[].reps[]`. Each **rally beat** is one incoming ghost ball → user moves → user replies → split-step SFX → shot SFX. You may put **one beat per rep** or **stack several beats in one rep** by giving each beat its own `start` / `duration` on the rep timeline. Between beats, use **`τ(depth)`** (**Time to reach spot by target depth**) for the gap **after** **`shot`** **ends** until the **next** Voice A (repositioning for the **next** spot), not for stretching cues inside the beat.

### Roles (who each cue is for)

**Voice slots (ghosting convention)**

- **`voiceSlot: "a"` (Voice A)** — one utterance for the **ghost (Player B)**: shot **and** target location together, e.g. `Drive to 5L`, `Weak lob to 4L`. Link to destination `text` with **sync start** (see below).
- **`voiceSlot: "b"` (Voice B)** — the **user’s chosen reply shot** only, e.g. `Drive`, `Volley drive` (canonical name; keep it short). Link to the **second** `text` cue with **sync start** when the on-screen label updates to show the reply.
- **TTS prosody (optional on each `lane: "tts"` event):** **`ttsRate`** and **`ttsPitch`** — `SpeechSynthesisUtterance` values (defaults **1** / **1** if omitted). Typical clamps: rate **`0.25`–`2.5`**, pitch **`0`–`2`**.

| Piece | Lane | Role |
|-------|------|------|
| Ghost shot + location | `tts` (`voiceSlot` **`"a"`**) | **`speech`**: **`<ghost shot> to <spot>`** (e.g. `Drive to 5L`). Use `linkedTextElementId` → destination `text`; set `linkedSyncStart: true` on both sides of the pair. |
| Destination (on stage until Voice B) | `text` | **While the user is moving:** show **destination only** (spot token in `heading`, e.g. `5L`; `body` often `...` until Voice B). **`start`** matches Voice A; **`duration`** runs **until Voice B starts** (not only Voice A’s `duration`). `linkedTtsElementId` → Voice A `tts`; `linkedSyncStart: true`. |
| Split-step then contact | `sfx` | **`split`** then **`shot`**: split-step beep first, shot beep immediately after. On split events set `sfxSplitSpeed` to `slow`, `medium`, or `fast` per **Split-step speed** below. |
| User reply — shot (spoken) | `tts` (`voiceSlot` **`"b"`**) | Starts **`0.2` s** after **`shot`** SFX ends. **`speech`** = user shot only. `linkedTextElementId` → user-shot `text`; `linkedSyncStart: true` on both. |
| User reply — on-screen label | `text` | **When Voice B fires:** same **`start`** as Voice B; **`duration`** matches Voice B. **`body`** = user shot type (canonical name, e.g. `Volley drive`); `heading` may repeat the spot for context. `linkedTtsElementId` → Voice B `tts`; `linkedSyncStart: true`. |

### Incoming ghost shot vs spot depth (ball sense)

The **Shot constraints** table (Good / Bad / From) describes **where a striker’s own shot tends to land** for each *outgoing* shot type. It does **not** by itself define valid **receiver spots** after B’s incoming ball. When you pick the user’s **spot** (`depth` + side), keep it **plausible for where the ball is** after B’s shot, or the drill will feel wrong even if the JSON is valid.

Heuristic defaults (tighten or replace with your own matrix later):

| Incoming ghost shot (family) | Prefer spot depths | Avoid as the default next station |
|------------------------------|--------------------|-----------------------------------|
| Lob, Cross Lob | `4`, `5` | `1` (unless the drill is explicitly a rare front chase on a dying balloon) |
| Boast, Volley Boast | `1`, `2`, `3` | `5` right after a standard boast |
| Kill, Cross Kill, Volley Kill, Volley Cross Kill | `2`, `3` | `4`, `5` unless you mean deep recovery after a loose attack |
| Volley Cross Drive, Volley Drive, Drive, Cross Drive | `3`, `4`, `5` (also `2` when the ball dies mid) | `1` as a lazy default for pressured volley-drive patterns |
| Drop, Cross Drop | `1`, `2`, `3` | anchoring at `5` unless the ball truly runs deep |

These are **authoring** guides for ghosting spots, not extra columns on the Good/Bad landing table.

### Phase order inside one beat (illustrative timings)

Offsets are **seconds from the start of that beat** on the rep timeline (adjust per drill). **`τ(depth)`** from **Time to reach spot by target depth** is **only** for **repositioning after contact** (see stacking below). **Inside** one beat, ghost → split → shot use **fixed** offsets; **Voice B** timing uses one of two patterns below.

**Default (post-shot Voice B, e.g. beat 3 onward in `first-two.json`):** destination text spans through **`shot`** + **`0.2` s**; Voice B names the reply **after** contact.

| Phase | `start` (from beat base) | `duration` | Notes |
|-------|--------------------------|------------|--------|
| Ghost + location TTS (Voice A) | `0.2` | `1.1` | Example `speech`: `Drive to 5L`. Optional per-cue **`ttsRate`** / **`ttsPitch`** (see architecture doc). |
| Destination `text` (linked to A) | `0.2` | **`3.8`** | Through split + shot + **`0.2`** s gap until Voice B. |
| Split SFX | `3.1` | `0.5` | `sfxSplitSpeed` from table below. |
| Shot SFX | `3.6` | `0.2` | **`shot` end** = **`3.8`**. |
| User shot TTS (Voice B) | `4.0` | `1.1` | **`0.2` s** after `shot` ends. |
| User shot `text` (linked to B) | `4.0` | `1.1` | **`body`** = user shot. |

**Opening / tight cadence (beats 1–2 in `first-two.json`, and **all** beats in `samples/ghosting-10-shot.json`):** same split / **`shot`** times (**`3.1`** / **`3.6`**), but destination text **`duration` `1.8`**, and Voice B + user **`text`** start at **`2.0`** ( **`1.8` s** after Voice A start) so the player hears the reply **before** split/shot. With this layout, **`shot`** still ends at **`B[k] + 3.8`**, but Voice B ends at **`B[k] + 3.1`**, so the next beat’s Voice A can follow about **`1.3` s** after contact (same tight gap as **`first-two`** beat 1 → 2).

For multiple beats in one rep, let **`B[k]`** be the beat base so Voice A starts at **`B[k] + 0.2`**. **`shot`** ends at **`B[k] + 3.8`**.

- **Tight uniform cadence (`samples/ghosting-10-shot.json`):** use the **opening** row for **every** beat, and set **`B[k+1] = B[k] + 4.9`** for **`k = 0 … n−2`**, i.e. **`4.9` s** between consecutive **`shot`** SFX starts (**`3.8 + 1.3 − 0.2`** from **`B[k]`** to **`B[k+1]`**). This keeps shot-to-shot spacing ~**`4.5–5.0` s** without stacking errors. **`intervalSec`** / **`defaultIntervalSec`** must cover the last cue end plus a small tail.

- **Mixed layout (`first-two.json` after beat 2):** keep beats **1–2** as the **opening** row; from **beat 3** onward use the **Default** row. Stack **`B[k+1]`** from **`shot`** end on beat **`k`** to Voice A on beat **`k+1`**: gap = **`τ(d)`** (depth of the **upcoming** spot on beat **`k+1`**). With **beat base** **`B[k]`** (Voice A at **`B[k]+0.2`**): **`B[k+1] = B[k] + τ(d_{k+1})`** for **`k ≥ 1`**, and **`B[1] = B[0] + 3.8 + 1.3 − 0.2`** as above. (Do **not** add **`3.6`** again here — that would double-count the in-beat offset from **`B[k]`** to **`shot`** and blow up the gap after beat 2.)

**Beat tail (default row):** through Voice B ends at **`B[k] + 5.1`**. **Beat tail (opening row):** last audio in the beat is **`shot`** end at **`B[k] + 3.8`** (Voice B already finished at **`B[k] + 3.1`**).

### Time to reach spot by target depth

Approximate **seconds for the user to reposition** after **`shot`** contact on the **prior** ball, before the **next** ghost + location cue (Voice A). Keyed by **target depth** of the **upcoming** spot. Values are **proportional to how much court the player must cover** for that depth in this spacing model.

| Target depth | Time to spot (seconds) |
|--------------|------------------------|
| `1` | `4.4` |
| `2` | `4.3` |
| `3` | `4.2` |
| `4` | `4.3` |
| `5` | `4.4` |

Use **`τ`** only for the **gap from `shot` end → next Voice A** (next beat’s **`0.2`** lead-in), **not** for stretching split/`shot` inside the beat. Do **not** assume the same table value applies to **ghost feed → user contact** unless you introduce a separate authored constant for that leg.

**Voice B gap (unchanged):** keep **`0.2` s** after **`shot`** SFX **ends** before Voice B starts.

### Split-step speed (`sfxSplitSpeed`) by ghost shot

Set on the **`split`** SFX event for the opponent (ghost) shot that triggered the cycle. Values are `slow`, `medium`, or `fast`.

| Ghost shot | `sfxSplitSpeed` |
|------------|-----------------|
| Drive | `medium` |
| Volley Drive | `fast` |
| Cross Drive | `medium` |
| Volley Cross Drive | `fast` |
| Lob | `slow` |
| Volley Lob | `slow` |
| Cross Lob | `slow` |
| Volley Cross Lob | `slow` |
| Kill | `fast` |
| Volley Kill | `fast` |
| Cross Kill | `fast` |
| Volley Cross Kill | `fast` |
| Boast | `medium` |
| Volley Boast | `fast` |
| Drop | `medium` |
| Cross Drop | `medium` |

If a `Volley ...` variant is not listed, inherit the speed from the same shot **without** the `Volley` prefix (for example unlisted `Volley Drop` → use `Drop`).

## Ghosting Design Rules

- Build sessions as blocks (for example: warm-up, movement quality, high-intensity sets, cool-down).
- Include explicit rest segments (name like `.Rest`) between hard blocks.
- Favor realistic ghosting movements:
  - front-left, front-right, back-left, back-right;
  - straight drives, volleys, recover to T, repeat;
  - occasional pattern progressions (for example 2-corner to 4-corner).
- Intensity should progress gradually:
  - warm-up: lower intensity and technical focus;
  - main sets: higher pace, more directional change;
  - late sets: shortest cues, highest effort;
  - cool-down: lower pace and reset breathing.
- Keep instruction language actionable: start with verbs (`Push`, `Recover`, `Explode`, `Reset`).

## Shot Target Model (Side + Depth)

Use this model when generating shot-pattern instructions in text/TTS:

- Court side is `L` or `R`.
- Court depth is integer `1..5` where:
  - `1` = front of court
  - `5` = back of court
- A landing code without `X` (for example `5`) means same-side landing.
- A landing code like `5X` means same depth but side swap (`L -> R` or `R -> L`).
- `Cross` is a modifier on the base shot type.
- `Volley` is an optional modifier for any shot and does not change side/depth legality.
- `Volley` variants inherit the same Good/Bad/Invalid targets as their base shot (including cross side-switch rules).

### Shot Constraints

| Shot | Good landing spot | Bad landing spot | Allowed from depths |
|------|-------------------|------------------|---------------------|
| Drive | `5` | `4` | `1`, `2`, `3`, `4`, `5` |
| Cross Drive | `5X` | `4X` | `1`, `2`, `3`, `4`, `5` |
| Boast | `1X` | `2X` | `2`, `3`, `4`, `5` |
| Lob | `5` | `4` | `1`, `2`, `3`, `4`, `5` |
| Cross Lob | `5X` | `4X` | `1`, `2`, `3`, `4`, `5` |
| Kill | `2` | `3` | `3`, `4` |
| Cross Kill | `2X` | `3X` | `3`, `4` |
| Drop | `1` | `2` | `1`, `2`, `3`, `4`, `5` |
| Cross Drop | `1X` | `2X` | `1`, `2`, `3`, `4` |

### Good / Bad / Invalid Semantics

- `Good` spots are the intended technical target.
- `Bad` spots represent a weak-shot outcome for that shot pattern.
- Any landing spot not explicitly listed as `Good` or `Bad` for that shot is `Invalid`.
- `Allowed from depths` means the striker's current depth at shot contact before the shot is played.

### Generation Rules From This Model

- When a rep script names a shot, ensure target side/depth is legal for that shot and source depth.
- Favor "good" spots for technical or quality-focused reps.
- Use "bad" spots only when explicitly modeling weak execution, pressure, or recovery consequences.
- For cross shots, include side-switch language in cues (for example "cross to opposite front-right, depth 1").
- Keep notation consistent in cues and summaries (for example `Drive to R5`, `Cross Drop to L1`).

## Shot Transition Weights (Player-To-Ghost)

Use this model to choose likely reply shots in patterned ghosting sequences.

### Core Rules

- `Player A: Volley X` uses exactly the same response weights as `Player A: X`.
- When roles flip, reuse this same table (the model is symmetric for Player A vs Player B turns).
- Omitted responses are implicit weight `0`.
- Higher weight means more likely (`10` strongest, `1` weakest).

### Canonical Shot Names

Use these spellings in prompts or machine-readable exports:

- `Drive`, `Cross Drive`
- `Boast`
- `Drop`, `Cross Drop`
- `Lob`, `Cross Lob`
- `Kill`, `Cross Kill`
- optional `Volley ` prefix on any shot

### Transition Matrix

#### Player A: Drive

| Player B | Weight |
|----------|--------|
| Drive | 10 |
| Volley Drive | 7 |
| Cross Drive | 7 |
| Volley Cross Drive | 6 |
| Boast | 3 |
| Volley Boast | 2 |
| Cross Lob | 6 |
| Volley Cross Lob | 5 |
| Kill | 5 |
| Volley Kill | 6 |
| Cross Kill | 2 |
| Volley Cross Kill | 1 |
| Drop | 3 |
| Volley Drop | 2 |

#### Player A: Boast

| Player B | Weight |
|----------|--------|
| Drive | 10 |
| Cross Drive | 8 |
| Drop | 7 |
| Cross Drop | 6 |
| Lob | 8 |
| Cross Lob | 10 |
| Boast | 1 |

#### Player A: Cross Drive

| Player B | Weight |
|----------|--------|
| Drive | 8 |
| Volley Drive | 8 |
| Cross Drive | 8 |
| Volley Cross Drive | 7 |
| Boast | 2 |
| Volley Boast | 2 |
| Drop | 5 |
| Volley Drop | 7 |
| Cross Drop | 1 |
| Volley Cross Drop | 5 |
| Lob | 3 |
| Volley Lob | 4 |
| Cross Lob | 5 |
| Volley Cross Lob | 5 |
| Kill | 6 |
| Volley Kill | 7 |
| Cross Kill | 3 |
| Volley Cross Kill | 4 |

#### Player A: Drop

| Player B | Weight |
|----------|--------|
| Drive | 10 |
| Cross Drive | 8 |
| Boast | 2 |
| Drop | 7 |
| Cross Drop | 6 |
| Lob | 8 |
| Cross Lob | 9 |

#### Player A: Cross Drop

| Player B | Weight |
|----------|--------|
| Drive | 7 |
| Cross Drive | 6 |
| Drop | 7 |
| Cross Drop | 3 |
| Lob | 6 |
| Cross Lob | 7 |

#### Player A: Lob

| Player B | Weight |
|----------|--------|
| Drive | 3 |
| Volley Drive | 8 |
| Cross Drive | 3 |
| Volley Cross Drive | 7 |
| Boast | 3 |
| Volley Boast | 1 |
| Lob | 3 |
| Volley Lob | 7 |
| Cross Lob | 3 |
| Volley Cross Lob | 7 |
| Kill | 2 |
| Volley Kill | 7 |
| Cross Kill | 1 |
| Volley Cross Kill | 6 |

#### Player A: Cross Lob

| Player B | Weight |
|----------|--------|
| Drive | 3 |
| Volley Drive | 10 |
| Cross Drive | 2 |
| Volley Cross Drive | 9 |
| Boast | 3 |
| Lob | 2 |
| Volley Lob | 7 |
| Cross Lob | 2 |
| Volley Cross Lob | 7 |
| Kill | 3 |
| Volley Kill | 5 |
| Cross Kill | 1 |
| Volley Cross Kill | 2 |

#### Player A: Kill

| Player B | Weight |
|----------|--------|
| Drive | 7 |
| Cross Drive | 5 |
| Drop | 8 |
| Cross Drop | 8 |
| Lob | 3 |
| Cross Lob | 7 |

#### Player A: Cross Kill

| Player B | Weight |
|----------|--------|
| Drive | 7 |
| Cross Drive | 3 |
| Drop | 7 |
| Cross Drop | 2 |
| Lob | 2 |
| Cross Lob | 7 |

## Timing Guidelines

- Warm-up reps: typically 45-120 sec.
- Main ghosting reps: typically 60-180 sec.
- Rest reps: typically 30-120 sec.
- Total workout target: 12-30 minutes unless user asks otherwise.

If the user gives duration, skill level, or focus constraints, prefer those over defaults.

## Quality Bar

- Avoid contradictory cues (for example "max pace" and "easy recovery" in same rep).
- Do not overlap lane events in a way that creates unreadable text or excessive TTS chatter.
- Keep naming clear and consistent (`Drill 1`, `Drill 2`, `.Rest`, etc.).
- Ensure every `elementId` is unique in the generated file.
- Return valid JSON only when the user asks for an import file.

## Output Contract For AI

When asked to generate a ghosting workout:

1. Provide a short plan (blocks, durations, intent).
2. Provide the full workout JSON in v2 format.
3. Briefly note how intensity progresses and where rests occur.

If the user asks for modifications, update the same JSON structure instead of inventing a new schema.
