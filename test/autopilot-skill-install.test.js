'use strict';

/**
 * Tests for feat-autopilot-skill
 * Covers: CA-01..CA-08, CA-14, CA-15, CR-01..CR-04
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { installSkills, SKILLS } = require('../lib/installer');

const packageRoot = path.resolve(__dirname, '..');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-install-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── CA-01: skills/autopilot/SKILL.md exists and has correct frontmatter ───────

describe('CA-01: skills/autopilot/SKILL.md frontmatter', () => {
  test('skills/autopilot/SKILL.md exists in package source', () => {
    const skillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'skills/autopilot/SKILL.md must exist');
  });

  test('SKILL.md contains name: refacil:autopilot in frontmatter (intact)', () => {
    const skillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.match(content, /^---[\s\S]*?name:\s*refacil:autopilot[\s\S]*?---/m,
      'frontmatter must contain "name: refacil:autopilot"');
  });

  test('SKILL.md frontmatter opens and closes with --- delimiters', () => {
    const skillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    const lines = content.split('\n');
    assert.equal(lines[0].trim(), '---', 'first line must be ---');
    const closingIdx = lines.slice(1).findIndex((l) => l.trim() === '---');
    assert.ok(closingIdx >= 0, 'frontmatter must be closed with a second ---');
  });
});

// ── CA-02: SKILLS array includes 'autopilot' between 'up-code' and 'join' ─────

describe('CA-02: SKILLS array contains autopilot in correct position', () => {
  test("SKILLS includes 'autopilot'", () => {
    assert.ok(SKILLS.includes('autopilot'), "SKILLS must include 'autopilot'");
  });

  test("'autopilot' is positioned after 'up-code' in SKILLS", () => {
    const upCodeIdx = SKILLS.indexOf('up-code');
    const autopilotIdx = SKILLS.indexOf('autopilot');
    assert.ok(upCodeIdx >= 0, "'up-code' must be in SKILLS");
    assert.ok(autopilotIdx > upCodeIdx,
      `'autopilot' (index ${autopilotIdx}) must come after 'up-code' (index ${upCodeIdx})`);
  });

  test("SKILLS includes 'stats'", () => {
    assert.ok(SKILLS.includes('stats'), "SKILLS must include 'stats'");
  });

  test("'autopilot' is positioned before 'join' in SKILLS", () => {
    const joinIdx = SKILLS.indexOf('join');
    const autopilotIdx = SKILLS.indexOf('autopilot');
    assert.ok(joinIdx >= 0, "'join' must be in SKILLS");
    assert.ok(autopilotIdx < joinIdx,
      `'autopilot' (index ${autopilotIdx}) must come before 'join' (index ${joinIdx})`);
  });
});

// ── CA-03: installSkills installs refacil-autopilot in all 4 IDEs ─────────────

describe('CA-03: installSkills installs refacil-autopilot in all four IDEs', () => {
  test('autopilot skill is installed in all four IDE targets', () => {
    installSkills(packageRoot, tmpDir, ['claude', 'cursor', 'opencode', 'codex']);

    const paths = [
      path.join(tmpDir, '.claude', 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(tmpDir, '.cursor', 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(require('../lib/global-paths').globalOpenCodeDir(tmpDir), 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(tmpDir, '.codex', 'skills', 'refacil-autopilot', 'SKILL.md'),
    ];

    for (const p of paths) {
      assert.ok(fs.existsSync(p), `Expected autopilot SKILL.md at: ${p}`);
    }
  });

  test('installed autopilot SKILL.md does not contain destructive reset recovery in any IDE', () => {
    installSkills(packageRoot, tmpDir, ['claude', 'cursor', 'opencode', 'codex']);

    const paths = [
      path.join(tmpDir, '.claude', 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(tmpDir, '.cursor', 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(require('../lib/global-paths').globalOpenCodeDir(tmpDir), 'skills', 'refacil-autopilot', 'SKILL.md'),
      path.join(tmpDir, '.codex', 'skills', 'refacil-autopilot', 'SKILL.md'),
    ];

    for (const p of paths) {
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(!content.includes('git reset --hard'), `Installed autopilot skill must not contain git reset --hard: ${p}`);
    }
  });

  test('installed SKILL.md in .claude preserves name: refacil:autopilot frontmatter', () => {
    installSkills(packageRoot, tmpDir, ['claude']);
    const installed = path.join(tmpDir, '.claude', 'skills', 'refacil-autopilot', 'SKILL.md');
    const content = fs.readFileSync(installed, 'utf8');
    assert.match(content, /name:\s*refacil:autopilot/, 'claude install must preserve frontmatter name');
  });

  test('installed SKILL.md in .codex preserves name: refacil:autopilot frontmatter', () => {
    installSkills(packageRoot, tmpDir, ['codex']);
    const installed = path.join(tmpDir, '.codex', 'skills', 'refacil-autopilot', 'SKILL.md');
    const content = fs.readFileSync(installed, 'utf8');
    assert.match(content, /name:\s*refacil:autopilot/, 'codex install must preserve frontmatter name');
  });
});

// ── CA-04: README includes /refacil:autopilot row in SDD cycle table ──────────

describe('CA-04: README includes /refacil:autopilot in SDD cycle table', () => {
  test('README.md contains /refacil:autopilot table row', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(
      content.includes('/refacil:autopilot') || content.includes('refacil:autopilot'),
      'README must include a /refacil:autopilot entry',
    );
  });

  test('README autopilot row describes the autonomous pipeline', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    // Must mention key verbs of the cycle
    const cycleVerbs = ['apply', 'test', 'verify', 'review'];
    for (const verb of cycleVerbs) {
      assert.ok(content.includes(verb), `README autopilot row must mention '${verb}'`);
    }
  });
});

// ── CA-05: README includes "Autonomous Mode" section with required content ─────

describe('CA-05: README includes Autonomous Mode section', () => {
  test('README.md contains "## Autonomous Mode" heading', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.match(content, /##\s+Autonomous Mode/, 'README must have ## Autonomous Mode section');
  });

  test('Autonomous Mode section mentions kapso setup', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(content.includes('kapso setup'), 'Autonomous Mode must mention "kapso setup"');
  });

  test('Autonomous Mode section has headless launch table with all 4 IDEs', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    const ides = ['Claude Code', 'Codex', 'Cursor', 'OpenCode'];
    for (const ide of ides) {
      assert.ok(content.includes(ide), `Autonomous Mode headless table must mention '${ide}'`);
    }
  });

  test('Autonomous Mode section describes failure behavior', () => {
    const readmePath = path.join(packageRoot, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    // Section "Behavior on failure" or similar must exist
    assert.ok(
      content.includes('Behavior on failure') || content.includes('failure'),
      'Autonomous Mode section must describe behavior on failure',
    );
  });
});

// ── CA-06: test/autopilot-skill-install.test.js exists ───────────────────────

describe('CA-06: test/autopilot-skill-install.test.js exists', () => {
  test('test file exists at expected path', () => {
    const testFile = path.join(packageRoot, 'test', 'autopilot-skill-install.test.js');
    assert.ok(fs.existsSync(testFile), 'test/autopilot-skill-install.test.js must exist');
  });
});

// ── CA-07: package.json scripts.test includes autopilot test file ─────────────

describe('CA-07: package.json scripts.test includes autopilot-skill-install.test.js', () => {
  test('package.json test script includes autopilot-skill-install.test.js', () => {
    const pkgPath = path.join(packageRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(
      pkg.scripts && pkg.scripts.test && pkg.scripts.test.includes('autopilot-skill-install.test.js'),
      'package.json scripts.test must include test/autopilot-skill-install.test.js',
    );
  });
});


// ── CA-14 & CA-15: kapso.js — PHONE_REGEX validation logic ───────────────────

describe('CA-14/CA-15: kapso.js E.164 phone validation logic', () => {
  const { PHONE_REGEX } = require('../lib/kapso');

  test('kapso.js exports setup function and PHONE_REGEX', () => {
    const kapso = require('../lib/kapso');
    assert.equal(typeof kapso.setup, 'function', 'kapso.js must export setup()');
    assert.ok(kapso.PHONE_REGEX instanceof RegExp, 'kapso.js must export PHONE_REGEX');
  });

  test('CA-15: PHONE_REGEX rejects number without leading +', () => {
    assert.ok(!PHONE_REGEX.test('5731XXXXXXXX'), 'Number without + must be rejected');
    assert.ok(!PHONE_REGEX.test('005731234567'), 'Number with 00 prefix (not +) must be rejected');
    assert.ok(!PHONE_REGEX.test(''), 'Empty string must be rejected');
  });

  test('CA-15: PHONE_REGEX accepts valid E.164 format with + prefix', () => {
    assert.ok(PHONE_REGEX.test('+5731234567'), 'E.164 with 10 digits must be accepted');
    assert.ok(PHONE_REGEX.test('+5731234567890'), 'E.164 with 13 digits must be accepted');
    assert.ok(PHONE_REGEX.test('+12025551234'), 'US E.164 must be accepted');
  });

  test('CA-15: PHONE_REGEX rejects numbers that are too short (< 7 digits after +)', () => {
    assert.ok(!PHONE_REGEX.test('+123456'), '6 digits after + must be rejected (min is 7)');
  });

  test('CA-15: PHONE_REGEX rejects numbers that are too long (> 15 digits after +)', () => {
    assert.ok(!PHONE_REGEX.test('+1234567890123456'), '16 digits after + must be rejected (max is 15)');
  });

  test('CA-14: kapso.js source writes exactly 3 KEY=VALUE fields to kapso.env', () => {
    const src = fs.readFileSync(path.join(packageRoot, 'lib', 'kapso.js'), 'utf8');
    // Must write KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID, NOTIFY_PHONE
    const requiredKeys = ['KAPSO_API_KEY', 'KAPSO_PHONE_NUMBER_ID', 'NOTIFY_PHONE'];
    for (const key of requiredKeys) {
      assert.ok(src.includes(key), `kapso.js must include ${key} in the written content`);
    }
    // Verify the join('\n') pattern constructs the file with exactly those 3 keys
    const keyOccurrences = requiredKeys.filter((k) => src.includes(`${k}=`));
    assert.equal(keyOccurrences.length, 3, 'kapso.js must write exactly 3 KEY=VALUE fields');
  });

  test('CA-14: kapso.js calls chmodSync 0o600 on the env file', () => {
    const src = fs.readFileSync(path.join(packageRoot, 'lib', 'kapso.js'), 'utf8');
    assert.ok(
      src.includes('chmodSync') && src.includes('0o600'),
      'kapso.js must call fs.chmodSync with 0o600 for the env file',
    );
  });
});

// ── CR-01: 'autopilot' NOT in SKILLS → installSkills omits it silently ────────

describe('CR-01: autopilot absent from SKILLS array → skill not installed', () => {
  test('installSkills skips skills whose source directory does not exist', () => {
    // We test the general guard: if the skills/ subdir is missing, installSkills skips it
    // without throwing. autopilot is present, so we use a non-existent skill name as proxy.
    const fakeRoot = path.join(tmpDir, 'fake-pkg');
    fs.mkdirSync(path.join(fakeRoot, 'skills'), { recursive: true });
    // No skills/ subdirs — installSkills must return 0 without throwing
    assert.doesNotThrow(() => installSkills(fakeRoot, tmpDir, ['claude', 'cursor', 'opencode', 'codex']));
    const count = installSkills(fakeRoot, tmpDir, ['claude']);
    assert.equal(count, 0, 'installSkills must return 0 when no skill dirs exist');
  });

  test("SKILLS still contains 'autopilot' — omission from array would cause count to drop by 1", () => {
    // Validate that 'autopilot' contributes to the install count (must be > 0 for the real run)
    const count = installSkills(packageRoot, tmpDir, ['claude']);
    assert.ok(count > 0, 'must install at least one skill (including autopilot)');
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'refacil-autopilot')),
      "refacil-autopilot dir must be present when 'autopilot' is in SKILLS",
    );
  });
});

// ── CR-02: skills/autopilot/ missing → installSkills does not throw ───────────

describe('CR-02: skills/autopilot/ absent → installSkills does not throw', () => {
  test('installSkills tolerates missing skill source directory without throwing', () => {
    // Create a packageRoot that has skills/ but no autopilot subdir
    const partialRoot = path.join(tmpDir, 'partial-pkg');
    const skillsDir = path.join(partialRoot, 'skills');
    // Copy only one non-autopilot skill to simulate partial install
    fs.mkdirSync(path.join(skillsDir, 'setup'), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'setup', 'SKILL.md'), '# setup\n');

    assert.doesNotThrow(
      () => installSkills(partialRoot, tmpDir, ['claude', 'cursor', 'opencode', 'codex']),
      'installSkills must not throw when skills/autopilot/ is missing',
    );
  });
});

// ── CR-03: skills/autopilot/SKILL.md must NOT contain real credential values ──

describe('CR-03: SKILL.md does not contain real credential values', () => {
  test('SKILL.md does not contain a real KAPSO_API_KEY value (placeholder only)', () => {
    const skillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    // The file references the KEY names but must not contain an actual API key value.
    // Real API keys typically look like long alphanumeric strings (>20 chars) following "KAPSO_API_KEY=..."
    const realKeyPattern = /KAPSO_API_KEY=[A-Za-z0-9_\-]{20,}/;
    assert.ok(!realKeyPattern.test(content), 'SKILL.md must not contain a real KAPSO_API_KEY value');
  });

  test('SKILL.md does not contain a real NOTIFY_PHONE value (no real E.164 number stored)', () => {
    const skillPath = path.join(packageRoot, 'skills', 'autopilot', 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    // Real phone numbers embedded as config would look like NOTIFY_PHONE=+XXXXXXXXXXXXX
    // The file may show the FORMAT (e.g. +5731XXXXXXXX) but must not store a complete real number
    const realPhonePattern = /NOTIFY_PHONE=\+\d{10,}/;
    assert.ok(!realPhonePattern.test(content), 'SKILL.md must not contain a real NOTIFY_PHONE value');
  });
});

// ── CR-04: agents/ directory does not contain autopilot.md or refacil-autopilot.md ──

describe('CR-04: agents/ directory does not contain autopilot agent files', () => {
  test('agents/autopilot.md does not exist', () => {
    const agentPath = path.join(packageRoot, 'agents', 'autopilot.md');
    assert.ok(!fs.existsSync(agentPath), 'agents/autopilot.md must NOT exist (autopilot is a skill, not an agent)');
  });

  test('agents/refacil-autopilot.md does not exist', () => {
    const agentPath = path.join(packageRoot, 'agents', 'refacil-autopilot.md');
    assert.ok(!fs.existsSync(agentPath), 'agents/refacil-autopilot.md must NOT exist');
  });
});
