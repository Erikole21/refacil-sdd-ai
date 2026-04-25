---
name: refacil:review
description: Code review with the team quality checklist — builds a briefing with changed files and project type, delegates to the refacil-auditor sub-agent, and processes the verdict
user-invocable: true
---

# refacil:review — Review Entrypoint

This skill is a **thin wrapper** that delegates the heavy review to the `refacil-auditor` sub-agent. Before delegating, it builds a **structured briefing** with the changed files and detected project type — the sub-agent starts evaluating, not discovering.

**Prerequisites**: `agents` profile from `refacil-prereqs/SKILL.md` + output mode from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0: Resolve scope

- Determine the review scope BEFORE invoking the sub-agent. Prioritize in this order:
  1) User argument (`$ARGUMENTS`)
  2) Active change in `refacil-sdd/changes/`
  3) Uncommitted changes (`git diff`)
- If there are multiple active changes in `refacil-sdd/changes/` and no `$ARGUMENTS`, **stop** and ask the user to explicitly select which change to review. **Do not invoke the sub-agent with ambiguous scope.**

### Step 0.3: Git working tree snapshot (run once)

After scope is unambiguous (you are **not** stopping for multiple active changes), collect git state **exactly once** for this skill invocation:

1. Run `git diff --name-only HEAD` → set `pathsFromDiff`.
2. Run `git status --porcelain` → parse each line (strip the first two status columns) → set `pathsFromStatus`.
3. **`changedFilesUnion`** = sorted unique union of `pathsFromDiff` and `pathsFromStatus` (drop empty entries).

**Rules:**
- Reuse **`changedFilesUnion`** and the **same** `git status --porcelain` interpretation everywhere below — **do not** run `git diff --name-only` or `git status --porcelain` again in this skill.
- If a later step needs “is the working tree non-empty?”, derive it from the snapshot (e.g. non-empty `changedFilesUnion` or any porcelain line) instead of re-running `git status`.

If you already have a `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` to get the change status (artifacts, tasks, reviewPassed).

**Review already approved**: If `reviewPassed` is `true` in the status JSON (or if the target change already has `.review-passed`), verify if there are changes after the review (marker existence: **`METHODOLOGY-CONTRACT.md` §8**):
1. Read the `date` from `.review-passed`.
2. Compare with `git log --since="[date]" --oneline` and **reuse the Step 0.3 snapshot** for working-tree activity (do not run `git status` again).
3. **If there are new changes** (commits since marker date and/or paths in `changedFilesUnion`): delete the previous `.review-passed` and continue (build briefing and invoke the sub-agent).
4. **If there are NO new changes**: inform the user and finish without invoking the sub-agent:
   ```
   The change [name] already has an approved review ([verdict] — [date]) and there are no subsequent changes.
   ```

### Step 0.4: Incremental scope (CA-07 — only if re-running after REQUIERE CORRECCIONES)

If `changeName` is not null, check whether `refacil-sdd/changes/<changeName>/.review-last-fails.json` exists (read by explicit path — it is NOT a dotfile but may be hidden in listings):

- **If the file EXISTS**: read `failedFiles` from it. Compute:
  `incrementalScope = failedFiles ∪ changedFilesUnion`
  - If `incrementalScope` is empty (CR-02): fall back to `changedFilesUnion` and add a comment in the briefing: `"# warning: incremental scope was empty — using full changedFilesUnion"`.
  - Use `incrementalScope` as `changedFiles` in the briefing (Step 0.5), instead of the full `changedFilesUnion`.
- **If the file does NOT exist**: use `changedFilesUnion` as `changedFiles` normally.

### Step 0.5: Build briefing for the sub-agent (reduces auditor tool calls)

Before invoking the sub-agent, extract the context that the auditor would otherwise calculate on its own:

1. **Changed files** — use the scope resolved in Step 0.4 (`incrementalScope` if available, otherwise `changedFilesUnion`). Do not run `git diff` or `git status` again.

2. **Project type** — read `package.json` (if it exists) and inspect the dependencies:
   - Backend indicators: `@nestjs/*`, `express`, `fastify`, `koa`, `typeorm`, `prisma`, `pg`, `mongoose`, `bullmq`, `amqplib`
   - Frontend indicators: `react`, `vue`, `angular`, `next`, `nuxt`, `svelte`, `vite`, `@tanstack/*`
   - If both → `fullstack`; if only backend → `backend`; if only frontend → `frontend`; if no `package.json` or none applies → read the first 20 lines of `AGENTS.md` to infer.

3. **Change objective** (only if there is an active change in `refacil-sdd/changes/`) — read the first section of `proposal.md`. Extract the objective in 1-2 sentences. If the scope is `git-diff` without an active change → `null`.

4. **Cross-skill memory** — run `refacil-sdd-ai sdd get-memory <changeName> --json` and parse the JSON to extract `stackDetected` and `touchedFiles`. Include them in the briefing so the auditor skips re-discovery. If the command outputs `{}` or fails, omit — do not block (CR-04).

5. **Mode** — default `concise`. If re-running after a prior `REQUIERE CORRECCIONES` (i.e., `.review-last-fails.json` was found with non-empty `failedFiles` in Step 0.4): set `mode: focused` — the auditor re-evaluates only the failing checklist items on the `failedFiles` (CR-05: focused mode still reads those files). Otherwise keep `concise`.

