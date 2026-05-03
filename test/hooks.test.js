'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { installHooks, uninstallHooks, installCodexHooks, uninstallCodexHooks } = require('../lib/hooks');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Claude Code: settings.json ───────────────────────────────────────────────

describe('installHooks (.claude) — settings.json', () => {
  test('crea los 4 hooks SDD', () => {
    installHooks('.claude', tmpDir);
    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));

    assert.ok(s.hooks.SessionStart.some((h) => h._sdd === true));
    assert.ok(s.hooks.UserPromptSubmit.some((h) => h._sdd_notify === true));
    assert.ok(s.hooks.PreToolUse.some((h) => h._sdd_compact === true));
    assert.ok(s.hooks.PreToolUse.some((h) => h._sdd_review === true));
  });

  test('compact-bash precede a check-review en PreToolUse', () => {
    installHooks('.claude', tmpDir);
    const ptu = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8')).hooks.PreToolUse;
    assert.ok(ptu.findIndex((h) => h._sdd_compact) < ptu.findIndex((h) => h._sdd_review));
  });

  test('es idempotente', () => {
    installHooks('.claude', tmpDir);
    assert.equal(installHooks('.claude', tmpDir), false);

    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.equal(s.hooks.SessionStart.filter((h) => h._sdd).length, 1);
    assert.equal(s.hooks.UserPromptSubmit.filter((h) => h._sdd_notify).length, 1);
    assert.equal(s.hooks.PreToolUse.filter((h) => h._sdd_compact).length, 1);
    assert.equal(s.hooks.PreToolUse.filter((h) => h._sdd_review).length, 1);
  });

  test('preserva hooks no-SDD', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.json'), JSON.stringify({
      hooks: { SessionStart: [{ _custom: true, matcher: '', hooks: [] }] },
    }));
    installHooks('.claude', tmpDir);

    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(s.hooks.SessionStart.some((h) => h._custom === true));
    assert.ok(s.hooks.SessionStart.some((h) => h._sdd === true));
  });

  test('tolera settings.json invalido', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'no-es-json');
    assert.doesNotThrow(() => installHooks('.claude', tmpDir));
    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(s.hooks.SessionStart.some((h) => h._sdd));
  });

  test('retorna true en primera instalacion', () => {
    assert.equal(installHooks('.claude', tmpDir), true);
  });
});

describe('uninstallHooks (.claude)', () => {
  test('elimina todos los hooks SDD', () => {
    installHooks('.claude', tmpDir);
    uninstallHooks('.claude', tmpDir);
    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(!s.hooks);
  });

  test('no toca hooks no-SDD', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.json'), JSON.stringify({
      hooks: { SessionStart: [{ _custom: true, hooks: [] }] },
    }));
    installHooks('.claude', tmpDir);
    uninstallHooks('.claude', tmpDir);

    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(s.hooks.SessionStart.some((h) => h._custom === true));
    assert.ok(!s.hooks.SessionStart.some((h) => h._sdd === true));
  });

  test('retorna false si no hay nada que remover', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'settings.json'), JSON.stringify({ other: true }));
    assert.equal(uninstallHooks('.claude', tmpDir), false);
  });

  test('retorna false si el archivo no existe', () => {
    assert.equal(uninstallHooks('.claude', tmpDir), false);
  });
});

// ── Cursor: hooks.json ───────────────────────────────────────────────────────

describe('installHooks (.cursor) — hooks.json', () => {
  test('crea los 4 hooks SDD en hooks.json (sin tocar settings.json para hooks)', () => {
    installHooks('.cursor', tmpDir);

    const h = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'hooks.json'), 'utf8'));
    assert.ok(h.hooks.sessionStart.some((e) => e._sdd === true));
    assert.ok(h.hooks.preToolUse.some((e) => e._sdd_compact === true));
    assert.ok(h.hooks.preToolUse.some((e) => e._sdd_review === true));
    assert.ok(h.hooks.beforeSubmitPrompt.some((e) => e._sdd_notify === true));
  });

  test('compact-bash precede a check-review en preToolUse', () => {
    installHooks('.cursor', tmpDir);
    const ptu = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'hooks.json'), 'utf8')).hooks.preToolUse;
    assert.ok(ptu.findIndex((h) => h._sdd_compact) < ptu.findIndex((h) => h._sdd_review));
  });

  test('no escribe hooks SDD en settings.json', () => {
    installHooks('.cursor', tmpDir);
    if (fs.existsSync(path.join(tmpDir, '.cursor', 'settings.json'))) {
      const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'settings.json'), 'utf8'));
      assert.ok(!s.hooks?.SessionStart?.some((h) => h._sdd));
      assert.ok(!s.hooks?.PreToolUse?.some((h) => h._sdd_compact || h._sdd_review));
    }
  });

  test('es idempotente', () => {
    installHooks('.cursor', tmpDir);
    assert.equal(installHooks('.cursor', tmpDir), false);

    const h = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'hooks.json'), 'utf8'));
    assert.equal(h.hooks.sessionStart.filter((e) => e._sdd).length, 1);
    assert.equal(h.hooks.beforeSubmitPrompt.filter((e) => e._sdd_notify).length, 1);
  });

  test('retorna true en primera instalacion', () => {
    assert.equal(installHooks('.cursor', tmpDir), true);
  });
});

