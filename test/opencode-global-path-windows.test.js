'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('os');

const { globalOpenCodeDir } = require('../lib/global-paths');

describe('globalOpenCodeDir Windows production path (CA-16)', () => {
  const savedPlatform = process.platform;
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedOpencodeConfig = process.env.OPENCODE_CONFIG_DIR;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    delete process.env.OPENCODE_CONFIG_DIR;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true });
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedOpencodeConfig === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = savedOpencodeConfig;
  });

  test('without homeDir injection resolves to USERPROFILE/.config/opencode', () => {
    const fakeProfile = path.join(os.tmpdir(), 'refacil-win-user');
    process.env.USERPROFILE = fakeProfile;
    process.env.HOME = fakeProfile;

    const result = globalOpenCodeDir();
    const expected = path.join(fakeProfile, '.config', 'opencode');

    assert.equal(result, expected);
    assert.ok(result.endsWith(path.join('.config', 'opencode')));
    assert.ok(!result.endsWith(path.join('AppData', 'Roaming', 'opencode')));
  });
});
