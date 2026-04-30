# Ghosting Workout Generation Rules

Use this document when an AI (or developer) creates or validates squash ghosting content for this project. **This is the only ghosting rules file** in the repo; do not maintain a separate draft.

## Canonical Data Source

- Machine-readable source of truth: `data/ghosting-model.json`.
- This markdown file is the human-readable explanation of that same model.
- If shot constraints, semantics, canonical shot names, or transition weights change, update both files in the same edit.
- On any conflict, treat `data/ghosting-model.json` as authoritative for generation/validation logic, then reconcile this doc to match.

## Mandatory generation contract

Read **`rules.generationContract`** in **`data/ghosting-model.json`**. In short:

- **`shotConstraints`** — legal shots and good landing corners.
- **`targetNotation.ballSideContinuity`** — consecutive beats: ghost landing = user `heading`; ghost striker = prior user landing; width flips only on **`Cross…`** and **`Boast`**.
- **`transitions`** — **must** drive **player reply** choice in any **patterned** sequence (multi-beat rep, rally table, ordered list): look up the prior user shot by its **canonical name** (a row key in the matrix), then weight replies by matrix values among legally allowed options. **Do not** ignore the matrix with uniform random picks unless the user explicitly requests unconstrained randomness.

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

**Multiple reps in one segment:** each event’s **`start`** is **segment-local on the full part timeline** (editor / playback use `segment start + event.start`). For rep index **`r`** (0-based), add **`cumulativeRepStart = sum(intervalSec of reps 0..r−1)`** to every **`start`** in that rep so cues do not stack at `0` on top of earlier reps. **`intervalSec`** on each rep is that rep’s duration on that same timeline (typically from `0` through last cue end plus any tail before the next rep).

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

- **`voiceSlot: "a"` (Voice A)** — the **ghost (Player B) shot** the user must read. Often **`speech`** is **shot + spot** (e.g. `Drive to 5L`). For tighter pacing, Voice A may be **shot name only** (e.g. `Drive`, `Cross Lob`) while destination **`text`** carries the spot in **`heading`** (`5L`, `1R`, …).
- **`voiceSlot: "b"` (Voice B)** — the **user’s reply**: usually the shot name only (`Drive`, `Cross Drive`). For tighter pacing, **`speech`** may be **spot + shot** (e.g. `1L Cross Drive`) so TTS names station and stroke together; on-screen **`body`** still uses the canonical shot name.
- **TTS prosody (optional on each `lane: "tts"` event):** **`ttsRate`** and **`ttsPitch`** — `SpeechSynthesisUtterance` values (defaults **1** / **1** if omitted). Typical clamps: rate **`0.25`–`2.5`**, pitch **`0`–`2`**.

| Piece | Lane | Role |
|-------|------|------|
| Ghost shot (+ optional spot in speech) | `tts` (`voiceSlot` **`"a"`**) | **`speech`**: either **`<ghost shot> to <spot>`** or **`<ghost shot>`** only when the spot lives in destination `text` **`heading`**. Optional **`ttsRate`** / **`ttsPitch`** on the utterance (e.g. slightly faster ghost cue). Editors may link ghost `tts` ↔ destination `text` with `linkedTextElementId` / `linkedTtsElementId` and `linkedSyncStart: true`; workouts may omit links if playback does not require them. |
| Destination (on stage until Voice B) | `text` | **While the user is moving:** show **destination** (spot in `heading`; `body` often `...` until Voice B). **`start`** matches Voice A; **`duration`** through **`Voice B start`** when Voice B is early (e.g. **`duration` `1.2`** from Voice A **`start`** when Voice B is at **`B[k] + 1.4`**). |
| Split-step then contact | `sfx` | **`split`** then **`shot`**: split-step beep first, shot beep immediately after. On split events set `sfxSplitSpeed` to `slow`, `medium`, or `fast` per **Split-step speed** below. |
| User reply — shot (spoken) | `tts` (`voiceSlot` **`"b"`**) | Often **`B[k] + 4.0`** (post-contact) or **`B[k] + 2.0`** / **`B[k] + 1.4`** (earlier while moving). **`speech`**: shot only, or **`\<spot\> \<shot\>`** (e.g. `1L Cross Drive`). |
| User reply — on-screen label | `text` | Same **`start`** / **`duration`** as Voice B. **`body`** = canonical shot name; **`heading`** repeats the spot. |

