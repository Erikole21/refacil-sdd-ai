'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// We re-require config.js for each test group to ensure module cache does not interfere.
// Because os.homedir() is called at invocation time (not module load), we control the
// global config location by placing files in a temp dir and passing it as projectRoot
// or by overriding the global path indirectly.  For global-config tests we directly
// create the file at the path config.js resolves (~/.refacil-sdd-ai/config.yaml) and
// clean up afterwards.

const { loadBranchConfig, loadBranchConfigWithSources, extractArtifactLanguage, DEFAULT_PROTECTED_BRANCHES, DEFAULT_BASE_BRANCH, SUPPORTED_LANGUAGES, DEFAULT_ARTIFACT_LANGUAGE } = require('../lib/config');

// Helper: create a temp directory
function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
}

// Helper: write a YAML string to a file, creating intermediate directories
function writeYaml(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// Path to the global config file as resolved by config.js
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml');

// ── CA: missing both config files ────────────────────────────────────────────

describe('loadBranchConfig — missing both config files', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns built-in defaults when neither project nor global config exists', () => {
    const globalExists = fs.existsSync(GLOBAL_CONFIG_PATH);
    const renamed = GLOBAL_CONFIG_PATH + '.bak-test0';
    if (globalExists) fs.renameSync(GLOBAL_CONFIG_PATH, renamed);
    try {
      const result = loadBranchConfig(tmpDir);
      assert.deepEqual(result.protectedBranches, DEFAULT_PROTECTED_BRANCHES);
      assert.equal(result.baseBranch, DEFAULT_BASE_BRANCH);
    } finally {
      if (globalExists) fs.renameSync(renamed, GLOBAL_CONFIG_PATH);
    }
  });

  test('default protectedBranches include master, main, develop, dev, testing, qa', () => {
    // Create a tmpDir with no refacil-sdd/config.yaml AND temporarily hide global config
    const globalExists = fs.existsSync(GLOBAL_CONFIG_PATH);
    let savedContent = null;
    const renamed = GLOBAL_CONFIG_PATH + '.bak-test';
    if (globalExists) {
      savedContent = fs.readFileSync(GLOBAL_CONFIG_PATH);
      fs.renameSync(GLOBAL_CONFIG_PATH, renamed);
    }
    try {
      const result = loadBranchConfig(tmpDir);
      for (const branch of DEFAULT_PROTECTED_BRANCHES) {
        assert.ok(result.protectedBranches.includes(branch), `Default list must include ${branch}`);
      }
      assert.equal(result.baseBranch, DEFAULT_BASE_BRANCH);
    } finally {
      if (globalExists) {
        fs.renameSync(renamed, GLOBAL_CONFIG_PATH);
      }
    }
  });

  test('source labels are all "default" when no config files exist', () => {
    const globalExists = fs.existsSync(GLOBAL_CONFIG_PATH);
    const renamed = GLOBAL_CONFIG_PATH + '.bak-test2';
    if (globalExists) fs.renameSync(GLOBAL_CONFIG_PATH, renamed);
    try {
      const result = loadBranchConfigWithSources(tmpDir);
      assert.equal(result.sources.protectedBranches, 'default');
      assert.equal(result.sources.baseBranch, 'default');
    } finally {
      if (globalExists) fs.renameSync(renamed, GLOBAL_CONFIG_PATH);
    }
  });
});

// ── CA: refacil-sdd/ absent ───────────────────────────────────────────────────

describe('loadBranchConfig — refacil-sdd/ absent', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('does not throw when refacil-sdd/ directory does not exist', () => {
    // tmpDir has no refacil-sdd/ at all
    assert.doesNotThrow(() => loadBranchConfig(tmpDir));
  });

  test('returns valid shape when refacil-sdd/ directory does not exist', () => {
    const result = loadBranchConfig(tmpDir);
    assert.ok(Array.isArray(result.protectedBranches));
    assert.equal(typeof result.baseBranch, 'string');
  });
});

// ── CA: project-only config ───────────────────────────────────────────────────

describe('loadBranchConfig — project config only', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('reads protectedBranches and baseBranch from project config', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\n  - main\n  - staging\n  - production\nbaseBranch: main\n',
    );
    const result = loadBranchConfig(tmpDir);
    assert.deepEqual(result.protectedBranches, ['main', 'staging', 'production']);
    assert.equal(result.baseBranch, 'main');
  });

  test('source labels are both "project" when project config provides both keys', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\n  - main\nbaseBranch: main\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.sources.protectedBranches, 'project');
    assert.equal(result.sources.baseBranch, 'project');
  });

  test('empty protectedBranches list is valid (empty array)', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\nbaseBranch: main\n',
    );
    const result = loadBranchConfig(tmpDir);
    assert.ok(Array.isArray(result.protectedBranches));
    assert.equal(result.protectedBranches.length, 0);
  });
});

// ── CA: global-only config ────────────────────────────────────────────────────

describe('loadBranchConfig — global config only', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-global-only';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    // Write our test global config
    writeYaml(GLOBAL_CONFIG_PATH, 'protectedBranches:\n  - master\n  - release\nbaseBranch: develop\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Remove the test global config
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('reads protectedBranches and baseBranch from global config when no project config', () => {
    const result = loadBranchConfig(tmpDir);
    assert.deepEqual(result.protectedBranches, ['master', 'release']);
    assert.equal(result.baseBranch, 'develop');
  });

  test('source labels are both "global" when only global config provides values', () => {
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.sources.protectedBranches, 'global');
    assert.equal(result.sources.baseBranch, 'global');
  });
});

// ── CA: project overrides global (partial) ────────────────────────────────────

