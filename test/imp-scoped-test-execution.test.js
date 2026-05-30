'use strict';

/**
 * Tests for the imp-scoped-test-execution change.
 * Verifies:
 *   (a) CodeGraph block byte-for-byte equality between investigator.md (canonical)
 *       and each of the 5 literal-copy agents: proposer, implementer, tester,
 *       validator, auditor.
 *   (b) Debugger: common subsections aligned + "investigation mode only" present.
 *   (c) implementer.md contains git diff/status AND test-scope references.
 *   (d) apply/SKILL.md contains codegraph status + codegraphAvailable + no blocking gate.
 *   (e) Absence of --testPathPattern in apply/SKILL.md and implementer.md.
 *   (f) Full-suite responsibility statement present in test/SKILL.md.
 *   (g) testScope savings: 1-file subset returns fewer test files than full set (>=2).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ── Agent paths ──
const INVESTIGATOR_MD = path.join(ROOT, 'agents', 'investigator.md');
const IMPLEMENTER_MD  = path.join(ROOT, 'agents', 'implementer.md');
const TESTER_MD       = path.join(ROOT, 'agents', 'tester.md');
const PROPOSER_MD     = path.join(ROOT, 'agents', 'proposer.md');
const VALIDATOR_MD    = path.join(ROOT, 'agents', 'validator.md');
const AUDITOR_MD      = path.join(ROOT, 'agents', 'auditor.md');
const DEBUGGER_MD     = path.join(ROOT, 'agents', 'debugger.md');

// ── Skill paths ──
const APPLY_SKILL = path.join(ROOT, 'skills', 'apply', 'SKILL.md');
const TEST_SKILL  = path.join(ROOT, 'skills', 'test',  'SKILL.md');

// ── Helpers ──
function readNorm(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Extract the ## CodeGraph integration block from an agent .md file.
 * Returns the block text (normalized line endings, trimmed), or null if not found.
 * The block ends at the next ## heading or EOF.
 */
function extractCodeGraphBlock(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const start = normalized.indexOf('\n## CodeGraph integration');
  if (start === -1) return null;
  // Find the next ## heading after the block start
  const afterStart = normalized.indexOf('\n## ', start + 1);
  const blockEnd = afterStart === -1 ? normalized.length : afterStart;
  return normalized.slice(start, blockEnd).trim();
}

// ════════════════════════════════════════════════════════════
// (a) Byte-for-byte CodeGraph block equality with investigator.md (canonical)
// ════════════════════════════════════════════════════════════

const CANONICAL_AGENTS = [
  { label: 'proposer.md',    filePath: PROPOSER_MD },
  { label: 'implementer.md', filePath: IMPLEMENTER_MD },
  { label: 'tester.md',      filePath: TESTER_MD },
  { label: 'validator.md',   filePath: VALIDATOR_MD },
  { label: 'auditor.md',     filePath: AUDITOR_MD },
];

const canonicalBlock = extractCodeGraphBlock(readNorm(INVESTIGATOR_MD));

test('canonical CodeGraph block exists in investigator.md', () => {
  assert.ok(
    canonicalBlock !== null && canonicalBlock.length > 100,
    'investigator.md MUST contain a ## CodeGraph integration block',
  );
});