### Incoming ghost shot vs spot depth (ball sense)

The **Shot constraints** table (Good / Bad / From) describes **where a striker’s own shot tends to land** for each *outgoing* shot type. It does **not** by itself define valid **receiver spots** after B’s incoming ball. When you pick the user’s **spot** (`depth` + side), keep it **plausible for where the ball is** after B’s shot, or the drill will feel wrong even if the JSON is valid.

Heuristic defaults (tighten or replace with your own matrix later):

| Incoming ghost shot (family) | Prefer spot depths | Avoid as the default next station |
|------------------------------|--------------------|-----------------------------------|
| Lob, Cross Lob | `4`, `5` | `1` (unless the drill is explicitly a rare front chase on a dying balloon) |
| **Weak lob** (ghost or user) | **`4`** (good: softer arc than full **Lob**), also `3` when you mean mid-court float | full **`5`** as the default “good” (treat **`5`** as **bad** / full balloon for **Weak lob** per shot table) |
| Boast | `1`, `2`, `3` | `5` right after a standard boast |
| Kill, Cross Kill | `2`, `3` | `4`, `5` unless you mean deep recovery after a loose attack |
| Drive, Cross Drive | `3`, `4`, `5` (also `2` when the ball dies mid) | `1` as a lazy default for pressured drive patterns |
| Drop, Cross Drop | `1`, `2`, `3` | anchoring at `5` unless the ball truly runs deep |

These are **authoring** guides for ghosting spots, not extra columns on the Good/Bad landing table.

### Beat timing model (per beat)

Offsets are **seconds from beat base `B[k]`** on the rep timeline (adjust per drill). **`τ(depth)`** (below) applies **only** to the gap **after** **`shot`** ends until the **next** Voice A — not inside the beat.

**Fixed SFX anchors (do not drift these without intent):**

| Event | Start | Duration |
|-------|-------|----------|
| `split` SFX | `B[k] + 3.1` | `0.5` |
| `shot` SFX | `B[k] + 3.6` | `0.2` (ends at `B[k] + 3.8`) |

**Flexible TTS:** place Voice A and Voice B where needed; link `tts` ↔ `text` when the editor or import path should keep captions aligned.

**Common Voice B placements:**

| Mode | Voice B start | Destination `text` (spot) | When to use |
|------|-----------------|----------------------------|-------------|
| `post-contact` | `B[k] + 4.0` | long run through `shot` + gap (often **`duration` `3.8`** from Voice A `start`) | Reply after contact (`0.2` s after `shot` ends). |
| `pre-contact` | `B[k] + 2.0` | **`duration` `1.8`** from Voice A `start` | Reply while moving; `shot` still ends at `B[k] + 3.8`. |
| `early-pre-contact` | `B[k] + 1.4` | Destination spot: **`duration` `1.2`** from Voice A `start`. **`UserShotTxt`**: same **`start`** as Voice B, **`duration` `2.4`** so the reply label stays through **`shot`** (ends **`B[k] + 3.8`**). | Tighter cue stack; see **`samples/ghosting-30-shot.json`**. Optional **`vfx`** (e.g. fireworks) at the **`shot`** SFX **end** — same **`start`** as **`ghost` Voice A `start` + 3.6** s when using the usual in-beat offsets (see **`revision.json`** / **`revise.json`** and **`samples/ghosting-30-shot.json`**). |