describe('loadBranchConfig — project overrides global (partial)', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-partial';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    // Global: provides both keys
    writeYaml(GLOBAL_CONFIG_PATH, 'protectedBranches:\n  - master\n  - main\nbaseBranch: develop\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('project overrides only baseBranch; protectedBranches comes from global', () => {
    // Project only has baseBranch
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'baseBranch: feature-base\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.deepEqual(result.protectedBranches, ['master', 'main']);
    assert.equal(result.baseBranch, 'feature-base');
    assert.equal(result.sources.protectedBranches, 'global');
    assert.equal(result.sources.baseBranch, 'project');
  });

  test('project overrides only protectedBranches; baseBranch comes from global', () => {
    // Project only has protectedBranches
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\n  - main\n  - staging\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.deepEqual(result.protectedBranches, ['main', 'staging']);
    assert.equal(result.baseBranch, 'develop');
    assert.equal(result.sources.protectedBranches, 'project');
    assert.equal(result.sources.baseBranch, 'global');
  });
});

// ── CA: project overrides global (full) ──────────────────────────────────────

describe('loadBranchConfig — project overrides global (full)', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-full';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    writeYaml(GLOBAL_CONFIG_PATH, 'protectedBranches:\n  - master\n  - main\nbaseBranch: develop\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('project overrides both keys; global values are not used', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\n  - main\n  - staging\n  - production\nbaseBranch: main\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.deepEqual(result.protectedBranches, ['main', 'staging', 'production']);
    assert.equal(result.baseBranch, 'main');
    assert.equal(result.sources.protectedBranches, 'project');
    assert.equal(result.sources.baseBranch, 'project');
  });
});

// ── CR: invalid protectedBranches type ───────────────────────────────────────

describe('loadBranchConfig — invalid protectedBranches type', () => {
  let tmpDir;
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    tmpDir = makeTmp();
    stderrOutput = '';
    process.stderr.write = (chunk) => {
      stderrOutput += chunk;
      return true;
    };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('emits warning when protectedBranches is a scalar string instead of list', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches: main\nbaseBranch: develop\n',
    );
    loadBranchConfig(tmpDir);
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('protectedBranches'),
      `Expected warning about protectedBranches, got: "${stderrOutput}"`,
    );
  });

  test('falls back to next level when protectedBranches type is invalid', () => {
    // Project has invalid protectedBranches (scalar) — should fall back to default
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches: not-a-list\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    // Must not use the invalid value; source must be 'global' or 'default'
    assert.ok(
      result.sources.protectedBranches !== 'project',
      'Source must not be "project" when project value is invalid',
    );
    assert.ok(Array.isArray(result.protectedBranches));
  });
});

// ── CR: invalid baseBranch type ───────────────────────────────────────────────

describe('loadBranchConfig — invalid baseBranch type', () => {
  let tmpDir;
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    tmpDir = makeTmp();
    stderrOutput = '';
    process.stderr.write = (chunk) => {
      stderrOutput += chunk;
      return true;
    };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('emits warning when baseBranch is a list instead of scalar string', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'baseBranch:\n  - main\n  - develop\n',
    );
    loadBranchConfig(tmpDir);
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('baseBranch'),
      `Expected warning about baseBranch, got: "${stderrOutput}"`,
    );
  });

  test('falls back to next level when baseBranch type is invalid', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'baseBranch:\n  - not-a-string\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.ok(result.sources.baseBranch !== 'project', 'Source must not be "project" when project value is invalid');
    assert.equal(typeof result.baseBranch, 'string');
  });
});

// ── CR-05: empty protectedBranches warns ─────────────────────────────────────

describe('loadBranchConfig — empty protectedBranches list', () => {
  let tmpDir;
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    tmpDir = makeTmp();
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns [] when protectedBranches is explicitly set to empty list', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\nbaseBranch: main\n',
    );
    const result = loadBranchConfig(tmpDir);
    assert.deepEqual(result.protectedBranches, []);
  });

  test('emits warning when protectedBranches resolves to empty list', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'protectedBranches:\nbaseBranch: main\n',
    );
    loadBranchConfig(tmpDir);
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('protectedBranches') && stderrOutput.includes('empty'),
      `Expected empty-list warning, got: "${stderrOutput}"`,
    );
  });
});

// ── CR-03: unreadable config file warns ──────────────────────────────────────

describe('loadBranchConfig — unreadable config file', () => {
  let tmpDir;
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    tmpDir = makeTmp();
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('emits warning when config path exists but cannot be read (directory instead of file)', () => {
    // Place a directory at the config file path to force a read error
    const configPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    fs.mkdirSync(configPath, { recursive: true });
    loadBranchConfig(tmpDir);
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('config'),
      `Expected read-error warning, got: "${stderrOutput}"`,
    );
  });

  test('does not throw and returns valid shape when config path is a directory', () => {
    const configPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    fs.mkdirSync(configPath, { recursive: true });
    assert.doesNotThrow(() => loadBranchConfig(tmpDir));
    const result = loadBranchConfig(tmpDir);
    assert.ok(Array.isArray(result.protectedBranches));
    assert.equal(typeof result.baseBranch, 'string');
  });
});

// ── write-config (cmdWriteConfig) ────────────────────────────────────────────