for (const agent of CANONICAL_AGENTS) {
  test(`(a) ${agent.label} CodeGraph block matches investigator.md byte-for-byte`, () => {
    const content = readNorm(agent.filePath);
    const block = extractCodeGraphBlock(content);
    assert.ok(
      block !== null,
      `${agent.label} MUST contain a ## CodeGraph integration block`,
    );
    assert.strictEqual(
      block,
      canonicalBlock,
      `${agent.label} CodeGraph block MUST be byte-for-byte identical to investigator.md (canonical)`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// (b) Debugger: common subsections aligned + "investigation mode only" present
// ════════════════════════════════════════════════════════════

/**
 * Extract common subsections from a CodeGraph block using line-anchored splitting.
 * Splits on lines that start with "**" (bold heading markers) so boundary detection
 * is not sensitive to the exact heading text or trailing punctuation variations.
 *
 * Sections extracted:
 *   - "When to use CodeGraph" paragraph (lines up to the next bold heading)
 *   - "When to use Grep/Read directly" paragraph
 *   - "Decision rule" line
 *   - "Fallback" opening line
 *
 * Returns an object with each subsection text (normalized, trimmed), or null if
 * the block itself is null.
 */
function extractCommonSubsections(block) {
  if (!block) return null;

  // Split into logical paragraphs delimited by lines that start with "**"
  // Each paragraph starts at a bold-heading line and runs until the next one.
  const lines = block.split('\n');
  const paragraphs = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('**')) {
      if (current !== null) paragraphs.push(current.trim());
      current = line;
    } else {
      if (current !== null) current += '\n' + line;
    }
  }
  if (current !== null) paragraphs.push(current.trim());

  // Locate paragraphs by their heading prefix (case-insensitive, prefix match)
  function findParagraph(prefix) {
    return paragraphs.find((p) => p.toLowerCase().startsWith(prefix.toLowerCase())) || null;
  }

  return {
    whenCodeGraph: findParagraph('**When to use CodeGraph'),
    whenGrep:      findParagraph('**When to use Grep/Read directly'),
    decisionRule:  findParagraph('**Decision rule:'),
    fallbackOpening: findParagraph('**Fallback:'),
  };
}

test('(b) debugger.md CodeGraph block has "investigation mode only" restriction', () => {
  const content = readNorm(DEBUGGER_MD);
  const block = extractCodeGraphBlock(content);
  assert.ok(block !== null, 'debugger.md MUST contain a ## CodeGraph integration block');
  assert.ok(
    block.includes('investigation mode only') || block.includes('mode=investigation'),
    'debugger.md CodeGraph block MUST include "investigation mode only" restriction',
  );
});

test('(b) debugger.md common CodeGraph subsections match canonical', () => {
  const debuggerContent = readNorm(DEBUGGER_MD);
  const debuggerBlock = extractCodeGraphBlock(debuggerContent);
  assert.ok(debuggerBlock !== null, 'debugger.md MUST have a CodeGraph block');

  const canonicalSubs = extractCommonSubsections(canonicalBlock);
  const debuggerSubs = extractCommonSubsections(debuggerBlock);

  assert.ok(canonicalSubs !== null && debuggerSubs !== null, 'Both blocks must be parseable');

  // "When to use CodeGraph" section must match
  assert.strictEqual(
    debuggerSubs.whenCodeGraph,
    canonicalSubs.whenCodeGraph,
    'debugger.md "When to use CodeGraph" subsection MUST match canonical',
  );

  // Decision rule must match
  assert.strictEqual(
    debuggerSubs.decisionRule,
    canonicalSubs.decisionRule,
    'debugger.md "Decision rule" MUST match canonical',
  );

  // "When to use Grep/Read directly" section must match canonical
  assert.strictEqual(
    debuggerSubs.whenGrep,
    canonicalSubs.whenGrep,
    'debugger.md "When to use Grep/Read directly" subsection MUST match canonical',
  );
});

// ════════════════════════════════════════════════════════════
// (c) implementer.md contains git diff/status AND test-scope
// ════════════════════════════════════════════════════════════

test('(c) implementer.md contains git diff or git status reference', () => {
  const content = readNorm(IMPLEMENTER_MD);
  assert.ok(
    content.includes('git diff') || content.includes('git status'),
    'implementer.md MUST contain "git diff" or "git status" for dynamic smoke detection',
  );
});

test('(c) implementer.md contains test-scope reference', () => {
  const content = readNorm(IMPLEMENTER_MD);
  assert.ok(
    content.includes('test-scope'),
    'implementer.md MUST contain "test-scope" for dynamic smoke command derivation',
  );
});

// ════════════════════════════════════════════════════════════
// (d) apply/SKILL.md contains codegraph status + codegraphAvailable + no blocking gate
// ════════════════════════════════════════════════════════════

test('(d) apply/SKILL.md contains "codegraph status"', () => {
  const content = readNorm(APPLY_SKILL);
  assert.ok(
    content.includes('codegraph status'),
    'apply/SKILL.md MUST contain "codegraph status" for non-blocking detection',
  );
});

test('(d) apply/SKILL.md contains "codegraphAvailable"', () => {
  const content = readNorm(APPLY_SKILL);
  assert.ok(
    content.includes('codegraphAvailable'),
    'apply/SKILL.md MUST contain "codegraphAvailable" field',
  );
});

test('(d) apply/SKILL.md has "codegraphAvailable" inside the fenced BRIEFING template block', () => {
  const content = readNorm(APPLY_SKILL);
  // Extract the fenced BRIEFING block: starts with ```\nBRIEFING: and ends with the closing ```
  const briefingFenceStart = content.indexOf('```\nBRIEFING:');
  assert.ok(
    briefingFenceStart !== -1,
    'apply/SKILL.md MUST contain a fenced BRIEFING template block (```\\nBRIEFING:)',
  );
  const fenceClose = content.indexOf('\n```', briefingFenceStart + 1);
  assert.ok(
    fenceClose !== -1,
    'apply/SKILL.md BRIEFING template block MUST have a closing ```',
  );
  const briefingBlock = content.slice(briefingFenceStart, fenceClose);
  assert.ok(
    briefingBlock.includes('codegraphAvailable'),
    'apply/SKILL.md BRIEFING template block MUST include the "codegraphAvailable" field',
  );
});

test('(d) apply/SKILL.md does NOT contain blocking gate text for CodeGraph', () => {
  const content = readNorm(APPLY_SKILL);
  // The CodeGraph detection in apply MUST be non-blocking.
  // Check that the skill does not instruct to stop/pause/gate on CodeGraph availability.
  // Pattern: "STOP" near "CodeGraph" or "index", or explicit gate language in that context.
  const blockingPatterns = [
    'STOP and wait',
    'stop and wait',
    'STOP — wait',
    'pause and ask',
    'Do not continue until the index',
    'do not continue until the index',
    'wait until CodeGraph',
    'gate on CodeGraph',
  ];
  for (const pattern of blockingPatterns) {
    assert.ok(
      !content.includes(pattern),
      `apply/SKILL.md MUST NOT contain blocking gate text for CodeGraph: "${pattern}"`,
    );
  }
  // Also assert the non-blocking language IS present
  assert.ok(
    content.includes('non-blocking') || content.includes('continue silently') || content.includes('NOT interrupt') || content.includes('not interrupt'),
    'apply/SKILL.md MUST contain non-blocking language for CodeGraph detection',
  );
});

// ════════════════════════════════════════════════════════════
// (e) Absence of --testPathPattern in apply/SKILL.md and implementer.md
// ════════════════════════════════════════════════════════════

test('(e) apply/SKILL.md does NOT contain --testPathPattern', () => {
  const content = readNorm(APPLY_SKILL);
  assert.ok(
    !content.includes('--testPathPattern'),
    'apply/SKILL.md MUST NOT contain --testPathPattern (stack-specific flag)',
  );
});

test('(e) implementer.md does NOT contain --testPathPattern', () => {
  const content = readNorm(IMPLEMENTER_MD);
  assert.ok(
    !content.includes('--testPathPattern'),
    'implementer.md MUST NOT contain --testPathPattern (stack-specific flag)',
  );
});

// ════════════════════════════════════════════════════════════
// (f) Full-suite responsibility statement present in test/SKILL.md
// ════════════════════════════════════════════════════════════

test('(f) test/SKILL.md contains full-suite responsibility statement', () => {
  const content = readNorm(TEST_SKILL);
  const hasStatement =
    content.includes('full scoped run') ||
    content.includes('full-suite') ||
    content.includes('full suite') ||
    content.includes('canonical test phase') ||
    (content.includes('coverage') && content.includes('/refacil:apply'));
  assert.ok(
    hasStatement,
    'test/SKILL.md MUST contain a statement differentiating its full-suite+coverage responsibility from apply\'s dynamic smoke',
  );
});

test('(f) test/SKILL.md differentiates from apply smoke', () => {
  const content = readNorm(TEST_SKILL);
  // Must mention that /refacil:test is the canonical test phase with coverage
  assert.ok(
    content.includes('coverage') && content.includes('smoke'),
    'test/SKILL.md MUST contrast its coverage responsibility with the apply-time smoke',
  );
});

// ════════════════════════════════════════════════════════════
// (g) testScope savings: 1-file subset vs full set
// ════════════════════════════════════════════════════════════

const { testScope } = require('../lib/test-scope');

test('(g) testScope: 1-file subset returns fewer test files than full set (>=2 files)', () => {
  // Create a temp fixture directory with >=2 .js files and matching test files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-test-scope-'));
  const libDir = path.join(tmpDir, 'lib');
  const testDir = path.join(tmpDir, 'test');
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(testDir, { recursive: true });

  // Create a package.json to make detectStack return 'node'
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'fixture' }));

  // Create 2 source files
  fs.writeFileSync(path.join(libDir, 'alpha.js'), "'use strict';\nmodule.exports = {};");
  fs.writeFileSync(path.join(libDir, 'beta.js'), "'use strict';\nmodule.exports = {};");

  // Create matching test files
  fs.writeFileSync(
    path.join(testDir, 'alpha.test.js'),
    "'use strict';\nconst assert = require('node:assert');\n",
  );
  fs.writeFileSync(
    path.join(testDir, 'beta.test.js'),
    "'use strict';\nconst assert = require('node:assert');\n",
  );

  const baseline = 'node --test --test-concurrency=1';

  // 1-file subset: only alpha.js
  const singleResult = testScope({
    files: [path.join(libDir, 'alpha.js')],
    baseline,
    projectRoot: tmpDir,
  });

  // Full set: both alpha.js and beta.js
  const fullResult = testScope({
    files: [path.join(libDir, 'alpha.js'), path.join(libDir, 'beta.js')],
    baseline,
    projectRoot: tmpDir,
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Assert: single file did not fallback
  assert.strictEqual(
    singleResult.fallback,
    false,
    'testScope with 1 source file MUST NOT fallback (test file exists by convention)',
  );

  // Assert: full set did not fallback
  assert.strictEqual(
    fullResult.fallback,
    false,
    'testScope with 2 source files MUST NOT fallback (test files exist by convention)',
  );

  // Assert: single file result has exactly 1 test file
  assert.strictEqual(
    singleResult.files.length,
    1,
    `testScope(1 file) MUST reference exactly 1 spec (got ${singleResult.files.length})`,
  );

  // Assert: full set has >= 2 test files
  assert.ok(
    fullResult.files.length >= 2,
    `testScope(2 files) MUST reference at least 2 specs (got ${fullResult.files.length})`,
  );

  // Assert: single file subset is strictly fewer than full set
  assert.ok(
    singleResult.files.length < fullResult.files.length,
    `testScope(1 file) MUST reference strictly fewer specs than testScope(2 files): ` +
    `got ${singleResult.files.length} vs ${fullResult.files.length}`,
  );
});

// ════════════════════════════════════════════════════════════
// CA-01 / CR-02: apply/SKILL.md BRIEFING has testBaselineCommand, NO smokeTestCommand
// ════════════════════════════════════════════════════════════

test('(CA-01/CR-02) apply/SKILL.md BRIEFING block contains testBaselineCommand', () => {
  const content = readNorm(APPLY_SKILL);
  // Locate the BRIEFING fenced block
  const briefingFenceStart = content.indexOf('```\nBRIEFING:');
  assert.ok(briefingFenceStart !== -1, 'apply/SKILL.md MUST contain a fenced BRIEFING block');
  const fenceClose = content.indexOf('\n```', briefingFenceStart + 1);
  const briefingBlock = content.slice(briefingFenceStart, fenceClose);
  assert.ok(
    briefingBlock.includes('testBaselineCommand'),
    'apply/SKILL.md BRIEFING block MUST contain "testBaselineCommand" field',
  );
});

test('(CA-01/CR-02) apply/SKILL.md BRIEFING block does NOT contain smokeTestCommand', () => {
  const content = readNorm(APPLY_SKILL);
  const briefingFenceStart = content.indexOf('```\nBRIEFING:');
  assert.ok(briefingFenceStart !== -1, 'apply/SKILL.md MUST contain a fenced BRIEFING block');
  const fenceClose = content.indexOf('\n```', briefingFenceStart + 1);
  const briefingBlock = content.slice(briefingFenceStart, fenceClose);
  assert.ok(
    !briefingBlock.includes('smokeTestCommand'),
    'apply/SKILL.md BRIEFING block MUST NOT contain a precomputed "smokeTestCommand" field',
  );
});

// ════════════════════════════════════════════════════════════
// CA-03: implementer.md documents fallback to testBaselineCommand
// ════════════════════════════════════════════════════════════

test('(CA-03) implementer.md documents fallback to testBaselineCommand when diff empty / unknown / fallback:true', () => {
  const content = readNorm(IMPLEMENTER_MD);
  // The smoke section must mention fallback scenarios
  assert.ok(
    content.includes('fallback'),
    'implementer.md MUST document fallback behavior in the smoke section',
  );
  assert.ok(
    content.includes('empty') || content.includes('fallback: true') || content.includes('fallback:true'),
    'implementer.md MUST document fallback triggers (empty diff or fallback:true)',
  );
  assert.ok(
    content.includes('testBaselineCommand'),
    'implementer.md MUST reference testBaselineCommand as the fallback command',
  );
});

// ════════════════════════════════════════════════════════════
// CA-04: implementer.md smoke is explicitly smoke-only, NOT a replacement for /refacil:test
// ════════════════════════════════════════════════════════════

test('(CA-04) implementer.md states smoke does NOT replace /refacil:test', () => {
  const content = readNorm(IMPLEMENTER_MD);
  assert.ok(
    content.includes('does NOT replace') || content.includes('does not replace'),
    'implementer.md MUST state the smoke verification does NOT replace /refacil:test',
  );
  assert.ok(
    content.includes('/refacil:test'),
    'implementer.md smoke section MUST reference /refacil:test as the canonical suite',
  );
});

// ════════════════════════════════════════════════════════════
// CA-10: test/SKILL.md detects and passes codegraphAvailable to tester BRIEFING
// ════════════════════════════════════════════════════════════

test('(CA-10) test/SKILL.md detects CodeGraph and includes codegraphAvailable in BRIEFING', () => {
  const content = readNorm(TEST_SKILL);
  assert.ok(
    content.includes('codegraphAvailable'),
    'test/SKILL.md MUST include "codegraphAvailable" in the BRIEFING it passes to the tester',
  );
  assert.ok(
    content.includes('codegraph status') || content.includes('codegraph_status') || content.includes('codegraph'),
    'test/SKILL.md MUST detect CodeGraph availability before delegating',
  );
});

// ════════════════════════════════════════════════════════════
// CA-14: implementer.md smoke section has no hardcoded concrete runners
// ════════════════════════════════════════════════════════════

test('(CA-14) implementer.md smoke section does NOT hardcode concrete test runners', () => {
  const content = readNorm(IMPLEMENTER_MD);
  // Locate the smoke/verification section — Step 4
  const step4Start = content.indexOf('### Step 4:');
  const step4End   = content.indexOf('\n### Step ', step4Start + 1);
  assert.ok(step4Start !== -1, 'implementer.md MUST contain a Step 4 (smoke verification)');
  const smokeSection = step4End === -1
    ? content.slice(step4Start)
    : content.slice(step4Start, step4End);

  const hardcodedRunners = ['jest ', 'pytest ', 'go test', 'cargo test', 'dotnet test'];
  for (const runner of hardcodedRunners) {
    assert.ok(
      !smokeSection.includes(runner),
      `implementer.md Step 4 smoke section MUST NOT hardcode concrete runner "${runner}" — it must delegate to sdd test-scope`,
    );
  }
});

// ════════════════════════════════════════════════════════════
// CR-03: test/SKILL.md does NOT remove/deprecate testScope: full
// ════════════════════════════════════════════════════════════

test('(CR-03) test/SKILL.md does NOT remove or deprecate testScope: full', () => {
  const content = readNorm(TEST_SKILL);
  // The skill must still support full-suite mode
  assert.ok(
    content.includes('testScope: full') || content.includes("testScope:'full'") || content.includes('full suite') || content.includes('full-suite'),
    'test/SKILL.md MUST still reference testScope: full (must not remove/deprecate it)',
  );
  // It must not say "deprecated" or "removed" near "full"
  const fullIdx = content.toLowerCase().indexOf('full');
  assert.ok(
    fullIdx !== -1,
    'test/SKILL.md MUST contain "full" mode reference',
  );
  const vicinity = content.slice(Math.max(0, fullIdx - 100), fullIdx + 100).toLowerCase();
  assert.ok(
    !vicinity.includes('deprecated') && !vicinity.includes('removed'),
    'test/SKILL.md MUST NOT deprecate or remove testScope: full near the "full" reference',
  );
});

// ════════════════════════════════════════════════════════════
// CR-04: implementer.md CodeGraph restriction is ONLY codegraphAvailable:false
//         (no debugger "fix mode" restriction in implementer)
// ════════════════════════════════════════════════════════════

test('(CR-04) implementer.md CodeGraph "Do not use" is limited to codegraphAvailable: false only', () => {
  const content = readNorm(IMPLEMENTER_MD);
  const block = extractCodeGraphBlock(content);
  assert.ok(block !== null, 'implementer.md MUST have a CodeGraph block');
  // The restriction must only reference codegraphAvailable: false
  assert.ok(
    block.includes('codegraphAvailable') && (block.includes('codegraphAvailable: false') || block.includes('codegraphAvailable:false')),
    'implementer.md CodeGraph block MUST say "Do not use" applies when codegraphAvailable: false',
  );
  // Must NOT contain any restriction referencing "fix mode" or "debug mode" (that is debugger-specific)
  assert.ok(
    !block.includes('fix mode') && !block.includes('mode=fix') && !block.includes('debug mode'),
    'implementer.md CodeGraph block MUST NOT contain debugger-specific fix-mode restriction',
  );
});

// ════════════════════════════════════════════════════════════
// HARDENING-1: CA-01/CA-08 — apply/SKILL.md Step 1.5a prose sets codegraphAvailable
// ════════════════════════════════════════════════════════════

test('(HARDENING-1/CA-01/CA-08) apply/SKILL.md Step 1.5a prose derives and sets codegraphAvailable', () => {
  const content = readNorm(APPLY_SKILL);
  const stepStart = content.indexOf('### Step 1.5a:');
  assert.ok(stepStart !== -1, 'apply/SKILL.md MUST contain Step 1.5a for CodeGraph detection');
  const stepEnd = content.indexOf('\n### ', stepStart + 1);
  const stepSection = stepEnd === -1 ? content.slice(stepStart) : content.slice(stepStart, stepEnd);
  assert.ok(
    stepSection.includes('codegraphAvailable'),
    'apply/SKILL.md Step 1.5a prose MUST set/derive the "codegraphAvailable" variable (not only in the BRIEFING block)',
  );
  assert.ok(
    stepSection.includes('codegraph status'),
    'apply/SKILL.md Step 1.5a MUST reference "codegraph status" as the detection command',
  );
});

// ════════════════════════════════════════════════════════════
// HARDENING-2: CA-03/CR-01 — implementer.md Step 4 names testBaselineCommand as fallback target
// ════════════════════════════════════════════════════════════

test('(HARDENING-2/CA-03/CR-01) implementer.md Step 4 references testBaselineCommand and the new skip/defer behavior', () => {
  const content = readNorm(IMPLEMENTER_MD);
  const step4Start = content.indexOf('### Step 4:');
  assert.ok(step4Start !== -1, 'implementer.md MUST contain Step 4');
  const step4End = content.indexOf('\n### Step ', step4Start + 1);
  const smokeSection = step4End === -1 ? content.slice(step4Start) : content.slice(step4Start, step4End);
  // Must reference testBaselineCommand in Step 4 (as the project baseline command)
  assert.ok(
    smokeSection.includes('testBaselineCommand'),
    'implementer.md Step 4 MUST reference testBaselineCommand',
  );
  // Must describe skip/defer behavior (never the full baseline as fallback)
  assert.ok(
    smokeSection.includes('SKIP') || smokeSection.includes('NEVER') || smokeSection.includes('deferred'),
    'implementer.md Step 4 MUST describe skip/defer behavior for the fallback case (never full baseline)',
  );
});

// ════════════════════════════════════════════════════════════
// HARDENING-3: CR-04 structural — implementer.md CodeGraph block sentence
// ════════════════════════════════════════════════════════════

test('(HARDENING-3/CR-04) implementer.md CodeGraph block has structural "Do not use CodeGraph ... codegraphAvailable: false" sentence', () => {
  const content = readNorm(IMPLEMENTER_MD);
  const block = extractCodeGraphBlock(content);
  assert.ok(block !== null, 'implementer.md MUST have a CodeGraph block');
  const hasDoNotUse =
    block.includes('Do not use CodeGraph') || block.includes('do not use CodeGraph');
  const hasFalseCondition =
    block.includes('codegraphAvailable: false') || block.includes('codegraphAvailable:false');
  assert.ok(
    hasDoNotUse && hasFalseCondition,
    'implementer.md CodeGraph block MUST pair "Do not use CodeGraph" with "codegraphAvailable: false" as a restriction sentence',
  );
  // Both phrases must appear close together (within 200 chars) to confirm structural proximity
  const doNotIdx = block.indexOf('Do not use CodeGraph');
  const falseIdx = block.indexOf('codegraphAvailable: false');
  if (doNotIdx !== -1 && falseIdx !== -1) {
    assert.ok(
      Math.abs(doNotIdx - falseIdx) < 200,
      `"Do not use CodeGraph" and "codegraphAvailable: false" MUST be within 200 chars of each other in implementer.md CodeGraph block (found ${Math.abs(doNotIdx - falseIdx)} chars apart)`,
    );
  }
});

// ════════════════════════════════════════════════════════════
// HARDENING-4: CR-06 — apply/SKILL.md Step 1.5a does NOT contain "GATE"
// ════════════════════════════════════════════════════════════

test('(HARDENING-4/CR-06) apply/SKILL.md Step 1.5a does NOT contain the word "GATE"', () => {
  const content = readNorm(APPLY_SKILL);
  const stepStart = content.indexOf('### Step 1.5a:');
  assert.ok(stepStart !== -1, 'apply/SKILL.md MUST contain Step 1.5a');
  const stepEnd = content.indexOf('\n### ', stepStart + 1);
  const stepSection = stepEnd === -1 ? content.slice(stepStart) : content.slice(stepStart, stepEnd);
  assert.ok(
    !stepSection.includes('GATE'),
    'apply/SKILL.md Step 1.5a MUST NOT contain "GATE" — CodeGraph detection is non-blocking and must not trigger the gate protocol',
  );
});

// ════════════════════════════════════════════════════════════
// HARDENING-5: CA-11/CR-08 drift guard — canonical block minimum length
// ════════════════════════════════════════════════════════════

test('(HARDENING-5/CA-11/CR-08) canonical CodeGraph block in investigator.md is at least 400 chars (drift guard)', () => {
  assert.ok(
    canonicalBlock !== null,
    'investigator.md canonical CodeGraph block MUST exist',
  );
  assert.ok(
    canonicalBlock.length >= 400,
    `Canonical CodeGraph block is suspiciously short (${canonicalBlock.length} chars) — may have been reduced to a trivial stub. Expected >= 400 chars.`,
  );
});
