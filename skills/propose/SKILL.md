---
name: refacil:propose
description: Create a complete change proposal — delegates codebase exploration and artifact generation to the refacil-proposer sub-agent, and handles mandatory human review of the artifacts
user-invocable: true
---

# refacil:propose — Change Proposal Entrypoint

This skill is a **wrapper** that prepares the scope, delegates SDD artifact generation to the `refacil-proposer` sub-agent, and handles the mandatory human review (Human-in-the-Loop). The sub-agent runs in an isolated context exploring the codebase and generating the artifacts; this wrapper presents them to the user for approval.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0.5: Duplicate exploration guard (CA-11)

Before gathering context or delegating, check the current session conversation for a prior complete exploration report with overlapping scope (same modules, files, or described topic):

- **If a prior complete exploration exists for the same or highly overlapping topic**: summarize the already-known context in 2-3 sentences and ask:
  ```
  I already explored [topic] earlier in this session. The key findings were: [summary].
  Do you want me to run a targeted follow-up, or proceed with the full exploration for this proposal?
  ```
  Wait for the user's answer. If they confirm "proceed", continue to Step 1 — do not re-invoke a full exploration automatically.
- **If there is no prior exploration** for this topic: continue to Step 1 without interruption.

### Step 1: Understand the change

If the user did NOT provide sufficient context in `$ARGUMENTS`, ask:
- **What type of change is it?** (new feature, improvement, refactor)
- **What is the problem or need?** (business context)
- **What is the objective?** (what it must achieve in one sentence)

If `$ARGUMENTS` is already clear, do not ask again.

### Step 1.5: Validate change name (blocking)

Before delegating to the sub-agent, agree on or derive the **final slug** of the change (kebab-case: `feat-...`, `expose-...`, `imp-...`, etc.) then validate it with the CLI:

Run `refacil-sdd-ai sdd validate-name <slug>`:
- If exit 0: the name is valid — continue.
- If exit 1: show the CLI's error message to the user and ask them to provide a corrected slug. Repeat until `sdd validate-name` exits 0.

Communicate the final agreed slug to the user before generating.

### Step 2: Delegate to the refacil-proposer sub-agent

Before delegating, resolve the artifact language:

Run `refacil-sdd-ai sdd config --json` and read the `artifactLanguage` field. If the command fails or the field is missing/unknown, use `english`.

Invoke the `refacil-proposer` sub-agent passing it:
- `changeName`: the valid slug agreed in Step 1.5.
- `description`: complete description of the change (from Step 1 or from `$ARGUMENTS`).
- `artifactLanguage`: the resolved language (e.g. `english` or `spanish`). Pass it explicitly so the sub-agent uses it immediately, before it reads AGENTS.md.

The sub-agent:
- Explores the codebase (reads `AGENTS.md`, detects relevant files and conventions) before generating.
- Generates the artifacts under `refacil-sdd/changes/<changeName>/`: `proposal.md`, specification (`specs.md` and/or `specs/**/*.md`), `design.md`, `tasks.md`.
- If the change involves cross-repo contracts, notes it in `design.md`.
- Returns ONE single message with the summary + JSON block fenced as ` ```refacil-propose-result `.

If the change arises from a **bus room agreement** (`refacil-bus`), indicate it to the sub-agent in the description so it takes it into account when generating the artifacts. Do not shorten the methodology flow. See `refacil-prereqs/BUS-CROSS-REPO.md` (room agreements section).

### Step 3: Developer review (Human-in-the-Loop — MANDATORY)

Parse the `refacil-propose-result` block from the sub-agent to get the real artifact paths. Present a clear summary to the user for their review:

1. **Proposal**: objective, scope, and justification of the change.
2. **Specs**: acceptance and rejection criteria — list **real paths** received in the JSON block.
3. **Design**: files to create/modify and patterns to use.
4. **Tasks**: task list — verify the breakdown is correct and complete.

Ask explicitly:

```
=== Review required ===
The artifacts are ready for your review:
 - refacil-sdd/changes/[name]/proposal.md
 - [real spec paths]
 - refacil-sdd/changes/[name]/design.md
 - refacil-sdd/changes/[name]/tasks.md

Please review the artifacts and confirm:
 1. Are the acceptance criteria correct?
 2. Does the design align with the project architecture?
 3. Do the tasks cover the full scope?

Reply "OK" to continue, or indicate what adjustments you need.
```

**DO NOT continue to Step 4 until the user explicitly approves.**

If the user requests limited adjustments (change a criterion, fix a path, adjust a task), apply them directly to the corresponding files and present the summary again. If the adjustments are broad (changing the objective or the full scope), re-invoke the sub-agent with the updated description.

### Step 4: Next step

```
Proposal approved at: refacil-sdd/changes/[name]/
The next step is to implement the tasks.
Do you want me to continue with /refacil:apply?
```

## Rules

- **Change folder name**: always validate with `refacil-sdd-ai sdd validate-name <slug>` before delegating. Do not proceed if it exits 1.
- **Always delegate generation to the sub-agent**. Do not replicate the codebase exploration or artifact generation logic here.
- `artifactLanguage` affects **only SDD artifacts**. Any code snippets, file/folder names, identifiers, and technical comments that may appear during proposal work must stay in **English**.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 4, immediately invoke the **Skill tool** with `skill: "refacil:apply"`. Do not describe it in text or wait for the user to type `/refacil:apply`. (See `METHODOLOGY-CONTRACT.md §5`.)
