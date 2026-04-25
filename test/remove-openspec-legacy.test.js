'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { removeOpenspecLegacyAssets } = require('../lib/installer');

// ── CA-11: update and checkUpdate invoke removeOpenspecLegacyAssets ──────────

describe('CA-11: bin/cli.js invokes removeOpenspecLegacyAssets in update and checkUpdate', () => {
  const cliSource = fs.readFileSync(path.resolve(__dirname, '../bin/cli.js'), 'utf8');

  test('removeOpenspecLegacyAssets is imported in bin/cli.js', () => {
    assert.match(
      cliSource,
      /removeOpenspecLegacyAssets/,
      'bin/cli.js must reference removeOpenspecLegacyAssets',
    );
  });

  test('checkUpdate function calls removeOpenspecLegacyAssets', () => {
    // Extract the checkUpdate function body (from its declaration to the next top-level function)
    const checkUpdateMatch = cliSource.match(/function checkUpdate\b[\s\S]*?(?=\nfunction |\nmodule\.exports)/);
    assert.ok(checkUpdateMatch, 'checkUpdate function must exist in bin/cli.js');
    assert.match(
      checkUpdateMatch[0],
      /removeOpenspecLegacyAssets/,
      'checkUpdate must call removeOpenspecLegacyAssets',
    );
  });

  test('update command calls removeOpenspecLegacyAssets', () => {
    // The update command is not a named function — find its block by locating the
    // "case 'update':" or "update" command handler section.
    // We look for occurrences of removeOpenspecLegacyAssets after line ~350 (post-installSkills).
    const updateSectionMatch = cliSource.match(/installSkills[\s\S]*?removeOpenspecLegacyAssets/);
    assert.ok(
      updateSectionMatch,
      'the update command handler must call removeOpenspecLegacyAssets after installSkills',
    );
  });
});

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-legacy-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: create a directory (including parents)
function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Helper: create a file with optional content
function writeFile(filePath, content = '') {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

// ── removeOpenspecLegacyAssets ───────────────────────────────────────────────

describe('removeOpenspecLegacyAssets', () => {
  // (a) Only openspec-* skills in .claude and .cursor
  test('removes openspec-* skill folders from .claude/skills/ and .cursor/skills/', () => {
    const claudeSkills = path.join(tmpDir, '.claude', 'skills');
    const cursorSkills = path.join(tmpDir, '.cursor', 'skills');

    // openspec skills to remove
    mkdirp(path.join(claudeSkills, 'openspec-propose'));
    mkdirp(path.join(claudeSkills, 'openspec-explore'));
    mkdirp(path.join(cursorSkills, 'openspec-propose'));
    mkdirp(path.join(cursorSkills, 'openspec-apply-change'));

    // refacil skills — must NOT be touched
    mkdirp(path.join(claudeSkills, 'refacil-propose'));
    mkdirp(path.join(cursorSkills, 'refacil-propose'));

    const removed = removeOpenspecLegacyAssets(tmpDir);

    assert.strictEqual(removed, 4, 'should report 4 removed assets');

    assert.ok(!fs.existsSync(path.join(claudeSkills, 'openspec-propose')), '.claude openspec-propose removed');
    assert.ok(!fs.existsSync(path.join(claudeSkills, 'openspec-explore')), '.claude openspec-explore removed');
    assert.ok(!fs.existsSync(path.join(cursorSkills, 'openspec-propose')), '.cursor openspec-propose removed');
    assert.ok(!fs.existsSync(path.join(cursorSkills, 'openspec-apply-change')), '.cursor openspec-apply-change removed');

    // refacil skills untouched
    assert.ok(fs.existsSync(path.join(claudeSkills, 'refacil-propose')), '.claude refacil-propose preserved');
    assert.ok(fs.existsSync(path.join(cursorSkills, 'refacil-propose')), '.cursor refacil-propose preserved');
  });

  // (b) Only opsx commands
  test('removes .claude/commands/opsx/ and .cursor/commands/opsx-*.md files', () => {
    const claudeOpsx = path.join(tmpDir, '.claude', 'commands', 'opsx');
    const cursorCommands = path.join(tmpDir, '.cursor', 'commands');

    mkdirp(claudeOpsx);
    writeFile(path.join(claudeOpsx, 'apply.md'), '# opsx apply');
    writeFile(path.join(claudeOpsx, 'propose.md'), '# opsx propose');

    writeFile(path.join(cursorCommands, 'opsx-apply.md'), '# opsx-apply');
    writeFile(path.join(cursorCommands, 'opsx-propose.md'), '# opsx-propose');
    writeFile(path.join(cursorCommands, 'opsx-verify.md'), '# opsx-verify');

    const removed = removeOpenspecLegacyAssets(tmpDir);

    assert.strictEqual(removed, 4, 'should report 4 removed assets (1 dir + 3 files)');

    assert.ok(!fs.existsSync(claudeOpsx), '.claude/commands/opsx/ removed');
    assert.ok(!fs.existsSync(path.join(cursorCommands, 'opsx-apply.md')), 'opsx-apply.md removed');
    assert.ok(!fs.existsSync(path.join(cursorCommands, 'opsx-propose.md')), 'opsx-propose.md removed');
    assert.ok(!fs.existsSync(path.join(cursorCommands, 'opsx-verify.md')), 'opsx-verify.md removed');
  });

  // (c) Mix of openspec-* skills and opsx commands
  test('removes both openspec-* skills and opsx commands in a mixed scenario', () => {
    const claudeSkills = path.join(tmpDir, '.claude', 'skills');
    const cursorSkills = path.join(tmpDir, '.cursor', 'skills');
    const claudeOpsx = path.join(tmpDir, '.claude', 'commands', 'opsx');
    const cursorCommands = path.join(tmpDir, '.cursor', 'commands');

    mkdirp(path.join(claudeSkills, 'openspec-explore'));
    mkdirp(path.join(cursorSkills, 'openspec-archive-change'));
    mkdirp(claudeOpsx);
    writeFile(path.join(claudeOpsx, 'archive.md'));
    writeFile(path.join(cursorCommands, 'opsx-archive.md'));

    const removed = removeOpenspecLegacyAssets(tmpDir);

    // 2 skill dirs + 1 opsx dir + 1 opsx-*.md file = 4
    assert.strictEqual(removed, 4);

    assert.ok(!fs.existsSync(path.join(claudeSkills, 'openspec-explore')));
    assert.ok(!fs.existsSync(path.join(cursorSkills, 'openspec-archive-change')));
    assert.ok(!fs.existsSync(claudeOpsx));
    assert.ok(!fs.existsSync(path.join(cursorCommands, 'opsx-archive.md')));
  });

  // (d) No-op when no legacy assets exist
  test('returns 0 and does not throw when no legacy assets are present', () => {
    // Create the IDE dirs but without any legacy assets
    mkdirp(path.join(tmpDir, '.claude', 'skills', 'refacil-propose'));
    mkdirp(path.join(tmpDir, '.cursor', 'skills', 'refacil-propose'));

    const removed = removeOpenspecLegacyAssets(tmpDir);
    assert.strictEqual(removed, 0, 'no assets to remove');
  });

  // (d2) No-op on completely empty project root
  test('returns 0 when project root has no .claude or .cursor directories', () => {
    const removed = removeOpenspecLegacyAssets(tmpDir);
    assert.strictEqual(removed, 0, 'nothing to remove in empty root');
  });

  // (b2) .cursor/commands/opsx/ as a directory (not just loose files)
  test('removes .cursor/commands/opsx/ directory if it exists', () => {
    const cursorOpsx = path.join(tmpDir, '.cursor', 'commands', 'opsx');
    mkdirp(cursorOpsx);
    writeFile(path.join(cursorOpsx, 'apply.md'), '# opsx apply');
    writeFile(path.join(cursorOpsx, 'propose.md'), '# opsx propose');

    const removed = removeOpenspecLegacyAssets(tmpDir);

    assert.ok(removed > 0, 'should remove at least one asset');
    assert.ok(!fs.existsSync(cursorOpsx), '.cursor/commands/opsx/ directory removed');
  });

  // (e) Does NOT touch refacil-* skills or openspec/ root directory
  test('does not touch refacil-* skill folders or an openspec/ root directory', () => {
    const claudeSkills = path.join(tmpDir, '.claude', 'skills');
    const cursorSkills = path.join(tmpDir, '.cursor', 'skills');

    mkdirp(path.join(claudeSkills, 'refacil-propose'));
    mkdirp(path.join(claudeSkills, 'refacil-explore'));
    mkdirp(path.join(cursorSkills, 'refacil-test'));

    // An openspec/ at repo root — must NOT be touched
    const openspecRoot = path.join(tmpDir, 'openspec');
    mkdirp(openspecRoot);
    writeFile(path.join(openspecRoot, 'changes', 'my-change', 'proposal.md'), '# proposal');

    const removed = removeOpenspecLegacyAssets(tmpDir);

    assert.strictEqual(removed, 0);
    assert.ok(fs.existsSync(path.join(claudeSkills, 'refacil-propose')), 'refacil-propose preserved');
    assert.ok(fs.existsSync(path.join(claudeSkills, 'refacil-explore')), 'refacil-explore preserved');
    assert.ok(fs.existsSync(path.join(cursorSkills, 'refacil-test')), 'refacil-test preserved');
    assert.ok(fs.existsSync(openspecRoot), 'openspec/ root directory preserved');
    assert.ok(
      fs.existsSync(path.join(openspecRoot, 'changes', 'my-change', 'proposal.md')),
      'openspec/ artifacts preserved',
    );
  });
});
