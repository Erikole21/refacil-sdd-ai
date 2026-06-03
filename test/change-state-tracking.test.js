'use strict';

/**
 * Tests for feat-change-state-tracking.
 *
 * Coverage:
 *   CA-01: set-memory --state sets currentState in memory.yaml
 *   CA-02: set-memory --state appends to stateHistory (pipe-separated)
 *   CA-03: multiple set-memory calls accumulate stateHistory entries
 *   CA-04: sdd status --json includes currentState and stateInferred
 *   CA-06: inferCurrentState returns 'reviewed' when .review-passed exists
 *   CA-07: inferCurrentState returns state based on lastStep in memory
 *   CA-08: inferCurrentState returns 'proposed' when only proposal.md exists
 *   CA-12: set-memory --state with --actor writes correct actor in stateHistory
 *   CR-01: set-memory --state with invalid value exits 1 without touching file
 *   CR-02: set-memory --state with empty value exits 1 without touching file
 *   CR-04: set-memory with no flags exits 1
 *   CR-05: cmdStatus and inferCurrentState degrade gracefully with corrupt YAML
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { VALID_STATES, inferCurrentState } = require('../lib/commands/sdd');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

function runSdd(tmpDir, sub, args = []) {
  const result = spawnSync(node, [CLI, 'sdd', sub, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Creates a minimal change directory with the given artifacts.
 */
function createChange(tmpDir, name, options = {}) {
  const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
  fs.mkdirSync(changeDir, { recursive: true });

  if (options.proposal !== false) {
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `# proposal: ${name}\n`,
    );
  }
  if (options.specs) {
    fs.writeFileSync(
      path.join(changeDir, 'specs.md'),
      '## CA-01: test\n\n**Given** x\n**When** y\n**Then** z\n',
    );
  }
  if (options.design) {
    fs.writeFileSync(path.join(changeDir, 'design.md'), `# design: ${name}\n`);
  }
  if (options.tasks) {
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `# tasks: ${name}\n\n- [ ] T-01: first task [S]\n`,
    );
  }
  if (options.tasksWithDone) {
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `# tasks: ${name}\n\n- [x] T-01: first task [S]\n- [ ] T-02: second task [S]\n`,
    );
  }
  if (options.memory) {
    fs.writeFileSync(path.join(changeDir, 'memory.yaml'), options.memory);
  }
  if (options.reviewPassed) {
    fs.writeFileSync(
      path.join(changeDir, '.review-passed'),
      JSON.stringify({ verdict: 'APROBADO', date: new Date().toISOString() }),
    );
  }
  return changeDir;
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-tracking-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── VALID_STATES constant ────────────────────────────────────────────────────

describe('VALID_STATES constant', () => {
  test('contains all expected states in order', () => {
    const expected = [
      'proposed',
      'approved',
      'apply-in-progress',
      'applied',
      'tested',
      'verified',
      'reviewed',
      'archived',
    ];
    assert.deepEqual(VALID_STATES, expected);
  });
});

// ── CA-01: set-memory --state sets currentState ──────────────────────────────

describe('CA-01: set-memory --state sets currentState in memory.yaml', () => {
  test('CA-01: --state proposed writes currentState: proposed', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    assert.ok(fs.existsSync(memPath), 'memory.yaml must exist after set-memory --state');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('currentState: proposed'), `memory.yaml must contain currentState: proposed. Got:\n${content}`);
  });

  test('CA-01: --state applied writes currentState: applied', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('currentState: applied'), `memory.yaml must contain currentState: applied. Got:\n${content}`);
  });

  test('CA-01: --state overwrites previous currentState', () => {
    createChange(tmpDir, 'my-change', { memory: 'currentState: proposed\n' });

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('currentState: applied'), 'currentState must be updated to applied');
    assert.ok(!content.includes('currentState: proposed'), 'old currentState must be replaced');
  });
});

// ── CA-02: stateHistory append ───────────────────────────────────────────────

