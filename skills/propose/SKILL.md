---
name: refacil:propose
description: Create a complete change proposal — delegates codebase exploration and artifact generation to the refacil-proposer sub-agent, and handles mandatory human review of the artifacts
user-invocable: true
---

# refacil:propose — Change Proposal Entrypoint

This skill is a **wrapper** that prepares the scope, delegates SDD artifact generation to the `refacil-proposer` sub-agent, and handles the mandatory human review (Human-in-the-Loop). The sub-agent runs in an isolated context exploring the codebase and generating the artifacts; this wrapper presents them to the user for approval.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0.5: Duplicate exploration guard (CA-11)

Before gathering context or delegating, check the current session conversation for a prior complete exploration report with overlapping scope (same modules, files, or described topic):

- **If a prior complete exploration exists for the same or highly overlapping topic**: summarize the already-known context in 2-3 sentences and ask:
  ```
  I already explored [topic] earlier in this session. The key findings were: [summary].
  Do you want me to run a targeted follow-up, or proceed with the full exploration for this proposal?
  ```
  Wait for the user's answer. If they confirm "proceed", continue to Step 1 — do not re-invoke a full exploration automatically.
- **If there is no prior exploration** for this topic: continue to Step 1 without interruption.

### Step 1: Understand the change

If the user did NOT provide sufficient context in `$ARGUMENTS`, ask:
- **What type of change is it?** (new feature, improvement, refactor)
- **What is the problem or need?** (business context)
- **What is the objective?** (what it must achieve in one sentence)

If `$ARGUMENTS` is already clear, do not ask again.

### Step 1.5: Validate change name (blocking)

Before delegating to the sub-agent, agree on or derive the **final slug** of the change (kebab-case: `feat-...`, `expose-...`, `imp-...`, etc.) then validate it with the CLI:

Run `refacil-sdd-ai sdd validate-name <slug>`:
- If exit 0: the name is valid — continue.
- If exit 1: show the CLI's error message to the user and ask them to provide a corrected slug. Repeat until `sdd validate-name` exits 0.

Communicate the final agreed slug to the user before generating.

### Step 2: Delegate to the refacil-proposer sub-agent

Before delegating, resolve language and CodeGraph availability in a single call:

Run `refacil-sdd-ai sdd config --json` and read `artifactLanguage`. If the command fails or the field is missing/unknown, use `english`.

Run `refacil-sdd-ai codegraph status --json` and set `codegraphAvailable`:
- `true` if `installed === true` AND `initialized === true`
- `false` otherwise

**If `mode` is `enabled` or `per-repo` but `codegraphAvailable` is `false`**:

---

**[GATE — STOP AND WAIT: CodeGraph not indexed]**

Do NOT continue. Do NOT delegate to the sub-agent. STOP and ask the user exactly this, then wait for their reply:

```
CodeGraph is enabled for this repo but not yet indexed (~30s to build).
The proposer sub-agent will explore the codebase less efficiently without it.

Do you want me to run /refacil:update first to build the index?
  yes → run /refacil:update then continue with the proposal
  no  → continue with standard exploration now
```

Only after the user replies:
- **"yes"** (or "si", "dale", "sí", "go", "ok"): immediately execute `/refacil:update`.
- **"no"** (or "skip", "continue", "continúa"): set `codegraphAvailable: false` and continue.

---

Invoke the `refacil-proposer` sub-agent passing it:
- `changeName`: the valid slug agreed in Step 1.5.
- `description`: complete description of the change (from Step 1 or from `$ARGUMENTS`).
- `artifactLanguage`: the resolved language (e.g. `english` or `spanish`). Pass it explicitly so the sub-agent uses it immediately, before it reads AGENTS.md.
- `codegraphAvailable: true | false` (from above).

