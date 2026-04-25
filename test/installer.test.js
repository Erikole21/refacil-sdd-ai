'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  transformFrontmatterForCursor,
  readRepoVersion,
  writeRepoVersion,
  getPackageVersion,
  installSkills,
  installAgents,
  removeSkills,
  AGENTS,
} = require('../lib/installer');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── transformFrontmatterForCursor ────────────────────────────────────────────

describe('transformFrontmatterForCursor', () => {
  test('tools con Edit → readonly: false', () => {
    const input = '---\nname: test\ntools: Bash, Edit, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
  });

  test('tools con Write → readonly: false', () => {
    const input = '---\nname: test\ntools: Bash, Write, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
  });

  test('tools sin Edit ni Write → readonly: true', () => {
    const input = '---\nname: test\ntools: Bash, Read, Grep, Glob\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: true/);
  });

  test('model: sonnet → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /model: sonnet/);
  });

  test('model: opus → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: opus\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
  });

  test('model: haiku → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: haiku\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
  });

  test('model: opusplan (alias Claude Code) → model: inherit', () => {
    const input = '---\nname: test\ntools: Read, Edit\nmodel: opusplan\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /model: opusplan/);
  });

  test('model: claude-sonnet-4-6 (id explícito) se preserva', () => {
    const input = '---\nname: test\ntools: Read\nmodel: claude-sonnet-4-6\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: claude-sonnet-4-6/);
  });

  test('sin frontmatter reconocible → devuelve contenido sin cambios', () => {
    const input = 'sin frontmatter aqui';
    const out = transformFrontmatterForCursor(input);
    assert.equal(out, input);
  });

  test('body se preserva verbatim', () => {
    const input = '---\nname: test\ntools: Read\nmodel: sonnet\n---\n# Titulo\n\nContenido del agente.';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /# Titulo\n\nContenido del agente\./);
  });

  test('tools: omitido en el frontmatter de salida (Cursor no lo entiende)', () => {
    const input = '---\nname: test\ntools: Read, Grep\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.doesNotMatch(out, /^tools:/m);
  });

  test('readonly ya presente en frontmatter → no se agrega duplicado', () => {
    const input = '---\nname: test\ntools: Read\nreadonly: false\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    const count = (out.match(/readonly:/g) || []).length;
    assert.equal(count, 1);
  });

  test('input con CRLF (\\r\\n) → frontmatter parseado correctamente', () => {
    const input = '---\r\nname: test\r\ntools: Read, Edit\r\nmodel: sonnet\r\n---\r\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /^tools:/m);
  });
});

// ── readRepoVersion / writeRepoVersion ───────────────────────────────────────

describe('readRepoVersion / writeRepoVersion', () => {
  test('readRepoVersion retorna null si ningún archivo existe', () => {
    const v = readRepoVersion(tmpDir);
    assert.equal(v, null);
  });

  test('writeRepoVersion + readRepoVersion ida y vuelta', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    writeRepoVersion(tmpDir, '3.0.3');
    const v = readRepoVersion(tmpDir);
    assert.equal(v, '3.0.3');
  });

  test('writeRepoVersion es tolerante si el directorio no existe', () => {
    assert.doesNotThrow(() => writeRepoVersion(tmpDir, '1.0.0'));
  });

  test('readRepoVersion lee .claude antes que .cursor', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.writeFileSync(path.join(tmpDir, '.claude', '.sdd-version'), '1.0.0\n');
    fs.writeFileSync(path.join(tmpDir, '.cursor', '.sdd-version'), '2.0.0\n');
    const v = readRepoVersion(tmpDir);
    assert.equal(v, '1.0.0');
  });
});

// ── getPackageVersion ────────────────────────────────────────────────────────

describe('getPackageVersion', () => {
  test('lee la version del package.json del paquete real', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const v = getPackageVersion(packageRoot);
    assert.ok(typeof v === 'string' && v.length > 0, 'debe retornar una version');
    assert.match(v, /^\d+\.\d+\.\d+/);
  });

  test('retorna null si package.json no existe', () => {
    const v = getPackageVersion(tmpDir);
    assert.equal(v, null);
  });
});