describe('CA-02: set-memory --state appends pipe-separated entry to stateHistory', () => {
  test('CA-02: first state call creates stateHistory array with one entry', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed', '--actor', 'proposer']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    // stateHistory must be a YAML array
    assert.ok(content.includes('stateHistory:'), 'memory.yaml must contain stateHistory key');
    assert.ok(content.includes('  - proposed|'), 'stateHistory must contain pipe-separated entry starting with proposed');
    assert.ok(content.includes('|proposer'), 'stateHistory entry must include actor "proposer"');
  });

  test('CA-02: entry format is <state>|<ISO>|<actor>', () => {
    createChange(tmpDir, 'my-change');

    const before = new Date();
    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);
    const after = new Date();
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    // Extract the stateHistory entry — anchored to the YAML list-item indent
    // ("^  - ") to avoid false-positive matches from other fields that might
    // coincidentally contain the text "applied|".
    const match = content.match(/^  - (applied\|[^\n]+)/m);
    assert.ok(match, `stateHistory must contain an entry for 'applied'. Content:\n${content}`);
    const entry = match[1];
    const parts = entry.split('|');
    assert.equal(parts.length, 3, `entry must have 3 pipe-separated parts: ${entry}`);
    assert.equal(parts[0], 'applied', 'first part must be the state');
    // Second part must be a valid ISO timestamp
    const ts = new Date(parts[1]);
    assert.ok(!isNaN(ts.getTime()), `second part must be a valid ISO timestamp: ${parts[1]}`);
    assert.ok(ts >= before && ts <= after, 'timestamp must be within test window');
    assert.equal(parts[2], 'apply-skill', 'third part must be the actor');
  });
});

// ── CA-03: stateHistory accumulation ─────────────────────────────────────────

describe('CA-03: multiple set-memory calls accumulate stateHistory entries', () => {
  test('CA-03: three state transitions produce three stateHistory entries', () => {
    createChange(tmpDir, 'my-change');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed', '--actor', 'proposer']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'approved', '--actor', 'propose-skill']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    // Count stateHistory list items (lines starting with "  - ")
    const items = content.split('\n').filter((l) => l.startsWith('  - '));
    assert.ok(items.length >= 3, `stateHistory must have at least 3 entries. Got ${items.length}:\n${content}`);

    // Verify all three states are present
    assert.ok(content.includes('proposed|'), 'stateHistory must contain proposed entry');
    assert.ok(content.includes('approved|'), 'stateHistory must contain approved entry');
    assert.ok(content.includes('applied|'), 'stateHistory must contain applied entry');

    // Most recent currentState must be 'applied'
    assert.ok(content.includes('currentState: applied'), 'currentState must be the latest state (applied)');
  });

  test('CA-03: stateHistory entries preserve order (oldest first)', () => {
    createChange(tmpDir, 'my-change');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied']);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    const historyIdx = content.indexOf('stateHistory:');
    const proposedIdx = content.indexOf('proposed|', historyIdx);
    const appliedIdx = content.indexOf('applied|', historyIdx);

    assert.ok(proposedIdx < appliedIdx, 'proposed entry must appear before applied entry in stateHistory');
  });
});

// ── CA-12: --actor flag ───────────────────────────────────────────────────────

describe('CA-12: --actor flag stores correct actor in stateHistory', () => {
  test('CA-12: --actor cli is written when actor is not provided (default)', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('|cli'), 'stateHistory entry must include default actor "cli"');
  });

  test('CA-12: --actor custom-tool writes custom-tool in stateHistory', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'tested', '--actor', 'custom-tool']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('|custom-tool'), 'stateHistory entry must include actor "custom-tool"');
  });
});

// ── CR-01: invalid --state exits 1 without touching file ─────────────────────

describe('CR-01: invalid --state exits 1 without modifying memory.yaml', () => {
  test('CR-01: --state invalid-state exits 1', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'invalid-state']);
    assert.equal(r.status, 1, `expected exit 1 for invalid state. stdout: ${r.stdout}`);
    assert.ok(
      r.stderr.includes('invalid-state') || r.stderr.includes('estado inválido'),
      `stderr must mention the invalid state. Got: ${r.stderr}`,
    );
  });

  test('CR-01: invalid --state does not create memory.yaml if it did not exist', () => {
    createChange(tmpDir, 'my-change');

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    assert.ok(!fs.existsSync(memPath), 'memory.yaml must not exist before the test');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'bad-state']);

    assert.ok(!fs.existsSync(memPath), 'memory.yaml must NOT be created on invalid state');
  });

  test('CR-01: invalid --state does not modify existing memory.yaml', () => {
    const originalContent = 'currentState: proposed\nlastStep: apply\n';
    createChange(tmpDir, 'my-change', { memory: originalContent });

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'not-a-real-state']);

    const content = fs.readFileSync(memPath, 'utf8');
    assert.equal(content, originalContent, 'memory.yaml must be unchanged after invalid state attempt');
  });
});

// ── CR-02: empty --state value ───────────────────────────────────────────────

