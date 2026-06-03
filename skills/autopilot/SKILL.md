---
name: refacil:autopilot
description: Run the SDD implementation cycle autonomously after /refacil:propose was approved by the human — chains apply → test → verify → review → archive → up-code in a single invocation, and notifies the user via WhatsApp through Kapso when finished (success or failure). Use when the user says "autopilot", "ejecuta el resto del flujo", "termina solo", "modo autónomo", or indicates they will step away from the computer.
user-invocable: true
---

# refacil:autopilot — Autonomous Implementation Pipeline

This skill is an **orchestrator wrapper** that runs the post-proposal SDD cycle without human intervention. It assumes the human has already executed `/refacil:propose` and approved the generated artifacts (proposal, design, specs, tasks). It chains the existing skills in order, respects the methodology contract and review gate, and notifies the outcome via WhatsApp through Kapso at the end.

**Prerequisites**:
- `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.
- Artifacts of the target change already generated and human-approved (i.e. `/refacil:propose` already ran).
- Credentials file `~/.refacil-sdd-ai/kapso.env` exists with:
  - `KAPSO_API_KEY`
  - `KAPSO_PHONE_NUMBER_ID`
  - `NOTIFY_PHONE` (E.164 format, e.g. `+5731XXXXXXXX`)

## When to invoke

Activate when:
- The user explicitly invokes `/refacil:autopilot [changeName]`.
- The user says variants like: "autopilot", "modo autónomo", "termina solo el flujo", "ejecuta el resto sin preguntarme", "me voy del PC, completa el SDD".

Do **NOT** activate when:
- The user has not yet run `/refacil:propose` for the target change.
- The user says "review the proposal" or asks anything still in the design phase.

## Improvement passes — global rule

Each implementation phase below (`apply`, `test`, `review`) runs in **up to 2 passes**:

- **Pass 1**: execute the phase normally. After the underlying skill completes, ask the corresponding sub-agent to list **acceptable improvements** it identified but did not implement during pass 1 (refactors, missing edge-case tests, doc gaps, small quality wins). "Acceptable" means: within scope of the change, non-breaking, no new dependencies, no scope creep beyond the proposal.
- **Pass 2**: if pass 1 returned improvements, apply them all in a single pass.
- **Hard cap**: never run a 3rd pass on the same phase. If issues remain after pass 2, they are recorded as `warnings` in the notification payload and autopilot continues. If they are *blocking* (e.g., review still rejects, verify rounds exhausted), autopilot aborts and notifies failure.

`verify` is exempt from this loop — it already has 2 built-in autofix rounds (see METHODOLOGY-CONTRACT.md §3.1). Autopilot does NOT add a 3rd round on top.

After pass 2 of any phase, re-run `sdd status <changeName> --json` to ensure the state is still consistent (tasks pending count, artifacts intact) before moving to the next phase.

## Flow

### Step 0: Preflight validation (blocking)

Run `refacil-sdd-ai sdd list --json` to get active changes.

- If there are no active changes → stop and instruct the user to run `/refacil:propose` first. Do NOT notify Kapso (this is a usage error, not an autopilot run).
- If `$ARGUMENTS` provided a change name → use it.
- If there is a single active change and no `$ARGUMENTS` → use it.
- If there are multiple active changes and no `$ARGUMENTS` → stop and ask the user to specify which change. Autopilot requires unambiguous scope.

With the resolved `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` and validate:

- `artifacts.proposal` AND `artifacts.design` AND `artifacts.tasks` AND `artifacts.specs` must all be `true`.
- `ready.forApply` must be `true`.
- Treat `ready.forApply` as the contract source of truth. It is `true` only with `proposal.md`, `design.md`, `tasks.md`, and valid non-empty specs from `specs.md` and/or recursive `specs/**/*.md`; empty `specs/` folders do not count. This is the same spec source set used by `sdd status`, `sync-spec`, test/verify criteria extraction, and archive.
- If validation fails, build `missingArtifacts` from every false value in `artifacts` and report the full list.

If any of the above fails → stop and instruct the user to complete `/refacil:propose` for `<changeName>`, including `Missing artifacts: <comma-separated list>`. Do NOT notify Kapso.

### Step 0.5: Verify Kapso credentials (optional — guided)

**(a)** Attempt to read `~/.refacil-sdd-ai/kapso.env`. Parse all lines of the form `KEY=VALUE`.

**(b)** Check that `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, and `NOTIFY_PHONE` are all present and non-empty. If all three are present → set `kapsoEnabled = true` and continue to Step 0.6.

**(c)** If the file is absent or any of the three keys is missing or empty → `kapsoEnabled = false`. Ask the user (in the session language):

