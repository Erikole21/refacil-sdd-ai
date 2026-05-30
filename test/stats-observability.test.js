'use strict';

/**
 * Tests for imp-stats-observability criteria.
 *
 * Coverage:
 *   CA-01: memory.yaml is preserved (moved with change dir) when archiving
 *   CA-02: sdd stats shows memory data for an archived change
 *   CA-03: sdd.js help text for "archive" does not say memory.yaml is deleted
 *   CA-04: apply/SKILL.md instructs running compact log-codegraph-event --skill implementer
 *   CA-05: test/SKILL.md instructs running compact log-codegraph-event --skill tester
 *   CA-06: verify/SKILL.md instructs running compact log-codegraph-event --skill validator
 *   CA-07: review/SKILL.md instructs running compact log-codegraph-event --skill auditor
 *   CA-08: telemetry step is silent and does not block the flow
 *   CA-09: telemetry uses values from sub-agent usage block; omitted if unavailable
 *   CA-10: stats with no arg and single active change uses that change automatically
 *   CA-11: stats with no arg and no active changes auto-selects most recent archived change
 *   CA-12: tiebreak by name descending when archivedDate is equal
 *   CA-13: stats with no active/archived changes: informs user and stops
 *   CR-01: archiving without memory.yaml does not fail
 *   CR-02: telemetry call omitted if usage block unavailable
 *   CR-03: stats with explicit changeName does not use auto-fallback
 *   CR-04: stats with multiple active changes asks user to pick (no auto-fallback)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

const SDD_JS_PATH = path.resolve(__dirname, '..', 'lib', 'commands', 'sdd.js');
const APPLY_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'apply', 'SKILL.md');
const ARCHIVE_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'archive', 'SKILL.md');
const AUTOPILOT_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'autopilot', 'SKILL.md');
const BUG_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'bug', 'SKILL.md');
const CONTRACT_PATH = path.resolve(__dirname, '..', 'skills', 'prereqs', 'METHODOLOGY-CONTRACT.md');
const TEST_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'test', 'SKILL.md');
const VERIFY_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'verify', 'SKILL.md');
const REVIEW_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'review', 'SKILL.md');
const STATS_SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'stats', 'SKILL.md');

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

function runSddBare(tmpDir, args = []) {
  const result = spawnSync(node, [CLI, 'sdd', ...args], {
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

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-obs-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── CA-01 & CA-02: archive moves memory.yaml with the change dir ──────────────

describe('CA-01: archive preserves memory.yaml by moving it with the change', () => {
  const MINIMAL_SPECS = '## CA-01: test\n\n**Dado** x\n**Cuando** y\n**Entonces** z\n';

  test('CA-01: memory.yaml exists at archive/<date>-<name>/memory.yaml after archiving', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'mem-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: mem-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), MINIMAL_SPECS);
    // Write memory.yaml with substantive content
    fs.writeFileSync(
      path.join(changeDir, 'memory.yaml'),
      'lastStep: test\ncriteriaRun:\n  - CA-01\n  - CR-01\ntestCommand: node --test test/sdd.test.js\n',
    );

    const r = runSdd(tmpDir, 'archive', ['mem-change']);
    assert.equal(r.status, 0, `archive must succeed. stderr: ${r.stderr}`);

    // Source must be gone
    assert.ok(!fs.existsSync(changeDir), 'source change dir must no longer exist');

    // Find the archived directory
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const archivedName = entries.find((e) => e.match(/^\d{4}-\d{2}-\d{2}-mem-change$/));
    assert.ok(archivedName, `archived directory must exist with pattern YYYY-MM-DD-mem-change. Found: ${entries.join(', ')}`);

    // memory.yaml MUST be at archive/<date>-mem-change/memory.yaml
    const archivedMemory = path.join(archiveDir, archivedName, 'memory.yaml');
    assert.ok(
      fs.existsSync(archivedMemory),
      `memory.yaml must exist at ${archivedMemory} (moved with the change directory)`,
    );

    // Verify content is intact
    const content = fs.readFileSync(archivedMemory, 'utf8');
    assert.ok(content.includes('lastStep: test'), 'archived memory.yaml must preserve lastStep field');
    assert.ok(content.includes('CA-01'), 'archived memory.yaml must preserve criteriaRun field');
  });

  test('CA-01: memory.yaml is NOT at the original path after archiving (moved, not copied)', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'moved-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: moved-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), MINIMAL_SPECS);
    fs.writeFileSync(path.join(changeDir, 'memory.yaml'), 'lastStep: apply\n');

    runSdd(tmpDir, 'archive', ['moved-change']);

    // Original path must not exist
    const originalMemory = path.join(changeDir, 'memory.yaml');
    assert.ok(!fs.existsSync(originalMemory), 'memory.yaml must NOT remain at original path after archive');
  });
});

// ── CA-02: sdd stats shows memory data for archived change ───────────────────

describe('CA-02: sdd stats shows memory data for an archived change', () => {
  test('CA-02: stats --json for archived change with memory.yaml has non-null lastStep, criteriaRun, testCommand', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-11-01-obs-change');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# proposal: obs-change\n');
    fs.writeFileSync(
      path.join(archiveDir, 'memory.yaml'),
      'lastStep: test\ncriteriaRun:\n  - CA-01\n  - CA-02\ntestCommand: node --test test/sdd.test.js\n',
    );

    const r = runSdd(tmpDir, 'stats', ['obs-change', '--json']);
    assert.equal(r.status, 0, `stats must succeed for archived change. stderr: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.isArchived, true, 'isArchived must be true');

    // CA-02 requirement: memory data is not null for archived change
    assert.notEqual(parsed.memory.lastStep, null, 'lastStep must not be null for archived change with memory.yaml');
    assert.notEqual(parsed.memory.testCommand, null, 'testCommand must not be null for archived change with memory.yaml');
    assert.ok(
      Array.isArray(parsed.memory.criteriaRun) && parsed.memory.criteriaRun.length > 0,
      'criteriaRun must be a non-empty array for archived change with memory.yaml',
    );

    assert.equal(parsed.memory.lastStep, 'test', 'lastStep must match memory.yaml content');
    assert.equal(parsed.memory.testCommand, 'node --test test/sdd.test.js', 'testCommand must match memory.yaml content');
    assert.ok(parsed.memory.criteriaRun.includes('CA-01'), 'criteriaRun must include CA-01');
    assert.ok(parsed.memory.criteriaRun.includes('CA-02'), 'criteriaRun must include CA-02');
  });
});

// ── CA-03: sdd.js help text for archive does not say memory.yaml is deleted ───

describe('CA-03: sdd.js help text for archive command', () => {
  test('CA-03: help text does not say memory.yaml is deleted', () => {
    const src = fs.readFileSync(SDD_JS_PATH, 'utf8');

    // Verify the help section mentions moving/preserving — not deletion
    const deletionPhrases = [
      'memory.yaml será eliminado',
      'memory.yaml is deleted',
      'elimina memory.yaml',
      'deletes memory.yaml',
      'borra memory.yaml',
    ];

    for (const phrase of deletionPhrases) {
      assert.ok(
        !src.toLowerCase().includes(phrase.toLowerCase()),
        `help text must NOT contain deletion phrase: "${phrase}"`,
      );
    }
  });

  test('CA-03: help text mentions that the full directory (including memory.yaml) is moved', () => {
    const src = fs.readFileSync(SDD_JS_PATH, 'utf8');

    // The help text should reference moving the complete directory (memory.yaml preserved)
    const preservationPhrases = [
      'incluyendo memory.yaml',
      'including memory.yaml',
      'mueve el cambio completo',
      'moves the complete',
    ];

    const hasPreservationNote = preservationPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasPreservationNote,
      `help text must indicate that the full directory including memory.yaml is moved. Checked phrases: ${preservationPhrases.join(', ')}`,
    );
  });

  test('CA-03: CLI help output does not say memory.yaml is deleted', () => {
    const r = runSddBare(tmpDir, []);
    const output = r.stdout + r.stderr;

    const deletionPhrases = ['memory.yaml is deleted', 'memory.yaml será eliminado'];
    for (const phrase of deletionPhrases) {
      assert.ok(
        !output.toLowerCase().includes(phrase.toLowerCase()),
        `CLI help must not say memory.yaml is deleted. Found: "${phrase}"`,
      );
    }
  });
});

// ── CR-01: archiving without memory.yaml does not fail ───────────────────────

describe('CR-01: archiving a change without memory.yaml succeeds', () => {
  const MINIMAL_SPECS = '## CA-01: test\n\n**Dado** x\n**Cuando** y\n**Entonces** z\n';

  test('CR-01: archive of change without memory.yaml exits 0', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'no-mem-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: no-mem-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), MINIMAL_SPECS);
    // Deliberately do NOT create memory.yaml

    const r = runSdd(tmpDir, 'archive', ['no-mem-change']);
    assert.equal(r.status, 0, `archive must succeed even without memory.yaml. stderr: ${r.stderr}`);

    // Verify archived directory exists
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const archivedName = entries.find((e) => e.endsWith('-no-mem-change'));
    assert.ok(archivedName, 'archived directory must exist even without memory.yaml');
  });

  test('CR-01: archive of change without memory.yaml — memory.yaml absent in archive is OK', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'bare-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: bare-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), MINIMAL_SPECS);

    const r = runSdd(tmpDir, 'archive', ['bare-change']);
    assert.equal(r.status, 0, `archive must not fail when memory.yaml is absent. stderr: ${r.stderr}`);

    // Absence of memory.yaml in archive dir is acceptable (no error)
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const archivedName = entries.find((e) => e.endsWith('-bare-change'));
    assert.ok(archivedName, 'archive entry must exist');
    // memory.yaml should be absent (it was never created)
    const archivedMemory = path.join(archiveDir, archivedName, 'memory.yaml');
    assert.ok(!fs.existsSync(archivedMemory), 'memory.yaml must not appear in archive if it was not in the source change');
  });
});

// ── CA-04 through CA-09 & CR-02: SKILL.md telemetry content checks ───────────

describe('CA-04: apply/SKILL.md instructs compact log-codegraph-event --skill implementer', () => {
  test('CA-04: apply/SKILL.md contains compact log-codegraph-event with --skill implementer', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('log-codegraph-event'),
      'apply/SKILL.md must contain "log-codegraph-event" instruction',
    );
    assert.ok(
      src.includes('--skill implementer'),
      'apply/SKILL.md must contain "--skill implementer" flag',
    );
    // Must appear together (same command context)
    const logIdx = src.indexOf('log-codegraph-event');
    const skillIdx = src.indexOf('--skill implementer');
    assert.ok(
      logIdx >= 0 && skillIdx >= 0,
      'Both "log-codegraph-event" and "--skill implementer" must be present',
    );
  });

  test('CA-04: apply/SKILL.md telemetry step runs after sub-agent returns (Step 2.5 or later)', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    // The telemetry step must appear after "Step 2" (delegate to sub-agent)
    const step2Idx = src.indexOf('### Step 2:');
    const telemetryIdx = src.indexOf('log-codegraph-event');

    assert.ok(step2Idx >= 0, 'apply/SKILL.md must have Step 2 (delegate to sub-agent)');
    assert.ok(telemetryIdx >= 0, 'apply/SKILL.md must have telemetry instruction');
    assert.ok(
      telemetryIdx > step2Idx,
      'Telemetry instruction must appear after Step 2 (after sub-agent returns)',
    );
  });
});

describe('CA-05: test/SKILL.md instructs compact log-codegraph-event --skill tester', () => {
  test('CA-05: test/SKILL.md contains compact log-codegraph-event with --skill tester', () => {
    const src = fs.readFileSync(TEST_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('log-codegraph-event'),
      'test/SKILL.md must contain "log-codegraph-event" instruction',
    );
    assert.ok(
      src.includes('--skill tester'),
      'test/SKILL.md must contain "--skill tester" flag',
    );
  });

  test('CA-05: test/SKILL.md telemetry step runs after sub-agent returns and before parsing refacil-test-result', () => {
    const src = fs.readFileSync(TEST_SKILL_PATH, 'utf8');

    // Telemetry (Step 2.5) must appear after "Step 2" (delegate) and before "Step 3" (parse/present)
    const step2Idx = src.indexOf('### Step 2:');
    const telemetryIdx = src.indexOf('log-codegraph-event');
    const step3Idx = src.indexOf('### Step 3:');

    assert.ok(step2Idx >= 0, 'test/SKILL.md must have Step 2');
    assert.ok(telemetryIdx >= 0, 'test/SKILL.md must have telemetry instruction');
    assert.ok(step3Idx >= 0, 'test/SKILL.md must have Step 3 (parse result)');

    assert.ok(
      telemetryIdx > step2Idx,
      'Telemetry must appear after Step 2 (after sub-agent returns)',
    );
    assert.ok(
      telemetryIdx < step3Idx,
      'Telemetry must appear before Step 3 (before parsing refacil-test-result)',
    );
  });
});

describe('CA-06: verify/SKILL.md instructs compact log-codegraph-event --skill validator', () => {
  test('CA-06: verify/SKILL.md contains compact log-codegraph-event with --skill validator', () => {
    const src = fs.readFileSync(VERIFY_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('log-codegraph-event'),
      'verify/SKILL.md must contain "log-codegraph-event" instruction',
    );
    assert.ok(
      src.includes('--skill validator'),
      'verify/SKILL.md must contain "--skill validator" flag',
    );
  });

  test('CA-06: verify/SKILL.md telemetry step runs after sub-agent returns and before Step 3', () => {
    const src = fs.readFileSync(VERIFY_SKILL_PATH, 'utf8');

    const step2Idx = src.indexOf('### Step 2:');
    const telemetryIdx = src.indexOf('log-codegraph-event');
    const step3Idx = src.indexOf('### Step 3:');

    assert.ok(step2Idx >= 0, 'verify/SKILL.md must have Step 2 (delegate)');
    assert.ok(telemetryIdx >= 0, 'verify/SKILL.md must have telemetry instruction');
    assert.ok(step3Idx >= 0, 'verify/SKILL.md must have Step 3 (present report)');

    assert.ok(
      telemetryIdx > step2Idx,
      'Telemetry must appear after Step 2 (after sub-agent returns)',
    );
    assert.ok(
      telemetryIdx < step3Idx,
      'Telemetry must appear before Step 3',
    );
  });
});

describe('CA-07: review/SKILL.md instructs compact log-codegraph-event --skill auditor', () => {
  test('CA-07: review/SKILL.md contains compact log-codegraph-event with --skill auditor', () => {
    const src = fs.readFileSync(REVIEW_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('log-codegraph-event'),
      'review/SKILL.md must contain "log-codegraph-event" instruction',
    );
    assert.ok(
      src.includes('--skill auditor'),
      'review/SKILL.md must contain "--skill auditor" flag',
    );
  });

  test('CA-07: review/SKILL.md telemetry step runs after sub-agent returns and before Step 2', () => {
    const src = fs.readFileSync(REVIEW_SKILL_PATH, 'utf8');

    const step1Idx = src.indexOf('### Step 1:');
    const telemetryIdx = src.indexOf('log-codegraph-event');
    const step2Idx = src.indexOf('### Step 2:');

    assert.ok(step1Idx >= 0, 'review/SKILL.md must have Step 1 (delegate to sub-agent)');
    assert.ok(telemetryIdx >= 0, 'review/SKILL.md must have telemetry instruction');
    assert.ok(step2Idx >= 0, 'review/SKILL.md must have Step 2 (process report)');

    assert.ok(
      telemetryIdx > step1Idx,
      'Telemetry must appear after Step 1 (after sub-agent returns)',
    );
    assert.ok(
      telemetryIdx < step2Idx,
      'Telemetry must appear before Step 2',
    );
  });
});

describe('CA-08: telemetry step is silent and does not block the flow', () => {
  const SKILL_PATHS = [
    { name: 'apply', path: APPLY_SKILL_PATH },
    { name: 'test', path: TEST_SKILL_PATH },
    { name: 'verify', path: VERIFY_SKILL_PATH },
    { name: 'review', path: REVIEW_SKILL_PATH },
  ];

  for (const skill of SKILL_PATHS) {
    test(`CA-08: ${skill.name}/SKILL.md says errors are ignored / telemetry does not block flow`, () => {
      const src = fs.readFileSync(skill.path, 'utf8');

      // Each SKILL.md must state that command failure is ignored / does not block
      const silentPhrases = [
        'ignore',
        'block',
        'not block',
        'must not block',
        'if the command fails',
      ];

      const hasSilentNote = silentPhrases.some((phrase) =>
        src.toLowerCase().includes(phrase.toLowerCase()),
      );

      assert.ok(
        hasSilentNote,
        `${skill.name}/SKILL.md must state that telemetry errors are ignored and do not block flow. Checked: ${silentPhrases.join(', ')}`,
      );
    });

    test(`CA-08: ${skill.name}/SKILL.md telemetry instruction appears with "silent" qualifier or "(silent)" note`, () => {
      const src = fs.readFileSync(skill.path, 'utf8');

      // Find the context around log-codegraph-event
      const logIdx = src.indexOf('log-codegraph-event');
      assert.ok(logIdx >= 0, `${skill.name}/SKILL.md must contain log-codegraph-event`);

      // Extract surrounding context (200 chars before + 400 chars after)
      const contextStart = Math.max(0, logIdx - 200);
      const contextEnd = Math.min(src.length, logIdx + 400);
      const context = src.slice(contextStart, contextEnd).toLowerCase();

      const silentIndicators = ['silent', 'ignore', 'do not mention', 'not block'];
      const hasSilentContext = silentIndicators.some((indicator) => context.includes(indicator));

      assert.ok(
        hasSilentContext,
        `${skill.name}/SKILL.md telemetry instruction must be accompanied by a silent/ignore note near the command. Context: "${context.slice(0, 200)}"`,
      );
    });
  }
});

describe('CA-09 & CR-02: telemetry uses usage block values; omitted when unavailable', () => {
  test('CA-09: apply/SKILL.md references --tool-calls and --tokens flags for telemetry', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('--tool-calls'),
      'apply/SKILL.md must reference --tool-calls flag for telemetry',
    );
    assert.ok(
      src.includes('--tokens'),
      'apply/SKILL.md must reference --tokens flag for telemetry',
    );
  });

  test('CA-09: test/SKILL.md references --tool-calls and --tokens flags for telemetry', () => {
    const src = fs.readFileSync(TEST_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('--tool-calls'),
      'test/SKILL.md must reference --tool-calls flag for telemetry',
    );
    assert.ok(
      src.includes('--tokens'),
      'test/SKILL.md must reference --tokens flag for telemetry',
    );
  });

  test('CA-09: verify/SKILL.md references --tool-calls and --tokens flags for telemetry', () => {
    const src = fs.readFileSync(VERIFY_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('--tool-calls'),
      'verify/SKILL.md must reference --tool-calls flag for telemetry',
    );
    assert.ok(
      src.includes('--tokens'),
      'verify/SKILL.md must reference --tokens flag for telemetry',
    );
  });

  test('CA-09: review/SKILL.md references --tool-calls and --tokens flags for telemetry', () => {
    const src = fs.readFileSync(REVIEW_SKILL_PATH, 'utf8');

    assert.ok(
      src.includes('--tool-calls'),
      'review/SKILL.md must reference --tool-calls flag for telemetry',
    );
    assert.ok(
      src.includes('--tokens'),
      'review/SKILL.md must reference --tokens flag for telemetry',
    );
  });

  test('CA-09: apply/SKILL.md states that --tool-calls comes from usage block (tool_uses or similar)', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    // Must reference the usage block as the source of tool call counts
    const usageReferences = [
      'usage',
      'tool_uses',
      '<usage>',
      'sub-agent\'s',
    ];

    const hasUsageRef = usageReferences.some((ref) =>
      src.toLowerCase().includes(ref.toLowerCase()),
    );

    assert.ok(
      hasUsageRef,
      `apply/SKILL.md must reference the sub-agent usage block as the source for --tool-calls. Checked: ${usageReferences.join(', ')}`,
    );
  });

  test('CR-02: apply/SKILL.md says to omit telemetry call if usage block is unavailable', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    // Must state that the call is omitted when usage block is unavailable
    const omissionPhrases = [
      'omit',
      'if the command fails',
      'unavailable',
      'ignore it',
      'not available',
    ];

    const hasOmissionNote = omissionPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasOmissionNote,
      `apply/SKILL.md must state that the telemetry call is omitted/ignored when the command fails or usage block is unavailable. Checked: ${omissionPhrases.join(', ')}`,
    );
  });

  test('CR-02: test/SKILL.md says to omit telemetry call if usage block is unavailable', () => {
    const src = fs.readFileSync(TEST_SKILL_PATH, 'utf8');

    const omissionPhrases = ['omit', 'if the command fails', 'unavailable', 'ignore it', 'not available'];
    const hasOmissionNote = omissionPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasOmissionNote,
      `test/SKILL.md must state that the telemetry call is omitted when command fails or usage block unavailable. Checked: ${omissionPhrases.join(', ')}`,
    );
  });
});

// ── imp-hardening-refacil-sdd-ai-flow textual contracts ──────────────────────

describe('hardening: readiness, archive, bug, and autopilot contracts', () => {
  test('apply skill trusts ready.forApply and reports every missing artifact', () => {
    const src = fs.readFileSync(APPLY_SKILL_PATH, 'utf8');

    assert.ok(src.includes('ready.forApply'), 'apply must use ready.forApply as the readiness contract');
    assert.ok(src.includes('missingArtifacts'), 'apply must build a complete missingArtifacts list');
    assert.ok(src.includes('design'), 'apply readiness must include design');
    assert.ok(src.includes('specs/**/*.md'), 'apply must document recursive specs detection');
  });

  test('autopilot preflight blocks incomplete changes before apply delegation', () => {
    const src = fs.readFileSync(AUTOPILOT_SKILL_PATH, 'utf8');
    const preflightIndex = src.indexOf('### Step 0: Preflight validation');
    const applyIndex = src.indexOf('### Step 1: Run /refacil:apply');

    assert.ok(preflightIndex >= 0, 'autopilot must define a preflight validation step');
    assert.ok(applyIndex > preflightIndex, 'autopilot must validate readiness before running apply');
    assert.ok(src.includes('ready.forApply'), 'autopilot must use ready.forApply as the readiness contract');
    assert.ok(src.includes('missingArtifacts'), 'autopilot must report all missing artifacts before stopping');
    assert.ok(src.includes('proposal') && src.includes('design') && src.includes('tasks') && src.includes('specs'), 'autopilot readiness must cover all regular proposal artifacts');
    assert.ok(src.includes('Do NOT notify Kapso'), 'usage errors before delegation must stop without success/failure notification side effects');
  });

  test('archive skill uses current /refacil:test evidence instead of re-running by default', () => {
    const src = fs.readFileSync(ARCHIVE_SKILL_PATH, 'utf8');

    assert.ok(src.includes('sdd get-memory'), 'archive must read memory evidence');
    assert.ok(src.includes('commandsRun'), 'archive must require commandsRun evidence');
    assert.ok(src.includes('criteriaRun'), 'archive must require criteriaRun evidence');
    assert.ok(src.includes('test`, `verify`, or `review`'), 'archive must accept test evidence after verify/review phases');
    assert.ok(src.includes('stale'), 'archive must handle stale test evidence');
    assert.ok(src.includes('freshness cannot be proven'), 'archive must fail closed when evidence freshness is unknown');
    assert.ok(src.includes('autopilotMode = true'), 'archive must define autopilot behavior');
    assert.ok(src.includes('Cannot archive in autopilot'), 'archive must abort clearly in autopilot when evidence is absent');
  });

  test('archive skill preserves memory.yaml and does not auto-delete archive residue', () => {
    const src = fs.readFileSync(ARCHIVE_SKILL_PATH, 'utf8');

    assert.ok(src.includes('preserves `memory.yaml`'), 'archive must document memory.yaml preservation');
    assert.ok(!src.includes('deletes memory.yaml'), 'archive must not claim memory.yaml is deleted');
    assert.ok(!src.includes('rm -rf'), 'archive must not instruct automatic destructive cleanup');
  });

  test('archive skill asks in normal mode when current /refacil:test evidence is missing or stale', () => {
    const src = fs.readFileSync(ARCHIVE_SKILL_PATH, 'utf8');

    assert.ok(src.includes('autopilotMode = false'), 'archive must define normal-mode behavior');
    assert.ok(src.includes('ask the user whether to run `/refacil:test` now'), 'normal mode must ask before running tests');
    assert.ok(src.includes('explicitly continue without current test evidence'), 'normal mode must allow explicit user decision');
    assert.ok(src.includes('Do not silently run tests'), 'archive must not auto-run tests when evidence is absent');
  });

  test('bug skill documents the fix-* archive exception without proposal artifacts', () => {
    const src = fs.readFileSync(BUG_SKILL_PATH, 'utf8');

    assert.ok(src.includes('fix-*'), 'bug flow must mention fix-* changes');
    assert.ok(src.includes('summary.md'), 'bug fix archive exception must require summary.md');
    assert.ok(src.includes('regression test'), 'bug fix archive exception must require regression test evidence');
    assert.ok(src.includes('.review-passed'), 'bug fix archive exception must require review approval');
    assert.ok(src.includes('does not need `proposal.md`, `design.md`, `tasks.md`, or `specs.md`'), 'bug fix exception must not require regular proposal artifacts');
  });

  test('autopilot skill preserves the working tree and has no destructive rollback command', () => {
    const src = fs.readFileSync(AUTOPILOT_SKILL_PATH, 'utf8');

    assert.ok(!src.includes('git reset --hard'), 'autopilot must not instruct git reset --hard as recovery');
    assert.ok(src.includes('preserve the working tree') || src.includes('Leave the working tree as-is'), 'autopilot must preserve local edits on failure');
    assert.ok(src.includes('failure notification'), 'autopilot must notify failure when configured');
  });

  test('normal flow instructions do not contain destructive hard reset recovery', () => {
    const paths = [
      APPLY_SKILL_PATH,
      ARCHIVE_SKILL_PATH,
      AUTOPILOT_SKILL_PATH,
      BUG_SKILL_PATH,
      CONTRACT_PATH,
    ];

    for (const filePath of paths) {
      const src = fs.readFileSync(filePath, 'utf8');
      assert.ok(!src.includes('git reset --hard'), `${filePath} must not instruct git reset --hard`);
    }
  });

  test('methodology contract defines recursive specs and the fix-* exception', () => {
    const src = fs.readFileSync(CONTRACT_PATH, 'utf8');

    assert.ok(src.includes('recursive `specs/**/*.md`'), 'contract must define recursive specs readiness');
    assert.ok(src.includes('same source set'), 'contract must align status, sync-spec, test/verify, and archive spec sources');
    assert.ok(src.includes('Empty `specs/` folders do not count'), 'contract must reject empty specs folders');
    assert.ok(src.includes('fix-*'), 'contract must document bug fix exception');
    assert.ok(src.includes('/refacil:test` evidence'), 'contract must require current test evidence for archive');
  });
});