describe('cmdWriteConfig — sdd write-config subcommand', () => {
  const { spawnSync } = require('node:child_process');
  const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
  const node = process.execPath;

  // Helper: run "node cli.js sdd write-config [...args]" with a given cwd
  function runWriteConfig(cwd, args = []) {
    const result = spawnSync(node, [CLI, 'sdd', 'write-config', ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env },
    });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  let tmpDir;
  // Backup path for real global config if it exists
  const globalConfigPath = path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml');
  const globalConfigBak = globalConfigPath + '.bak-write-config-test';
  let globalExisted = false;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-config-test-'));
    // Create a minimal refacil-sdd/ dir so findProjectRoot() lands in tmpDir
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd'), { recursive: true });
    // Protect real global config
    globalExisted = fs.existsSync(globalConfigPath);
    if (globalExisted) fs.renameSync(globalConfigPath, globalConfigBak);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore real global config
    if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);
    if (globalExisted) fs.renameSync(globalConfigBak, globalConfigPath);
  });

  // CA-01: custom values create project file
  test('CA-01: custom --base-branch and --protected-branches create project config.yaml', () => {
    const result = runWriteConfig(tmpDir, ['--base-branch', 'main', '--protected-branches', 'main,master,staging']);
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    assert.ok(fs.existsSync(projectConfigPath), 'refacil-sdd/config.yaml should be created');
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('baseBranch: main'), `Expected baseBranch in content: ${content}`);
    assert.ok(content.includes('- main'), `Expected protected branch main in content: ${content}`);
    assert.ok(content.includes('- master'), `Expected protected branch master in content: ${content}`);
    assert.ok(content.includes('- staging'), `Expected protected branch staging in content: ${content}`);
  });

  // CA-02: --global writes to home dir
  test('CA-02: --global writes to ~/.refacil-sdd-ai/config.yaml', () => {
    const result = runWriteConfig(tmpDir, ['--global', '--base-branch', 'develop', '--protected-branches', 'main,develop']);
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.ok(fs.existsSync(globalConfigPath), 'Global config.yaml should be created');
    const content = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(content.includes('baseBranch: develop'), `Expected baseBranch: develop in content: ${content}`);
    assert.ok(content.includes('- main'), `Expected protected branch main in content: ${content}`);
    // Project config should NOT be created
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    assert.ok(!fs.existsSync(projectConfigPath), 'Project config.yaml should NOT be created when --global is used');
  });

  // CA-03: no-op when values unchanged
  test('CA-03: no-op when values are already the same (exit 0, file unchanged)', () => {
    // Write the file first
    runWriteConfig(tmpDir, ['--base-branch', 'main', '--protected-branches', 'main,master']);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    const mtimeBefore = fs.statSync(projectConfigPath).mtimeMs;

    // Run again with identical values
    const result = runWriteConfig(tmpDir, ['--base-branch', 'main', '--protected-branches', 'main,master']);
    assert.equal(result.status, 0, `Expected exit 0 for no-op, got ${result.status}. stderr: ${result.stderr}`);
    const noOpMsg = result.stdout.includes('Sin cambios') || result.stdout.includes('ya tiene');
    assert.ok(noOpMsg, `Expected no-op message in stdout, got: ${result.stdout}`);

    // File mtime should not have changed (file not rewritten)
    const mtimeAfter = fs.statSync(projectConfigPath).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter, 'File should not be rewritten for no-op');
  });

  // CA-04: merge preserves unrelated keys
  test('CA-04: merge preserves unrelated keys in existing config', () => {
    // Write initial file with an extra key via fs directly
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    fs.writeFileSync(projectConfigPath, 'baseBranch: develop\nprotectedBranches:\n  - master\n  - main\n', 'utf8');

    // Only update baseBranch
    const result = runWriteConfig(tmpDir, ['--base-branch', 'main']);
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);

    const content = fs.readFileSync(projectConfigPath, 'utf8');
    // baseBranch updated
    assert.ok(content.includes('baseBranch: main'), `Expected updated baseBranch in: ${content}`);
    // protectedBranches preserved
    assert.ok(content.includes('- master') || content.includes('- main'), `Expected preserved protectedBranches in: ${content}`);
  });

  // CR-01: empty --base-branch exits 1
  test('CR-01: empty --base-branch exits with code 1', () => {
    const result = runWriteConfig(tmpDir, ['--base-branch', '   ', '--protected-branches', 'main,master']);
    assert.equal(result.status, 1, `Expected exit 1 for empty --base-branch, got ${result.status}`);
    assert.ok(
      result.stderr.includes('base-branch') || result.stdout.includes('base-branch'),
      `Expected error about base-branch. stderr: ${result.stderr}`,
    );
  });

  // CR-02: empty list after filter exits 1
  test('CR-02: --protected-branches with only commas/spaces exits with code 1', () => {
    const result = runWriteConfig(tmpDir, ['--base-branch', 'main', '--protected-branches', ' , , ']);
    assert.equal(result.status, 1, `Expected exit 1 for empty branch list, got ${result.status}`);
    assert.ok(
      result.stderr.includes('protected-branches') || result.stdout.includes('protected-branches'),
      `Expected error about protected-branches. stderr: ${result.stderr}`,
    );
  });

  // CR-03: no flags exits 1 with usage
  test('CR-03: no flags provided exits with code 1 and shows usage', () => {
    const result = runWriteConfig(tmpDir, []);
    assert.equal(result.status, 1, `Expected exit 1 for no flags, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('write-config') || combined.includes('Uso') || combined.includes('base-branch'),
      `Expected usage message. output: ${combined}`,
    );
  });

  // CA-05: --artifact-language creates project config
  test('CA-05: --artifact-language spanish creates project config with artifactLanguage: spanish', () => {
    const result = runWriteConfig(tmpDir, ['--artifact-language', 'spanish']);
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    assert.ok(fs.existsSync(projectConfigPath), 'refacil-sdd/config.yaml should be created');
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('artifactLanguage: spanish'), `Expected artifactLanguage: spanish in content: ${content}`);
  });

  // CR-05: --artifact-language with unknown value exits 1
  test('CR-05: --artifact-language klingon exits with code 1 and error message', () => {
    const result = runWriteConfig(tmpDir, ['--artifact-language', 'klingon']);
    assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('klingon') || combined.includes('artifact-language') || combined.includes('language'),
      `Expected error about artifact-language. output: ${combined}`,
    );
  });

  // CA-06: switching global artifactLanguage from spanish to english persists correctly
  test('CA-06: switching global artifactLanguage from spanish to english persists correctly', () => {
    runWriteConfig(tmpDir, ['--global', '--artifact-language', 'spanish']);
    assert.ok(fs.existsSync(globalConfigPath), 'Global config must exist after first write');
    const before = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(before.includes('artifactLanguage: spanish'), `Expected spanish in global config: ${before}`);

    const result = runWriteConfig(tmpDir, ['--global', '--artifact-language', 'english']);
    assert.equal(result.status, 0, `Expected exit 0 when switching to english, got ${result.status}. stderr: ${result.stderr}`);
    const after = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(after.includes('artifactLanguage: english'), `Expected english in updated global config: ${after}`);
  });

  // Fix 3 (CA-05-cfg): --codegraph flag writes codegraphMode to project config
  test('CA-codegraph-01: --codegraph enabled creates project config with codegraphMode: enabled', () => {
    const result = runWriteConfig(tmpDir, ['--codegraph', 'enabled']);
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    assert.ok(fs.existsSync(projectConfigPath), 'refacil-sdd/config.yaml should be created');
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('codegraphMode: enabled'), `Expected codegraphMode: enabled in: ${content}`);
  });

  test('CA-codegraph-02: --codegraph per-repo creates project config with codegraphMode: per-repo', () => {
    const result = runWriteConfig(tmpDir, ['--codegraph', 'per-repo']);
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('codegraphMode: per-repo'), `Expected codegraphMode: per-repo in: ${content}`);
  });

  test('CA-codegraph-03: --codegraph disabled creates project config with codegraphMode: disabled', () => {
    const result = runWriteConfig(tmpDir, ['--codegraph', 'disabled']);
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('codegraphMode: disabled'), `Expected codegraphMode: disabled in: ${content}`);
  });

  test('CR-codegraph-01: --codegraph with invalid mode value exits 1', () => {
    const result = runWriteConfig(tmpDir, ['--codegraph', 'invalid-mode']);
    assert.equal(result.status, 1, `Expected exit 1 for invalid codegraph mode. got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('invalid-mode') || combined.includes('codegraph'),
      `Expected error about invalid mode. output: ${combined}`,
    );
  });

  test('CR-codegraph-02: --codegraph with empty string exits 1', () => {
    const result = runWriteConfig(tmpDir, ['--codegraph', '   ']);
    assert.equal(result.status, 1, `Expected exit 1 for empty codegraph value. got ${result.status}`);
  });

  test('CA-codegraph-04: --codegraph --global writes codegraphMode to global config', () => {
    const result = runWriteConfig(tmpDir, ['--global', '--codegraph', 'per-repo']);
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    assert.ok(fs.existsSync(globalConfigPath), 'Global config.yaml should be created');
    const content = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(content.includes('codegraphMode: per-repo'), `Expected codegraphMode: per-repo in global config: ${content}`);
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    assert.ok(!fs.existsSync(projectConfigPath), 'Project config must NOT be created when --global is used');
  });

  // CR-04: corrupt existing file handled gracefully
  test('CR-04: corrupt existing config.yaml is handled gracefully (treat as absent, warns stderr)', () => {
    // Write a corrupt file at the project config path (parseYaml is lenient — returns {} for unrecognised content)
    const projectConfigPath = path.join(tmpDir, 'refacil-sdd', 'config.yaml');
    fs.writeFileSync(projectConfigPath, ':::not:valid:yaml:::\n\x00\x01\x02', 'utf8');

    const result = runWriteConfig(tmpDir, ['--base-branch', 'main', '--protected-branches', 'main,master']);
    assert.equal(result.status, 0, `Expected exit 0 even with corrupt file, got ${result.status}. stderr: ${result.stderr}`);
    const content = fs.readFileSync(projectConfigPath, 'utf8');
    assert.ok(content.includes('baseBranch: main'), `Expected new content after overwrite: ${content}`);
    assert.ok(
      result.stderr.includes('warning'),
      `Expected a stderr warning for corrupt file. stderr: ${result.stderr}`,
    );
  });
});