describe('uninstallHooks (.cursor)', () => {
  test('elimina todos los hooks SDD de hooks.json', () => {
    installHooks('.cursor', tmpDir);
    uninstallHooks('.cursor', tmpDir);

    const h = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'hooks.json'), 'utf8'));
    assert.ok(!h.hooks?.sessionStart);
    assert.ok(!h.hooks?.preToolUse);
    assert.ok(!h.hooks?.beforeSubmitPrompt);
  });

  test('limpia vestigios SDD en settings.json si existen', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.writeFileSync(path.join(tmpDir, '.cursor', 'settings.json'), JSON.stringify({
      hooks: { SessionStart: [{ _sdd: true, hooks: [] }], PreToolUse: [{ _sdd_compact: true, hooks: [] }] },
    }));
    installHooks('.cursor', tmpDir);
    uninstallHooks('.cursor', tmpDir);

    const s = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'settings.json'), 'utf8'));
    assert.ok(!s.hooks?.SessionStart?.some((h) => h._sdd));
    assert.ok(!s.hooks?.PreToolUse?.some((h) => h._sdd_compact));
  });
});

// ── CR-2: separacion correcta por IDE ───────────────────────────────────────

describe('CR-2: Claude Code usa settings.json, Cursor usa hooks.json', () => {
  test('archivos correctos por IDE', () => {
    installHooks('.claude', tmpDir);
    installHooks('.cursor', tmpDir);

    // Claude Code: hooks en settings.json
    const cs = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.ok(cs.hooks.SessionStart.some((h) => h._sdd));
    assert.ok(cs.hooks.UserPromptSubmit.some((h) => h._sdd_notify));

    // Cursor: hooks en hooks.json
    const ch = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cursor', 'hooks.json'), 'utf8'));
    assert.ok(ch.hooks.sessionStart.some((h) => h._sdd));
    assert.ok(ch.hooks.beforeSubmitPrompt.some((h) => h._sdd_notify));
  });
});

// ── Codex: CA-04 — installCodexHooks writes SDD hooks to ~/.codex/config.toml ─

