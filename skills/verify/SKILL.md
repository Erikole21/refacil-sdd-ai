---
name: refacil:verify
description: Validate that the implementation meets the specs — builds a briefing with testCommand and CA/CR criteria, delegates to the refacil-validator sub-agent for the report, and handles corrections with user approval
user-invocable: true
---

# refacil:verify — Verification Entrypoint

This skill is a **wrapper** that builds a **structured briefing** with the test command and criteria already extracted, delegates the analysis to the `refacil-validator` sub-agent, and handles the interaction with the user to apply corrections.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md` (including **§3.1** — default scoped tests **and** scoped coverage; full regression on explicit request).

## Flow

### Step 0: Resolve scope

Determine the scope before invoking the sub-agent. Prioritize in this order:
1. User argument (`$ARGUMENTS`).
2. Active change in `refacil-sdd/changes/`.
3. If there are multiple active changes and no `$ARGUMENTS`, **stop** and ask the user to explicitly select which change to validate.

**Test intent** — align with **`/refacil:test`** (same tokens):

- **Defaults**: `testScope: scoped`, `runCoverage: true` (coverage **narrowed** to diff / changed files).

- **`testScope: full`** only if the user explicitly asked (`full`, `all tests`, `whole suite`, `suite completa`, `todas`).

- **`runCoverage: false`** if the user explicitly asked to skip coverage (`no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, `quick`, `solo tests`). Otherwise leave `runCoverage: true`.

- **`full` + `no coverage`**: full tests only (`testScope: full`, `runCoverage: false`).

Do not invoke the sub-agent with ambiguous scope.

If you already have a `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` to verify that the artifacts exist (`artifacts.proposal`, `artifacts.tasks`, `artifacts.specs` = true). If critical artifacts are missing, inform the user before continuing.

### Step 0.5: Hidden files under `refacil-sdd/changes/` (avoid false negatives)

If **this session** inspects the change directory before or after delegating, apply **`refacil-prereqs/METHODOLOGY-CONTRACT.md` §8**.

### Step 0.6: Verify validator agent is installed (blocking — CA-12)

Before doing anything else, check that `.claude/agents/refacil-validator.md` exists (read by explicit path or `ls -la .claude/agents/refacil-validator.md`).

**If the file does NOT exist**, stop immediately:
```
El agente `refacil-validator` no está instalado. Ejecuta `/refacil:update` y reinicia la sesión antes de volver a correr `/refacil:verify`.
```
Do not continue and do not escalate to any other agent.

### Step 1: Build briefing for the sub-agent (reduces validator tool calls)

Before invoking the sub-agent, extract the context that the validator would otherwise calculate on its own:

1. **Scope files** — run `git diff --name-only HEAD` to populate `changedFiles`.

2. **Cross-skill memory** — when `changeName` is known, run `refacil-sdd-ai sdd get-memory <changeName> --json`. Parse `commandsRun` and `criteriaRun`. If the output is `{}` or the command fails, omit those fields — do not block verification (CR-04).

3. **Test command** — follow `METHODOLOGY-CONTRACT.md` §3.1. Set `testScope` and `runCoverage` from Step 0 (`scoped` / `runCoverage: true` by default).
   - If the user requested `testScope: full`, set `testCommand` to the baseline §3 command (no narrowing).
   - Else if `commandsRun` from memory is non-empty and the user did **not** force `full`, prefer the **last** entry in `commandsRun` as `testCommand` (same invocation as `/refacil:test` when memory was updated).
   - Else build a **scoped** `testCommand` from `changedFiles`: include paths that are already test artifacts; for touched sources, infer companion tests from **project convention** (`AGENTS.md`, test config — co-located `*Test*` / `*Spec*`, `tests/`, language-specific layouts), not from a single language suffix.
   - If you cannot build any scoped command, fall back to baseline §3 and add a one-line WARNING in the handoff that the run may be heavy.

4. **Coverage command** — detect per §3 when `runCoverage: true`; otherwise set `coverageCommand: null`. When `testScope` is `scoped` and `runCoverage: true`, instruct the validator to **narrow coverage collection** to `changedFiles` / companion tests only (same as §3.1).

5. **CA/CR criteria** — if there is an active change, read the specification in `refacil-sdd/changes/<changeName>/`:
   - `specs.md` if it exists, and/or files under `specs/` (recursively).
   - Extract the list of CA-XX (acceptance criteria) and CR-XX (rejection criteria) with their descriptions.
   - If there are no specs or the scope is `git-diff`, omit this field.

