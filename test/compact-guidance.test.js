'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  syncCompactGuidance,
  stripLegacyCompactGuidanceMarkers,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
} = require('../lib/compact-guidance');

const packageRoot = path.resolve(__dirname, '..');

describe('stripLegacyCompactGuidanceMarkers', () => {
  test('removes empty legacy marker pair', () => {
    const input = [
      '# Project',
      '',
      LEGACY_MARKER_START,
      LEGACY_MARKER_END,
      '',
      MARKER_START,
      'content',
      MARKER_END,
    ].join('\n');

    const out = stripLegacyCompactGuidanceMarkers(input);
    assert.ok(!out.includes(LEGACY_MARKER_START), 'legacy start must be removed');
    assert.ok(!out.includes(LEGACY_MARKER_END), 'legacy end must be removed');
    assert.ok(out.includes(MARKER_START), 'managed block must remain');
  });

  test('preserves legacy block when it has non-whitespace content', () => {
    const input = [
      LEGACY_MARKER_START,
      'manual notes',
      LEGACY_MARKER_END,
    ].join('\n');

    const out = stripLegacyCompactGuidanceMarkers(input);
    assert.equal(out, input);
  });
});

describe('syncCompactGuidance legacy cleanup', () => {
  /** @type {string} */
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-guidance-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('sync removes empty legacy markers from AGENTS.md', () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(
      agentsPath,
      [
        '# Repo',
        '',
        LEGACY_MARKER_START,
        LEGACY_MARKER_END,
        '',
        MARKER_START,
        '<!-- AUTO-GENERATED -->',
        '## Token efficiency',
        'stay concise',
        MARKER_END,
      ].join('\n'),
      'utf8',
    );

    const result = syncCompactGuidance(tmpDir, packageRoot);
    assert.ok(['replaced', 'unchanged', 'appended'].includes(result.status), result.status);

    const written = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(!written.includes(LEGACY_MARKER_START));
    assert.ok(!written.includes(LEGACY_MARKER_END));
    assert.ok(written.includes(MARKER_START));
    assert.ok(written.includes('## Token efficiency'));
  });

  test('unchanged when AGENTS.md uses CRLF line endings (Windows)', () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Repo\n\n', 'utf8');
    syncCompactGuidance(tmpDir, packageRoot);
    const lf = fs.readFileSync(agentsPath, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(agentsPath, lf.replace(/\n/g, '\r\n'), 'utf8');
    const mtimeBefore = fs.statSync(agentsPath).mtimeMs;
    const result = syncCompactGuidance(tmpDir, packageRoot);
    assert.equal(result.status, 'unchanged');
    assert.equal(fs.statSync(agentsPath).mtimeMs, mtimeBefore, 'must not rewrite CRLF file when content is identical');
  });
});
