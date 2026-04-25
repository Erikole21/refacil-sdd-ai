---
name: refacil:attend
description: Active bus listening mode. Waits for questions directed to this session, processes them and responds; then continues listening. Enables automatic LLM-to-LLM conversation between repos.
user-invocable: true
---

# refacil:attend — Listen and respond to bus questions

Puts this session in listening mode. When a directed question arrives, you respond using your knowledge of the repo and go back to listening. This way other agents can ask you things and receive an automatic response while you are in this mode.

## Instructions

### Step 1: Execute attend

Run via `Bash` with a high timeout (10 minutes / 600000 ms):

```bash
refacil-sdd-ai bus attend
```

**IMPORTANT**: when invoking the `Bash` tool, pass `timeout: 600000` (10 min) to take advantage of the maximum.

The command:
- First checks if there are pending questions directed to this session in the recent history
- If not, waits live for up to 9 minutes for a new directed question
- Returns as soon as one arrives, or with a "no questions" message if the time passes

### Step 2: Process the result

**If the output contains "Question received from bus"**:
1. Read `from:`, `correlationId:`, and `text:` from the output.
2. If the `text` is a **change request** in **this** repo (not just an informational question), channel it with **`/refacil:propose`** and the SDD-AI flow; in the `reply` summarize status or next step without re-explaining the methodology (whoever asks is already in the room via `join`). See `refacil-prereqs/BUS-CROSS-REPO.md` and `/refacil:ask` Step 1.5.
3. Investigate the repo to find the answer. Use `Read`, `Grep`, `Glob` as needed.
4. Respond to the bus with:
   ```bash
   refacil-sdd-ai bus reply --text "<your response>"
   ```
   The broker autocompletes the `correlationId` with the last question directed to you (the one you just processed).
5. If the question is outside your scope, still respond:
   ```bash
   refacil-sdd-ai bus reply --text "out of my scope, consult repo X"
   ```
6. **Run `refacil-sdd-ai bus attend` again** (step 1) to continue listening.

**If the output contains "No questions in"**:
- There were no questions in the interval.
- **Run `refacil-sdd-ai bus attend` again** (step 1) to continue listening.

### Step 3: Exit the mode

The loop continues while the user (dev) does not give you another instruction or aborts with ESC. If the user gives you a new task in the middle of the loop, leave attend and attend to the new task.

## When to use attend

- When the dev says *"attend the bus for a while"* or *"stay listening to the bus while I do something else"*.
- When you know another agent will consult you and you want to respond automatically.

## When NOT to use attend

- If you have an active task the user asked for — finish it first.
- If the dev needs to use this session for something immediate — attend blocks the session.

## Rules

- If the `ask` implies **implementing a change in this repo** agreed by the room, after executing it use **`/refacil:propose`** (and the SDD-AI flow) and **close to the requester** via bus (`reply` or other channel according to `refacil-prereqs/BUS-CROSS-REPO.md`); do not close silently.
- **Always re-invoke attend after responding** — a single `attend` handles a single question; you maintain the loop yourself.
- **Do not respond from general knowledge**: use repo files as the source. If you do not know, say so.
- **Do not send secrets or tokens** in responses — messages stay 7 days on local disk.
- **Busy session**: while attend runs, the dev cannot use this session without aborting. If the dev interrupts you, leave attend and attend to the dev.
- The internal timeout (9 min) is to stay within the Bash tool limit; it is not a total listening cap. By re-invoking, the loop is effectively infinite.
