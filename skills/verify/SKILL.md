---
name: refacil:verify
description: Validate that the implementation meets the specs — builds a briefing with testCommand and CA/CR criteria, delegates to the refacil-validator sub-agent for the report, and handles corrections with user approval
user-invocable: true
---

# refacil:verify — Verification Entrypoint

This skill is a **wrapper** that builds a **structured briefing** with the test command and criteria already extracted, delegates the analysis to the `refacil-validator` sub-agent, and handles the interaction with the user to apply corrections.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md` (including **§3.2** — `/refacil:test` owns full test+coverage; verify defaults to **no re-run** when test memory exists).

## Flow

### Step 0: Resolve scope

Determine the scope before invoking the sub-agent. Prioritize in this order:
1. User argument (`$ARGUMENTS`).
2. Active change in `refacil-sdd/changes/`.
3. If there are multiple active changes and no `$ARGUMENTS`, **stop** and ask the user to explicitly select which change to validate.

**Autopilot mode detection**: once `changeName` is resolved, try to read `refacil-sdd/.autopilot-active`. If the file exists and its `changeName` field matches → `autopilotMode = true`. Otherwise `autopilotMode = false` (normal mode, ask user as usual).

**Test execution intent** — see **§3.2**:

- **Default**: `testExecution: none` when `get-memory` has `commandsRun` and `lastStep` is `test` (or later) — verify validates CA/CR **without** re-running the test pipeline.

- **`testExecution: full`** if the user explicitly asked to re-run tests (`full`, `all tests`, `re-run`, `run tests`, `ejecutar tests`, `whole suite`, `suite completa`, `todas`) — then also set `testScope` / `runCoverage` like **`/refacil:test`**:
  - **`testScope: full`** for whole-suite tokens above.
  - **`runCoverage: false`** for `no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, `quick`, `solo tests`.
  - **`full` + `no coverage`**: `testScope: full`, `runCoverage: false`.

- **No test memory** (`commandsRun` empty): emit WARNING, set `testExecution: full` (CR-01) unless only `changedFiles` allow a minimal scoped run.

Do not invoke the sub-agent with ambiguous scope.

If you already have a `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` to verify that the artifacts exist (`artifacts.proposal`, `artifacts.tasks`, `artifacts.specs` = true). If critical artifacts are missing, inform the user before continuing.

### Step 0.5: Hidden files under `refacil-sdd/changes/` (avoid false negatives)

If **this session** inspects the change directory before or after delegating, apply **`refacil-prereqs/METHODOLOGY-CONTRACT.md` §8**.

### Step 1: Build briefing for the sub-agent (reduces validator tool calls)

Before invoking the sub-agent, extract the context that the validator would otherwise calculate on its own:

0. **CodeGraph detection** — run `refacil-sdd-ai codegraph status --json` and extract:
   - `codegraphAvailable = true` if `installed === true` AND `initialized === true`
   - `codegraphAvailable = false` otherwise
   - Include `codegraphAvailable` as a field in the briefing so the validator can use CodeGraph for Dimension 3 (Coherence) analysis when available (see `METHODOLOGY-CONTRACT.md §3C`).

1. **Scope files** — run `git diff --name-only HEAD` to populate `changedFiles`.

2. **Cross-skill memory** — when `changeName` is known, run `refacil-sdd-ai sdd get-memory <changeName> --json`. Parse `commandsRun`, `criteriaRun`, and `lastStep`. If the output is `{}` or the command fails, omit those fields — do not block verification (CR-04).

3. **Resolve `testExecution`** (§3.2) from Step 0 and memory:
   - User forced re-run → `testExecution: full`.
   - `commandsRun` non-empty and `lastStep` is `test` (or `verify`/`review` after test) and user did **not** force re-run → `testExecution: none`.
   - Otherwise → `testExecution: full` with WARNING (no test phase recorded).

