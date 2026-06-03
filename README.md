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

`/refacil:setup`:

1. Scaffolds **`AGENTS.md`**, **`.agents/`**, **`refacil-sdd/changes/`**, and project branch configuration (everything the methodology needs for **this codebase**).
2. Runs **`refacil-sdd-ai sync-repo-ide`** from the **repository root** so per-repo stubs and excludes match **your IDE selection from `init`** (`~/.refacil-sdd-ai/selected-ides.json`): **`CLAUDE.md`**, **`.cursorrules`**, **`.claudeignore`**, **`.cursorignore`**, **`.opencodeignore`**, plus **`compact-guidance`** / **`testing-policy`** markers when **`AGENTS.md`** / **`.agents/testing.md`** exist (same logic as **`init`** / **`update`** for those files).

You can run **`refacil-sdd-ai sync-repo-ide`** manually anytime from the repo root (e.g. after changing IDE selection). It does **not** reinstall global skills — only repo-local files driven by **`selected-ides.json`** (with the same fallback detection as **`update`** when that file is missing).

Skills will prompt you to run `/refacil:setup` if the repo index is missing.

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

In Claude Code, Cursor, Codex, and OpenCode the `check-update` hook (every session / `session.created`) runs `refacil-sdd-ai check-update`: syncs skills, `compact-guidance`, optional CodeGraph reindex, and cleans leftover project-level `refacil-*` artifacts. OpenCode invokes the same CLI via `node <package>/bin/cli.js check-update` from the global plugin. Only if a pending methodology migration is detected does `notify-update` prompt `/refacil:update` — otherwise the user is not interrupted.

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
| `refacil-sdd-ai sync-repo-ide` | Repo-only: `CLAUDE.md`, `.cursorrules`, ignore files, compact-guidance + testing-policy markers — IDE list from `selected-ides.json` (same as `/refacil:setup` Step 4b–5). No global reinstall |
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
| `refacil-sdd-ai sdd status <name> [--json]` | Artifact and task status for one change. `ready.forApply` requires `proposal.md`, `design.md`, `tasks.md`, and specs from `specs.md` and/or recursive `specs/**/*.md` |
| `refacil-sdd-ai sdd mark-reviewed <name>` | Write `.review-passed` (requires `--verdict`, `--summary`, counts) |
| `refacil-sdd-ai sdd tasks-update <name>` | Mark a task done (`--task N --done`) |
| `refacil-sdd-ai sdd archive <name>` | Move a regular change to `refacil-sdd/changes/archive/` |
| `refacil-sdd-ai sdd validate-name <name>` | Validate change folder name (must start with a letter) |
| `refacil-sdd-ai sdd config [--json]` | Show effective configuration (protectedBranches, baseBranch, artifactLanguage) after cascade: project `refacil-sdd/config.yaml` → global `~/.refacil-sdd-ai/config.yaml` → built-in defaults. `--json` also includes a `sources` field indicating the resolution level for each value (`project`, `global`, or `default`). |
| `refacil-sdd-ai sdd write-config [--global] [--base-branch <v>] [--protected-branches <csv>] [--artifact-language <lang>]` | Write or merge config into `refacil-sdd/config.yaml` (project) or `~/.refacil-sdd-ai/config.yaml` (`--global`). Performs a semantic no-op check — skips rewrite if values are already set. Directory is auto-created if absent. |

Run **`refacil-sdd-ai help`** for the full list including `bus` and `compact` subcommands.

### read-spec — on-device voice reading of SDD artifacts

Opens a Markdown file or a complete SDD change folder in the browser and reads it aloud using **on-device TTS** (Supertonic/Kokoro via ONNX). No audio is sent to any server — synthesis runs entirely in the browser.

```bash
# Single file
refacil-sdd-ai read-spec --file refacil-sdd/specs/my-feature/spec.md

# Full SDD change folder (proposal + design + tasks + specs in a sidebar)
refacil-sdd-ai read-spec --change my-feature-change

# Archived change folder (path relative to refacil-sdd/changes/)
refacil-sdd-ai read-spec --change archive/2026-05-20-my-feature-change
```