describe('CR-02: empty --state value exits 1', () => {
  test('CR-02: --state with empty string exits 1', () => {
    createChange(tmpDir, 'my-change');

    // Empty string is treated as "true" (boolean) by the parser when no value follows;
    // or as empty string when explicitly passed. We test with a value that is not in VALID_STATES.
    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', '']);
    // An empty string is not in VALID_STATES → must exit 1
    assert.equal(r.status, 1, `expected exit 1 for empty state. stdout: ${r.stdout} stderr: ${r.stderr}`);
    // CR-02: spec mandates the explicit empty-state message
    assert.ok(
      r.stderr.includes('el estado no puede estar vacío'),
      `stderr must contain the empty-state message. Got: ${r.stderr}`,
    );
  });
});

// ── CR-04: set-memory without flags exits 1 ──────────────────────────────────

describe('CR-04: set-memory with no known flags exits 1', () => {
  test('CR-04: set-memory with only change name exits 1 with helpful message', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change']);
    assert.equal(r.status, 1, `expected exit 1 when no flags provided. stdout: ${r.stdout}`);
    assert.ok(
      r.stderr.includes('set-memory') || r.stderr.includes('debe especificar'),
      `stderr must contain usage hint. Got: ${r.stderr}`,
    );
  });
});

// ── CR-actor-pipe: --actor containing '|' exits 1 without writing file ────────

describe("CR-actor-pipe: --actor value containing '|' exits 1 without modifying memory.yaml", () => {
  test("CR-actor-pipe: --actor 'a|b' exits 1 with descriptive error", () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'a|b']);
    assert.equal(r.status, 1, `expected exit 1 when actor contains '|'. stdout: ${r.stdout}`);
    assert.ok(
      r.stderr.includes('|') || r.stderr.includes('actor'),
      `stderr must mention the pipe character or 'actor'. Got: ${r.stderr}`,
    );
  });

  test("CR-actor-pipe: --actor 'a|b' does not create memory.yaml", () => {
    createChange(tmpDir, 'my-change');

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    assert.ok(!fs.existsSync(memPath), 'memory.yaml must not exist before test');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'a|b']);

    assert.ok(!fs.existsSync(memPath), 'memory.yaml must NOT be created when actor contains pipe');
  });

  test("CR-actor-pipe: --actor 'a|b' does not modify existing memory.yaml", () => {
    const originalContent = 'currentState: proposed\n';
    createChange(tmpDir, 'my-change', { memory: originalContent });

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'a|b']);

    const content = fs.readFileSync(memPath, 'utf8');
    assert.equal(content, originalContent, 'memory.yaml must be unchanged when actor contains pipe');
  });
});

// ── CA-04: sdd status --json includes currentState and stateInferred ──────────

describe('CA-04: sdd status --json includes currentState and stateInferred', () => {
  test('CA-04: status --json for change with explicit currentState in memory', () => {
    createChange(tmpDir, 'my-change', { memory: 'currentState: tested\nlastStep: test\n' });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'tested', 'currentState must be "tested"');
    assert.equal(parsed.stateInferred, false, 'stateInferred must be false when explicit state exists');
  });

  test('CA-04: status --json for change without memory uses inference', () => {
    createChange(tmpDir, 'my-change', { proposal: true });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(
      typeof parsed.currentState === 'string',
      `currentState must be a string. Got: ${parsed.currentState}`,
    );
    assert.equal(parsed.stateInferred, true, 'stateInferred must be true when inferred from artifacts');
  });

  test('CA-04: status --json shows currentState and stateInferred fields exist', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.ok('currentState' in parsed, 'status JSON must contain currentState field');
    assert.ok('stateInferred' in parsed, 'status JSON must contain stateInferred field');
  });

  test('CA-04: status --json exposes lastStep and touchedFiles (symmetric with tabular view)', () => {
    createChange(tmpDir, 'my-change', {
      memory: 'currentState: applied\nlastStep: apply\ntouchedFiles:\n  - src/foo.js\n  - src/bar.js\n',
    });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.lastStep, 'apply', 'status JSON must expose lastStep from memory');
    assert.ok(Array.isArray(parsed.touchedFiles), 'status JSON must expose touchedFiles as array');
    assert.ok(parsed.touchedFiles.includes('src/foo.js'), 'touchedFiles must contain src/foo.js');
    assert.ok(parsed.touchedFiles.includes('src/bar.js'), 'touchedFiles must contain src/bar.js');
    // Existing CA-04 fields must still be present
    assert.equal(parsed.currentState, 'applied', 'currentState must still be present');
    assert.equal(parsed.stateInferred, false, 'stateInferred must still be present');
  });
});

// ── CA-06: inferCurrentState — .review-passed → 'reviewed' ───────────────────

