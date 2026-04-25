# Cross-repo consultation via refacil-bus

Shared protocol for all skills that may need context from another repository during execution (`explore`, `propose`, `verify`, `bug`).

## When to apply

Each skill defines its own trigger (see its `SKILL.md`). In general, apply when the skill detects that **it needs information that does not live in this repo** and assuming it would risk an error: API contracts, event formats, consumer/producer behavior, shared queues.

**Golden rule**: the bus is **optional and non-blocking**. Do not invoke it if the question can be answered by reading this repo's code, or if there is no real cross-repo uncertainty. If the dev answers or clarifies the doubt directly (verbally, via chat, with a link to docs, etc.), **the skill continues normally** — the bus is only one of the possible ways to resolve the unknown.

## Protocol (3 steps)

When the skill's trigger is met:

1. **Verify active rooms**: run `refacil-sdd-ai bus rooms` to see the rooms and their members.
2. **Evaluate preconditions**:
   - **If there is an active room AND the repo you need to consult is already in it**: you can run `/refacil:ask @<repo-name> "..." --wait 180` directly. **Inform the user before sending** ("I'm going to ask @X in room Y: ..."). If the other repo is in `/refacil:attend` it responds automatically; if not, the dev goes to that window and runs `/refacil:inbox`.
   - **If the `ask` is a change request** in the destination repo (not just an informational question), draft **concrete scope and criteria**; the destination session already operates under SDD-AI (joined with `/refacil:join`) and should channel the work with **`/refacil:propose`** there without you repeating the guide in the message. See `/refacil:ask` Step 1.5 and the "Room agreements" section below.
   - **If there is no room, or the repo you need is not in any**: **do not create the room on your own**. Ask the user to run `/refacil:join <room-name>` in **this** session and also in the other repo's session (another IDE window). Both repos must be in the same room. Once confirmed, return to step 2.

If the user does not know the bus or does not know how to configure it, refer them to `/refacil:guide` (section "Bus between agents") before attempting the consultation.

**Valid output without bus**: at any point in the protocol, if the dev answers or clarifies the doubt directly, record their response as context and **continue with the skill flow**. Do not insist on using the bus or block progress waiting for a cross-repo confirmation the dev already answered through another channel.

## How to use the response

Each skill decides what to do with the response:

- `explore`: incorporate it into the report as cross-repo context.
- `propose`: adjust `specs.md` / `design.md` before human review.
- `verify`: incorporate it into the combined report as SUGGESTION; if it reveals a real bug, escalate to WARNING/CRITICAL.
- `bug`: use it to confirm whether the fix goes in this repo, the other, or both (in which case the other will have its own `/refacil:bug`).

## Room agreements and changes in this repo

An **`ask` whose intent is to request work** (implementation, correction, substantial refactor) in the destination session's repo counts as a **change request**: the text must be **clear in scope** so the destination runs **`/refacil:propose`** (and the usual flow) in **their** repo. **No need** to embed the methodology guide in the message: whoever is in the room already joined via **`/refacil:join`** and the repo follows SDD-AI. Same criterion if the conversation mixes `say` and `ask`. Exception: if the **human user** requests a different procedure.

If in the room (via `say` messages, `ask`/`reply` threads, or a mix) **agreements are reached** that imply **modifying this repository** (code, contracts, methodology-covered docs), that work must follow SDD-AI in **this** session: at minimum **`/refacil:propose`** and the normal flow (human review, `/refacil:apply`, etc.). Do not substitute it with ad-hoc edits or commits **unless** the user explicitly orders a different path (emergency hotfix, disposable spike, etc.).

**Closing with the requester**: whoever **implements** here, upon finishing the agreed change (or reaching a clear state: done, PR, blocked, delegated), **must notify via bus** whoever originated the request or the room as appropriate:

- If the work originated from an **`ask`** to this session and the context is still the same thread: **`/refacil:reply`** with the summary (the broker links `correlationId`).
- If the agreement was via **`say`**, there are multiple interlocutors, or the same `ask` no longer applies: **`/refacil:ask @<requesting-session> "..."`** with the closing, or **`/refacil:say`** if the closing should be visible to the **entire** room.

By default: **do not close silently** when another session was waiting for the result of the agreement.

## What NOT to do

- Do not assume the other repo's behavior without consulting.
- Do not run `/refacil:join` on your own — creating or joining a room is the dev's decision (it implies the other repo must also join from its window).
- Do not run `/refacil:ask` without first verifying that the room exists and the destination repo is in it. If any precondition fails, ask the dev to resolve it.
- Do not send **vague change requests** (without scope or criteria) expecting the other to guess the work; the recipient already uses SDD-AI (see `/refacil:ask` Step 1.5). Also do not repeat the guide in each `ask`.
- Do not insist if the dev prefers to resolve it another way (direct reading, docs, verbal question to a colleague).
- Do not skip `/refacil:propose` (or equivalent user order) for changes agreed in a room that affect this repo without an explicit contrary instruction.
- Do not **fail to respond via bus** to the requester or the room when you finish a change others were waiting for (see previous section).