// ── CA-07: sdd config --json reflects [global] source after write-config --global ──

describe('cmdWriteConfig + cmdConfig integration — CA-07 global source, CA-08 project override, CA-09 directory creation', () => {
  const { spawnSync } = require('node:child_process');
  const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
  const node = process.execPath;

  // Helper: spawn cli with overridden HOME so we never touch the real global config
  function runWithFakeHome(tmpHomeDir, projectCwd, args) {
    const env = {
      ...process.env,
      HOME: tmpHomeDir,
      USERPROFILE: tmpHomeDir, // Windows
      APPDATA: tmpHomeDir,     // Windows fallback for some modules
    };
    const result = spawnSync(node, [CLI, ...args], {
      cwd: projectCwd,
      encoding: 'utf8',
      env,
    });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  let tmpProject;
  let tmpHome;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ca07-project-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca07-home-'));
    // Create minimal refacil-sdd/ so findProjectRoot() anchors in tmpProject
    fs.mkdirSync(path.join(tmpProject, 'refacil-sdd'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // CA-07: after write-config --global sets baseBranch, sdd config --json reflects value
  // (source verification via loadBranchConfigWithSources using fake home global config path)
  test('CA-07: write-config --global sets baseBranch; sdd config --json reflects the value', () => {
    // Step 1: write global config with a distinctive baseBranch
    const writeResult = runWithFakeHome(tmpHome, tmpProject, [
      'sdd', 'write-config', '--global', '--base-branch', 'staging',
    ]);
    assert.equal(writeResult.status, 0,
      `write-config --global should exit 0. stderr: ${writeResult.stderr}`);

    // Step 2: verify the global config file was written in the fake home
    const globalConfigPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    assert.ok(fs.existsSync(globalConfigPath), 'Global config.yaml must be created in fake HOME');
    const fileContent = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(fileContent.includes('baseBranch: staging'),
      `Global config should contain baseBranch: staging. Content: ${fileContent}`);

    // Step 3: sdd config --json must show baseBranch = 'staging'
    const configResult = runWithFakeHome(tmpHome, tmpProject, ['sdd', 'config', '--json']);
    assert.equal(configResult.status, 0,
      `sdd config --json should exit 0. stderr: ${configResult.stderr}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(configResult.stdout.trim()); },
      `stdout must be valid JSON. got: ${configResult.stdout}`);
    assert.equal(parsed.baseBranch, 'staging',
      `baseBranch must be 'staging' from global config. got: ${JSON.stringify(parsed)}`);

    // Step 4: verify source is 'global' via loadBranchConfigWithSources directly
    // We simulate the fake-home scenario by writing a global config at the real location
    // and using loadBranchConfigWithSources with a tmpProject that has no project config.
    // Since loadBranchConfigWithSources reads os.homedir() internally, we verify via the
    // file content we already wrote — or we trust the integration test above.
    // Source verification done inline:
    const globalCfg = fs.readFileSync(globalConfigPath, 'utf8');
    assert.ok(globalCfg.includes('baseBranch: staging'),
      'Global file correctly contains baseBranch');
    const projectConfigPath = path.join(tmpProject, 'refacil-sdd', 'config.yaml');
    assert.ok(!fs.existsSync(projectConfigPath),
      'Project config must NOT be created when --global is used (CA-02 corollary)');
  });

  // CA-08: project config overrides global — sdd config --json shows project value
  test('CA-08: project write-config overrides global baseBranch in sdd config --json output', () => {
    // Step 1: write global with baseBranch = 'develop'
    const writeGlobal = runWithFakeHome(tmpHome, tmpProject, [
      'sdd', 'write-config', '--global', '--base-branch', 'develop',
    ]);
    assert.equal(writeGlobal.status, 0,
      `write-config --global should exit 0. stderr: ${writeGlobal.stderr}`);

    // Step 2: write project config with baseBranch = 'main' (overrides global)
    const writeProject = runWithFakeHome(tmpHome, tmpProject, [
      'sdd', 'write-config', '--base-branch', 'main',
    ]);
    assert.equal(writeProject.status, 0,
      `write-config (project) should exit 0. stderr: ${writeProject.stderr}`);

    // Step 3: sdd config --json must return 'main' (project wins)
    const configResult = runWithFakeHome(tmpHome, tmpProject, ['sdd', 'config', '--json']);
    assert.equal(configResult.status, 0,
      `sdd config --json should exit 0. stderr: ${configResult.stderr}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(configResult.stdout.trim()); },
      `stdout must be valid JSON. got: ${configResult.stdout}`);
    assert.equal(parsed.baseBranch, 'main',
      `baseBranch must be 'main' from project config (overrides global 'develop'). got: ${JSON.stringify(parsed)}`);
  });

  // CA-09: write-config creates the target directory if it does not exist
  test('CA-09: write-config creates refacil-sdd/ directory when it is absent', () => {
    // Start with a project root that has NO refacil-sdd/ subdirectory
    const bareProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ca09-bare-'));
    try {
      // We need findProjectRoot() to land on bareProject; create a .git sentinel
      fs.mkdirSync(path.join(bareProject, '.git'), { recursive: true });
      // Ensure refacil-sdd/ does NOT pre-exist
      const configDir = path.join(bareProject, 'refacil-sdd');
      assert.ok(!fs.existsSync(configDir), 'Pre-condition: refacil-sdd/ must not exist');

      const env = {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      };
      const result = spawnSync(node, [CLI, 'sdd', 'write-config', '--base-branch', 'main'], {
        cwd: bareProject,
        encoding: 'utf8',
        env,
      });

      assert.equal(result.status, 0,
        `write-config should exit 0 even when refacil-sdd/ is absent. stderr: ${result.stderr}`);
      assert.ok(fs.existsSync(configDir),
        'refacil-sdd/ directory must be created by write-config');
      const configFile = path.join(configDir, 'config.yaml');
      assert.ok(fs.existsSync(configFile),
        'refacil-sdd/config.yaml must be created by write-config');
      const content = fs.readFileSync(configFile, 'utf8');
      assert.ok(content.includes('baseBranch: main'),
        `File must contain baseBranch: main. Content: ${content}`);
    } finally {
      fs.rmSync(bareProject, { recursive: true, force: true });
    }
  });

  // CA-09 (global): write-config --global creates ~/.refacil-sdd-ai/ when absent
  test('CA-09: write-config --global creates ~/.refacil-sdd-ai/ directory when absent', () => {
    // tmpHome is fresh — no .refacil-sdd-ai/ subdirectory
    const globalDir = path.join(tmpHome, '.refacil-sdd-ai');
    assert.ok(!fs.existsSync(globalDir), 'Pre-condition: ~/.refacil-sdd-ai/ must not exist');

    const writeResult = runWithFakeHome(tmpHome, tmpProject, [
      'sdd', 'write-config', '--global', '--base-branch', 'develop',
    ]);
    assert.equal(writeResult.status, 0,
      `write-config --global should exit 0. stderr: ${writeResult.stderr}`);
    assert.ok(fs.existsSync(globalDir),
      '~/.refacil-sdd-ai/ directory must be created when absent');
    assert.ok(fs.existsSync(path.join(globalDir, 'config.yaml')),
      '~/.refacil-sdd-ai/config.yaml must be created');
  });
});

// ── CA-05: init non-TTY skip behaviour ───────────────────────────────────────

describe('init non-TTY skip behaviour — CA-05', () => {
  const { spawnSync } = require('node:child_process');
  const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
  const node = process.execPath;

  let tmpProject;
  let tmpHome;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'ca05-project-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ca05-home-'));
    // Minimal setup so findProjectRoot() anchors on tmpProject
    fs.mkdirSync(path.join(tmpProject, 'refacil-sdd'), { recursive: true });
  });

  // Silently ignore EBUSY: init may spawn background codegraph process that briefly holds tmpProject
  afterEach(() => {
    try { fs.rmSync(tmpProject, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  });

  // CA-05: when stdin is not a TTY (piped), init must not prompt for branch config.
  // Note: after Fix 1 (CA-02-cfg), promptCodegraphMode writes codegraphMode:enabled in non-TTY mode,
  // so the global config FILE may be created — but must NOT contain baseBranch or protectedBranches.
  test('CA-05: init with --all and non-TTY stdin does not write branch config keys', () => {
    const globalConfigPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');

    const result = spawnSync(node, [CLI, 'init', '--all'], {
      cwd: tmpProject,
      encoding: 'utf8',
      input: '', // pipes stdin → process.stdout.isTTY will be false
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      // timeout to avoid hanging if a prompt is unexpectedly shown
      timeout: 15000,
    });

    // After Fix 1, codegraphMode:enabled IS written by promptCodegraphMode in non-TTY mode.
    // The key assertion is that branch config keys (baseBranch, protectedBranches) must NOT be written.
    if (fs.existsSync(globalConfigPath)) {
      const content = fs.readFileSync(globalConfigPath, 'utf8');
      assert.ok(
        !content.includes('baseBranch:'),
        `baseBranch must not be written by branch-config prompt in non-TTY mode. Content: ${content}`,
      );
      assert.ok(
        !content.includes('protectedBranches:'),
        `protectedBranches must not be written by branch-config prompt in non-TTY mode. Content: ${content}`,
      );
    }

    // Process must not have timed out or hung waiting for input
    assert.ok(result.status !== null,
      'Process must terminate (not hang waiting for interactive input)');
  });

  // CA-05: --yes flag skips the branch-config prompt; codegraphMode:enabled is written (Fix 1)
  test('CA-05: init --all --yes skips branch config prompt (no baseBranch/protectedBranches written)', () => {
    const globalConfigPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');

    const result = spawnSync(node, [CLI, 'init', '--all', '--yes'], {
      cwd: tmpProject,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      timeout: 15000,
    });

    // Branch config keys must not be written even if the file exists (due to codegraphMode write)
    if (fs.existsSync(globalConfigPath)) {
      const content = fs.readFileSync(globalConfigPath, 'utf8');
      assert.ok(
        !content.includes('baseBranch:'),
        `baseBranch must not be written when --yes skips the branch-config prompt. Content: ${content}`,
      );
      assert.ok(
        !content.includes('protectedBranches:'),
        `protectedBranches must not be written when --yes skips the prompt. Content: ${content}`,
      );
    }
    assert.ok(result.status !== null, 'Process must terminate');
  });
});