describe('CA-06: inferCurrentState returns reviewed when .review-passed exists', () => {
  test('CA-06: .review-passed present → reviewed', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, '.review-passed'),
      JSON.stringify({ verdict: 'APROBADO', date: new Date().toISOString() }),
    );

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'reviewed');
    assert.equal(result.inferred, true);
  });

  test('CA-06: .review-passed takes priority over lastStep', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, '.review-passed'), '{}');

    // Even with lastStep=apply, .review-passed must win
    const result = inferCurrentState(changeDir, { lastStep: 'apply' });
    assert.equal(result.currentState, 'reviewed');
  });
});

// ── CA-07: inferCurrentState — lastStep-based inference ──────────────────────

describe('CA-07: inferCurrentState returns state based on lastStep', () => {
  test('CA-07: lastStep=verify → verified', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, { lastStep: 'verify' });
    assert.equal(result.currentState, 'verified');
    assert.equal(result.inferred, true);
  });

  test('CA-07: lastStep=verified → verified', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, { lastStep: 'verified' });
    assert.equal(result.currentState, 'verified');
  });

  test('CA-07: lastStep=test → tested', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, { lastStep: 'test' });
    assert.equal(result.currentState, 'tested');
  });

  test('CA-07: lastStep=apply → applied', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, { lastStep: 'apply' });
    assert.equal(result.currentState, 'applied');
  });

  test('CA-07: tasks.md with [x] and no lastStep → apply-in-progress', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '# tasks\n\n- [x] T-01: done [S]\n- [ ] T-02: pending [S]\n',
    );

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'apply-in-progress');
    assert.equal(result.inferred, true);
  });

  test('CA-07: tasks.md with all unchecked and no lastStep → proposed (since proposal.md exists)', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal\n');
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '# tasks\n\n- [ ] T-01: pending [S]\n',
    );

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'proposed');
  });
});

// ── CA-08: inferCurrentState — only proposal.md → 'proposed' ─────────────────

describe('CA-08: inferCurrentState returns proposed when only proposal.md exists', () => {
  test('CA-08: only proposal.md, no memory, no review → proposed', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal\n');

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'proposed');
    assert.equal(result.inferred, true);
  });

  test('CA-08: empty dir with no artifacts → unknown', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'unknown');
  });
});

// ── CR-05: graceful degradation with corrupt YAML ────────────────────────────