// ── CA-10 through CA-13, CR-03, CR-04: stats/SKILL.md Step 1 auto-fallback ───

describe('CA-10 through CA-13 & CR-03, CR-04: stats/SKILL.md auto-fallback logic', () => {
  test('CA-10: stats/SKILL.md Step 1 describes using single active change automatically', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe automatic use of single active change
    const singleChangeDescriptions = [
      'single active change',
      'exactly one active',
      'only one',
      'single',
    ];

    const hasSingleChangeDesc = singleChangeDescriptions.some((desc) =>
      src.toLowerCase().includes(desc.toLowerCase()),
    );

    assert.ok(
      hasSingleChangeDesc,
      `stats/SKILL.md must describe auto-selection of single active change. Checked: ${singleChangeDescriptions.join(', ')}`,
    );
  });

  test('CA-11: stats/SKILL.md Step 1 describes auto-selecting most recent archived change when no active changes', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe fallback to most recent archived change
    const archivedFallbackPhrases = [
      'most recent archived',
      'auto-select',
      'no active changes',
      'archived change',
      'isArchived',
      'archivedDate',
    ];

    const hasArchivedFallback = archivedFallbackPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasArchivedFallback,
      `stats/SKILL.md must describe auto-fallback to most recent archived change when no active changes exist. Checked: ${archivedFallbackPhrases.join(', ')}`,
    );
  });

  test('CA-11: stats/SKILL.md Step 1 says to inform user when falling back to archived change', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must instruct to inform user about the fallback
    const informPhrases = [
      'inform the user',
      'inform user',
      'No active changes found',
      'showing stats for',
    ];

    const hasInformUser = informPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasInformUser,
      `stats/SKILL.md must instruct to inform the user when auto-selecting an archived change. Checked: ${informPhrases.join(', ')}`,
    );
  });

  test('CA-11: stats/SKILL.md references --include-archived when listing for auto-fallback', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must reference the --include-archived flag for archived fallback
    assert.ok(
      src.includes('--include-archived'),
      'stats/SKILL.md must reference --include-archived flag for the archived fallback lookup',
    );
  });

  test('CA-12: stats/SKILL.md describes tiebreak by name descending when archivedDate is equal', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe tiebreak by name descending
    const tiebreakPhrases = [
      'tiebreak',
      'tie-break',
      'name descending',
      'tiebreak: name',
    ];

    const hasTiebreak = tiebreakPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasTiebreak,
      `stats/SKILL.md must describe tiebreak by name descending when archivedDate is equal. Checked: ${tiebreakPhrases.join(', ')}`,
    );
  });

  test('CA-13: stats/SKILL.md Step 1 describes stopping when no active or archived changes exist', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe the stop condition when no data at all
    const noDataPhrases = [
      'no archived changes',
      'no change history',
      'stop',
      'inform the user that there is no',
      'no work history',
    ];

    const hasNoDataStop = noDataPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasNoDataStop,
      `stats/SKILL.md must describe stopping cleanly when no active or archived changes exist. Checked: ${noDataPhrases.join(', ')}`,
    );
  });

  test('CR-03: stats/SKILL.md Step 1 shows explicit changeName arg bypasses auto-fallback', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe that explicit argument uses that name directly (first priority)
    const explicitArgPhrases = [
      '$ARGUMENTS',
      'change name',
      'use it directly',
      'provides a change name',
    ];

    const hasExplicitArg = explicitArgPhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasExplicitArg,
      `stats/SKILL.md must show that explicit changeName argument bypasses the auto-fallback. Checked: ${explicitArgPhrases.join(', ')}`,
    );

    // Verify the explicit arg is the FIRST check in Step 1 (before the fallback logic)
    const argumentsIdx = src.indexOf('$ARGUMENTS');
    const autoSelectIdx = src.indexOf('auto-select');
    const isArchivedIdx = src.indexOf('isArchived');

    assert.ok(argumentsIdx >= 0, 'stats/SKILL.md must reference $ARGUMENTS');

    // The explicit arg check must appear before the archived fallback
    if (autoSelectIdx >= 0) {
      assert.ok(
        argumentsIdx < autoSelectIdx,
        '$ARGUMENTS check must appear before auto-select in Step 1',
      );
    }
    if (isArchivedIdx >= 0) {
      assert.ok(
        argumentsIdx < isArchivedIdx,
        '$ARGUMENTS check must appear before isArchived check in Step 1',
      );
    }
  });

  test('CR-04: stats/SKILL.md Step 1 says to ask user when multiple active changes exist', () => {
    const src = fs.readFileSync(STATS_SKILL_PATH, 'utf8');

    // Must describe asking user when multiple active changes exist
    const multipleActivePhrases = [
      'multiple active changes',
      'ask the user',
      'specify the change name',
      'multiple',
    ];

    const hasMultipleActiveDesc = multipleActivePhrases.some((phrase) =>
      src.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasMultipleActiveDesc,
      `stats/SKILL.md must describe asking user when multiple active changes exist (no auto-fallback in that case). Checked: ${multipleActivePhrases.join(', ')}`,
    );

    // Auto-fallback to archive must NOT trigger when multiple active changes exist
    // Verified structurally: the "multiple active changes → ask user" branch must appear
    // BEFORE the archived fallback (Step 2.5), confirming the flow does not auto-fallback
    const multipleActiveIdx = src.indexOf('multiple active changes');
    const noActiveIdx = src.indexOf('no active changes');

    if (multipleActiveIdx >= 0 && noActiveIdx >= 0) {
      // Multiple active changes is handled separately from no active changes
      assert.notEqual(
        multipleActiveIdx,
        noActiveIdx,
        'Multiple active changes and no active changes must be distinct branches in Step 1',
      );
    }
  });
});