> Kapso credentials not found or incomplete in `~/.refacil-sdd-ai/kapso.env`. Do you want to configure it now to receive a WhatsApp notification when the pipeline finishes?
>
> - Run `refacil-sdd-ai kapso setup` in another terminal and reply **done** when finished.
> - Reply **no** to continue without notification.

Wait for the user's reply:

- If the user replies **done** / **listo** / **ok** / **yes** (case-insensitive) → re-read `~/.refacil-sdd-ai/kapso.env` and re-check. If now complete → `kapsoEnabled = true`. If still incomplete → inform the user and set `kapsoEnabled = false`, continue.
- If the user replies **no** (or any other input) → set `kapsoEnabled = false` and continue.

**(d)** Continue the pipeline regardless of `kapsoEnabled`. Kapso is optional — a missing or misconfigured credential must never block the SDD pipeline.

### Step 0.6: Pre-flight user input (single interaction — gather all before starting)

**Resume detection**: before anything else, try to read `refacil-sdd/.autopilot-active`. If the file exists and its `changeName` matches the resolved `changeName` from Step 0, the pre-flight was already completed in a prior session — skip this entire step (Steps 0.6 Case A and B) and go directly to Step 0.7. The marker already contains `taskReference`, `createPR`, `baseBranch`, and `includeUpCode` (fallback to `true` if the field is missing from an older marker).

All user input needed for the full pipeline must be collected here, in **one message and one reply**. This step only collects configuration — the pipeline does not start until the user sends an explicit affirmative after the ready message.

Run in parallel:
- `git branch --show-current` → `currentBranch`
- `git status --porcelain` → detect uncommitted changes
- `refacil-sdd-ai sdd config --json` → `baseBranch`, `protectedBranches`

**IDE detection**: Before presenting the pre-flight message, determine which IDE is running this session from the available context (system prompt, environment variables, CLI invocation style). Apply the following mapping:

| Signal | `detectedIDE` |
|---|---|
| System prompt contains "Claude Code" / `claude` CLI context | `claude-code` |
| Cursor-specific context / agent header | `cursor` |
| Codex CLI context | `codex` |
| OpenCode CLI context | `opencode` |
| Cannot determine | `unknown` |

Also detect the OS from session context:
- Windows (PowerShell / cmd environment) → `detectedOS = "windows"`
- macOS / Linux / WSL → `detectedOS = "unix"`
- Unknown → `detectedOS = "unknown"`

On **Windows**: just open a new terminal and run the command directly — no wrapper needed. Leave that terminal open while the pipeline runs.
On **Unix**: wrap with `nohup ... >> log 2>&1 &` so the process survives after closing the terminal.

Map `detectedIDE` + `detectedOS` → `idePermissionInstruction` (shown literally in the pre-flight message).

Generate `idePermissionInstruction` in the **session language** using the template below (command lines stay literal). The instruction always opens the IDE **interactively** with the auto-permissions flag — the user sees output in real time and types `/refacil:autopilot` to start. No `-p` / non-interactive mode.

**`claude-code`**: Tell the user that avoiding permission prompts requires a new session. Instruct them to: close this session → open a new terminal → `cd` to the project → run `claude --dangerously-skip-permissions` → once Claude opens, type `/refacil:autopilot`.

**`cursor`**: Set `idePermissionInstruction = ""` (empty — Cursor runs autopilot in the current session; no need to open another session). Do NOT include any instruction to open a new session. Case A and Case B proceed normally.

**`codex`**: Tell the user that skipping permission prompts requires a new session. Instruct them to: close this session → open a new terminal → `cd` to the project → run `codex --dangerously-bypass-approvals-and-sandbox` → once Codex opens, type `/refacil:autopilot`.

**`opencode`**: Tell the user that skipping permission prompts requires a new session. Instruct them to: close this session → open a new terminal → `cd` to the project → run `opencode --dangerously-skip-permissions` → once open, type `/refacil:autopilot`.

**`unknown`**: Tell the user their IDE could not be detected. Show the open command for each IDE and instruct them to type `/refacil:autopilot` once it opens:
- Claude Code: `claude --dangerously-skip-permissions`
- Cursor: open Cursor in this repo, confirm in chat, then `/refacil:autopilot` (no headless launcher)
- Codex: `codex --dangerously-bypass-approvals-and-sandbox`
- OpenCode: `opencode --dangerously-skip-permissions`

**Kapso pre-flight (`kapsoEnabled = true` only)** — run once per session to surface the 24h window notice. Before presenting the ready message, check whether `kapsoPreflightShown` has already been set in this session:

- If `kapsoPreflightShown` is **not yet set** → run `refacil-sdd-ai kapso preflight` (exits 0, prints JSON). Parse `preflightMessage` from the output and include it in the ready message below. Then set `kapsoPreflightShown = true` so the block is not repeated if autopilot is re-invoked later in the same session.
- If `kapsoPreflightShown` is **already set** → omit the pre-flight block from the ready message (the user already saw it).
- Do **NOT** block or wait for confirmation of the WhatsApp notice — informational only.
- If `kapsoEnabled = false`, skip this sub-step entirely and omit the block.

