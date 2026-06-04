'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const codegraph = require('../lib/codegraph');

// Helper: create a fresh temp directory
function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-test-'));
}

// ── isInstalled ───────────────────────────────────────────────────────────────

describe('isInstalled — returns a boolean', () => {
  test('returns a boolean value (true or false)', () => {
    const result = codegraph.isInstalled();
    assert.equal(typeof result, 'boolean');
  });

  test('does not throw', () => {
    assert.doesNotThrow(() => codegraph.isInstalled());
  });
});

// ── isInitialized ─────────────────────────────────────────────────────────────

describe('isInitialized — checks for .codegraph/ directory', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('returns false when .codegraph/ does not exist', () => {
    assert.equal(codegraph.isInitialized(tmpDir), false);
  });

  test('returns true when .codegraph/ directory exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.codegraph'));
    assert.equal(codegraph.isInitialized(tmpDir), true);
  });

  test('returns false for a non-existent path without throwing', () => {
    const nonExistent = path.join(os.tmpdir(), 'does-not-exist-codegraph-xyzabc');
    assert.doesNotThrow(() => codegraph.isInitialized(nonExistent));
    assert.equal(codegraph.isInitialized(nonExistent), false);
  });
});

// ── init ──────────────────────────────────────────────────────────────────────

describe('init — fire-and-forget, never throws', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  // Silently ignore EBUSY: spawned background process may hold the dir briefly on Windows
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  test('does not throw when called with a valid path', () => {
    assert.doesNotThrow(() => codegraph.init(tmpDir));
  });

  test('does not throw when CodeGraph binary is not found (swallows error)', () => {
    // Even if the package is not installed, init must swallow the error
    assert.doesNotThrow(() => codegraph.init('/nonexistent/path'));
  });

  test('returns undefined (fire-and-forget)', () => {
    const result = codegraph.init(tmpDir);
    assert.equal(result, undefined);
  });
});

// ── mcpEntry ──────────────────────────────────────────────────────────────────

describe('mcpEntry — returns string or null based on install state and ide param', () => {
  test('returns null when ide is null', () => {
    assert.equal(codegraph.mcpEntry(null), null);
  });

  test('returns null when ide is undefined', () => {
    assert.equal(codegraph.mcpEntry(undefined), null);
  });

  test('returns null when ide is empty string', () => {
    assert.equal(codegraph.mcpEntry(''), null);
  });

  test('returns a string or null for a valid ide name (claude)', () => {
    const result = codegraph.mcpEntry('claude');
    assert.ok(result === null || typeof result === 'string');
  });

  test('return value for valid ide is string containing codegraph tool names when installed', () => {
    // If CodeGraph is installed, the result should reference codegraph tools
    if (codegraph.isInstalled()) {
      const result = codegraph.mcpEntry('claude');
      assert.ok(typeof result === 'string', 'Expected string when CodeGraph is installed');
      assert.ok(result.includes('codegraph'), 'Expected result to reference codegraph');
    } else {
      assert.equal(codegraph.mcpEntry('claude'), null);
    }
  });

  test('does not throw for any ide value', () => {
    for (const ide of ['claude', 'cursor', 'opencode', 'codex', 'unknown', '', null, undefined]) {
      assert.doesNotThrow(() => codegraph.mcpEntry(ide));
    }
  });
});

// ── registerMcp — claude ──────────────────────────────────────────────────────

describe('registerMcp — claude IDE: writes mcpServers.codegraph to settings.json', () => {
  let tmpHome;
  beforeEach(() => { tmpHome = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('no-op when .claude/ directory does not exist', () => {
    // Should not throw and should not create any files
    assert.doesNotThrow(() => codegraph.registerMcp(['claude'], tmpHome));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.claude')));
  });

  test('writes mcpServers.codegraph to settings.json when .claude/ exists', () => {
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    codegraph.registerMcp(['claude'], tmpHome);
    const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'settings.json must be created');
    const content = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(content.mcpServers, 'mcpServers must exist');
    assert.ok(content.mcpServers.codegraph, 'mcpServers.codegraph must exist');
    assert.equal(content.mcpServers.codegraph.command, 'codegraph');
  });

  test('idempotent: second call does not duplicate the entry', () => {
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    codegraph.registerMcp(['claude'], tmpHome);
    codegraph.registerMcp(['claude'], tmpHome);
    const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
    const content = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    // mcpServers.codegraph exists exactly once
    assert.ok(content.mcpServers.codegraph);
    assert.equal(typeof content.mcpServers.codegraph, 'object');
  });

  test('accepts dot-prefixed IDE name .claude', () => {
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    codegraph.registerMcp(['.claude'], tmpHome);
    const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath));
    const content = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(content.mcpServers.codegraph);
  });

  test('preserves existing entries in settings.json', () => {
    const claudeDir = path.join(tmpHome, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ mcpServers: { existing: { command: 'existing' } } }));
    codegraph.registerMcp(['claude'], tmpHome);
    const content = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(content.mcpServers.existing, 'Existing entry must be preserved');
    assert.ok(content.mcpServers.codegraph, 'codegraph entry must be added');
  });
});

