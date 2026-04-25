---
name: refacil:guide
description: Interactive guide for the SDD-AI methodology — explains which command to use based on what you need to do
user-invocable: true
---

# refacil:guide — SDD-AI Methodology Guide

You are a **brief** guide: you choose the next command; the detail of each flow is in the **refacil-sdd-ai README** (npm / CLI repo, section "Workflows") — do not repeat it word for word here.

## Instructions

1. Ask what the user needs (or use their first message).
2. Show the numbered menu (below).
3. Respond with: **command** to run + **order of steps in one line** (e.g: `propose` → review artifacts → `apply` → `test` → `verify` → `review` → `archive` → `up-code`).
4. If from context there is already **one single possible next step**, reframe it in natural language and close with confirmation:
   - "The next step is X. Do you want me to continue with `/refacil:X`?"
5. If there are multiple valid paths, list options and ask for explicit selection.
6. If they ask for more detail: "See the refacil-sdd-ai README (npm or package repo): Workflows and CLI Commands."

## Menu

1. New feature → `/refacil:propose` → `/refacil:apply` → `/refacil:test` → `/refacil:verify` → `/refacil:review` → `/refacil:archive` → `/refacil:up-code`
2. Bug → `/refacil:bug` → `/refacil:review` → `/refacil:archive` → `/refacil:up-code`
3. Explore → `/refacil:explore`
4. Tests → `/refacil:test`
5. Validate implementation → `/refacil:verify`
6. Quality review → `/refacil:review`
7. Push code and create PR → `/refacil:up-code`
8. Configure repo → `refacil-sdd-ai init` (global + per repo) and `/refacil:setup`
9. Migrate documentation to current pattern → `/refacil:update`
10. Coordinate with other repos (without manual copy/paste) → see **Bus between agents** block below

> **Note**: `up-code` verifies `.review-passed` before push; see `METHODOLOGY-CONTRACT.md §5-6` for details.

## Bus between agents (refacil-bus)

For when the dev has multiple Claude Code / Cursor windows open (one per repo) and needs agents to consult each other without the dev being the manual transcriber:

| Command | When to use |
|---------|-------------|
| `/refacil:join <room>` | First step: joins this session to a room (creates the presentation block in `AGENTS.md` if missing). |
| `/refacil:say "..."` | Announcement to the entire room. |
| `/refacil:ask @<repo> "..." [--wait N]` | Query directed to another agent. With `--wait N` blocks until response or N sec. |
| `/refacil:reply "..."` | Responds to the last question directed to this session. |
| `/refacil:attend` | Puts this session in listening mode: when a directed question arrives, you answer and go back to listening. |
| `/refacil:inbox` | View new messages since the last read. |

**Typical pattern**: before a task that may need context from other repos, the dev goes to the other windows and says *"attend the bus"*. Then in their working repo, `/refacil:ask @<other-repo> "..." --wait 180` brings the automatic response without jumping between windows.

**Room agreements**: if changes that touch **this** repo are agreed in the bus, the agent channels them with **`/refacil:propose`** (SDD-AI methodology), not loose patches unless the user explicitly orders otherwise. Whoever implements **closes via bus** with whoever requested the change (`reply` to the same `ask` thread, or `ask`/`say` according to `refacil-prereqs/BUS-CROSS-REPO.md`).

**`ask` as request**: if you request work in **another** repo, **clear scope and criteria**; they apply **`/refacil:propose`** there without repeating the guide (already in methodology via `join`). See `/refacil:ask` Step 1.5.

For monitoring: `refacil-sdd-ai bus view` (web UI) or `refacil-sdd-ai bus watch <session>` (terminal). No token consumption.

Full detail in the refacil-sdd-ai README (section `refacil-bus`).

## Tips (one line per tool)

- **Claude Code:** `/refacil:*` commands in the chat.
- **Cursor:** `/refacil:*` commands in Composer; `@` for context files.

## Rules

- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) to the continuity question in step 4 of Instructions, immediately invoke the **Skill tool** with the exact name resolved from the menu option you recommended. Deterministic resolution by Menu option:
  - Option 1 (New feature) → `skill: "refacil:propose"`
  - Option 2 (Bug) → `skill: "refacil:bug"`
  - Option 3 (Explore) → `skill: "refacil:explore"`
  - Option 4 (Tests) → `skill: "refacil:test"`
  - Option 5 (Validate implementation) → `skill: "refacil:verify"`
  - Option 6 (Quality review) → `skill: "refacil:review"`
  - Option 7 (Push code and create PR) → `skill: "refacil:up-code"`
  - Option 8 (Configure repo) → `skill: "refacil:setup"`
  - Option 9 (Migrate documentation) → `skill: "refacil:update"`
  - Option 10 (Bus between agents) → `skill: "refacil:join"` (or another from the group `refacil:say`/`refacil:ask`/`refacil:reply`/`refacil:attend`/`refacil:inbox` depending on the expressed intent).
  - If the intent does not map exactly to an option, do NOT invoke — list numbered options to the user and ask for explicit selection.

  Do not describe it in text or wait for the user to type the command. (See `METHODOLOGY-CONTRACT.md §5`.)
