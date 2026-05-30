# SDD-AI Methodology Contract

This file centralizes cross-cutting rules to avoid duplication and inconsistencies between skills.

## §1 — Flow states (Definition of Ready / Done)

- **READY_FOR_PROPOSE**: problem understood (objective, scope, constraints) and minimum repo context.
- **READY_FOR_APPLY**: complete SDD artifacts (`proposal.md`, `design.md`, `tasks.md`, specification in `specs.md` and/or recursive `specs/**/*.md`) and explicit user approval. Empty `specs/` folders do not count as specs.
- **READY_FOR_VERIFY**: implementation finished, no changes outside scope; **`/refacil:test`** should have run (or user accepts running verify without test memory — see §3.2 CR-01).
- **READY_FOR_REVIEW**: for regular changes (propose), verify executed (CA/CR validation; tests delegated to test phase by default per §3.2) and critical issues resolved or accepted by the user. For bug fixes, the implementation and regression tests are complete (bugs do not go through verify).
- **READY_FOR_ARCHIVE**: review approved (`.review-passed` exists), tasks complete or approved `fix-*` exception, current `/refacil:test` evidence available unless explicitly accepted in normal mode, change functionally closed.
- **READY_FOR_MERGE**: review approved (`.review-passed` exists) and integration ready: PR created for the target branch. `/refacil:up-code` automatically verifies the review before push — if missing, it runs it.
- If multiple active changes exist without review, the target change must be explicitly selected before running review/push.

## §2 — AGENTS.md policy

- If a skill requires the `sdd` profile: `AGENTS.md` is mandatory (if missing, stop and redirect to `/refacil:setup`).
- If a skill requires the `agents` profile: if `AGENTS.md` is missing, continue with a generic baseline and report the limitation to the user.

## §3 — Test command resolution (multi-stack, component-bounded)

**Component principle (language-agnostic)**: a *component* is the nearest independent unit with its own test setup — the closest ancestor directory (walking up from each changed file, bounded by the repo root) that contains a stack manifest (`package.json`, `go.mod`, `pyproject.toml`/`setup.py`/`pytest.ini`, `Cargo.toml`, `pom.xml`/`build.gradle`(.kts), `global.json`/`Directory.Build.props`, etc.). The `refacil-sdd-ai sdd test-scope` tool (`affectedComponents()`) exposes this automatically.

**All test execution is component-bounded**: no phase ever runs tests across the entire monorepo. `testScope: scoped` runs the narrowed tests of the affected component(s); `testScope: full` runs the full suite of each affected component (never all packages). The component root is the working directory for test commands in that component.

Do not hardcode any specific runner (e.g. `npm test`) unless it is genuinely the project's command. Resolve the command language-agnostically:

Detection order (applied at the **component root**, not the monorepo root):
1. If `AGENTS.md` defines the official test command for this component, use that.
2. If a package manager script exists at the component root (e.g. `npm test`, `pnpm test`, `yarn test`, `bun test`, `poetry run pytest`, etc.), use the corresponding one.
3. If Python: `pytest`.
4. If Go: `go test ./...`.
5. If Rust: `cargo test`.
6. If Java/Gradle: `./gradlew test` or `gradle test`.
7. If Java/Maven: `mvn test`.

Coverage (if applicable): detect the project command at the component root (`test:cov`, `coverage`, `pytest --cov`, etc.). If it does not exist, report N/A with justification.

### §3.1 — Scoped test execution (default for `/refacil:test`, `/refacil:apply`, and debugger fix mode; optional in `/refacil:verify` per §3.2)

**Goal**: avoid high RAM/CPU from **full-repo** suites and **repo-wide** coverage on every SDD step. Defaults exercise **tests + coverage only for what the change touches**; full regression stays **on-demand** (explicit skill arguments or unavoidable fallback).

**Also applies**: `/refacil:apply` (implementer verification step) and `/refacil:bug` (debugger `mode=fix`) — wrappers pass `testScope` plus the raw §3 baseline command. The write-capable sub-agent derives the scoped smoke after editing from the files it actually touched; the wrapper must not precompute a stale narrowed command.

| Briefing field | Values | Default |
|----------------|--------|---------|
| `testScope` | `scoped` \| `full` | `scoped` |
| `runCoverage` | `true` \| `false` | `true` |

**Rules**