// ── CA-1: installSkills / removeSkills ───────────────────────────────────────

describe('installSkills / removeSkills', () => {
  test('installSkills copia skills a .claude/skills/ y .cursor/skills/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));

    const count = installSkills(packageRoot, tmpDir);
    assert.ok(count > 0, 'debe instalar al menos una skill');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'skills')));
  });

  test('removeSkills elimina las carpetas de skills instaladas', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installSkills(packageRoot, tmpDir);

    const removed = removeSkills(tmpDir);
    assert.ok(removed > 0);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'refacil-setup')));
  });

  test('removeSkills retorna 0 si no hay skills instaladas', () => {
    const removed = removeSkills(tmpDir);
    assert.equal(removed, 0);
  });
});

// ── installAgents ────────────────────────────────────────────────────────────

describe('installAgents', () => {
  test('los 7 archivos de agente existen en agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const expected = ['auditor', 'investigator', 'validator', 'tester', 'implementer', 'debugger', 'proposer'];
    for (const name of expected) {
      const p = path.join(packageRoot, 'agents', `${name}.md`);
      assert.ok(fs.existsSync(p), `agents/${name}.md debe existir`);
    }
  });

  test('AGENTS contiene los 4 nuevos agentes', () => {
    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      assert.ok(AGENTS.includes(name), `AGENTS debe incluir '${name}'`);
    }
  });

  test('installAgents copia agentes a .claude/agents/ y .cursor/agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));

    const count = installAgents(packageRoot, tmpDir);
    assert.ok(count >= 7, `debe instalar 7 agentes, instalo ${count}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'agents')));
  });

  test('nuevos agentes se instalan en .claude/agents/ con nombre refacil-*', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      const p = path.join(tmpDir, '.claude', 'agents', `refacil-${name}.md`);
      assert.ok(fs.existsSync(p), `refacil-${name}.md debe existir en .claude/agents/`);
    }
  });

  test('nuevos agentes en .cursor/agents/ tienen readonly: false (tienen Edit/Write)', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      const p = path.join(tmpDir, '.cursor', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(p, 'utf8');
      assert.match(content, /readonly: false/, `refacil-${name}.md en Cursor debe tener readonly: false`);
      assert.match(content, /model: inherit/, `refacil-${name}.md en Cursor debe tener model: inherit`);
      assert.doesNotMatch(content, /^tools:/m, `refacil-${name}.md en Cursor no debe tener tools:`);
    }
  });

  test('agentes readonly existentes (auditor/investigator/validator) mantienen readonly: true en Cursor', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['auditor', 'investigator', 'validator']) {
      const p = path.join(tmpDir, '.cursor', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(p, 'utf8');
      assert.match(content, /readonly: true/, `refacil-${name}.md en Cursor debe mantener readonly: true`);
    }
  });
});

// ── CR-4: exports existentes no rotos ────────────────────────────────────────

describe('CR-4: módulos existentes no modificados', () => {
  test('lib/compact-guidance exporta syncCompactGuidance y removeCompactGuidance', () => {
    const m = require('../lib/compact-guidance');
    assert.equal(typeof m.syncCompactGuidance, 'function');
    assert.equal(typeof m.removeCompactGuidance, 'function');
  });

  test('lib/compact/bash exporta run', () => {
    const m = require('../lib/compact/bash');
    assert.equal(typeof m.run, 'function');
  });

  test('lib/compact/telemetry exporta stats, disable, enable, clearLog, isDisabled', () => {
    const m = require('../lib/compact/telemetry');
    assert.equal(typeof m.stats, 'function');
    assert.equal(typeof m.disable, 'function');
    assert.equal(typeof m.enable, 'function');
    assert.equal(typeof m.clearLog, 'function');
    assert.equal(typeof m.isDisabled, 'function');
  });

  test('lib/methodology-migration-pending exporta methodologyMigrationPending', () => {
    const m = require('../lib/methodology-migration-pending');
    assert.equal(typeof m.methodologyMigrationPending, 'function');
  });
});
