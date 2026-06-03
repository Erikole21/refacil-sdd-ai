---
name: refacil:status
description: Show which phase of the SDD-AI cycle a change is in and the exact command to resume it — use for "where am I?", "how is it going?", "status of the change", "resume", "where did I leave off". Distinct from /refacil:stats (which shows telemetry, token savings, and review metrics). Use /refacil:status to navigate the flow; use /refacil:stats for observability data.
user-invocable: true
---

# refacil:status — Current Phase and Resume

This skill answers: **"In which phase of the SDD-AI cycle is this change, and what command do I run next?"**

It is distinct from `/refacil:stats`:
- `/refacil:status` — **navigation**: current phase, next skill to run, resume a paused flow.
- `/refacil:stats` — **telemetry**: token savings, compact rewrites, CodeGraph calls, review history.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md`.

## Activation phrases

Invoke this skill for expressions like: "¿en qué va?", "¿cómo voy?", "status del cambio", "retomar", "dónde quedé", "where did I leave off?", "resume", "what's the current state?", "what's next?".

## Next-skill mapping

The following table maps each state to the recommended next skill in the **normal flow** and in the **bug fix flow** (`fix-*`):

| State             | Normal flow next skill   | Bug fix (fix-*) next skill |
|-------------------|--------------------------|---------------------------|
| `proposed`        | `/refacil:propose` (approve or adjust) | — |
| `approved`        | `/refacil:apply`         | `/refacil:apply`          |
| `apply-in-progress` | `/refacil:apply`       | `/refacil:apply`          |
| `applied`         | `/refacil:test`          | `/refacil:test`           |
| `tested`          | `/refacil:verify`        | `/refacil:review` (bugs omit verify) |
| `verified`        | `/refacil:review`        | — (n/a: bugs never reach verified) |
| `reviewed`        | `/refacil:archive`       | `/refacil:archive`        |
| `archived`        | `/refacil:up-code`       | `/refacil:up-code`        |
| `unknown`         | Run `/refacil:propose` to create artifacts | — |

## Flow

### Without argument — overview of all active changes

1. Run `refacil-sdd-ai sdd list --json` to get all active changes.

2. If the list is empty, inform the user:
   ```
   No active changes found. Run /refacil:propose to start a new change.
   ```
   Stop.

3. For each active change, run `refacil-sdd-ai sdd status <changeName> --json` and collect:
   - `currentState` and `stateInferred`
   - `tasks.done` / `tasks.total`
   - `reviewPassed`

4. Present a summary table:

   ```
   === Active changes ===

   Change                Phase                      Next command
   ─────────────────────────────────────────────────────────────────
   <changeName>          <currentState> (inferred?)  <next skill>
   ...
   ```

   For each row, derive the next skill from the **next-skill mapping** above (use the normal flow unless the change name starts with `fix-`).

   State history is shown only in the detail view — pass a change name as argument to see the full transition log.

### With argument — detail for one change

1. Use `$ARGUMENTS` as `changeName`.

2. Run `refacil-sdd-ai sdd status <changeName> --json` and parse the output.

3. If the command exits 1 (change not found), inform the user and stop.

4. Resolve `currentState`:
   - Use `status.currentState` from the JSON directly.
   - If `stateInferred` is `true`, note it as `(inferred from artifacts)`.

5. Parse `stateHistory` from memory (if available):
   - Run `refacil-sdd-ai sdd get-memory <changeName> --json`.
   - Read the `stateHistory` array. Each entry is a pipe-separated string `"<state>|<ISO>|<actor>"`.
   - Parse each entry with `entry.split('|')` → `[state, iso, actor]`.
   - Show the last 5 entries (most recent last) as a compact history.

6. Determine the next skill from the **next-skill mapping** table above.

7. Present:

   ```
   === Status: <changeName> ===

   Current phase:  <currentState> <(inferred from artifacts)?>
   Last step:      <lastStep or "not recorded">
   Touched files:  <touchedFiles list or "none">

   State history (last 5):
     <date> — <state> (by <actor>)
     ...

   Next command:   <next skill>
   ```

   If the change is in `archived` state, add:
   ```
   This change is fully archived. Run /refacil:up-code to push and create the PR.
   ```

## Rules

- **Read-only**: this skill does not modify any file, branch, or memory.
- **Graceful degradation**: if `stateHistory` is absent or `get-memory` fails, show the current state without history. Do not error.
- **Empty list behavior**: if `sdd list --json` returns `[]`, inform the user and stop without error.
- **Bug fix detection**: if `changeName` starts with `fix-`, use the bug fix flow column in the next-skill table. The bug flow skips `/refacil:verify`: a `tested` fix goes straight to `/refacil:review`, and a fix never reaches the `verified` state.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) after the status display and there is a single unambiguous next skill, immediately execute that skill. (See `METHODOLOGY-CONTRACT.md §5`.)