**Case A — `currentBranch` is in `protectedBranches`:**

Present ONE data-collection message **in the session language** covering these three points (no permissions question here). This message only collects configuration; answering it does **not** start the pipeline.

1. **Working branch** — will create `feature/<changeName>` from `<baseBranch>`. Ask if they have a ticket/ID (e.g. PROJ-123) to use as the branch suffix, or reply "ok" to use the change name.
2. **Task reference** — URL, ticket, or short name for the final archive record (e.g. `https://tracker.co/PROJ-123`). If same as ticket in point 1, no need to repeat.
3. **Up-code and PR at the end?** — three options (default: include up-code and create PR):
   - Reply "sin up-code", "no up-code", "sin push", "no push", "skip up-code", or "omitir up-code" → `includeUpCode = false`, `createPR = false` (cycle ends after archive)
   - Reply "sin PR", "no PR", "solo push", or "without pr" → `includeUpCode = true`, `createPR = false` (push but no PR)
   - Any other reply / no signal → `includeUpCode = true`, `createPR = true` (default: push + PR)

If there are uncommitted changes, add a note that they will be stashed before branch creation and restored after.

Wait for the user's reply. Parse:
- URL (`http://` or `https://`) found → `taskReference = <url>`, `branchSuffix = <changeName>` (unless a ticket was also given)
- Ticket/ID (`[A-Za-z][A-Za-z0-9_-]*-\d+`, e.g. `PROJ-123`) found → `branchSuffix = <ticket>`, `taskReference = <ticket>` (overridden by URL if both present)
- "sin up-code" / "no up-code" / "sin push" / "no push" / "skip up-code" / "omitir up-code" found (case-insensitive) → `includeUpCode = false`, `createPR = false`
- "sin PR" / "no PR" / "solo push" / "sin pr" / "without pr" found (case-insensitive, only when no up-code skip signal) → `includeUpCode = true`, `createPR = false`
- No signal → `includeUpCode = true`, `createPR = true` (default)
- "ok" or bare affirmative with no recognizable data → `branchSuffix = <changeName>`, `taskReference = refacil-sdd-autopilot/<changeName>` (synthetic — annotated in the final notification)

Then create the branch (do NOT ask again):
1. If uncommitted changes → `git stash push -m "auto-stash-refacil"`.
2. `git checkout <baseBranch> && git pull origin <baseBranch>`.
3. `git checkout -b feature/<branchSuffix>`.
4. If stash was pushed → `git stash pop`.

Write the autopilot marker so sub-skills can detect autonomous mode and skip their own confirmation prompts:

```bash
printf '{"changeName":"%s","taskReference":"%s","createPR":%s,"baseBranch":"%s","includeUpCode":%s}\n' \
  "<changeName>" "<taskReference>" "<true|false>" "<baseBranch>" "<true|false>" \
  > "refacil-sdd/.autopilot-active"
```

**After writing the marker**, generate and present the ready message using the CLI:

```bash
refacil-sdd-ai autopilot ready-message --change "<changeName>" --ide "<detectedIDE>" --lang "<sessionLang>"
```

Where `<sessionLang>` is `es` (default) or `en` based on the session language. This command prints the localized ready message to stdout. Present its output to the user, prepending the Kapso pre-flight block if `kapsoEnabled = true` and `kapsoPreflightShown` is not yet set (see above). When `detectedIDE = cursor`, `idePermissionInstruction` is empty — do NOT append any instruction to open a new session or use `cursor-agent`; the pipeline runs in this Cursor session. For all other IDEs, append the `idePermissionInstruction` after the CLI output. The ready message must not imply that the pipeline starts as soon as the user answers the pre-flight questions — it starts only after the user sends an explicit affirmative below. Replace any mention of "you can step away from your PC" / "puedes alejarte del PC" with neutral text indicating that the pipeline runs autonomously once started and the user can continue other activities.

**EXPLICIT CONFIRMATION GATE — STOP AND WAIT**: after displaying the ready message, do NOT continue automatically. Wait for the user to reply with an explicit affirmative:
- Affirmative ("go", "ok", "start", "yes", "sí", "dale", "arrancar", etc.) → continue to Step 0.7 in this session.
- No reply / session closed → the next session launched with the headless command will pick up via resume detection at the top of Step 0.6.
- Non-affirmative in-session reply (e.g. "no", "cancel", any other response) → do NOT start the pipeline; re-display the ready message and instruct the user to reply with an affirmative (go, ok, start, sí, dale, arrancar) when ready.

**Case B — `currentBranch` is already a working branch (not protected):**

