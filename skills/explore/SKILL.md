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

### Step 0.2: CodeGraph availability check

Run `refacil-sdd-ai codegraph status --json` and parse the output. Set `codegraphAvailable`:
- `true` if `installed === true` AND `initialized === true`
- `false` otherwise

**If `mode` is `enabled` or `per-repo` but `codegraphAvailable` is `false`**:

---

**[GATE — STOP AND WAIT: CodeGraph not indexed]**

Do NOT proceed to Step 1. Do NOT delegate to the sub-agent. STOP and ask the user exactly this, then wait for their reply:

```
CodeGraph is enabled for this repo but not yet indexed (~30s to build).
Without it, the exploration uses Grep/Read — slower and less precise for call-graph questions.

Do you want me to run /refacil:update first to build the index?
  yes → run /refacil:update then continue with the exploration
  no  → continue with standard exploration now
```

Only after the user replies:
- **"yes"** (or "si", "dale", "sí", "go", "ok"): immediately execute `/refacil:update`. Do not describe it in text.
- **"no"** (or "skip", "continue", "continúa", "así"): set `codegraphAvailable: false` and proceed to Step 1.

---

**If `mode` is `disabled` or `null`**: set `codegraphAvailable: false` and continue to Step 1 without asking.

### Step 1: Delegate to the refacil-investigator sub-agent

Invoke the `refacil-investigator` sub-agent passing it:
- The user's question (`$ARGUMENTS`).
- `codegraphAvailable: true | false` (from Step 0.2).
- If the user explicitly requested detailed mode, indicate it (`mode: detailed`). Default: concise.

The sub-agent:
- Explores the codebase natively (Read/Grep with discipline — see sub-agent rules).
- Enriches with patterns and conventions from `AGENTS.md`.
- Detects cross-repo dependencies and, if appropriate, consults the bus according to `refacil-prereqs/BUS-CROSS-REPO.md`.
- Returns a report with architecture, flows, dependencies, and next-step recommendations.

### Step 1.5: Log CodeGraph telemetry (silent)

After the sub-agent completes, run **once** (do not mention it to the user unless it fails):

```bash
refacil-sdd-ai compact log-codegraph-event --skill investigator --has-graph <true|false> --tool-calls <N> --tokens <N>
```

- `--has-graph`: the `codegraphAvailable` value from Step 0.2.
- `--tool-calls`: number of `codegraph_*` tool calls the sub-agent made (0 if it did not use the graph).
- `--tokens`: conservative estimate of tokens saved vs. reading whole files (~800–1500 per useful tool call; 0 if no graph or no calls).

If the command fails, ignore it; it must not block the flow.

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
- **CodeGraph gate (Step 0.2)**: if `mode` is `enabled`/`per-repo` and `codegraphAvailable` is `false`, the GATE is **mandatory** — never skip it. If the user replies affirmatively ("yes", "si", "sí", "dale", "ok", "go"), immediately execute `/refacil:update` without any prior text. Do not describe it. Do not ask again. (See `METHODOLOGY-CONTRACT.md §5`.)
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 3, immediately execute the resolved `/refacil:<skill>` command. Deterministic resolution:

  | Finding | Skill |
  |---------|-------|
  | New feature or improvement | `refacil:propose` |
  | Functional bug or production error | `refacil:bug` |
  | Missing initial repo configuration | `refacil:setup` |
  | Flow doubt or next command unclear | `refacil:guide` |
  | No clear match | Do NOT invoke — list numbered options and ask for explicit selection |

  Do not describe it in text or wait for the user to type the command. (See `METHODOLOGY-CONTRACT.md §5`.)
