---
name: refacil:explore
description: Explore and investigate the codebase before making changes — delegates to the refacil-investigator sub-agent to analyze architecture, flows, and dependencies without modifying anything
user-invocable: true
---

# refacil:explore — Exploration Entrypoint

This skill is a **thin wrapper** that delegates the investigation to the `refacil-investigator` sub-agent. The sub-agent runs in an isolated context (does not saturate your main session with massive file reads) and returns a concise report with architecture, flows, and recommendations.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` — use `AGENTS.md` as active context throughout the entire exploration.

## Flow

### Step 0: Validate question

- If `$ARGUMENTS` is empty, ask the user for the question or topic to explore BEFORE invoking the sub-agent.
- If there is a question, continue.

### Step 0.1: Duplicate exploration guard (CA-11)

Before delegating, check the current session conversation context for a prior complete exploration report with overlapping scope (same modules, files, or question topic):

- **If a prior complete exploration exists for the same or highly overlapping topic**: summarize the already-known context in 2-3 sentences and ask:
  ```
  I already explored [topic] earlier in this session. The key findings were: [summary].
  Do you want me to run a targeted follow-up on a specific aspect, or proceed with a new full exploration?
  ```
  Wait for the user's answer before proceeding.
- **If there is no prior exploration** (or it is on a clearly different topic): continue to Step 1 without interruption.

### Step 1: Delegate to the refacil-investigator sub-agent

Invoke the `refacil-investigator` sub-agent passing it:
- The user's question (`$ARGUMENTS`).
- If the user explicitly requested detailed mode, indicate it (`mode: detailed`). Default: concise.

The sub-agent:
- Explores the codebase natively (Read/Grep with discipline — see sub-agent rules).
- Enriches with patterns and conventions from `AGENTS.md`.
- Detects cross-repo dependencies and, if appropriate, consults the bus according to `refacil-prereqs/BUS-CROSS-REPO.md`.
- Returns a report with architecture, flows, dependencies, and next-step recommendations.

### Step 2: Present the report

Show the user the full report returned by the sub-agent. There are no artifacts to write — exploration is purely analytical.

If the sub-agent asked for clarification (because the prompt did not carry an explicit question), propagate the question to the user.

### Step 3: Next step

The sub-agent already includes recommendations at the end of its report. Apply the natural continuity rule from `METHODOLOGY-CONTRACT.md §5`:

- If the report converges on **one single** next step (e.g. the finding clearly indicates a new feature or a bug), close with the single formula:
  - *"The next step is [description]. Do you want me to continue with `/refacil:propose`?"* (or `/refacil:bug`, as appropriate).
- If there are **multiple valid paths**, list them numbered and ask the user to select.

## Rules

- **Always delegate to the sub-agent**. Do not replicate the exploration logic here.
- **Do not invoke without a question**. If `$ARGUMENTS` is empty, ask for the question first.
- **Do not write files**. Exploration is read-only end-to-end.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 3, immediately invoke the **Skill tool** with the exact name resolved from the sub-agent's finding. Deterministic resolution:

  | Finding | Skill |
  |---------|-------|
  | New feature or improvement | `refacil:propose` |
  | Functional bug or production error | `refacil:bug` |
  | Missing initial repo configuration | `refacil:setup` |
  | Flow doubt or next command unclear | `refacil:guide` |
  | No clear match | Do NOT invoke — list numbered options and ask for explicit selection |

  Do not describe it in text or wait for the user to type the command. (See `METHODOLOGY-CONTRACT.md §5`.)