Only ask for task reference and up-code/PR preference (branch creation is skipped). Present the message **in the session language** covering these two points. This message only collects configuration; answering it does **not** start the pipeline.

1. **Task reference** — URL, ticket, or short name for the final archive record.
2. **Up-code and PR at the end?** — three options (default: include up-code and create PR):
   - Reply "sin up-code", "no up-code", "sin push", "no push", "skip up-code", or "omitir up-code" → `includeUpCode = false`, `createPR = false` (cycle ends after archive)
   - Reply "sin PR", "no PR", "solo push", or "without pr" → `includeUpCode = true`, `createPR = false` (push but no PR)
   - Any other reply / no signal → `includeUpCode = true`, `createPR = true` (default: push + PR)

Parse the reply — **branch creation is skipped in Case B, so do NOT derive `branchSuffix`**:
- URL (`http://` or `https://`) found → `taskReference = <url>`
- Ticket/ID (`[A-Za-z][A-Za-z0-9_-]*-\d+`, e.g. `PROJ-123`) found **only if not embedded inside a URL** → `taskReference = <ticket>`; if a ticket is embedded inside a URL, `taskReference = <full url>` (do not extract the ticket as a standalone value)
- "sin up-code" / "no up-code" / "sin push" / "no push" / "skip up-code" / "omitir up-code" found (case-insensitive) → `includeUpCode = false`, `createPR = false`
- "sin PR" / "no PR" / "solo push" / "sin pr" / "without pr" found (case-insensitive, only when no up-code skip signal) → `includeUpCode = true`, `createPR = false`
- No signal → `includeUpCode = true`, `createPR = true` (default)
- Unrecognizable → `taskReference = refacil-sdd-autopilot/<changeName>` (synthetic), `includeUpCode = true`, `createPR = true`

After writing the marker, generate and present the ready message using `refacil-sdd-ai autopilot ready-message --change "<changeName>" --ide "<detectedIDE>" --lang "<sessionLang>"` (same as Case A), prepend the Kapso pre-flight block if applicable, and apply the **EXPLICIT CONFIRMATION GATE** — wait for the user's affirmative reply before continuing to Step 0.7. The ready message must not imply that answering the pre-flight questions starts the flow; it must not say "you can step away from your PC" / "puedes alejarte del PC" — replace with neutral text indicating the pipeline runs autonomously once started and the user can continue other activities.

Write the autopilot marker (same as Case A):

```bash
printf '{"changeName":"%s","taskReference":"%s","createPR":%s,"baseBranch":"%s","includeUpCode":%s}\n' \
  "<changeName>" "<taskReference>" "<true|false>" "<baseBranch>" "<true|false>" \
  > "refacil-sdd/.autopilot-active"
```

Store `taskReference`, `createPR`, and `includeUpCode` for Steps 5 and 5.5.

### Step 0.7: Capture starting state

Capture for the final notification payload:
- `repoSlug`: derived from `git remote get-url origin` (basename without `.git`).
- `branchAtStart`: `git branch --show-current`.
- `startedAt`: ISO-8601 timestamp (`new Date().toISOString()`).
- `changeName`: from Step 0.

**Immediately write `startedAt` into the marker** so the CLI can compute the exact duration when notifying — the AI must not compute elapsed time itself. Because this update uses `JSON.parse` + `JSON.stringify` on the existing object, all fields already in the marker (`changeName`, `taskReference`, `createPR`, `baseBranch`, `includeUpCode`) are preserved automatically:

```bash
node -e "
const fs=require('fs');
const p='refacil-sdd/.autopilot-active';
const m=JSON.parse(fs.readFileSync(p,'utf8'));
m.startedAt=new Date().toISOString();
fs.writeFileSync(p,JSON.stringify(m));
"
```

Initialize accumulators (used across phases):
- `improvementsApplied`: `{ apply: 0, test: 0, review: 0 }` — counters incremented when a phase's pass 2 successfully applies improvements.
- `warnings`: `[]` — list of strings, max 10 entries. Each entry is a short string like `"apply pass 2 reverted: 3 tests broke"` or `"test pass 2 skipped: improvement list empty"` (only the actionable ones, no need to log empty skips). Use this to fill the "Warnings" block in the success notification.
- `kapsoPreflightShown`: `false` — set to `true` in Step 0.6 after the pre-flight block is shown. Prevents repeating the WhatsApp window notice if autopilot is re-invoked later in the same session.

### Step 1: Run /refacil:apply (up to 2 passes)

**Autonomous mode**: the branch was already created in Step 0.6, so apply starts directly on the working branch (no gate interruption). When invoking `/refacil:apply`, include a prompt-level note that the sub-agent is running in autonomous mode — it must make decisions without asking clarifying questions. If apply's flow-continuity question ("continue with /refacil:test?") appears, answer it internally (yes); do NOT surface it to the user.