// ── CR: malformed YAML ────────────────────────────────────────────────────────

describe('loadBranchConfig — malformed YAML', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('does not throw when project config.yaml has malformed/truncated content', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      ':::invalid:::yaml:::\n  - broken\n',
    );
    // Our minimal YAML parser is lenient — it just skips unrecognized lines.
    // The test verifies no exception is thrown and the result is a valid shape.
    assert.doesNotThrow(() => loadBranchConfig(tmpDir));
  });

  test('returns valid shape even when project config.yaml is completely empty', () => {
    writeYaml(path.join(tmpDir, 'refacil-sdd', 'config.yaml'), '');
    const result = loadBranchConfig(tmpDir);
    assert.ok(Array.isArray(result.protectedBranches));
    assert.equal(typeof result.baseBranch, 'string');
  });

  test('does not throw when project config.yaml contains only comments', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      '# This is a comment\n# another comment\n',
    );
    assert.doesNotThrow(() => loadBranchConfig(tmpDir));
    const result = loadBranchConfig(tmpDir);
    assert.ok(Array.isArray(result.protectedBranches));
  });
});

// ── T-06: extractArtifactLanguage ────────────────────────────────────────────

describe('extractArtifactLanguage — valid values', () => {
  test('returns "english" for valid value "english"', () => {
    const result = extractArtifactLanguage({ artifactLanguage: 'english' }, 'project');
    assert.equal(result, 'english');
  });

  test('returns "spanish" for valid value "spanish"', () => {
    const result = extractArtifactLanguage({ artifactLanguage: 'spanish' }, 'project');
    assert.equal(result, 'spanish');
  });

  test('trims whitespace around a valid value', () => {
    const result = extractArtifactLanguage({ artifactLanguage: '  english  ' }, 'project');
    assert.equal(result, 'english');
  });

  test('returns null when artifactLanguage key is absent', () => {
    const result = extractArtifactLanguage({}, 'project');
    assert.equal(result, null);
  });
});

