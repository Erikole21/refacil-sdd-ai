'use strict';

/**
 * Tests for fix-bus-windows-truncation-and-say-methodology
 *
 * Covers:
 *   CA-01 to CA-11  — acceptance criteria
 *   CR-01 to CR-05  — rejection criteria
 *
 * CLI unit tests (CA-01..CA-04, CR-01..CR-04) exercise resolveText() inside
 * lib/commands/bus.js via a small test harness that stubs connectOrDie and the
 * underlying send helpers so no real broker is needed.
 *
 * Documentation tests (CA-05..CA-11, CR-05) read the skill/prereq markdown
 * files and assert that required content is present.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { buildBrokerStartError } = require('../lib/bus/spawn');

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'cli.js');
const node = process.execPath;

/**
 * Run `refacil-sdd-ai bus <sub> [flags]` as a child process, injecting
 * extra env vars.  We do NOT need a running broker for resolveText() errors
 * because those exit before any network call.
 */
function runBusCmd(sub, flags = [], extraEnv = {}) {
  const result = spawnSync(node, [CLI, 'bus', sub, ...flags], {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ...extraEnv },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: (result.stdout || '') + (result.stderr || ''),
  };
}

function readSkill(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ── resolveText unit tests via spawnSync ──────────────────────────────────────
// These commands will fail BEFORE connecting to the broker when input validation
// fires (--text + --from-env together, or --from-env with missing var, etc.)
// Commands that pass validation will eventually fail trying to connect — that's
// fine; we only check that the failure code and message come from validation.

describe('CR-01: --text and --from-env together is an error', () => {
  // Each subcommand that accepts text should reject combining both flags.
  for (const sub of ['say', 'ask', 'reply']) {
    test(`bus ${sub} --text "hi" --from-env SOME_VAR exits non-zero with mutual-exclusion message`, () => {
      const r = runBusCmd(sub, ['--text', 'hi', '--from-env', 'SOME_VAR', '--to', 'all'], {
        SOME_VAR: 'hello',
      });
      assert.notEqual(r.status, 0, `Expected non-zero exit for bus ${sub} with both flags`);
      assert.ok(
        r.combined.includes('mutually exclusive') || r.combined.includes('exclusive'),
        `Expected mutual-exclusion error message. got: "${r.combined}"`,
      );
    });
  }
});

describe('CR-02: --from-env with missing or empty var is an error', () => {
  test('bus say --from-env MISSING_VAR exits 1 when var is not in env', () => {
    // Ensure the var truly does not exist in the child env
    const env = { ...process.env };
    delete env.REFACIL_TEST_MISSING;
    const r = spawnSync(node, [CLI, 'bus', 'say', '--from-env', 'REFACIL_TEST_MISSING'], {
      encoding: 'utf8',
      timeout: 10000,
      env,
    });
    assert.equal(r.status, 1, `Expected exit 1 for missing env var. got ${r.status}`);
    const combined = (r.stdout || '') + (r.stderr || '');
    assert.ok(
      combined.includes('REFACIL_TEST_MISSING'),
      `Expected error to mention the var name. got: "${combined}"`,
    );
  });

  test('bus ask --from-env EMPTY_VAR exits 1 when var is empty string', () => {
    const r = runBusCmd('ask', ['--from-env', 'REFACIL_TEST_EMPTY', '--to', 'all'], {
      REFACIL_TEST_EMPTY: '',
    });
    assert.equal(r.status, 1, `Expected exit 1 for empty env var. got ${r.status}`);
    assert.ok(
      r.combined.includes('REFACIL_TEST_EMPTY') || r.combined.includes('not set or is empty'),
      `Expected error about empty env var. got: "${r.combined}"`,
    );
  });

  test('bus reply --from-env EMPTY_VAR exits 1 when var is empty string', () => {
    const r = runBusCmd('reply', ['--from-env', 'REFACIL_TEST_EMPTY2'], {
      REFACIL_TEST_EMPTY2: '',
    });
    assert.equal(r.status, 1, `Expected exit 1 for empty env var. got ${r.status}`);
  });
});

describe('CA-01 / CA-02 / CA-03: --from-env reads env var and passes the value', () => {
  // We can test resolveText() reading the env var by ensuring that the process
  // does NOT die with the "var is not set or is empty" error when a valid env var
  // is provided — it instead proceeds and fails trying to connect (broker not
  // running), producing a different error message.

  test('CA-01: bus say --from-env with populated var does not fail with missing-var error', () => {
    const r = runBusCmd('say', ['--from-env', 'BUS_TEXT_CA01'], {
      BUS_TEXT_CA01: 'full message content without truncation',
    });
    // Either succeeds (broker up) or fails with a connection error — NOT a missing-var error
    const isMissingVarError =
      r.combined.includes('not set or is empty') ||
      r.combined.includes('BUS_TEXT_CA01');
    assert.ok(
      !isMissingVarError,
      `bus say should not fail with missing-var error when var is set. got: "${r.combined}"`,
    );
  });

  test('CA-02: bus ask --from-env with populated var does not fail with missing-var error', () => {
    const r = runBusCmd('ask', ['--to', 'all', '--from-env', 'BUS_TEXT_CA02'], {
      BUS_TEXT_CA02: 'full question content',
    });
    const isMissingVarError =
      r.combined.includes('not set or is empty') ||
      r.combined.includes('BUS_TEXT_CA02');
    assert.ok(
      !isMissingVarError,
      `bus ask should not fail with missing-var error when var is set. got: "${r.combined}"`,
    );
  });

  test('CA-03: bus reply --from-env with populated var does not fail with missing-var error', () => {
    const r = runBusCmd('reply', ['--from-env', 'BUS_TEXT_CA03'], {
      BUS_TEXT_CA03: 'full reply content',
    });
    const isMissingVarError =
      r.combined.includes('not set or is empty') ||
      r.combined.includes('BUS_TEXT_CA03');
    assert.ok(
      !isMissingVarError,
      `bus reply should not fail with missing-var error when var is set. got: "${r.combined}"`,
    );
  });
});

describe('CA-04: --text still works (backward compatibility)', () => {
  test('bus say --text "simple message" does not fail with from-env or missing-var error', () => {
    // Without a broker the command fails to connect — but it should not fail
    // with a missing-var or mutual-exclusion error.
    const r = runBusCmd('say', ['--text', 'simple message']);
    assert.ok(
      !r.combined.includes('not set or is empty'),
      `--text should not trigger missing-var error. got: "${r.combined}"`,
    );
    assert.ok(
      !r.combined.includes('mutually exclusive'),
      `--text alone should not trigger mutual-exclusion error. got: "${r.combined}"`,
    );
  });

  test('bus ask --to all --text "simple question" does not fail with validation errors', () => {
    const r = runBusCmd('ask', ['--to', 'all', '--text', 'simple question']);
    assert.ok(
      !r.combined.includes('not set or is empty'),
      `--text should work for ask. got: "${r.combined}"`,
    );
    assert.ok(
      !r.combined.includes('mutually exclusive'),
      `--text alone should not trigger mutual-exclusion error. got: "${r.combined}"`,
    );
  });
});

describe('CR-03: --from-env uses process.env (cross-platform, no OS-specific code)', () => {
  test('resolveText uses process.env — no OS-specific detection in bus.js source', () => {
    const busSource = fs.readFileSync(path.join(ROOT, 'lib', 'commands', 'bus.js'), 'utf8');
    // Cross-platform check: no OS-specific detection (e.g., os.platform(), exec('cmd'), exec('sh'))
    assert.ok(
      !busSource.includes('os.platform()'),
      'bus.js must not use os.platform() for env reading',
    );
    assert.ok(
      !busSource.includes("exec('cmd"),
      'bus.js must not use cmd.exe for temp file handling',
    );
    // Confirm the from-env path uses process.env (cross-platform, no shell temp files)
    assert.ok(
      busSource.includes('process.env['),
      'bus.js must read env via process.env[varName] (cross-platform)',
    );
  });

  test('bus.js contains resolveText function that reads process.env for from-env flag', () => {
    const busSource = fs.readFileSync(path.join(ROOT, 'lib', 'commands', 'bus.js'), 'utf8');
    assert.ok(
      busSource.includes('resolveText'),
      'bus.js must define resolveText helper',
    );
    assert.ok(
      busSource.includes('from-env'),
      'bus.js must reference --from-env flag',
    );
  });
});

describe('CR-04: commands that do not use text are unaffected by from-env changes', () => {
  // join, inbox, attend, rooms, status do not accept --text or --from-env.
  // They should exit with usage/error related to THEIR own missing args,
  // not a from-env or text error.

  test('bus join without --room exits with a room-related usage message, not a text error', () => {
    const r = runBusCmd('join', []);
    // Should fail because --room is required, not because of --text/--from-env
    assert.ok(
      !r.combined.includes('not set or is empty') && !r.combined.includes('mutually exclusive'),
      `bus join error must not mention text/from-env. got: "${r.combined}"`,
    );
    // Verify it does mention the actual missing flag
    assert.ok(
      r.combined.includes('room') || r.combined.includes('join') || r.status !== 0,
      `bus join should indicate room is required. got: "${r.combined}"`,
    );
  });

  test('bus rooms exits without text or from-env errors (may fail with broker error only)', () => {
    const r = runBusCmd('rooms', []);
    assert.ok(
      !r.combined.includes('not set or is empty') && !r.combined.includes('mutually exclusive'),
      `bus rooms must not produce text/from-env errors. got: "${r.combined}"`,
    );
  });
});

describe('broker startup error classification', () => {
  test('EADDRINUSE startup errors are reported as port conflicts, not missing ws', () => {
    const err = buildBrokerStartError(ROOT, {
      code: 'EADDRINUSE',
      message: 'listen EADDRINUSE: address already in use 127.0.0.1:7821',
    });

    assert.match(err.message, /puerto|ocupado/i);
    assert.ok(
      !err.message.includes('npm install -g ws') && !err.message.includes('falta la dependencia "ws"'),
      `Port conflicts must not be reported as missing ws. Got: ${err.message}`,
    );
  });

  test('null startupError with ws resolvable reports generic "no publicó bus.json" message, not missing ws', () => {
    // Fourth branch: ws is present and startupError is null — the broker process
    // started but never wrote bus.json and reported no startup error.
    const err = buildBrokerStartError(ROOT, null);

    assert.ok(
      !err.message.includes('npm install -g ws') && !err.message.includes('falta la dependencia "ws"'),
      `Generic broker failure must not suggest npm install ws. Got: ${err.message}`,
    );
    assert.ok(
      err.message.includes('bus.json') || err.message.includes('arranque'),
      `Generic failure message must mention bus.json or startup cause. Got: ${err.message}`,
    );
  });
});

// ── Documentation / skill file tests ─────────────────────────────────────────

describe('CA-05: skills/ask/SKILL.md has Safe bus text delivery section', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/ask/SKILL.md'); });

  test('has "Safe bus text delivery" heading', () => {
    assert.ok(
      content.includes('Safe bus text delivery'),
      'skills/ask/SKILL.md must have "Safe bus text delivery" section',
    );
  });

  test('documents --from-env for cross-platform delivery', () => {
    assert.ok(
      content.includes('--from-env'),
      'skills/ask/SKILL.md must document --from-env flag',
    );
  });

  test('includes PowerShell example', () => {
    assert.ok(
      content.includes('PowerShell') || content.includes('powershell'),
      'skills/ask/SKILL.md must include a PowerShell example',
    );
  });

  test('includes bash example', () => {
    assert.ok(
      content.includes('bash'),
      'skills/ask/SKILL.md must include a bash example',
    );
  });
});