4. **Test commands** — only when `testExecution` is `full` or `smoke`:
   - **`full`**: follow §3.1 — set `testScope` and `runCoverage` from Step 0; build `testCommand` (scoped from `changedFiles` or baseline if `full`); set `coverageCommand` when `runCoverage: true`.
   - **`smoke`**: build `smokeTestCommand` for companion tests of `correctionTouchedFiles` only; `runCoverage: false`, `coverageCommand: null`.
   - **`none`**: omit `testCommand` and `coverageCommand`; set `testsDelegatedFrom: test` and include `commandsRun` for the report.

5. **Coverage command** — only when `testExecution: full` and `runCoverage: true`; otherwise `coverageCommand: null`.

6. **CA/CR criteria** — if there is an active change, read the specification in `refacil-sdd/changes/<changeName>/`:
   - `specs.md` if it exists, and/or files under `specs/` (recursively).
   - Extract the list of CA-XX (acceptance criteria) and CR-XX (rejection criteria) with their descriptions.
   - If there are no specs or the scope is `git-diff`, omit this field.

Build the BRIEFING block:

```
BRIEFING:
changeName: <name or null if scope=git-diff>
testExecution: none | smoke | full
testCommand: <required when full; omit when none>
smokeTestCommand: <required when smoke; omit otherwise>
testScope: scoped | full
runCoverage: true | false
coverageCommand: <project coverage entrypoint or null when full+runCoverage>
testsDelegatedFrom: test | null
correctionTouchedFiles: [...]   # only on re-verify after Step 5 corrections
criteria:
  acceptance:
    - CA-01: <description>
    - CA-02: <description>
  rejection:
    - CR-01: <description>
changedFiles: [path/file-1, ...]
mode: concise | detailed
codegraphAvailable: true | false       # from CodeGraph detection in Step 1.0
commandsRun: [<command>, ...]          # from memory.yaml — omit if not present
criteriaRun: [CA-01, CR-01, ...]       # from memory.yaml — omit if not present
```

### Step 2: Delegate to the refacil-validator sub-agent

Invoke `refacil-validator` passing it the BRIEFING from the previous step.

The sub-agent:
- Applies **`testExecution`** from the briefing (§3.2) — **does not** run tests when `none`.
- When `full`, uses `testCommand` / coverage per §3.1; when `smoke`, runs only `smokeTestCommand` (no coverage).
- Uses `criteria` from the briefing for verification (without re-reading specs from scratch).
- Uses `changedFiles` to focus the 3D verification on those files.
- Applies the **3D framework (Completeness/Correctness/Coherence)** per **`METHODOLOGY-CONTRACT.md §3C — 3C Criterion`** — including the severity table and graceful degradation rule.
- If `codegraphAvailable: true` is in the briefing, uses CodeGraph on `changedFiles` for Dimension 3 (Coherence) analysis.
- Optionally consults the bus cross-repo for ambiguities.
- Returns combined report + JSON block fenced as ` ```refacil-verify-result `.

### Step 2.5: Log CodeGraph telemetry (silent)

After the sub-agent completes, run **once** (do not mention it to the user unless it fails):

```bash
refacil-sdd-ai compact log-codegraph-event --skill validator --has-graph <true|false> --tool-calls <N> --tokens <N>
```

- `--has-graph`: the `codegraphAvailable` value from Step 1.0 of this skill.
- `--tool-calls`: number of `codegraph_*` tool calls the sub-agent made (0 if it did not use the graph).
- `--tokens`: conservative estimate of tokens saved (~800–1500 per useful tool call; 0 if no graph or no calls).

Estimate `--tool-calls` and `--tokens` from the sub-agent's `<usage>` block using the same criteria as `explore/SKILL.md` Step 1.5. If the command fails, ignore it; it must not block the flow.

### Step 3: Present the report

Show the user the **combined report** (everything before the `refacil-verify-result` block). Do not show the JSON block — it is internal metadata.

**If the sub-agent failed to load** (tool error, agent type not found, or no response at all): stop immediately and do NOT escalate to any other agent. If the failure is due to a missing install, `refacil-sdd-ai update` (or `init`) + restart the session — same as other skills that delegate to sub-agents.

```
The validator sub-agent could not be loaded — retry or run `/refacil:verify` again.
```

**If the sub-agent responded but without a `refacil-verify-result` block** (unstructured output): show the raw report and stop:
```
The validator returned an unstructured report — continue manually.
```
Do not re-invoke a different agent.

**If the sub-agent returned a scope error** (`SCOPE_ERROR: <reason>`, without JSON block): propagate to the user and ask for clarification. This is NOT the CA-01 failsafe — the agent loaded correctly but found an ambiguous scope.

### Step 4: Process the result

Parse the ` ```refacil-verify-result ` block from the sub-agent.