1. **`testScope: scoped`** (default): sub-agents run tests **only** for artifacts tied to the current change — never invoke the §3 baseline in **full-repo / full-suite** form without narrowing (paths, packages, filters, patterns), except the explicit fallbacks below.
2. **`testScope: full`**: **on-demand only** — user explicitly requests whole-suite regression in **`/refacil:test`** (or `/refacil:verify`) arguments (e.g. `full`, `all tests`, `whole suite`, `suite completa`). Resolve the §3 baseline command language-agnostically at each **affected component root** and run it from that component dir (`cd <component> && <baseline>`). Never run all monorepo packages — only the component(s) whose files changed. If multiple components are affected, run each in sequence. Coverage = component-wide (not repo-wide).
3. **`runCoverage: true`** (default): after scoped tests pass, run coverage **narrowed to the change** — instrument/collect only for **`filesToTest`**, **`changedFiles`**, and companion test/spec paths tied to those modules (examples: `--cov=pkg/sub`, Jest `--collectCoverageFrom` globs limited to touched trees, Gradle/JaCoCo scoped modules). If the toolchain cannot narrow, report **N/A** plus a WARNING; do **not** silently widen to repo-wide coverage while `testScope` remains `scoped`.
4. **`runCoverage: false`**: skip coverage entirely — only when the user **explicitly** opts out (`no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, etc.) or the project defines **no** coverage command under §3.
5. **`runCoverage: true` + `testScope: full`**: run the project coverage command **after** the full suite passes, using the repo’s usual global/module coverage behavior (heavy — intended only when the user requested `full`).
6. **`/refacil:apply` / implementer**: the apply wrapper supplies `testScope` (default `scoped`) and **`testBaselineCommand`**. After editing, the implementer runs `refacil-sdd-ai sdd test-scope --files <touched-files-csv> --baseline "<testBaselineCommand>"` and executes the returned smoke command. The implementer **NEVER runs the full repo/package baseline** as the apply verification step — the "unreliable scope → run baseline once" escape hatch in §3.1 Scoped command patterns does NOT apply here. Fallback behaviour: if `test-scope` returns `fallback: true`, fails, or there are no touched files, run only the touched files that are themselves test files; if none exist, **SKIP verification** and add a LOW `issues` entry deferring to `/refacil:test`. Also applies: the wrapper must not precompute a stale narrowed command. Coverage is optional in that step unless the briefing adds an explicit coverage command (unusual; defer to `/refacil:test`).
7. **`/refacil:bug` / debugger `mode=fix`**: debugger defaults to **`scoped`**, narrows §3 baseline to **`filesModified` ∪ new/updated regression test files** unless the wrapper passed **`testScope: full`**.
8. **Re-run / fix-loop (pass-2)**: when iterating on failing tests, run **only the previously-failing test files** — not the entire component suite. This keeps fix loops fast and bounded.

**Scoped command patterns** (language-agnostic — sub-agent reads `AGENTS.md`, build config, and tool docs; run from the correct module/root):

- Pass **explicit test paths**, **packages**, **classes**, or **filters** accepted by that stack (examples: Maven ` -Dtest=…`, Gradle `--tests …`, pytest file paths, `go test ./pkg/…`, `cargo test -p pkg`, .NET solution filter, Ruby `bundle exec rspec path`, JS package scripts with paths after `--`).
- Prefer files **produced or updated in this session**; until they exist, use the narrowest supported pattern (basename, substring, regex) derived from `filesToTest` / `changedFiles`, per runner docs.
- **Scoped coverage**: combine the same narrowing with coverage flags/includes that limit **report collection** to touched sources (runner-specific); exclude unrelated packages by default when `testScope: scoped`.
- **Unreliable scope**: if narrowing cannot be done safely, run the baseline §3 command **once**, report a brief WARNING that the run may be heavy, and suggest CI or **`/refacil:test ... full`** for full regression.

**Verify (when `testExecution: full`)**: Prefer `commandsRun` from `get-memory` as reference only when re-running; else derive scoped targets from `changedFiles` and/or `git diff --name-only`, using **project test naming and layout** (`AGENTS.md`, test config): e.g. co-located `*Spec.*` / `*Test.*`, `tests/`, language-specific suffices — not a fixed extension.

### §3.2 — Phase ownership (test execution)

**Goal**: run the **full** scoped (or full-suite) test + coverage pipeline **once per cycle** in `/refacil:test`. Later phases validate specs and quality **without** repeating that pipeline unless the user explicitly requests it or test memory is missing.

| Phase | Runs tests? | Coverage? | Writes `memory.commandsRun`? |
|-------|-------------|-----------|--------------------------------|
| `/refacil:apply` | Scoped post-implementation check only (pre-test) | Unusual; defer to test | No |
| `/refacil:test` | **Yes** — canonical suite for the change | **Yes** (scoped by default) | **Yes** |
| `/refacil:verify` | **No by default** (`testExecution: none`) | No | No (reads memory) |
| `/refacil:review` | **No** (checklist + file reads) | No | No |
| Corrections after verify/review | **Smoke only** or defer to `/refacil:test` | No | No |

**Briefing field `testExecution`** (verify wrapper → validator):

| Value | When | Validator behavior |
|-------|------|-------------------|
| `none` | Default if `memory.lastStep` is `test` (or later) and `commandsRun` is non-empty; user did not force re-run | **Do not** run `testCommand` or `coverageCommand`. Tests section = **delegated to test phase**; cite last `commandsRun`. |
| `smoke` | After surgical corrections in verify Step 5 (or rare review fix) | Run **only** companion test files for `correctionTouchedFiles`. **No** `coverageCommand`. |
| `full` | User tokens (`full`, `re-run tests`, `run tests`, …) **or** CR-01 (no test memory) | Same as §3.1: `testCommand` + optional narrowed/full coverage per `testScope` / `runCoverage`. |

**Smoke definition**: the smallest test invocation that exercises files touched by a **correction** (not the whole change). Derive companion paths from project layout (`*Spec*`, `*Test*`, `tests/`, etc.). Smoke **does not** satisfy coverage gates or replace `/refacil:test`.

**After corrections** (verify Step 5 or review Step 3.5): prefer `testExecution: none` + tell the user to run **`/refacil:test`** before the next full verify; or `smoke` once on correction files. **Never** use `full` in autofix re-verify unless the user explicitly requested it in the same invocation.

**Review checklist “tests pass”**: PASS when test files exist for the diff, `memory.criteriaRun` covers relevant CA/CR, and static review finds no obvious breakage — **without** running the §3 baseline via Bash unless the user explicitly asked.

## §3C — 3C Criterion: Completeness, Correctness, Coherence

The **3C criterion** is the authoritative framework for evaluating implementations. It is applied by the `refacil-validator` sub-agent during `/refacil:verify` and referenced by the `refacil-auditor` during `/refacil:review`. All three dimensions must be assessed; missing one dimension is itself a WARNING.

### Dimension 1 — Completeness (is everything implemented?)

**Question**: Does the implementation cover all tasks and all scope files listed in the briefing?

Operational checks:
- Every task in `tasks.md` (or the briefing's task list) has a corresponding code artifact.
- Every file in `scope.create` exists and has substantive content coherent with the objective.
- Every file in `scope.modify` was actually modified with changes relevant to the task.
- No mandatory scope file is missing or is an empty scaffold.

### Dimension 2 — Correctness (is it correctly implemented?)

**Question**: Does each implemented artifact satisfy the CA/CR criteria from the specs?

Operational checks:
- For each CA-XX: verify the implementation satisfies the criterion by reading the relevant scope files.
- For each CR-XX: verify that edge cases and rejection conditions are handled.
- Behavior matches the spec intent — not just surface text.

### Dimension 3 — Coherence (is it consistent with the architecture?)

**Question**: Do the new or modified files fit the established patterns without introducing inconsistencies?

Operational checks:
- New files follow naming, structure, and module conventions from `architectureContext` (or `AGENTS.md`).
- No files outside `scope.doNotTouch` were modified.
- Patterns introduced are consistent with existing ones in the same module or layer.
- If `codegraphAvailable: true` in the briefing: use `codegraph_context` or `codegraph_search` on `changedFiles` to verify architectural coherence. If not available, continue with direct file reading.

### Severity table

| Severity | Completeness | Correctness | Coherence |
|----------|-------------|-------------|-----------|
| CRITICAL | Mandatory task or `scope.create` file missing entirely | Mandatory CA not met; spec contract broken | Files in `scope.doNotTouch` modified |
| WARNING | Partial implementation of a task; `scope.modify` file unchanged | Regression risk; CR edge case not handled | Pattern deviation; naming inconsistency |
| SUGGESTION | Optional improvement not covered | Improvable edge case handling | Better alignment opportunity |

### Graceful degradation rule

If the briefing does not include `criteria` (CA/CR list), infer the criteria by reading `refacil-sdd/changes/<changeName>/specs.md` or `specs/**/*.md`. If there are no specs either, apply **only Dimension 1 (Completeness)** and document the limitation as a WARNING in the report. Never block verification entirely due to missing specs — degrade gracefully.

## §4 — Protected branch policy and branch creation

> **Dynamic config**: before applying any branch rule, run `refacil-sdd-ai sdd config --json`
> to obtain the effective `protectedBranches` and `baseBranch` for this project.
> The values below are the built-in defaults and serve as the fallback if the command is unavailable.

Protected branches built-in defaults (authoritative list: `refacil-sdd-ai sdd config --json`): `master`, `main`, `develop`, `dev`, `testing`, `qa`. These are the fallback when no config file is present. When `sdd config --json` is unavailable, treat at minimum `master` and `main` as protected — they are the universally protected branches across all projects.

Critical rule:
- **NEVER** make direct changes on protected branches.
- All integration to protected branches is done via PR.

### Working branch creation

- General rule: every new working branch (`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, etc.) must be created from the `baseBranch` returned by `sdd config --json`.
- Exception for new repos: if the configured `baseBranch` does not exist yet, creating temporarily from `main` or `master` is allowed.
- If the exception is used, recommend creating the configured `baseBranch` and adopting that flow as the repo standard.
- **NEVER** create working branches from any other protected branch (as listed by `sdd config --json`), or from other feature/bug branches.