**Samples:** `samples/ghosting-10-shot.json` uses **pre-contact** Voice B at **`B[k] + 2.0`**. **`samples/ghosting-30-shot.json`** uses **early-pre-contact** Voice B at **`B[k] + 1.4`**, ghost Voice A **shot-only** + **`ttsRate` `1.2`**, destination **`duration` `1.2`**, **`UserShotTxt`** **`duration` `2.4`**, and optional **`vfx`** fireworks on every beat (**`shot`** end = ghost Voice A **`start` + 3.6** s). **Hard** uses **`B[k+1] = B[k] + 4.9`** between consecutive **`shot`** starts; **Medium** / **Easy** add **`0.1` s** / **`0.2` s** to that stride; **Easy** and **Medium** use **`transition`: `"manual"`** with **`manualTransitionHeader`** on the last rep; **Hard** is automatic. `first-two.json` mixes **pre-contact** (beats 1–2) then **post-contact** (beat 3+), with **`B[1] = B[0] + 3.8 + 1.3 − 0.2`** from beat 0’s base (do **not** double-count the in-beat offset to `shot` when stacking **`τ`**).

**Beat tail:** With **post-contact** Voice B, audio through Voice B often ends around **`B[k] + 5.1`**. With **pre-contact** at **`B[k] + 2.0`**, Voice B often ends around **`B[k] + 3.1`**. With **early-pre-contact** at **`B[k] + 1.4`**, Voice B often ends around **`B[k] + 2.5`**; last SFX in the beat is still **`shot`** end at **`B[k] + 3.8`**.

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

**Voice B vs `shot` end:** **`post-contact`** mode keeps **`0.2` s** after **`shot`** ends before Voice B. **`pre-contact`** and **`early-pre-contact`** place Voice B **before** `shot` ends (see table above).

### Split-step speed (`sfxSplitSpeed`) by ghost shot

Set on the **`split`** SFX event for the opponent (ghost) shot that triggered the cycle. Values are `slow`, `medium`, or `fast`.

| Ghost shot | `sfxSplitSpeed` |
|------------|-----------------|
| Drive | `medium` |
| Cross Drive | `medium` |
| Lob | `slow` |
| Cross Lob | `slow` |
| Kill | `fast` |
| Cross Kill | `fast` |
| Boast | `medium` |
| Drop | `medium` |
| Cross Drop | `medium` |

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
- A full landing token is always **`\<depth\>\<L|R\>`** (for example **`5L`**, **`2R`**). For **same-side vs cross** you may use **striker POV** (ghost row vs user row) **or**, for some tables, a **single fixed court frame** so consecutive rows chain (see **Continuous rally tables** below).
- Shots whose name includes **`Cross`** intentionally land on the **opposite width** (switch `L` ↔ `R` at the target depth) from the striker’s side at contact.
- **`Boast`** behaves like a **cross-court width change** for target choice even though **`Cross`** does not appear in the name — same semantics as **`Boast`** in **`ghosting-model.json`** (`"side": "cross"` on the good target).

### Same-side vs cross-court (striker POV)

- **Same-side rule:** If the shot is **not** in the **width-changing** set below, the landing **`\<depth\>\<L|R\>`** must use the **same** `L` or `R` as the striker’s contact cell (in the POV you chose for that row). Example: a straight **`Drive`** from **`5R`** stays on **`R`** at the back (**`5R`**), not **`5L`**.
- **Width-changing shots (opposite `L`/`R` at the target depth vs striker at contact):** any canonical name starting with **`Cross`**, plus **`Boast`** (**`Boast` implies cross** for width even without **`Cross`** in the name).

### `X` in `ghosting-model.json` vs rally tables

- In **`data/ghosting-model.json`**, `"side": "cross"` with a depth encodes “good target is **opposite width** at that depth.” For tooling you may still see the shorthand suffix **`X`** in field names or comments meaning “cross side at this depth.”
- In **human-readable rally tables** and in **destination copy** where you show a **single corner token**, **do not** write **`5X`**, **`4X`**, etc. **`X` is not a court corner** — it abbreviates “cross” in the **data model**, while the word **`Cross`** in the shot name already describes the width change. Write the **resolved** corner (for example **`Cross Drive`** from **`5L`** → destination **`5R`**).

### Ghost striking cell vs user station (agreed)

For **incoming ghost** balls, treat the **ghost** as the **striker** for that feed. The **user’s** destination in cues (`heading`, e.g. **`4L`**, **`5R`**) is **`\<depth\>\<L|R\>`** from the **user’s** POV (facing the front wall).

