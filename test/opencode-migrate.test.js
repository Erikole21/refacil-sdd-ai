'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { migrateOpenCodeLegacyArtifacts } = require('../lib/opencode-migrate');
const { globalOpenCodeDir } = require('../lib/global-paths');

const packageRoot = path.resolve(__dirname, '..');

let homeDir;
let stderrBuf;
let origStderrWrite;

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-migrate-'));
  stderrBuf = '';
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...args) => {
    stderrBuf += String(chunk);
    return origStderrWrite(chunk, ...args);
  };
});

afterEach(() => {
  process.stderr.write = origStderrWrite;
  fs.rmSync(homeDir, { recursive: true, force: true });
});

function seedSkill(dir, skillName) {
  const skillDir = path.join(dir, 'skills', `refacil-${skillName}`);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(
    path.join(packageRoot, 'skills', skillName, 'SKILL.md'),
    path.join(skillDir, 'SKILL.md'),
  );
}

describe('migrateOpenCodeLegacyArtifacts — CA-04', () => {
  test('copies refacil skills from legacy ~/.opencode when primary is empty', () => {
    const legacy = path.join(homeDir, '.opencode');
    const primary = globalOpenCodeDir(homeDir);
    seedSkill(legacy, 'setup');

    const result = migrateOpenCodeLegacyArtifacts(homeDir);

    assert.equal(result.migrated, true);
    assert.ok(result.fromDirs.includes(legacy));
    assert.ok(fs.existsSync(path.join(primary, 'skills', 'refacil-setup', 'SKILL.md')));
    assert.match(stderrBuf, /Migrated OpenCode refacil artifacts/);
    assert.ok(fs.existsSync(path.join(legacy, 'skills', 'refacil-setup')), 'legacy must not be deleted');
  });

  test('does not overwrite skills already present in primary', () => {
    const legacy = path.join(homeDir, '.opencode');
    const primary = globalOpenCodeDir(homeDir);
    seedSkill(legacy, 'guide');
    seedSkill(primary, 'setup');

    const result = migrateOpenCodeLegacyArtifacts(homeDir);

    assert.equal(result.migrated, false);
    assert.ok(!fs.existsSync(path.join(primary, 'skills', 'refacil-guide')));
    assert.ok(fs.existsSync(path.join(primary, 'skills', 'refacil-setup')));
  });

  test('copies missing plugin files when primary plugins are incomplete', () => {
    const legacy = path.join(homeDir, '.opencode');
    const primary = globalOpenCodeDir(homeDir);
    const legacyPlugins = path.join(legacy, 'plugins');
    fs.mkdirSync(legacyPlugins, { recursive: true });
    fs.copyFileSync(
      path.join(packageRoot, 'lib', 'opencode-plugin', 'rules.js'),
      path.join(legacyPlugins, 'rules.js'),
    );

    const result = migrateOpenCodeLegacyArtifacts(homeDir);

    assert.equal(result.migrated, true);
    assert.ok(fs.existsSync(path.join(primary, 'plugins', 'rules.js')));
  });

  test('CR-02: when both primary and legacy have refacil skills, primary is not overwritten', () => {
    const legacy = path.join(homeDir, '.opencode');
    const primary = globalOpenCodeDir(homeDir);
    seedSkill(legacy, 'guide');
    seedSkill(primary, 'setup');

    const primarySetup = fs.readFileSync(
      path.join(primary, 'skills', 'refacil-setup', 'SKILL.md'),
    );
    const legacyGuide = fs.readFileSync(
      path.join(legacy, 'skills', 'refacil-guide', 'SKILL.md'),
    );

    const result = migrateOpenCodeLegacyArtifacts(homeDir);
    assert.equal(result.migrated, false);
    assert.match(stderrBuf, /skipped legacy migration from .*no overwrite/);

    assert.deepEqual(
      fs.readFileSync(path.join(primary, 'skills', 'refacil-setup', 'SKILL.md')),
      primarySetup,
    );
    assert.ok(!fs.existsSync(path.join(primary, 'skills', 'refacil-guide')));
    assert.deepEqual(
      fs.readFileSync(path.join(legacy, 'skills', 'refacil-guide', 'SKILL.md')),
      legacyGuide,
    );

    const second = migrateOpenCodeLegacyArtifacts(homeDir);
    assert.equal(second.migrated, false);
  });
});