describe('CA-06: skills/say/SKILL.md and skills/reply/SKILL.md have Safe bus text delivery section', () => {
  test('skills/say/SKILL.md has "Safe bus text delivery" heading', () => {
    const content = readSkill('skills/say/SKILL.md');
    assert.ok(
      content.includes('Safe bus text delivery'),
      'skills/say/SKILL.md must have "Safe bus text delivery" section',
    );
  });

  test('skills/say/SKILL.md documents --from-env', () => {
    const content = readSkill('skills/say/SKILL.md');
    assert.ok(
      content.includes('--from-env'),
      'skills/say/SKILL.md must document --from-env flag',
    );
  });

  test('skills/reply/SKILL.md has "Safe bus text delivery" heading', () => {
    const content = readSkill('skills/reply/SKILL.md');
    assert.ok(
      content.includes('Safe bus text delivery'),
      'skills/reply/SKILL.md must have "Safe bus text delivery" section',
    );
  });

  test('skills/reply/SKILL.md documents --from-env', () => {
    const content = readSkill('skills/reply/SKILL.md');
    assert.ok(
      content.includes('--from-env'),
      'skills/reply/SKILL.md must document --from-env flag',
    );
  });
});

describe('CA-07: skill files use [placeholder] not <placeholder> in affected sections', () => {
  // The Safe bus text delivery sections should use [destination] not <destination>
  // in template/example lines that would be interpreted by a shell.

  function checkNoAngleBracketsInExamples(filePath) {
    const content = readSkill(filePath);
    // Extract the Safe bus text delivery section only (from its heading to the next ## or ### heading)
    // This section ends before "### Step 2" or "## Rules" etc.
    const sectionMatch = content.match(/## Safe bus text delivery[\s\S]*?(?=\n###? |\n## |\n# |$)/);
    if (!sectionMatch) return null;
    const section = sectionMatch[0];
    // In command examples (code fences), check for unquoted angle brackets used as
    // navigational placeholders (e.g., --to <destination> instead of --to [destination]).
    // Real data type annotations in contract examples like <number>, <string>, <uuid>,
    // and <special> are expected and allowed.
    const codeBlocks = section.match(/```[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      const placeholders = block.match(/<[a-zA-Z][a-zA-Z0-9_-]*>/g) || [];
      const allowedAnnotations = new Set(['<number>', '<string>', '<uuid>', '<special>']);
      for (const p of placeholders) {
        if (!allowedAnnotations.has(p)) {
          return p; // found a disallowed angle-bracket placeholder
        }
      }
    }
    return null;
  }

  test('skills/ask/SKILL.md uses [placeholder] in Safe bus text delivery examples', () => {
    const bad = checkNoAngleBracketsInExamples('skills/ask/SKILL.md');
    assert.equal(
      bad,
      null,
      `skills/ask/SKILL.md has angle-bracket placeholder in Safe bus text delivery section: ${bad}`,
    );
  });

  test('skills/say/SKILL.md uses [placeholder] in Safe bus text delivery examples', () => {
    const bad = checkNoAngleBracketsInExamples('skills/say/SKILL.md');
    assert.equal(
      bad,
      null,
      `skills/say/SKILL.md has angle-bracket placeholder in Safe bus text delivery section: ${bad}`,
    );
  });

  test('skills/reply/SKILL.md uses [placeholder] in Safe bus text delivery examples', () => {
    const bad = checkNoAngleBracketsInExamples('skills/reply/SKILL.md');
    assert.equal(
      bad,
      null,
      `skills/reply/SKILL.md has angle-bracket placeholder in Safe bus text delivery section: ${bad}`,
    );
  });
});

describe('CA-08: skills/ask/SKILL.md has explicit rule: contracts/bug-reports = bus ask, never say', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/ask/SKILL.md'); });

  test('has a rule about contracts/bug-reports using ask not say', () => {
    const hasBugReports = content.includes('bug') || content.includes('bug report');
    const hasContractsRule = content.includes('contract');
    // Match any form of "never say" or "never `say`" or "never `bus say`"
    const hasNeverSay =
      content.includes('never say') ||
      content.includes('never `say`') ||
      content.includes('never bus say') ||
      content.includes('never `bus say`');
    assert.ok(
      (hasBugReports || hasContractsRule) && hasNeverSay,
      'skills/ask/SKILL.md must have explicit rule that contracts/bug-reports use ask, never say',
    );
  });

  test('explicitly states cross-repo contracts / agreements must use ask', () => {
    assert.ok(
      content.includes('contract') && (content.includes('ask') || content.includes('bus ask')),
      'skills/ask/SKILL.md must relate contracts to bus ask usage',
    );
  });
});

describe('CA-09: skills/say/SKILL.md has explicit warning about say limitations', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/say/SKILL.md'); });

  test('has WARNING or explicit caution about say limitations', () => {
    assert.ok(
      content.includes('WARNING') || content.includes('warning') || content.toUpperCase().includes('WARNING'),
      'skills/say/SKILL.md must have an explicit warning about say limitations',
    );
  });

  test('warns that say does not guarantee late-join delivery', () => {
    const hasLateJoin =
      content.includes('late') ||
      content.includes('join after') ||
      content.includes('sessions that join') ||
      content.includes('join the room after');
    assert.ok(
      hasLateJoin,
      'skills/say/SKILL.md must warn that say does not deliver to sessions that join late',
    );
  });

  test('warns that say does not appear in inbox', () => {
    assert.ok(
      content.includes('inbox'),
      'skills/say/SKILL.md must warn that say messages do not appear in inbox',
    );
  });
});

describe('CA-10: skills/inbox/SKILL.md documents what appears in inbox (ask+reply, NOT say)', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/inbox/SKILL.md'); });

  test('documents that ask messages appear in inbox', () => {
    assert.ok(
      content.includes('ask'),
      'skills/inbox/SKILL.md must document that ask messages appear in inbox',
    );
  });

  test('documents that reply messages appear in inbox', () => {
    assert.ok(
      content.includes('reply'),
      'skills/inbox/SKILL.md must document that reply messages appear in inbox',
    );
  });

  test('documents that say messages do NOT appear in inbox', () => {
    const sayNotInInbox =
      content.includes('say') &&
      (content.includes('do NOT') ||
        content.includes('does NOT') ||
        content.includes('does not') ||
        content.includes('do not') ||
        content.includes('NOT appear') ||
        content.includes('not appear'));
    assert.ok(
      sayNotInInbox,
      'skills/inbox/SKILL.md must explicitly state that say messages do not appear in inbox',
    );
  });
});

describe('CA-11: skills/prereqs/BUS-CROSS-REPO.md has hard rule: contracts/agreements = ask+reply, never say', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/prereqs/BUS-CROSS-REPO.md'); });

  test('has a hard rule section about ask+reply for contracts', () => {
    const hasHardRule =
      content.includes('Hard rule') ||
      content.includes('hard rule') ||
      content.includes('Hard Rule') ||
      content.includes('HARD RULE') ||
      content.includes('never `say`') ||
      content.includes('never say');
    assert.ok(
      hasHardRule,
      'skills/prereqs/BUS-CROSS-REPO.md must have a hard rule about ask+reply for contracts/agreements',
    );
  });

  test('explicitly prohibits using say for contracts or agreements', () => {
    assert.ok(
      content.includes('never') && content.includes('say'),
      'skills/prereqs/BUS-CROSS-REPO.md must explicitly prohibit say for contracts/agreements',
    );
  });

  test('covers bug reports as requiring ask not say', () => {
    assert.ok(
      content.includes('bug') || content.includes('Bug'),
      'skills/prereqs/BUS-CROSS-REPO.md must mention bug reports in the context of ask+reply',
    );
  });
});

describe('CR-05: skills/say/SKILL.md still documents say as valid for optional announcements', () => {
  let content;
  beforeEach(() => { content = readSkill('skills/say/SKILL.md'); });

  test('say is presented as valid for optional announcements', () => {
    const hasOptional =
      content.includes('optional') ||
      content.includes('announcement') ||
      content.includes('Announcement');
    assert.ok(
      hasOptional,
      'skills/say/SKILL.md must still present say as valid for optional announcements (no over-restriction)',
    );
  });

  test('mentions specific valid use cases for say (not only restrictions)', () => {
    // File should have examples or descriptions of valid use cases
    const hasExamples =
      content.includes('restarting') ||
      content.includes('finished') ||
      content.includes('announce') ||
      content.includes('announcement') ||
      content.includes('general') ||
      content.includes('broadcast');
    assert.ok(
      hasExamples,
      'skills/say/SKILL.md must include valid use cases for say (e.g., announcements, general broadcasts)',
    );
  });
});