// ── registerMcp — cursor ──────────────────────────────────────────────────────

describe('registerMcp — cursor IDE: writes mcpServers.codegraph to mcp.json', () => {
  let tmpHome;
  beforeEach(() => { tmpHome = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('no-op when .cursor/ directory does not exist', () => {
    assert.doesNotThrow(() => codegraph.registerMcp(['cursor'], tmpHome));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.cursor')));
  });

  test('writes mcpServers.codegraph to mcp.json when .cursor/ exists', () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true });
    codegraph.registerMcp(['cursor'], tmpHome);
    const mcpPath = path.join(tmpHome, '.cursor', 'mcp.json');
    assert.ok(fs.existsSync(mcpPath), 'mcp.json must be created');
    const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    assert.ok(content.mcpServers.codegraph);
    assert.equal(content.mcpServers.codegraph.command, 'codegraph');
  });

  test('idempotent: second call does not duplicate the entry', () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true });
    codegraph.registerMcp(['cursor'], tmpHome);
    codegraph.registerMcp(['cursor'], tmpHome);
    const mcpPath = path.join(tmpHome, '.cursor', 'mcp.json');
    const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    assert.ok(content.mcpServers.codegraph);
  });
});

// ── registerMcp — opencode ────────────────────────────────────────────────────