**Pass 1**: invoke `/refacil:apply <changeName>` in the current session. This delegates to the `refacil-implementer` sub-agent and implements all tasks.

After it finishes, run `refacil-sdd-ai sdd status <changeName> --json` and verify:
- `tasks.pending` is `0`.
- `tasks.done` equals `tasks.total`.

If pending tasks remain → treat as `phase: apply` failure, go to Step 6.

**Pass 2 (improvement pass — only if pass 1 succeeded)**: ask the implementer for a list of acceptable improvements it identified but did not apply (refactors, small quality wins, minor cleanups strictly within the change scope). If the list is non-empty, invoke `/refacil:apply <changeName>` with a prompt-level instruction (not a CLI flag) telling the sub-agent to apply ONLY those listed improvements without expanding scope.

After pass 2:
- If pass 2 introduces test failures or breaks anything that pass 1 left working → abort the autopilot run, preserve the working tree exactly as-is, capture the failing command/output as evidence, and go to Step 6. Do not attempt destructive rollback or history rewrites. Record this as a failure, not a warning.
- If pass 2 succeeds cleanly → continue to Step 2.
- If the improvement list was empty → skip pass 2 entirely, continue to Step 2.

**No pass 3.** Any further improvements identified in pass 2 are recorded as warnings in the final payload.

### Step 2: Run /refacil:test (up to 2 passes)

**Autonomous mode**: the tester sub-agent must make decisions (stack detection, test patterns) without asking. If test's flow-continuity question ("continue with /refacil:verify?") appears after passing, answer it internally (yes); do NOT surface it to the user.

**Pass 1**: invoke `/refacil:test <changeName>`. Defaults are `testScope: scoped`, `runCoverage: true` (narrowed to changed files) as per the methodology contract §3.1 — autopilot does NOT override these defaults.

If tests fail, `/refacil:test` handles the fix loop internally (up to 3 rounds) without asking the user. If it still cannot produce passing tests after those rounds, it returns a phase failure — autopilot goes to Step 6 (which notifies via Kapso if `kapsoEnabled = true`). Do NOT ask the user at any point.

**Pass 2 (improvement pass — only if pass 1 succeeded)**: ask the tester for a list of acceptable additional tests it identified but did not write (edge cases, branch coverage gaps, missing negative paths). If non-empty, invoke `/refacil:test <changeName>` with a prompt-level instruction (not a CLI flag) to add only those tests. The improvements must:
- Cover behavior already specified in the proposal (no new behavior).
- Not require changes to source code.

After pass 2:
- If the new tests pass → continue to Step 3.
- If any new test fails after addition → abort the autopilot run, preserve the working tree exactly as-is, capture the failing test output as evidence, and go to Step 6. Do not roll back with destructive git commands.
- If the improvement list was empty → skip pass 2 entirely, continue to Step 3.

**No pass 3.**

### Step 3: Run /refacil:verify (built-in 2 rounds — no extra pass)

**Autonomous mode**: if verify asks "do you want me to apply these corrections?", answer yes internally — do NOT surface it to the user. If verify's flow-continuity question ("continue with /refacil:review?") appears after APPROVED, answer yes internally.

Invoke `/refacil:verify <changeName>` **without** tokens that force `testExecution: full`. After a successful Step 2 (`/refacil:test`), verify must use **`testExecution: none`** by default (§3.2) — CA/CR validation only, trusting `memory.commandsRun`.

The validator sub-agent supports up to 2 autofix rounds and always attempts to fix any findings (CRITICAL, WARNING, or observations) before returning. Autopilot answers "yes, apply corrections" internally for every round — do NOT surface it to the user.

After the built-in rounds:
- If APPROVED with no remaining issues → continue to Step 4.
- If APPROVED with remaining warnings/observations (non-blocking) → record them as `warnings` in the final payload and continue to Step 4.
- If REQUIRES_CORRECTIONS with unresolved issues after 2 rounds → treat as `phase: verify` failure, go to Step 6. Save the validator's top 3 issues for the WhatsApp payload.

Do NOT add a third manual round beyond the validator's built-in 2.

### Step 4: Run /refacil:review (up to 2 passes)

**Autonomous mode**: if review asks "do you want me to apply these corrections?", answer yes/all internally for auto-fixable findings — do NOT surface it to the user. If review's flow-continuity question ("continue with /refacil:archive?") appears after APROBADO, answer yes internally.

**Pass 1**: invoke `/refacil:review <changeName>`. The auditor sub-agent evaluates against the quality checklist. After invocation, verify `.review-passed` exists in `refacil-sdd/changes/<changeName>/` (remember §8 of METHODOLOGY-CONTRACT.md: do not conclude from `ls` without `-a`).