**Ghost position notation (for rally tables and authoring):** always write the ghost’s **striking location** as **`\<depth\>\<L|R\>`** from the **ghost’s** POV at contact — same token shape as the user (e.g. **`5R`**, **`3L`**), not a bare **`L` / `R`**.

**Default mirror (symmetrical cell at the far end):** match the user’s **receive** depth and flip only the **side letter**:

- User receives at **`dL`** (depth **`d`**, side **L**) → ghost strikes from **`dR`** (same **`d`**, ghost POV **R**).
- User receives at **`dR`** → ghost strikes from **`dL`**.

So user **`4L`** ↔ ghost **`4R`**; user **`5R`** ↔ ghost **`5L`**. Adjust **`d`** only when the drill explicitly has the ghost recover shallow/deep for pressure; otherwise keep **depth aligned** so tables stay easy to read.

**Sequential beats (workout JSON):** when chaining beats, **ghost strike position** for the next beat equals the **landing** of the **user’s previous reply** in the **same fixed court** as `heading` tokens — see **Ball-side continuity** below. Do not use mirror letter-flip alone to infer ghost position across beats.

### Mirror vs cross-court (do not conflate)

Under the default mirror, the ghost’s **`dR`** cell and the user’s **`dL`** receive (or the reverse) describe the **same physical channel** from **opposite ends**. That **letter flip between POVs is not a cross-court shot** and does **not** violate the same-side rule.

When you validate **same-side**, compare **striking side** and **landing side** in **one** POV (ghost POV on ghost rows, user POV on user rows), or compare **user-receive** tokens only in **user** POV.

**Imported workouts:** Voice A + linked **`heading`** usually give the **user’s receive corner** (user POV). Example: ghost straight **`Drive`** from ghost **`5R`** → user **`heading`** **`5L`** is correct for movement, because **`5L`** (user) and **`5R`** (ghost) are the mirrored **same channel** — not an **`R`→`L` cross** by the ghost.

### Ball-side continuity (sequential beats)

Authoritative rules: **`data/ghosting-model.json`** → **`rules.targetNotation.ballSideContinuity`**.

Use **one fixed court** for width letters **`L`** and **`R`** (ball and striker at contact and at landing).

1. **Striker width:** Every shot (ghost or player) is played from a striker width **`L`** or **`R`** in that frame.

2. **Ball landing width after the shot:**
   - Names starting with **`Cross`** may switch ball width: **`L` → `R`** or **`R` → `L`**.
   - **`Boast`** implies the same width switch (**treat as cross** for ball width).
   - **All other** canonical names keep ball width unchanged: **`L` → `L`**, **`R` → `R`**. They **cannot** switch sides by this rule.

3. **Beat linkage (ghosting JSON):**
   - **User receive** on a beat (destination **`heading`**) = **landing target** of the **ghost’s** shot on that beat.
   - **Ghost strike position** on beat *k* (*k* > 1) = **landing target** of the **player’s** shot on beat *k* − 1 (same fixed court). Beat 1: set initial ghost feed and user receive so ghost striker cell and first landing match **`shotConstraints`**.

4. **Depth:** Full corners (**`dL`** / **`dR`**) still follow **`shotConstraints`** (good/bad, allowed striker depths). **`ballSideContinuity`** governs **width** through the chain; do not pair a non–width-changing shot with an impossible **`L`/`R`** jump relative to the prior landing.

5. **Mirror vs this model:** Default **mirror** (user **`dL`** ↔ ghost **`dR`**) explains **same channel** for a **single** incoming feed. For **consecutive beats**, apply **`ballSideContinuity.beatLinkage`** first; mirror alone does **not** replace prior-shot landing.

### Rally tables (striker POV per row)

When you build a **pattern table** with one row per shot and columns **Striking location | Shot type | Destination**:

- **Ghost row:** striking and destination are both **ghost POV** (same-side rule applies in ghost POV).
- **User row:** striking and destination are both **user POV**.
- Use only **`dL`** / **`dR`** in the destination column, never a bare **`dX`**.