describe('CR-05: status and inferCurrentState degrade gracefully with corrupt YAML', () => {
  test('CR-05: sdd status --json with corrupt memory.yaml exits 0 (does not crash)', () => {
    createChange(tmpDir, 'my-change', { memory: 'this: is: not: valid: yaml: :::' });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    // Must exit 0 — corrupt YAML is handled gracefully
    assert.equal(r.status, 0, `status must not crash on corrupt YAML. stderr: ${r.stderr}`);

    // Must return valid JSON
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(r.stdout.trim());
    }, 'stdout must be valid JSON even with corrupt memory.yaml');

    // currentState and stateInferred must still be present
    assert.ok('currentState' in parsed, 'status JSON must have currentState field even with corrupt memory');
    assert.ok('stateInferred' in parsed, 'status JSON must have stateInferred field even with corrupt memory');
  });

  test('CR-05: inferCurrentState with empty memory object does not throw', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal\n');

    let result;
    assert.doesNotThrow(() => {
      result = inferCurrentState(changeDir, {});
    }, 'inferCurrentState must not throw with empty memory');

    assert.ok(typeof result.currentState === 'string', 'currentState must be a string');
    assert.ok(typeof result.inferred === 'boolean', 'inferred must be a boolean');
  });

  test('CR-05: set-memory with corrupt existing memory.yaml still succeeds (graceful overwrite)', () => {
    createChange(tmpDir, 'my-change', { memory: '::: invalid yaml :::' });

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied']);
    assert.equal(r.status, 0, `set-memory must succeed even when existing memory.yaml is corrupt. stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('currentState: applied'), 'currentState must be written even when old memory was corrupt');
  });
});

// ── CA-02 (full merge): --state over memory with lastStep/touchedFiles/currentState ──

describe('CA-02 (full merge): set-memory --state preserves other memory fields', () => {
  test('CA-02-merge: lastStep and touchedFiles are intact after --state transition', () => {
    const originalMemory = [
      'lastStep: apply',
      'currentState: apply-in-progress',
      'touchedFiles:',
      '  - src/foo.js',
      '  - src/bar.js',
    ].join('\n') + '\n';
    createChange(tmpDir, 'my-change', { memory: originalMemory });

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    assert.ok(content.includes('currentState: applied'), 'currentState must be updated to applied');
    assert.ok(content.includes('lastStep: apply'), 'lastStep must be preserved after state transition');
    assert.ok(content.includes('src/foo.js'), 'touchedFiles must be preserved after state transition');
    assert.ok(content.includes('src/bar.js'), 'touchedFiles must be preserved after state transition');
    assert.ok(content.includes('stateHistory:'), 'stateHistory must be written');
    assert.ok(content.includes('applied|'), 'stateHistory must contain applied entry');
    assert.ok(content.includes('|apply-skill'), 'stateHistory must contain actor apply-skill');
  });

  test('CA-02-merge: stateHistory appends to existing entries without clearing them', () => {
    const originalMemory = [
      'currentState: proposed',
      'stateHistory:',
      '  - proposed|2025-01-01T00:00:00.000Z|proposer',
    ].join('\n') + '\n';
    createChange(tmpDir, 'my-change', { memory: originalMemory });

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    const items = content.split('\n').filter((l) => l.match(/^  - (proposed|applied)\|/));
    assert.equal(items.length, 2, `stateHistory must have both entries. Content:\n${content}`);
    // Check that old entry still present
    assert.ok(content.includes('proposed|2025-01-01T00:00:00.000Z|proposer'), 'existing stateHistory entry must be preserved');
    assert.ok(content.includes('applied|'), 'new stateHistory entry must be appended');
  });
});

// ── CA-03 (explicit default actor): --state without --actor uses "cli" ────────

describe('CA-03: --actor optional — defaults to "cli"', () => {
  test('CA-03: --state tested without --actor writes "tested|...|cli" entry', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'tested']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    const match = content.match(/^  - (tested\|[^\n]+)/m);
    assert.ok(match, `stateHistory must contain a 'tested' entry. Content:\n${content}`);
    const parts = match[1].split('|');
    assert.equal(parts[2], 'cli', `actor must default to "cli" when --actor is omitted. Got: "${parts[2]}"`);
  });
});

// ── CA-04 (verified explicit): status --json currentState=verified stateInferred=false ──

describe('CA-04 (verified): status --json reflects explicit currentState=verified', () => {
  test('CA-04: memory with currentState=verified → JSON currentState=verified stateInferred=false', () => {
    createChange(tmpDir, 'my-change', { memory: 'currentState: verified\nlastStep: verify\n' });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'verified', 'currentState must be "verified"');
    assert.equal(parsed.stateInferred, false, 'stateInferred must be false when explicit state exists');
  });
});

// ── CA-05: sdd stats --json includes currentState from memory ─────────────────

describe('CA-05: sdd stats --json includes memory.currentState and stateInferred', () => {
  test('CA-05: stats --json with memory currentState=reviewed returns stateInferred=false', () => {
    createChange(tmpDir, 'my-change', {
      memory: 'currentState: reviewed\nlastStep: review\n',
      reviewPassed: true,
    });

    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.ok('memory' in parsed, 'stats JSON must contain memory field');
    assert.equal(parsed.memory.currentState, 'reviewed', 'memory.currentState must be "reviewed"');
    assert.equal(parsed.memory.stateInferred, false, 'memory.stateInferred must be false when state is explicit');
  });

  test('CA-05: stats --json without currentState in memory uses inference (stateInferred=true)', () => {
    createChange(tmpDir, 'my-change', { proposal: true });

    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.ok('memory' in parsed, 'stats JSON must contain memory field');
    assert.ok(typeof parsed.memory.currentState === 'string', 'memory.currentState must be a string');
    assert.equal(parsed.memory.stateInferred, true, 'memory.stateInferred must be true when inferred');
  });

  test('CA-05: stats --json memory object contains currentState and stateInferred fields', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.ok('memory' in parsed, 'stats JSON must have memory field');
    assert.ok('currentState' in parsed.memory, 'memory must have currentState field');
    assert.ok('stateInferred' in parsed.memory, 'memory must have stateInferred field');
  });
});

// ── CA-06 (CLI): status --json with .review-passed and no currentState → stateInferred=true ──

describe('CA-06 (CLI): status --json with .review-passed and no currentState in memory', () => {
  test('CA-06: .review-passed + no currentState → currentState=reviewed stateInferred=true, memory NOT modified', () => {
    const memContent = 'lastStep: review\n';
    createChange(tmpDir, 'my-change', { memory: memContent, reviewPassed: true });

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const beforeMtime = fs.statSync(memPath).mtimeMs;

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'reviewed', 'currentState must be "reviewed" (inferred from .review-passed)');
    assert.equal(parsed.stateInferred, true, 'stateInferred must be true');

    // memory.yaml must NOT have been modified by status
    const afterMtime = fs.statSync(memPath).mtimeMs;
    assert.equal(afterMtime, beforeMtime, 'memory.yaml must not be modified by status command');
    const afterContent = fs.readFileSync(memPath, 'utf8');
    assert.equal(afterContent, memContent, 'memory.yaml content must be unchanged');
  });
});

// ── CA-07 (CLI): status --json with lastStep and no currentState, no .review-passed ──

describe('CA-07 (CLI): status --json infers state from lastStep', () => {
  test('CA-07: memory lastStep=test, no currentState, no .review-passed → currentState=tested stateInferred=true', () => {
    createChange(tmpDir, 'my-change', { memory: 'lastStep: test\n' });

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'tested', 'currentState must be "tested" (inferred from lastStep=test)');
    assert.equal(parsed.stateInferred, true, 'stateInferred must be true');
  });
});

// ── CA-08 (CLI): status --json with only proposal.md → infers proposed ────────

describe('CA-08 (CLI): status --json infers proposed from proposal.md only', () => {
  test('CA-08: proposal.md only (no memory, no .review-passed) → currentState=proposed stateInferred=true', () => {
    // createChange always writes proposal.md by default; no memory passed
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'proposed', 'currentState must be "proposed" when only proposal.md exists');
    assert.equal(parsed.stateInferred, true, 'stateInferred must be true');
  });
});

// ── CA-09: tabular status shows currentState + lastStep + touchedFiles ─────────

describe('CA-09: tabular sdd status (without --json) shows currentState, lastStep, touchedFiles', () => {
  test('CA-09: status without --json shows currentState line', () => {
    createChange(tmpDir, 'my-change', { memory: 'currentState: tested\nlastStep: test\n' });

    const r = runSdd(tmpDir, 'status', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    assert.ok(
      r.stdout.includes('currentState') && r.stdout.includes('tested'),
      `tabular output must show currentState with value "tested". Got:\n${r.stdout}`,
    );
  });

  test('CA-09: status without --json shows lastStep', () => {
    createChange(tmpDir, 'my-change', { memory: 'currentState: tested\nlastStep: test\n' });

    const r = runSdd(tmpDir, 'status', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    assert.ok(
      r.stdout.includes('lastStep') && r.stdout.includes('test'),
      `tabular output must show lastStep. Got:\n${r.stdout}`,
    );
  });

  test('CA-09: status without --json shows touchedFiles when present', () => {
    const mem = 'currentState: applied\nlastStep: apply\ntouchedFiles:\n  - src/a.js\n  - src/b.js\n';
    createChange(tmpDir, 'my-change', { memory: mem });

    const r = runSdd(tmpDir, 'status', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    assert.ok(
      r.stdout.includes('touchedFiles') || r.stdout.includes('src/a.js'),
      `tabular output must show touchedFiles when present. Got:\n${r.stdout}`,
    );
  });

  test('CA-09: status without --json shows inferred state with indicator', () => {
    // No memory → inference from proposal.md
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'status', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    assert.ok(
      r.stdout.includes('currentState'),
      `tabular output must show currentState field. Got:\n${r.stdout}`,
    );
    // The tabular view appends "(inferido)" when inferred
    assert.ok(
      r.stdout.includes('inferido') || r.stdout.includes('proposed'),
      `tabular output must indicate inferred state. Got:\n${r.stdout}`,
    );
  });
});

// ── CA-12 (4 transitions): stateHistory accumulates all in order ──────────────

describe('CA-12: stateHistory accumulates all transitions in chronological order', () => {
  test('CA-12: 4 transitions produce 4 stateHistory entries in order', () => {
    createChange(tmpDir, 'my-change');

    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'proposed', '--actor', 'proposer']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'apply-in-progress', '--actor', 'apply-skill']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);
    runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'tested', '--actor', 'test-skill']);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    // Extract all stateHistory entries
    const historySection = content.slice(content.indexOf('stateHistory:'));
    const entries = historySection
      .split('\n')
      .filter((l) => l.match(/^  - \S+\|/))
      .map((l) => l.replace(/^  - /, '').trim());

    assert.equal(entries.length, 4, `stateHistory must have exactly 4 entries. Entries:\n${entries.join('\n')}`);

    // Verify order: proposed → apply-in-progress → applied → tested
    assert.ok(entries[0].startsWith('proposed|'), `first entry must be proposed. Got: ${entries[0]}`);
    assert.ok(entries[1].startsWith('apply-in-progress|'), `second entry must be apply-in-progress. Got: ${entries[1]}`);
    assert.ok(entries[2].startsWith('applied|'), `third entry must be applied. Got: ${entries[2]}`);
    assert.ok(entries[3].startsWith('tested|'), `fourth entry must be tested. Got: ${entries[3]}`);

    // Verify each entry has 3 parts (state|ISO|actor)
    for (const entry of entries) {
      const parts = entry.split('|');
      assert.equal(parts.length, 3, `each stateHistory entry must have 3 pipe-separated parts: ${entry}`);
      assert.ok(!isNaN(new Date(parts[1]).getTime()), `second part must be a valid ISO timestamp: ${parts[1]}`);
    }

    // Timestamps must be in non-decreasing order
    const timestamps = entries.map((e) => new Date(e.split('|')[1]).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(
        timestamps[i] >= timestamps[i - 1],
        `timestamps must be non-decreasing. Entry ${i}: ${entries[i]}`,
      );
    }

    // currentState must be the last one
    assert.ok(content.includes('currentState: tested'), 'currentState must reflect last transition (tested)');
  });
});

// ── CR-01 (full): stderr lists VALID_STATES ───────────────────────────────────

describe('CR-01 (VALID_STATES in stderr): stderr must list valid states on invalid input', () => {
  test('CR-01: stderr lists all VALID_STATES when invalid state is supplied', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'totally-wrong']);
    assert.equal(r.status, 1);

    // stderr must include each valid state
    for (const state of VALID_STATES) {
      assert.ok(
        r.stderr.includes(state),
        `stderr must list valid state "${state}". Got stderr:\n${r.stderr}`,
      );
    }
  });
});

// ── CR-03: set-memory on non-existent change ──────────────────────────────────

describe('CR-03: set-memory on non-existent change exits 1 without creating files', () => {
  test('CR-03: set-memory on unknown change exits 1 with error message', () => {
    // Do NOT create the change directory — it must not exist
    const r = runSdd(tmpDir, 'set-memory', ['does-not-exist', '--state', 'proposed']);
    assert.equal(r.status, 1, `expected exit 1 for non-existent change. stdout: ${r.stdout}`);
    assert.ok(r.stderr.length > 0, 'stderr must contain an error message');
  });

  test('CR-03: set-memory on unknown change does not create memory.yaml', () => {
    const r = runSdd(tmpDir, 'set-memory', ['ghost-change', '--state', 'applied']);
    assert.equal(r.status, 1);

    const ghostDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'ghost-change');
    assert.ok(!fs.existsSync(ghostDir), 'change directory must NOT be created on failure');
  });
});

// ── Pass-2 edge/branch tests ──────────────────────────────────────────────────

// #1 — CA-01 / inferCurrentState: lastStep='verified' alternate spelling
describe('CA-01/inferCurrentState: lastStep="verified" alternate spelling → verified', () => {
  test('lastStep="verified" (spelled as past tense) returns currentState=verified', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });

    const result = inferCurrentState(changeDir, { lastStep: 'verified' });
    assert.equal(result.currentState, 'verified', 'lastStep="verified" must resolve to verified');
    assert.equal(result.inferred, true);
  });
});

// #2 — CA-02 / stateHistory init: non-array scalar stateHistory is reset to array
describe('CA-02: non-array stateHistory scalar in memory.yaml is replaced by a fresh array', () => {
  test('existing stateHistory scalar value is overwritten with a proper array on next --state call', () => {
    // Write memory where stateHistory is a plain string (corrupt/legacy value)
    const mem = 'currentState: proposed\nstateHistory: old-flat-string\n';
    createChange(tmpDir, 'my-change', { memory: mem });

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply-skill']);
    assert.equal(r.status, 0, `set-memory must succeed when stateHistory is a scalar. stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    // Must have a proper YAML list now
    assert.ok(content.includes('stateHistory:'), 'stateHistory key must still be present');
    assert.ok(content.includes('  - applied|'), 'stateHistory must be a YAML list with the new entry');
    // The old scalar must not remain verbatim
    assert.ok(!content.includes('old-flat-string'), 'old scalar stateHistory value must be gone');
    assert.ok(content.includes('currentState: applied'), 'currentState must be updated to applied');
  });
});

