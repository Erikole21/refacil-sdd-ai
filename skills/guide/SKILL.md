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

1. New feature → `/refacil:propose` → *(optional)* `/refacil:read-spec` → then choose implementation:
   - **Step-by-step (A):** `/refacil:apply` → `/refacil:test` (suite + coverage) → `/refacil:verify` (CA/CR; no full re-test by default) → `/refacil:review` (checklist; no suite) → `/refacil:archive` → `/refacil:up-code`
   - **Autonomous (B):** `/refacil:autopilot` — chains apply → test → verify → review → archive in one invocation; up-code (push + PR) is optional and configured in pre-flight (the user chooses whether to end at archive or continue with up-code); optional WhatsApp via `refacil-sdd-ai kapso setup`
2. Bug → `/refacil:bug` → `/refacil:review` → `/refacil:archive` → `/refacil:up-code`
3. Explore → `/refacil:explore`
4. Tests → `/refacil:test`
5. Validate implementation → `/refacil:verify`
6. Quality review → `/refacil:review`
7. Push code and create PR → `/refacil:up-code`
8. Configure repo → `refacil-sdd-ai init` (global + per repo) and `/refacil:setup`
9. Migrate documentation to current pattern → `/refacil:update`
10. Coordinate with other repos (without manual copy/paste) → see **Bus between agents** block below
11. Autonomous pipeline (after approved propose) → `/refacil:autopilot` — same chain as option 1 path B; use when you want autonomous execution ("autopilot", "modo autónomo", "termina solo el flujo"). During pre-flight you define whether up-code (push + PR) is included — the cycle adapts and can end at archive or continue with up-code.
12. Listen to specs with voice (TTS) → `/refacil:read-spec` — on-device browser playback; post-propose option B in propose, or on-demand for active changes / archived specs (`refacil-sdd-ai read-spec --change <name>`)
13. Change progress and metrics → `/refacil:stats` — task completion, review gate, test commands from `memory.yaml` (`refacil-sdd-ai sdd stats <changeName>`)

> **Note**: `up-code` verifies `.review-passed` before push; see `METHODOLOGY-CONTRACT.md §5-6` for details.

> **Skill parity**: 21 user-invocable skills (`user-invocable: true`, excluding internal `prereqs`) must appear in `SKILLS[]`, this menu, and the README "Available IDE Skills" table — including `read-spec` and `stats`.

### After `/refacil:propose` is approved

- **`/refacil:read-spec`** (optional): opens the change folder in the browser and reads proposal, design, tasks, and specs aloud in order — useful before choosing implementation.
- **`/refacil:apply`** (path A): step-by-step; each phase pauses for confirmation.
- **`/refacil:autopilot`** (path B): fully autonomous; path B is independent — it runs review, archive, and optionally up-code internally. During pre-flight the user configures whether up-code is included (cycle ends at archive or at a PR). Does not merge into path A.

## Bus between agents (refacil-bus)

For when the dev has multiple IDE sessions open (one per repo) and needs agents to consult each other without the dev being the manual transcriber:

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

- **IDE chat / composer:** `/refacil:*` commands in the chat or composer panel.
- **Listen to specs:** `/refacil:read-spec` or `refacil-sdd-ai read-spec --change <changeName>` — local TTS only, no remote APIs.
- **Hands-off implementation:** `/refacil:autopilot [changeName]` after propose is approved — in pre-flight you choose whether up-code (push + PR) is included. Configure Kapso once with `refacil-sdd-ai kapso setup` for WhatsApp notification on finish.

## Rules

- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) to the continuity question in step 4 of Instructions, immediately execute the resolved `/refacil:<skill>` command. Deterministic resolution by Menu option:
  - Option 1 (New feature) → `/refacil:propose`
  - Option 2 (Bug) → `/refacil:bug`
  - Option 3 (Explore) → `/refacil:explore`
  - Option 4 (Tests) → `/refacil:test`
  - Option 5 (Validate implementation) → `/refacil:verify`
  - Option 6 (Quality review) → `/refacil:review`
  - Option 7 (Push code and create PR) → `/refacil:up-code`
  - Option 8 (Configure repo) → `/refacil:setup`
  - Option 9 (Migrate documentation) → `skill: "refacil:update"`
  - Option 10 (Bus between agents) → `skill: "refacil:join"` (or another from the group `refacil:say`/`refacil:ask`/`refacil:reply`/`refacil:attend`/`refacil:inbox` depending on the expressed intent).
  - Option 11 (Autonomous pipeline) → `/refacil:autopilot`
  - Option 12 (Listen to specs) → `/refacil:read-spec`
  - Option 13 (Change progress) → `/refacil:stats`
  - Post-propose context with a single clear next step: if artifacts are approved and the user wants hands-off → `/refacil:autopilot`; if they want to hear specs first → `/refacil:read-spec`; if they want step-by-step → `/refacil:apply`.
  - If the intent does not map exactly to an option, do NOT invoke — list numbered options to the user and ask for explicit selection.

  Do not describe it in text or wait for the user to type the command. (See `METHODOLOGY-CONTRACT.md §5`.)
