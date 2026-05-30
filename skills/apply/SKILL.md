---
name: refacil:apply
description: Implement the tasks of a proposed change — verifies artifacts and working branch, builds a structured briefing, and delegates to the refacil-implementer sub-agent to execute the implementation in isolated context
user-invocable: true
---

# refacil:apply — Implementation Entrypoint

This skill is a **wrapper** that verifies the critical preconditions (SDD artifacts and working branch), builds a **structured briefing** with the key context already extracted, and delegates the implementation to the `refacil-implementer` sub-agent. The briefing prevents the sub-agent from rediscovering from scratch — it starts implementing, not exploring.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md`.

## Flow

### Step 0: Verify SDD artifacts exist (blocking)

Run `refacil-sdd-ai sdd list --json` to get the active changes.

- **If there are no active changes**: inform to run `/refacil:propose` and **stop**.
- **If there is a single active change**: use that `changeName`.
- **If there are multiple active changes**: list the names and ask which one to implement. Do not invoke the sub-agent with ambiguous scope.

With the selected `changeName`, run `refacil-sdd-ai sdd status <changeName> --json` and parse the JSON:

```json
{
  "name": "...",
  "artifacts": { "proposal": bool, "design": bool, "tasks": bool, "specs": bool },
  "tasks": { "total": N, "done": N, "pending": N },
  "reviewPassed": bool,
  "ready": { "forApply": bool, "forArchive": bool }
}
```

Validations:
- Build `missingArtifacts` from every false value in `artifacts` (`proposal`, `design`, `tasks`, `specs`) and report the complete list. Do not stop at the first missing artifact.
- If `ready.forApply` is `false` or `missingArtifacts.length > 0`:
  ```
  The change at refacil-sdd/changes/[name]/ is incomplete.
  Missing: [complete list of artifacts with false]
  Run: /refacil:propose to complete the artifacts before implementing.
  ```
  **Stop.**

Note: `ready.forApply` is the contract source of truth and is `true` only when `proposal.md`, `design.md`, `tasks.md`, and a valid spec source exist. `specs` is `true` if non-empty `specs.md` exists in the root and/or at least one non-empty `.md` exists under `specs/**/*.md` (recursive; empty folders do not count). The same source set is used by `sdd status`, `sync-spec`, test/verify criteria extraction, and archive.

**IMPORTANT**: This command NEVER generates SDD artifacts. If they do not exist, the user must use `/refacil:propose`.

### Step 1: Validate working branch (blocking — before delegating)

Run `git branch --show-current` to get the current branch.

If the current branch is already a working branch (`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, etc.), continue without interruption to Step 1.5.

If the current branch is protected, **read `METHODOLOGY-CONTRACT.md §4 — Protected branch policy`** before acting, then execute the gate protocol defined there. For this skill, Gates 1 and 2 are merged into a single interaction — propose and confirm in one message, wait for one reply.

**See `METHODOLOGY-CONTRACT.md §4 — Protected branch policy`** for the complete gate protocol.

Apply-specific annotations:
- Default branch name: `feature/<changeName>` (e.g. `feature/my-change`). If the user provides a ticket or ID → `feature/<ID>`.
- Stash handling: if uncommitted changes exist, inform the user in the same Gate 1+2 message and stash before creating the branch (`git stash push -m "auto-stash-refacil"`), restoring after (`git stash pop`).
- If the user explicitly says "no" or "cancelar" → stop entirely. Do not create any branch.

### Step 1.5a: Detect CodeGraph availability (non-blocking)

Run: `refacil-sdd-ai codegraph status --json`

Parse the JSON output and set `codegraphAvailable`:
- `true` if and only if the result contains `"installed": true` AND `"initialized": true`
- `false` in all other cases (not installed, not initialized, command fails, invalid JSON, or any error)

**IMPORTANT**: if the index is not available, continue silently — do NOT gate, pause, ask, or wait. Apply does not interrupt for CodeGraph. Unlike `/refacil:propose`, `/refacil:explore`, or `/refacil:bug` (which benefit from graph traversal to discover scope), `/refacil:apply` typically follows a propose that already resolved the architecture. The implementer uses CodeGraph only for structural lookups during implementation, not for scope discovery.

### Step 1.5: Build structured briefing (reduces sub-agent tool calls)

Before invoking the sub-agent, extract the key context by reading the artifacts. This prevents the sub-agent from rediscovering them from scratch.

1. **Objective** — read the first section of `refacil-sdd/changes/<changeName>/proposal.md`. Extract the objective in 1-2 sentences.
2. **File scope** — read `refacil-sdd/changes/<changeName>/design.md`. Extract:
   - List of files to **create** (full paths)
   - List of files to **modify** (full paths)
