---
name: refacil:say
description: Send a message to the entire bus room (broadcast). For general announcements, not directed questions.
user-invocable: true
---

# refacil:say — Broadcast to the room

Sends a message visible to all members of the room this session is in. **$ARGUMENTS** = message text.

## Instructions

### Step 1: Execute the broadcast

Run via `Bash`:

```bash
refacil-sdd-ai bus say --text "<text>"
```

Where `<text>` is $ARGUMENTS (or what the user asked you to announce). Correctly quote the text.

### Step 2: Confirm

Report to the user that the message was sent with its id.

## When to use `say` vs other bus commands

- **`say`**: general announcement to the room — "I finished my part", "I changed the X contract", "I'm going to restart the service"
- **`ask`**: directed question to another specific session (use `/refacil:ask`)
- **`reply`**: respond to a question you were asked (use `/refacil:reply`)

## Rules

- The session must be joined to a room; if not, the CLI will return an error.
- Short and useful message — avoid bus spam.
- If the user asks "tell the team ...", use `say`. If they ask "ask X ...", use `ask`.
- If a room thread **agrees on changes in this repo**, follow `refacil-prereqs/BUS-CROSS-REPO.md`: **`/refacil:propose`** and close via bus with whoever requested the work when done.