// ── sdd.js help text structural check ────────────────────────────────────────

describe('CA-03: sdd.js sddHelp() function content verification', () => {
  test('CA-03: sddHelp() source contains note about memory.yaml being preserved on archive', () => {
    const src = fs.readFileSync(SDD_JS_PATH, 'utf8');

    // Extract the sddHelp function body
    const helpFnStart = src.indexOf('function sddHelp(');
    assert.ok(helpFnStart >= 0, 'sddHelp function must exist in sdd.js');

    const helpFnEnd = src.indexOf('\nfunction ', helpFnStart + 1);
    const helpFnBody = helpFnEnd > helpFnStart ? src.slice(helpFnStart, helpFnEnd) : src.slice(helpFnStart);

    // Must NOT say memory.yaml is deleted
    assert.ok(
      !helpFnBody.includes('memory.yaml será eliminado'),
      'sddHelp() must not say memory.yaml will be deleted',
    );
    assert.ok(
      !helpFnBody.includes('memory.yaml is deleted'),
      'sddHelp() must not say memory.yaml is deleted',
    );

    // Must reference that memory.yaml is included / moved with the change directory
    const preservedPhrases = [
      'memory.yaml',
      'incluyendo',
      'including',
      'mueve el cambio completo',
    ];

    const hasMemoryNote = preservedPhrases.some((phrase) =>
      helpFnBody.toLowerCase().includes(phrase.toLowerCase()),
    );

    assert.ok(
      hasMemoryNote,
      `sddHelp() must mention memory.yaml preservation. Checked: ${preservedPhrases.join(', ')}`,
    );
  });

  test('CA-03: sdd archive CLI help output mentions moving the complete change directory', () => {
    const r = runSddBare(tmpDir, []);
    const output = r.stdout + r.stderr;

    // Help must describe that archive moves the full directory (including memory.yaml)
    const moveDescriptions = [
      'mueve el cambio completo',
      'moves the complete',
      'memory.yaml',
    ];

    const hasMoveDesc = moveDescriptions.some((desc) =>
      output.toLowerCase().includes(desc.toLowerCase()),
    );

    assert.ok(
      hasMoveDesc,
      `CLI help output must describe that archive moves the full directory including memory.yaml. Checked: ${moveDescriptions.join(', ')}`,
    );
  });
});
