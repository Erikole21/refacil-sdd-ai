---
name: refacil:say
description: Send a message to the entire bus room (broadcast). For general announcements, not directed questions.
user-invocable: true
---

# refacil:say — Broadcast to the room

Sends a message visible to all members of the room this session is in. **$ARGUMENTS** = message text.

> **WARNING**: `say` is ONLY for optional announcements with no expected response. It does NOT guarantee delivery to sessions that join the room after the message was sent, and `say` messages from other sessions do NOT appear in this session's inbox (or any other session's inbox). For actionable content, agreements, bug reports, or anything the recipient must act on, use `bus ask --to SESSION` instead.

## Instructions

### Step 1: Execute the broadcast

Run via `Bash`:

```bash
refacil-sdd-ai bus say --text "[text]"
```

Where `[text]` is $ARGUMENTS (or what the user asked you to announce). Correctly quote the text.

### Step 2: Confirm

Report to the user that the message was sent with its id.

## Safe bus text delivery

**Use `--text` for simple messages** (no special characters, single-line):
```bash
refacil-sdd-ai bus say --text "Simple announcement here"
```

**Do NOT use `<` or `>` inside `--text`** — shells may interpret them as redirection operators and truncate or discard the message.

For messages containing `<`, `>`, `|`, newlines, or other special characters, use `--from-env`:

**PowerShell (Windows)**:
```powershell
$env:BUS_TEXT = "Announcement with <special> chars"
refacil-sdd-ai bus say --from-env BUS_TEXT
Remove-Item Env:BUS_TEXT
```

**bash (inline, preferred — automatic cleanup)**:
```bash
BUS_TEXT="Announcement with <special> chars" refacil-sdd-ai bus say --from-env BUS_TEXT
```

**bash (export + unset alternative)**:
```bash
export BUS_TEXT="Announcement with <special> chars"
refacil-sdd-ai bus say --from-env BUS_TEXT
unset BUS_TEXT
```

> Note: the CLI cannot perform cleanup itself — it runs as a child process and cannot modify the parent shell's environment. Cleanup (`Remove-Item` / `unset`) is the responsibility of the invoking script or shell.

## When to use `say` vs other bus commands

- **`say`**: general announcement to the room (optional, no response needed) — "I finished my part", "I'm going to restart the service". `say` does NOT guarantee delivery to sessions that join late and does NOT appear in other sessions' inboxes.
- **`ask`**: directed question or actionable content to another specific session (use `/refacil:ask`). Use this for contracts, bug reports, agreements, anything the recipient must act on.
- **`reply`**: respond to a question you were asked (use `/refacil:reply`)

## Rules

- The session must be joined to a room; if not, the CLI will return an error.
- Short and useful message — avoid bus spam.
- If the user asks "tell the team ...", use `say`. If they ask "ask X ...", use `ask`.
- **`say` is ONLY for optional announcements** — it does not guarantee delivery to late-joining sessions and does not appear in any session's inbox. Do not use `say` for contracts, bug reports, change requests, or any content that requires the recipient to act or confirm.
- If a room thread **agrees on changes in this repo**, follow `refacil-prereqs/BUS-CROSS-REPO.md`: **`/refacil:propose`** and close via bus with whoever requested the work when done.
- Do not use `<` or `>` inside `--text` arguments. Use `--from-env` instead (see "Safe bus text delivery" above).
