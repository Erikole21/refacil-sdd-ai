# refacil:setup — Troubleshooting

Consult this file **only** if a setup step fails. It is not part of the happy path.

## `refacil-sdd-ai` command not found after `npm install -g`

- Check where npm installs binaries: `npm config get prefix`, then add `[prefix]/bin` (Linux/Mac) or `[prefix]` (Windows) to **PATH** and reopen the terminal / IDE.
- On Linux/Mac `sudo` is sometimes needed for global installs; it is preferable to fix npm prefix permissions (`npm config set prefix ~/.npm-global`) instead of using sudo.

## Skills `refacil-*` do not appear in the IDE

- Run `refacil-sdd-ai init` at the repo root and **restart** the Claude Code or Cursor session.
- If the skills are present in `.claude/skills/` but the IDE does not pick them up, restart the IDE (not just the session).

## `refacil-sdd-ai init` creates files inside the wrong directory

- Always run `refacil-sdd-ai init` from the **repository root** (the folder that owns the codebase — commonly where `package.json`, `go.mod`, `pyproject.toml`, or `Cargo.toml` lives), not from inside a subdirectory.
- If you accidentally ran it from a subdirectory, delete the mistakenly created `.claude/`, `.cursor/`, `.claudeignore`, `.cursorignore`, `.cursorrules`, and `CLAUDE.md` from that subdirectory, then re-run from the correct location.

## AGENTS.md is missing after init

- `refacil-sdd-ai init` does not generate `AGENTS.md` automatically — it is created by `/refacil:setup` inside the IDE.
- Run `/refacil:setup` after restarting the session.

## compact-guidance block not appearing in AGENTS.md

- The block is injected by the `check-update` hook (SessionStart). Restart the session to trigger it.
- If it still does not appear, run `refacil-sdd-ai update` manually.

## Hook `check-update` not running at session start

- Verify the hook is registered: check `.claude/settings.json` or `.cursor/settings.json` for a `hooks.SessionStart` entry that calls `refacil-sdd-ai check-update`.
- If missing, run `refacil-sdd-ai init` again (it is idempotent).

## `refacil-sdd/` not created after using SDD commands

- `refacil-sdd/` is created automatically when you first run `/refacil:propose`.
- If you had an `openspec/` directory from a previous version, it is migrated to `refacil-sdd/` automatically on the next `refacil-sdd-ai sdd *` command or at session start via `check-update`.