**Pass 2 (always run if there are ANY findings — including MEDIUM/LOW observations from APROBADO CON OBSERVACIONES)**: regardless of whether pass 1 returned APROBADO CON OBSERVACIONES or REQUIERE CORRECCIONES, if the auditor reported any findings, run pass 2. Categorize each finding:
- **Auto-fixable** (formatting, naming, missing docstring, small refactor strictly within change scope, no test impact) — including MEDIUM/LOW observations.
- **Pre-existing debt** (flagged as pre-existing by the auditor) — skip, do not fix.
- **Requires human judgment** (architectural concern, scope question, business logic doubt) — do not fix, record as warning.

Apply all auto-fixable findings in a single batch, then re-invoke `/refacil:review <changeName>`.

After pass 2:
- If verdict is APROBADO or APROBADO CON OBSERVACIONES → `.review-passed` exists → continue to Step 5. Any remaining non-fixable or pre-existing findings are recorded as `warnings` in the final payload.
- If verdict is still REQUIERE CORRECCIONES after pass 2 → treat as `phase: review` failure, go to Step 6. Do NOT attempt a 3rd pass.
- If pass 1 had NO findings at all (clean APROBADO) → skip pass 2 entirely, continue to Step 5.

### Step 5: Run /refacil:archive

**Autonomous mode**: answer archive's pre-check interactive prompts internally without asking the user:
- "Tasks complete?" → yes (apply ensured 0 pending).
- "Unrelated files in working tree?" → continue anyway (expected in multi-change repos).
- "Task reference?" → respond with `taskReference` captured in Step 0.6; do NOT ask the user again.
- Archive's flow-continuity question ("continue with /refacil:up-code?") → answer yes internally.

If any pre-check reveals a genuinely blocking issue (e.g., `.review-passed` missing) → treat as `phase: archive` failure, go to Step 6.

If `taskReference` is the synthetic fallback (`refacil-sdd-autopilot/<changeName>`), annotate this in the final WhatsApp notification so the user knows to update `review.yaml` with the real reference when they return.

If `/refacil:archive` fails for any other reason → `phase: archive` failure, go to Step 6.

### Step 5.5: Run /refacil:up-code

**Read `includeUpCode` from the marker** (`refacil-sdd/.autopilot-active`). If the field is missing (older marker), treat it as `true`.

**If `includeUpCode = false`**: skip `/refacil:up-code` entirely. Assign `prLink = "skipped"`. Log: `"up-code omitido por elección del usuario (includeUpCode=false)"`. Go directly to Step 7 — do NOT skip Steps 7 or 8.

**If `includeUpCode = true`**: invoke `/refacil:up-code` with a commit message derived from the proposal title.

**Autonomous mode** — pre-resolve all up-code interactive prompts internally:

- **Staging**: confirm "yes, stage all" internally. Safe because implementation just happened in this session and the diff is bounded by the change. Do NOT ask the user.
- **Commit message**: generate from the proposal title (e.g. `feat: <proposal title>`). Do NOT ask for approval.
- **Target branch**: use `baseBranch` from `refacil-sdd-ai sdd config --json`. Do NOT ask the user.
- **PR creation**: depends on `createPR` from Step 0.6:
  - `createPR = true` (default) → create the PR against `baseBranch`. Capture the PR link for the notification payload.
  - `createPR = false` → push only. Do NOT create a PR. Record `prLink = null` in the payload; the notification will show "Push: ✓ (sin PR)".

If push fails → `phase: up-code` failure, go to Step 6.

Steps 7 and 8 always execute after this step, regardless of whether `includeUpCode` is `true` or `false`.

### Step 6: Failure handling (any phase)

When any phase fails:

1. Do NOT continue to subsequent phases.
2. Do NOT force-push or rewrite history.
3. Capture:
   - `phase`: which step failed.
   - `errorSummary`: 1-3 line summary.
   - `branchAtFailure`: `git branch --show-current`.
   - `lastCommit`: `git log -1 --oneline`.
4. Send the failure notification via Kapso only if `kapsoEnabled = true` (Step 7, failure template).
5. Leave the working tree as-is so the user can inspect when they return. Normal recovery must never use destructive reset commands; preserve local edits and report the evidence needed for manual repair.

> **Note**: do NOT delete `refacil-sdd/.autopilot-active` here. Step 8 deletes the marker unconditionally at the end of the cycle — this keeps the marker alive during Step 7 in both success and failure paths, so the CLI can compute the exact duration from `startedAt`.

### Step 7: Notify via Kapso

**This step always executes at the end of the cycle**, regardless of whether `includeUpCode` is `true` or `false`. Execute the notification only if `kapsoEnabled = true`. If `kapsoEnabled = false`, skip and print a local notice (see below).