// #3 — CA-04 / cmdStatus: no memory file at all → stateInferred=true (falsy-branch via absent key)
describe('CA-04: absent memory.yaml → status --json falls through to inference (stateInferred=true)', () => {
  test('status --json with no memory.yaml present → stateInferred=true, currentState inferred from proposal.md', () => {
    // createChange with no memory option → memory.yaml does not exist
    createChange(tmpDir, 'my-change', { memory: undefined });
    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    // Ensure memory.yaml truly does not exist
    if (fs.existsSync(memPath)) fs.unlinkSync(memPath);

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.currentState, 'proposed', 'currentState must be inferred as proposed from proposal.md');
    assert.equal(parsed.stateInferred, true, 'stateInferred must be true when memory.yaml is absent');
  });
});

// #4 — CA-05 / cmdStats: no memory file → stateInferred=true (falsy-branch via absent key)
describe('CA-05: absent memory.yaml → stats --json uses inference (stateInferred=true)', () => {
  test('stats --json with no memory.yaml → memory.stateInferred=true, currentState inferred', () => {
    createChange(tmpDir, 'my-change', { memory: undefined });
    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    if (fs.existsSync(memPath)) fs.unlinkSync(memPath);

    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.memory.stateInferred, true, 'stateInferred must be true when memory.yaml is absent');
    assert.ok(typeof parsed.memory.currentState === 'string' && parsed.memory.currentState.length > 0,
      'memory.currentState must be a non-empty inferred string');
  });
});

