---
name: refacil:bug
description: Guided complete flow to investigate and fix bugs — delegates investigation and fix to the refacil-debugger sub-agent in two passes separated by user confirmation
user-invocable: true
---

# refacil:bug — Bug Fix Entrypoint

This skill is a **wrapper** that guides the user through the bug fix flow and delegates the heavy work to the `refacil-debugger` sub-agent. The sub-agent operates in two modes: `investigation` (analyzes and proposes hypotheses without modifying anything) and `fix` (implements the approved correction, generates tests, and creates traceability). Hypothesis confirmation and branch validation occur in this wrapper, between the two invocations.

The investigation stage follows a **diagnose loop** to reduce weak fixes:
1) reproduce, 2) minimize scope, 3) form evidence-backed hypotheses, 4) validate evidence, 5) propose minimal correction.

**Prerequisites**: `agents` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0: Verify traceability prerequisite

1. Verify that the `refacil-sdd/` folder exists in the repo root.
2. If it does NOT exist, stop the flow and show:
   ```
   This bugfix flow requires the SDD-AI methodology initialized to save traceability.
   Run /refacil:setup and re-run /refacil:bug.
   ```
3. If it exists, continue to Step 1.

### Step 1: Describe the bug

If `$ARGUMENTS` does not bring enough information, ask the user:
- Current vs. expected behavior.
- Reproduction steps.
- Available evidence (logs, stack traces).
- When it started occurring.
- Severity (Critical/High/Medium/Low).

If `$ARGUMENTS` is already clear, do not ask again.

### Step 1.5: CodeGraph availability check

Run `refacil-sdd-ai codegraph status --json` and set `codegraphAvailable`:
- `true` if `installed === true` AND `initialized === true`
- `false` otherwise

**If `mode` is `enabled` or `per-repo` but `codegraphAvailable` is `false`**:

---

**[GATE — STOP AND WAIT: CodeGraph not indexed]**

Do NOT proceed to Step 2. Do NOT delegate to the sub-agent. STOP and ask the user exactly this, then wait for their reply:

```
CodeGraph is enabled but not indexed for this repo (~30s to build).
Bug investigation traces call graphs — CodeGraph makes it significantly more accurate.

Do you want me to run /refacil:update first to build the index?
  yes → run /refacil:update then continue with the investigation
  no  → continue with standard investigation now
```

Only after the user replies:
- **"yes"** (or "si", "dale", "sí", "go", "ok"): immediately execute `/refacil:update`.
- **"no"** (or "skip", "continue", "continúa"): set `codegraphAvailable: false` and continue.

---

### Step 2: Delegate investigation to the refacil-debugger sub-agent (mode: investigation)

Invoke the `refacil-debugger` sub-agent passing it:
- `mode: investigation`
- `description`: complete bug description (collected in Step 1 or from `$ARGUMENTS`).
- `codegraphAvailable: true | false` (from Step 1.5).

The sub-agent:
- Reproduces and minimizes the failure scope first.
- Searches the codebase for symbols/files from logs or stack traces.
- Traces the flow from entry to the failure point.
- Validates hypotheses with explicit evidence.
- Reviews recent commits if the bug is new.
- Returns hypotheses ordered by confidence + proposed correction, fenced as ` ```refacil-debug-investigation `.

After investigation completes, log telemetry silently:

```bash
refacil-sdd-ai compact log-codegraph-event --skill debugger --has-graph <true|false> --tool-calls <N> --tokens <N>
```

Same estimation criteria as `explore/SKILL.md` Step 1.5. Repeat after re-investigations when applicable.

### Step 3: Confirm hypothesis with the user

Show the user the hypotheses and the proposed correction. Ask explicitly:

```
Most confident hypothesis: [description — file:line]
Evidence used: [repro step / observed condition / validation result]
Proposed fix: [minimal description]
Files to modify: [list]