| Option | Default | Description |
|---|---|---|
| `--file <path>` | — | Single Markdown file (must be inside the project root) |
| `--change <name>` | — | Load all SDD artifacts for a change folder; accepts `archive/<date>-<name>` paths too |
| `--select <file.md>` | `proposal.md` | Pre-select a specific file when using `--change` |
| `--lang <code>` | auto | TTS language (`es`, `en`, …). Defaults to `artifactLanguage` from the SDD meta comment |
| `--voice <id>` | `M3` | Voice style: `M1`–`M5` or `F1`–`F5` |
| `--speed <n>` | `1` | Playback speed 0.9–1.5 |

#### File mode vs folder mode

| | File mode (`--file`) | Folder mode (`--change`) |
|---|---|---|
| Sidebar | Hidden — content fills the full width | Shows all `.md` files in the change folder |
| Navigation | Sections within the single file | Sections within the active file + **auto-advances to next file** when the last section finishes |
| Use case | Quick review of a single spec | Full walkthrough: proposal → design → tasks → specs in one uninterrupted session |

#### TTS pipeline

- **Bilingual synthesis**: Spanish text is split into segments; English technical terms (`HTML`, `CSS`, `API`, camelCase identifiers, file paths, CLI flags, etc.) are synthesized with the English voice engine. Both segments are concatenated into a single audio buffer with no perceptible gap.
- **Markdown rendering**: [`marked.js`](https://marked.js.org/) (loaded via CDN) renders headings, lists, tables, code blocks, bold/italic, and blockquotes as HTML. Falls back to plain text if the CDN is unavailable (offline mode).
- **TTS text pipeline** — what gets stripped or transformed before synthesis:
  - **Named code blocks** (` ```typescript `) → `"code block: typescript"` (source is not read aloud)
  - **Unlabeled code blocks** (` ``` `) → body is read as plain text (diagrams, dependency graphs)
  - **Markdown tables** → header label (`"tabla: ColA, ColB."`) followed by each data row as a comma list
  - **HTML tag mentions** (e.g. `` `<table>` ``) → tag name only (`"table"`)
  - **Arrows** (`→`) → `"arrow"`; emojis are removed
  - **Paragraph lines** without terminal punctuation → period appended (natural TTS pause)
  - **List items** → comma after each item except the last, which gets a period (enumeration rhythm)
- **On-device**: models are downloaded from HuggingFace on the first visit and cached in the browser. Subsequent opens are instant. No data leaves the machine.

#### Artifact Language

`read-spec` detects the `artifactLanguage` meta comment at the top of the Markdown file (e.g. `<!-- refacil-sdd: artifactLanguage=spanish -->`) and sets the primary TTS language automatically. The `--lang` flag overrides it.

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

### Kapso notifications (`kapso`)

[Kapso](https://docs.kapso.ai/docs/whatsapp/send-messages/text) is a WhatsApp notification service. You'll need a Kapso account to obtain `KAPSO_API_KEY` and `KAPSO_PHONE_NUMBER_ID`.

| Command | Description |
|---|---|
| `refacil-sdd-ai kapso setup` | Interactive setup of Kapso WhatsApp notification credentials (`~/.refacil-sdd-ai/kapso.env`) |

### Command rewrite control (`compact-bash`)

| Command | Description |
|---|---|
| `refacil-sdd-ai compact stats` | Statistics (compact-bash hook + CodeGraph) and estimated tokens/USD |
| `refacil-sdd-ai compact log-codegraph-event` | Log a sub-agent CodeGraph session (`--skill`, `--has-graph`, `--tool-calls`, `--tokens`) |
| `refacil-sdd-ai compact enable` | Re-enable rewriting |
| `refacil-sdd-ai compact disable` | Disable rewriting without uninstalling |
| `refacil-sdd-ai compact clear-log` | Clear `~/.refacil-sdd-ai/compact.log` |
| `refacil-sdd-ai compact codegraph-clear-log` | Clear `~/.refacil-sdd-ai/codegraph.log` |

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
> **Cross-repo coordination** (ask requests, room agreements, `/refacil:propose`, closing to the requester): after `init`, the file **`BUS-CROSS-REPO.md`** is available in each selected IDE's global `refacil-prereqs` skill folder — e.g. `~/.claude/skills/refacil-prereqs/`, `~/.cursor/skills/refacil-prereqs/`, `~/.config/opencode/skills/refacil-prereqs/`, `~/.codex/skills/refacil-prereqs/` (or your `OPENCODE_CONFIG_DIR` skills path).

---

## Available IDE Skills

All invoked as `/refacil:<name>` in Claude Code, Cursor, OpenCode, or Codex.

### SDD cycle

| Skill | Usage |
|---|---|
| `/refacil:setup` | Generate AGENTS.md, `.agents/`, `refacil-sdd/changes/`, branch config; **`sync-repo-ide`** (stubs, ignores, session markers for IDEs chosen in **`init`**) |
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
| `/refacil:stats` | Show change progress, task status, review gate, and test commands from SDD artifacts |
| `/refacil:status` | Show which phase of the SDD-AI cycle a change is in and the exact command to resume it |
| `/refacil:read-spec` | Listen to change specs in the browser with on-device TTS |
| `/refacil:autopilot` | Autonomous pipeline: chains apply → test → verify → review → archive in one invocation; up-code (push + PR) is optional and configured in pre-flight. Optional WhatsApp notification via `~/.refacil-sdd-ai/kapso.env` |

### Automatic sub-agents (v3.0.0+)

Some skills delegate their heavy work to **sub-agents** that run in isolated context (they do not saturate the main session with mass reads). They are invoked automatically by the corresponding skill — do not call them directly.

| Skill | Sub-agent | Role | Can write |
|---|---|---|---|
| `/refacil:explore` | `refacil-investigator` | Reads codebase, enriches with AGENTS.md, queries cross-repo bus | No |
| `/refacil:verify` | `refacil-validator` | Validates CA/CR vs spec; runs tests only when `testExecution: full` or smoke after fixes (§3.2) | No |
| `/refacil:review` | `refacil-auditor` | Evaluates changes against the quality checklist | No |
| `/refacil:test` | `refacil-tester` | **Canonical test phase**: generates tests, runs scoped suite + coverage, writes `memory.commandsRun` | Yes (test files) |
| `/refacil:apply` | `refacil-implementer` | Reads SDD artifacts and implements all change tasks | Yes (source code) |
| `/refacil:bug` | `refacil-debugger` | `investigation` mode: analyzes root cause without modifying anything. `fix` mode: implements the fix, generates regression tests, creates `summary.md` | Only in fix mode |
| `/refacil:propose` | `refacil-proposer` | Explores the codebase and generates proposal, specs, design, and tasks | Yes (SDD artifacts) |

**Common properties**: specialized system prompt, direct-invocation guardrail, output contract with a fenced JSON block per skill. Read-only sub-agents (`investigator`, `validator`, `auditor`) do not have `Edit`/`Write`. Write sub-agents (`tester`, `implementer`, `debugger`, `proposer`) do.

**Model**: `refacil-proposer` runs with `model: opusplan` (uses Opus during plan mode for highest-stakes planning, then switches to Sonnet for execution). Other sub-agents use `model: sonnet` by default for Claude Code, others use inherit model.

**Multi-platform**: `.claude/agents/refacil-*.md` uses `tools:` (granular allowlist). `.cursor/agents/refacil-*.md` is auto-generated: `readonly: true` for agents without `Edit`/`Write`, `readonly: false` for those that have them; always `model: inherit`. `.opencode/agents/refacil-*.md` is auto-generated via `transformFrontmatterForOpenCode()`: converts `tools:` to a `permission:` block (`edit: allow/deny`, `bash: allow/deny`, `webfetch: deny`), adds `mode: subagent`, adds `hidden: true` for internal agents, and removes `model:`. `.codex/agents/refacil-*.toml` is auto-generated via `convertAgentToToml()`: extracts `name` and `description` from the YAML frontmatter and places the Markdown body in `developer_instructions = """..."""`. The installer transforms the frontmatter automatically for all four IDEs.

**Two-pass `refacil:bug` flow**: the wrapper first invokes the sub-agent in `investigation` mode (writes nothing) → the user confirms the hypothesis and approves the fix → the wrapper validates the working branch → invokes the sub-agent in `fix` mode to implement.

### Component-bounded testing (monorepos)

In a monorepo, **no phase ever runs the entire monorepo's test suite** — each phase scopes execution to the **affected component(s)** only. This `component-bounded` principle is defined in `skills/prereqs/METHODOLOGY-CONTRACT.md` (§3 / §3.1 / §3.2).

- **Scope resolution**: `test-scope` resolves every changed file to its owning component (`findModuleRoot` → `affectedComponents`) and runs that component's real test command from its own root (`cd <component> && …`), language-agnostic (Node, Python, Go, Rust, Java/Maven/Gradle, C#/dotnet…). Test files passed directly are recognized as their own scope.
- **`/refacil:apply` never runs the full suite**: it runs a smoke check of what it modified, or skips and delegates the full run to `/refacil:test` (overrides the §3.1 "unreliable scope → run baseline" clause).
- **`/refacil:test` is the only phase that runs a full suite** — and only for the affected component. A re-run covers just the previously failing tests, not the whole suite again.
- **`/refacil:verify`, `/refacil:review`, and `/refacil:archive` do not re-execute tests**: they consume the evidence recorded by `/refacil:test` in `memory.yaml`. In autopilot, missing/stale evidence aborts instead of silently widening the test scope.

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

**Optional token-reduction layer**: if `.codegraph/` exists at the repo root (created by
`refacil-sdd-ai codegraph init` via `/refacil:setup` when `codegraphMode` is `enabled`),
exploratory sub-agents use CodeGraph symbol queries instead of file reads, reducing token
consumption ~71% in the `/refacil:explore`, `/refacil:propose`, and `/refacil:bug`
(investigation phase) flows. This layer is transparent — skill invocation and output contracts
are unchanged.

From there, the full cycle is (after `/refacil:propose` you choose step-by-step or autonomous — see note below):

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
         │ ┌─────────────────────────────┐
         ├─┤ read-spec --change <name>   │ ← optional
         │ │ (listen to proposal, specs, │
         │ │  design & tasks by voice;   │
         │ │  auto-advances file by file)│
         │ └─────────────────────────────┘
         ▼       │
  ┌──────────────┴──────────┐
  │ Continue implementation?│
  └────┬──────────────┬─────┘
       │              │
  A: step-by-step     │ B: autonomous
       │              │
       ▼              ▼
  /refacil:      /refacil:
  apply          autopilot ──────────────────────────────┐
       │         (internally chains:                      │
       ▼          apply → test → verify → review          │
  /refacil:       → archive → [up-code, optional])        │
  test                │                                   │
       │              │ on finish:                        │
       ▼              │ WhatsApp via Kapso                │
  /refacil:           │ (if configured)                   │
  verify              ▼                                   │
  (CA/CR; tests  PR created or archive-only ◄─────────── ┘
   delegated to  (depends on pre-flight up-code choice)
   delegated to
   test phase;
   max 2 autofix
   smoke only)
       │
       ▼
  /refacil:review
  (generates .review-passed)
       │
       ▼
  /refacil:archive
  (feature: moves to archive/ + syncs specs
   bug: fix-*/spec.md + review.yaml)
       │
       ▼
  /refacil:up-code
  (checks review +
   commit + push + PR)
       │
       ▼
  PR created
```

> **After `/refacil:propose` is approved**, two continuation options are offered:
> - **`/refacil:apply`** (option A) — step-by-step: each phase (apply → test → verify) pauses for your confirmation.
> - **`/refacil:autopilot`** (option B) — autonomous: chains apply → test → verify → review → archive in one invocation. During pre-flight you decide whether to include up-code (push + PR) or end the cycle at archive. The pipeline adapts: with up-code it ends at a PR; without up-code it ends at archive. Optional WhatsApp notification via Kapso in both cases (configure with `refacil-sdd-ai kapso setup`). Path B is fully independent — it handles review, archive, and optionally up-code internally without merging into path A.
>
> **`read-spec --change <name>`** is an optional review step between propose and the implementation choice. It opens the change folder in the browser and reads proposal, design, tasks, and specs aloud in order, auto-advancing between files. Use it to absorb the scope of a change hands-free before committing to implementation.

---

## Autonomous Mode

Run the full post-proposal SDD cycle without manual intervention using `/refacil:autopilot`. After `/refacil:propose` is approved, a single command chains **apply → test → verify → review → archive** and, depending on your pre-flight choice, optionally continues with **up-code** (commit + push + PR). You decide in the pre-flight whether to include up-code or end the cycle at archive. The pipeline adapts accordingly and always sends the Kapso notification and prints the terminal summary when it finishes.

### One-time Kapso setup (optional — required for WhatsApp notifications)

```bash
refacil-sdd-ai kapso setup
```

This prompts for `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, and `NOTIFY_PHONE` (E.164 format), then writes `~/.refacil-sdd-ai/kapso.env` with `chmod 600`. You only need to run this once. Autopilot works without it — you just won't receive a WhatsApp notification.

> **Getting your Kapso credentials**: see [Kapso docs → Introduction](https://docs.kapso.ai/docs/whatsapp/send-messages/text) for how to create an account, get your API key, and configure a phone number sender.


**Two-layer review gate**:
- `/refacil:up-code` detects a missing `.review-passed` and **automatically runs `/refacil:review`** before pushing.
- The `check-review` hook also intercepts manual `git push` commands and **blocks** the operation if it is missing. The hook does not invoke skills — it only blocks and instructs.

**Behavior on failure**:
- Autopilot stops at the failing phase, preserves the working tree for inspection, records the relevant evidence, and sends a Kapso failure notification when configured.
- Normal recovery does not use destructive reset commands. The developer decides how to keep, fix, or discard local edits after reviewing the evidence.

**Archive**:
- For features/improvements: the archive flow moves artifacts to `archive/` and persists `.review-passed` fields to `review.yaml` inside each affected spec. Specs can live in `specs.md`, recursive `specs/**/*.md`, or both; `sync-spec` consumes the same source set as `sdd status`.
- For bugs: `fix-*` folders are the operational exception to regular proposal readiness. They archive with `summary.md`, regression test evidence, and `.review-passed`, then create `refacil-sdd/specs/fix-*/spec.md` in standard format + `review.yaml`.
- A single branch can accumulate multiple bugs, each in its own independent `fix-*/` folder.
- `/refacil:archive` always requests one or more **task references** associated with the change before proceeding. Accepted formats: URL, ticket/issue identifier, or task name. References are stored in `review.yaml` under the `taskReferences` field (YAML list). This field is mandatory — archiving does not proceed until the user provides at least one reference.
- `/refacil:archive` uses current `/refacil:test` evidence from `memory.yaml` by default. In normal mode it asks before continuing if evidence is missing or stale; in autopilot mode it aborts instead of silently re-running or widening tests.

---

## Automatic Hooks

Installed during `init` / `update` for each selected IDE. The same four behaviors are active in Claude Code, Cursor, OpenCode, and Codex — each through its own delivery mechanism.

| Behavior | Claude Code | Cursor | OpenCode | Codex |
|---|---|---|---|---|
| **check-update** | `SessionStart` → `refacil-sdd-ai check-update` | `sessionStart` → same CLI (single entry; no `workspaceOpen` duplicate) | `session.created` → same CLI (`node …/bin/cli.js check-update`) | `sessionStart` → same CLI |
| **notify-update** | `UserPromptSubmit` hook | `beforeSubmitPrompt` hook | `tui.prompt.append` handler | `userPromptSubmit` hook in `~/.codex/config.toml` |
| **compact-bash** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool | `preToolUse` hook (Bash matcher) in `~/.codex/config.toml` |
| **check-review** | `PreToolUse` (Bash) hook | `PreToolUse` (Bash) hook | `tool.execute.before` handler for bash tool | `preToolUse` hook (Bash matcher) in `~/.codex/config.toml` |

| Behavior | What it does |
|---|---|
| `check-update` | On startup: deletes `.refacil-pending-update` if no migration is pending (stale flags). Then: npm check, sync skills, **compact-guidance**, **CodeGraph** auto-init/reindex when enabled. If skills were synced **and** a migration is pending, writes the flag for `notify-update`. Always refreshes the flag content when a migration is pending (keeps the `to` version current). Repo root: `CURSOR_PROJECT_DIR` / `CLAUDE_PROJECT_DIR`, then Cursor `workspace_roots` from stdin, then `.git` traversal (never the embedded `refacil-sdd-ai/` package inside a monorepo). |
| `notify-update` | If the flag exists **and** a methodology migration is pending (same table as `/refacil:update`), injects the instruction before the agent processes the next user message; if the sync happened without a migration, the flag is not created or is discarded silently. |
| `compact-bash` | Silently rewrites bare Bash commands. No extra turns, the IDE does not see the change. Requires Claude Code >= 2.1.89 for the `updatedInput` path. |
| `check-review` | Intercepts `git push` and blocks if an active change has started implementation (`tasks.md` with ≥1 `[x]`) without `.review-passed`. |

> **OpenCode plugin**: a single file installed in the global OpenCode plugins directory implements all four behaviors. `session.created` shells out to the same `check-update` CLI as the other IDEs (not a partial reimplementation). For `compact-bash` it loads `rules.js` co-installed in `~/.config/opencode/plugins/` alongside `refacil-hooks.js`, with fallback to `lib/compact/rules.js` from the npm package — no duplicated rewrite logic. If the rules file is not resolvable, compact-bash is disabled gracefully with a warning to stderr; the plugin never crashes the session.

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
- Zero config: the broker auto-spawns the first time a skill needs it (`127.0.0.1:7821`, fallback 7822/7823). If all three fixed candidates are occupied by external processes, the broker binds an OS-assigned ephemeral port instead of failing — clients discover the actual port automatically.
- **Port override (`REFACIL_BUS_PORT`)**: set this env var when the broker spawns to bind a specific port exclusively — a fixed number (e.g. `REFACIL_BUS_PORT=9000`), or `0` to force an OS-assigned ephemeral port. Useful in CI or sandboxed environments where `7821-7823` are unavailable or reserved.
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

# OpenCode (if selected)  — all platforms: ~/.config/opencode/  (override: OPENCODE_CONFIG_DIR)
~/.config/opencode/skills/refacil-*/    # OpenCode skills
~/.config/opencode/agents/refacil-*.md  # OpenCode sub-agents (permission block + mode:subagent)
~/.config/opencode/plugins/refacil-hooks.js  # Plugin: session.created + tui.prompt.append + tool.execute.before
~/.config/opencode/plugins/refacil-check-review.js  # Shared git push review gate (used by refacil-hooks.js)

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

The per-repo step is **`/refacil:setup`** once per project. It generates the **project index** (**`AGENTS.md`**, **`.agents/`**, **`refacil-sdd/changes/`**) and invokes **`refacil-sdd-ai sync-repo-ide`**, which writes **stub + ignore files** according to **`~/.refacil-sdd-ai/selected-ides.json`** (no need for `.claude/` / `.cursor/` folders in the repo). **Skills and hooks remain global**, not copied into the project.

```
# Shared — project index from /refacil:setup; stubs + ignores from sync-repo-ide / selected IDE list
CLAUDE.md                    # Minimal index → AGENTS.md (if Claude Code is in your IDE selection)
.cursorrules                 # Same role for Cursor if Cursor is selected
.claudeignore                # Base exclusions (node_modules, dist, .env, …) when Claude is selected
.cursorignore                # Same template as .claudeignore when Cursor is selected
.opencodeignore              # Same when OpenCode is selected
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

## Third-party integrations

### CodeGraph (optional)

- **Author**: Colby McHenry
- **License**: MIT
- **Repository**: https://github.com/colbymchenry/codegraph
- **Purpose**: When present, reduces token consumption ~71% in exploratory sub-agents
  (`refacil-investigator`, `refacil-proposer`, `refacil-debugger`) by querying an indexed call graph
  instead of reading source files directly. The methodology works without it — CodeGraph is purely optional.

**How it works**: after `refacil-sdd-ai init` sets `codegraphMode: enabled`, the setup step
(`/refacil:setup`) runs `refacil-sdd-ai codegraph init` in the background. This creates a `.codegraph/`
directory at the repo root. Exploratory sub-agents detect `.codegraph/` at the start of each session
and prefer CodeGraph symbol queries (`codegraph_search`, `codegraph_callers`, `codegraph_callees`,
`codegraph_context`, `codegraph_impact`) over raw file reads.

**Opt-out** at any time:

```bash
refacil-sdd-ai sdd write-config --global --codegraph disabled
```

Or set `codegraphMode: disabled` in `~/.refacil-sdd-ai/config.yaml`.

**Modes**:

| Mode | Behavior |
|---|---|
| `enabled` | Auto-index every repo on `/refacil:setup` (recommended) |
| `per-repo` | Ask once per project during `/refacil:setup` |
| `disabled` | Never use CodeGraph |

Configure during `refacil-sdd-ai init` or at any time:

```bash
refacil-sdd-ai sdd write-config --global --codegraph enabled
```

## Technologies

- [AGENTS.md](https://agents.md/) — universal AI instructions standard
- [Claude Code](https://claude.ai/code) — Anthropic CLI
- [Cursor](https://cursor.sh) — AI IDE
- [OpenCode](https://opencode.ai) — open-source AI development agent
- [Codex](https://github.com/openai/codex) — OpenAI CLI agent

## License

MIT