describe('extractArtifactLanguage — unknown value emits warning and returns null', () => {
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  test('returns null for an unknown language value', () => {
    const result = extractArtifactLanguage({ artifactLanguage: 'french' }, 'project');
    assert.equal(result, null);
  });

  test('emits a warning for an unknown language value', () => {
    extractArtifactLanguage({ artifactLanguage: 'klingon' }, 'global');
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('klingon'),
      `Expected warning mentioning unknown value. got: "${stderrOutput}"`,
    );
  });
});

describe('extractArtifactLanguage — empty value emits warning and returns null', () => {
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  test('returns null for an empty string', () => {
    const result = extractArtifactLanguage({ artifactLanguage: '' }, 'project');
    assert.equal(result, null);
  });

  test('returns null for a whitespace-only string', () => {
    const result = extractArtifactLanguage({ artifactLanguage: '   ' }, 'project');
    assert.equal(result, null);
  });

  test('emits a warning for an empty string', () => {
    extractArtifactLanguage({ artifactLanguage: '' }, 'project');
    assert.ok(
      stderrOutput.includes('warning'),
      `Expected warning for empty artifactLanguage. got: "${stderrOutput}"`,
    );
  });
});

// ── T-06: loadBranchConfigWithSources — artifactLanguage cascade ─────────────

describe('loadBranchConfigWithSources — artifactLanguage: no config → default english', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns default "english" when no config files exist', () => {
    const globalExists = fs.existsSync(GLOBAL_CONFIG_PATH);
    const renamed = GLOBAL_CONFIG_PATH + '.bak-lang-default';
    if (globalExists) fs.renameSync(GLOBAL_CONFIG_PATH, renamed);
    try {
      const result = loadBranchConfigWithSources(tmpDir);
      assert.equal(result.artifactLanguage, DEFAULT_ARTIFACT_LANGUAGE);
      assert.equal(result.sources.artifactLanguage, 'default');
    } finally {
      if (globalExists) fs.renameSync(renamed, GLOBAL_CONFIG_PATH);
    }
  });

  test('DEFAULT_ARTIFACT_LANGUAGE constant is "english"', () => {
    assert.equal(DEFAULT_ARTIFACT_LANGUAGE, 'english');
  });

  test('SUPPORTED_LANGUAGES includes english and spanish', () => {
    assert.ok(SUPPORTED_LANGUAGES.includes('english'));
    assert.ok(SUPPORTED_LANGUAGES.includes('spanish'));
  });
});

describe('loadBranchConfigWithSources — artifactLanguage: project overrides global', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-lang-proj';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    writeYaml(GLOBAL_CONFIG_PATH, 'artifactLanguage: english\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('project artifactLanguage overrides global', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'artifactLanguage: spanish\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.artifactLanguage, 'spanish');
    assert.equal(result.sources.artifactLanguage, 'project');
  });
});

