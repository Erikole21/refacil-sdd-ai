---
name: refacil:archive
description: Archive a completed change — move artifacts to archive and sync specs
user-invocable: true
---

# refacil:archive — Archive Completed Change

This command archives completed SDD changes through `refacil-sdd-ai sdd archive <changeName>`, syncs `refacil-sdd/specs/`, and enforces team pre-verification checks.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Instructions

### Step 0: Autopilot mode detection

Try to read `refacil-sdd/.autopilot-active`. If the file exists and its `changeName` field matches the change being archived → `autopilotMode = true`, extract `taskReference` from the file. Otherwise `autopilotMode = false` (normal mode, ask user as usual).

### Step 1: Pre-verification checks

Before archiving, run `refacil-sdd-ai sdd status <changeName> --json` and parse the JSON to get the change status.

Verify the change is truly complete:

1. **Tasks completed**: Use the `tasksProgress` (or `tasks`) field from the JSON — verify that `tasks.pending === 0`. If there are incomplete tasks, inform the user and ask if they want to continue anyway.

2. **Current `/refacil:test` evidence**: Do not re-run the test suite by default. Run `refacil-sdd-ai sdd get-memory <changeName> --json` and verify that:
   - `memory.lastStep` is `test`, `verify`, or `review` (test evidence remains valid after later validation phases if it is still fresh).
   - `memory.commandsRun` is present and non-empty.
   - `memory.criteriaRun` is an array with at least one covered CA/CR criterion.
   - `memory.touchedFiles`, when present, still covers the files currently changed for this SDD change.
   - The evidence is fresh: no relevant changed file was modified after the recorded `/refacil:test` evidence. Use reliable timestamps, hashes, or an equivalent snapshot when available. If freshness cannot be proven, treat the evidence as stale.

   If the evidence is current, archive may continue and should report `Tests: PASS (from /refacil:test evidence: <commandsRun>)`.

   If evidence is missing or stale:
   - `autopilotMode = false`: stop and ask the user whether to run `/refacil:test` now or explicitly continue without current test evidence. Do not silently run tests.
   - `autopilotMode = true`: abort archiving with a clear error: `Cannot archive in autopilot: current /refacil:test evidence is missing or stale.` Do not ask the user and do not re-run tests.

3. **Working tree scope hygiene**: Run `git status` and check whether there are files unrelated to the current change scope. It is expected to have uncommitted changes in this step. If unrelated files are detected, warn the user and ask whether to continue archiving anyway. Do not suggest commit in this step; commit/push decisions are handled in `refacil:up-code`.

4. **Review approved (blocking)**: Verify that the `.review-passed` file exists in the change folder (`refacil-sdd/changes/[change-name]/.review-passed`) following **`METHODOLOGY-CONTRACT.md` §8** (dotfile; do not conclude by listings without dotfiles). If it does NOT exist, **stop the archiving** and inform the user:
   ```
   Cannot archive: the change does not have an approved review.
   Run /refacil:review first.
   ```
   This verification is **mandatory and blocking** — it cannot be skipped.

If any of checks 1-3 fail, inform the user but allow them to decide whether to continue, except missing/stale test evidence in autopilot mode, which is blocking.
If check 4 fails, archiving cannot continue.

### Step 1.5: Request task reference(s) (traceability — mandatory)

- `autopilotMode = true`: use `taskReference` from `refacil-sdd/.autopilot-active` directly. Do NOT ask the user. Set `taskReferences = [taskReference]` and continue.

- `autopilotMode = false` (normal): ask the user for the task reference(s) associated with the change (URL, issue/ticket number, or short task name):
  ```
  Task reference(s) associated with this change (URL, ticket number, or task name; if multiple, separate with commas):
  ```

  **Rules:**
  - The user may enter one or multiple references separated by commas in a single message.
  - Accepted formats: URL (`https://tracker.company.com/TASK-123`), identifier (`TASK-123`, `INC-9001`), or short descriptive name (`checkout-adjustment`).
  - Minimum validation rule for each reference (operational and mandatory):
    - `URL`: starts with `http://` or `https://` and has at least one non-space character after the protocol.
    - `identifier`: matches `^[A-Za-z][A-Za-z0-9_-]*-\d+$` (examples: `BP-4610`, `INC-9001`).
    - `short name`: 3-80 characters, includes at least one letter, and is not only symbols/spaces.
  - If the user provides no reference (answers empty, "n", "no", "none", blank Enter), **block the archiving** and ask again:
    ```
    Cannot archive without at least one task reference.
    Provide the task URL, identifier, or name that originated this change to continue.
    ```
  - If the user provides a non-empty but invalid value (for example: `---`, `???`, `123`, `_`), **reject it** and ask again:
    ```
    Invalid task reference format.
    Use one of: URL (https://...), identifier (ABC-123), or short task name (3-80 chars, includes letters).
    ```
  - Repeat until at least one valid reference is received.
  - Save the references in `taskReferences` to use when writing `review.yaml` in the following steps.