describe('registerMcp — opencode IDE: writes mcp.codegraph to opencode.jsonc', () => {
  let tmpHome;
  beforeEach(() => { tmpHome = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('creates global config dir and writes opencode.jsonc when absent', () => {
    const { globalOpenCodeDir } = require('../lib/global-paths');
    const openCodeDir = globalOpenCodeDir(tmpHome);
    assert.ok(!fs.existsSync(openCodeDir));
    assert.doesNotThrow(() => codegraph.registerMcp(['opencode'], tmpHome));
    const configPath = path.join(openCodeDir, 'opencode.jsonc');
    assert.ok(fs.existsSync(configPath), 'opencode.jsonc must be created');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(content.mcp, 'mcp object must exist');
    assert.ok(content.mcp.codegraph, 'mcp.codegraph must exist');
    assert.equal(content.mcp.codegraph.type, 'local');
    assert.ok(Array.isArray(content.mcp.codegraph.command));
  });

  test('writes mcp.codegraph to opencode.jsonc when config dir already exists', () => {
    const { globalOpenCodeDir } = require('../lib/global-paths');
    const openCodeDir = globalOpenCodeDir(tmpHome);
    fs.mkdirSync(openCodeDir, { recursive: true });
    codegraph.registerMcp(['opencode'], tmpHome);
    const configPath = path.join(openCodeDir, 'opencode.jsonc');
    assert.ok(fs.existsSync(configPath), 'opencode.jsonc must be created');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(content.mcp.codegraph);
  });

  test('idempotent: second call does not overwrite the entry', () => {
    const { globalOpenCodeDir } = require('../lib/global-paths');
    const openCodeDir = globalOpenCodeDir(tmpHome);
    fs.mkdirSync(openCodeDir, { recursive: true });
    codegraph.registerMcp(['opencode'], tmpHome);
    codegraph.registerMcp(['opencode'], tmpHome);
    const content = JSON.parse(fs.readFileSync(path.join(openCodeDir, 'opencode.jsonc'), 'utf8'));
    assert.ok(content.mcp.codegraph);
  });
});

// ── registerMcp — codex ───────────────────────────────────────────────────────

describe('registerMcp — codex IDE: writes mcp_servers.codegraph to config.toml', () => {
  let tmpHome;
  beforeEach(() => { tmpHome = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('no-op when .codex/ directory does not exist', () => {
    assert.doesNotThrow(() => codegraph.registerMcp(['codex'], tmpHome));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.codex')));
  });

  test('writes mcp_servers.codegraph to config.toml when .codex/ exists', () => {
    fs.mkdirSync(path.join(tmpHome, '.codex'), { recursive: true });
    codegraph.registerMcp(['codex'], tmpHome);
    const tomlPath = path.join(tmpHome, '.codex', 'config.toml');
    assert.ok(fs.existsSync(tomlPath), 'config.toml must be created');
    const smolToml = require('smol-toml');
    const content = smolToml.parse(fs.readFileSync(tomlPath, 'utf8'));
    assert.ok(content.mcp_servers, 'mcp_servers must exist');
    assert.ok(content.mcp_servers.codegraph, 'mcp_servers.codegraph must exist');
    assert.equal(content.mcp_servers.codegraph.command, 'codegraph');
  });

  test('idempotent: second call does not duplicate the entry', () => {
    fs.mkdirSync(path.join(tmpHome, '.codex'), { recursive: true });
    codegraph.registerMcp(['codex'], tmpHome);
    codegraph.registerMcp(['codex'], tmpHome);
    const tomlPath = path.join(tmpHome, '.codex', 'config.toml');
    const smolToml = require('smol-toml');
    const content = smolToml.parse(fs.readFileSync(tomlPath, 'utf8'));
    assert.ok(content.mcp_servers.codegraph);
  });
});

// ── registerMcp — multi-IDE and edge cases ────────────────────────────────────

describe('registerMcp — multi-IDE and edge cases', () => {
  let tmpHome;
  beforeEach(() => { tmpHome = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }); });

  test('registers multiple IDEs in one call', () => {
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true });
    codegraph.registerMcp(['claude', 'cursor'], tmpHome);
    const claudeSettings = JSON.parse(fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf8'));
    const cursorMcp = JSON.parse(fs.readFileSync(path.join(tmpHome, '.cursor', 'mcp.json'), 'utf8'));
    assert.ok(claudeSettings.mcpServers.codegraph);
    assert.ok(cursorMcp.mcpServers.codegraph);
  });

  test('does not throw for empty array', () => {
    assert.doesNotThrow(() => codegraph.registerMcp([], tmpHome));
  });

  test('does not throw for non-array input', () => {
    assert.doesNotThrow(() => codegraph.registerMcp(null, tmpHome));
    assert.doesNotThrow(() => codegraph.registerMcp(undefined, tmpHome));
  });

  test('unknown IDE name is silently ignored', () => {
    assert.doesNotThrow(() => codegraph.registerMcp(['unknownide'], tmpHome));
  });

  test('never throws even if home dir is invalid', () => {
    assert.doesNotThrow(() => codegraph.registerMcp(['claude', 'cursor'], '/nonexistent/path'));
  });
});

// ── isStale ───────────────────────────────────────────────────────────────────

describe('isStale — detects commits since last codegraph init', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  test('returns false when .codegraph/ does not exist', () => {
    assert.equal(codegraph.isStale(tmpDir), false);
  });

  test('returns false when .codegraph/ exists but no last-init timestamp and no git', () => {
    fs.mkdirSync(path.join(tmpDir, '.codegraph'), { recursive: true });
    // No git in tmpDir — should not throw, should return false
    assert.doesNotThrow(() => codegraph.isStale(tmpDir));
    assert.equal(codegraph.isStale(tmpDir), false);
  });

  test('returns false when last-init timestamp is in the future (no newer commits)', () => {
    const cgDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(cgDir, { recursive: true });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    fs.writeFileSync(path.join(cgDir, '.refacil-last-init'), future);
    // No git commits after a future date
    assert.equal(codegraph.isStale(tmpDir), false);
  });

  test('never throws for any input', () => {
    assert.doesNotThrow(() => codegraph.isStale(tmpDir));
    assert.doesNotThrow(() => codegraph.isStale('/nonexistent/path'));
    assert.doesNotThrow(() => codegraph.isStale(''));
  });

  test('init() writes the .refacil-last-init timestamp file', () => {
    const cgDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(cgDir, { recursive: true });
    // init() may spawn a background process that fails — that is OK
    assert.doesNotThrow(() => codegraph.init(tmpDir));
    const lastInitPath = path.join(cgDir, '.refacil-last-init');
    assert.ok(fs.existsSync(lastInitPath), '.refacil-last-init must be written by init()');
    const ts = new Date(fs.readFileSync(lastInitPath, 'utf8').trim());
    assert.ok(!isNaN(ts.getTime()), 'timestamp must be a valid ISO date');
  });
});

