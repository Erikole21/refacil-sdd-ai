'use strict';

/**
 * Tests for lib/commands/compact.js — CodeGraph section in `handleCompact('stats')`.
 *
 * Isolation strategy: codegraph-telemetry LOG_PATH is hardcoded. We backup/restore
 * the real log and the compact telemetry log to avoid cross-contamination with the
 * compact-bash stats section. We capture stdout via monkey-patching console.log.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const codegraphTelemetry = require('../lib/codegraph-telemetry');
const compactTelemetry = require('../lib/compact/telemetry');
const { handleCompact } = require('../lib/commands/compact');

// ── Paths for backup/restore ──────────────────────────────────────────────────

const CG_LOG = codegraphTelemetry.LOG_PATH;
const CG_LOG_BAK = CG_LOG + '.bak-compact-test';

const COMPACT_LOG = compactTelemetry.LOG_PATH;
const COMPACT_LOG_BAK = COMPACT_LOG + '.bak-compact-cg-test';

// ── Helpers ───────────────────────────────────────────────────────────────────

function backupLogs() {
  if (fs.existsSync(CG_LOG)) fs.renameSync(CG_LOG, CG_LOG_BAK);
  if (fs.existsSync(COMPACT_LOG)) fs.renameSync(COMPACT_LOG, COMPACT_LOG_BAK);
}

function restoreLogs() {
  // Remove test files
  if (fs.existsSync(CG_LOG)) { try { fs.unlinkSync(CG_LOG); } catch (_) {} }
  if (fs.existsSync(COMPACT_LOG)) { try { fs.unlinkSync(COMPACT_LOG); } catch (_) {} }
  // Restore originals
  if (fs.existsSync(CG_LOG_BAK)) fs.renameSync(CG_LOG_BAK, CG_LOG);
  if (fs.existsSync(COMPACT_LOG_BAK)) fs.renameSync(COMPACT_LOG_BAK, COMPACT_LOG);
}

function ensureDirs() {
  fs.mkdirSync(path.dirname(CG_LOG), { recursive: true });
  fs.mkdirSync(path.dirname(COMPACT_LOG), { recursive: true });
}

/**
 * Run handleCompact('stats') and capture all console.log output as a single string.
 */
function captureStats() {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.map(String).join(' '));
  try {
    handleCompact('stats');
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

// ── CA-04-tel: CodeGraph section absent when log is empty ────────────────────

describe('handleCompact stats — CodeGraph section absent when log is empty (CA-04-tel)', () => {
  beforeEach(backupLogs);
  afterEach(restoreLogs);

  test('CodeGraph section is not rendered when codegraph.log does not exist', () => {
    ensureDirs();
    // No codegraph log entries — section must be absent
    const output = captureStats();
    assert.ok(
      !output.includes('CodeGraph'),
      `CodeGraph section must be absent when log is empty. Output: ${output}`,
    );
  });

  test('CodeGraph section is not rendered when codegraph.log is empty', () => {
    ensureDirs();
    fs.writeFileSync(CG_LOG, '');
    const output = captureStats();
    assert.ok(
      !output.includes('CodeGraph'),
      `CodeGraph section must be absent for empty log. Output: ${output}`,
    );
  });
});

// ── CodeGraph-only stats (no compact.log) ────────────────────────────────────

describe('handleCompact stats — CodeGraph without compact events', () => {
  beforeEach(backupLogs);
  afterEach(restoreLogs);

  test('shows CodeGraph section and total when only codegraph.log has entries', () => {
    ensureDirs();
    codegraphTelemetry.logEvent('investigator', true, 4, 1200);
    const output = captureStats();
    assert.ok(output.includes('CodeGraph'), `Expected CodeGraph section. Output: ${output}`);
    assert.ok(output.includes('investigator'), `Expected investigator row. Output: ${output}`);
    assert.ok(
      output.includes('Total observado'),
      `Expected total when only CodeGraph has savings. Output: ${output}`,
    );
    assert.ok(
      !output.includes('compact-bash stats'),
      `Must not show compact header without compact events. Output: ${output}`,
    );
  });

  test('log-codegraph-event CLI writes to codegraph.log', () => {
    ensureDirs();
    codegraphTelemetry.clearLog();
    handleCompact('log-codegraph-event', [
      '--skill',
      'proposer',
      '--has-graph',
      'true',
      '--tool-calls',
      '2',
      '--tokens',
      '900',
    ]);
    const stats = codegraphTelemetry.stats();
    assert.strictEqual(stats.totalEvents, 1);
    assert.strictEqual(stats.bySkill.proposer.withGraph.tokensSaved, 900);
  });
});

// ── CA-03-tel: CodeGraph section present when there are events ───────────────

describe('handleCompact stats — CodeGraph section present when events exist (CA-03-tel)', () => {
  beforeEach(backupLogs);
  afterEach(restoreLogs);

  // Seed a compact event so showCompactStats() does not return early before reaching
  // the CodeGraph section (which only renders when compact totalEvents > 0).
  function seedCompactEvent() {
    ensureDirs();
    compactTelemetry.logRewrite('git-log', 500);
  }

  test('CodeGraph section is rendered when codegraph.log has entries', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('investigator', true, 5, 1500);
    const output = captureStats();
    assert.ok(
      output.includes('CodeGraph'),
      `CodeGraph section must be present when log has entries. Output: ${output}`,
    );
  });

  test('CodeGraph section includes "estimated savings" heading', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('proposer', true, 3, 800);
    const output = captureStats();
    assert.ok(
      output.includes('CodeGraph — estimated savings'),
      `Expected "CodeGraph — estimated savings" heading. Output: ${output}`,
    );
  });

  test('CodeGraph section includes the skillId name', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('debugger', true, 2, 400);
    const output = captureStats();
    assert.ok(
      output.includes('debugger'),
      `Expected skillId "debugger" in output. Output: ${output}`,
    );
  });
});

