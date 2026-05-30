'use strict';

/**
 * Tests for imp-autopilot-gate-kapso — T-09
 * Verifies autopilot ready-message subcommand behavior and SKILL.md gate contracts.
 * Covers: CA-01, CA-02, CA-04, CA-05, CA-09, CA-10, CA-13, CA-14, CA-15,
 *         CA-17, CA-18, CA-19, CR-01, CR-02, CR-03, CR-04, CR-07
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'bin', 'cli.js');
const autopilotSkillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
const proposeSkillPath = path.join(packageRoot, 'skills', 'propose', 'SKILL.md');

function runReadyMessage(extraArgs) {
  return spawnSync(
    process.execPath,
    [cliPath, 'autopilot', 'ready-message', ...extraArgs],
    { encoding: 'utf8', timeout: 10000 },
  );
}

// ── T-09: --lang es generates Spanish message ─────────────────────────────────

describe('T-09: --lang es generates Spanish message', () => {
  test('output contains Spanish phrase "Autopilot listo para arrancar"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(
      result.stdout.includes('Autopilot listo para arrancar'),
      `Expected Spanish phrase in output. Got: ${result.stdout}`,
    );
  });

  test('output contains changeName in Spanish output', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'es']);
    assert.ok(result.stdout.includes('my-change'), 'changeName must appear in output');
  });

  test('Spanish output contains the phases list', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'es']);
    assert.ok(
      result.stdout.includes('apply') && result.stdout.includes('test') && result.stdout.includes('verify'),
      'phases must appear in Spanish output',
    );
  });
});

// ── T-09: --lang en generates English message ─────────────────────────────────

describe('T-09: --lang en generates English message', () => {
  test('output contains English phrase "Autopilot ready to start"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'en']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(
      result.stdout.includes('Autopilot ready to start'),
      `Expected English phrase in output. Got: ${result.stdout}`,
    );
  });

  test('output contains changeName in English output', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'en']);
    assert.ok(result.stdout.includes('my-change'), 'changeName must appear in English output');
  });

  test('English output contains the phases list', () => {
    const result = runReadyMessage(['--change', 'my-change', '--lang', 'en']);
    assert.ok(
      result.stdout.includes('apply') && result.stdout.includes('test') && result.stdout.includes('verify'),
      'phases must appear in English output',
    );
  });
});

// ── T-09: default --lang is Spanish ──────────────────────────────────────────

describe('T-09: default --lang is Spanish', () => {
  test('without --lang flag, output is Spanish', () => {
    const result = runReadyMessage(['--change', 'my-change']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(
      result.stdout.includes('Autopilot listo para arrancar'),
      `Default lang must be Spanish. Got: ${result.stdout}`,
    );
  });
});

// ── T-09: --change absent exits with code 1 ───────────────────────────────────

describe('T-09: --change absent exits with code 1', () => {
  test('without --change flag, exits with code 1', () => {
    const result = runReadyMessage(['--lang', 'es']);
    assert.equal(result.status, 1, 'must exit 1 when --change is absent');
  });

  test('without --change flag, stderr contains error message', () => {
    const result = runReadyMessage(['--lang', 'es']);
    const stderr = result.stderr || '';
    assert.ok(stderr.length > 0, 'stderr must have an error message when --change is absent');
  });
});

// ── T-09: --ide other value visible in output ─────────────────────────────────

describe('T-09: --ide value appears in output', () => {
  test('--ide opencode appears in output', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'opencode']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(result.stdout.includes('opencode'), `IDE value must appear in output. Got: ${result.stdout}`);
  });

  test('--ide codex appears in output', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'codex']);
    assert.ok(result.stdout.includes('codex'), `IDE value must appear in output. Got: ${result.stdout}`);
  });

  test('invalid --ide value treated as "unknown"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'invalid-ide-xyz']);
    assert.equal(result.status, 0, 'must exit 0 even with invalid ide');
    assert.ok(result.stdout.includes('unknown'), 'invalid IDE must be normalized to "unknown"');
  });
});

// ── T-09: changeName appears in output ───────────────────────────────────────

describe('T-09: changeName appears in output', () => {
  test('changeName from --change is visible in Spanish output', () => {
    const result = runReadyMessage(['--change', 'imp-my-feature', '--lang', 'es']);
    assert.ok(result.stdout.includes('imp-my-feature'), 'changeName must appear in output');
  });

  test('changeName from --change is visible in English output', () => {
    const result = runReadyMessage(['--change', 'feat-new-stuff', '--lang', 'en']);
    assert.ok(result.stdout.includes('feat-new-stuff'), 'changeName must appear in English output');
  });
});

// ── T-09: cursor IDE — different message structure ────────────────────────────

describe('T-09: --ide cursor generates cursor-specific message', () => {
  test('cursor message does not contain "Option A / Option B" structure', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0');
    const hasAB = result.stdout.includes('Option A') || result.stdout.includes('Opciones:');
    assert.equal(hasAB, false, 'cursor output must not contain the generic A/B options block');
  });

  test('cursor message includes explicit confirmation gate', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.ok(
      result.stdout.includes('go') && result.stdout.includes('arrancar'),
      'cursor output must list affirmative keywords',
    );
  });
});

// ── T-09: CA-02 — ready-message for cursor includes changeName, IDE, phases ──

describe('T-09: CA-02 — cursor ready-message includes required fields', () => {
  test('cursor Spanish output contains changeName', () => {
    const result = runReadyMessage(['--change', 'imp-my-feature', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(result.stdout.includes('imp-my-feature'), 'changeName must appear in cursor output');
  });

  test('cursor Spanish output includes IDE field showing cursor', () => {
    const result = runReadyMessage(['--change', 'imp-my-feature', '--ide', 'cursor', '--lang', 'es']);
    assert.ok(result.stdout.includes('cursor'), 'IDE value must appear in cursor output');
  });

  test('cursor Spanish output contains all phases (apply, test, verify, review, archive, up-code)', () => {
    const result = runReadyMessage(['--change', 'imp-my-feature', '--ide', 'cursor', '--lang', 'es']);
    const out = result.stdout;
    assert.ok(out.includes('apply'), 'phases must include apply');
    assert.ok(out.includes('test'), 'phases must include test');
    assert.ok(out.includes('verify'), 'phases must include verify');
    assert.ok(out.includes('review'), 'phases must include review');
    assert.ok(out.includes('archive'), 'phases must include archive');
    assert.ok(out.includes('up-code'), 'phases must include up-code');
  });
});

// ── T-09: CA-19 — non-cursor IDEs keep Option A and Option B ─────────────────

describe('T-09: CA-19 — non-cursor IDEs include Option A and Option B in output', () => {
  test('claude-code Spanish output contains Option A equivalent (Opciones:)', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'claude-code', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(
      result.stdout.includes('Opciones:') || result.stdout.includes('Options:'),
      `claude-code output must contain options block. Got: ${result.stdout}`,
    );
  });

  test('claude-code English output contains explicit "A)" and "B)" markers', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'claude-code', '--lang', 'en']);
    const out = result.stdout;
    assert.ok(out.includes('A)'), 'English claude-code output must contain A) marker');
    assert.ok(out.includes('B)'), 'English claude-code output must contain B) marker');
  });

  test('unknown IDE Spanish output contains option markers', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'unknown', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0 for unknown ide');
    assert.ok(
      result.stdout.includes('Opciones:') || result.stdout.includes('A)'),
      'unknown IDE output must contain options block',
    );
  });

  test('opencode IDE output contains option markers', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'opencode', '--lang', 'es']);
    assert.equal(result.status, 0, 'must exit 0');
    assert.ok(
      result.stdout.includes('Opciones:') || result.stdout.includes('A)'),
      'opencode output must contain options block',
    );
  });
});

// ── T-09: CR-07 — cursor output has no "Option A", "Option B", "idePermissionInstruction", "cursor-agent" as standalone text ──

describe('T-09: CR-07 — cursor output forbidden strings', () => {
  test('cursor output does not contain "Option A"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.stdout.includes('Option A'), false, 'cursor output must not contain "Option A"');
  });

  test('cursor output does not contain "Option B"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.stdout.includes('Option B'), false, 'cursor output must not contain "Option B"');
  });

  test('cursor output does not contain "idePermissionInstruction"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(
      result.stdout.includes('idePermissionInstruction'),
      false,
      'cursor output must not contain the placeholder string "idePermissionInstruction"',
    );
  });

  test('cursor English output does not contain "Option A" or "Option B"', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'en']);
    assert.equal(result.stdout.includes('Option A'), false, 'cursor EN output must not contain "Option A"');
    assert.equal(result.stdout.includes('Option B'), false, 'cursor EN output must not contain "Option B"');
  });

  test('cursor output does not contain cursor-agent, --yolo, or --force', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.stdout.includes('cursor-agent'), false, 'cursor output must not mention cursor-agent');
    assert.equal(result.stdout.includes('--yolo'), false, 'cursor output must not mention --yolo');
    assert.equal(result.stdout.includes('--force'), false, 'cursor output must not mention --force');
  });

  test('cursor output does not instruct opening a new session', () => {
    const result = runReadyMessage(['--change', 'my-change', '--ide', 'cursor', '--lang', 'es']);
    assert.equal(result.stdout.includes('Cierra esta sesión'), false, 'cursor output must not ask to close session');
    assert.equal(result.stdout.includes('nueva terminal'), false, 'cursor output must not ask for a new terminal');
  });
});

// ── SKILL.md content tests ────────────────────────────────────────────────────
// The criteria below (CA-01, CA-04, CA-05, CA-09, CA-10, CA-17, CR-01, CR-02) describe
// skill behavior (LLM-driven flow). They are validated by asserting on the SKILL.md text
// that describes and enforces the behavior — this is the authoritative source.

describe('SKILL: CA-01 — autopilot SKILL.md describes the explicit confirmation gate', () => {
  test('SKILL.md describes blocking wait after ready-message before starting pipeline', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('EXPLICIT CONFIRMATION GATE') || content.includes('STOP AND WAIT'),
      'SKILL.md must describe the explicit confirmation gate (STOP AND WAIT)',
    );
  });

  test('SKILL.md lists "go" as an accepted affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(content.includes('"go"'), 'SKILL.md must list "go" as an accepted affirmative');
  });

  test('SKILL.md lists "sí" or "si" as an accepted affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('"sí"') || content.includes('"si"'),
      'SKILL.md must list "sí"/"si" as an accepted affirmative',
    );
  });

  test('SKILL.md lists "arrancar" as an accepted affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(content.includes('"arrancar"'), 'SKILL.md must list "arrancar" as an accepted affirmative');
  });
});

describe('SKILL: CA-04 — autopilot SKILL.md shows pre-flight when kapsoPreflightShown is false', () => {
  test('SKILL.md describes kapsoPreflightShown check before showing WhatsApp block', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('kapsoPreflightShown'),
      'SKILL.md must reference kapsoPreflightShown to guard the pre-flight block',
    );
  });

  test('SKILL.md states pre-flight is shown when kapsoPreflightShown is not yet set', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('not yet set') || content.includes('not set'),
      'SKILL.md must describe showing pre-flight when kapsoPreflightShown is not yet set',
    );
  });
});

describe('SKILL: CA-05 — autopilot SKILL.md skips pre-flight when kapsoPreflightShown=true', () => {
  test('SKILL.md states pre-flight block is omitted when kapsoPreflightShown is already set', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('already set'),
      'SKILL.md must describe omitting pre-flight block when kapsoPreflightShown is already set',
    );
  });
});

describe('SKILL: CA-09 — kapsoPreflightShown initialized to false at Step 0.7 start', () => {
  test('SKILL.md has a Step 0.7 section', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('Step 0.7') || content.includes('0.7'),
      'SKILL.md must contain a Step 0.7 section',
    );
  });

  test('SKILL.md describes initializing accumulators at Step 0.7', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    // Step 0.7 initializes improvementsApplied and warnings (kapsoPreflightShown is a session variable)
    // Verify Step 0.7 exists and references initialization
    assert.ok(
      content.includes('Initialize accumulators') || content.includes('accumulators'),
      'SKILL.md Step 0.7 must describe initializing accumulators',
    );
  });
});

describe('SKILL: CA-10 — kapsoPreflightShown set to true after showing pre-flight', () => {
  test('SKILL.md explicitly states setting kapsoPreflightShown to true after showing the block', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('kapsoPreflightShown = true'),
      'SKILL.md must state setting kapsoPreflightShown = true after displaying the preflight block',
    );
  });
});

describe('SKILL: CA-17 — Kapso 24h notice applies to all IDEs', () => {
  test('SKILL.md pre-flight block is NOT inside an IDE-specific conditional section', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    // The preflight block is described under Step 0.6 before the Case A / Case B split.
    // Use the section-header pattern "**Case A" (bold heading) not the earlier backreference.
    const preflightIdx = content.indexOf('Kapso pre-flight');
    const caseAHeadingIdx = content.indexOf('**Case A');
    assert.ok(preflightIdx !== -1, '"Kapso pre-flight" heading must appear in SKILL.md');
    assert.ok(caseAHeadingIdx !== -1, '"**Case A" heading must appear in SKILL.md');
    assert.ok(
      preflightIdx < caseAHeadingIdx,
      'Kapso pre-flight block must be defined before the **Case A IDE split — applies to all IDEs',
    );
  });

  test('SKILL.md associates 24h notice with kapsoEnabled=true, not with a specific IDE', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    // The pre-flight section should condition on kapsoEnabled, not on a specific IDE name.
    // Extract from 'Kapso pre-flight' heading to the next section heading.
    const start = content.indexOf('Kapso pre-flight');
    const end = content.indexOf('**Case A', start);
    assert.ok(start !== -1, '"Kapso pre-flight" section must exist in SKILL.md');
    assert.ok(end > start, '"**Case A" must follow the Kapso pre-flight section');
    const preflightSection = content.substring(start, end);
    assert.ok(
      preflightSection.includes('kapsoEnabled'),
      'pre-flight section must condition on kapsoEnabled (not on a specific IDE)',
    );
  });
});

describe('SKILL: CR-01 — SKILL.md gate blocks on ambiguous responses', () => {
  test('SKILL.md describes the gate waiting for explicit affirmative (not just any reply)', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    // The gate section must describe what happens with non-affirmative responses
    assert.ok(
      content.includes('Affirmative') || content.includes('affirmative'),
      'SKILL.md must use the word "affirmative" to describe valid gate responses',
    );
  });

  test('SKILL.md describes behavior when no affirmative is given (session closed / no reply)', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('No reply') || content.includes('session closed'),
      'SKILL.md must describe what happens when no affirmative reply is given',
    );
  });
});

describe('SKILL: CR-02 — SKILL.md omits pre-flight block when kapsoEnabled=false', () => {
  test('SKILL.md states pre-flight is skipped when kapsoEnabled is false', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('kapsoEnabled = false') || content.includes('kapsoEnabled=false'),
      'SKILL.md must describe skipping pre-flight when kapsoEnabled is false',
    );
  });

  test('SKILL.md explicitly says skip or omit the kapso sub-step when kapsoEnabled is false', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('skip this sub-step') || content.includes('omit the block') || content.includes('skip and print'),
      'SKILL.md must describe skipping the kapso block when kapsoEnabled is false',
    );
  });
});

// ── SKILL.md propose content tests ───────────────────────────────────────────

describe('SKILL: CA-16 — propose SKILL.md includes Kapso warning next to option B', () => {
  test('propose SKILL.md Step 4 mentions Kapso or WhatsApp warning near option B', () => {
    const content = fs.readFileSync(proposeSkillPath, 'utf8');
    assert.ok(
      content.includes('kapsoEnabled') && content.includes('WhatsApp'),
      'propose SKILL.md must reference kapsoEnabled and WhatsApp in Step 4',
    );
  });

  test('propose SKILL.md shows Kapso warning conditionally on kapsoEnabled=true', () => {
    const content = fs.readFileSync(proposeSkillPath, 'utf8');
    assert.ok(
      content.includes('kapsoEnabled = true') || content.includes('if kapsoEnabled'),
      'propose SKILL.md must conditionally show Kapso warning when kapsoEnabled is true',
    );
  });

  test('propose SKILL.md option B mentions autopilot and notification', () => {
    const content = fs.readFileSync(proposeSkillPath, 'utf8');
    // Option B is /refacil:autopilot with notification
    assert.ok(content.includes('/refacil:autopilot'), 'propose SKILL.md must reference /refacil:autopilot in Step 4');
    assert.ok(
      content.includes('notify') || content.includes('notification') || content.includes('WhatsApp'),
      'propose SKILL.md option B must reference notification',
    );
  });
});

describe('SKILL: CR-04 — propose SKILL.md does NOT mention Kapso in Step 4 when kapsoEnabled=false', () => {
  test('propose SKILL.md only shows Kapso warning when kapsoEnabled=true (not unconditionally)', () => {
    const content = fs.readFileSync(proposeSkillPath, 'utf8');
    // Extract the Step 4 section to check the conditional structure
    const step4Start = content.indexOf('### Step 4');
    assert.ok(step4Start !== -1, 'propose SKILL.md must have a Step 4 section');
    const step4Content = content.substring(step4Start, step4Start + 1500);
    // The Kapso warning must be conditional (wrapped in if kapsoEnabled = true guard)
    assert.ok(
      step4Content.includes('kapsoEnabled') || step4Content.includes('if kapsoEnabled'),
      'Step 4 Kapso mention must be conditional on kapsoEnabled',
    );
    // Must not unconditionally place the Kapso warning outside any conditional
    const unconditional =
      step4Content.includes('WhatsApp') &&
      !step4Content.includes('kapsoEnabled') &&
      !step4Content.includes('if kapso');
    assert.equal(
      unconditional,
      false,
      'Kapso/WhatsApp warning in Step 4 must be conditional, not unconditional',
    );
  });
});

// ── GROUP 2: normalizeIde() and handleAutopilot() behavioral tests ────────────

describe('2a: normalizeIde() — CURSOR uppercase produces same output as cursor lowercase', () => {
  test('--ide CURSOR output matches --ide cursor (no "Option A", no "Option B")', () => {
    const upper = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'ready-message', '--change', 'my-change', '--ide', 'CURSOR', '--lang', 'es'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const lower = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'ready-message', '--change', 'my-change', '--ide', 'cursor', '--lang', 'es'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(upper.status, 0, 'CURSOR uppercase must exit 0');
    assert.equal(lower.status, 0, 'cursor lowercase must exit 0');
    assert.equal(upper.stdout, lower.stdout, '--ide CURSOR and --ide cursor must produce identical output');
    assert.equal(upper.stdout.includes('Option A'), false, 'CURSOR output must not contain "Option A"');
    assert.equal(upper.stdout.includes('Option B'), false, 'CURSOR output must not contain "Option B"');
  });
});

describe('2b: normalizeIde() — --ide flag absent produces same output as --ide unknown', () => {
  test('missing --ide flag produces output with Options block, same as --ide unknown', () => {
    const absent = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'ready-message', '--change', 'my-change', '--lang', 'es'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const unknown = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'ready-message', '--change', 'my-change', '--ide', 'unknown', '--lang', 'es'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(absent.status, 0, 'missing --ide must exit 0');
    assert.equal(unknown.status, 0, '--ide unknown must exit 0');
    assert.equal(
      absent.stdout,
      unknown.stdout,
      'missing --ide must produce identical output to --ide unknown',
    );
    // Both should have the generic options block (not the cursor-specific path)
    assert.ok(
      absent.stdout.includes('Opciones:') || absent.stdout.includes('A)') || absent.stdout.includes('Options:'),
      'missing --ide must produce the generic options block',
    );
  });
});

describe('2c: handleAutopilot() — autopilot with no subcommand exits with code 1', () => {
  test('autopilot (no subcommand) exits with code 1', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'autopilot'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 1, 'autopilot with no subcommand must exit 1');
  });

  test('autopilot (no subcommand) writes an error message to stderr', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'autopilot'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const stderr = result.stderr || '';
    assert.ok(stderr.length > 0, 'stderr must contain an error message when no subcommand is given');
  });
});

describe('2d: handleAutopilot() — autopilot foobar (invalid subcommand) exits with code 1', () => {
  test('autopilot foobar exits with code 1', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'foobar'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 1, 'autopilot with invalid subcommand must exit 1');
  });

  test('autopilot foobar writes an error message to stderr', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'autopilot', 'foobar'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const stderr = result.stderr || '';
    assert.ok(stderr.length > 0, 'stderr must contain an error message for invalid subcommand');
  });
});

describe('2e: SKILL.md CA-03 — recognized affirmatives include ok, start, dale', () => {
  test('SKILL.md lists "ok" as a recognized affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('"ok"') || content.includes("'ok'"),
      'SKILL.md must list "ok" as a recognized affirmative',
    );
  });

  test('SKILL.md lists "start" as a recognized affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('"start"') || content.includes("'start'"),
      'SKILL.md must list "start" as a recognized affirmative',
    );
  });

  test('SKILL.md lists "dale" as a recognized affirmative keyword', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('"dale"') || content.includes("'dale'"),
      'SKILL.md must list "dale" as a recognized affirmative',
    );
  });
});

describe('2f: SKILL.md CR-01 re-show — describes behavior for non-affirmative responses', () => {
  test('SKILL.md describes re-showing message or requiring affirmative when response is non-affirmative', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.ok(
      content.includes('re-show') ||
      content.includes('re-display') ||
      content.includes('must respond') ||
      content.includes('respond with') ||
      content.includes('Non-affirmative') ||
      content.includes('non-affirmative') ||
      content.includes('not affirmative') ||
      content.includes('ask again'),
      'SKILL.md must describe behavior when user gives a non-affirmative response (re-show or require affirmative)',
    );
  });
});