// ── isVersionBelow — pure dotted-version comparison ────────────────────────────

describe('isVersionBelow — strict lower-than for x.y.z versions', () => {
  test('lower patch is below', () => {
    assert.equal(codegraph.isVersionBelow('0.7.9', '0.9.9'), true);
    assert.equal(codegraph.isVersionBelow('0.9.8', '0.9.9'), true);
  });

  test('equal version is NOT below', () => {
    assert.equal(codegraph.isVersionBelow('0.9.9', '0.9.9'), false);
  });

  test('higher version is NOT below', () => {
    assert.equal(codegraph.isVersionBelow('0.10.0', '0.9.9'), false);
    assert.equal(codegraph.isVersionBelow('1.0.0', '0.9.9'), false);
    assert.equal(codegraph.isVersionBelow('0.9.10', '0.9.9'), false);
  });

  test('compares numerically, not lexically (10 > 9)', () => {
    assert.equal(codegraph.isVersionBelow('0.9.10', '0.9.9'), false);
    assert.equal(codegraph.isVersionBelow('0.9.2', '0.9.10'), true);
  });

  test('malformed segments are treated as 0 and never throw', () => {
    assert.doesNotThrow(() => codegraph.isVersionBelow('garbage', '0.9.9'));
    assert.equal(codegraph.isVersionBelow('garbage', '0.9.9'), true); // 0.0.0 < 0.9.9
    assert.equal(codegraph.isVersionBelow('', '0.0.0'), false);
  });
});

// ── installedVersion / isOutdated / upgrade — non-throwing contracts ───────────

describe('installedVersion — returns version string or null, never throws', () => {
  test('returns a string or null', () => {
    const v = codegraph.installedVersion();
    assert.ok(v === null || typeof v === 'string');
  });

  test('when a string, looks like a dotted version', () => {
    const v = codegraph.installedVersion();
    if (typeof v === 'string') assert.match(v, /^\d+\.\d+\.\d+$/);
  });

  test('does not throw', () => {
    assert.doesNotThrow(() => codegraph.installedVersion());
  });
});

describe('isOutdated — boolean, consistent with installedVersion and MIN_VERSION', () => {
  test('returns a boolean and never throws', () => {
    assert.equal(typeof codegraph.isOutdated(), 'boolean');
    assert.doesNotThrow(() => codegraph.isOutdated());
  });

  test('returns false when codegraph is not installed (unknown version never triggers upgrade)', () => {
    if (codegraph.installedVersion() === null) {
      assert.equal(codegraph.isOutdated(), false);
    }
  });

  test('agrees with isVersionBelow against MIN_VERSION when installed', () => {
    const v = codegraph.installedVersion();
    if (typeof v === 'string') {
      assert.equal(codegraph.isOutdated(), codegraph.isVersionBelow(v, codegraph.MIN_VERSION));
    }
  });

  test('respects an explicit floor override', () => {
    // Floor 0.0.0 can never be above any real install → never outdated
    assert.equal(codegraph.isOutdated('0.0.0'), false);
  });
});

describe('MIN_VERSION — exported version floor', () => {
  test('is a dotted version string', () => {
    assert.match(codegraph.MIN_VERSION, /^\d+\.\d+\.\d+$/);
  });
});

describe('WATCHER_VERSION — version that ships the auto-sync daemon', () => {
  test('is a dotted version string', () => {
    assert.match(codegraph.WATCHER_VERSION, /^\d+\.\d+\.\d+$/);
  });
});

describe('hasAutoSync — daemon keeps the graph fresh on its own', () => {
  test('returns a boolean and never throws', () => {
    assert.equal(typeof codegraph.hasAutoSync(), 'boolean');
    assert.doesNotThrow(() => codegraph.hasAutoSync());
  });

  test('false when codegraph is not installed (unknown version → keep manual refresh)', () => {
    if (codegraph.installedVersion() === null) {
      assert.equal(codegraph.hasAutoSync(), false);
    }
  });

  test('agrees with WATCHER_VERSION comparison when installed', () => {
    const v = codegraph.installedVersion();
    if (typeof v === 'string') {
      // hasAutoSync is true exactly when the install is NOT below the watcher floor
      assert.equal(codegraph.hasAutoSync(), !codegraph.isVersionBelow(v, codegraph.WATCHER_VERSION));
    }
  });
});
