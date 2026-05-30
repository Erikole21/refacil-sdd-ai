'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  installSkills,
  installAgents,
  removeOpenCodeGlobalArtifacts,
  removeGlobalSkills,
} = require('../lib/installer');
const { installOpenCodePlugin } = require('../lib/hooks');
const { globalOpenCodeDir, writeSelectedIDEs } = require('../lib/global-paths');

const packageRoot = path.resolve(__dirname, '..');

let homeDir;

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-clean-global-'));
  writeSelectedIDEs(['.opencode'], homeDir);
});

afterEach(() => {
  fs.rmSync(homeDir, { recursive: true, force: true });
});

describe('removeOpenCodeGlobalArtifacts — CA-06', () => {
  test('removes global OpenCode skills, agents, and plugin files', () => {
    installSkills(packageRoot, homeDir, ['opencode']);
    installAgents(packageRoot, homeDir, ['opencode']);
    installOpenCodePlugin(homeDir);

    const ocDir = globalOpenCodeDir(homeDir);
    assert.ok(fs.existsSync(path.join(ocDir, 'skills', 'refacil-setup')));
    assert.ok(fs.readdirSync(path.join(ocDir, 'agents')).some((f) => f.startsWith('refacil-')));
    assert.ok(fs.existsSync(path.join(ocDir, 'plugins', 'refacil-hooks.js')));
    assert.ok(fs.existsSync(path.join(ocDir, 'plugins', 'rules.js')));

    removeOpenCodeGlobalArtifacts(homeDir);

    const skillsLeft = fs.existsSync(path.join(ocDir, 'skills'))
      ? fs.readdirSync(path.join(ocDir, 'skills')).filter((n) => n.startsWith('refacil-'))
      : [];
    assert.equal(skillsLeft.length, 0);

    const agentsLeft = fs.existsSync(path.join(ocDir, 'agents'))
      ? fs.readdirSync(path.join(ocDir, 'agents')).filter((n) => n.startsWith('refacil-'))
      : [];
    assert.equal(agentsLeft.length, 0);

    assert.ok(!fs.existsSync(path.join(ocDir, 'plugins', 'refacil-hooks.js')));
    assert.ok(!fs.existsSync(path.join(ocDir, 'plugins', 'rules.js')));
  });

  test('clean flow: removeGlobalSkills plus removeOpenCodeGlobalArtifacts clears OpenCode', () => {
    installSkills(packageRoot, homeDir, ['.opencode']);
    installAgents(packageRoot, homeDir, ['.opencode']);
    installOpenCodePlugin(homeDir);

    removeGlobalSkills(homeDir, ['.opencode']);
    removeOpenCodeGlobalArtifacts(homeDir);

    const ocDir = globalOpenCodeDir(homeDir);
    if (fs.existsSync(path.join(ocDir, 'skills'))) {
      assert.equal(
        fs.readdirSync(path.join(ocDir, 'skills')).filter((n) => n.startsWith('refacil-')).length,
        0,
      );
    }
    assert.ok(!fs.existsSync(path.join(ocDir, 'plugins', 'refacil-hooks.js')));
  });
});