### Continuous rally tables (one coordinate frame)

For a **shot-by-shot** log where **every** row is one stroke in time order (alternating ghost and user, or all one player), use **one** court labelling for **Striking location** and **Destination** so the path is continuous:

- **Striking location** on row **N** (for **N > 1**) must **exactly equal** **Destination location** on row **N − 1** (same string: same depth and same **`L`/`R`**). That encodes **ball / player arrival at contact** for the next stroke without a gap.
- Often that means **fixed geometric** **`L`/`R`** (same corner label for both players, e.g. from a single diagram), **not** per-player POV with a mirror flip between consecutive rows.

Per-row **same-side vs width-changing** rules still use **that row’s striker** at the **Striking location** cell for that row.

**Length drives (`Drive`):** for ghosting tables, treat **good length** as **back half** targets — typically **depth `4` or `5`** on the striker’s side (not a shallow **depth `3`** landing when stroking from **`2`** or deeper unless the drill explicitly labels a dying mid-court drive).

### Shot Constraints

Depth-only shorthand in the first column means **same side as striker** at the listed depth; “cross” rows mean **opposite side** at that depth (resolve to **`dL`** or **`dR`** in prose).

| Shot | Good landing spot | Bad landing spot | Allowed from depths |
|------|-------------------|------------------|---------------------|
| Drive | `5` (same side) | `4` (same side) | `1`, `2`, `3`, `4`, `5` |
| Cross Drive | `5` **opposite** side (`5R` if striker `L`) | `4` opposite | `1`, `2`, `3`, `4`, `5` |
| Boast | `1` opposite | `2` opposite | `2`, `3`, `4`, `5` |
| Lob | `5` (same side) | `4` (same side) | `1`, `2`, `3`, `4`, `5` |
| Weak lob | **`4`** (same side) — softer arc, not full depth **`5`** | `5` (same side) | `1`, `2`, `3`, `4`, `5` |
| Cross Lob | `5` opposite | `4` opposite | `1`, `2`, `3`, `4`, `5` |
| Kill | `2` (same side) | `3` (same side) | `3`, `4` |
| Cross Kill | `2` opposite | `3` opposite | `3`, `4` |
| Drop | `1` (same side) | `2` (same side) | `1`, `2`, `3`, `4`, `5` |
| Cross Drop | `1` opposite | `2` opposite | `1`, `2`, `3`, `4` |

### Good / Bad / Invalid Semantics

- `Good` spots are the intended technical target.
- `Bad` spots represent a weak-shot outcome for that shot pattern.
- Any landing spot not explicitly listed as `Good` or `Bad` for that shot is `Invalid`.
- `Allowed from depths` means the striker's current depth at shot contact before the shot is played.

### Generation Rules From This Model