### Integration

- All integration to any protected branch requires a **PR**.
- No exceptions: all protected branches (as returned by `sdd config --json`), plus `release/*` patterns — all require PR.
- Recommend the user create a PR to one of the protected branches listed by `sdd config --json` to make the changes available for integration.

### Protocol when the current branch is protected

If the current branch is protected and code needs to be written, follow the gates below strictly. Each gate is a hard stop — do not proceed to the next gate until the user has replied in the current one.

---

**[GATE 1 — STOP AND WAIT: ask for task identifier]**

Ask the user exactly this question and then STOP. Do NOT run any git command. Do NOT propose a branch name. Do NOT continue to Gate 2 until the user replies:

> "What is the task number or identifier for this branch? (e.g. SEGINF-20, REF-123, or a short descriptive name)"

If the user says they have no ID, note that and proceed to Gate 2 with `<ID> = none`.

---

**[GATE 2 — STOP AND WAIT: propose branch name and ask for approval]**

Only after receiving the user's reply to Gate 1:

1. Verify clean working directory (`git status --porcelain`).
2. If there are uncommitted changes, ask for approval to stash them (`git stash push -m "auto-stash-refacil"`). Do NOT stash without approval.
3. Detect the base branch:
   - Use the `baseBranch` from `sdd config --json`.
   - Only if that branch does not exist (new repo), use `main` or `master` as a temporary exception.