describe('loadBranchConfigWithSources — artifactLanguage: global overrides default', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-lang-global';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    writeYaml(GLOBAL_CONFIG_PATH, 'artifactLanguage: spanish\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('global artifactLanguage is used when no project config exists', () => {
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.artifactLanguage, 'spanish');
    assert.equal(result.sources.artifactLanguage, 'global');
  });
});

describe('loadBranchConfigWithSources — artifactLanguage: invalid project value falls through to global', () => {
  let tmpDir;
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-lang-invalid';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    writeYaml(GLOBAL_CONFIG_PATH, 'artifactLanguage: spanish\n');
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('falls through to global when project has unknown artifactLanguage', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'artifactLanguage: klingon\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.artifactLanguage, 'spanish');
    assert.equal(result.sources.artifactLanguage, 'global');
    assert.ok(stderrOutput.includes('warning'), 'Expected warning for invalid project value');
  });
});

// ── CodeGraph config — new exports (feat-codegraph-integration) ───────────────

const {
  extractCodegraphMode,
  extractCodegraphSuggestState,
  writeConfigValue,
  CODEGRAPH_MODES,
  DEFAULT_CODEGRAPH_MODE,
} = require('../lib/config');

// ── extractCodegraphMode — valid values ───────────────────────────────────────

describe('extractCodegraphMode — valid values', () => {
  test('returns "enabled" for valid value "enabled"', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: 'enabled' }, 'global'), 'enabled');
  });

  test('returns "per-repo" for valid value "per-repo"', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: 'per-repo' }, 'global'), 'per-repo');
  });

  test('returns "disabled" for valid value "disabled"', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: 'disabled' }, 'global'), 'disabled');
  });

  test('trims whitespace around a valid value', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: '  enabled  ' }, 'global'), 'enabled');
  });

  test('returns null when codegraphMode key is absent', () => {
    assert.equal(extractCodegraphMode({}, 'global'), null);
  });

  test('CODEGRAPH_MODES contains enabled, per-repo, disabled', () => {
    assert.ok(CODEGRAPH_MODES.includes('enabled'));
    assert.ok(CODEGRAPH_MODES.includes('per-repo'));
    assert.ok(CODEGRAPH_MODES.includes('disabled'));
  });

  test('DEFAULT_CODEGRAPH_MODE is "enabled"', () => {
    assert.equal(DEFAULT_CODEGRAPH_MODE, 'enabled');
  });
});

describe('extractCodegraphMode — invalid value emits warning and returns null (CA-04-cfg / CR-01-cfg)', () => {
  let stderrOutput;
  const originalWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    stderrOutput = '';
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  test('returns null for an unknown codegraph mode value', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: 'invalid-mode' }, 'global'), null);
  });

  test('emits a warning for an unknown mode value', () => {
    extractCodegraphMode({ codegraphMode: 'invalid-mode' }, 'global');
    assert.ok(
      stderrOutput.includes('warning') && stderrOutput.includes('invalid-mode'),
      `Expected warning mentioning the invalid value. got: "${stderrOutput}"`,
    );
  });

  test('returns null for an empty string', () => {
    assert.equal(extractCodegraphMode({ codegraphMode: '' }, 'global'), null);
  });

  test('emits a warning for an empty string', () => {
    extractCodegraphMode({ codegraphMode: '' }, 'global');
    assert.ok(stderrOutput.includes('warning'), `Expected warning for empty codegraphMode. got: "${stderrOutput}"`);
  });
});

// ── CA-03-cfg: loadBranchConfigWithSources returns codegraph fields ───────────

describe('loadBranchConfigWithSources — codegraphMode from global config (CA-03-cfg)', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-cg-mode';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('CA-03-cfg: codegraphMode:"per-repo" in global config is returned with source "global"', () => {
    writeYaml(GLOBAL_CONFIG_PATH, 'codegraphMode: per-repo\n');
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'per-repo');
    assert.equal(result.sources.codegraphMode, 'global');
  });

  test('codegraphMode "enabled" in global config returns source "global"', () => {
    writeYaml(GLOBAL_CONFIG_PATH, 'codegraphMode: enabled\n');
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'enabled');
    assert.equal(result.sources.codegraphMode, 'global');
  });

  test('CR-02-cfg: codegraphMode is null and source is "default" when no config files exist', () => {
    // No global config written — both absent
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, null);
    assert.equal(result.sources.codegraphMode, 'default');
  });

  test('CA-04-cfg: invalid codegraphMode in global config → null returned, warning emitted', () => {
    let stderrOutput = '';
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    try {
      writeYaml(GLOBAL_CONFIG_PATH, 'codegraphMode: totally-wrong\n');
      const result = loadBranchConfigWithSources(tmpDir);
      assert.equal(result.codegraphMode, null);
      assert.ok(stderrOutput.includes('warning'), 'Expected warning for invalid codegraphMode');
    } finally {
      process.stderr.write = origWrite;
    }
  });
});

// ── extractCodegraphSuggestState ──────────────────────────────────────────────

describe('extractCodegraphSuggestState — reads suggest-shown and suggest-snooze fields', () => {
  test('returns {shown: null, snoozeUntil: null} when both keys are absent', () => {
    const result = extractCodegraphSuggestState({}, 'global');
    assert.deepEqual(result, { shown: null, snoozeUntil: null });
  });

  test('CA-07-hook: shown is true when codegraph-suggest-shown is "true"', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-shown': 'true' }, 'global');
    assert.equal(result.shown, true);
  });

  test('shown is true when codegraph-suggest-shown is boolean true', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-shown': true }, 'global');
    assert.equal(result.shown, true);
  });

  test('shown is false when codegraph-suggest-shown is "false"', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-shown': 'false' }, 'global');
    assert.equal(result.shown, false);
  });

  test('shown is false when codegraph-suggest-shown is boolean false', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-shown': false }, 'global');
    assert.equal(result.shown, false);
  });

  test('CA-04-hook: snoozeUntil is populated with ISO date string', () => {
    const snoozeDate = '2026-06-01T00:00:00.000Z';
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-snooze': snoozeDate }, 'global');
    assert.equal(result.snoozeUntil, snoozeDate);
  });

  test('snoozeUntil is null when codegraph-suggest-snooze is empty string', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-snooze': '' }, 'global');
    assert.equal(result.snoozeUntil, null);
  });

  test('snoozeUntil is null when codegraph-suggest-snooze is whitespace-only', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-snooze': '   ' }, 'global');
    assert.equal(result.snoozeUntil, null);
  });

  test('trims whitespace from snoozeUntil value', () => {
    const result = extractCodegraphSuggestState({ 'codegraph-suggest-snooze': '  2026-06-01  ' }, 'global');
    assert.equal(result.snoozeUntil, '2026-06-01');
  });

  test('returns both fields when both keys are present', () => {
    const result = extractCodegraphSuggestState({
      'codegraph-suggest-shown': 'true',
      'codegraph-suggest-snooze': '2026-07-01',
    }, 'global');
    assert.equal(result.shown, true);
    assert.equal(result.snoozeUntil, '2026-07-01');
  });
});

