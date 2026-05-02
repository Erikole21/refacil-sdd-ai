'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { globalClaudeDir, globalCursorDir, globalOpenCodeDir, globalSddVersionPath, globalSelectedIDEsPath, readSelectedIDEs, writeSelectedIDEs } = require('../lib/global-paths');

// ── globalClaudeDir ──────────────────────────────────────────────────────────

describe('globalClaudeDir', () => {
  test('returns homeDir/.claude with explicit homeDir', () => {
    const result = globalClaudeDir('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.claude'));
  });

  test('uses os.homedir() when homeDir is omitted', () => {
    const os = require('os');
    const result = globalClaudeDir();
    assert.equal(result, path.join(os.homedir(), '.claude'));
  });

  test('uses os.homedir() when homeDir is null', () => {
    const os = require('os');
    const result = globalClaudeDir(null);
    assert.equal(result, path.join(os.homedir(), '.claude'));
  });

  test('Windows-style path works correctly', () => {
    const result = globalClaudeDir('C:\\Users\\TestUser');
    assert.equal(result, path.join('C:\\Users\\TestUser', '.claude'));
  });
});

// ── globalCursorDir ──────────────────────────────────────────────────────────

describe('globalCursorDir', () => {
  test('returns homeDir/.cursor with explicit homeDir', () => {
    const result = globalCursorDir('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.cursor'));
  });

  test('uses os.homedir() when homeDir is omitted', () => {
    const os = require('os');
    const result = globalCursorDir();
    assert.equal(result, path.join(os.homedir(), '.cursor'));
  });

  test('Windows-style path works correctly', () => {
    const result = globalCursorDir('C:\\Users\\TestUser');
    assert.equal(result, path.join('C:\\Users\\TestUser', '.cursor'));
  });
});

// ── globalOpenCodeDir ────────────────────────────────────────────────────────

describe('globalOpenCodeDir', () => {
  test('with explicit homeDir (no appDataDir): returns homeDir/.opencode on all platforms', () => {
    // When homeDir is injected for testing, always returns homeDir/.opencode
    const result = globalOpenCodeDir('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.opencode'));
  });

  test('with explicit appDataDir: returns appDataDir/opencode regardless of platform', () => {
    const result = globalOpenCodeDir('/home/testuser', '/custom/appdata');
    assert.equal(result, path.join('/custom/appdata', 'opencode'));
  });

  test('Windows appDataDir injection overrides homeDir', () => {
    const result = globalOpenCodeDir('C:\\Users\\Test', 'C:\\AppData\\Roaming');
    assert.equal(result, path.join('C:\\AppData\\Roaming', 'opencode'));
  });

  test('production default (no args): returns a non-empty string path ending with opencode', () => {
    const result = globalOpenCodeDir();
    assert.ok(typeof result === 'string' && result.length > 0);
    assert.ok(result.endsWith('opencode') || result.endsWith('opencode' + path.sep));
  });

  test('production default (null homeDir): returns a non-empty string path ending with opencode', () => {
    const result = globalOpenCodeDir(null, null);
    assert.ok(typeof result === 'string' && result.length > 0);
    assert.ok(result.endsWith('opencode') || result.endsWith('opencode' + path.sep));
  });
});

// ── globalSddVersionPath ─────────────────────────────────────────────────────

describe('globalSddVersionPath', () => {
  test('returns homeDir/.refacil-sdd-ai/sdd-version with explicit homeDir', () => {
    const result = globalSddVersionPath('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.refacil-sdd-ai', 'sdd-version'));
  });

  test('uses os.homedir() when homeDir is omitted', () => {
    const os = require('os');
    const result = globalSddVersionPath();
    assert.equal(result, path.join(os.homedir(), '.refacil-sdd-ai', 'sdd-version'));
  });

  test('path contains .refacil-sdd-ai segment', () => {
    const result = globalSddVersionPath('/tmp/testuser');
    assert.ok(result.includes('.refacil-sdd-ai'));
  });

  test('file name is sdd-version', () => {
    const result = globalSddVersionPath('/tmp/testuser');
    assert.equal(path.basename(result), 'sdd-version');
  });
});

// ── globalSelectedIDEsPath ───────────────────────────────────────────────────

describe('globalSelectedIDEsPath', () => {
  test('returns homeDir/.refacil-sdd-ai/selected-ides.json with explicit homeDir', () => {
    const result = globalSelectedIDEsPath('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.refacil-sdd-ai', 'selected-ides.json'));
  });

  test('uses os.homedir() when homeDir is omitted', () => {
    const os = require('os');
    const result = globalSelectedIDEsPath();
    assert.equal(result, path.join(os.homedir(), '.refacil-sdd-ai', 'selected-ides.json'));
  });
});

// ── readSelectedIDEs / writeSelectedIDEs ─────────────────────────────────────

describe('readSelectedIDEs / writeSelectedIDEs', () => {
  const os = require('os');
  const fs = require('fs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-test-'));

  test('returns null when file does not exist', () => {
    const result = readSelectedIDEs(path.join(tmpDir, 'nonexistent'));
    assert.equal(result, null);
  });

  test('write then read round-trips the array', () => {
    writeSelectedIDEs(['.claude', '.cursor'], tmpDir);
    const result = readSelectedIDEs(tmpDir);
    assert.deepEqual(result, ['.claude', '.cursor']);
  });

  test('returns null for invalid JSON content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-bad-'));
    fs.mkdirSync(path.join(dir, '.refacil-sdd-ai'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.refacil-sdd-ai', 'selected-ides.json'), 'not-json');
    assert.equal(readSelectedIDEs(dir), null);
  });

  test('returns null when content is not an array', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-obj-'));
    fs.mkdirSync(path.join(dir, '.refacil-sdd-ai'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.refacil-sdd-ai', 'selected-ides.json'), JSON.stringify({ ide: '.claude' }));
    assert.equal(readSelectedIDEs(dir), null);
  });

  test('writeSelectedIDEs creates the directory if it does not exist', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-fresh-'));
    writeSelectedIDEs(['.opencode'], freshDir);
    assert.ok(fs.existsSync(path.join(freshDir, '.refacil-sdd-ai', 'selected-ides.json')));
  });
});