All notification logic — credentials, message formatting, HTTP call, error logging — is handled by the CLI. Do NOT construct curl calls or read the env file directly.

**Send the notification exactly ONCE, with every flag resolved to a real value — never a placeholder.** Before invoking `kapso notify`, confirm that `repoSlug`, `changeName`, `branchAtStart`/`branchAtFailure`, `tasks.done`/`tasks.total` (and `phase` on failure) are all filled with concrete values captured in Steps 0–6 — there must be no literal `<...>` token left in the command. Do NOT fire a first "probe" call and then a corrected one: a single notification per run. The CLI **rejects** any `notify` whose required flags are missing, empty, or still contain a `<placeholder>` (it exits non-zero without sending, and prints which flags are wrong). If you see that rejection, it means a value was not resolved — fill it in from the captured state and invoke once more; do not let an empty notification go out.

**Success notification**:

Required flags (validated by `validateNotifyOpts`; the CLI rejects the call if any is missing or contains a placeholder):
- `--repo` — repository slug (e.g. `refacil-ia`)
- `--change` — change name (e.g. `imp-session-timeout-redis`)
- `--branch` — branch at start (e.g. `feature/imp-session-timeout-redis`)
- `--tasks` — tasks in `done/total` format (e.g. `5/5`). Must match `^\d+/\d+$`.

Optional flags (omit if not applicable):
- `--pr` — PR link, empty string, or `"skipped"` (see rules below)
- `--apply`, `--test`, `--review` — improvement counters (integer, default `0`)
- `--warnings` — top 3 warning strings joined by `|` (omit or pass `""` if none)

> **Duration**: the CLI computes the run duration automatically from the `startedAt` field written to `.autopilot-active` in Step 0.7. You do **not** need to pass `--duration` — omit it and the CLI reads `startedAt` from the marker. Only pass `--duration <minutes>` as a manual fallback if the marker was unavailable for some reason (this should never happen with the corrected Step 6 that no longer deletes the marker before Step 7).

The `--pr` flag value depends on `includeUpCode`:
- `includeUpCode = true` and push succeeded with PR → `--pr "<prLink>"`
- `includeUpCode = true` and push succeeded without PR (`createPR = false`) → `--pr ""` (empty string)
- `includeUpCode = false` → `--pr "skipped"`

Example (all required flags filled with real values):

```bash
refacil-sdd-ai kapso notify success \
  --repo "refacil-ia" \
  --change "imp-session-timeout-redis" \
  --branch "feature/imp-session-timeout-redis" \
  --tasks "5/5" \
  --pr "https://github.com/org/refacil-ia/pull/42" \
  --apply "1" \
  --test "0" \
  --review "0" \
  --warnings ""
```

**Failure notification**:

Required flags:
- `--repo` — repository slug
- `--change` — change name
- `--branch` — branch at the moment of failure (`branchAtFailure`)
- `--phase` — which phase failed (e.g. `verify`, `test`, `apply`, `review`, `archive`, `up-code`)

Optional flags:
- `--last-commit` — last commit hash + message from `git log -1 --oneline`
- `--error` — 1-3 line error summary

Example (all required flags filled with real values):

```bash
refacil-sdd-ai kapso notify failure \
  --repo "refacil-ia" \
  --change "imp-session-timeout-redis" \
  --branch "feature/imp-session-timeout-redis" \
  --phase "verify" \
  --last-commit "a1b2c3d feat: add session timeout to Redis store" \
  --error "verify: 2 unresolved CRITICAL findings after 2 autofix rounds"
```

The CLI reads credentials from `~/.refacil-sdd-ai/kapso.env` internally. If Kapso returns an error, it logs to `~/.refacil-sdd-ai/autopilot.log` and exits without crashing — the SDD work is intact.

**If `kapsoEnabled = false`** (credentials absent or skipped): print a local notice instead:

```
Autopilot completado (sin notificación WhatsApp — Kapso no configurado).
Para habilitar notificaciones en futuros runs: refacil-sdd-ai kapso setup
```

### Step 8: Terminal step

**This step always executes at the end of the cycle**, regardless of whether `includeUpCode` is `true` or `false`.

Delete the autopilot marker: `rm -f "refacil-sdd/.autopilot-active"`.

Print a concise summary to the session log:

```
=== Autopilot terminó ===
Resultado: <success|failure>
Change: <changeName>
PR: <prLink | N/A (createPR=false) | N/A (up-code omitido)>
Notificación WhatsApp: <enviada|fallida|desactivada>
```

PR line rules:
- `includeUpCode = true` and push succeeded with PR → actual PR link
- `includeUpCode = true` and `createPR = false` → `N/A`
- `includeUpCode = false` → `N/A (up-code omitido)`

This is the terminal step. Do NOT suggest a next skill — apply METHODOLOGY-CONTRACT.md §5.

