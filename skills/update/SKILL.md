---
name: refacil:update
description: Detect and apply pending migrations of the SDD-AI methodology to the current project
user-invocable: true
---

# refacil:update — Methodology Migrations

Detects the current repo state and applies only what is pending. Does not repeat full setup (hooks/skills install, `/refacil:setup` steps).

The `notify-update` hook uses the **same engine** as this command; do not manually re-evaluate the repo to decide if there is work to do.

## Step 1: Validate with the CLI (mandatory)

In the **repo root** (where `AGENTS.md` or `.claude/` is), run with `Bash`:

```bash
refacil-sdd-ai migration-pending
```

- **Exit code 0**: no pending methodology migrations → inform the user that everything is up to date regarding this criterion and **finish** (without touching files).
- **Exit code 1**: at least one reason listed in stdout → continue to Step 2.

Optional for stable parsing: `refacil-sdd-ai migration-pending --json` → object `{ "pending": bool, "reasons": string[] }`.

Do not substitute this step with manual tree inspection unless the command fails (environment error); in that case document the error and ask to retry.

### Reference (reason → action mapping in Step 3)

The implementation lives in `lib/methodology-migration-pending.js` of the package; the table summarizes what it detects:

| # | Condition (summary) | Migration in Step 3 |
|---|---|---|
| 1 | `AGENTS.md` exists and `.agents/` folder does not | Restructure into `.agents/` + rewrite as index |
| 2 | `CLAUDE.md` has more than 5 lines or does not point to `AGENTS.md` | Replace with minimal index |
| 3 | `.cursorrules` has more than 5 lines or does not point to `AGENTS.md` | Replace with minimal index |

## Step 2: Confirm with the user

Show the user the same lines printed by `migration-pending` (or the `reasons` array from the JSON) and ask for confirmation before applying any changes.

## Step 3: Apply confirmed migrations

Run only the migrations that correspond to the detected reasons (see reference table above).

### Migration 1 — AGENTS.md → `.agents/` + index

1. Read the full content of `AGENTS.md`.
2. Identify and separate content that must NOT move to `.agents/`:
   - `compact-guidance` block: between `<!-- refacil-sdd-ai:compact-guidance:start -->` and `<!-- refacil-sdd-ai:compact-guidance:end -->`
   - Bus presentation block: between `<!-- refacil-bus:presentation:start -->` and `<!-- refacil-bus:presentation:end -->`
   - Section `## SDD-AI Methodology`: table of `refacil:*` commands — always stays in `AGENTS.md`. If it exists, overwrite it with the updated table (see Step 6.2 of `refacil:setup`); if not, create it.
3. Create the `.agents/` folder.
4. Distribute the project content (everything except managed blocks) into files by area. Rules:
   - **`.agents/summary.md` is always mandatory** — project description, mini stack table, essential scripts, critical rules condensed. If the original AGENTS.md does not have a clear summary, synthesize it from the available content.
   - Other files are created **only if there is relevant content to redistribute**. Do not create empty files:
     - `.agents/architecture.md` — modules, services, main flows, key patterns.
     - `.agents/stack.md` — dependencies, environment variables, databases, integrations.
     - `.agents/testing.md` — testing strategy, commands, conventions, fixtures.
     - `.agents/commands.md` — development commands, aliases, CI/CD scripts.
   - Adapt to the project type: a monorepo may need `.agents/services.md`; a simple library may combine testing and stack in one file. Use the same criterion as `/refacil:setup`.
5. Rewrite `AGENTS.md` as a pure index in this order:
   - First line: brief project description.
   - For each file in `.agents/`: area name + relative link + when to read it (one sentence).
   - Section `## SDD-AI Methodology` with the updated `refacil:*` command table (see Step 6.2 of `refacil:setup` for the exact content).
   - Managed blocks that already existed (compact-guidance, bus presentation) at the end, intact.
   - If they did not exist, the compact-guidance block will be re-injected automatically at the next SessionStart.

### Migration 2 and 3 — CLAUDE.md / .cursorrules → minimal index

Overwrite with exactly this content:

**CLAUDE.md:**
```
# CLAUDE.md

Full project context: see `AGENTS.md`.
If it does not exist, run `/refacil:setup`.
```

**`.cursorrules`:**
```
# Cursor Rules

Full project context: see `AGENTS.md`.
If it does not exist, run `/refacil:setup`.
```

## Step 4: Clear the pending update flag

After migrating, delete the flag in the repo root if it still exists:

```bash
rm -f .refacil-pending-update
```

If there were no changes (Step 1 gave exit 0), the obsolete flag usually clears itself at the next `check-update` (SessionStart) or when running `refacil-sdd-ai migration-pending` with exit 0; the manual `rm` is only needed if you applied migrations manually or there is a leftover.

## Step 5: Summary

Report which files were created or modified. Mention that the `compact-guidance` block will be synced automatically at the next SessionStart.

## Rules

- **Detection**: trust `refacil-sdd-ai migration-pending` (same criterion as `check-update` / `notify-update`).
- Only apply what is pending — do not touch files that already meet the pattern.
- Do not invent content: distribute what already exists in AGENTS.md without adding or removing information.
- Does not re-run `refacil-sdd-ai init`, package hooks installation, or `/refacil:setup`-style scaffolding.
- Extensible: new detection rules are added in the package (`methodology-migration-pending.js`); this skill updates the reference table and application steps when the contract changes.
