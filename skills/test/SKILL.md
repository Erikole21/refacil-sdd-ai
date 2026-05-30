---
name: refacil:test
description: Generate unit tests based on SDD artifacts or for specific files — builds a briefing with CA/CR and file scope, and delegates to the refacil-tester sub-agent for generation and execution in isolated context
user-invocable: true
---

# refacil:test — Test Generation Entrypoint

This skill is the **canonical test phase** of the SDD flow: it generates tests, runs the change-scoped suite, and records results in `memory.yaml` for later phases. **`/refacil:verify`** and **`/refacil:review`** rely on that memory and do **not** re-run the full pipeline by default (**METHODOLOGY-CONTRACT.md §3.2**).

**Role distinction — smoke vs. full-suite**: `/refacil:apply` runs a dynamic smoke command after editing (narrowed to touched files, no coverage). `/refacil:test` is responsible for the **full scoped run WITH coverage** on changed/new code (default `testScope: scoped`) or repo-wide suite with coverage (when `testScope: full`). This applies in both manual and autopilot flows — the tester MUST NOT skip coverage or delegate it back to apply.

This skill is a **thin wrapper** that resolves the scope, extracts CA/CR criteria and the list of files to test, and delegates to the `refacil-tester` sub-agent with a **structured briefing**. The sub-agent starts with the criteria already extracted — it does not re-read specs from scratch.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + test command from `METHODOLOGY-CONTRACT.md §3` and **§3.1** (default: scoped tests **and** scoped coverage on changed/new code; full suite/coverage **on-demand** via explicit arguments).

## Flow

### Step 0: Resolve scope

**Test intent** — parse `$ARGUMENTS` (case-insensitive tokens, in addition to change name or file path):

- **Defaults**: `testScope: scoped`, `runCoverage: true` (coverage **narrowed** to `filesToTest` / the change — not repo-wide).

- **`testScope: full`** only if the user **explicitly** asked for a full suite (e.g. `full`, `all tests`, `whole suite`, `suite completa`, `todas`). Runs the full suite of **each affected component** (component-bounded per §3 — never all monorepo packages). Heavier; use sparingly before merge or debugging.

