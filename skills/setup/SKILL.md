---
name: refacil:setup
description: Configure the repository for SDD-AI — refacil-sdd layout, AGENTS.md / .agents/, IDE indexes, and methodology hooks
user-invocable: true
---

# refacil:setup — Repository Configuration

Guides the developer **step by step**. After each step, report the result; if it fails, **stop** and give the error. Installation or PATH failures: see [troubleshooting.md](troubleshooting.md) in this skill (`refacil-setup`).

## Process

### Step 1: Node.js

`node --version` >= 20.19.0. If not: indicate the requirement and stop.

### Step 2: Verify refacil-sdd-ai

```bash
refacil-sdd-ai --version 2>&1
```

Verify the CLI is installed. If it fails: `npm install -g refacil-sdd-ai`, re-verify. If it still fails: indicate the user to install Node.js >= 20.19.0 and retry.

Verify the `sdd` subcommand is available:

```bash
refacil-sdd-ai sdd 2>&1 || true
```

Confirm that the subcommands `status`, `mark-reviewed`, `tasks-update`, and `archive` appear in the help.

### Step 3: Create changes directory

If `refacil-sdd/changes/` does not exist, create it:

```bash
mkdir -p refacil-sdd/changes
```

Inform the user that SDD artifacts will be stored in `refacil-sdd/changes/<change-name>/`.

### Step 3b: Branch configuration (project-level)

Check and optionally set project-specific branch configuration that overrides the global config.

**3b.1 Show inherited values** — run:

```bash
refacil-sdd-ai sdd config --json
```

Parse the JSON output and display the effective values with their source:

```
  baseBranch [<source>]: <value>
  protectedBranches [<source>]: <value>
```

Where `<source>` is one of `project`, `global`, or `default`.

**3b.2 Check for existing project config** — if `refacil-sdd/config.yaml` already exists, show its current values and ask the user if they want to update them. If the user declines, skip to Step 4.

**3b.3 Ask for project-level overrides** — prompt the user:

```
Do you want to set project-specific branch configuration?
  baseBranch (inherited: <value> from <source>):
  protectedBranches (inherited: <value> from <source>):
Press Enter to skip and inherit the values shown above.
```

- If the user provides values: run `refacil-sdd-ai sdd write-config --base-branch <v> --protected-branches <csv>` (no `--global` flag — this writes to `refacil-sdd/config.yaml`).
- If the user skips (presses Enter or provides no values): do **not** write any file. Project will inherit from global or defaults.

**3b.4 Confirm the result** — after writing (or skipping), show the new effective config:

```bash
refacil-sdd-ai sdd config
```

### Step 4: Generate `.agents/` and `AGENTS.md`

Analyze the repo and generate the documentation structure. If they already exist, ask whether to regenerate.

**4.1 Analysis** — Read if they exist: `package.json`, `tsconfig*.json`, `nest-cli.json`, `angular.json`, `README.md`, eslint, jest, `ls` root, Docker, `.env.example`.

**4.2 Mandatory architecture: `.agents/` folder + `AGENTS.md` index**

Always generate this structure — never a monolithic file:

Create the `.agents/` folder with one `.md` file per thematic area. Typical files (adapt to the actual project):
- `.agents/summary.md` — brief description, table (language, framework, tests, package manager), essential scripts with one sentence each, critical rules condensed (Always / Never / Ask, max 5 bullets each block).
- `.agents/architecture.md` — modules, services, main flows, key patterns.
- `.agents/stack.md` — dependencies, environment variables, databases, integrations.
- `.agents/testing.md` — strategy, commands, conventions, fixtures.
- `.agents/commands.md` — development commands, aliases, CI/CD scripts.

A monorepo may add `.agents/services.md`; a library may combine testing in stack. Adapt to the project.

`AGENTS.md` is the **pure index** — it does not contain project detail, only:
1. One line describing the project.
2. For each file in `.agents/`: area name + relative link + when to read that file (one sentence).
3. Section `## SDD-AI Methodology` with the complete table of `refacil:*` commands — always in `AGENTS.md`, never in `.agents/`. If it already exists, overwrite it with the updated content; if not, create it.
4. `compact-guidance` block (auto-managed by `refacil-sdd-ai`, do not edit).

**Mandatory content of `## SDD-AI Methodology`** (insert literally, before the `compact-guidance` block):

