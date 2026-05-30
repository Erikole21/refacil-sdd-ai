'use strict';

/**
 * Tests for lib/codegraph-telemetry.js
 *
 * Isolation strategy: LOG_PATH is hardcoded to os.homedir()/.refacil-sdd-ai/codegraph.log.
 * We backup/restore the real log file around each test, and clear after each test,
 * following the same rename-based pattern as config.test.js.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const telemetry = require('../lib/codegraph-telemetry');

const LOG_PATH = telemetry.LOG_PATH;
const LOG_BAK = LOG_PATH + '.bak-test';

// Helper: ensure the log dir exists
function ensureLogDir() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

// Backup the existing real log (if any) and start with a clean state
function backupLog() {
  if (fs.existsSync(LOG_PATH)) {
    fs.renameSync(LOG_PATH, LOG_BAK);
  }
}

// Restore the original log
function restoreLog() {
  // Remove any test-written log
  if (fs.existsSync(LOG_PATH)) {
    try { fs.unlinkSync(LOG_PATH); } catch (_) {}
  }
  // Restore backup
  if (fs.existsSync(LOG_BAK)) {
    fs.renameSync(LOG_BAK, LOG_PATH);
  }
}

// ── CA-01-tel: logEvent writes a valid JSONL entry ───────────────────────────

describe('logEvent — writes a valid JSONL event (CA-01-tel)', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('writes one line to codegraph.log', () => {
    ensureLogDir();
    telemetry.logEvent('investigator', true, 5, 1500);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'Expected exactly one log line');
  });

  test('written line is valid JSON', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 3, 1000);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    assert.doesNotThrow(() => JSON.parse(lines[0]), 'Log line must be valid JSON');
  });

  test('event contains required fields: ts, skillId, hasGraph, toolCallsCount, estimatedTokensSaved', () => {
    ensureLogDir();
    telemetry.logEvent('debugger', true, 7, 2000);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const event = JSON.parse(lines[0]);
    assert.ok(typeof event.ts === 'string', 'ts must be a string');
    assert.ok(event.ts.length > 0, 'ts must not be empty');
    assert.equal(event.skillId, 'debugger');
    assert.equal(event.hasGraph, true);
    assert.equal(event.toolCallsCount, 7);
    assert.equal(event.estimatedTokensSaved, 2000);
  });

  test('ts is a valid ISO date string', () => {
    ensureLogDir();
    telemetry.logEvent('tester', true, 2, 500);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const event = JSON.parse(lines[0]);
    const d = new Date(event.ts);
    assert.ok(!isNaN(d.getTime()), `ts "${event.ts}" must parse as a valid date`);
  });

  test('appends multiple events without overwriting', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 1, 100);
    telemetry.logEvent('proposer', true, 2, 200);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2, 'Expected two log lines');
  });
});

// ── CA-02-tel: event with hasGraph:false ─────────────────────────────────────

describe('logEvent — event with hasGraph:false (CA-02-tel)', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('writes event with hasGraph:false correctly', () => {
    ensureLogDir();
    telemetry.logEvent('implementer', false, 0, 0);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const event = JSON.parse(lines[0]);
    assert.equal(event.hasGraph, false);
    assert.equal(event.skillId, 'implementer');
    assert.equal(event.toolCallsCount, 0);
    assert.equal(event.estimatedTokensSaved, 0);
  });

  test('hasGraph field is boolean false, not falsy string', () => {
    ensureLogDir();
    telemetry.logEvent('validator', false, 0, 0);
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const event = JSON.parse(lines[0]);
    assert.strictEqual(event.hasGraph, false);
  });
});

// ── readLog ───────────────────────────────────────────────────────────────────

describe('readLog — reads and parses JSONL entries', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('returns empty array when log file does not exist', () => {
    // backupLog removed it; log does not exist
    const result = telemetry.readLog();
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  test('returns parsed entries after logEvent calls', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 4, 800);
    telemetry.logEvent('proposer', false, 0, 0);
    const entries = telemetry.readLog();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].skillId, 'proposer');
    assert.equal(entries[0].hasGraph, true);
    assert.equal(entries[1].hasGraph, false);
  });

  test('CR-02-tel: skips malformed JSON lines, returns valid ones', () => {
    ensureLogDir();
    // Write a mix of valid and invalid lines
    const validLine = JSON.stringify({ ts: new Date().toISOString(), skillId: 'investigator', hasGraph: true, toolCallsCount: 2, estimatedTokensSaved: 400 });
    const badLine = 'NOT_JSON{{{';
    const anotherValid = JSON.stringify({ ts: new Date().toISOString(), skillId: 'debugger', hasGraph: false, toolCallsCount: 0, estimatedTokensSaved: 0 });
    fs.writeFileSync(LOG_PATH, [validLine, badLine, anotherValid, ''].join('\n'));
    const entries = telemetry.readLog();
    assert.equal(entries.length, 2, 'Only valid JSON lines must be returned');
    assert.equal(entries[0].skillId, 'investigator');
    assert.equal(entries[1].skillId, 'debugger');
  });

  test('CR-02-tel: does not throw when log has all malformed lines', () => {
    ensureLogDir();
    fs.writeFileSync(LOG_PATH, 'GARBAGE\nNOT_JSON\n{{{}}}}\n');
    assert.doesNotThrow(() => telemetry.readLog());
    const entries = telemetry.readLog();
    assert.equal(entries.length, 0);
  });
});

// ── CA-03-tel / CA-04-tel: stats ─────────────────────────────────────────────

describe('stats — groups by skillId, handles empty log (CA-03-tel, CA-04-tel)', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('CA-04-tel: stats returns zero totals when log is empty or absent', () => {
    const s = telemetry.stats();
    assert.equal(s.totalEvents, 0);
    assert.equal(s.totalTokensSaved, 0);
    assert.equal(s.totalToolCalls, 0);
    assert.deepEqual(s.bySkill, {});
  });

  test('CA-03-tel: stats groups events by skillId correctly', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 3, 600);
    telemetry.logEvent('proposer', true, 2, 400);
    telemetry.logEvent('proposer', false, 0, 0);
    telemetry.logEvent('investigator', true, 5, 1000);
    const s = telemetry.stats();
    assert.equal(s.totalEvents, 4);
    assert.ok(s.bySkill.proposer, 'proposer must appear in bySkill');
    assert.ok(s.bySkill.investigator, 'investigator must appear in bySkill');
  });

  test('CA-05-tel: withGraph and withoutGraph counts are correct per skillId', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 3, 600);
    telemetry.logEvent('proposer', true, 2, 400);
    telemetry.logEvent('proposer', false, 0, 0);
    const s = telemetry.stats();
    assert.equal(s.bySkill.proposer.withGraph.events, 2);
    assert.equal(s.bySkill.proposer.withoutGraph.events, 1);
    assert.equal(s.bySkill.proposer.withGraph.tokensSaved, 1000);
    assert.equal(s.bySkill.proposer.withGraph.toolCalls, 5);
  });

  test('CA-05-tel: totals aggregate across all skillIds', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 3, 600);
    telemetry.logEvent('investigator', true, 5, 1000);
    const s = telemetry.stats();
    assert.equal(s.totalEvents, 2);
    assert.equal(s.totalTokensSaved, 1600);
    assert.equal(s.totalToolCalls, 8);
  });

  test('unknown skillId falls back to "unknown" key', () => {
    ensureLogDir();
    // logEvent with null/undefined skillId stores 'unknown'
    telemetry.logEvent(null, true, 1, 100);
    const s = telemetry.stats();
    assert.ok(s.bySkill.unknown, '"unknown" key must exist in bySkill');
  });
});

// ── clearLog ──────────────────────────────────────────────────────────────────

describe('clearLog — deletes the log file', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('removes the log file when it exists', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 1, 100);
    assert.ok(fs.existsSync(LOG_PATH), 'Pre-condition: log must exist');
    telemetry.clearLog();
    assert.ok(!fs.existsSync(LOG_PATH), 'Log must be deleted after clearLog');
  });

  test('does not throw when log file does not exist', () => {
    assert.doesNotThrow(() => telemetry.clearLog());
  });

  test('readLog returns empty array after clearLog', () => {
    ensureLogDir();
    telemetry.logEvent('proposer', true, 1, 100);
    telemetry.clearLog();
    const entries = telemetry.readLog();
    assert.equal(entries.length, 0);
  });
});

// ── CR-01-tel: write error is silent ─────────────────────────────────────────

describe('logEvent — write error is silent (CR-01-tel)', () => {
  beforeEach(backupLog);
  afterEach(restoreLog);

  test('does not throw when log directory cannot be created (root path)', () => {
    // Cannot easily simulate a write error on all platforms, but we verify that
    // logEvent never throws regardless of outcome
    assert.doesNotThrow(() => telemetry.logEvent('test', true, 1, 100));
  });

  test('caller flow continues even if log write fails silently', () => {
    // Put a directory at the log path to force a write error
    ensureLogDir();
    if (fs.existsSync(LOG_PATH)) { try { fs.unlinkSync(LOG_PATH); } catch (_) {} }
    fs.mkdirSync(LOG_PATH, { recursive: true }); // LOG_PATH is now a dir, not a file
    try {
      assert.doesNotThrow(() => telemetry.logEvent('proposer', true, 1, 100));
    } finally {
      // Cleanup: remove the directory we placed at LOG_PATH
      try { fs.rmdirSync(LOG_PATH); } catch (_) {}
    }
  });
});

// ── LOG_PATH export ───────────────────────────────────────────────────────────

describe('LOG_PATH — exported constant', () => {
  test('LOG_PATH is a string', () => {
    assert.equal(typeof telemetry.LOG_PATH, 'string');
  });

  test('LOG_PATH points to ~/.refacil-sdd-ai/codegraph.log', () => {
    const expected = path.join(os.homedir(), '.refacil-sdd-ai', 'codegraph.log');
    assert.equal(telemetry.LOG_PATH, expected);
  });
});
