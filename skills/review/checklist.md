# General Checklist — Refacil Team

> Applies to **all** repositories (backend, frontend, fullstack), regardless of language or framework.
> Before evaluating, read the project's `AGENTS.md` to adapt each section to the actual stack.
> If `AGENTS.md` does not exist, apply this checklist as a baseline and mark N/A for rules that depend on undocumented conventions.
> **In addition to this checklist**, load the project-type specific checklist:
> - Backend: [checklist-back.md](checklist-back.md)
> - Frontend: [checklist-front.md](checklist-front.md)

## How to use this checklist (methodology)
1. Define review scope: `$ARGUMENTS` > `refacil-sdd/changes/` > `git diff`.
2. Evaluate blockers first: Scope, Spec, Testing, and Security.
3. Then evaluate Quality, Architecture, Errors, Dependencies, and Maintainability.
4. Mark each item as PASS, FAIL, or N/A with a brief justification.
5. For each FAIL, add severity: CRITICAL, HIGH, MEDIUM, or LOW.
6. If there are many FAILs, prioritize the 5 with the highest impact.

## 1. Scope and focus
- The change does **one single thing** (does not mix features with refactors, or fixes with unsolicited improvements)
- No functionality was implemented outside the scope of the spec or the reported bug
- If there are unrelated changes, they must be in a separate commit or PR
- The change size is reasonable to review (if too large, suggest dividing)

## 2. Spec compliance
- All acceptance criteria from the spec are covered
- Rejection criteria (edge cases) are handled
- The data model matches what was specified
- There are no differences between what the spec says and what the code does

## 3. Code quality

### Typing (Refacil standard)
- No use of unconstrained generic types (e.g. `any`, `object`, `dynamic`) — use interfaces, concrete types, or typed generics
- Interfaces/DTOs are defined for data transport between layers

### Object validation (Refacil standard)
- Both the object AND the property are validated before accessing (null-safe access or guard clause)
- No direct property access on objects that may be null or undefined

### Naming (Refacil standard)
- **Variables**: camelCase — **Classes**: PascalCase — **Files**: kebab-case with component type
- Self-documenting names: the name explains the component's purpose without needing comments

### Cleanliness
- The code follows existing repo patterns (check AGENTS.md)
- No duplicated code that could be extracted
- Immutable variables are preferred (avoid unnecessary mutations)
- No loose debug prints/logs, TODOs without an associated ticket, or commented-out code without reason
- Enums and constants are used for fixed values — configurable values go in configuration files, not hardcoded
- Imports use project aliases (if applicable)
- No new circular dependencies

## 4. Architecture
- **SRP**: each class/function has a single responsibility
- **KISS**: the solution is as simple as possible — no over-engineering or premature abstractions
- Logic is separated into single-purpose, reusable units
- No more than 4 parameters are passed to a method — if more are needed, encapsulate in an object/DTO
- The boundaries and layers defined in AGENTS.md are respected
- No unnecessary coupling is introduced between modules or services

> Architecture varies by project. Consult AGENTS.md to know which applies.

## 5. Error handling
- Errors are handled consistently with the rest of the project
- Error messages are useful for diagnosis (what failed, in what context)
- Internal details are not exposed to the user/consumer (stack traces, internal paths, DB IDs)
- Expected errors (validation, business) are distinguished from unexpected ones (system, infrastructure)
- No silenced errors (empty catch without log or handling)

## 6. Testing
- Each new/modified file has a corresponding test file
- Tests cover the acceptance criteria from the spec
- There are tests for edge cases and error scenarios
- Tests validate **behavior**, not implementation details (they do not break when refactoring)
- Mocks are minimal and necessary — do not mock what can be tested directly
- Tests are independent of each other (do not depend on execution order or shared state)
- Coverage >= 80% on new files
- Tests pass without errors (run the test command indicated in AGENTS.md)

## 7. Security
- No hardcoded secrets (passwords, API keys, tokens, internal service URLs)
- User inputs are validated before processing
- Sensitive endpoints or routes have appropriate authorization
- Sensitive information is not exposed in logs, error responses, or client source code
- No dependencies with known critical vulnerabilities (check if the project has audit configured)

## 8. Dependencies
- New dependencies are justified (no library added for something that can be done in a few lines)
- The license is compatible with the project
- The dependency is actively maintained (not abandoned)
- Does not duplicate functionality that already exists in the project or another installed dependency
- The version is pinned or uses a safe range (not `*` or `latest`)

## 9. Maintainability and observability
- The code is self-explanatory (comments only where logic is not obvious)
- Files are not excessively long (< 400 lines as a guideline)
- If something fails in production, there is enough information to diagnose (logs, traces, context in errors)
- Configuration changes are documented (new environment variables, flags, parameters)

## 10. Git and Deploy
- Commits are atomic and have descriptive messages
- No generated, temporary, or sensitive files in the commit (check .gitignore)
- No undocumented breaking changes
- If there are migrations, they are reversible and do not break existing data

## 11. Project-specific rules
- Consult the "Critical rules" section of AGENTS.md
- Evaluate against the "Always do", "Never do", and "Ask first" rules
- If AGENTS.md defines additional rules, verify their compliance

## Review exit criteria
- **APROBADO**: No CRITICAL/HIGH FAILs.
- **APROBADO CON OBSERVACIONES**: Only MEDIUM/LOW FAILs.
- **REQUIERE CORRECCIONES**: At least one CRITICAL/HIGH FAIL exists.