## Rules

- **No interruptions after Step 0.6**: once the user replies to the pre-flight message, autopilot runs the full pipeline without surfacing any question to the user. All flow-continuity questions from sub-skills (apply, test, verify, review, archive) are answered internally (yes/continue). All "apply corrections?" prompts from verify and review are answered yes internally. Sub-agents are invoked with a context note that they are running in autonomous mode and must not ask for clarification.
- **NEVER skip `/refacil:review`**: the auditor sub-agent and `.review-passed` are the quality gate; autopilot does not bypass it.
- **NEVER force-push or rewrite history**: even on failure, leave the branch as-is.
- **NEVER notify success when any phase failed**: failure notifications are mandatory so the user knows to come back.
- **NEVER write Kapso credentials into commits, logs visible to the IDE, or AGENTS.md**: source the env file only at the moment of the curl call.
- **Single-repo scope per invocation**: autopilot runs in the repo where it was invoked. Do not attempt to coordinate across repos within a single autopilot run — that is what `refacil:bus` and `refacil:ask` are for.
- **Respect the methodology contract**: branch policy, protected branches, test scope defaults, and the review gate are all delegated to the underlying skills. Autopilot does NOT override them.
- **No third autofix round**: `/refacil:verify` has 2 built-in rounds. If those fail, the change needs human attention — notify and stop.
- **Kapso is optional**: a missing or misconfigured `kapso.env` must never block or abort the SDD pipeline. Autopilot always runs the full cycle; it only skips the WhatsApp notification if credentials are unavailable.
- **`includeUpCode` does not block notification**: Steps 7 (Kapso notification) and 8 (terminal summary) always execute when the cycle ends, whether `includeUpCode` is `true` or `false`. Setting `includeUpCode = false` only skips `/refacil:up-code` — it does not skip the end-of-cycle steps.
- **Language policy**: this skill's instructions are in English (per the contract). All user-facing text in the session must be in the **session language**. Kapso end-of-run messages sent by `refacil-sdd-ai kapso notify` are defined in `lib/kapso.js`.

## Invocation by IDE

This skill is IDE-agnostic — its instructions only invoke other `/refacil:*` skills, which already work in all four supported IDEs. The headless launch command differs per IDE.

Open a new terminal, `cd` to the project, run the IDE with its auto-permissions flag, then type `/refacil:autopilot` once it opens. Output is visible in real time.

| IDE | Open command | Then type |
|---|---|---|
| Claude Code | `claude --dangerously-skip-permissions` | `/refacil:autopilot` |
| Cursor | This IDE session (after explicit confirmation in Step 0.6) | `/refacil:autopilot` |
| Codex | `codex --dangerously-bypass-approvals-and-sandbox` | `/refacil:autopilot` |
| OpenCode | `opencode --dangerously-skip-permissions` | `/refacil:autopilot` |

### Notes on the auto-accept flags

- **Claude Code `--permission-mode auto`**: Auto Mode (released March 2026) uses a server-side classifier (Sonnet 4.6) to evaluate each action before execution. Safer than `--dangerously-skip-permissions` because it blocks scope-escalation, credential exploration, force-pushes outside the working branch, and similar overeager actions. In headless mode, 3 consecutive denials or 20 total denials terminate the process — this is the desired behavior for autopilot (the failure notification will fire). If you prefer the no-guardrails version: replace with `--dangerously-skip-permissions`.
- **Codex `--full-auto --sandbox workspace-write`**: the official CI combo from OpenAI's docs. Allows edits inside the workspace, denies broader access.
- **Cursor**: autopilot runs in the **current Cursor session** after explicit confirmation in Step 0.6 — do not use `cursor-agent` or other headless launchers for this skill.
- **OpenCode `--dangerously-skip-permissions`**: official flag on `opencode run` (auto-approves any permission not explicitly denied). For finer control, use `OPENCODE_PERMISSION` env var with an inline JSON permissions config.

When the run finishes (success or failure), the user gets a WhatsApp message via Kapso (if configured) and can come back to review.

## Skill installation across IDEs

This skill follows the standard `refacil-sdd-ai` skill installation:
- `~/.claude/skills/refacil-autopilot/SKILL.md` (Claude Code — byte-for-byte)
- `~/.cursor/skills/refacil-autopilot/SKILL.md` (Cursor — frontmatter unchanged since this is a top-level skill, not a sub-agent)
- `~/.config/opencode/skills/refacil-autopilot/SKILL.md` (OpenCode — byte-for-byte)
- `~/.codex/skills/refacil-autopilot/SKILL.md` (Codex — byte-for-byte)

No agent file is required since autopilot delegates to existing sub-agents (`refacil-implementer`, `refacil-tester`, `refacil-validator`, `refacil-auditor`) through their respective skills.