3. **Tasks** — read `refacil-sdd/changes/<changeName>/tasks.md`. Extract the full numbered list.
4. **`testScope`** — default **`scoped`**. Inspect `$ARGUMENTS` **and** the user message invoking this skill for explicit **whole-repo** regression (e.g. `full`, `all tests`, `whole suite`, `suite completa`, `suite completa del repo`). If present → **`testScope: full`**. Otherwise **`scoped`**.
5. **`testBaselineCommand`** — resolve the §3 baseline command language-agnostically at the **affected component root** (nearest ancestor of the files in `scope.create`/`scope.modify` with a stack manifest — per §3 component principle). Pass it verbatim. The implementer derives its own smoke command dynamically after editing — the BRIEFING must NOT include a precomputed `smokeTestCommand`. Do not pre-narrow the baseline here; narrowing is the implementer's responsibility.

   > **Note — component-rooted, no pre-narrowing**: the wrapper resolves the baseline at the component root (not necessarily the monorepo root). The implementer uses `git diff`/`git status` after editing to discover the actual touched files, then calls `sdd test-scope` itself (which handles the `cd <component>` prefix automatically). This keeps the BRIEFING minimal and makes the smoke reflect what was *actually* changed in this run.

6. **Architecture context** — read `.agents/stack.md` if it exists; if not, `.agents/architecture.md`; if neither exists, read only the first 60 lines of `AGENTS.md`. **Do not read the entire `.agents/` folder**.

Build the BRIEFING block that you will include literally in the delegation prompt:

```
BRIEFING:
changeName: <name>
objective: <objective in 1-2 sentences from the proposal>
scope:
  create: [path/new-file-1.ts, path/new-file-2.ts, ...]
  modify: [path/existing-1.ts, path/existing-2.ts, ...]
  doNotTouch: [refacil-sdd/, .claude/, .cursor/, .opencode/, AGENTS.md, package-lock.json]
  # Note: also do not modify global Codex user dir (~/.codex/) — skills/agents/hooks are outside the repo.
tasks:
  1. <task 1>
  2. <task 2>
  ...
testScope: scoped | full
testBaselineCommand: <project baseline from METHODOLOGY-CONTRACT.md §3 — the implementer derives the smoke dynamically>
codegraphAvailable: true | false
verificationWarning: <optional — set if applicable>
architectureContext: |
  <extract from stack.md or first lines of AGENTS.md>
specsNote: <"specs.md" | "specs/**/*.md" | "both — report contradictions in issues">
```

### Step 2: Delegate to the refacil-implementer sub-agent

Invoke the `refacil-implementer` sub-agent passing it the BRIEFING from the previous step plus:
- `changeName` (redundant with the briefing, but the guardrail needs it)
- If the user requested detailed mode, indicate it. Default: concise.

The sub-agent will use the briefing as the primary guide and will only read the files in `scope.modify` to understand existing interfaces — it will not re-read the already-extracted artifacts.

Returns ONE single message with the report + JSON block fenced as ` ```refacil-apply-result `.

### Step 2.5: Save cross-skill memory (memory.yaml)

After parsing the `refacil-apply-result` block and only if `result` is not `"FAILED"`:
- Extract `touchedFiles` from the result (list of files actually created/modified by the implementer).

Run:
```bash
refacil-sdd-ai sdd set-memory <changeName> \
  --last-step apply \
  --touched-files "<comma-separated list of modified files>"
```

This command merges into memory.yaml at the repo root using `findProjectRoot()` — no manual path construction needed.

If `result` is `"FAILED"`, skip and wait for user instructions.

### Step 2.6: Log CodeGraph telemetry (silent)

After parsing the `refacil-apply-result` block, run **once** (do not mention it to the user unless it fails):

```bash
refacil-sdd-ai compact log-codegraph-event --skill implementer --has-graph <codegraphAvailable> --tool-calls <N> --tokens <N>
```

- `--has-graph`: use the `codegraphAvailable` value detected in Step 1.5a (`true` or `false`).
- `--tool-calls`: number of `codegraph_*` tool calls the sub-agent made (0 if it did not use the graph).
- `--tokens`: conservative estimate of tokens saved (~800–1500 per useful tool call; 0 if no graph or no calls).

Estimate `--tool-calls` and `--tokens` from the sub-agent's `<usage>` block using the same criteria as `explore/SKILL.md` Step 1.5. If the command fails, ignore it; it must not block the flow.

### Step 3: Present result and next step

Show the user the **report** (everything before the `refacil-apply-result` block). Do not show the JSON block — it is internal metadata.

After the report add:

```
The next step is to generate/adjust unit tests.
Do you want me to continue with /refacil:test?
(The flow then continues with /refacil:verify)
```

If the sub-agent returned `result: "PARTIAL"` or `"FAILED"`, present the `issues` to the user and ask for instructions before continuing.

## Rules

- NEVER generate SDD artifacts from this command — that is exclusively `/refacil:propose`'s responsibility.
- Meet the preconditions of Step 0 (complete artifacts) and Step 1 (valid working branch) **before delegating**.
- **Always build the briefing (Step 1.5) before delegating** — it is the key piece that reduces the sub-agent cost.
- **Always delegate implementation to the sub-agent**. Do not replicate implementation logic or SDD artifact-apply logic here.
- Even when artifacts are Spanish, implementation output is English-only: created file/folder names, source code, test code, identifiers, and code comments.
- **Flow continuity**: if the user confirms affirmatively ("yes", "ok", "go", "continue", etc.) the continuity question in Step 3, immediately execute `/refacil:test`. Do not describe it in text or wait for the user to type it. (See `METHODOLOGY-CONTRACT.md §5`.)