```markdown
## SDD-AI Methodology

| Command | Description |
|---------|-------------|
| `/refacil:setup` | Install and configure the methodology in the repo |
| `/refacil:guide` | View flow guide and choose next step |
| `/refacil:explore` | Explore the codebase without modifying files |
| `/refacil:propose` | Create a change proposal (proposal, specs, design, tasks) |
| `/refacil:apply` | Implement the tasks of an approved proposal |
| `/refacil:test` | Run and review tests for the current change |
| `/refacil:verify` | Verify implementation against the specs |
| `/refacil:review` | Quality audit of the implemented code |
| `/refacil:archive` | Archive the change and sync specs to the historical record |
| `/refacil:up-code` | Update existing code to current patterns |
| `/refacil:bug` | Create a fix proposal for a detected bug |
| `/refacil:update` | Migrate documentation to the current methodology pattern |
| `/refacil:join` | Join the cross-repo bus (first service setup) |
| `/refacil:say` | Send a message to another agent via bus |
| `/refacil:ask` | Make a query to another agent and wait for response |
| `/refacil:reply` | Reply to a query received via bus |
| `/refacil:attend` | Attend and respond to pending bus messages |
| `/refacil:inbox` | View pending messages on the bus |
```

**4.3 Fallback** — If the analysis fails: create `.agents/summary.md` with minimal summary + refacil table + TODOs, and `AGENTS.md` as an index pointing to that single file.

**4.4** — Show the result to the user; if they approve, write the files.

**4.5 compact-guidance block**:
- `refacil-sdd-ai` injects into `AGENTS.md` a block between `compact-guidance` markers with compact output rules.
- Automatically synced on each `SessionStart`. Do not edit the content between markers.

### Step 4b: Overwrite `CLAUDE.md` and `.cursorrules`

Before writing IDE-specific files, detect installed IDE directories in repo root (`.claude/`, `.cursor/`, `.opencode/`).  
Only create/update files for IDEs whose directory exists. Never create files for an IDE that is not present.

Rules:
- If `.claude/` exists: overwrite `CLAUDE.md`.
- If `.cursor/` exists: overwrite `.cursorrules`.
- If both exist: overwrite both.
- If neither exists: do not create either file; report that no supported IDE folder was detected and suggest running `refacil-sdd-ai init`.

When created, these files are thin indexes toward `AGENTS.md` and must not contain project detail.

**`CLAUDE.md`** — minimal index, no project content:

```
# CLAUDE.md

Full project context: see `AGENTS.md` (index) and `.agents/` (detail by area).
If `AGENTS.md` does not exist, run `/refacil:setup`.
```

**`.cursorrules`** — identical content with header `# Cursor Rules`.

All project detail, stack, rules and `refacil:*` commands live in `.agents/` and are indexed from `AGENTS.md`. Do not duplicate anything in CLAUDE.md or .cursorrules.

### Step 5: Context exclusion files

Sync ignore files only for detected IDE directories:
- `.claude/` → `.claudeignore`
- `.cursor/` → `.cursorignore`
- `.opencode/` → `.opencodeignore`

Do not create `.claudeignore`, `.cursorignore`, or `.opencodeignore` if the matching IDE directory does not exist.

If the files already exist, only missing entries are added — custom content is not overwritten.

Inform the user of the result:
- **Created**: the detected IDE ignore file(s) were created from scratch.
- **Updated**: missing entries were added.
- **No changes**: they already had all the entries.

If the user wants to customize additional exclusions, they can edit them directly after setup.

### Step 6: Verify skills

- Refacil: verify `refacil-*` folders only under detected IDE directories:
  - `.claude/` detected → check `.claude/skills/`
  - `.cursor/` detected → check `.cursor/skills/`
  - `.opencode/` detected → check `.opencode/skills/`
  If missing for any detected IDE: run `refacil-sdd-ai init` and restart session.
- Verify `sdd` subcommand: `refacil-sdd-ai sdd 2>&1 || true` — must show subcommands `status`, `mark-reviewed`, `tasks-update`, `archive`.

### Step 7: Final summary

```
=== refacil:setup completed ===
 Node.js / refacil-sdd-ai / refacil-sdd/changes/ / branch config / AGENTS.md / IDE files (detected only) / ignore files (detected only) / skills OK

 Restart Claude Code or Cursor session if this is the first skills installation.
 The next step is to review the available flow.
 Do you want me to continue with /refacil:guide?
```

## Rules

- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 7, immediately invoke the **Skill tool** with `skill: "refacil:guide"`. Do not describe it in text or wait for the user to type `/refacil:guide`. (See `METHODOLOGY-CONTRACT.md §5`.)
