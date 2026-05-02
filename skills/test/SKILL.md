---
name: refacil:test
description: Generate unit tests based on SDD artifacts or for specific files — builds a briefing with CA/CR and file scope, and delegates to the refacil-tester sub-agent for generation and execution in isolated context
user-invocable: true
---

# refacil:test — Test Generation Entrypoint

This skill is a **thin wrapper** that resolves the scope, extracts CA/CR criteria and the list of files to test, and delegates to the `refacil-tester` sub-agent with a **structured briefing**. The sub-agent starts with the criteria already extracted — it does not re-read specs from scratch.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + test command from `METHODOLOGY-CONTRACT.md §3` and **§3.1** (default: scoped tests **and** scoped coverage on changed/new code; full suite/coverage **on-demand** via explicit arguments).

## Flow

### Step 0: Resolve scope

**Test intent** — parse `$ARGUMENTS` (case-insensitive tokens, in addition to change name or file path):

- **Defaults**: `testScope: scoped`, `runCoverage: true` (coverage **narrowed** to `filesToTest` / the change — not repo-wide).

- **`testScope: full`** only if the user **explicitly** asked for **whole-repo / whole-suite** tests (e.g. `full`, `all tests`, `whole suite`, `suite completa`, `todas`). This is heavier; use sparingly before merge or debugging.

- **`runCoverage: false`** if the user **explicitly** asked to skip coverage (e.g. `no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, `quick`, `solo tests`). Otherwise leave `runCoverage: true`.

- Combining `full` with default coverage is allowed: **`testScope: full`** + **`runCoverage: true`** ⇒ full suite then **repo-wide / standard** coverage (per project). If they pass `full` but also `no coverage`, set **`runCoverage: false`** (full tests only).

**File mode** — if `$ARGUMENTS` contains a file path:
- `targetFile` = the received path. Continue directly to Step 2 (no spec briefing needed).

**Change mode** — if `$ARGUMENTS` is empty or a change name:
- List the folders in `refacil-sdd/changes/`.
- If there is exactly one active folder, use it as `changeName`.
- If there are multiple active folders, **stop** and ask the user to select which one to test.
- If there are no active changes, inform to run `/refacil:propose` and stop.

### Step 1: Build briefing (change mode only)

Before invoking the sub-agent, extract the key context:

1. **Criteria** — read the change specification (`refacil-sdd/changes/<changeName>/specs.md` and/or `specs/**/*.md` if they exist). Extract the list of acceptance criteria (CA-XX) and rejection criteria (CR-XX) with their descriptions.
2. **Files to test** — read `refacil-sdd/changes/<changeName>/design.md`. Extract the list of created/modified files.
3. **Test command (baseline)** — read `refacil-prereqs/METHODOLOGY-CONTRACT.md` §3 (and `AGENTS.md` if it overrides). Extract the baseline command **without** automatically adding coverage flags.
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
```

The sub-agent (`refacil-tester`) applies **§3.1**: scoped tests by default; with `runCoverage: true`, runs **scoped** coverage (change-only) unless `testScope: full`.

### Step 2: Delegate to the refacil-tester sub-agent

**File mode** — pass a minimal BRIEFING with `targetFile`, baseline `testCommand` from §3, `testScope` / `runCoverage` / `coverageCommand` from Step 0 (defaults `scoped`, `true`, coverage entrypoint detected or `null`), and `testPatternFile` if found.

Invoke the `refacil-tester` sub-agent passing it the BRIEFING:
- Change mode: full BRIEFING from Step 1.
- File mode: BRIEFING with `targetFile` + baseline `testCommand` + `testScope` + `runCoverage` + `coverageCommand`.
- If the user explicitly requested detailed mode, indicate it. Default: concise.

The sub-agent will use the briefing to generate tests directly without re-reading specs.

Returns ONE single message with the report + JSON block fenced as ` ```refacil-test-result `.

### Step 3: Present the report and process result

Show the user the **report** (everything before the `refacil-test-result` block). Do not show the JSON block — it is internal metadata.

If the sub-agent returned something out of format, inform the user: "The tester returned an unstructured report — review the tests manually." and stop.

Parse the `refacil-test-result` block from the sub-agent:
- **If `passed: false`** (tests failed): present the `issues` from the JSON and ask the user how to proceed. **Do not continue to Step 4** until the tests pass.
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

Add:

```
The next step is to validate the implementation against the specs.
Do you want me to continue with /refacil:verify?
```

## Rules

- **Always build the briefing in change mode (Step 1) before delegating** — reduces the sub-agent tool calls.
- **Defaults**: `testScope: scoped`, `runCoverage: true` (narrowed to the change). **Full** suite/coverage only when the user explicitly asks in `$ARGUMENTS`. **No coverage** only when the user explicitly opts out (Step 0).
- **Always delegate to the sub-agent**. Do not replicate stack detection or generation logic here.
- **Do not invoke with ambiguous scope**. If there are multiple active changes, ask for selection first.
- Test implementation is English-only (test file names, test cases/descriptions, identifiers, and comments), regardless of the SDD artifact language.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question **and tests passed (`passed: true`)**, immediately invoke the **Skill tool** with `skill: "refacil:verify"`. Do not describe it in text or wait for the user to type `/refacil:verify`. (See `METHODOLOGY-CONTRACT.md §5`.)
