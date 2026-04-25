Full project instructions: see `AGENTS.md`. If missing, run `/refacil:setup`.

## SDD-AI Methodology

Skills are identical in `.claude/skills/refacil-*/` (Claude Code) and `.cursor/skills/refacil-*/` (Cursor). Installed by `refacil-sdd-ai init`.

| Command | Description |
|---------|-------------|
| `/refacil:setup` | Generate `AGENTS.md`, `.agents/`, `refacil-sdd/changes/`, and IDE index files for the project |
| `/refacil:guide` | Interactive guide — which command to use |
| `/refacil:explore` | Explore the codebase without changes |
| `/refacil:propose` | Create a change proposal |
| `/refacil:apply` | Implement change tasks |
| `/refacil:test` | Generate unit tests |
| `/refacil:verify` | Validate implementation vs specs |
| `/refacil:review` | Quality checklist review |
| `/refacil:archive` | Archive a completed change |
| `/refacil:up-code` | Push code and create PR |
| `/refacil:bug` | Guided bugfix flow |
| `/refacil:update` | Apply pending **methodology** migrations (same engine as `notify-update`; e.g. `AGENTS.md` → `.agents/` index pattern) |

**Typical feature flow:** `setup` → `explore` (optional) → `propose` → `apply` → `test` → `verify` → `review` → `archive` → `up-code`.

**Bug flow:** `bug` replaces `propose`/`apply` for the fix path; then `test` / `review` / `archive` / `up-code` as appropriate (see skill `refacil:bug`).

**Legacy layout:** if the repo still has **`openspec/changes/`**, run any **`refacil-sdd-ai sdd …`** command or open a session ( **`check-update`** ) to migrate into **`refacil-sdd/`**; then remove **`openspec/`** when no longer referenced. Optional OpenSpec CLI (**`opsx:*`**) may coexist; SDD-AI uses **`refacil-sdd/`** and **`/refacil:*`** as the primary interface.

## Inter-agent bus (refacil-bus)

Local plain-text channel between Claude Code / Cursor sessions running in different repos. Prevents the developer from manually transcribing context between their own agents.

| Command | Description |
|---------|-------------|
| `/refacil:join <room>` | Create or join a room. First time generates an introduction block in `AGENTS.md`. |
| `/refacil:say "..."` | Broadcast to the entire room. |
| `/refacil:ask @name "..." [--wait N]` | Directed question; `@all` (or `*`) asks everyone in the room. `--wait N` blocks until the first response or N sec. |
| `/refacil:reply "..."` | Reply to the last directed question (auto-fills `correlationId`). |
| `/refacil:attend` | Active listen mode: receives questions and the LLM answers them, then re-invokes to keep listening. |
| `/refacil:inbox` | View new messages since the last read. |

Typical usage: before starting a task that may require context from other repos, the developer puts the agent in each other repo into `/refacil:attend`. Then, in their working repo, the LLM can request context with `/refacil:ask @<repo> "..." --wait` and receive the response automatically without the developer switching between windows.

If changes affecting a repo are agreed upon in the room, the SDD-AI flow (`/refacil:propose`, etc.) is followed in that repo and the implementer **notifies via the bus** when done (details in `refacil-prereqs/BUS-CROSS-REPO.md` in the package). **`ask` requests that involve work** in another repo must include **clear scope**; the destination uses **`/refacil:propose`** by convention. See skill `/refacil:ask`.

Useful CLI for the developer: `refacil-sdd-ai bus view` (opens web UI in browser), `bus watch <session>` (terminal panel), `bus status`, `bus rooms`. These do not consume tokens.

## Project documentation structure

Project detail lives in `.agents/` — one `.md` file per area (summary, architecture, stack, testing, commands...).
`AGENTS.md` is the index: one line per file indicating what it contains and when to read it.
`CLAUDE.md` and `.cursorrules` are minimal indices that only point to `AGENTS.md` — they contain no project detail.

## Token efficiency (automatic)

- The `check-update` hook at `SessionStart` syncs the `compact-guidance` block in `AGENTS.md`.
- The block defines compact output rules (range reads, bounded searches, summarized test/log output).
- If `AGENTS.md` does not exist yet, the sync is skipped without error.
- Do not manually edit content between the `compact-guidance` markers; it is overwritten automatically.
