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

### Step 2: Delegate investigation to the refacil-debugger sub-agent (mode: investigation)

Invoke the `refacil-debugger` sub-agent passing it:
- `mode: investigation`
- `description`: complete bug description (collected in Step 1 or from `$ARGUMENTS`).

The sub-agent:
- Reproduces and minimizes the failure scope first.
- Searches the codebase for symbols/files from logs or stack traces.
- Traces the flow from entry to the failure point.
- Validates hypotheses with explicit evidence.
- Reviews recent commits if the bug is new.
- Returns hypotheses ordered by confidence + proposed correction, fenced as ` ```refacil-debug-investigation `.

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

Run `git branch --show-current` to get the current branch.

If the current branch is already a working branch (`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, etc.), continue without interruption to Step 5.

If the current branch is protected, execute the 3-gate protocol below strictly. Each gate is a hard stop — do not proceed to the next gate until the user has replied.

---

**[GATE 1 — STOP AND WAIT: ask for task identifier]**

Ask the user exactly this question and then STOP. Do NOT run any git command. Do NOT propose a branch name. Do NOT continue to Gate 2 until the user replies:

> "What is the task number or identifier for this branch? (e.g. SEGINF-20, REF-123, or a short descriptive name)"

If the user says they have no ID, note that and proceed to Gate 2 with `<ID> = none`.

---

**[GATE 2 — STOP AND WAIT: propose branch name and ask for approval]**

Only after receiving the user's reply to Gate 1:

1. Verify clean working directory (`git status --porcelain`).
2. If there are uncommitted changes, ask for approval to stash them (`git stash push -m "auto-stash-refacil"`). Do NOT stash without approval.
3. Detect the effective configuration by running:
   ```
   refacil-sdd-ai sdd config --json
   ```
   Parse `baseBranch` and `protectedBranches` from the JSON output.
   If the command fails or exits non-zero, fall back to:
   - `protectedBranches` = [master, main]
   - `baseBranch` = main (or master if main does not exist in the repo)
4. Determine the base branch:
   - Use the `baseBranch` value from the config (or the fallback).
   - Only if that branch does not exist in the repo (new repo), use `main` or `master` as a temporary exception and recommend adopting the standard flow.
5. Compose the branch name with `fix/` prefix:
   - Bugfix: `fix/<ID>` (e.g. `fix/SEGINF-20`)
   - Without ID: propose a short descriptive name (e.g. `fix/session-timeout-redis`)
6. Present the proposed name and ask for approval. Then STOP. Do NOT run `git checkout` or `git switch`. Do NOT create the branch yet. Wait for the user's explicit confirmation:

> "I'll create branch `<proposed-name>` from `<base-branch>`. Shall I proceed?"

---

**[GATE 3 — execute only after explicit approval from Gate 2]**

Only after the user explicitly confirms (e.g. "yes", "go", "ok", "proceed"):

1. Switch to the base branch and update it (`git checkout <base>` + `git pull origin <base>`).
2. Create the working branch (`git checkout -b <branch-name>`).
3. If a stash was approved in Gate 2, restore it (`git stash pop`).

If the user does not approve at Gate 2, stop entirely. Do not create any branch. Do not continue with implementation.

---

### Step 5: Delegate implementation to the refacil-debugger sub-agent (mode: fix)

**`testScope` for fix mode** — default **`scoped`**. Parse `$ARGUMENTS` **and** the user message invoking this skill for whole-repo regression (same tokens as apply: **`full`**, **`all tests`**, **`whole suite`**, **`suite completa`**). Pass **`testScope: full`** only when explicitly requested.

Invoke the `refacil-debugger` sub-agent passing it:
- `mode: fix`
- `description`: complete bug description.
- `hypothesis`: root cause confirmed by the user in Step 3.
- `testScope`: `scoped` \| `full` — from the rule above (default **`scoped`**).

The sub-agent:
- Implements the minimal and focused fix.
- Generates regression tests (reproduces the bug + verifies the fix + normal-path assertions where warranted).
- Creates `refacil-sdd/changes/fix-<name>/summary.md` with traceability.
- Runs **`testCommand`** per **`METHODOLOGY-CONTRACT.md §3.1`** (narrowed when `scoped`; full baseline only when `full` or narrow fallback warns).
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
- Bugfix implementation output is English-only: source/test file names, identifiers, test descriptions, and code comments, regardless of the language used in user-facing text or SDD artifacts.
- Step 3 (bus cross-repo) is **optional** — only applies if the sub-agent reported `crossRepo: true`.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 6, immediately invoke the **Skill tool** with `skill: "refacil:review"`. Do not describe it in text or wait for the user to type `/refacil:review`. (See `METHODOLOGY-CONTRACT.md §5`.)