Build the BRIEFING block:

```
BRIEFING:
changeName: <name or null if scope=git-diff>
testCommand: <exact command line the validator must run — scoped by default>
testScope: scoped | full
runCoverage: true | false
coverageCommand: <project coverage entrypoint or null>
criteria:
  acceptance:
    - CA-01: <description>
    - CA-02: <description>
  rejection:
    - CR-01: <description>
changedFiles: [path/file-1, ...]
mode: concise | detailed
commandsRun: [<command>, ...]          # from memory.yaml — omit if not present
criteriaRun: [CA-01, CR-01, ...]       # from memory.yaml — omit if not present
```

### Step 2: Delegate to the refacil-validator sub-agent

Invoke `refacil-validator` passing it the BRIEFING from the previous step.

The sub-agent:
- Uses `testCommand` from the briefing directly (without looking it up in METHODOLOGY-CONTRACT.md).
- Applies **§3.1**: `testScope` and `runCoverage` from the briefing (defaults scoped + scoped coverage).
- Uses `criteria` from the briefing for verification (without re-reading specs from scratch).
- Uses `changedFiles` to focus the 3D verification on those files.
- Applies the 3D framework (Completeness/Correctness/Coherence) directly.
- Runs tests then coverage per briefing (`runCoverage: true` by default → **narrowed** coverage unless `testScope: full`).
- Optionally consults the bus cross-repo for ambiguities.
- Returns combined report + JSON block fenced as ` ```refacil-verify-result `.

### Step 3: Present the report

Show the user the **combined report** (everything before the `refacil-verify-result` block). Do not show the JSON block — it is internal metadata.

**If the sub-agent failed to load** (tool error, agent type not found, or no response at all): stop immediately and do NOT escalate to any other agent:
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

```
RESULT: APPROVED

The next step is the quality review with the team checklist.
Do you want me to continue with `/refacil:review`?
```

#### If `result` is REQUIRES_CORRECTIONS:

Present the issues and ask:

```
RESULT: REQUIRES_CORRECTIONS

Required corrections:
1. [CRITICAL/WARNING] [description] — [suggested fix]
2. ...

Do you want me to apply these corrections? (yes/no)
- Yes: I will apply the fixes and automatically re-verify
- No: you can fix them manually and then continue with /refacil:verify
```

### Step 5: Apply corrections (if the user accepts)

**Only apply fixes after explicit user approval.**

1. Apply ONLY the listed corrections — do not add new functionality, do not refactor unrelated code.
2. If there are tests that need adjustment, adjust them as well.
3. Show summary of modified files.
4. **Automatically re-run from Step 2** (re-invoke the sub-agent with the same briefing) to confirm the corrections resolved the issues.
5. Maximum **2 rounds** of automatic correction. If issues persist, list them for manual correction.

**If the user does not accept:** list the issues for manual correction. Suggest `/refacil:verify` again.

## Rules

- **Always build the briefing (Step 1) before delegating** — reduces the sub-agent tool calls.
- **Defaults**: `testScope: scoped`, `runCoverage: true` (change-only coverage). **`testScope: full`** or **no coverage** only when Step 0 tokens say so.
- **Always delegate to the sub-agent** for the analysis. Do not replicate spec reading or test execution logic here.
- **Dotfiles in `refacil-sdd/changes/`**: never assert absence of `.review-passed` without `-a`; see §8.
- **Corrections are ONLY applied by this wrapper** (Step 5), after explicit approval.
- **Corrections must be surgical**: only what is necessary to resolve the reported issues.
- Maximum 2 rounds of automatic correction before escalating to manual.
- **Sub-agent failsafe (CA-01)**: if the validator fails to load (tool error) or returns no response — stop and inform the user. Do NOT escalate to any other agent.
- **Unstructured output (CA-02)**: if the validator responds but without a `refacil-verify-result` block — show the raw report and stop. Do NOT re-invoke another agent.
- **SCOPE_ERROR (CR-03)**: if the validator returns `SCOPE_ERROR: <reason>` — propagate and ask for clarification. CA-01 does NOT apply here.
- **Agent missing (CA-12)**: checked in Step 0.6 — stop before delegating if `.claude/agents/refacil-validator.md` is absent.
- **Flow continuity**: if the result is APPROVED and the user confirms affirmatively, immediately invoke the **Skill tool** with `skill: "refacil:review"`. (See `METHODOLOGY-CONTRACT.md §5`.)
