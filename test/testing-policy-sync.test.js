'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');
const {
  syncTestingPolicyBlock,
  removeTestingPolicyBlock,
  MARKER_START,
  MARKER_END,
} = require('../lib/testing-policy-sync');

describe('testing-policy-sync', () => {
  let tmp;
  const pkgRoot = path.join(__dirname, '..');

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sync-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('skipped when .agents missing', () => {
    const r = syncTestingPolicyBlock(tmp, pkgRoot);
    assert.equal(r.status, 'skipped-no-agents-dir');
  });

  test('creates testing.md with markers and repo-specific tail', () => {
    fs.mkdirSync(path.join(tmp, '.agents'));
    const r = syncTestingPolicyBlock(tmp, pkgRoot);
    assert.equal(r.status, 'created-file');
    const c = fs.readFileSync(path.join(tmp, '.agents', 'testing.md'), 'utf8');
    assert.ok(c.includes(MARKER_START));
    assert.ok(c.includes(MARKER_END));
    assert.ok(c.includes('Repo-specific commands'));
    assert.ok(c.includes('scoped runs'));
  });

  test('second sync with same template is unchanged', () => {
    fs.mkdirSync(path.join(tmp, '.agents'));
    syncTestingPolicyBlock(tmp, pkgRoot);
    const r2 = syncTestingPolicyBlock(tmp, pkgRoot);
    assert.equal(r2.status, 'unchanged');
  });

  test('appends block when file exists without markers', () => {
    fs.mkdirSync(path.join(tmp, '.agents'));
    fs.writeFileSync(path.join(tmp, '.agents', 'testing.md'), '# My tests\n\nHello\n', 'utf8');
    const r = syncTestingPolicyBlock(tmp, pkgRoot);
    assert.equal(r.status, 'appended');
    const c = fs.readFileSync(path.join(tmp, '.agents', 'testing.md'), 'utf8');
    assert.ok(c.includes('# My tests'));
    assert.ok(c.includes('Hello'));
    assert.ok(c.includes(MARKER_START));
  });

  test('removeTestingPolicyBlock strips marked region only', () => {
    fs.mkdirSync(path.join(tmp, '.agents'));
    syncTestingPolicyBlock(tmp, pkgRoot);
    const rm = removeTestingPolicyBlock(tmp);
    assert.equal(rm.status, 'removed');
    const c = fs.readFileSync(path.join(tmp, '.agents', 'testing.md'), 'utf8');
    assert.ok(!c.includes(MARKER_START));
    assert.ok(!c.includes('scoped runs'));
    assert.ok(c.includes('Repo-specific commands'));
  });
});