### Step 2: Determine change type

Inspect the change folder in `refacil-sdd/changes/`:

- First inspect the artifact structure, then classify:
  - **Full SDD artifact set present** (`proposal.md`, `specs.md`, `design.md`, and `tasks.md`) → **regular change**, even when the folder name starts with `fix-`.
    - Example: `fix-seginf-20` containing `proposal.md` + `specs.md` + `design.md` + `tasks.md` → treat as **regular change** and follow Step 2B.
  - **Minimal bug-fix artifact set** (`summary.md` exists and the full SDD artifact set is absent) → **bug fix**.
    - Example: `fix-null-pointer-pay` containing only `summary.md` (and optionally `.review-passed`) → treat as **bug fix** and follow Step 2A.
  - Any other incomplete or ambiguous structure → stop and report the missing artifacts; do not guess from the folder prefix alone.

Depending on the type, follow the corresponding step:

### Step 2A: Bug fix → Archive with native CLI

Minimal bug fixes only contain `summary.md` (and optionally `.review-passed`) and do not include the full SDD artifact set. The CLI `refacil-sdd-ai sdd archive` handles the folder move internally with its own `findProjectRoot()`, so use the CLI for the move, and only write specs/review.yaml yourself (the CLI does not cover those).

0. **Read artifacts before archiving**: read `summary.md` and `.review-passed` from `refacil-sdd/changes/[fix-name]/` **now**, before the CLI moves the folder. The archived path will be different.

1. **Archive with the CLI** — let the CLI handle the move (it preserves `memory.yaml` by moving the complete change directory):
   ```bash
   refacil-sdd-ai sdd archive [fix-name]
   ```
   The CLI resolves the repo root internally, **skips spec sync** for `fix-*` (no `specs.md` in the change folder), preserves `memory.yaml` if present, moves the folder to `refacil-sdd/changes/archive/[ISO-date]-[fix-name]/`, and exits with code 0 on success. If it exits non-zero, stop and report the error to the user.

2. **Document in specs**: using the content read in step 0, create an individual spec at `$(git rev-parse --show-toplevel)/refacil-sdd/specs/[descriptive-name]/spec.md`.

   **Spec folder name**: Use a short, clear kebab-case description of the bug (e.g. `fix-session-timeout-redis`, `fix-null-pointer-payment-callback`). **Do NOT use ticket IDs** (REF-123, TASK-456, etc.) — the name must be descriptive so `/refacil:explore` can find and understand the fix without external context.

   Content of `spec.md` (Refacil SDD spec layout):
   ```markdown
   # [descriptive-name] Specification

   ## Purpose
   Fix [clear bug description] to restore expected behavior without introducing regressions.

   ## Requirements
   ### Requirement: [main expected behavior]
   The system SHALL [correct behavior after the fix].

   #### Scenario: Bug fixed in original condition
   - **WHEN** [condition that previously failed]
   - **THEN** the system SHALL [expected result]

   #### Scenario: Normal flow remains stable
   - **WHEN** [normal condition]
   - **THEN** the system SHALL [normal behavior without regression]
   ```

3. **Persist review metadata separately**: create `$(git rev-parse --show-toplevel)/refacil-sdd/specs/[descriptive-name]/review.yaml` with the fields from `.review-passed` plus the task references from Step 1.5:
   ```yaml
   verdict: APROBADO|APROBADO CON OBSERVACIONES
   date: 2026-04-10T00:00:00.000Z
   changeName: fix-...
   summary: "..."
   failCount: 0
   blockers: false
   taskReferences:
     - https://tracker.company.com/TASK-123
     - TASK-123
   ```

