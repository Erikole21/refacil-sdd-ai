# refacil-sdd-ai

**npm**: [npmjs.com/package/refacil-sdd-ai](https://www.npmjs.com/package/refacil-sdd-ai) · **GitHub**: [github.com/Erikole21/refacil-sdd-ai](https://github.com/Erikole21/refacil-sdd-ai)

**SDD-AI** (Specification-Driven Development with AI) packaged as a CLI.

Installs **skills** and **sub-agents** for **Claude Code**, **Cursor**, and **OpenCode** that guide the developer through a structured AI-assisted development workflow, using **`refacil-sdd/`** as the specification store, plus a **local bus** so agents across different repos can communicate with each other.

---

## Requirements

- **Node.js >= 20.0.0**
- One or more supported IDEs: **Claude Code >= 2.1.89**, **Cursor**, or **OpenCode**

`refacil-sdd-ai init` checks the Claude Code version and warns if it is below 2.1.89. With an older version the rest of the methodology works, but `compact-bash` will have no effect (Claude Code only — OpenCode and Cursor have their own hook delivery mechanisms).

---

## Installation

Recommended: install globally once, then run `init` per repo.

```bash
# 1. Global (once)
npm install -g refacil-sdd-ai

# 2. In the repo root
refacil-sdd-ai init
#    Interactive IDE selector (Claude Code / Cursor / OpenCode) — pre-selects IDEs
#    whose folder already exists. Use --all to install for all three without prompting.
#    Copies skills and sub-agents to the selected IDEs, configures hooks,
#    and creates/updates .claudeignore, .cursorignore and .opencodeignore.
#    Also prompts for global branch config (baseBranch, protectedBranches) pre-filled
#    from ~/.refacil-sdd-ai/config.yaml. Skipped with --yes or --defaults.

# 3. Restart your IDE session
#    (new skills are not detected until you restart)

# 4. In the IDE
/refacil:setup
#    Generates AGENTS.md and the .agents/ directory for the project
```

### Adding a new IDE to an existing installation

If you already have the methodology installed for Claude Code or Cursor and want to add OpenCode (or any other IDE), just run `init` again from the repo root:

```bash
refacil-sdd-ai init
```

The selector will pre-select the IDEs whose folders already exist (`.claude/`, `.cursor/`). Check the new IDE you want to add (e.g. OpenCode), leave the existing ones checked, and confirm — only the newly selected IDE will receive files; existing installations are refreshed in place.

> **`update` does not add new IDEs** — it only updates IDEs already installed. Use `init` to add a new one.

### Update

```bash
npm update -g refacil-sdd-ai
refacil-sdd-ai update          # in each repo where it is used
```

`update` detects which IDEs are installed by folder presence (`.claude/`, `.cursor/`, `.opencode/`) and only updates those — it never creates IDE directories that did not exist before. In Claude Code and Cursor the `check-update` hook (every session) syncs skills and `compact-guidance`. In OpenCode the equivalent runs via the `session.created` handler of the embedded plugin (`.opencode/plugins/refacil-hooks.js`). Only if the automatic detection (`lib/methodology-migration-pending.js`) finds a pending methodology migration does it write the flag and allow `notify-update` / `tui.prompt.append` to prompt `/refacil:update`. If there is no migration, the user is not interrupted. The `/refacil:update` skill uses `refacil-sdd-ai migration-pending` as the same criterion.

### Uninstall

```bash
refacil-sdd-ai clean           # in the repo (removes skills + SDD-AI hooks for all IDEs)
npm uninstall -g refacil-sdd-ai
```

## CLI Commands

### Package management

| Command | Description |
|---|---|
| `refacil-sdd-ai init` | Install skills and hooks in the current repo |
| `refacil-sdd-ai update` | Re-copy skills and hooks to the latest version |
| `refacil-sdd-ai migration-pending [--json]` | Same detection as hooks/`notify-update`; exit 1 if migration is pending; on exit 0 also deletes obsolete `.refacil-pending-update` (same as at the start of `check-update`) |
| `refacil-sdd-ai clean` | Remove SDD-AI skills and hooks from the repo |
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
| `refacil-sdd-ai sdd config [--json]` | Show effective branch configuration (protectedBranches, baseBranch) after cascade: project `refacil-sdd/config.yaml` → global `~/.refacil-sdd-ai/config.yaml` → built-in defaults |
| `refacil-sdd-ai sdd write-config [--global] [--base-branch <v>] [--protected-branches <csv>]` | Write or merge branch config into `refacil-sdd/config.yaml` (project) or `~/.refacil-sdd-ai/config.yaml` (`--global`). Performs a semantic no-op check — skips rewrite if values are already set. Directory is auto-created if absent. |

Run **`refacil-sdd-ai help`** for the full list including `bus` and `compact` subcommands.

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
> **Cross-repo coordination** (ask requests, room agreements, `/refacil:propose`, closing to the requester): after `init`, the file **`BUS-CROSS-REPO.md`** is available in `.claude/skills/refacil-prereqs/` and `.cursor/skills/refacil-prereqs/`.

---

## Available IDE Skills

All invoked as `/refacil:<name>` in Claude Code, Cursor, or OpenCode.

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

**Triple-platform**: `.claude/agents/refacil-*.md` uses `tools:` (granular allowlist). `.cursor/agents/refacil-*.md` is auto-generated: `readonly: true` for agents without `Edit`/`Write`, `readonly: false` for those that have them; always `model: inherit`. `.opencode/agents/refacil-*.md` is auto-generated via `transformFrontmatterForOpenCode()`: converts `tools:` to a `permission:` block (`edit: allow/deny`, `bash: allow/deny`, `webfetch: deny`), adds `mode: subagent`, adds `hidden: true` for internal agents, and removes `model:`. The installer transforms the frontmatter automatically for all three IDEs.

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

Installed during `init` / `update` for each selected IDE. The same four behaviors are active in Claude Code, Cursor, and OpenCode — each through its own delivery mechanism.

| Behavior | Claude Code | Cursor | OpenCode |
|---|---|---|---|
| **check-update** | `SessionStart` hook in `.claude/settings.json` | `SessionStart` hook in `.cursor/settings.json` | `session.created` handler in `.opencode/plugins/refacil-hooks.js` |
| **notify-update** | `UserPromptSubmit` hook | `beforeSubmitPrompt` hook | `tui.prompt.append` handler |
| **compact-bash** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool |
| **check-review** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool |

| Behavior | What it does |
|---|---|
| `check-update` | On startup: deletes `.refacil-pending-update` if no migration is pending (stale flags). Then: npm check, sync skills, **compact-guidance**. If skills were synced **and** a migration is pending, writes the flag for `notify-update`. Always refreshes the flag content when a migration is pending (keeps the `to` version current). |
| `notify-update` | If the flag exists **and** a methodology migration is pending (same table as `/refacil:update`), injects the instruction before the agent processes the next user message; if the sync happened without a migration, the flag is not created or is discarded silently. |
| `compact-bash` | Silently rewrites bare Bash commands. No extra turns, the IDE does not see the change. Requires Claude Code >= 2.1.89 for the `updatedInput` path. |
| `check-review` | Intercepts `git push` and blocks if `.review-passed` is missing in any active change. |

> **OpenCode plugin**: a single file (`.opencode/plugins/refacil-hooks.js`) implements all four behaviors. It loads `lib/compact/rules.js` from the package to reuse the same rewrite rules — no duplicated logic. If the rules file is not resolvable, compact-bash is disabled gracefully with a warning to stderr; the plugin never crashes the session.

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
- **Language policy**: internal agent and skill instructions are in **English**. Responses to the user are in the **user's language** (default: Spanish). SDD artifacts are in the **team's agreed language**.

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

**Pure observer** (0 tokens): `refacil-sdd-ai bus watch <session>` or `refacil-sdd-ai bus view` for the web UI.

> **Diagrams, scenarios and pitch**: see `refacil-bus-diagrams.md` (included in the package) — includes architecture, flow with attend, flow without attend, comparative impact table, and visual decision guide (Mermaid).

### Known limitations

- While `/refacil:attend` is active, the IDE session is occupied (abort with ESC). Mitigation: a second window of the same repo dedicated to listening.
- The LLM does not receive external pushes: full automation requires the receiver to be in `attend`, or for the dev to ask `/refacil:inbox` afterwards.
- No authentication: any local process can connect to the broker (by design, loopback only and on-demand by the dev).

---

## What Gets Installed in Your Repo

Only the IDEs selected during `init` (or detected during `update`) receive files. The three IDE targets are independent — selecting only `.opencode` does not create `.claude/` or `.cursor/` directories.

```
# Claude Code (if selected)
.claude/skills/refacil-*/    # Skills (includes refacil-prereqs: METHODOLOGY-CONTRACT.md, BUS-CROSS-REPO.md, …)
.claude/agents/refacil-*.md  # Read-only sub-agents: auditor, investigator, validator
                             # Write sub-agents: tester, implementer, debugger, proposer
.claude/settings.json        # Hooks: check-update + notify-update + check-review + compact-bash
.claude/.sdd-version         # Installed methodology version (used by check-update)

# Cursor (if selected)
.cursor/skills/refacil-*/    # Cursor skills (equivalent)
.cursor/agents/refacil-*.md  # Cursor sub-agents (readonly:true/false + model:inherit, auto-generated)
.cursor/settings.json        # Hooks: check-update + notify-update + check-review + compact-bash
.cursor/.sdd-version         # Installed methodology version

# OpenCode (if selected)
.opencode/skills/refacil-*/       # OpenCode skills (byte-for-byte copy — same spec as Claude Code)
.opencode/agents/refacil-*.md    # OpenCode sub-agents (permission block + mode:subagent, auto-generated)
.opencode/plugins/refacil-hooks.js  # Embedded plugin: session.created + tui.prompt.append + tool.execute.before
.opencode/opencode.json          # Created/merged with $schema (user keys preserved)
.opencode/.sdd-version           # Installed methodology version

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

---

## Technologies

- [AGENTS.md](https://agents.md/) — universal AI instructions standard
- [Claude Code](https://claude.ai/code) — Anthropic CLI
- [Cursor](https://cursor.sh) — AI IDE
- [OpenCode](https://opencode.ai) — open-source AI development agent

## License

MIT
