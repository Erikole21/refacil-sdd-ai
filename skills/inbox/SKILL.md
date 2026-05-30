---
name: refacil:inbox
description: View new messages from the room since the last time you read them. Useful when a question with --wait expired without a response.
user-invocable: true
---

# refacil:inbox — New messages in the room

Retrieves new messages since the last time this session ran `inbox`. Excludes messages sent by the session itself.

## Instructions

### Step 1: Execute inbox

Run via `Bash`:

```bash
refacil-sdd-ai bus inbox
```

The CLI prints the new messages (if any) with `from`, `kind`, text, and timestamp.

### Step 2: Process the messages

- If there are `kind=reply` messages directed to this session, use them as context to continue the flow that originated the question (the user may have asked you to "check if a response arrived and continue").
- If there are `kind=ask` messages directed to this session without a response, consider whether it is appropriate to respond with `/refacil:reply`.
- If there are relevant broadcasts, summarize them to the user.
- If the thread implies **change agreements in this repo**, when acting use **`/refacil:propose`** and when closing notify the requester via bus (`refacil-prereqs/BUS-CROSS-REPO.md`).

### Step 3: Report to the user

Present the new messages clearly and, if applicable, propose the next step.

## What appears in the inbox

The inbox for this session shows **only**:

1. **`ask` messages directed to this session** — sent by another session with `bus ask --to [this-session]` or `bus ask --to all`.
2. **`reply` messages to your own `correlationId`** — responses to questions you sent with `bus ask`.

**`say` (broadcast) messages from other sessions do NOT appear in this session's inbox.** `say` is a real-time broadcast only; sessions that were not connected when the `say` was sent will never see it in the inbox. For content that must be received and acted on, use `bus ask --to SESSION` instead.

## When to use `/refacil:inbox`

- After a `/refacil:ask --wait N` expired without a response — to check if it arrived later.
- When returning to a session you left paused while others were collaborating.
- When the user says "check the bus" or "is there anything new?".

## Rules

- Running `inbox` **updates** the session's `lastSeen`: the next call only brings subsequent messages. Do not run it in a loop.
- If there are no new messages, the CLI explicitly indicates it and you must not invent content.