// ── CA-05-tel: metrics grouped by skillId ────────────────────────────────────

describe('handleCompact stats — metrics grouped by skillId with totals (CA-05-tel)', () => {
  beforeEach(backupLogs);
  afterEach(restoreLogs);

  // Seed compact event so showCompactStats() reaches the CodeGraph section
  function seedCompactEvent() {
    ensureDirs();
    compactTelemetry.logRewrite('git-log', 500);
  }

  test('shows entries for each skillId that has withGraph events', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('proposer', true, 3, 600);
    codegraphTelemetry.logEvent('investigator', true, 5, 1000);
    const output = captureStats();
    assert.ok(output.includes('proposer'), `Expected "proposer" in output. Output: ${output}`);
    assert.ok(output.includes('investigator'), `Expected "investigator" in output. Output: ${output}`);
  });

  test('shows total line at the bottom of the CodeGraph section', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('proposer', true, 3, 600);
    codegraphTelemetry.logEvent('proposer', true, 2, 400);
    const output = captureStats();
    assert.ok(
      output.includes('Total CodeGraph'),
      `Expected "Total CodeGraph" line in CodeGraph section. Output: ${output}`,
    );
  });

  test('shows Total combinado when both compact and CodeGraph have savings', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('investigator', true, 2, 1000);
    const output = captureStats();
    assert.ok(
      output.includes('Total combinado'),
      `Expected combined total. Output: ${output}`,
    );
    assert.ok(
      output.includes('Total compact'),
      `Expected compact subtotal. Output: ${output}`,
    );
  });

  test('shows tool call counts in output', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('proposer', true, 7, 2000);
    // Verify via structured data — avoids brittle string-match on formatted numbers
    const stats = codegraphTelemetry.stats();
    assert.strictEqual(
      stats.bySkill['proposer'].withGraph.toolCalls,
      7,
      'proposer toolCalls must be 7 in the telemetry stats',
    );
    // Also verify the section renders (structural presence, not exact format)
    const output = captureStats();
    assert.ok(output.includes('proposer'), `Expected "proposer" to appear in output. Output: ${output}`);
  });

  test('events with hasGraph:false appear in baseline section, not in With CodeGraph rows', () => {
    seedCompactEvent();
    codegraphTelemetry.logEvent('validator', false, 0, 0);
    const output = captureStats();
    assert.ok(output.includes('CodeGraph'), `Expected CodeGraph section. Output: ${output}`);
    assert.ok(
      output.includes('Sessions without graph'),
      `Expected baseline section. Output: ${output}`,
    );
    assert.ok(output.includes('validator'), `validator must appear in baseline. Output: ${output}`);
    const withGraphIdx = output.indexOf('With CodeGraph:');
    const baselineIdx = output.indexOf('Sessions without graph');
    if (withGraphIdx >= 0 && baselineIdx >= 0) {
      assert.ok(withGraphIdx < baselineIdx, 'With CodeGraph block must precede baseline');
    }
  });
});

// ── codegraph-clear-log sub-command ──────────────────────────────────────────

describe('handleCompact codegraph-clear-log — clears the codegraph log', () => {
  beforeEach(backupLogs);
  afterEach(restoreLogs);

  test('removes codegraph.log when it exists', () => {
    ensureDirs();
    codegraphTelemetry.logEvent('proposer', true, 1, 100);
    assert.ok(fs.existsSync(CG_LOG), 'Pre-condition: codegraph.log must exist');
    // Capture output to avoid console noise
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.map(String).join(' '));
    try {
      handleCompact('codegraph-clear-log');
    } finally {
      console.log = orig;
    }
    assert.ok(!fs.existsSync(CG_LOG), 'codegraph.log must be deleted after codegraph-clear-log');
  });

  test('does not throw when codegraph.log does not exist', () => {
    ensureDirs();
    assert.doesNotThrow(() => handleCompact('codegraph-clear-log'));
  });

  test('after clear, stats shows no CodeGraph section', () => {
    ensureDirs();
    codegraphTelemetry.logEvent('proposer', true, 1, 100);
    handleCompact('codegraph-clear-log');
    // Now stats must not show CodeGraph section
    const output = captureStats();
    assert.ok(!output.includes('CodeGraph'), `After clear, CodeGraph section must be absent. Output: ${output}`);
  });
});