4. Compose the branch name:
   - Feature: `feature/<ID>` (e.g. `feature/SEGINF-20`)
   - Bugfix: `fix/<ID>` (e.g. `fix/SEGINF-20`)
   - Without ID: propose a short descriptive name (e.g. `fix/session-timeout-redis`)
5. Present the proposed name and ask for approval. Then STOP. Do NOT run `git checkout` or `git switch`. Do NOT create the branch yet. Wait for the user's explicit confirmation:

> "I'll create branch `<proposed-name>` from `<base-branch>`. Shall I proceed?"

---

**[GATE 3 — execute only after explicit approval from Gate 2]**

Only after the user explicitly confirms (e.g. "yes", "go", "ok", "proceed"):

1. Switch to the base branch and update it (`git checkout <base>` + `git pull origin <base>`).
2. Create the working branch (`git checkout -b <branch-name>`).
3. If a stash was approved in Gate 2, restore it (`git stash pop`).

If the user does not approve at Gate 2, stop entirely. Do not create any branch.

## §5 — Output policy (UX)

Default mode: **concise**.

- **Concise**: verdict + blockers + maximum 5 prioritized findings + next step.
- **Detailed**: full section-by-section report.

If the user does not request detail, use concise mode.

### Natural flow continuity (confirmation)

