'use strict';

/**
 * Tests for imp-autopilot-gate-kapso — T-07
 * Verifies that kapso init-session has been removed from CLI and lib/kapso.js
 * Also covers: CA-07 (SKILL.md no mention of init-session)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'bin', 'cli.js');
const autopilotSkillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');

// ── T-07-a: kapso init-session exits with code 1 and "unknown subcommand" ──────

describe('T-07-a: kapso init-session exits with code 1', () => {
  test('kapso init-session --change foo exits with code 1', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'init-session', '--change', 'foo'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 1, 'kapso init-session must exit with code 1');
  });

  test('kapso init-session stderr contains "unknown subcommand"', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'init-session', '--change', 'foo'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const stderr = result.stderr || '';
    assert.match(
      stderr,
      /unknown.*subcommand|subcommand.*unknown/i,
      'stderr must mention "unknown subcommand"',
    );
  });
});

// ── T-07-b: initSession is NOT in module.exports of lib/kapso.js ─────────────

describe('T-07-b: initSession not exported from lib/kapso.js', () => {
  test('lib/kapso.js does not export initSession', () => {
    const kapso = require('../lib/kapso');
    assert.equal(
      typeof kapso.initSession,
      'undefined',
      'initSession must not be exported from lib/kapso.js',
    );
  });

  test('lib/kapso.js still exports setup, preflight, notify, readCredentials, PHONE_REGEX', () => {
    const kapso = require('../lib/kapso');
    assert.equal(typeof kapso.setup, 'function', 'setup must be exported');
    assert.equal(typeof kapso.preflight, 'function', 'preflight must be exported');
    assert.equal(typeof kapso.notify, 'function', 'notify must be exported');
    assert.equal(typeof kapso.readCredentials, 'function', 'readCredentials must be exported');
    assert.ok(kapso.PHONE_REGEX instanceof RegExp, 'PHONE_REGEX must be exported');
  });

  test('CA-08: module.exports only has the expected keys (no extra unknown exports)', () => {
    const kapso = require('../lib/kapso');
    const exportedKeys = Object.keys(kapso).sort();
    const expectedKeys = ['PHONE_REGEX', 'notify', 'preflight', 'readCredentials', 'setup'].sort();
    assert.deepEqual(
      exportedKeys,
      expectedKeys,
      `module.exports keys must match exactly: got [${exportedKeys}], expected [${expectedKeys}]`,
    );
  });
});

// ── T-07-c: CA-07 — skills/autopilot/SKILL.md contains no mention of init-session ──

describe('T-07-c: CA-07 — autopilot SKILL.md does not mention init-session', () => {
  test('SKILL.md does not contain the string "init-session"', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    assert.equal(
      content.includes('init-session'),
      false,
      'skills/autopilot/SKILL.md must not reference "init-session"',
    );
  });
});

// ── GROUP 3: CR-06 and CA-17 additional coverage ──────────────────────────────

describe('3a: CR-06 — kapso notify with missing required args exits with code 1', () => {
  test('kapso notify (no type, no args) exits with code 1 — notify is still wired up', () => {
    // CR-06: notify subcommand must remain functional (not removed), and invalid invocations
    // must exit with code 1, not crash unhandled.
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'notify'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 1, 'kapso notify with no args must exit with code 1 (not crash)');
  });
});

describe('3b: CA-17 — autopilot SKILL.md conditions Kapso notice on kapsoEnabled, not on IDE name', () => {
  test('SKILL.md Kapso/WhatsApp notice is gated on kapsoEnabled, not on a specific IDE name', () => {
    const content = fs.readFileSync(autopilotSkillPath, 'utf8');
    // kapsoEnabled must appear in SKILL.md as the guard for the WhatsApp notice
    assert.ok(
      content.includes('kapsoEnabled'),
      'SKILL.md must reference kapsoEnabled as the condition for the WhatsApp/Kapso notice',
    );
    // The WhatsApp notice section must not be gated exclusively on a specific IDE name
    // Extract the Kapso pre-flight section
    const start = content.indexOf('Kapso pre-flight');
    assert.ok(start !== -1, '"Kapso pre-flight" section must exist in SKILL.md');
    const end = content.indexOf('**Case A', start);
    const section = end !== -1 ? content.substring(start, end) : content.substring(start, start + 2000);
    // Section must reference kapsoEnabled, not hard-code an IDE name as the condition
    assert.ok(
      section.includes('kapsoEnabled'),
      'Kapso pre-flight section must condition on kapsoEnabled, not on a specific IDE name',
    );
    const hardcodesIde =
      (section.includes('cursor') && !section.includes('kapsoEnabled')) ||
      (section.includes('claude-code') && !section.includes('kapsoEnabled'));
    assert.equal(
      hardcodesIde,
      false,
      'Kapso pre-flight section must not gate the notice solely on a specific IDE name',
    );
  });
});
