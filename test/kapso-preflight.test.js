'use strict';

/**
 * Tests for imp-autopilot-gate-kapso — T-08
 * Verifies preflight() behavior and the kapso preflight CLI subcommand
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'bin', 'cli.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const KAPSO_ENV_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const KAPSO_ENV_FILE = path.join(KAPSO_ENV_DIR, 'kapso.env');

let originalEnvContent = null;
let envBackedUp = false;

function backupEnv() {
  if (fs.existsSync(KAPSO_ENV_FILE)) {
    originalEnvContent = fs.readFileSync(KAPSO_ENV_FILE, 'utf8');
    envBackedUp = true;
  } else {
    envBackedUp = false;
  }
}

function restoreEnv() {
  if (envBackedUp && originalEnvContent !== null) {
    fs.mkdirSync(KAPSO_ENV_DIR, { recursive: true });
    fs.writeFileSync(KAPSO_ENV_FILE, originalEnvContent, 'utf8');
  } else if (!envBackedUp && fs.existsSync(KAPSO_ENV_FILE)) {
    // We created the file during the test, remove it
    fs.unlinkSync(KAPSO_ENV_FILE);
  }
}

function writeTestEnv(content) {
  fs.mkdirSync(KAPSO_ENV_DIR, { recursive: true });
  fs.writeFileSync(KAPSO_ENV_FILE, content, 'utf8');
}

function removeEnv() {
  if (fs.existsSync(KAPSO_ENV_FILE)) {
    fs.unlinkSync(KAPSO_ENV_FILE);
  }
}

// ── T-08: preflight() unit tests ──────────────────────────────────────────────

describe('T-08: kapso.preflight() — credentials present', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv(
      'KAPSO_API_KEY=test-api-key-12345\nKAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n',
    );
  });

  afterEach(() => {
    restoreEnv();
    // Clear require cache so fresh read happens on next test
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('returns kapsoEnabled: true when credentials are present', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.kapsoEnabled, true, 'kapsoEnabled must be true when creds present');
  });

  test('returns notifyPhone when credentials are present', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(typeof result.notifyPhone, 'string', 'notifyPhone must be a string');
    assert.ok(result.notifyPhone.length > 0, 'notifyPhone must be non-empty');
  });

  test('returns preflightMessage when credentials are present', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(typeof result.preflightMessage, 'string', 'preflightMessage must be a string');
    assert.ok(result.preflightMessage.includes('24'), 'preflightMessage must mention 24h window');
  });
});

describe('T-08: kapso.preflight() — credentials absent', () => {
  beforeEach(() => {
    backupEnv();
    removeEnv();
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('returns kapsoEnabled: false when credentials are absent', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.kapsoEnabled, false, 'kapsoEnabled must be false when creds absent');
  });

  test('does not include notifyPhone when credentials are absent', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.notifyPhone, undefined, 'notifyPhone must be undefined when no creds');
  });
});

// ── T-08: CLI kapso preflight — output is parseable JSON, exit code 0 ─────────

describe('T-08: CLI kapso preflight — JSON output and exit code', () => {
  let envSetupDone = false;

  beforeEach(() => {
    backupEnv();
    writeTestEnv(
      'KAPSO_API_KEY=test-api-key-12345\nKAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n',
    );
    envSetupDone = true;
  });

  afterEach(() => {
    restoreEnv();
    envSetupDone = false;
  });

  test('kapso preflight exits with code 0', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, 'kapso preflight must exit with code 0');
  });

  test('kapso preflight output is parseable JSON', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, 'must exit 0');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(result.stdout.trim());
    }, 'stdout must be valid JSON');
    assert.ok(typeof parsed === 'object', 'parsed output must be an object');
  });

  test('kapso preflight output contains kapsoEnabled field', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok('kapsoEnabled' in parsed, 'output must have kapsoEnabled field');
  });

  // IMP-3: forward-compatibility guard — explicit --json flag must produce identical output
  test('kapso preflight --json produces same output as without --json flag', () => {
    const withoutFlag = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const withFlag = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight', '--json'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(withFlag.status, 0, 'kapso preflight --json must exit with code 0');
    assert.equal(
      withFlag.stdout.trim(),
      withoutFlag.stdout.trim(),
      'kapso preflight --json must produce the same JSON output as without the flag',
    );
  });
});

describe('T-08: CLI kapso preflight — exit code 0 even when creds absent', () => {
  beforeEach(() => {
    backupEnv();
    removeEnv();
  });

  afterEach(() => {
    // Restore any env file that existed before this test group ran.
    // No require-cache cleanup needed here: CLI tests use spawnSync (child process).
    restoreEnv();
  });

  test('kapso preflight exits with code 0 when credentials are absent', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, 'kapso preflight must always exit 0');
  });

  test('kapso preflight outputs kapsoEnabled: false when creds absent', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'kapso', 'preflight'],
      { encoding: 'utf8', timeout: 10000 },
    );
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.kapsoEnabled, false, 'kapsoEnabled must be false when creds absent');
  });
});

// ── GROUP 1: readCredentials() partial env edge cases ─────────────────────────

describe('1a: readCredentials() — missing KAPSO_API_KEY returns kapsoEnabled: false', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv('KAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflight returns kapsoEnabled: false when KAPSO_API_KEY is missing', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.kapsoEnabled, false, 'kapsoEnabled must be false when KAPSO_API_KEY is absent');
  });
});

describe('1b: readCredentials() — missing KAPSO_PHONE_NUMBER_ID returns kapsoEnabled: false', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv('KAPSO_API_KEY=test-api-key-12345\nNOTIFY_PHONE=+5731234567\n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflight returns kapsoEnabled: false when KAPSO_PHONE_NUMBER_ID is missing', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.kapsoEnabled, false, 'kapsoEnabled must be false when KAPSO_PHONE_NUMBER_ID is absent');
  });
});

describe('1c: readCredentials() — missing NOTIFY_PHONE returns kapsoEnabled: false', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv('KAPSO_API_KEY=test-api-key-12345\nKAPSO_PHONE_NUMBER_ID=12345678\n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflight returns kapsoEnabled: false when NOTIFY_PHONE is missing', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(result.kapsoEnabled, false, 'kapsoEnabled must be false when NOTIFY_PHONE is absent');
  });
});

describe('1d: readCredentials() — commented line does not count as credential', () => {
  beforeEach(() => {
    backupEnv();
    // Comment line must not be parsed as a real credential
    writeTestEnv('# KAPSO_API_KEY=foo\nKAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflight returns kapsoEnabled: false when KAPSO_API_KEY is only in a commented line', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(
      result.kapsoEnabled,
      false,
      'kapsoEnabled must be false — commented "# KAPSO_API_KEY=foo" must not be treated as a real credential',
    );
  });
});

describe('1e: readCredentials() — values with leading/trailing spaces are trimmed', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv('KAPSO_API_KEY= my-key \nKAPSO_PHONE_NUMBER_ID= 12345678 \nNOTIFY_PHONE= +5731234567 \n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflight returns kapsoEnabled: true when values have leading/trailing spaces', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.equal(
      result.kapsoEnabled,
      true,
      'kapsoEnabled must be true — .trim() must normalize values with surrounding spaces',
    );
  });
});

describe('1f: preflight() — preflightMessage mentions 24h window and WhatsApp/notification', () => {
  beforeEach(() => {
    backupEnv();
    writeTestEnv('KAPSO_API_KEY=test-api-key-12345\nKAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n');
  });

  afterEach(() => {
    restoreEnv();
    delete require.cache[require.resolve('../lib/kapso')];
  });

  test('preflightMessage contains "ventana" or "24"', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.ok(
      result.preflightMessage.includes('ventana') || result.preflightMessage.includes('24'),
      'preflightMessage must mention the 24h window concept',
    );
  });

  test('preflightMessage mentions "WhatsApp" or "notificación"', () => {
    const kapso = require('../lib/kapso');
    const result = kapso.preflight();
    assert.ok(
      result.preflightMessage.includes('WhatsApp') || result.preflightMessage.includes('notificaci'),
      'preflightMessage must mention WhatsApp or notification',
    );
  });
});

// ── GROUP 4a: notify() unknown type exits with code 1 (via child process) ─────

describe('4a: notify() unknown type exits with code 1', () => {
  // The inline script writes fake creds directly to the real kapso.env file.
  // Backup in the parent before spawning so the parent can restore after the
  // child process exits (the child has no restore logic of its own).
  beforeEach(() => {
    backupEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  test('kapso notify with unknown type exits with code 1', () => {
    // Run in a child process to avoid process.exit contaminating the test runner.
    // kapso.notify('invalid-type', {}) triggers process.exit(1) in the source.
    const script = `
      const kapso = require(${JSON.stringify(require.resolve('../lib/kapso'))});
      // Provide fake creds so notify() does not short-circuit due to missing credentials.
      // Patch readCredentials to return a fake creds object.
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const envDir = path.join(os.homedir(), '.refacil-sdd-ai');
      const envFile = path.join(envDir, 'kapso.env');
      fs.mkdirSync(envDir, { recursive: true });
      fs.writeFileSync(envFile, 'KAPSO_API_KEY=fake\\nKAPSO_PHONE_NUMBER_ID=fake\\nNOTIFY_PHONE=+5731234567\\n', 'utf8');
      kapso.notify('invalid-type', {}).catch(() => process.exit(2));
    `;
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, 'notify with unknown type must exit with code 1');
  });
});