- When there is **one single possible next step** within the flow, do not limit yourself to "run `/refacil:...`".
- In that case, close with a continuity question in natural language using the **single formula**:
  - *"The next step is [brief description]. Do you want me to continue with `/refacil:<skill>`?"*
- When there are **multiple valid next steps** (real branching), list numbered options and ask for explicit selection.
- If the current step is **terminal** (end of flow, e.g. PR created), close without asking for the next skill.

**Operative rule (mandatory)**: if the user confirms affirmatively ("yes", "ok", "go", "continue", "sure", etc.) to the continuity question, **directly execute the next `/refacil:<skill>` command** in the same turn. Do not ask the user to type it or repeat the context — the session must continue without friction.

## §6 — Review and push scope

- `up-code` and `check-review` should only auto-run review when there is a single pending change.
- If there are multiple changes pending review, block and ask for explicit selection of `change-name`.
- `review` must not run in bulk mode by default when there are multiple active changes without explicit scope.

## §7 — Review evidence persistence

- `archive` requires `.review-passed` as a blocking precondition (verify existence according to **§8**).
- Regular changes require the proposal artifact set before apply/archive readiness: `proposal.md`, `design.md`, `tasks.md`, and specs from non-empty `specs.md` and/or recursive non-empty `specs/**/*.md`. The same source set must be used by `sdd status`, `sync-spec`, test/verify criteria extraction, and archive.
- Operational bug fixes created by `/refacil:bug` are the exception: `fix-*` changes may archive without proposal artifacts when they include `summary.md`, regression test evidence, and `.review-passed`. Archive must document the resulting behavior under `refacil-sdd/specs/` with `review.yaml`.
- Archive must use current `/refacil:test` evidence from `memory.yaml` instead of re-running tests by default. If evidence is missing or stale, normal mode asks the user to run `/refacil:test` or explicitly continue; autopilot mode aborts to preserve the contract without hidden broad test execution.
- When archiving regular changes (proposal-driven flow), the `.review-passed` metadata must be persisted in `refacil-sdd/specs/`.
- `archive` must request and persist at least one task reference for traceability. Accepted formats: URL, ticket/issue identifier, or short task name.
- The recommended field in `review.yaml` is `taskReferences` (YAML list). Do not enforce provider-specific fields such as `jiraTasks`.
- The recommended format is `review.yaml` inside each affected spec folder.
- If it cannot be reliably mapped to specific specs, record the evidence in `refacil-sdd/specs/review-metadata.yaml`.

## §8 — Hidden files under `refacil-sdd/changes/<change>/`

- **`.review-passed`** and any file whose name starts with **`.`** are **hidden** in many environments: in shell, **`ls` without `-a` / `-la` does not list them** — do not conclude they do not exist because of this (avoid false negatives in prereqs, review, verify, `up-code`, and archive).
- **Preferred**: **`Glob`** tool (pattern under `refacil-sdd/changes/<name>/`), **`Read`** on the exact path `refacil-sdd/changes/<name>/.review-passed`, or Bash **`test -f`** / **`[ -f ... ]`** on that path.
- If the user says the file exists and your check denied it, **re-verify** with one of the above methods before insisting.

## §9 — Folder identifier under `refacil-sdd/changes/<change>/`

- The **folder name** of the active change is the identifier used by the refacil-sdd CLI (`refacil-sdd-ai sdd status <change>`, archive flows, etc.).
- **Must start with an ASCII letter** `[a-zA-Z]`. If the first character is a digit or other symbol, the CLI rejects the name (e.g. `Invalid change name: Change name must start with a letter`).

## §10 — Language policy

- **Agent and skill internal instructions**: always in **English** (reduces token cost, improves LLM performance).
- **Responses to the user**: in the **user's language**. If the user writes in Spanish, respond in Spanish. If in English, respond in English. Default: Spanish.
- **SDD artifacts** (proposal.md, specs, design.md, tasks.md): in the **user's language** (or the language the team agreed on for the project).
- **Source code and generated files are always English-only**, regardless of `artifactLanguage`:
  - code identifiers (variables, functions, classes, types, interfaces, enums)
  - test code and test names/descriptions
  - source file and folder names created during implementation
  - code comments and commit/PR technical text produced by the agent
- Never translate existing canonical API names, library symbols, or protocol/domain terms.
