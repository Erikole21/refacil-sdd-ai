---
name: refacil:ask
description: Ask something directed to another session on the bus. Optionally blocks waiting for the response (--wait N seconds) for automatic LLM-to-LLM flow.
user-invocable: true
---

# refacil:ask — Directed question to another session

Sends a directed question to a session in the room, or to **all other sessions** in the room with `@all` (aliases: `*`, `everyone`). **$ARGUMENTS** includes `@<destination>` and the text.

## Instructions

### Step 1: Identify destination and text

Expected format of $ARGUMENTS:
```
@<session-name> "question..."
```

Extract:
- `destination`: session name without the `@`
- `text`: the question

If the destination is not clear, use `/refacil:rooms` (via `refacil-sdd-ai bus rooms`) to list active sessions and ask the user for clarification.

**Directed broadcast (`@all`)**: the broker emits an `ask` for each member (except the asker), same `correlationId`. Each receiver can `/refacil:reply` on their side. With `--wait`, the CLI returns **the first** response that arrives (does not wait for all).

### Step 1.5: Informational question vs. change request (in the destination repo)

Whoever is in the room arrived via **`/refacil:join`** (and the repo with Refacil methodology): **they already know SDD-AI**; **no need** to paste the guide or re-explain what `/refacil:propose` is. It is enough that the message is **clear in scope and criteria** so the other agent runs **their** flow (`propose`, `apply`, etc.) without improvising patches.

Before drafting the `--text`, classify what you are going to ask `@<destination>`:

| Type | Examples | How to draft the `ask` |
|------|----------|------------------------|
| **Information only** | "What payload does Z send?", "Where is the X handler?" | Concrete question. |
| **Change request** in the **destination repo** | "Add field W to the contract", "Fix the bug in the service that lives in your repo", "Align the consumer with the spec" | Describe **what** must be achieved, **where** it applies, acceptance criteria or links to spec/conversation. The recipient channels that with **`/refacil:propose`** (and what follows) in **their** repo; do not ask for "just a quick change" when the impact is versionable code, unless the **human user** explicitly orders otherwise. |

If you mix query + change, separate into two messages or make clear which part is read-only and which is versionable work in the other repo.

### Step 1.6: Contract-first framing (recommended)

For cross-repo integrations, prioritize questions that remove ambiguity in **input/output contracts**. A good `ask` usually includes:
- integration point (endpoint/event/queue and direction)
- expected input schema/fields and validation rules
- expected output schema/statuses/errors
- compatibility/version constraints

This framing increases response quality and reduces back-and-forth.

### Step 1.7: Structured template for integration asks (recommended)

When the question is about cross-repo integration contracts, draft the `--text` using this minimal template:

```text
integrationPoint: <endpoint/event/queue + direction X->Y or Y->X>
inputContract: <required/optional fields + key validation rules>
outputContract: <expected output/status/errors>
compatibility: <version/flags/env constraints or "unknown">
sourceOfTruthRequest: <where to confirm in destination repo>
question: <concrete doubt to resolve>
```

If some fields are unknown, send `unknown` explicitly — do not invent values.

### Step 2: Decide whether to use `--wait`

Two modes:

**Blocking mode (recommended when you need the response to continue)**:
```bash
refacil-sdd-ai bus ask --to <destination> --text "<question>" --wait 180
```
- The CLI blocks until it receives the response or the timeout passes (default suggested: 60-180s)
- If the other side is in `/refacil:attend`, the response comes back automatically
- If the response arrives: the CLI prints it and you can continue with that info
- If timeout: notify the user and suggest `/refacil:inbox` later

**Fire-and-forget mode**:
```bash
refacil-sdd-ai bus ask --to <destination> --text "<question>"
```
- Does not block; returns immediately after sending
- Use it when you do not know if the other side is active or you do not need the response now

### Step 3: Execute

Use `Bash` with the chosen command.

### Step 4: Process result

- If `--wait` brought a response: use it as context to continue your work; do not just report the message, continue with the flow the user asked for.
- If the response is partial or ambiguous: send a **retry ask** in the same thread, reusing the template fields that remain unresolved.
- If `--wait` expired: inform the user and propose `/refacil:inbox` to review later.
- If fire-and-forget: confirm to the user that it was sent.

## Rules

- Correctly quote the question text.
- If the text has quotes, escape them with `\`.
- Never send secrets, tokens, or sensitive data — the bus persists messages 7 days on local disk.
- If the destination does not exist in the room, the message is stored in `inbox.jsonl` and will be delivered when they join.
- If you **agreed** with another session that they will change their repo, they must use **`/refacil:propose`** there and **notify you via bus** when done; if they request changes from you, you do the same here. Full convention: `refacil-prereqs/BUS-CROSS-REPO.md`.
- **`ask`s that are change requests** must be **substantive in scope** (Step 1.5): the recipient already uses the methodology; do not repeat the guide in the text. Do not use the bus to request opaque quick fixes when the impact requires SDD-AI.
- For cross-repo contract clarifications, prefer Step 1.7 template. The same structure should also be expected in replies to ease retries.
