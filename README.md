# refacil-sdd-ai

**SDD-AI** (Specification-Driven Development with AI) packaged as a CLI.

Installs **skills** and **sub-agents** for **Claude Code**, **Cursor**, **OpenCode**, and **Codex** that guide the developer through a structured AI-assisted development workflow, using **`refacil-sdd/`** as the specification store, plus a **local bus** so agents across different repos can communicate with each other.

---

**npm:** [refacil-sdd-ai](https://www.npmjs.com/package/refacil-sdd-ai) | **GitHub:** [Erikole21/refacil-sdd-ai](https://github.com/Erikole21/refacil-sdd-ai)

## Requirements

- **Node.js >= 20.0.0**
- One or more supported IDEs: **Claude Code >= 2.1.89**, **Cursor**, **OpenCode**, or **Codex**

`refacil-sdd-ai init` checks the Claude Code version and warns if it is below 2.1.89. With an older version the rest of the methodology works, but `compact-bash` will have no effect (Claude Code only — Cursor, OpenCode, and Codex have their own hook delivery mechanisms).

---

## Installation

### Step 1 — Install the package globally

```bash
npm install -g refacil-sdd-ai
```

### Step 2 — Run `init` to install skills into your IDEs

```bash
refacil-sdd-ai init
```

`init` installs skills, sub-agents, and hooks into your IDE's **global user directories** (`~/.claude/`, `~/.cursor/`, `~/.config/opencode/`). Skills are available in all your repos from this point — no need to re-run `init` when you open a new repo.

- Interactive IDE selector (Claude Code / Cursor / OpenCode / Codex) — pre-selects installed IDEs.  
  Use `--all` to install for all four without prompting.
- Your IDE selection is saved to `~/.refacil-sdd-ai/selected-ides.json` and reused on every `update`.
- Also prompts for global branch config (`baseBranch`, `protectedBranches`, `artifactLanguage`)  
  stored in `~/.refacil-sdd-ai/config.yaml`. Skip with `--yes` or `--defaults`.

Re-run `init` if you install a new IDE or want to change which IDEs have the methodology.

**After `init`, restart your IDE session** — new skills are not detected until you restart.

### Step 3 — Configure each repo with `/refacil:setup`

In each repo where you want to use the methodology, open the IDE and run:

```
/refacil:setup
```

This generates `AGENTS.md` and the `.agents/` project index for that repo. It is the only step required per repo. Skills will prompt you to run it if it has not been done yet.

### Adding a new IDE to an existing installation

To add an IDE that was not selected during the original `init`, run `init` again:

```bash
refacil-sdd-ai init
```

The selector pre-marks your previously selected IDEs (from `~/.refacil-sdd-ai/selected-ides.json`). Check the new IDE, leave the others checked, and confirm — the new IDE is added and the selection is updated.

> **`update` does not add new IDEs** — it only updates the IDEs already in your selection. Use `init` to add a new one.

### Update

```bash
npm update -g refacil-sdd-ai
refacil-sdd-ai update
```

`update` reads `~/.refacil-sdd-ai/selected-ides.json` (the selection saved during `init`) and only updates those IDEs — it never touches IDEs you did not select. You do not need to run `update` per repo; it operates on the global install.

In Claude Code and Cursor the `check-update` hook (every session) syncs skills and `compact-guidance` automatically. It also cleans up any leftover project-level `refacil-*` artifacts from older installations and prints a message if it removes anything. In OpenCode the equivalent runs via the `session.created` handler of the embedded plugin. Only if a pending methodology migration is detected does the hook prompt `/refacil:update` — otherwise the user is not interrupted.

### Uninstall

```bash
refacil-sdd-ai clean           # in the repo (removes skills + SDD-AI hooks for all IDEs)
npm uninstall -g refacil-sdd-ai
```

## CLI Commands

### Package management

| Command | Description |
|---|---|
| `refacil-sdd-ai init` | Install skills and hooks into global IDE user directories |
| `refacil-sdd-ai update` | Re-copy skills and hooks to the latest version (global) |
| `refacil-sdd-ai migration-pending [--json]` | Same detection as hooks/`notify-update`; exit 1 if migration is pending; on exit 0 also deletes obsolete `.refacil-pending-update` (same as at the start of `check-update`) |
| `refacil-sdd-ai clean` | Remove SDD-AI skills and hooks from global IDE user directories |
| `refacil-sdd-ai help` | Show help |

### Internal hooks (invoked automatically — not for manual use)

| Command | Description |
|---|---|
| `refacil-sdd-ai check-update` | (`SessionStart`) Clears obsolete update flag if no migration; npm optional; syncs skills and `compact-guidance` in AGENTS.md |
| `refacil-sdd-ai notify-update` | (`UserPromptSubmit` / `beforeSubmitPrompt`) Only acts if a methodology migration is pending (same logic as `/refacil:update`); otherwise does not interrupt |
| `refacil-sdd-ai check-review` | (`PreToolUse`) Blocks `git push` if `.review-passed` is missing in any active change |
| `refacil-sdd-ai compact-bash` | (`PreToolUse`) Silently rewrites bare Bash commands via `updatedInput` |

### SDD artifacts (`sdd`)

Native CLI for **`refacil-sdd/`** (no separate OpenSpec skill layer). Used by skills and hooks; you can also run it from scripts.

| Command | Description |
|---|---|
| `refacil-sdd-ai sdd new-change <name>` | Scaffold `proposal.md`, `design.md`, `tasks.md`, and specs under `refacil-sdd/changes/<name>/` |
| `refacil-sdd-ai sdd list [--json]` | List active changes and review status |
| `refacil-sdd-ai sdd status <name> [--json]` | Artifact and task status for one change |
| `refacil-sdd-ai sdd mark-reviewed <name>` | Write `.review-passed` (requires `--verdict`, `--summary`, counts) |
| `refacil-sdd-ai sdd tasks-update <name>` | Mark a task done (`--task N --done`) |
| `refacil-sdd-ai sdd archive <name>` | Move a regular change to `refacil-sdd/changes/archive/` |
| `refacil-sdd-ai sdd validate-name <name>` | Validate change folder name (must start with a letter) |
| `refacil-sdd-ai sdd config [--json]` | Show effective configuration (protectedBranches, baseBranch, artifactLanguage) after cascade: project `refacil-sdd/config.yaml` → global `~/.refacil-sdd-ai/config.yaml` → built-in defaults. `--json` also includes a `sources` field indicating the resolution level for each value (`project`, `global`, or `default`). |
| `refacil-sdd-ai sdd write-config [--global] [--base-branch <v>] [--protected-branches <csv>] [--artifact-language <lang>]` | Write or merge config into `refacil-sdd/config.yaml` (project) or `~/.refacil-sdd-ai/config.yaml` (`--global`). Performs a semantic no-op check — skips rewrite if values are already set. Directory is auto-created if absent. |

Run **`refacil-sdd-ai help`** for the full list including `bus` and `compact` subcommands.

### Artifact Language

By default, `/refacil:propose` generates proposal, specs, design, and tasks in **English**. Set `artifactLanguage` to have the artifacts produced in your team's preferred language so developers can review them in their natural language.

**Supported values**: `english` (default) · `spanish`

**Configure globally** — applies to all repos for this user:

```bash
refacil-sdd-ai sdd write-config --global --artifact-language spanish
```

**Configure per project** — overrides the global value (commit `refacil-sdd/config.yaml` for team-wide effect):

```bash
refacil-sdd-ai sdd write-config --artifact-language spanish
```

**Check the active value**:

```bash
refacil-sdd-ai sdd config
# artifactLanguage [global]: spanish

refacil-sdd-ai sdd config --json
# { ..., "artifactLanguage": "spanish", "sources": { "artifactLanguage": "global" } }
```

**Cascade**: project `refacil-sdd/config.yaml` → global `~/.refacil-sdd-ai/config.yaml` → default `english`.

`refacil-sdd-ai init` also prompts for this preference and writes to the global config. Skip with `--yes` to keep the current value.

### Command rewrite control (`compact-bash`)

| Command | Description |
|---|---|
| `refacil-sdd-ai compact stats` | Statistics (hook + already-compact) + estimated tokens and USD |
| `refacil-sdd-ai compact enable` | Re-enable rewriting |
| `refacil-sdd-ai compact disable` | Disable rewriting without uninstalling |
| `refacil-sdd-ai compact clear-log` | Clear `~/.refacil-sdd-ai/compact.log` |

### Agent bus (`bus`)

| Command | Description |
|---|---|
| `refacil-sdd-ai bus start` | Start the local broker (auto-spawn detached) |
| `refacil-sdd-ai bus stop` | Stop the broker |
| `refacil-sdd-ai bus status` | Show port, pid, uptime |
| `refacil-sdd-ai bus rooms` | Active rooms + members |
| `refacil-sdd-ai bus view` | Open the web UI in the browser |
| `refacil-sdd-ai bus watch <session> [--room <room>]` | Live terminal panel (0 tokens) |
| `refacil-sdd-ai bus history [--n N] [--session <s>]` | Last N messages |
| `refacil-sdd-ai bus join --room <room> [--session <s>] [--intro "..."]` | Join a room (skills do this automatically) |
| `refacil-sdd-ai bus leave [--session <s>]` | Leave the room |
| `refacil-sdd-ai bus say --text "..." [--session <s>]` | Broadcast (skills do this automatically) |
| `refacil-sdd-ai bus ask --to <session> --text "..." [--wait N]` | Directed question; `--to all` (also `*` or `everyone`) sends to every room member except you |
| `refacil-sdd-ai bus reply --text "..." [--correlation <id>]` | Reply (skills do this automatically) |
| `refacil-sdd-ai bus attend [--timeout N]` | Listen for directed questions (skills do this automatically) |
| `refacil-sdd-ai bus inbox [--session <s>]` | View new messages |

> The `join/leave/say/ask/reply/attend/inbox` subcommands also exist as **IDE skills** (`/refacil:join`, etc.). In most cases use the skills; the CLI commands are for scripting or debugging.
>
> **Cross-repo coordination** (ask requests, room agreements, `/refacil:propose`, closing to the requester): after `init`, the file **`BUS-CROSS-REPO.md`** is available in `~/.claude/skills/refacil-prereqs/` and `~/.cursor/skills/refacil-prereqs/`.

---

## Available IDE Skills

All invoked as `/refacil:<name>` in Claude Code, Cursor, OpenCode, or Codex.

### SDD cycle

| Skill | Usage |
|---|---|
| `/refacil:setup` | Generate AGENTS.md and the `.agents/` project index |
| `/refacil:guide` | Interactive guide on which command to use |
| `/refacil:explore` | Explore the codebase without modifying anything |
| `/refacil:propose` | Create a change proposal: proposal + specs + design + tasks |
| `/refacil:apply` | Implement the change tasks |
| `/refacil:test` | Generate unit tests from the artifacts |
| `/refacil:verify` | Validate implementation vs specs (with optional autofix) |
| `/refacil:review` | Quality checklist, emits `.review-passed` if approved |
| `/refacil:archive` | Archive the completed change + sync specs (requests task references) |
| `/refacil:up-code` | Commit + push + PR (runs review if missing) |
| `/refacil:bug` | Full bugfix flow with regression tests |
| `/refacil:update` | Detect and apply pending methodology migrations to the current repo |

### Automatic sub-agents (v3.0.0+)

Some skills delegate their heavy work to **sub-agents** that run in isolated context (they do not saturate the main session with mass reads). They are invoked automatically by the corresponding skill — do not call them directly.

| Skill | Sub-agent | Role | Can write |
|---|---|---|---|
| `/refacil:explore` | `refacil-investigator` | Reads codebase, enriches with AGENTS.md, queries cross-repo bus | No |
| `/refacil:verify` | `refacil-validator` | Runs tests + compares against spec, returns prioritized issues | No |
| `/refacil:review` | `refacil-auditor` | Evaluates changes against the quality checklist | No |
| `/refacil:test` | `refacil-tester` | Detects stack, generates tests covering CA/CR, runs and fixes | Yes (test files) |
| `/refacil:apply` | `refacil-implementer` | Reads SDD artifacts and implements all change tasks | Yes (source code) |
| `/refacil:bug` | `refacil-debugger` | `investigation` mode: analyzes root cause without modifying anything. `fix` mode: implements the fix, generates regression tests, creates `summary.md` | Only in fix mode |
| `/refacil:propose` | `refacil-proposer` | Explores the codebase and generates proposal, specs, design, and tasks | Yes (SDD artifacts) |

**Common properties**: specialized system prompt, direct-invocation guardrail, output contract with a fenced JSON block per skill. Read-only sub-agents (`investigator`, `validator`, `auditor`) do not have `Edit`/`Write`. Write sub-agents (`tester`, `implementer`, `debugger`, `proposer`) do.

**Model**: `refacil-proposer` runs with `model: opusplan` (uses Opus during plan mode for highest-stakes planning, then switches to Sonnet for execution). Other sub-agents use `model: sonnet` by default for Claude Code, others use inherit model.

**Multi-platform**: `.claude/agents/refacil-*.md` uses `tools:` (granular allowlist). `.cursor/agents/refacil-*.md` is auto-generated: `readonly: true` for agents without `Edit`/`Write`, `readonly: false` for those that have them; always `model: inherit`. `.opencode/agents/refacil-*.md` is auto-generated via `transformFrontmatterForOpenCode()`: converts `tools:` to a `permission:` block (`edit: allow/deny`, `bash: allow/deny`, `webfetch: deny`), adds `mode: subagent`, adds `hidden: true` for internal agents, and removes `model:`. `.codex/agents/refacil-*.toml` is auto-generated via `convertAgentToToml()`: extracts `name` and `description` from the YAML frontmatter and places the Markdown body in `developer_instructions = """..."""`. The installer transforms the frontmatter automatically for all four IDEs.

**Two-pass `refacil:bug` flow**: the wrapper first invokes the sub-agent in `investigation` mode (writes nothing) → the user confirms the hypothesis and approves the fix → the wrapper validates the working branch → invokes the sub-agent in `fix` mode to implement.

### Agent bus

| Skill | Usage |
|---|---|
| `/refacil:join <room>` | Join or create a room |
| `/refacil:say "..."` | Broadcast |
| `/refacil:ask @name "..." [--wait N]` | Directed question; `@all` asks everyone in the room (blocks with `--wait` until the **first** response) |
| `/refacil:reply "..."` | Reply to the last question (auto-fills `correlationId`) |
| `/refacil:attend` | Active listen mode |
| `/refacil:inbox` | New messages since last read |

---

## Recommended Flow

Quick rule for choosing the entry command:

- Understand the system without touching code → `/refacil:explore`
- New feature or behavior change → `/refacil:propose`
- Functional bug or production error → `/refacil:bug`

From there, the full cycle is:

```
┌───────────────────────────┐
│  Change needed            │
└──────────────┬────────────┘
               ▼
      ┌─────────────────┐
      │ Type of task?   │
      └──┬───────┬──────┘
         │       │
   FEATURE│       │BUG
         ▼       ▼
  /refacil:    /refacil:
  propose      bug
  (proposal +  (fix + regression
   specs +     tests +
   design +    summary.md)
   tasks)        │
         │       │
         ▼       │
  /refacil:     │
  apply         │
         │       │
         ▼       │
  /refacil:     │
  test          │
         │       │
         ▼       │
  /refacil:     │
  verify        │
  (max 2 rounds │
   autofix)     │
         │       │
         └───┬───┘
             ▼
     /refacil:review
     (generates .review-passed)
             ▼
    /refacil:archive
    (feature: moves to archive/ + syncs specs
     bug: fix-*/spec.md + review.yaml)
             ▼
    /refacil:up-code
    (checks review +
     commit + push + PR)
             ▼
         PR created
```

**Two-layer review gate**:
- `/refacil:up-code` detects a missing `.review-passed` and **automatically runs `/refacil:review`** before pushing.
- The `check-review` hook also intercepts manual `git push` commands and **blocks** the operation if it is missing. The hook does not invoke skills — it only blocks and instructs.

**Archive**:
- For features/improvements: the CLI moves artifacts to `archive/` and extracts `.review-passed` fields to `review.yaml` inside each affected spec.
- For bugs: manual archiving, creates `refacil-sdd/specs/fix-*/spec.md` in standard format + `review.yaml`.
- A single branch can accumulate multiple bugs, each in its own independent `fix-*/` folder.
- `/refacil:archive` always requests one or more **task references** associated with the change before proceeding. Accepted formats: URL, ticket/issue identifier, or task name. References are stored in `review.yaml` under the `taskReferences` field (YAML list). This field is mandatory — archiving does not proceed until the user provides at least one reference.

---

## Automatic Hooks

Installed during `init` / `update` for each selected IDE. The same four behaviors are active in Claude Code, Cursor, OpenCode, and Codex — each through its own delivery mechanism.

| Behavior | Claude Code | Cursor | OpenCode | Codex |
|---|---|---|---|---|
| **check-update** | `SessionStart` hook in `~/.claude/settings.json` | `SessionStart` hook in `~/.cursor/hooks.json` | `session.created` handler in the global OpenCode plugin | `sessionStart` hook in `~/.codex/config.toml` |
| **notify-update** | `UserPromptSubmit` hook | `beforeSubmitPrompt` hook | `tui.prompt.append` handler | `userPromptSubmit` hook in `~/.codex/config.toml` |
| **compact-bash** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool | `preToolUse` hook (Bash matcher) in `~/.codex/config.toml` |
| **check-review** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool | `preToolUse` hook (Bash matcher) in `~/.codex/config.toml` |

| Behavior | What it does |
|---|---|
| `check-update` | On startup: deletes `.refacil-pending-update` if no migration is pending (stale flags). Then: npm check, sync skills, **compact-guidance**. If skills were synced **and** a migration is pending, writes the flag for `notify-update`. Always refreshes the flag content when a migration is pending (keeps the `to` version current). |
| `notify-update` | If the flag exists **and** a methodology migration is pending (same table as `/refacil:update`), injects the instruction before the agent processes the next user message; if the sync happened without a migration, the flag is not created or is discarded silently. |
| `compact-bash` | Silently rewrites bare Bash commands. No extra turns, the IDE does not see the change. Requires Claude Code >= 2.1.89 for the `updatedInput` path. |
| `check-review` | Intercepts `git push` and blocks if `.review-passed` is missing in any active change. |

> **OpenCode plugin**: a single file installed in the global OpenCode plugins directory implements all four behaviors. It loads `lib/compact/rules.js` from the package to reuse the same rewrite rules — no duplicated logic. If the rules file is not resolvable, compact-bash is disabled gracefully with a warning to stderr; the plugin never crashes the session.

> **Codex hooks**: injected into `~/.codex/config.toml` under `[hooks]` with `[features] codex_hooks = true`. Each SDD-AI hook entry carries a boolean marker (`_sdd`, `_sdd_compact`, `_sdd_review`, `_sdd_notify`) for clean removal on `clean`. User-defined hooks outside these entries are preserved.

> **Why two hooks for updates?** `SessionStart` does the silent sync when opening the session without user interaction. `notify-update` on `UserPromptSubmit` / `beforeSubmitPrompt` injects the instruction just before the agent processes the next user message, ensuring it is not ignored.

### Review gate on push

```
         ┌──────────────────────────────┐
         │ Dev runs /refacil:up-code    │
         │   or manual git push         │
         └──────────────┬───────────────┘
                        │
     ┌──────────────────┴──────────────────┐
     │ Via /refacil:up-code                │ Direct git push
     ▼                                     ▼
┌─────────────────────┐          ┌───────────────────────┐
│ up-code detects     │          │ Hook check-review     │
│ missing             │          │ (PreToolUse on Bash)  │
│ .review-passed →    │          │ Checks .review-passed │
│ INVOKES /refacil:   │          │ in changes/*          │
│ review              │          │                       │
└─────────┬───────────┘          └──────────┬────────────┘
          │                                 │
          ▼                                 ▼
   ┌──────────────┐                ┌─────────────────┐
   │ Review OK?   │                │ Any missing?    │
   └──┬────────┬──┘                └──┬───────────┬──┘
    YES│      NO│                   YES│         NO│
      ▼        ▼                       ▼           ▼
   push OK  report +               block +     allow
            no push                instruct    push
```

### `compact-bash` hook — silent command rewrite

A second token-reduction layer, **with no conversational cost**. Claude emits a Bash command; before executing it, the hook inspects it, and if it matches a rule rewrites it via `updatedInput`. Claude does not see the change.

**Intent detector**: if the command already has explicit flags (`git log -p`, `jest --watch`, `docker logs --tail 50`), the hook **does not intervene** — your intent takes precedence.

**Escape**: prefix `COMPACT=0` to the command (`COMPACT=0 git log`).

**Active rules — git, tests, docker logs**:

| Bare | Rewritten to | Savings |
|---|---|---|
| `git log` | `git log --oneline -20` | ~85% |
| `git status` | `git status -s` | ~70% |
| `git diff` (no args) | `git diff --stat` | ~80% |
| `git show` | `git show --stat` | ~70% |
| `docker logs <c>` | `docker logs --tail 100 <c>` | ~80% |
| `npm test` / `yarn test` / `pnpm test` | `… 2>&1 \| tail -80` | ~90% |
| `jest` | `jest --silent --reporters=summary` | ~85% |
| `pytest` | `pytest -q` | ~60% |

**Active rules — linters, type checkers, build, system**:

| Bare | Rewritten to | Savings |
|---|---|---|
| `eslint` | `eslint . --format compact --quiet` | ~70% |
| `eslint <path>` | `eslint <path> --format compact` | ~60% |
| `biome check` | `biome check --reporter=summary` | ~65% |
| `tsc` / `npx tsc …` | `… 2>&1 \| head -80` | variable |
| `prettier --check <p>` | `prettier --check <p> --loglevel warn` | ~50% |
| `npm audit` | `npm audit 2>&1 \| tail -10` | ~80% |
| `npm ls` | `npm ls --depth=0` | ~90% |
| `cargo build / test / check` | `… --quiet` | ~50% |
| `go test …` (no flags) | `… 2>&1 \| tail -80` | ~70% |
| `mvn test` | `mvn test -q` | ~60% |
| `./gradlew test` / `gradle test` | `… -q` | ~60% |
| `ps aux` | `ps -eo pid,pcpu,pmem,comm \| head -30` | ~80% |

**Telemetry**: each rewrite appends a JSON line to `~/.refacil-sdd-ai/compact.log` (local, nothing leaves the machine). `compact stats` calculates token savings and estimated USD (at $3/MTok input for Sonnet, conservative).

### `compact-guidance` block in AGENTS.md

The SDD-AI methodology generates a lot of context (artifacts, specs, prompts). To compensate, the package maintains a block in `AGENTS.md` that instructs the AI to request compact output (Read with offset/limit, `git log --oneline`, tests with failures only, etc.).

- Delimited by `<!-- refacil-sdd-ai:compact-guidance:start -->` and `...:end -->`
- Source of truth: `templates/compact-guidance.md`
- Synced on: `init`, `update`, and the `check-update` hook (every SessionStart)
- If `AGENTS.md` does not exist, it is not created behind the user's back

> **Do not manually edit** between the markers. Content is overwritten on the next session.

---

## Cross-methodology rules

Defined in `skills/prereqs/METHODOLOGY-CONTRACT.md`:

- **Flow states**: `READY_FOR_APPLY` / `VERIFY` / `REVIEW` / `ARCHIVE` / `MERGE` — each transition validates prerequisites.
- **Branch policy**: every new branch (`feature/*`, `fix/*`, etc.) is created from the `baseBranch` returned by `refacil-sdd-ai sdd config --json`. Integration to protected branches (as listed by `sdd config --json`) always via PR — **never** direct commits to a protected branch. Branch rules are resolved via a two-level cascade: project (`refacil-sdd/config.yaml`) → global (`~/.refacil-sdd-ai/config.yaml`) → built-in defaults (`master`, `main`, `develop`, `dev`, `testing`, `qa`). Use `sdd write-config` to set project- or team-level overrides. The global config at `~/.refacil-sdd-ai/config.yaml` is preserved across package updates and can be used to set team-wide defaults without per-repo configuration.
- **Multi-stack tests**: detects the real test command (does not hardcode `npm test`).
- **`AGENTS.md` by profile** (`sdd` vs `agents`): the methodology respects both.
- **Output mode**: concise by default, detailed on demand.
- **Language policy**: internal agent and skill instructions are in **English**. Responses to the user are in the **user's language** (default: Spanish). SDD artifact language (proposal, specs, design, tasks) defaults to **English** and is configurable via `artifactLanguage` — see [Artifact Language](#artifact-language).

---

## refacil-bus — agent chat room

Local bus (WebSocket over `127.0.0.1`) so agents across different repos can communicate via plain text. **Does not share files, context, or tokens between repos** — each agent responds from its own code.

**Primary use case**: a dev with several IDE windows open (one per repo). Before the bus, the dev acted as a transcriber between their own agents. With the bus, agents talk to each other directly.

**Properties**:

- 100% local: nothing leaves `127.0.0.1`. No accounts, no shared service.
- Zero config: the broker auto-spawns the first time a skill needs it (`127.0.0.1:7821`, fallback 7822/7823).
- ~40 MB RAM, 0% CPU idle. Persistence: `~/.refacil-sdd-ai/bus/<room>/inbox.jsonl` (7-day rotation).
- Same skills in Claude Code and Cursor.

**Quick start**:

```bash
# In each repo, once
/refacil:join refacil-main
# On the first time the LLM writes an introduction block in AGENTS.md
```

**Optimal pattern**: before starting a task that may require querying another repo, go to the other repo's window and say *"attend the bus"*. That puts it into `/refacil:attend` and the agent conversation happens in the background without the dev switching windows.

**SDD-AI conventions in the bus**: anyone in the room joined with `/refacil:join` (methodology already active in the repo). **Change requests** to another session go with **clear scope** in the `ask` (no pasting the guide in every message); the destination repo channels with **`/refacil:propose`** and whoever implements **closes via bus** to who requested the work. Details and edge cases: `refacil-prereqs/BUS-CROSS-REPO.md` in the installed skills.

**Contract-first questions (recommended)**: for cross-repo integration clarifications, format `ask/reply` around contract fields (integration point, input contract, output contract, compatibility, source of truth). If the first response is partial, send a focused retry `ask` only for unresolved points. This keeps bus conversations actionable for integration work instead of generic chat.

**Pure observer** (0 tokens): `refacil-sdd-ai bus watch <session>` or `refacil-sdd-ai bus view` for the web UI.

> **Diagrams, scenarios and pitch**: see `refacil-bus-diagrams.md` (included in the package) — includes architecture, flow with attend, flow without attend, comparative impact table, and visual decision guide (Mermaid).

### Known limitations

- While `/refacil:attend` is active, the IDE session is occupied (abort with ESC). Mitigation: a second window of the same repo dedicated to listening.
- The LLM does not receive external pushes: full automation requires the receiver to be in `attend`, or for the dev to ask `/refacil:inbox` afterwards.
- No authentication: any local process can connect to the broker (by design, loopback only and on-demand by the dev).

---

## What Gets Installed

### Global user directories (once, shared across all repos)

Skills, sub-agents, and hooks are installed into the user's global IDE directories — not into any project repo. Only the IDEs selected during `init` receive files.

```
# Claude Code (if selected)
~/.claude/skills/refacil-*/    # Skills (includes refacil-prereqs: METHODOLOGY-CONTRACT.md, BUS-CROSS-REPO.md, …)
~/.claude/agents/refacil-*.md  # Read-only sub-agents: auditor, investigator, validator
                               # Write sub-agents: tester, implementer, debugger, proposer
~/.claude/settings.json        # SDD hooks merged in: check-update, notify-update, check-review, compact-bash

# Cursor (if selected)
~/.cursor/skills/refacil-*/    # Cursor skills (auto-transformed frontmatter: readonly + model:inherit)
~/.cursor/agents/refacil-*.md  # Cursor sub-agents (readonly:true/false + model:inherit, auto-generated)
~/.cursor/hooks.json           # SDD hooks merged in (same four behaviors)

# OpenCode (if selected)  — macOS/Linux: ~/.config/opencode/   Windows: %APPDATA%\opencode
~/.config/opencode/skills/refacil-*/    # OpenCode skills
~/.config/opencode/agents/refacil-*.md  # OpenCode sub-agents (permission block + mode:subagent)
~/.config/opencode/plugins/refacil-hooks.js  # Plugin: session.created + tui.prompt.append + tool.execute.before

# Codex (if selected)
~/.codex/skills/refacil-*/             # Codex skills (same content as Claude Code)
~/.codex/agents/refacil-*.toml         # Codex sub-agents (TOML: name + description + developer_instructions)
~/.codex/config.toml                   # SDD hooks merged in under [hooks] with [features] codex_hooks = true

# refacil-sdd-ai state
~/.refacil-sdd-ai/
  selected-ides.json           # IDE selection saved on init, reused by update
  config.yaml                  # Global config: baseBranch, protectedBranches, artifactLanguage
  sdd-version                  # Installed methodology version (used by check-update)
```

### Per repo (generated by `/refacil:setup`)

The only per-repo step is running `/refacil:setup` once per project. It generates the project index — no IDE skills or hooks are written to the repo.

```
# Shared (IDE-agnostic)
CLAUDE.md                    # Minimal index → points to AGENTS.md
.cursorrules                 # Cursor format equivalent of CLAUDE.md
.claudeignore                # Base exclusions (node_modules, dist, .env, *.key, etc.)
.cursorignore                # Same content as .claudeignore
.opencodeignore              # Same content as .claudeignore
AGENTS.md                    # Project index → generated by /refacil:setup
                             # Points to .agents/ + includes auto-managed blocks
                             # (compact-guidance and bus presentation)
.agents/                     # Project detail by area (generated by /refacil:setup)
                             # summary.md, architecture.md, stack.md, testing.md, commands.md…
refacil-sdd/                 # SDD artifacts store
  changes/                   # Active changes: proposal.md, specs, design.md, tasks.md
  changes/archive/           # Archived changes (moved here by /refacil:archive)
  specs/                     # Persistent specifications synced from archived changes
```

> **Migration from project-level installs**: the `check-update` hook (SessionStart) automatically detects and removes any leftover project-level `refacil-*` skills, agents, hooks, and empty IDE directories from older versions.

---

## Technologies

- [AGENTS.md](https://agents.md/) — universal AI instructions standard
- [Claude Code](https://claude.ai/code) — Anthropic CLI
- [Cursor](https://cursor.sh) — AI IDE
- [OpenCode](https://opencode.ai) — open-source AI development agent
- [Codex](https://github.com/openai/codex) — OpenAI CLI agent

## License

MIT
