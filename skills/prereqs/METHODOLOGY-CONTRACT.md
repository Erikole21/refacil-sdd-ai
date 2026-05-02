# SDD-AI Methodology Contract

This file centralizes cross-cutting rules to avoid duplication and inconsistencies between skills.

## §1 — Flow states (Definition of Ready / Done)

- **READY_FOR_PROPOSE**: problem understood (objective, scope, constraints) and minimum repo context.
- **READY_FOR_APPLY**: complete SDD artifacts (`proposal.md`, `design.md`, `tasks.md`, specification in `specs.md` and/or `specs/**/*.md`) and explicit user approval.
- **READY_FOR_VERIFY**: implementation finished, no changes outside scope.
- **READY_FOR_REVIEW**: for regular changes (propose), verify executed and critical issues resolved or accepted by the user. For bug fixes, the implementation and regression tests are complete (bugs do not go through verify).
- **READY_FOR_ARCHIVE**: review approved (`.review-passed` exists), tasks complete or exceptions approved, change functionally closed.
- **READY_FOR_MERGE**: review approved (`.review-passed` exists) and integration ready: PR created for the target branch. `/refacil:up-code` automatically verifies the review before push — if missing, it runs it.
- If multiple active changes exist without review, the target change must be explicitly selected before running review/push.

## §2 — AGENTS.md policy

- If a skill requires the `sdd` profile: `AGENTS.md` is mandatory (if missing, stop and redirect to `/refacil:setup`).
- If a skill requires the `agents` profile: if `AGENTS.md` is missing, continue with a generic baseline and report the limitation to the user.

## §3 — Test command resolution (multi-stack)

Do not hardcode `npm test` unless it is genuinely the project's command.

Detection order:
1. If `AGENTS.md` defines the official test command, use that.
2. If a package manager script exists (e.g. `npm test`, `pnpm test`, `yarn test`, `bun test`), use the corresponding one.
3. If Python: `pytest`.
4. If Go: `go test ./...`.
5. If Rust: `cargo test`.
6. If Java/Gradle: `./gradlew test` or `gradle test`.
7. If Java/Maven: `mvn test`.

Coverage (if applicable): detect the project command (`test:cov`, `coverage`, `pytest --cov`, etc.). If it does not exist, report N/A with justification.

### §3.1 — Scoped test execution (default for `/refacil:test` and `/refacil:verify`)

**Goal**: avoid high RAM/CPU from **full-repo** suites and **repo-wide** coverage on every SDD step. Defaults exercise **tests + coverage only for what the change touches**; full regression stays **on-demand** (explicit skill arguments).

| Briefing field | Values | Default |
|----------------|--------|---------|
| `testScope` | `scoped` \| `full` | `scoped` |
| `runCoverage` | `true` \| `false` | `true` |

**Rules**

1. **`testScope: scoped`** (default): sub-agents run tests **only** for artifacts tied to the current change — never invoke the §3 baseline in **full-repo / full-suite** form without narrowing (paths, packages, filters, patterns), except the explicit fallbacks below.
2. **`testScope: full`**: **on-demand only** — user explicitly requests whole-suite regression in **`/refacil:test`** (or `/refacil:verify`) arguments (e.g. `full`, `all tests`, `whole suite`, `suite completa`). Then use the §3 baseline test command **without** path narrowing and, if coverage runs, use the project’s **normal** coverage entrypoint without narrowing collection to the diff (unless `AGENTS.md` defines otherwise).
3. **`runCoverage: true`** (default): after scoped tests pass, run coverage **narrowed to the change** — instrument/collect only for **`filesToTest`**, **`changedFiles`**, and companion test/spec paths tied to those modules (examples: `--cov=pkg/sub`, Jest `--collectCoverageFrom` globs limited to touched trees, Gradle/JaCoCo scoped modules). If the toolchain cannot narrow, report **N/A** plus a WARNING; do **not** silently widen to repo-wide coverage while `testScope` remains `scoped`.
4. **`runCoverage: false`**: skip coverage entirely — only when the user **explicitly** opts out (`no coverage`, `nocoverage`, `skip coverage`, `sin cobertura`, etc.) or the project defines **no** coverage command under §3.
5. **`runCoverage: true` + `testScope: full`**: run the project coverage command **after** the full suite passes, using the repo’s usual global/module coverage behavior (heavy — intended only when the user requested `full`).

**Scoped command patterns** (language-agnostic — sub-agent reads `AGENTS.md`, build config, and tool docs; run from the correct module/root):

- Pass **explicit test paths**, **packages**, **classes**, or **filters** accepted by that stack (examples: Maven ` -Dtest=…`, Gradle `--tests …`, pytest file paths, `go test ./pkg/…`, `cargo test -p pkg`, .NET solution filter, Ruby `bundle exec rspec path`, JS package scripts with paths after `--`).
- Prefer files **produced or updated in this session**; until they exist, use the narrowest supported pattern (basename, substring, regex) derived from `filesToTest` / `changedFiles`, per runner docs.
- **Scoped coverage**: combine the same narrowing with coverage flags/includes that limit **report collection** to touched sources (runner-specific); exclude unrelated packages by default when `testScope: scoped`.
- **Unreliable scope**: if narrowing cannot be done safely, run the baseline §3 command **once**, report a brief WARNING that the run may be heavy, and suggest CI or **`/refacil:test ... full`** for full regression.

**Verify**: Prefer `commandsRun` from `get-memory` (same invocation as `/refacil:test` when present). Else derive scoped targets from `changedFiles` and/or `git diff --name-only`, using **project test naming and layout** (`AGENTS.md`, test config): e.g. co-located `*Spec.*` / `*Test.*`, `tests/`, language-specific suffices — not a fixed extension.

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

**Operative rule (mandatory)**: if the user confirms affirmatively ("yes", "ok", "go", "continue", "sure", etc.) to the continuity question, **directly invoke the next skill via the Skill tool** in the same turn. Do not ask the user to type `/refacil:X` or repeat the context — the session must continue without friction.

## §6 — Review and push scope

- `up-code` and `check-review` should only auto-run review when there is a single pending change.
- If there are multiple changes pending review, block and ask for explicit selection of `change-name`.
- `review` must not run in bulk mode by default when there are multiple active changes without explicit scope.

## §7 — Review evidence persistence

- `archive` requires `.review-passed` as a blocking precondition (verify existence according to **§8**).
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

- The **folder name** of the active change is the identifier used by the refacil-sdd CLI (`refacil-sdd status --change`, archive flows, etc.).
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
