---
name: refacil:reply
description: Reply to the last question directed to this session on the bus. The broker autocompletes the correlationId.
user-invocable: true
---

# refacil:reply — Reply to a bus question

Sends a response to the last question directed to this session. **$ARGUMENTS** = response text.

## Instructions

### Step 1: Execute reply

Run via `Bash`:

```bash
refacil-sdd-ai bus reply --text "<response>"
```

The broker:
- Automatically finds the last `ask` directed to this session in the room
- Uses its `correlationId` so the asker (if in `ask --wait`) receives the response directly
- Broadcasts to the entire room as a `kind=reply` message

### Step 2: Confirm

Report to the user that the response was sent.

## When to use `reply` vs `say`

- **`reply`**: always when you are responding to something you were asked. This allows the other side in `ask --wait` to unblock automatically.
- **`say`**: general announcement unrelated to a previous question.

## Contract-focused reply format (for integration questions)

When replying to cross-repo integration clarifications, prefer this structure so the other side can continue without ambiguity:

```text
integrationPoint: <confirmed endpoint/event/queue + direction>
inputContract: <confirmed fields/validation>
outputContract: <confirmed outputs/status/errors>
compatibility: <version/constraints, or "unknown">
sourceOfTruth: <file/path/symbol in this repo>
confidence: <high|medium|low>
openQuestions: <none | list of unresolved points>
```

If you cannot confirm a field, answer with `unknown` and include the missing evidence in `openQuestions`.

## Rules

- If you just **implemented** a change requested by another agent and this `reply` is the **close** (done / PR / blocked), include that summary in the text; it is the default channel to respond to whoever made the original `ask` (same thread).
- Correctly quote the text.
- Respond only from your knowledge of THIS repo. If the question falls outside your scope, say it explicitly: `"out of my scope, repo X knows about this"`.
- If your reply leaves unresolved contract points, explicitly list them so the asker can send a targeted retry `ask`.
- If there is no pending question directed to you and you do not want to link it, use `/refacil:say` instead.
- If you were asked multiple questions and want to respond to a specific older one, pass `--correlation <id>` explicitly:
  ```bash
  refacil-sdd-ai bus reply --text "..." --correlation <id>
  ```