describe('CA-04: installCodexHooks writes SDD hooks to ~/.codex/config.toml', () => {
  test('creates ~/.codex/config.toml with hooks entries on first run', () => {
    installCodexHooks(tmpDir);
    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml must be created');
    const content = fs.readFileSync(configPath, 'utf8');
    // smol-toml serializes array-of-tables as [[hooks.<event>]] — check for that pattern
    assert.ok(
      content.includes('[[hooks.') || content.includes('[hooks]'),
      'config.toml must contain hooks entries ([[hooks.*]] or [hooks])',
    );
  });

  test('includes [features] codex_hooks = true', () => {
    installCodexHooks(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    assert.ok(content.includes('codex_hooks'), 'config.toml must include codex_hooks flag');
  });

  test('installs sessionStart SDD hook', () => {
    installCodexHooks(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    assert.ok(content.includes('check-update'), 'sessionStart hook must contain check-update command');
  });

  test('installs preToolUse compact-bash and check-review hooks', () => {
    installCodexHooks(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    assert.ok(content.includes('compact-bash'), 'preToolUse compact-bash hook must be present');
    assert.ok(content.includes('check-review'), 'preToolUse check-review hook must be present');
  });

  test('installs userPromptSubmit notify-update hook', () => {
    installCodexHooks(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    assert.ok(content.includes('notify-update'), 'userPromptSubmit notify-update hook must be present');
  });

  test('returns true on first installation', () => {
    const result = installCodexHooks(tmpDir);
    assert.equal(result, true, 'must return true on first install');
  });

  test('installHooks facade with .codex routes to installCodexHooks', () => {
    const result = installHooks('.codex', tmpDir);
    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    assert.ok(fs.existsSync(configPath), 'installHooks(.codex) must create config.toml');
    assert.equal(result, true, 'installHooks(.codex) must return true on first install');
  });

  test('merges SDD hooks with existing non-SDD TOML content', () => {
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.codex', 'config.toml'),
      '[model]\ndefault = "o3"\n',
    );
    installCodexHooks(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    // Existing non-SDD key must still be present
    assert.ok(content.includes('o3'), 'non-SDD model key must be preserved after merge');
    // SDD hooks must have been added
    assert.ok(content.includes('check-update'), 'SDD hooks must be added alongside existing content');
  });
});

// ── Codex: CA-05 (hooks) — installCodexHooks is idempotent ──────────────────

describe('CA-05 (hooks): installCodexHooks is idempotent', () => {
  test('running installCodexHooks twice does not duplicate hooks', () => {
    installCodexHooks(tmpDir);
    const result2 = installCodexHooks(tmpDir);
    assert.equal(result2, false, 'second run must return false (already up to date)');

    const content = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    // Count occurrences of check-update — must be exactly one
    const checkUpdateOccurrences = (content.match(/check-update/g) || []).length;
    assert.equal(checkUpdateOccurrences, 1, 'check-update hook must not be duplicated');
  });

  test('installHooks(.codex) facade is idempotent', () => {
    installHooks('.codex', tmpDir);
    const result2 = installHooks('.codex', tmpDir);
    assert.equal(result2, false, 'second call to installHooks(.codex) must return false');
  });
});

// ── Codex: CA-06 (hooks) — uninstallCodexHooks / uninstallHooks('.codex') ───

describe('CA-06 (hooks): uninstallCodexHooks removes SDD hooks from config.toml', () => {
  test('removes SDD hooks after installCodexHooks', () => {
    installCodexHooks(tmpDir);
    uninstallCodexHooks(tmpDir);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    // File may be deleted or kept — if kept, must not contain SDD hooks
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      assert.ok(!content.includes('check-update'), 'check-update hook must be removed');
      assert.ok(!content.includes('compact-bash'), 'compact-bash hook must be removed');
      assert.ok(!content.includes('check-review'), 'check-review hook must be removed');
      assert.ok(!content.includes('notify-update'), 'notify-update hook must be removed');
    }
  });

  test('returns true when hooks were removed', () => {
    installCodexHooks(tmpDir);
    const result = uninstallCodexHooks(tmpDir);
    assert.equal(result, true, 'must return true when SDD hooks were removed');
  });

  test('returns false when config.toml does not exist', () => {
    const result = uninstallCodexHooks(tmpDir);
    assert.equal(result, false, 'must return false when config.toml does not exist');
  });

  test('preserves non-SDD keys when removing SDD hooks', () => {
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.codex', 'config.toml'),
      '[model]\ndefault = "o3"\n',
    );
    installCodexHooks(tmpDir);
    uninstallCodexHooks(tmpDir);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml must still exist (has non-SDD content)');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('o3'), 'non-SDD model key must be preserved after uninstall');
  });

  test('removes hooks entries when they become empty after uninstall', () => {
    // Install hooks only (no other content in config.toml)
    installCodexHooks(tmpDir);
    uninstallCodexHooks(tmpDir);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      // Neither the array-of-table form [[hooks.*]] nor plain [hooks] should remain
      assert.ok(
        !content.includes('[[hooks.') && !content.includes('[hooks]'),
        'hooks entries must be absent after uninstall when all hooks were SDD',
      );
    }
    // If file does not exist after removal, that is also acceptable (fully cleaned up)
  });

  test('uninstallHooks(.codex) facade routes to uninstallCodexHooks', () => {
    installHooks('.codex', tmpDir);
    const result = uninstallHooks('.codex', tmpDir);
    assert.equal(result, true, 'uninstallHooks(.codex) must return true when hooks were removed');
  });

  test('uninstallHooks(.codex) returns false when nothing to remove', () => {
    const result = uninstallHooks('.codex', tmpDir);
    assert.equal(result, false, 'uninstallHooks(.codex) must return false when nothing to remove');
  });
});
