'use strict';

const { test, describe } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert');
const { findRefacilPackageRoot, syncRepoSessionMarkers } = require('../lib/session-repo-sync');

describe('session-repo-sync', () => {
  test('findRefacilPackageRoot resolves this package when run from repo', () => {
    const pkg = findRefacilPackageRoot(path.join(__dirname, '..'));
    assert.ok(pkg);
    assert.ok(fs.existsSync(path.join(pkg, 'templates', 'testing-policy.md')));
  });

  test('syncRepoSessionMarkers with explicit packageRoot runs without throw', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-'));
    const pkg = path.join(__dirname, '..');
    try {
      const out = syncRepoSessionMarkers(tmp, pkg);
      assert.equal(out.ok, true);
      assert.ok(out.compact && typeof out.compact.status === 'string');
      assert.ok(out.testing && typeof out.testing.status === 'string');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
