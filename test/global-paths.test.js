'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  globalClaudeDir,
  globalCursorDir,
  globalOpenCodeDir,
  validateOpenCodeConfigDir,
  legacyOpenCodeDirs,
  globalSddVersionPath,
  globalSelectedIDEsPath,
  readSelectedIDEs,
  writeSelectedIDEs,
} = require('../lib/global-paths');

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
  test('with explicit homeDir: returns homeDir/.config/opencode on all platforms', () => {
    const result = globalOpenCodeDir('/home/testuser');
    assert.equal(result, path.join('/home/testuser', '.config', 'opencode'));
  });

  test('honors OPENCODE_CONFIG_DIR when set', () => {
    const custom = path.join('/tmp', 'custom-opencode');
    const prev = process.env.OPENCODE_CONFIG_DIR;
    process.env.OPENCODE_CONFIG_DIR = custom;
    try {
      assert.equal(globalOpenCodeDir(), path.resolve(custom));
    } finally {
      if (prev === undefined) delete process.env.OPENCODE_CONFIG_DIR;
      else process.env.OPENCODE_CONFIG_DIR = prev;
    }
  });

  test('production default (no args): returns a non-empty string path ending with opencode', () => {
    const result = globalOpenCodeDir();
    assert.ok(typeof result === 'string' && result.length > 0);
    assert.ok(result.endsWith(path.join('.config', 'opencode')) || result.endsWith('opencode'));
  });

  test('production default (null homeDir): returns homeDir/.config/opencode', () => {
    const os = require('os');
    const result = globalOpenCodeDir(null);
    assert.equal(result, path.join(os.homedir(), '.config', 'opencode'));
  });
});

describe('validateOpenCodeConfigDir — CR-01', () => {
  const saved = process.env.OPENCODE_CONFIG_DIR;
  let stderrBuf;

  afterEach(() => {
    if (saved === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = saved;
  });

  beforeEach(() => {
    stderrBuf = '';
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...args) => {
      stderrBuf += String(chunk);
      return orig(chunk, ...args);
    };
  });

  test('returns true when OPENCODE_CONFIG_DIR is unset', () => {
    delete process.env.OPENCODE_CONFIG_DIR;
    assert.equal(validateOpenCodeConfigDir(), true);
  });

  test('returns false with stderr when directory does not exist', () => {
    const os = require('os');
    const missing = path.join(os.tmpdir(), 'refacil-nonexistent-opencode-config');
    process.env.OPENCODE_CONFIG_DIR = missing;
    assert.equal(validateOpenCodeConfigDir(), false);
    assert.match(stderrBuf, /OPENCODE_CONFIG_DIR is not accessible/);
    assert.match(stderrBuf, /does not exist/);
  });

  test('installSkills skips OpenCode install when OPENCODE_CONFIG_DIR is invalid', () => {
    const fs = require('fs');
    const os = require('os');
    const { installSkills } = require('../lib/installer');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-oc-invalid-'));
    try {
      process.env.OPENCODE_CONFIG_DIR = path.join(home, 'missing-opencode-root');
      installSkills(path.resolve(__dirname, '..'), home, ['opencode']);
      assert.ok(!fs.existsSync(path.join(globalOpenCodeDir(home), 'skills')));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('returns false with stderr when OPENCODE_CONFIG_DIR is not writable', () => {
    const fs = require('fs');
    const os = require('os');
    const { installSkills } = require('../lib/installer');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-oc-ro-'));
    const roDir = path.join(home, 'readonly-opencode');
    fs.mkdirSync(roDir, { recursive: true });
    if (process.platform === 'win32') {
      const { spawnSync: spawn } = require('node:child_process');
      spawn('attrib', ['+R', roDir], { shell: true });
    } else {
      fs.chmodSync(roDir, 0o500);
    }
    try {
      process.env.OPENCODE_CONFIG_DIR = roDir;
      const valid = validateOpenCodeConfigDir();
      if (process.platform === 'win32' && valid) {
        // Windows ACLs may still allow owner write; assert install skip via invalid path instead
        process.env.OPENCODE_CONFIG_DIR = path.join(home, 'missing-opencode-root');
        assert.equal(validateOpenCodeConfigDir(), false);
        installSkills(path.resolve(__dirname, '..'), home, ['claude', 'opencode']);
        assert.ok(fs.existsSync(path.join(globalClaudeDir(home), 'skills')));
        assert.ok(!fs.existsSync(path.join(globalOpenCodeDir(home), 'skills')));
        return;
      }
      assert.equal(valid, false);
      assert.match(stderrBuf, /not writable/i);
      installSkills(path.resolve(__dirname, '..'), home, ['claude', 'opencode']);
      assert.ok(fs.existsSync(path.join(globalClaudeDir(home), 'skills')));
      assert.ok(!fs.existsSync(path.join(globalOpenCodeDir(home), 'skills')));
    } finally {
      if (process.platform === 'win32') {
        const { spawnSync: spawn } = require('node:child_process');
        spawn('attrib', ['-R', roDir], { shell: true });
      } else {
        fs.chmodSync(roDir, 0o700);
      }
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('legacyOpenCodeDirs', () => {
  test('includes homeDir/.opencode', () => {
    const dirs = legacyOpenCodeDirs('/home/testuser');
    assert.ok(dirs.includes(path.join('/home/testuser', '.opencode')));
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
