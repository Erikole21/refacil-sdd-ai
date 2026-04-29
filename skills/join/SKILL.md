---
name: refacil:join
description: Join (or create) an agent bus room to communicate with Claude Code / Cursor sessions in other repos. Session name = repo folder name.
user-invocable: true
---

# refacil:join — Join the agent bus

Starts or joins a `refacil-bus` room (local chat room between agents). Argument **$ARGUMENTS** = room name.

## Purpose of joining

Joining a room enables **cross-repo, multi-agent integration work**. The expected use is:
- consult another repo as source of truth for integration contracts
- clarify input/output behavior across service boundaries
- coordinate contract-aligned changes following SDD-AI in each repo

Do not treat the room as general chat. Keep interactions focused on integration uncertainty and ownership.

## Instructions

### Step 1: Verify that the presentation block exists in `AGENTS.md`

Before joining, this session must have a presentation in `AGENTS.md` so other agents know what to ask you.

1. Read the `AGENTS.md` file in the current repo.
2. Look for the block delimited by:
   ```
   <!-- refacil-bus:presentation:start -->
   ...
   <!-- refacil-bus:presentation:end -->
   ```

**If the block EXISTS**: skip to Step 3.

**If the block does NOT EXIST**: continue to Step 2.

### Step 2: Generate the presentation block (only if it does not exist)

Write a block following this EXACT template between the markers:

```
<!-- refacil-bus:presentation:start -->
Stack: <framework + language>
Domain: <what this repo does in 1-2 lines>
Ask me about: <short list of areas where this repo is the source of truth>
<!-- refacil-bus:presentation:end -->
```

**Rules for generating it**:
- **Extract and summarize from the existing `AGENTS.md`** if it has useful information — do not invent.
- If there is no `AGENTS.md` or it is empty, read `package.json` and briefly explore the repo (e.g. `Read` of `README.md`, inspection of main folders).
- Be concise: maximum 3-5 lines in total.
- "Ask me about" must be a short comma-separated list (not markdown bullets) — e.g. "MCP tool contracts, PSE payment flows, webhooks, Redis session structure".
- Do NOT use "Do not ask" or negative lists.

**Where to save it**:
- If `AGENTS.md` exists: add the block at the end of the file (after all sections), separated by a blank line.
- If `AGENTS.md` does not exist: create it with a title `# <repo-name>` and the block below.

Use the `Edit` or `Write` tool as appropriate.

### Step 3: Execute the join

Run via `Bash`:

```bash
refacil-sdd-ai bus join --room "<room>"
```

Where `<room>` is the value of $ARGUMENTS. If $ARGUMENTS is empty, ask the user for the room name.

The CLI:
- Auto-starts the local broker if not active
- Uses the current folder name as the session name
- Reads the presentation block and broadcasts it to the room
- Prints the current members

### Step 4: Confirm to the user

Report:
- Room joined and session name
- Current members
- How others can consult this session: `/refacil:ask @<session> "..."`
- Reminder of scope: use bus messages for cross-repo contract clarification (inputs/outputs, events, compatibility), not generic conversation.

## Rules

- NEVER modify other sections of `AGENTS.md` — only add or update the block between the markers.
- The LLM must NOT maintain bus state between turns; each bus skill is independent.
- Multi-repo coordination and room agreements (propose + notification to requester): `refacil-prereqs/BUS-CROSS-REPO.md`. Being in the room assumes sessions **already know SDD-AI**; change request `ask`s must not re-send the guide, only be clear in scope.
- If the CLI returns an error (missing `ws` dependency, occupied ports), inform the user of the literal message.
