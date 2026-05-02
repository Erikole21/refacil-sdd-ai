'use strict';

const { spawnSync } = require('child_process');

/**
 * Detects which IDEs are installed on the current system.
 * Uses `where` on Windows and `which` on macOS/Linux.
 * Error-tolerant: catches per-IDE errors silently.
 * @returns {string[]} subset of ['claude', 'cursor', 'opencode']
 */
function detectInstalledIDEs() {
  const candidates = [
    { id: 'claude', cmd: 'claude' },
    { id: 'cursor', cmd: 'cursor' },
    { id: 'opencode', cmd: 'opencode' },
  ];

  const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
  const detected = [];

  for (const { id, cmd } of candidates) {
    const result = spawnSync(lookupCmd, [cmd], { stdio: 'pipe', timeout: 5000 });
    if (result.status === 0 && !result.error) {
      detected.push(id);
    }
  }

  return detected;
}

module.exports = { detectInstalledIDEs };
