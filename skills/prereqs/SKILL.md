---
name: refacil:prereqs
description: Internal reference — SDD-AI prerequisites shared by all other refacil skills (do not invoke manually)
user-invocable: false
---

# SDD-AI Prerequisites

Identical methodology in Claude Code (`.claude/skills/refacil-*`) and Cursor (`.cursor/skills/refacil-*`). Use the path of the open IDE.

Cross-cutting rules (states, branches, tests, output): `METHODOLOGY-CONTRACT.md` in this same folder.

## `sdd` profile

A skill requests this profile when it needs `AGENTS.md` to operate with the SDD-AI flow. These validations are mandatory on each execution of a skill that declares this profile.

1. Read `AGENTS.md` from the root. If missing: *"AGENTS.md not found. Run `/refacil:setup`"* and **stop**.
2. If `AGENTS.md` includes a `compact-guidance` block, apply those token efficiency rules throughout the execution.

Special case: in `refacil:explore`, `AGENTS.md` is active context throughout the entire exploration.

## `agents` profile

Only requires `AGENTS.md`. If it exists, read it and apply `compact-guidance` if present. If missing: continue with generic baseline and inform the user: *"AGENTS.md not found; run `/refacil:setup` for project rules."*

## BUS-CROSS-REPO.md

Shared protocol for consulting other repositories via `refacil-bus` and for **room agreements** (propose + notification to the requester). Applies in `explore`, `propose`, `verify`, and `bug` when the skill detects a cross-repo dependency or multi-repo coordination. See `BUS-CROSS-REPO.md` (same folder).

If these files are missing, run `refacil-sdd-ai init` to reinstall skills and prereqs.