Build the BRIEFING block:

```
BRIEFING:
scope: <changeName | "git-diff">
changedFiles: [path/file-1.ts, path/file-2.ts, ...]
projectType: backend | frontend | fullstack | library
changeObjective: <objective in 1-2 sentences, or null>
mode: concise | detailed | focused
stackDetected: <from memory.yaml, or omit>
touchedFiles: [...]                   # from memory.yaml — omit if not present
```

### Step 1: Delegate to the refacil-auditor sub-agent

Invoke the `refacil-auditor` sub-agent passing it the BRIEFING from the previous step.

The sub-agent:
- Uses `changedFiles` from the briefing as the blocking scope (without re-running git diff).
- Uses `projectType` to directly load the correct checklists (without a detection phase).
- Uses `changeObjective` as intent context (without re-reading proposal.md).
- Reads the checklists and the blocking scope files.
- Evaluates each item with PASS/FAIL/N/A + severity for each FAIL.
- Returns ONE single message with the report + JSON block fenced as ` ```refacil-review-result `.

### Step 2: Process the sub-agent report

Show the user the **concise report** (everything before the `refacil-review-result` block). Do not show the JSON block — it is internal metadata.

**If the sub-agent returned `SCOPE_ERROR: <reason>`**: propagate the error to the user and ask for clarification. Do not write a marker.

### Step 2.5: Persist or clean incremental-scope state (CA-06/CA-08/CA-09/CR-01)

Parse the `refacil-review-result` block from the sub-agent.

**If `verdict` is `REQUIERE CORRECCIONES`**:
- Only if `changeName` is not null (CR-01) AND the block includes a `failedFiles` field (CA-09 backward compat):
  - Run: `refacil-sdd-ai sdd set-review-fails <changeName> --files "<comma-separated failedFiles>"`
- If `changeName` is null or `failedFiles` is absent: skip silently.

**If `verdict` is `APROBADO` or `APROBADO CON OBSERVACIONES`**:
- Run: `refacil-sdd-ai sdd clear-review-fails <changeName>`

### Step 3: Create `.review-passed` marker (if applicable)

Parse the ` ```refacil-review-result ` block from the sub-agent. If `verdict` is **APROBADO** or **APROBADO CON OBSERVACIONES** and `changeName` is not null:

Run the following command to write the marker:

```bash
refacil-sdd-ai sdd mark-reviewed <changeName> \
  --verdict "<verdict>" \
  --summary "<1-line summary>" \
  --fail-count <failCount> \
  --preexisting-count <preexistingCount>
```

Where the values are extracted from the sub-agent's `refacil-review-result` block:
- `<verdict>`: the value of `verdict` (APROBADO, APROBADO CON OBSERVACIONES, etc.)
- `<summary>`: the value of `summary`
- `<failCount>`: FAILs in new code (default 0)
- `<preexistingCount>`: pre-existing non-blocking FAILs (default 0)

**Do NOT run the command if:**
- `verdict` is `REQUIERE CORRECCIONES`.
- `changeName` is null.
- The sub-agent returned `SCOPE_ERROR`.

### Step 3.5: Offer to apply corrections (only if REQUIERE CORRECCIONES)

If `verdict` is `REQUIERE CORRECCIONES`, after showing the report present a numbered list of the findings (blockers first, then medium/low) and ask:

```
X corrections are needed. Do you want me to apply them?
- "yes" / "all" — apply all
- "1, 3" (numbers) — apply only those items
- "no" / "skip" — you'll handle them manually
```

**According to the user's response:**
- **"yes" / "all"**: apply every correction using Edit/Write/Bash tools directly in this skill. After each correction, note it as applied.
- **"N, M" (specific items)**: apply only those numbered items.
- **"no" / "skip" / no answer**: do not apply anything — continue to Step 4.

After applying corrections (if any): summarize what was applied, then continue to Step 4.

### Step 4: Recommend next step

According to the parsed `verdict`, add at the end of your response:

**If APROBADO or APROBADO CON OBSERVACIONES:**
```
The next step is to archive the change.
Do you want me to continue with /refacil:archive?
```

**If REQUIERE CORRECCIONES** (after Step 3.5):
```
The next step is to re-verify the implementation.
Do you want me to continue with /refacil:verify?
```

## Rules

- **Always build the briefing (Step 0.5) before delegating** — it is the key piece that reduces the sub-agent cost.
- **Always delegate to the sub-agent**. Do not replicate checklist or evaluation logic here.
- **The marker is created by this skill, not the sub-agent**.
- If the sub-agent returned something out of format (no parseable JSON block and not `SCOPE_ERROR`), inform the user: "The reviewer returned an unstructured report — no marker was created. Review the report manually."
- **Flow continuity**:
  - If verdict is APROBADO/APROBADO CON OBSERVACIONES and user confirms → immediately invoke `skill: "refacil:archive"`.
  - If verdict is REQUIERE CORRECCIONES and user confirms verify (Step 4) → immediately invoke `skill: "refacil:verify"`.
  - Do not describe the skill in text or wait for the user to type the command. (See `METHODOLOGY-CONTRACT.md §5`.)
