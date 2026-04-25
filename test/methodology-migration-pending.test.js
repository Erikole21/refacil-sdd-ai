'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const { methodologyMigrationPending } = require('../lib/methodology-migration-pending');

const cliJs = path.join(__dirname, '..', 'bin', 'cli.js');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-mig-'));
}

test('repo vacío: sin migraciones pendientes', () => {
  const root = tmpRoot();
  const r = methodologyMigrationPending(root);
  assert.equal(r.pending, false);
  assert.deepEqual(r.reasons, []);
});

test('AGENTS.md sin .agents/: pendiente', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# x\n', 'utf8');
  const r = methodologyMigrationPending(root);
  assert.equal(r.pending, true);
  assert.ok(r.reasons.some((x) => x.includes('.agents')));
});

test('CLAUDE.md extenso: pendiente', () => {
  const root = tmpRoot();
  const many = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), many, 'utf8');
  const r = methodologyMigrationPending(root);
  assert.equal(r.pending, true);
  assert.ok(r.reasons.some((x) => x.includes('CLAUDE')));
});

test('skill openspec sobrante: ya no se detecta como pendiente (T-03)', () => {
  // collectExtraOpenspecSkills fue eliminado en T-03 — skills openspec-* sobrantes
  // ya no se reportan como migracion pendiente.
  const root = tmpRoot();
  const skillDir = path.join(root, '.claude', 'skills', 'openspec-legacy');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: x\n---\n', 'utf8');
  const r = methodologyMigrationPending(root);
  assert.equal(r.pending, false);
});

test('índice mínimo refacil + sin AGENTS: sin pendiente por AGENTS', () => {
  const root = tmpRoot();
  const minimal =
    '# CLAUDE.md\n\nContexto completo del proyecto: ver `AGENTS.md`.\nSi no existe, ejecuta `/refacil:setup`.\n';
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), minimal, 'utf8');
  const r = methodologyMigrationPending(root);
  assert.equal(r.pending, false);
});

test('CLI migration-pending: exit 0 y --json en repo limpio', () => {
  const root = tmpRoot();
  const r = spawnSync(process.execPath, [cliJs, 'migration-pending'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = spawnSync(process.execPath, [cliJs, 'migration-pending', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const parsed = JSON.parse(j.stdout.trim());
  assert.equal(parsed.pending, false);
  assert.ok(Array.isArray(parsed.reasons));
});

test('CLI migration-pending: exit 1 con AGENTS sin .agents/', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# p\n', 'utf8');
  const r = spawnSync(process.execPath, [cliJs, 'migration-pending'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /[Mm]igration/);
});

test('CLI migration-pending exit 0 borra .refacil-pending-update obsoleto', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, '.refacil-pending-update'), '{"from":"4.0.10","to":"4.0.11"}', 'utf8');
  const r = spawnSync(process.execPath, [cliJs, 'migration-pending'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(fs.existsSync(path.join(root, '.refacil-pending-update')), false);
});