4. Continue to **Step 3**.

### Step 2B: Regular change → Archive with native CLI

`refacil-sdd-ai sdd archive` normalizes the provided `changeName` to lowercase before validation/path resolution. Prefer lowercase names for consistency across commands and records.

**Spec sync (CLI — mandatory, same language as change artifacts)**:

- `sdd archive` runs **`refacil-sdd-ai sdd sync-spec <changeName>` automatically** before moving the folder.
- The CLI copies CA/CR blocks from `specs.md` or `specs/**/*.md` into `refacil-sdd/specs/<changeName>/spec.md` using catalog headings that match the change artifact language (Spanish vs English section titles — see `sdd sync-spec` / METHODOLOGY-CONTRACT).
- **Do NOT translate or rewrite** the criteria in another language. Structural conversion only (Gherkin keywords stay as written in the source artifacts).
- Language is detected from the change proposal heading marker (Spanish vs English template), not invented by the agent.
- To sync without archiving: `refacil-sdd-ai sdd sync-spec <changeName>`.

1. **Verify spec sync output** (after archive, or run `sync-spec` manually first):
   - Confirm `refacil-sdd/specs/<changeName>/spec.md` exists and matches the language of the archived change specs.
   - Do **not** replace CLI output with an agent-written English summary.

2. **Persist review evidence (before or after archive)**:
   - Read `refacil-sdd/changes/<changeName>/.review-passed` (dotfile — use `ls -la` or read by explicit path, not directory listing).
   - Create/update `refacil-sdd/specs/<specName>/review.yaml` with its fields plus `taskReferences` from Step 1.5:
     ```yaml
     verdict: APROBADO|APROBADO CON OBSERVACIONES
     date: 2026-04-10T00:00:00.000Z
     changeName: change-name
     summary: "..."
     failCount: 0
     blockers: false
     taskReferences:
       - https://tracker.company.com/TASK-123
       - TASK-123
     ```
   - If `review.yaml` already exists, update only the fields that changed without removing others.

3. **Run the CLI archive**: `refacil-sdd-ai sdd archive <changeName>` — sync-spec, preserves `memory.yaml` if present, then moves the complete change directory to `refacil-sdd/changes/archive/<date>-<changeName>/`.
4. Verify the command completed successfully (exit 0) and the original folder no longer exists.

5. Continue to **Step 3**.

The goal is for `refacil-sdd/specs/` to document how the system works TODAY.

### Step 3: Confirm

Before showing the summary, run a **final cleanup verification** (applies to both bug fixes and regular changes):

- `$(git rev-parse --show-toplevel)/refacil-sdd/changes/[original-name]/` **must NOT exist** (only the archived version must survive in `refacil-sdd/changes/archive/...`).
- If the source folder survived for any reason (failed move, partial copy, interrupted move), do not claim success. Stop, report the residue path, and ask the user whether to remove it after they inspect the archived copy.

```
=== Change archived ===
 Change: [name]
 Type: [Bug fix | Regular change]
 Location: refacil-sdd/changes/archive/[date]-[name]/
 Original folder deleted: YES
 Specs synced: YES
 Tests: PASS (from /refacil:test evidence)

 The change has been completed and archived successfully.
```

### Step 4: Recommend pushing the code

After confirming the archiving:

- `autopilotMode = false` (normal): ask the user:
  ```
  The next step is to push the change and create the PR.
  Do you want me to continue with /refacil:up-code?
  ```
- `autopilotMode = true`: proceed to `/refacil:up-code` immediately without asking.

## Rules

- Always verify completeness before archiving
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 4, immediately execute `/refacil:up-code`. Do not describe it in text or wait for the user to type it. (See `METHODOLOGY-CONTRACT.md §5`.)
- Spec synchronization is MANDATORY in the Refacil methodology
- The `.review-passed` metadata must be persisted separately in YAML (`review.yaml`) inside each spec folder
- Do not delete artifacts, only move them to archive/ for traceability
- **The original folder in `refacil-sdd/changes/[name]/` must NOT survive archiving** — neither for bug fixes (Step 2A) nor for regular changes (Step 2B). Use the native CLI move and verify explicitly. If residue remains, stop and report it instead of performing an automatic destructive cleanup.
