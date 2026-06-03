'use strict';

/**
 * Tests for the kapso notify validation guard.
 *
 * Root cause it protects against: autopilot sometimes fires `kapso notify` once
 * with unfilled <placeholder>/empty flags (sending a junk WhatsApp message) and
 * again with real values. The guard rejects the incomplete call so it never
 * reaches the WhatsApp API.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

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
    fs.unlinkSync(KAPSO_ENV_FILE);
  }
}

function writeCreds() {
  fs.mkdirSync(KAPSO_ENV_DIR, { recursive: true });
  fs.writeFileSync(
    KAPSO_ENV_FILE,
    'KAPSO_API_KEY=test-key\nKAPSO_PHONE_NUMBER_ID=12345678\nNOTIFY_PHONE=+5731234567\n',
    'utf8',
  );
}

// ── validateNotifyOpts (pure) ─────────────────────────────────────────────────

describe('validateNotifyOpts — success payload', () => {
  const kapso = require('../lib/kapso');

  const valid = {
    repo: 'refacil-ia',
    change: 'imp-foo',
    branch: 'feature/imp-foo',
    tasks: '5/5',
  };

  test('accepts a complete success payload', () => {
    assert.deepEqual(kapso.validateNotifyOpts('success', valid), []);
  });

  test('rejects an unfilled <placeholder> in change', () => {
    const problems = kapso.validateNotifyOpts('success', { ...valid, change: '<changeName>' });
    assert.ok(problems.some((p) => p.includes('--change')), 'must flag --change placeholder');
  });

  test('rejects an empty repo', () => {
    const problems = kapso.validateNotifyOpts('success', { ...valid, repo: '' });
    assert.ok(problems.some((p) => p.includes('--repo')), 'must flag empty --repo');
  });

  test('rejects a missing branch', () => {
    const { branch, ...withoutBranch } = valid;
    const problems = kapso.validateNotifyOpts('success', withoutBranch);
    assert.ok(problems.some((p) => p.includes('--branch')), 'must flag missing --branch');
  });

  test('rejects malformed tasks (not done/total)', () => {
    const problems = kapso.validateNotifyOpts('success', { ...valid, tasks: 'todo listo' });
    assert.ok(problems.some((p) => p.includes('--tasks')), 'must flag malformed --tasks');
  });

  test('accepts tasks in done/total form', () => {
    assert.deepEqual(kapso.validateNotifyOpts('success', { ...valid, tasks: '12/12' }), []);
  });
});

describe('validateNotifyOpts — failure payload', () => {
  const kapso = require('../lib/kapso');

  const valid = {
    repo: 'refacil-ia',
    change: 'imp-foo',
    branch: 'feature/imp-foo',
    phase: 'verify',
  };

  test('accepts a complete failure payload', () => {
    assert.deepEqual(kapso.validateNotifyOpts('failure', valid), []);
  });

  test('rejects a missing phase', () => {
    const { phase, ...withoutPhase } = valid;
    const problems = kapso.validateNotifyOpts('failure', withoutPhase);
    assert.ok(problems.some((p) => p.includes('--phase')), 'must flag missing --phase');
  });

  test('does not require tasks on failure', () => {
    assert.deepEqual(kapso.validateNotifyOpts('failure', valid), []);
  });
});

describe('isBlankOrPlaceholder', () => {
  const kapso = require('../lib/kapso');

  test('treats null/undefined/empty/whitespace as blank', () => {
    assert.equal(kapso.isBlankOrPlaceholder(null), true);
    assert.equal(kapso.isBlankOrPlaceholder(undefined), true);
    assert.equal(kapso.isBlankOrPlaceholder(''), true);
    assert.equal(kapso.isBlankOrPlaceholder('   '), true);
  });

  test('treats <placeholder> tokens as blank', () => {
    assert.equal(kapso.isBlankOrPlaceholder('<repoSlug>'), true);
    assert.equal(kapso.isBlankOrPlaceholder('feature/<changeName>'), true);
  });

  test('treats real values as non-blank', () => {
    assert.equal(kapso.isBlankOrPlaceholder('refacil-ia'), false);
    assert.equal(kapso.isBlankOrPlaceholder('5/5'), false);
  });
});

// ── notify() rejects without sending ──────────────────────────────────────────

describe('notify() — rejects incomplete payloads before sending', () => {
  const kapso = require('../lib/kapso');

  beforeEach(() => {
    backupEnv();
    writeCreds(); // creds present so the rejection is proven to come from validation, not missing creds
  });

  afterEach(() => {
    restoreEnv();
  });

  test('rejects (throws) when success payload has placeholders', async () => {
    await assert.rejects(
      () =>
        kapso.notify('success', {
          repo: '<repoSlug>',
          change: '<changeName>',
          branch: '<branchAtStart>',
          tasks: '<tasks.done>/<tasks.total>',
        }),
      /datos inválidos o incompletos/,
    );
  });

  test('rejects (throws) when failure payload is empty', async () => {
    await assert.rejects(() => kapso.notify('failure', {}), /datos inválidos o incompletos/);
  });
});
