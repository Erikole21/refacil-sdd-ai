---
name: refacil:read-spec
description: Listen to SDD spec Markdown files in the browser with on-device TTS (Supertonic). Use after propose or on-demand for active changes and archived specs.
user-invocable: true
---

# refacil:read-spec — Spec reader (TTS)

Play a Markdown spec aloud in the local browser using on-device TTS. The CLI parses the file(s), stores a short-lived session on the broker, and opens `/read-spec`.

**Prerequisites**: `sdd` profile from `refacil-prereqs/SKILL.md`.

## CLI (always use this)

Single file mode:
```bash
refacil-sdd-ai read-spec --file <path-relative-to-repo-root> [--lang es] [--voice M3] [--speed 1]
```

Folder mode (all SDD artifacts for a change in one browser panel with sidebar):
```bash
refacil-sdd-ai read-spec --change <changeName> [--select <file.md>] [--lang es] [--voice M3] [--speed 1]
```

- `--change <changeName>`: loads all `.md` files from `refacil-sdd/changes/<changeName>/` in order: `proposal.md → design.md → tasks.md → specs.md → (others alphabetically)`. Opens a sidebar for navigation between files.
- `--select <file.md>`: pre-selects a specific file in the sidebar (default: `proposal.md`).
- `--file` and `--change` are mutually exclusive.

Defaults: `lang=es`, `voice=M3`, `speed=1`.

## Post-propose flow (CA-24)

The listen option is presented as **option B** in the `/refacil:propose` Step 3 review menu — handled directly by that skill. When the user selects B, run:

```bash
refacil-sdd-ai read-spec --change <changeName>
```

Language is auto-detected from the artifact content (no `--lang` flag needed). After playback, re-present the Step 3 review menu so the user can approve or request adjustments.

## On-demand — archived specs only (CA-25)

When there are **no** active folders under `refacil-sdd/changes/` (except `archive/`):

1. Ask which archived spec folder under `refacil-sdd/specs/`.
2. Run `read-spec --file refacil-sdd/specs/<name>/spec.md` (verify the folder exists first).

## On-demand — active changes (CA-26)

When there are active folders under `refacil-sdd/changes/`:

1. List the active change names.
2. Ask the user which change to listen to (and optionally which file to start from).
3. Run:

```bash
refacil-sdd-ai read-spec --change <changeName> [--select <file.md>]
```

If the user specifies a particular file (e.g. "I want to hear specs.md"), add `--select specs.md`.

## On-demand — active changes and archived (CA-27)

When both active changes and `refacil-sdd/specs/` exist:

1. Ask: open **change** or **archived spec**?
2. List names from the chosen location.
3. For a change: run `read-spec --change <changeName>` (with optional `--select`).
4. For archived: `refacil-sdd/specs/<name>/spec.md` → run `read-spec --file <path>`.

## Rules

- Never send spec content to remote TTS APIs; only the CLI + local browser run.
- If the path or change folder is missing, report clearly (CR-11, CR-12) — do not run the CLI silently.
- `--file` must stay inside the project root (the CLI enforces this).
- `--change` and `--file` are mutually exclusive — never pass both.