The sub-agent:
- Explores the codebase (reads `AGENTS.md`, detects relevant files and conventions) before generating.
- Generates the artifacts under `refacil-sdd/changes/<changeName>/`: `proposal.md`, specification (`specs.md` and/or `specs/**/*.md`), `design.md`, `tasks.md`.
- If the change involves cross-repo contracts, notes it in `design.md`.
- Returns ONE single message with the summary + JSON block fenced as ` ```refacil-propose-result `.

If the change arises from a **bus room agreement** (`refacil-bus`), indicate it to the sub-agent in the description so it takes it into account when generating the artifacts. Do not shorten the methodology flow. See `refacil-prereqs/BUS-CROSS-REPO.md` (room agreements section).

After the sub-agent completes, log telemetry silently (must not block the flow):

```bash
refacil-sdd-ai compact log-codegraph-event --skill proposer --has-graph <true|false> --tool-calls <N> --tokens <N>
```

Use the same estimation criteria as `explore/SKILL.md` Step 1.5.

### Step 3: Developer review (Human-in-the-Loop — MANDATORY)

Parse the `refacil-propose-result` block from the sub-agent to get the real artifact paths. Present a clear summary to the user for their review:

1. **Proposal**: objective, scope, and justification of the change.
2. **Specs**: acceptance and rejection criteria — list **real paths** received in the JSON block.
3. **Design**: files to create/modify and patterns to use.
4. **Tasks**: task list — verify the breakdown is correct and complete.

**Immediately after the summary, show this menu and WAIT for the user's reply — do NOT continue automatically:**

```
=== Review required ===
Artifacts are ready at refacil-sdd/changes/[changeName]/

  A) Approve — proceed to implementation
  B) Listen to the spec aloud (opens all artifacts in the browser, auto-advancing)
  C) Adjustments — describe what you want to change
```

**DO NOT continue to Step 4 until the user explicitly approves.**

- **"A"** (or "ok", "approve", "listo", "aprobado", "looks good", unambiguous approval): go to Step 4.
- **"B"** (or "listen", "audio", "voice", "read", "escuchar", "voz"): run the following CLI command exactly as written — **do NOT use `--file`, do NOT open a single spec file**:
  ```bash
  refacil-sdd-ai read-spec --change <changeName>
  ```
  Where `<changeName>` is the slug agreed in Step 1.5 (e.g. `feat-my-feature`). This opens the **full change folder** in the browser (proposal → design → tasks → specs, auto-advancing between files). After running it, re-present the review menu so the user can approve or request adjustments.
- **"C"** or any adjustment request: apply limited changes directly to the files or re-invoke the sub-agent if the scope changed, then re-present the review menu.

If the user requests limited adjustments (change a criterion, fix a path, adjust a task), apply them directly to the corresponding files and present the summary again. If the adjustments are broad (changing the objective or the full scope), re-invoke the sub-agent with the updated description.

### Step 4: Next step

**Always present this menu as a new message** immediately after Step 3 confirms approval. Never skip it or reuse the "OK" from Step 3 as a selection here — that "OK" means "the artifacts are approved", not "choose option A".

Before presenting the menu, run `refacil-sdd-ai kapso preflight` (exits 0, prints JSON) and read `kapsoEnabled` from the output. If `kapsoEnabled = true`, append the WhatsApp note to option B. If `kapsoEnabled = false`, omit it.

```
Proposal approved: refacil-sdd/changes/[name]/

How do you want to continue? Reply A or B:

  A) /refacil:apply — step-by-step (pauses for confirmation at each phase)
  B) /refacil:autopilot — run the full cycle autonomously
     (apply → test → verify → review → archive → up-code)
     and notify you when done (recommended if you are stepping away)
     [if kapsoEnabled = true: ⚠️ WhatsApp 24h window: make sure you have sent a message
      to your notification number in the last 24h, otherwise the final alert may not arrive.]
```

## Rules

- **Change folder name**: always validate with `refacil-sdd-ai sdd validate-name <slug>` before delegating. Do not proceed if it exits 1.
- **Always delegate generation to the sub-agent**. Do not replicate the codebase exploration or artifact generation logic here.
- `artifactLanguage` affects **only SDD artifacts**. Any code snippets, file/folder names, identifiers, and technical comments that may appear during proposal work must stay in **English**.
- **CodeGraph gate (Step 2)**: if `mode` is `enabled`/`per-repo` and `codegraphAvailable` is `false`, the GATE is **mandatory** — never skip it. If the user replies affirmatively ("yes", "si", "sí", "dale", "ok", "go"), immediately execute `/refacil:update` without any prior text. Do not describe it. Do not ask again. (See `METHODOLOGY-CONTRACT.md §5`.)
- **Flow continuity (Step 4)**:
  - **Always show the A/B menu first.** An "OK", "yes", "go", or "continue" from Step 3 (artifact approval) is NOT a valid selection for Step 4 — show the menu and wait for the user's reply.
  - Only execute after the user explicitly replies to the Step 4 menu:
    - "apply" or "A" → immediately execute `/refacil:apply`. Do not describe it in text.
    - "autopilot", "B", "auto", or "modo autónomo" → immediately execute `/refacil:autopilot`. Do not describe it in text.
    - An ambiguous affirmative ("ok", "yes", "go", "continue") received **after the menu has been shown** → execute `/refacil:apply`.
  - (See `METHODOLOGY-CONTRACT.md §5`.)
