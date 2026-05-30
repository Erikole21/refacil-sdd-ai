'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const test = require('node:test');

const { resolveSelectedIDEsForRepo, syncRepoIdeFiles } = require('../lib/repo-ide-sync');
const { writeSelectedIDEs } = require('../lib/global-paths');

const packageRoot = path.resolve(__dirname, '..');

test('resolveSelectedIDEsForRepo: uses ~/.refacil-sdd-ai/selected-ides.json when present', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-home-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-proj-'));
  writeSelectedIDEs(['.claude', '.cursor'], tmpHome);
  const ids = resolveSelectedIDEsForRepo(proj, tmpHome);
  assert.deepStrictEqual(ids, ['.claude', '.cursor']);
});

test('syncRepoIdeFiles: writes CLAUDE.md and .cursorrules for selection (no session markers)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-home-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-proj-'));
  writeSelectedIDEs(['.claude', '.cursor'], tmpHome);
  syncRepoIdeFiles(packageRoot, proj, tmpHome, { sessionMarkers: false });
  assert.ok(fs.existsSync(path.join(proj, 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(proj, '.cursorrules')));
  assert.ok(fs.existsSync(path.join(proj, '.claudeignore')));
  assert.ok(fs.existsSync(path.join(proj, '.cursorignore')));
});

test('syncRepoIdeFiles: OpenCode and Codex selection syncs opencodeignore', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-oc-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-oc-proj-'));
  writeSelectedIDEs(['.opencode', '.codex'], tmpHome);
  const out = syncRepoIdeFiles(packageRoot, proj, tmpHome, { sessionMarkers: false });
  assert.deepStrictEqual(out.selectedIDEs, ['.opencode', '.codex']);
  assert.ok(fs.existsSync(path.join(proj, '.opencodeignore')));
  assert.ok(!fs.existsSync(path.join(proj, 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(proj, '.cursorrules')));
});

test('resolveSelectedIDEsForRepo: persists inferred OpenCode and Codex from global skills', () => {
  const { installSkills } = require('../lib/installer');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-inf-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-ide-inf-proj-'));
  installSkills(packageRoot, tmpHome, ['opencode', 'codex']);
  const ids = resolveSelectedIDEsForRepo(proj, tmpHome);
  assert.ok(ids.includes('.opencode'));
  assert.ok(ids.includes('.codex'));
});