// #5 — CA-06 / inferCurrentState priority: .review-passed wins over lastStep=verify
describe('CA-06: .review-passed takes priority over lastStep=verify', () => {
  test('.review-passed present + lastStep=verify → reviewed (not verified)', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, '.review-passed'), '{}');

    const result = inferCurrentState(changeDir, { lastStep: 'verify' });
    assert.equal(result.currentState, 'reviewed', '.review-passed must win over lastStep=verify');
    assert.equal(result.inferred, true);
  });
});

// #6 — CA-07 / inferCurrentState: tasks.md with no [x] + no lastStep + no proposal.md → unknown
describe('CA-07/CA-08: tasks.md all-unchecked, no lastStep, no proposal.md → unknown', () => {
  test('tasks.md with only unchecked items + no lastStep + no proposal.md → currentState=unknown', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '# tasks\n\n- [ ] T-01: pending [S]\n- [ ] T-02: pending [S]\n',
    );
    // No proposal.md, no .review-passed

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'unknown', 'no [x] items and no proposal.md must yield unknown');
    assert.equal(result.inferred, true);
  });
});

// #7 — CA-08: proposal.md + tasks.md all-unchecked + no lastStep → proposed (not unknown)
describe('CA-08: proposal.md present with tasks.md all-unchecked and no lastStep → proposed', () => {
  test('proposal.md + tasks.md with only unchecked items + no lastStep → proposed', () => {
    const changeDir = path.join(tmpDir, 'test-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal\n');
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '# tasks\n\n- [ ] T-01: pending [S]\n',
    );

    const result = inferCurrentState(changeDir, {});
    assert.equal(result.currentState, 'proposed', 'proposal.md must rescue inference to proposed when tasks all unchecked');
    assert.equal(result.inferred, true);
  });
});

