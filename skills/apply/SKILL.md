---
name: refacil:apply
description: Implement the tasks of a proposed change — verifies artifacts and working branch, builds a structured briefing, and delegates to the refacil-implementer sub-agent to execute the implementation in isolated context
user-invocable: true
---

# refacil:apply — Implementation Entrypoint

This skill is a **wrapper** that verifies the critical preconditions (SDD artifacts and working branch), builds a **structured briefing** with the key context already extracted, and delegates the implementation to the `refacil-implementer` sub-agent. The briefing prevents the sub-agent from rediscovering from scratch — it starts implementing, not exploring.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0: Verify SDD artifacts exist (blocking)

Run `refacil-sdd-ai sdd list --json` to get the active changes.

- **If there are no active changes**: inform to run `/refacil:propose` and **stop**.
- **If there is a single active change**: use that `changeName`.
- **If there are multiple active changes**: list the names and ask which one to implement. Do not invoke the sub-agent with ambiguous scope.

With the selected `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` and parse the JSON:

```json
{
  "name": "...",
  "artifacts": { "proposal": bool, "design": bool, "tasks": bool, "specs": bool },
  "tasks": { "total": N, "done": N, "pending": N },
  "reviewPassed": bool,
  "ready": { "forApply": bool, "forArchive": bool }
}
```

Validations:
- If `artifacts.proposal` is `false` or `artifacts.tasks` is `false` or `artifacts.specs` is `false`:
  ```
  The change at refacil-sdd/changes/[name]/ is incomplete.
  Missing: [list of artifacts with false]
  Run: /refacil:propose to complete the artifacts before implementing.
  ```
  **Stop.**
- If `ready.forApply` is `false` for the same reason: same message above.

Note: `specs` is `true` if `specs.md` exists in the root **OR** at least one `.md` under the change's `specs/` folder.

**IMPORTANT**: This command NEVER generates SDD artifacts. If they do not exist, the user must use `/refacil:propose`.

### Step 1: Validate working branch (blocking — before delegating)

Run `git branch --show-current` to get the current branch.

If the current branch is already a working branch (`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, etc.), continue without interruption to Step 1.5.

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
5. Compose the branch name with `feature/` prefix:
   - Feature: `feature/<ID>` (e.g. `feature/SEGINF-20`)
   - Without ID: propose a short descriptive name (e.g. `feature/add-configurable-branches`)
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

### Step 1.5: Build structured briefing (reduces sub-agent tool calls)

Before invoking the sub-agent, extract the key context by reading the artifacts. This prevents the sub-agent from rediscovering them from scratch.

1. **Objective** — read the first section of `refacil-sdd/changes/<changeName>/proposal.md`. Extract the objective in 1-2 sentences.
2. **File scope** — read `refacil-sdd/changes/<changeName>/design.md`. Extract:
   - List of files to **create** (full paths)
   - List of files to **modify** (full paths)
3. **Tasks** — read `refacil-sdd/changes/<changeName>/tasks.md`. Extract the full numbered list.
4. **Test command** — read `refacil-prereqs/METHODOLOGY-CONTRACT.md` §3. Extract the exact command.
5. **Architecture context** — read `.agents/stack.md` if it exists; if not, `.agents/architecture.md`; if neither exists, read only the first 60 lines of `AGENTS.md`. **Do not read the entire `.agents/` folder**.

Build the BRIEFING block that you will include literally in the delegation prompt:

```
BRIEFING:
changeName: <name>
objective: <objective in 1-2 sentences from the proposal>
scope:
  create: [path/new-file-1.ts, path/new-file-2.ts, ...]
  modify: [path/existing-1.ts, path/existing-2.ts, ...]
  doNotTouch: [refacil-sdd/, .claude/, .cursor/, AGENTS.md, package-lock.json]
tasks:
  1. <task 1>
  2. <task 2>
  ...
testCommand: <exact command>
architectureContext: |
  <extract from stack.md or first lines of AGENTS.md>
specsNote: <"specs.md" | "specs/**/*.md" | "both — report contradictions in issues">
```

### Step 2: Delegate to the refacil-implementer sub-agent

Invoke the `refacil-implementer` sub-agent passing it the BRIEFING from the previous step plus:
- `changeName` (redundant with the briefing, but the guardrail needs it)
- If the user requested detailed mode, indicate it. Default: concise.

The sub-agent will use the briefing as the primary guide and will only read the files in `scope.modify` to understand existing interfaces — it will not re-read the already-extracted artifacts.

Returns ONE single message with the report + JSON block fenced as ` ```refacil-apply-result `.

### Step 2.5: Save cross-skill memory (memory.yaml)

After parsing the `refacil-apply-result` block and only if `result` is not `"FAILED"`:
- Extract `touchedFiles` from the result (list of files actually created/modified by the implementer).

Run:
```bash
refacil-sdd-ai sdd set-memory <changeName> \
  --last-step apply \
  --touched-files "<comma-separated list of modified files>"
```

This command merges into memory.yaml at the repo root using `findProjectRoot()` — no manual path construction needed.

If `result` is `"FAILED"`, skip and wait for user instructions.

### Step 3: Present result and next step

Show the user the **report** (everything before the `refacil-apply-result` block). Do not show the JSON block — it is internal metadata.

After the report add:

```
The next step is to generate/adjust unit tests.
Do you want me to continue with /refacil:test?
(The flow then continues with /refacil:verify)
```

If the sub-agent returned `result: "PARTIAL"` or `"FAILED"`, present the `issues` to the user and ask for instructions before continuing.

## Rules

- NEVER generate SDD artifacts from this command — that is exclusively `/refacil:propose`'s responsibility.
- Meet the preconditions of Step 0 (complete artifacts) and Step 1 (valid working branch) **before delegating**.
- **Always build the briefing (Step 1.5) before delegating** — it is the key piece that reduces the sub-agent cost.
- **Always delegate implementation to the sub-agent**. Do not replicate implementation logic or SDD artifact-apply logic here.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 3, immediately invoke the **Skill tool** with `skill: "refacil:test"`. Do not describe it in text or wait for the user to type `/refacil:test`. (See `METHODOLOGY-CONTRACT.md §5`.)
