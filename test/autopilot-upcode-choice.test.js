'use strict';

/**
 * Tests for imp-autopilot-upcode-choice
 * Covers: CA-01..CA-10, CR-01..CR-04
 *
 * Strategy: the behavior is specified in skills/autopilot/SKILL.md (LLM-driven).
 * Tests assert on the authoritative SKILL.md text that describes and enforces each criterion.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const autopilotSkillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');

// Read once, share across tests
const skillContent = fs.readFileSync(autopilotSkillPath, 'utf8');

// ── CA-01: Case A message includes the three-option up-code/PR question ─────────

describe('CA-01: Step 0.6 Case A includes the combined up-code/PR three-option question', () => {
  test('SKILL.md Case A section asks about up-code and PR preference', () => {
    // Find Case A section
    const caseAStart = skillContent.indexOf('**Case A');
    assert.ok(caseAStart !== -1, 'SKILL.md must have a Case A section');

    // The Case B heading marks end of Case A section
    const caseBStart = skillContent.indexOf('**Case B', caseAStart);
    assert.ok(caseBStart > caseAStart, 'SKILL.md must have Case B after Case A');

    const caseASection = skillContent.substring(caseAStart, caseBStart);

    // Must contain the up-code/PR question (3-option structure)
    assert.ok(
      caseASection.includes('includeUpCode') || caseASection.includes('up-code'),
      'Case A section must reference up-code choice',
    );
    assert.ok(
      caseASection.includes('createPR') || caseASection.includes('PR'),
      'Case A section must reference PR choice',
    );
  });

  test('SKILL.md Case A lists three options for up-code/PR decision', () => {
    const caseAStart = skillContent.indexOf('**Case A');
    const caseBStart = skillContent.indexOf('**Case B', caseAStart);
    const caseASection = skillContent.substring(caseAStart, caseBStart);

    // Option 1: skip up-code entirely
    assert.ok(
      caseASection.includes('sin up-code') || caseASection.includes('no up-code') || caseASection.includes('skip up-code'),
      'Case A must list "sin up-code"/"no up-code"/"skip up-code" as an option',
    );
    // Option 2: push but no PR
    assert.ok(
      caseASection.includes('sin PR') || caseASection.includes('no PR') || caseASection.includes('solo push'),
      'Case A must list "sin PR"/"no PR"/"solo push" as an option',
    );
    // Option 3: default (up-code + PR)
    assert.ok(
      caseASection.includes('default') || caseASection.includes('includeUpCode = true'),
      'Case A must describe the default option (include up-code and create PR)',
    );
  });

  test('SKILL.md Case A includes three-option question as point 3 in the pre-flight message', () => {
    const caseAStart = skillContent.indexOf('**Case A');
    const caseBStart = skillContent.indexOf('**Case B', caseAStart);
    const caseASection = skillContent.substring(caseAStart, caseBStart);

    // The section must have at least 3 numbered points
    assert.ok(
      caseASection.includes('3. **Up-code') || caseASection.includes('3.') || caseASection.includes('includeUpCode'),
      'Case A must include the up-code/PR question (point 3) in the pre-flight message',
    );
  });
});

// ── CA-02: Case B message includes the three-option up-code/PR question ─────────

describe('CA-02: Step 0.6 Case B includes the combined up-code/PR three-option question', () => {
  test('SKILL.md Case B section asks about up-code and PR preference', () => {
    const caseBStart = skillContent.indexOf('**Case B');
    assert.ok(caseBStart !== -1, 'SKILL.md must have a Case B section');

    // Case B ends at the marker write bash block or the next top-level section
    // Use a generous extraction
    const caseBAnchorEnd = skillContent.indexOf('### Step 0.7', caseBStart);
    assert.ok(caseBAnchorEnd > caseBStart, 'SKILL.md must have Step 0.7 after Case B');
    const caseBSection = skillContent.substring(caseBStart, caseBAnchorEnd);

    assert.ok(
      caseBSection.includes('includeUpCode') || caseBSection.includes('up-code'),
      'Case B section must reference up-code choice',
    );
    assert.ok(
      caseBSection.includes('createPR') || caseBSection.includes('PR'),
      'Case B section must reference PR choice',
    );
  });

  test('SKILL.md Case B lists the same three options as Case A for up-code/PR decision', () => {
    const caseBStart = skillContent.indexOf('**Case B');
    const caseBAnchorEnd = skillContent.indexOf('### Step 0.7', caseBStart);
    const caseBSection = skillContent.substring(caseBStart, caseBAnchorEnd);

    // Option 1: skip up-code
    assert.ok(
      caseBSection.includes('sin up-code') || caseBSection.includes('no up-code') || caseBSection.includes('skip up-code'),
      'Case B must list the no-up-code option',
    );
    // Option 2: push without PR
    assert.ok(
      caseBSection.includes('sin PR') || caseBSection.includes('no PR') || caseBSection.includes('solo push'),
      'Case B must list the no-PR option',
    );
    // Option 3: default
    assert.ok(
      caseBSection.includes('default') || caseBSection.includes('includeUpCode = true'),
      'Case B must describe the default option',
    );
  });

  test('SKILL.md Case B includes two numbered points (task reference + up-code/PR)', () => {
    const caseBStart = skillContent.indexOf('**Case B');
    const caseBAnchorEnd = skillContent.indexOf('### Step 0.7', caseBStart);
    const caseBSection = skillContent.substring(caseBStart, caseBAnchorEnd);

    assert.ok(
      caseBSection.includes('Task reference') || caseBSection.includes('task reference'),
      'Case B must include task reference question',
    );
    assert.ok(
      caseBSection.includes('Up-code') || caseBSection.includes('up-code'),
      'Case B must include up-code question',
    );
  });
});

// ── CA-03: "no up-code"/"sin push"/"skip up-code" → includeUpCode:false and createPR:false ──

describe('CA-03: "no up-code"/"sin push"/"skip up-code" → includeUpCode=false, createPR=false', () => {
  test('SKILL.md maps "no up-code"/"sin up-code" to includeUpCode=false, createPR=false', () => {
    assert.ok(
      skillContent.includes('includeUpCode = false') || skillContent.includes('"includeUpCode":false') || skillContent.includes('includeUpCode=false'),
      'SKILL.md must describe setting includeUpCode=false',
    );
    // Ensure it is associated with createPR=false
    assert.ok(
      skillContent.includes('createPR = false') || skillContent.includes('"createPR":false') || skillContent.includes('createPR=false'),
      'SKILL.md must associate includeUpCode=false with createPR=false',
    );
  });

  test('SKILL.md lists "no up-code" as a signal for skipping up-code', () => {
    assert.ok(
      skillContent.includes('"no up-code"') || skillContent.includes('no up-code'),
      'SKILL.md must list "no up-code" as a recognized skip-up-code signal',
    );
  });

  test('SKILL.md lists "sin push" as a signal for skipping up-code', () => {
    assert.ok(
      skillContent.includes('"sin push"') || skillContent.includes('sin push'),
      'SKILL.md must list "sin push" as a recognized skip-up-code signal',
    );
  });

  test('SKILL.md lists "skip up-code" as a signal for skipping up-code', () => {
    assert.ok(
      skillContent.includes('"skip up-code"') || skillContent.includes('skip up-code'),
      'SKILL.md must list "skip up-code" as a recognized skip-up-code signal',
    );
  });

  test('SKILL.md lists "sin up-code" as a signal for skipping up-code', () => {
    assert.ok(
      skillContent.includes('"sin up-code"') || skillContent.includes('sin up-code'),
      'SKILL.md must list "sin up-code" as a recognized skip-up-code signal',
    );
  });
});

// ── CA-04: No signal → includeUpCode=true, createPR=true (default) ───────────

describe('CA-04: No signal → includeUpCode=true, createPR=true (default)', () => {
  test('SKILL.md states that no recognized signal defaults to includeUpCode=true', () => {
    assert.ok(
      skillContent.includes('includeUpCode = true') || skillContent.includes('includeUpCode=true'),
      'SKILL.md must state includeUpCode=true as the default',
    );
  });

  test('SKILL.md states that no recognized signal defaults to createPR=true', () => {
    assert.ok(
      skillContent.includes('createPR = true') || skillContent.includes('createPR=true') || skillContent.includes('<true|false>'),
      'SKILL.md must state createPR=true as the default (or show it in the marker template)',
    );
  });

  test('SKILL.md describes "No signal" as the default path (any other reply)', () => {
    assert.ok(
      skillContent.includes('No signal') || skillContent.includes('no signal') || skillContent.includes('Any other reply'),
      'SKILL.md must describe "No signal" or "Any other reply" as the default case',
    );
  });
});

// ── CA-04b: "sin PR"/"solo push"/"no PR" → includeUpCode=true, createPR=false ──

describe('CA-04b: "sin PR"/"solo push"/"no PR" → includeUpCode=true, createPR=false', () => {
  test('SKILL.md maps "sin PR"/"no PR" to createPR=false while keeping includeUpCode=true', () => {
    // Find the "sin PR" -> "createPR=false" rule and check it does NOT set includeUpCode=false
    const sinPRIdx = skillContent.indexOf('"sin PR"');
    assert.ok(sinPRIdx !== -1, 'SKILL.md must list "sin PR" as a recognized option');

    // In the context around "sin PR", it should lead to createPR=false but includeUpCode=true
    const contextStart = Math.max(0, sinPRIdx - 100);
    const contextEnd = Math.min(skillContent.length, sinPRIdx + 400);
    const context = skillContent.substring(contextStart, contextEnd);

    assert.ok(
      context.includes('createPR = false') || context.includes('createPR=false'),
      '"sin PR" context must lead to createPR=false',
    );
    assert.ok(
      context.includes('includeUpCode = true') || context.includes('includeUpCode=true'),
      '"sin PR" context must keep includeUpCode=true',
    );
  });

  test('SKILL.md lists "solo push" as an alternative to "sin PR"', () => {
    assert.ok(
      skillContent.includes('"solo push"') || skillContent.includes('solo push'),
      'SKILL.md must list "solo push" as a recognized no-PR option',
    );
  });

  test('SKILL.md lists "without pr" as an alternative to "sin PR"', () => {
    assert.ok(
      skillContent.includes('"without pr"') || skillContent.includes('without pr'),
      'SKILL.md must list "without pr" as a recognized no-PR option',
    );
  });
});

// ── CA-05: includeUpCode=true → Step 5.5 executes /refacil:up-code normally ──

describe('CA-05: includeUpCode=true → Step 5.5 executes /refacil:up-code normally', () => {
  test('SKILL.md Step 5.5 invokes /refacil:up-code when includeUpCode=true', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    assert.ok(step55Idx !== -1, 'SKILL.md must have a Step 5.5 section');

    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('/refacil:up-code'),
      'Step 5.5 must invoke /refacil:up-code when includeUpCode=true',
    );
    assert.ok(
      step55Section.includes('includeUpCode = true') || step55Section.includes('If `includeUpCode = true`'),
      'Step 5.5 must describe the includeUpCode=true path explicitly',
    );
  });

  test('SKILL.md Step 5.5 reads includeUpCode from the marker file', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('marker') || step55Section.includes('autopilot-active'),
      'Step 5.5 must read includeUpCode from the marker file',
    );
  });
});

// ── CA-06: includeUpCode=false → Step 5.5 skips /refacil:up-code, prLink="skipped", continues to Step 7 ──

describe('CA-06: includeUpCode=false → skips /refacil:up-code, prLink="skipped", continues to Step 7', () => {
  test('SKILL.md Step 5.5 skips /refacil:up-code when includeUpCode=false', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    assert.ok(step55Idx !== -1, 'SKILL.md must have a Step 5.5 section');

    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('includeUpCode = false') || step55Section.includes('If `includeUpCode = false`'),
      'Step 5.5 must describe the includeUpCode=false path',
    );
    assert.ok(
      step55Section.includes('skip') && (step55Section.includes('/refacil:up-code') || step55Section.includes('up-code')),
      'Step 5.5 must explicitly skip /refacil:up-code when includeUpCode=false',
    );
  });

  test('SKILL.md Step 5.5 assigns prLink="skipped" when includeUpCode=false', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('"skipped"') || step55Section.includes('prLink = "skipped"') || step55Section.includes("prLink = 'skipped'"),
      'Step 5.5 must assign prLink="skipped" when includeUpCode=false',
    );
  });

  test('SKILL.md Step 5.5 continues to Step 7 (not Step 6) when includeUpCode=false', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('Step 7') || step55Section.includes('Go directly to Step 7'),
      'Step 5.5 must go directly to Step 7 (not Step 6) when includeUpCode=false',
    );
  });

  test('SKILL.md Step 5.5 does not skip Step 7 or Step 8 when includeUpCode=false', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('do NOT skip Steps 7 or 8') ||
      step55Section.includes('do NOT skip Steps 7') ||
      step55Section.includes('Go directly to Step 7') ||
      step55Section.includes('Steps 7 and 8 always execute'),
      'SKILL.md must state that Step 7 and Step 8 still execute when includeUpCode=false',
    );
  });
});

// ── CA-07: Kapso notification fires even when includeUpCode=false ─────────────

describe('CA-07: Kapso notification fires even when includeUpCode=false', () => {
  test('SKILL.md Step 7 states it always executes regardless of includeUpCode', () => {
    const step7Idx = skillContent.indexOf('### Step 7');
    assert.ok(step7Idx !== -1, 'SKILL.md must have a Step 7 section');

    const step8Idx = skillContent.indexOf('### Step 8', step7Idx);
    const step7Section = skillContent.substring(step7Idx, step8Idx > step7Idx ? step8Idx : step7Idx + 1500);

    assert.ok(
      step7Section.includes('always executes') || step7Section.includes('always execute'),
      'Step 7 must state it always executes at the end of the cycle',
    );
  });

  test('SKILL.md rules section states Steps 7 and 8 always execute when includeUpCode=false', () => {
    assert.ok(
      skillContent.includes('includeUpCode` does not block notification') ||
      skillContent.includes('includeUpCode does not block notification') ||
      (skillContent.includes('Steps 7') && skillContent.includes('always execute')),
      'SKILL.md rules must state Steps 7 (Kapso notification) always executes when includeUpCode=false',
    );
  });

  test('SKILL.md Step 7 handles the --pr "skipped" case for the kapso notify success call', () => {
    const step7Idx = skillContent.indexOf('### Step 7');
    const step8Idx = skillContent.indexOf('### Step 8', step7Idx);
    const step7Section = skillContent.substring(step7Idx, step8Idx > step7Idx ? step8Idx : step7Idx + 1500);

    assert.ok(
      step7Section.includes('"skipped"') || step7Section.includes('includeUpCode = false') || step7Section.includes('skipped'),
      'Step 7 must handle --pr "skipped" for the includeUpCode=false case',
    );
  });
});

// ── CA-08: Terminal summary shows "N/A (up-code omitido)" when includeUpCode=false ──

describe('CA-08: Step 8 shows "N/A (up-code omitido)" when includeUpCode=false', () => {
  test('SKILL.md Step 8 prints "N/A (up-code omitido)" in the PR line when includeUpCode=false', () => {
    const step8Idx = skillContent.indexOf('### Step 8');
    assert.ok(step8Idx !== -1, 'SKILL.md must have a Step 8 section');

    // Step 8 is the final section
    const step8Section = skillContent.substring(step8Idx);

    assert.ok(
      step8Section.includes('N/A (up-code omitido)') || step8Section.includes('up-code omitido'),
      'Step 8 must show "N/A (up-code omitido)" in the PR line when includeUpCode=false',
    );
  });

  test('SKILL.md Step 8 PR line has three cases: link, N/A, N/A (up-code omitido)', () => {
    const step8Idx = skillContent.indexOf('### Step 8');
    const step8Section = skillContent.substring(step8Idx);

    // Case 1: actual PR link
    assert.ok(
      step8Section.includes('actual PR link') || step8Section.includes('prLink'),
      'Step 8 PR line must handle the actual PR link case',
    );
    // Case 2: createPR=false (N/A without up-code skip)
    assert.ok(
      step8Section.includes('N/A') || step8Section.includes('createPR = false'),
      'Step 8 PR line must handle the N/A case (createPR=false)',
    );
    // Case 3: includeUpCode=false (N/A with up-code omitido)
    assert.ok(
      step8Section.includes('up-code omitido') || step8Section.includes('includeUpCode = false'),
      'Step 8 PR line must handle the includeUpCode=false case',
    );
  });

  test('SKILL.md Step 8 always executes regardless of includeUpCode', () => {
    const step8Idx = skillContent.indexOf('### Step 8');
    const step8Section = skillContent.substring(step8Idx);

    assert.ok(
      step8Section.includes('always executes') || step8Section.includes('always execute'),
      'Step 8 must always execute at the end of the cycle',
    );
  });
});

// ── CA-09: Resume detection preserves includeUpCode from existing marker ─────

describe('CA-09: Resume detection preserves includeUpCode from existing marker', () => {
  test('SKILL.md Step 0.6 resume detection section references includeUpCode', () => {
    const resumeIdx = skillContent.indexOf('Resume detection');
    assert.ok(resumeIdx !== -1, 'SKILL.md must have a Resume detection section in Step 0.6');

    const resumeContextEnd = Math.min(skillContent.length, resumeIdx + 800);
    const resumeSection = skillContent.substring(resumeIdx, resumeContextEnd);

    assert.ok(
      resumeSection.includes('includeUpCode'),
      'Resume detection must reference includeUpCode as a field that is preserved',
    );
  });

  test('SKILL.md resume detection skips Step 0.6 Case A and B when marker exists', () => {
    const resumeIdx = skillContent.indexOf('Resume detection');
    const resumeContextEnd = Math.min(skillContent.length, resumeIdx + 800);
    const resumeSection = skillContent.substring(resumeIdx, resumeContextEnd);

    assert.ok(
      resumeSection.includes('skip this entire step') || resumeSection.includes('skip') || resumeSection.includes('go directly'),
      'Resume detection must skip Step 0.6 Case A and B when marker already exists',
    );
  });

  test('SKILL.md resume fallback for includeUpCode field treats missing field as true', () => {
    // The spec says: fallback to true if field is missing from older marker
    assert.ok(
      skillContent.includes('fallback to `true`') || skillContent.includes('fallback to true') || skillContent.includes('missing from an older marker'),
      'SKILL.md must describe fallback to true when includeUpCode is missing from an older marker',
    );
  });
});

// ── CA-10: startedAt injection in Step 0.7 preserves includeUpCode ───────────

describe('CA-10: Step 0.7 startedAt injection preserves includeUpCode (JSON.parse+JSON.stringify)', () => {
  test('SKILL.md Step 0.7 uses JSON.parse + JSON.stringify to update the marker', () => {
    const step07Idx = skillContent.indexOf('Step 0.7');
    assert.ok(step07Idx !== -1, 'SKILL.md must have a Step 0.7 section');

    const step1Idx = skillContent.indexOf('### Step 1', step07Idx);
    const step07Section = skillContent.substring(step07Idx, step1Idx > step07Idx ? step1Idx : step07Idx + 1500);

    assert.ok(
      step07Section.includes('JSON.parse') && step07Section.includes('JSON.stringify'),
      'Step 0.7 must use JSON.parse + JSON.stringify to update the marker (preserving all fields)',
    );
  });

  test('SKILL.md Step 0.7 node command preserves all existing marker fields', () => {
    const step07Idx = skillContent.indexOf('Step 0.7');
    const step1Idx = skillContent.indexOf('### Step 1', step07Idx);
    const step07Section = skillContent.substring(step07Idx, step1Idx > step07Idx ? step1Idx : step07Idx + 1500);

    // The node snippet reads the file, adds startedAt, and writes back — preserving all fields
    assert.ok(
      step07Section.includes('readFileSync') && step07Section.includes('writeFileSync'),
      'Step 0.7 node command must read and write the marker file (preserving fields)',
    );
    assert.ok(
      step07Section.includes('startedAt'),
      'Step 0.7 must inject startedAt into the marker',
    );
  });

  test('SKILL.md Step 0.7 preservation note mentions includeUpCode by name', () => {
    const step07Idx = skillContent.indexOf('Step 0.7');
    const step1Idx = skillContent.indexOf('### Step 1', step07Idx);
    const step07Section = skillContent.substring(step07Idx, step1Idx > step07Idx ? step1Idx : step07Idx + 1500);

    assert.ok(
      step07Section.includes('includeUpCode'),
      'Step 0.7 must mention includeUpCode as a field preserved by the JSON.parse+JSON.stringify update',
    );
  });

  test('SKILL.md marker write template includes includeUpCode field', () => {
    // Check that the printf template in Case A and/or B includes includeUpCode
    assert.ok(
      skillContent.includes('<true|false>" \\') || skillContent.includes('includeUpCode>') || skillContent.includes('<true|false>'),
      'SKILL.md marker write template must include a value for includeUpCode',
    );
    // The marker JSON structure shows includeUpCode field
    assert.ok(
      skillContent.includes('"includeUpCode"') || skillContent.includes('includeUpCode:'),
      'SKILL.md must include "includeUpCode" field in the marker JSON template or example',
    );
  });
});

// ── CR-01: Ambiguous user input → default includeUpCode=true, createPR=true ──

describe('CR-01: Ambiguous user input → default includeUpCode=true, createPR=true, no extra clarification', () => {
  test('SKILL.md treats unrecognizable input as the default (includeUpCode=true, createPR=true)', () => {
    assert.ok(
      skillContent.includes('Unrecognizable') || skillContent.includes('No signal'),
      'SKILL.md must handle unrecognizable/no-signal input',
    );
    // The default path must yield includeUpCode=true
    assert.ok(
      skillContent.includes('includeUpCode = true') && skillContent.includes('createPR = true'),
      'SKILL.md must default to includeUpCode=true and createPR=true when no signal is present',
    );
  });

  test('SKILL.md does not request extra clarification for ambiguous up-code/PR input', () => {
    // The entire Step 0.6 flow must be "one message one reply" — no extra clarification request
    const step06Idx = skillContent.indexOf('Step 0.6');
    assert.ok(step06Idx !== -1, 'SKILL.md must have a Step 0.6 section');

    const step07Idx = skillContent.indexOf('### Step 0.7', step06Idx);
    const step06Section = skillContent.substring(step06Idx, step07Idx > step06Idx ? step07Idx : step06Idx + 5000);

    assert.ok(
      step06Section.includes('one message and one reply') || step06Section.includes('one reply'),
      'Step 0.6 must collect all user input in one message and one reply (no extra clarification)',
    );
  });
});

// ── CR-02: includeUpCode=false does not trigger phase failure ─────────────────

describe('CR-02: includeUpCode=false does not trigger phase failure (no warnings[], no Step 6)', () => {
  test('SKILL.md Step 5.5 skip path does NOT call Step 6 failure handler', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    // The includeUpCode=false path must go to Step 7, NOT Step 6
    const falsePathIdx = step55Section.indexOf('includeUpCode = false');
    assert.ok(falsePathIdx !== -1, 'Step 5.5 must have an includeUpCode=false branch');

    const falsePathContext = step55Section.substring(falsePathIdx, Math.min(step55Section.length, falsePathIdx + 400));
    // Must say "Step 7" not "Step 6" in the false-path context
    assert.ok(
      falsePathContext.includes('Step 7') || falsePathContext.includes('directly to Step 7'),
      'includeUpCode=false path in Step 5.5 must go to Step 7, not Step 6',
    );
    assert.equal(
      falsePathContext.includes('Step 6'),
      false,
      'includeUpCode=false path in Step 5.5 must NOT reference Step 6 (failure handler)',
    );
  });

  test('SKILL.md rules section states includeUpCode does not block notification (not a failure)', () => {
    assert.ok(
      skillContent.includes('includeUpCode` does not block notification') ||
      skillContent.includes('includeUpCode does not block notification') ||
      skillContent.includes('Setting `includeUpCode = false` only skips'),
      'SKILL.md rules must explicitly state includeUpCode=false is not a failure scenario',
    );
  });
});

// ── CR-03: includeUpCode=true and up-code fails → triggers Step 6 failure ─────

describe('CR-03: includeUpCode=true and up-code fails → triggers Step 6 phase failure', () => {
  test('SKILL.md Step 5.5 includes "If push fails → phase failure, go to Step 6" for includeUpCode=true', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('push fails') || step55Section.includes('If push fails'),
      'Step 5.5 must describe what happens when push fails',
    );
    assert.ok(
      step55Section.includes('Step 6') || step55Section.includes('phase: up-code'),
      'Step 5.5 must trigger Step 6 failure when push fails (includeUpCode=true path)',
    );
  });

  test('SKILL.md Step 5.5 push-fail path goes to Step 6 (not Step 7)', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    const pushFailIdx = step55Section.indexOf('push fails');
    assert.ok(pushFailIdx !== -1, 'Step 5.5 must describe push failure scenario');

    const pushFailContext = step55Section.substring(pushFailIdx, Math.min(step55Section.length, pushFailIdx + 200));
    assert.ok(
      pushFailContext.includes('Step 6') || pushFailContext.includes('failure'),
      'Push failure path must reference Step 6 or phase failure',
    );
  });
});

// ── CR-04: Marker without includeUpCode → defaults to true ───────────────────

describe('CR-04: Marker without includeUpCode field → defaults to true', () => {
  test('SKILL.md explicitly states that missing includeUpCode in an older marker defaults to true', () => {
    assert.ok(
      skillContent.includes('missing from an older marker') ||
      skillContent.includes('fallback to `true` if the field is missing') ||
      skillContent.includes('field is missing'),
      'SKILL.md must describe the fallback to true when includeUpCode is absent from the marker',
    );
  });

  test('SKILL.md Step 5.5 handles missing includeUpCode field from marker', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    assert.ok(
      step55Section.includes('missing') || step55Section.includes('treat it as `true`') || step55Section.includes('treat it as true'),
      'Step 5.5 must handle missing includeUpCode (treat as true)',
    );
  });

  test('SKILL.md marker read instruction in Step 5.5 mentions the fallback for missing field', () => {
    const step55Idx = skillContent.indexOf('Step 5.5');
    assert.ok(step55Idx !== -1, 'SKILL.md must have a Step 5.5 section');

    const step6Idx = skillContent.indexOf('### Step 6', step55Idx);
    const step55Section = skillContent.substring(step55Idx, step6Idx > step55Idx ? step6Idx : step55Idx + 1500);

    // The read instruction should explicitly handle the missing-field case
    assert.ok(
      step55Section.includes('If the field is missing') || step55Section.includes('field is missing'),
      'Step 5.5 must explicitly handle the missing includeUpCode field case',
    );
  });
});