#### If `result` is APPROVED:

- `autopilotMode = false` (normal): ask the user:
  ```
  RESULT: APPROVED

  The next step is the quality review with the team checklist.
  Do you want me to continue with `/refacil:review`?
  ```
- `autopilotMode = true`: proceed to `/refacil:review` immediately without asking.

#### If `result` is REQUIRES_CORRECTIONS:

- `autopilotMode = false` (normal): present the issues and ask:
  ```
  RESULT: REQUIRES_CORRECTIONS

  Required corrections:
  1. [CRITICAL/WARNING] [description] — [suggested fix]
  2. ...

  Do you want me to apply these corrections? (yes/no)
  - Yes: I will apply the fixes and automatically re-verify
  - No: you can fix them manually and then continue with /refacil:verify
  ```
- `autopilotMode = true`: apply corrections automatically (yes internally) without asking, then re-verify. If still failing after 2 rounds → abort (return failure to the autopilot pipeline without asking the user).

### Step 5: Apply corrections (if the user accepts)

**Only apply fixes after explicit user approval.**

1. Apply ONLY the listed corrections — do not add new functionality, do not refactor unrelated code.
2. If there are tests that need adjustment, adjust them as well.
3. Show summary of modified files; record paths in `correctionTouchedFiles`.
4. **Re-verify** (max 2 rounds): rebuild briefing with `testExecution: smoke` on companion tests of `correctionTouchedFiles`, **or** `testExecution: none` and tell the user:
   ```
   Corrections applied. Run /refacil:test before the next full verify to refresh the test suite.
   ```
   **Never** set `testExecution: full` in autofix re-verify unless the user explicitly requested re-run in this invocation.
5. Maximum **2 rounds** of automatic correction. If issues persist, list them for manual correction.

**If the user does not accept:** list the issues for manual correction. Suggest `/refacil:test` then `/refacil:verify`.

## Rules

- **Always build the briefing (Step 1) before delegating** — reduces the sub-agent tool calls.
- **Defaults**: `testExecution: none` when test memory exists; **`testExecution: full`** only when Step 0 forces re-run or CR-01 applies. Smoke only after corrections; never full suite in autofix rounds.
- **Always delegate to the sub-agent** for the analysis. Do not replicate spec reading or test execution logic here.
- **Dotfiles in `refacil-sdd/changes/`**: never assert absence of `.review-passed` without `-a`; see §8.
- **Corrections are ONLY applied by this wrapper** (Step 5), after explicit approval.
- **Corrections must be surgical**: only what is necessary to resolve the reported issues.
- Maximum 2 rounds of automatic correction before escalating to manual.
- **Sub-agent failsafe (CA-01)**: if the validator fails to load (tool error) or returns no response — stop and inform the user. Do NOT escalate to any other agent.
- **Unstructured output (CA-02)**: if the validator responds but without a `refacil-verify-result` block — show the raw report and stop. Do NOT re-invoke another agent.
- **SCOPE_ERROR (CR-03)**: if the validator returns `SCOPE_ERROR: <reason>` — propagate and ask for clarification. CA-01 does NOT apply here.
- **Flow continuity**: if the result is APPROVED and the user confirms affirmatively, immediately execute `/refacil:review`. (See `METHODOLOGY-CONTRACT.md §5`.)