// #8 — CA-12 / stateHistory format: --actor with spaces is preserved verbatim
describe('CA-12: --actor value with spaces is stored verbatim in stateHistory', () => {
  test('--actor "apply skill" (contains space) writes entry with exactly 3 pipe-parts', () => {
    createChange(tmpDir, 'my-change');

    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state', 'applied', '--actor', 'apply skill']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change', 'memory.yaml');
    const content = fs.readFileSync(memPath, 'utf8');

    const match = content.match(/^  - (applied\|[^\n]+)/m);
    assert.ok(match, `stateHistory must contain an applied entry. Content:\n${content}`);
    const entry = match[1];
    const parts = entry.split('|');
    assert.equal(parts.length, 3, `entry must have exactly 3 pipe-parts even when actor contains spaces: ${entry}`);
    assert.equal(parts[2], 'apply skill', `actor must be preserved verbatim. Got: "${parts[2]}"`);
  });
});

// #9 — CR-02: --state as a bare flag (no value) → boolean true → not in VALID_STATES → exit 1
describe('CR-02: --state supplied as bare flag (no value) → boolean true → exit 1', () => {
  test('--state with no following value (parsed as true) exits 1', () => {
    createChange(tmpDir, 'my-change');

    // Pass --state as the last argument with no value; parseArgs will set args['state'] = true
    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--state']);
    assert.equal(r.status, 1, `expected exit 1 when --state has no value. stdout: ${r.stdout} stderr: ${r.stderr}`);
  });
});

// #10 — CR-04: set-memory with no positional argument at all → exit 1 with usage message
describe('CR-04: set-memory with no positional argument at all exits 1 with usage', () => {
  test('set-memory invoked with no change name exits 1 and prints usage', () => {
    // Run set-memory with zero arguments
    const r = runSdd(tmpDir, 'set-memory', []);
    assert.equal(r.status, 1, `expected exit 1 when no change name provided. stdout: ${r.stdout}`);
    assert.ok(
      r.stderr.includes('set-memory') || r.stderr.includes('Uso'),
      `stderr must contain usage hint. Got: ${r.stderr}`,
    );
  });
});