- When a rep script names a shot, ensure target side/depth is legal for that shot and source depth.
- Favor "good" spots for technical or quality-focused reps.
- Use "bad" spots only when explicitly modeling weak execution, pressure, or recovery consequences.
- For cross shots, include side-switch language in cues (for example "cross to opposite back-right, depth 5") and use explicit **`dL`**/**`dR`** tokens in on-screen spots.
- Keep notation consistent in cues and summaries (for example `Drive to 5L`, `Cross drop to 1R`).
- **Ghost weak variants:** **`Weak lob`** is always a valid **ghost incoming** choice when building ghosting patterns (no special “only in warm-up” gate in this project). Apply the **Weak lob** row in the **Shot constraints** table (good **`4`** same side; **`5`** same side is the weak-pattern **bad** depth). If you add other **weak** ghost-only names later, document them here and in **`ghosting-model.json`** in the same edit.

### AI authoring checklist (rally logic + tables)

Use this as a **single** checklist when an AI generates ghosting workouts, **rally tables**, or validates sequences (everything below is spelled out in more detail earlier in this file or in **`data/ghosting-model.json`**):

| Topic | Rule |
|-------|------|
| **Source of truth** | **`ghosting-model.json`** wins on conflicts; update this **`.md`** in the same edit when the model changes. |
| **Width-changing shots** | **`Cross …`** and **`Boast`** — landing **width** is **opposite** striker at contact for the target depth; all others keep **same** `L`/`R`. |
| **Human tokens** | Use only **`dL`** / **`dR`** in tables and user-facing headings — **never** **`dX`** as a literal corner ( **`X`** is model shorthand only). |
| **Mirror vs cross** | Default **ghost strike ↔ user receive** mirror is **not** a cross-court shot; do not flag it as an `L`→`R` violation across POVs (see **Mirror vs cross-court**). |
| **Rally table (per-row POV)** | Optional layout: ghost rows **ghost POV**, user rows **user POV**; same-side / width-changing per that row’s striker. |
| **Continuous shot log** | One fixed court frame; **`Striking` on row *N*** = **`Destination` on row *N*−1** (exact string); same-side / width-changing per row striker (see **Continuous rally tables**). |
| **Length drives** | **`Drive`**: prefer **depth `4` or `5`** on the striker’s side for **length**; avoid shallow **`3`** from **`2`** or deeper unless the drill names a dying mid-court drive. |
| **Weak lob** | Good **depth `4`** same side, not full **`5`**; **ghost may always use `Weak lob`** as an incoming feed (see **Ghost weak variants** above). |
| **JSON workouts** | **`heading`** for the ghost phase is usually **user receive** (user POV); Voice A wording may still use that convention (see **Imported workouts** under **Mirror vs cross-court**). |
| **Ball-side chain** | User **`heading`** = ghost landing; ghost striker = prior user landing; **`L`/`R`** width flips only on **`Cross…`** and **`Boast`**; see **Ball-side continuity** and **`ballSideContinuity`** in **`ghosting-model.json`**. |
| **User reply weights** | **`transitions`** matrix **must** govern player reply choice in patterned sequences (prior shot name = matrix row key); see **`rules.generationContract`** and **Shot Transition Weights**. |

## Shot Transition Weights (Player-To-Ghost)

**Mandatory for patterned sequences:** when you choose each **player reply** in a multi-beat ghosting rep, rally table, or ordered shot list, you **must** use **`transitions`** in **`data/ghosting-model.json`** (not optional heuristics and not uniform random unless the user explicitly asks for unconstrained randomness). See **`rules.generationContract`** in the same file and **Output Contract For AI** below.

### Core Rules

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

### Transition Matrix

Weights below match **`data/ghosting-model.json`** (each cell weight is in **`1`…`10`**).

#### Player A: Drive

| Player B | Weight |
|----------|--------|
| Drive | 10 |
| Cross Drive | 10 |
| Boast | 5 |
| Cross Lob | 10 |
| Kill | 10 |
| Cross Kill | 3 |
| Drop | 5 |

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
| Drive | 10 |
| Cross Drive | 10 |
| Boast | 4 |
| Drop | 10 |
| Cross Drop | 6 |
| Lob | 7 |
| Cross Lob | 10 |
| Kill | 10 |
| Cross Kill | 7 |

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
| Drive | 10 |
| Cross Drive | 10 |
| Boast | 4 |
| Lob | 10 |
| Cross Lob | 10 |
| Kill | 9 |
| Cross Kill | 7 |

#### Player A: Cross Lob

| Player B | Weight |
|----------|--------|
| Drive | 10 |
| Cross Drive | 10 |
| Boast | 3 |
| Lob | 9 |
| Cross Lob | 9 |
| Kill | 8 |
| Cross Kill | 3 |

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

0. **Before writing JSON or a shot table:** satisfy **`rules.generationContract`** in **`data/ghosting-model.json`**: **`shotConstraints`**, **`targetNotation.ballSideContinuity`**, and **`transitions`** (weighted user replies in patterned sequences — see **Shot Transition Weights**). State in the plan one line that these were applied (or cite the exception if the user asked for random / unconstrained replies).

1. Provide a short plan (blocks, durations, intent).
2. Provide the full workout JSON in v2 format.
3. Briefly note how intensity progresses and where rests occur.

If the user asks for modifications, update the same JSON structure instead of inventing a new schema.