Do you confirm this hypothesis? (yes/no/other hypothesis N)
Do you approve applying the fix? (yes/no)
```

**Do NOT implement anything until you have explicit user approval.**

According to the user's response:

- **"yes" / approval**: proceed to Step 4 with hypothesis #1 as the confirmed `hypothesis`.
- **"other hypothesis N"** (e.g. "hypothesis 2"): use that hypothesis as the confirmed `hypothesis` for Step 5. The proposed correction may differ — summarize the fix for that alternative hypothesis to the user and ask for confirmation that they approve applying it before continuing.
- **"no" / rejection without alternative**: offer the user two options:
  1. **Re-investigate** — return to Step 2 with an enriched description (ask the user to provide more context: additional logs, reproduction steps, when it started). The `refacil-debugger` sub-agent is invoked again in `mode: investigation` with the updated description.
  2. **Cancel** — close the flow without modifying anything.
  Do not continue until the user chooses an option.

If the sub-agent reported `crossRepo: true` in any hypothesis: before implementing, apply the protocol from `refacil-prereqs/BUS-CROSS-REPO.md` to verify with the other repo's agent via the bus. Use the response to confirm whether the fix goes in this repo, the other, or both.

### Step 4: Validate working branch (before implementing)

1. Run `git branch --show-current` → `currentBranch`.
2. Run `refacil-sdd-ai sdd config --json` and parse `protectedBranches` and `baseBranch`.
   - If the command fails or exits non-zero, fall back to:
     - `protectedBranches` = [master, main]
     - `baseBranch` = main (or master if main does not exist in the repo)

**Decision (apply before any gate):**

- If `currentBranch` is **not** listed in `protectedBranches` → you are already on a writable branch. Continue without interruption to **Step 5**. Do **not** ask for a task ID. Do **not** create another branch.
- If `currentBranch` **is** listed in `protectedBranches` → **read `METHODOLOGY-CONTRACT.md §4 — Protected branch policy`** before acting, then execute the 3-gate protocol defined there strictly. Each gate is a hard stop — do not proceed to the next gate until the user has replied.

**See `METHODOLOGY-CONTRACT.md §4 — Protected branch policy`** for the complete GATE 1 / GATE 2 / GATE 3 protocol.

Apply-specific annotation: use `fix/<ID>` as the branch prefix (e.g. `fix/SEGINF-20`, `fix/session-timeout-redis`).

### Step 5: Delegate implementation to the refacil-debugger sub-agent (mode: fix)

**Test execution for fix mode is ALWAYS scoped** (`METHODOLOGY-CONTRACT.md §3.1` rule 0). `/refacil:bug` does not pass through `/refacil:test`, so the debugger validates the fix with its own regression tests + touched files — **never the full suite**. If the user explicitly asks for whole-repo regression (`full`, `suite completa`, …), do **not** widen this phase: tell them to run `/refacil:test … full` or rely on CI after the fix.

Invoke the `refacil-debugger` sub-agent passing it:
- `mode: fix`
- `description`: complete bug description.
- `hypothesis`: root cause confirmed by the user in Step 3.

The sub-agent:
- Implements the minimal and focused fix.
- Generates regression tests (reproduces the bug + verifies the fix + normal-path assertions where warranted).
- Creates `refacil-sdd/changes/fix-<name>/summary.md` with traceability. This `fix-*` folder is the approved operational exception to the regular proposal artifacts: it does not need `proposal.md`, `design.md`, `tasks.md`, or `specs.md` to be archived later, but it must include a substantive `summary.md`, regression test evidence from the debugger run, and an approved review before archive.
- Runs a **scoped `testCommand`** derived via `sdd test-scope --no-baseline-fallback` (`METHODOLOGY-CONTRACT.md §3.1` rule 0). On fallback it runs only touched test files, else SKIPs — **never** the full baseline.
- Returns the report fenced as ` ```refacil-debug-fix `.

### Step 6: Present result and next step

Show the user the **report** (everything before the `refacil-debug-fix` block). Do not show the JSON block — it is internal metadata.

Add at the end:

```
The next step is the fix review (mandatory before archiving).
Do you want me to continue with /refacil:review?
(The flow then continues with /refacil:archive and /refacil:up-code)
```

If the sub-agent returned `result: "FAILED"` (tests not passing), present the failing test details and offer the user:
1. **Retry** — the `refacil-debugger` sub-agent is invoked again in `mode: fix` with the same hypothesis plus the test failure context.
2. **Cancel** — close the flow without archiving. The modified files remain in the branch for manual review.

## Rules

- **Always investigate before proposing** — do not delegate the fix without a confirmed hypothesis.
- In investigation, prefer the diagnose loop order: reproduce → minimize → hypothesize → validate evidence → propose fix.
- **NEVER implement without explicit user approval** (Step 3).
- **Always validate the branch** (Step 4) before delegating the fix.
- **Do not replicate investigation or implementation logic here** — that lives in `refacil-debugger`.
- **`fix-*` archive exception**: do not route bug fixes through `/refacil:propose` merely to satisfy regular readiness. `fix-*` changes are valid for archive with `summary.md`, regression tests, and `.review-passed`; `/refacil:archive` documents the fix into `refacil-sdd/specs/` instead of requiring proposal artifacts.
- Bugfix implementation output is English-only: source/test file names, identifiers, test descriptions, and code comments, regardless of the language used in user-facing text or SDD artifacts.
- Step 3 (bus cross-repo) is **optional** — only applies if the sub-agent reported `crossRepo: true`.
- **CodeGraph gate (Step 1.5)**: if `mode` is `enabled`/`per-repo` and `codegraphAvailable` is `false`, the GATE is **mandatory** — never skip it. If the user replies affirmatively ("yes", "si", "sí", "dale", "ok", "go"), immediately execute `/refacil:update` without any prior text. Do not describe it. Do not ask again. (See `METHODOLOGY-CONTRACT.md §5`.)
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 6, immediately execute `/refacil:review`. Do not describe it in text or wait for the user to type it. (See `METHODOLOGY-CONTRACT.md §5`.)
