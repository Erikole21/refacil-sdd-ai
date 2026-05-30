# refacil:setup — Troubleshooting

Consult this file **only** if a setup step fails. It is not part of the happy path.

## `refacil-sdd-ai` command not found after `npm install -g`

- Check where npm installs binaries: `npm config get prefix`, then add `[prefix]/bin` (Linux/Mac) or `[prefix]` (Windows) to **PATH** and reopen the terminal / IDE.
- On Linux/Mac `sudo` is sometimes needed for global installs; it is preferable to fix npm prefix permissions (`npm config set prefix ~/.npm-global`) instead of using sudo.

## Skills `refacil-*` do not appear in the IDE

- Run `refacil-sdd-ai init` at the repo root and **restart** the IDE session.
- If the skills are present in the global IDE skills directory (e.g. `~/.claude/skills/`, `~/.cursor/skills/`, `~/.config/opencode/skills/`, `~/.codex/skills/`) but the IDE does not pick them up, restart the IDE (not just the session).

## OpenCode hooks (global plugin)

- OpenCode uses a **global** plugin at `~/.config/opencode/plugins/refacil-hooks.js` (not project `.opencode/plugins/`). Reinstall with `refacil-sdd-ai init` or `refacil-sdd-ai update` when OpenCode is selected, then restart OpenCode.

## Codex hooks

- Codex hooks merge into `~/.codex/config.toml` under `[hooks]` with `[features] codex_hooks = true`. Run `refacil-sdd-ai init` with Codex selected, then restart the Codex session.

## `refacil-sdd-ai init` creates files inside the wrong directory

- Always run `refacil-sdd-ai init` from the **repository root** (the folder that owns the codebase — commonly where `package.json`, `go.mod`, `pyproject.toml`, or `Cargo.toml` lives), not from inside a subdirectory.
- If you accidentally ran it from a subdirectory, delete the mistakenly created `.claude/`, `.cursor/`, `.claudeignore`, `.cursorignore`, `.cursorrules`, and `CLAUDE.md` from that subdirectory, then re-run from the correct location.

## `/refacil:setup` did not create `CLAUDE.md`, `.cursorignore`, etc.

- Those files come from **`refacil-sdd-ai sync-repo-ide`** (run by `/refacil:setup`). Execute it yourself from the **repository root**:

  ```bash
  refacil-sdd-ai sync-repo-ide
  ```

- Requires a prior **`refacil-sdd-ai init`** so **`~/.refacil-sdd-ai/selected-ides.json`** exists (or readable global skill dirs so the CLI can infer IDEs).

## Wrong directory for `sync-repo-ide`

- Same rule as **`init`** / **`update`**: cwd must be the **repository root**. Otherwise stubs and ignores are written next to the wrong folder.

## AGENTS.md is missing after init

- `refacil-sdd-ai init` does not generate `AGENTS.md` automatically — it is created by `/refacil:setup` inside the IDE.
- Run `/refacil:setup` after restarting the session.

## compact-guidance block not appearing in AGENTS.md

- The block is injected by the `check-update` hook (SessionStart). Restart the session to trigger it.
- If it still does not appear, run `refacil-sdd-ai update` manually.

## Hook `check-update` not running at session start

- Verify the hook is registered: Claude → `~/.claude/settings.json` (`SessionStart`); Cursor → `~/.cursor/hooks.json` (`sessionStart` when starting Agent chat — not duplicated on `workspaceOpen`). Both call `refacil-sdd-ai check-update`.
- If missing, run `refacil-sdd-ai init` again (it is idempotent).

## `refacil-sdd/` not created after using SDD commands

- `refacil-sdd/` is created automatically when you first run `/refacil:propose`.
- If you had an `openspec/` directory from a previous version, it is migrated to `refacil-sdd/` automatically on the next `refacil-sdd-ai sdd *` command or at session start via `check-update`.
