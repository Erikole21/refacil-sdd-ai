'use strict';

/**
 * imp-multi-ide-parity — test pass 2 (CLI integration + install defaults)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;
const packageRoot = path.resolve(__dirname, '..');

const {
  installSkills,
  writeGlobalVersion,
  getPackageVersion,
} = require('../lib/installer');
const {
  globalClaudeDir,
  globalCursorDir,
  globalOpenCodeDir,
  globalCodexDir,
  writeSelectedIDEs,
} = require('../lib/global-paths');
const { writeConfigValue } = require('../lib/config');

function homeEnv(tmpHome) {
  return { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome };
}

function setupProjectRoot(tmpProject) {
  fs.mkdirSync(path.join(tmpProject, 'refacil-sdd'), { recursive: true });
  fs.mkdirSync(path.join(tmpProject, '.git'));
}

describe('CA-05: installSkills four IDEs installs refacil-stats everywhere', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca05-stats-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('refacil-stats/SKILL.md exists in Claude, Cursor, OpenCode, and Codex global dirs', () => {
    installSkills(packageRoot, tmpHome, ['claude', 'cursor', 'opencode', 'codex']);

    const targets = [
      path.join(globalClaudeDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md'),
      path.join(globalCursorDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md'),
      path.join(globalOpenCodeDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md'),
      path.join(globalCodexDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md'),
    ];

    for (const skillPath of targets) {
      assert.ok(fs.existsSync(skillPath), `missing stats skill at ${skillPath}`);
    }
  });
});

describe('CA-12: installSkills default includes four IDEs including codex', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca12-default-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('installSkills(packageRoot, homeDir) without ideDirs writes to all four global skill dirs', () => {
    installSkills(packageRoot, tmpHome);

    const dirs = [
      globalClaudeDir(tmpHome),
      globalCursorDir(tmpHome),
      globalOpenCodeDir(tmpHome),
      globalCodexDir(tmpHome),
    ];

    for (const base of dirs) {
      const skillsDir = path.join(base, 'skills');
      assert.ok(fs.existsSync(skillsDir), `expected skills dir under ${base}`);
      const refacil = fs.readdirSync(skillsDir).filter((n) => n.startsWith('refacil-'));
      assert.ok(refacil.length > 0, `expected refacil skills under ${skillsDir}`);
    }
  });
});

describe('CA-07 / CR-03: clean() IDE selection and fallback', () => {
  let tmpProject;
  let tmpHome;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-proj-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-home-'));
    setupProjectRoot(tmpProject);
  });

  afterEach(() => {
    try { fs.rmSync(tmpProject, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  });

  test('CA-07: clean removes Codex global skills when .codex is in selected-ides.json', () => {
    writeSelectedIDEs(['.claude', '.cursor', '.opencode', '.codex'], tmpHome);
    installSkills(packageRoot, tmpHome, ['codex']);

    const codexStats = path.join(globalCodexDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md');
    assert.ok(fs.existsSync(codexStats));

    const result = spawnSync(node, [CLI, 'clean'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: homeEnv(tmpHome),
      timeout: 60000,
    });

    assert.equal(result.status, 0, `clean failed: ${result.stderr}`);
    assert.ok(
      !fs.existsSync(codexStats),
      'Codex refacil-stats must be removed after clean with .codex selected',
    );
  });

  test('CR-03: clean without selected-ides.json falls back to four IDEs including Codex', () => {
    installSkills(packageRoot, tmpHome, ['codex']);
    const codexStats = path.join(globalCodexDir(tmpHome), 'skills', 'refacil-stats', 'SKILL.md');
    assert.ok(fs.existsSync(codexStats));

    const selPath = path.join(tmpHome, '.refacil-sdd-ai', 'selected-ides.json');
    assert.ok(!fs.existsSync(selPath));

    const result = spawnSync(node, [CLI, 'clean'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: homeEnv(tmpHome),
      timeout: 60000,
    });

    assert.equal(result.status, 0, `clean failed: ${result.stderr}`);
    assert.ok(!fs.existsSync(codexStats), 'Codex skills must be removed by four-IDE fallback clean');
  });
});

describe('CA-10 / CR-04 / CR-05: update() CodeGraph and OpenCode selection', () => {
  let tmpProject;
  let tmpHome;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-proj-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-home-'));
    setupProjectRoot(tmpProject);
  });

  afterEach(() => {
    try { fs.rmSync(tmpProject, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  });

  test('CA-10: update with codegraph enabled registers MCP in opencode.jsonc', () => {
    writeSelectedIDEs(['.opencode'], tmpHome);
    writeConfigValue('codegraphMode', 'enabled', tmpHome);

    const result = spawnSync(node, [CLI, 'update'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: homeEnv(tmpHome),
      timeout: 60000,
    });

    assert.equal(result.status, 0, `update failed: ${result.stderr}`);
    const configPath = path.join(globalOpenCodeDir(tmpHome), 'opencode.jsonc');
    assert.ok(fs.existsSync(configPath), 'opencode.jsonc must exist after update with CodeGraph enabled');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(parsed.mcp && parsed.mcp.codegraph, 'mcp.codegraph must be registered');
  });

  test('CR-04: update with codegraph disabled does not create opencode.jsonc MCP entry', () => {
    writeSelectedIDEs(['.opencode'], tmpHome);
    writeConfigValue('codegraphMode', 'disabled', tmpHome);

    const result = spawnSync(node, [CLI, 'update'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: homeEnv(tmpHome),
      timeout: 60000,
    });

    assert.equal(result.status, 0, `update failed: ${result.stderr}`);
    const configPath = path.join(globalOpenCodeDir(tmpHome), 'opencode.jsonc');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      assert.ok(!parsed.mcp || !parsed.mcp.codegraph, 'registerMcp must be skipped when codegraph disabled');
    }
  });

  test('CR-05: update without .opencode in selection skips OpenCode global skills install', () => {
    writeSelectedIDEs(['.claude'], tmpHome);
    writeConfigValue('codegraphMode', 'disabled', tmpHome);

    const result = spawnSync(node, [CLI, 'update'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: homeEnv(tmpHome),
      timeout: 60000,
    });

    assert.equal(result.status, 0, `update failed: ${result.stderr}`);
    const ocSkills = path.join(globalOpenCodeDir(tmpHome), 'skills');
    const hasRefacil = fs.existsSync(ocSkills)
      && fs.readdirSync(ocSkills).some((n) => n.startsWith('refacil-'));
    assert.ok(!hasRefacil, 'OpenCode skills must not be installed when .opencode is not selected');
    assert.ok(
      fs.existsSync(path.join(globalClaudeDir(tmpHome), 'skills', 'refacil-setup')),
      'Claude skills should still be installed',
    );
  });
});

describe('CA-13: check-update generic restart message', () => {
  let tmpProject;
  let tmpHome;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-proj-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-home-'));
    setupProjectRoot(tmpProject);
    fs.mkdirSync(path.join(tmpProject, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tmpProject, '.claude', 'skills'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpProject, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  });

  test('stdout uses generic Restart your IDE session after stale repo sync', () => {
    writeSelectedIDEs(['.claude'], tmpHome);
    writeConfigValue('codegraphMode', 'disabled', tmpHome);
    installSkills(packageRoot, tmpHome, ['.claude']);
    const pkgVersion = getPackageVersion(packageRoot);
    writeGlobalVersion('0.1.0', tmpHome);
    fs.writeFileSync(path.join(tmpProject, '.claude', '.sdd-version'), '0.1.0\n');

    const result = spawnSync(node, [CLI, 'check-update'], {
      cwd: tmpProject,
      encoding: 'utf8',
      input: '',
      env: homeEnv(tmpHome),
      timeout: 90000,
    });

    const out = `${result.stdout}\n${result.stderr}`;
    assert.match(out, /Restart your IDE session/i, `must use generic IDE restart wording; got: ${out.slice(0, 500)}`);
    assert.ok(
      !/Claude Code or Cursor/i.test(out),
      'must not mention only Claude Code or Cursor',
    );
  });
});