- **`runCoverage: false`** if the user **explicitly** asked to skip coverage (e.g. `no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, `quick`, `solo tests`). Otherwise leave `runCoverage: true`.

- Combining `full` with default coverage is allowed: **`testScope: full`** + **`runCoverage: true`** ⇒ full suite then **repo-wide / standard** coverage (per project). If they pass `full` but also `no coverage`, set **`runCoverage: false`** (full tests only).

**File mode** — if `$ARGUMENTS` contains a file path:
- `targetFile` = the received path. Continue directly to Step 2 (no spec briefing needed).

**Change mode** — if `$ARGUMENTS` is empty or a change name:
- List the folders in `refacil-sdd/changes/`.
- If there is exactly one active folder, use it as `changeName`.
- If there are multiple active folders, **stop** and ask the user to select which one to test.
- If there are no active changes, inform to run `/refacil:propose` and stop.

**Autopilot mode detection**: once `changeName` is set, try to read `refacil-sdd/.autopilot-active`. If the file exists and its `changeName` field matches the current `changeName` → set `autopilotMode = true`. Otherwise `autopilotMode = false` (normal mode, ask user as usual).

### Step 1: Build briefing (change mode only)

Before invoking the sub-agent, extract the key context:

1. **Criteria** — read the change specification (`refacil-sdd/changes/<changeName>/specs.md` and/or `specs/**/*.md` if they exist). Extract the list of acceptance criteria (CA-XX) and rejection criteria (CR-XX) with their descriptions.
2. **Files to test** — read `refacil-sdd/changes/<changeName>/design.md`. Extract the list of created/modified files.
3. **Test command (baseline)** — read `refacil-prereqs/METHODOLOGY-CONTRACT.md` §3 (and `AGENTS.md` if it overrides). Resolve the baseline command language-agnostically at the **affected component root** (nearest ancestor of changed files with a stack manifest — per §3 component principle). Extract the command without automatically adding coverage flags. If the change spans multiple components, extract a baseline per component; pass the primary one in `testCommand` and note extras in the briefing.
4. **Test pattern** — find an existing relevant test file (1 example file, not multiple). If `testing-patterns.md` exists in this directory, include it.
5. **Coverage command** — if `runCoverage: true`, detect the project coverage entrypoint per §3 (`test:cov`, `pytest --cov`, JaCoCo, `cargo llvm-cov`, etc.); otherwise set `coverageCommand: null`.

6. **Coverage narrowing** — when `testScope: scoped` and `runCoverage: true`, add a short note in the delegation: sub-agent MUST limit collection/includes to **`filesToTest`** (and specs produced for them), not the whole repo.

Build the BRIEFING block to include in the delegation prompt:

```
BRIEFING:
changeName: <name>
criteria:
  acceptance:
    - CA-01: <description>
    - CA-02: <description>
  rejection:
    - CR-01: <description>
filesToTest: [path/to/module-or-file-1, path/to/module-or-file-2, ...]
testCommand: <baseline from §3 — project-specific>
testScope: scoped | full
runCoverage: true | false
coverageCommand: <project coverage entrypoint or null>
testPatternFile: <path of an existing test file as reference, or null>
codegraphAvailable: true | false
```

Detect CodeGraph availability before delegating: run `refacil-sdd-ai codegraph status --json` and set `codegraphAvailable: true` only if `installed === true` AND `initialized === true`. If the command fails or the index is not ready, set `false` and continue without interruption.

The sub-agent (`refacil-tester`) applies **§3.1**: scoped tests by default; with `runCoverage: true`, runs **scoped** coverage (change-only) unless `testScope: full`.

### Step 2: Delegate to the refacil-tester sub-agent

**File mode** — pass a minimal BRIEFING with `targetFile`, baseline `testCommand` from §3, `testScope` / `runCoverage` / `coverageCommand` from Step 0 (defaults `scoped`, `true`, coverage entrypoint detected or `null`), and `testPatternFile` if found.

Invoke the `refacil-tester` sub-agent passing it the BRIEFING:
- Change mode: full BRIEFING from Step 1.
- File mode: BRIEFING with `targetFile` + baseline `testCommand` + `testScope` + `runCoverage` + `coverageCommand`.
- If the user explicitly requested detailed mode, indicate it. Default: concise.

The sub-agent will use the briefing to generate tests directly without re-reading specs.

Returns ONE single message with the report + JSON block fenced as ` ```refacil-test-result `.

### Step 2.5: Log CodeGraph telemetry (silent)

After the sub-agent completes, run **once** (do not mention it to the user unless it fails):

```bash
refacil-sdd-ai compact log-codegraph-event --skill tester --has-graph <true|false> --tool-calls <N> --tokens <N>
```

- `--has-graph`: the `codegraphAvailable` value if it was passed to the sub-agent; otherwise `false`.
- `--tool-calls`: number of `codegraph_*` tool calls the sub-agent made (0 if it did not use the graph).
- `--tokens`: conservative estimate of tokens saved (~800–1500 per useful tool call; 0 if no graph or no calls).

Estimate `--tool-calls` and `--tokens` from the sub-agent's `<usage>` block using the same criteria as `explore/SKILL.md` Step 1.5. If the command fails, ignore it; it must not block the flow.

### Step 3: Present the report and process result

Show the user the **report** (everything before the `refacil-test-result` block). Do not show the JSON block — it is internal metadata.

If the sub-agent returned something out of format, inform the user: "The tester returned an unstructured report — review the tests manually." and stop.

Parse the `refacil-test-result` block from the sub-agent:
- **If `passed: false`** (tests failed):
  - `autopilotMode = false` (normal): present the `issues` from the JSON and ask the user how to proceed. **Do not continue to Step 4** until the tests pass.
  - `autopilotMode = true`: attempt to fix the failing tests automatically (apply corrections to the test/source code — do NOT expand scope). Re-invoke the tester. **Maximum 3 rounds total.** If tests pass within those rounds → continue to Step 4. If still failing after round 3 → return phase failure to the autopilot pipeline (autopilot Step 6 handles Kapso notification). Do NOT ask the user at any point.
- **If `passed: true`**: continue to Step 4.

### Step 3.5: Update cross-skill memory (memory.yaml)

After parsing the `refacil-test-result` block and only if `passed: true`:
- Extract from the result or from the briefing: `commandsRun` (test command used), `criteriaRun` (list of CA-XX/CR-XX covered by tests), `stackDetected` (if the tester identified the stack).

Run:
```bash
refacil-sdd-ai sdd set-memory <changeName> \
  --last-step test \
  --commands-run "<test command used>" \
  --criteria-run "<comma-separated criteria IDs that were run>"
```

If `stackDetected` is available, add `--stack-detected "<stack>"` to the command as well.

This command merges into memory.yaml, preserving fields from other steps (e.g. `touchedFiles` from apply).

### Step 4: Flow continuity (only if tests passed)

- `autopilotMode = false` (normal): ask the user:
  ```
  The next step is to validate the implementation against the specs.
  Do you want me to continue with /refacil:verify?
  ```
- `autopilotMode = true`: proceed to `/refacil:verify` immediately without asking.

## Rules

- **Always build the briefing in change mode (Step 1) before delegating** — reduces the sub-agent tool calls.
- **Defaults**: `testScope: scoped`, `runCoverage: true` (narrowed to the change). **Full** suite/coverage only when the user explicitly asks in `$ARGUMENTS`. **No coverage** only when the user explicitly opts out (Step 0).
- **Always delegate to the sub-agent**. Do not replicate stack detection or generation logic here.
- **Do not invoke with ambiguous scope**. If there are multiple active changes, ask for selection first.
- Test implementation is English-only (test file names, test cases/descriptions, identifiers, and comments), regardless of the SDD artifact language.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question **and tests passed (`passed: true`)**, immediately execute `/refacil:verify`. Do not describe it in text or wait for the user to type it. (See `METHODOLOGY-CONTRACT.md §5`.)
