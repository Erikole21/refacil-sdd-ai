'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  resolveChangesDir,
  changeNeedsReview,
  listActiveChangesMissingReview,
  evaluateGitPushReview,
} = require('../lib/check-review');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-review-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('lib/check-review', () => {
  test('resolveChangesDir prefiere refacil-sdd sobre openspec', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'openspec', 'changes'), { recursive: true });
    assert.equal(resolveChangesDir(tmpDir), path.join(tmpDir, 'refacil-sdd', 'changes'));
  });

  test('changeNeedsReview requiere al menos una task [x]', () => {
    const changesDir = path.join(tmpDir, 'refacil-sdd', 'changes');
    const pendingOnly = path.join(changesDir, 'proposal-only');
    const started = path.join(changesDir, 'started');

    fs.mkdirSync(pendingOnly, { recursive: true });
    fs.writeFileSync(path.join(pendingOnly, 'tasks.md'), '- [ ] Pendiente\n');

    fs.mkdirSync(started, { recursive: true });
    fs.writeFileSync(path.join(started, 'tasks.md'), '- [x] Hecho\n');

    assert.equal(changeNeedsReview(changesDir, 'proposal-only'), false);
    assert.equal(changeNeedsReview(changesDir, 'started'), true);
  });

  test('evaluateGitPushReview ignora comandos que no son git push', () => {
    assert.equal(evaluateGitPushReview('git status', tmpDir), null);
  });

  test('listActiveChangesMissingReview lista solo cambios con implementación iniciada', () => {
    const changesDir = path.join(tmpDir, 'refacil-sdd', 'changes');
    fs.mkdirSync(path.join(changesDir, 'feat-a'), { recursive: true });
    fs.writeFileSync(path.join(changesDir, 'feat-a', 'tasks.md'), '- [x] A\n');

    fs.mkdirSync(path.join(changesDir, 'feat-b'), { recursive: true });
    fs.writeFileSync(path.join(changesDir, 'feat-b', 'tasks.md'), '- [ ] B\n');

    assert.deepEqual(listActiveChangesMissingReview(tmpDir), ['feat-a']);
  });
});
