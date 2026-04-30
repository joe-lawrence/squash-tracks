# Agent instructions — `squash-tracks`

## When these rules apply

Use this file whenever you **author, edit, or validate** squash ghosting content: workout JSON (especially v2 ghosting reps), **`data/ghosting-model.json`**, sample ghosting files under `samples/`, or narrative shot sequences for import.

## What to read first

1. **`GHOSTING-RULES.md`** — single canonical ghosting spec (structure, lanes, timing, ball-side chain, transitions, output contract).
2. **`data/ghosting-model.json`** — machine source of truth; in particular:
   - **`rules.generationContract`** — mandatory: constraints + ball-side continuity + weighted user replies for patterned sequences.
   - **`rules.targetNotation.ballSideContinuity`** — consecutive beats: user `heading` = ghost landing; ghost striker = prior user landing; width flips only on Cross / Volley Cross / Boast / Volley Boast.
   - **`shotConstraints`** — legal shots and good landing corners.
   - **`transitions`** — player reply weights (strip leading `Volley ` for lookup per JSON).

## Invariants (do not skip)

- **Ball chain:** Ghost landing on a beat = user receive **`heading`** on that beat. Next ghost **strikes from** the **landing** of the user’s reply on the previous beat (fixed court `L`/`R`). Do not use mirror letter-flip alone across beats; see **`GHOSTING-RULES.md`** and **`ballSideContinuity`**.
- **Width:** Only **`Cross…`**, **`Volley Cross…`**, **`Boast`**, **`Volley Boast`** switch ball side **`L↔R`**; all other shots keep side.
- **Patterned user replies:** Choose replies using **`transitions`** weights among options legal under **`shotConstraints`** and **`ballSideContinuity`**, unless the user explicitly asks for unconstrained randomness.
- **Workout JSON:** Follow **`GHOSTING-RULES.md`** output contract (step **0** before emitting JSON or tables).

On conflict between prose and JSON, **`data/ghosting-model.json`** wins; update **`GHOSTING-RULES.md`** in the same change when the model changes.