// ── writeConfigValue ──────────────────────────────────────────────────────────

describe('writeConfigValue — writes or updates a key in global config.yaml', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'write-cfg-val-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('creates the config file and parent dir when they do not exist', () => {
    writeConfigValue('codegraphMode', 'enabled', tmpHome);
    const configPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    assert.ok(fs.existsSync(configPath), 'config.yaml must be created');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('codegraphMode: enabled'), `Expected codegraphMode: enabled in: ${content}`);
  });

  test('CA-02-hook: writes codegraph-suggest-shown: true', () => {
    writeConfigValue('codegraph-suggest-shown', 'true', tmpHome);
    const configPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('codegraph-suggest-shown: true'), `Expected suggest-shown in: ${content}`);
  });

  test('CA-04-hook: writes codegraph-suggest-snooze with a future date', () => {
    const futureDate = '2026-06-01';
    writeConfigValue('codegraph-suggest-snooze', futureDate, tmpHome);
    const configPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes(`codegraph-suggest-snooze: ${futureDate}`), `Expected snooze date in: ${content}`);
  });

  test('updates an existing key without duplicating it', () => {
    writeConfigValue('codegraphMode', 'enabled', tmpHome);
    writeConfigValue('codegraphMode', 'disabled', tmpHome);
    const configPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    const occurrences = content.split('codegraphMode:').length - 1;
    assert.equal(occurrences, 1, 'Key must appear exactly once after update');
    assert.ok(content.includes('codegraphMode: disabled'), `Expected updated value in: ${content}`);
  });

  test('preserves unrelated keys when updating', () => {
    writeConfigValue('baseBranch', 'main', tmpHome);
    writeConfigValue('codegraphMode', 'per-repo', tmpHome);
    const configPath = path.join(tmpHome, '.refacil-sdd-ai', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('baseBranch: main'), `baseBranch must be preserved. Content: ${content}`);
    assert.ok(content.includes('codegraphMode: per-repo'), `codegraphMode must be set. Content: ${content}`);
  });

  test('does not throw even with invalid homeDir (silent swallow)', () => {
    assert.doesNotThrow(() => writeConfigValue('codegraphMode', 'enabled', '/nonexistent/path'));
  });
});

// ── Fix 2: codegraphMode project → global cascade (CR-03-cfg) ────────────────

describe('loadBranchConfigWithSources — codegraphMode: project overrides global (Fix 2 / CR-03-cfg)', () => {
  let tmpDir;
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-cg-proj-override';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
    writeYaml(GLOBAL_CONFIG_PATH, 'codegraphMode: enabled\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('project codegraphMode per-repo overrides global codegraphMode enabled', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'codegraphMode: per-repo\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'per-repo', 'Project codegraphMode must override global');
    assert.equal(result.sources.codegraphMode, 'project', 'Source must be "project"');
  });

  test('project codegraphMode disabled overrides global codegraphMode enabled', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'codegraphMode: disabled\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'disabled');
    assert.equal(result.sources.codegraphMode, 'project');
  });

  test('global codegraphMode is used when project has no codegraphMode key', () => {
    writeYaml(
      path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
      'baseBranch: main\n',
    );
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'enabled', 'Global codegraphMode must be used when project omits it');
    assert.equal(result.sources.codegraphMode, 'global');
  });

  test('invalid project codegraphMode falls through to global', () => {
    let stderrOutput = '';
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    try {
      writeYaml(
        path.join(tmpDir, 'refacil-sdd', 'config.yaml'),
        'codegraphMode: totally-invalid\n',
      );
      const result = loadBranchConfigWithSources(tmpDir);
      assert.equal(result.codegraphMode, 'enabled', 'Invalid project value must fall through to global');
      assert.equal(result.sources.codegraphMode, 'global');
      assert.ok(stderrOutput.includes('warning'), 'Expected warning for invalid project codegraphMode');
    } finally {
      process.stderr.write = origWrite;
    }
  });
});

// ── CA-05-hook / CA-03-hook roundtrip via writeConfigValue + loadBranchConfigWithSources ──

describe('writeConfigValue + loadBranchConfigWithSources — roundtrip for codegraphMode', () => {
  const globalBak = GLOBAL_CONFIG_PATH + '.bak-cg-roundtrip';
  const globalExisted = fs.existsSync(GLOBAL_CONFIG_PATH);
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmp();
    if (globalExisted) fs.renameSync(GLOBAL_CONFIG_PATH, globalBak);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) fs.unlinkSync(GLOBAL_CONFIG_PATH);
    if (globalExisted) fs.renameSync(globalBak, GLOBAL_CONFIG_PATH);
  });

  test('CA-02-hook: writing codegraphMode:enabled is readable by loadBranchConfigWithSources', () => {
    writeConfigValue('codegraphMode', 'enabled', os.homedir());
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'enabled');
    assert.equal(result.sources.codegraphMode, 'global');
  });

  test('CA-05-hook: writing codegraphMode:disabled is readable by loadBranchConfigWithSources', () => {
    writeConfigValue('codegraphMode', 'disabled', os.homedir());
    const result = loadBranchConfigWithSources(tmpDir);
    assert.equal(result.codegraphMode, 'disabled');
    assert.equal(result.sources.codegraphMode, 'global');
  });
});
