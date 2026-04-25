'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { installHooks, uninstallHooks } = require('../lib/hooks');

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
