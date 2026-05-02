'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Returns the global Claude Code user directory.
 * Always ~/.claude regardless of OS.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string}
 */
function globalClaudeDir(homeDir) {
  return path.join(homeDir || os.homedir(), '.claude');
}

/**
 * Returns the global Cursor user directory.
 * Always ~/.cursor regardless of OS.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string}
 */
function globalCursorDir(homeDir) {
  return path.join(homeDir || os.homedir(), '.cursor');
}

/**
 * Returns the global OpenCode user directory.
 * Production paths:
 *   Windows: %APPDATA%\opencode (falls back to ~/AppData/Roaming/opencode)
 *   macOS/Linux: ~/.config/opencode
 * Test injection:
 *   When appDataDir is explicitly provided, uses appDataDir\opencode (Windows-style).
 *   When only homeDir is explicitly provided (no appDataDir), uses homeDir/.opencode
 *   for cross-platform test portability.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @param {string} [appDataDir] - injectable Windows APPDATA dir for testing
 * @returns {string}
 */
function globalOpenCodeDir(homeDir, appDataDir) {
  // When appDataDir is explicitly provided, always use appDataDir\opencode
  if (appDataDir) {
    return path.join(appDataDir, 'opencode');
  }

  // When homeDir is explicitly provided (test injection without appDataDir),
  // always use homeDir/.opencode for cross-platform test portability
  if (homeDir) {
    return path.join(homeDir, '.opencode');
  }

  // Production default (no injection)
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'opencode');
  }
  return path.join(os.homedir(), '.config', 'opencode');
}

/**
 * Returns the path to the global SDD version file (~/.refacil-sdd-ai/sdd-version).
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string}
 */
function globalSddVersionPath(homeDir) {
  return path.join(homeDir || os.homedir(), '.refacil-sdd-ai', 'sdd-version');
}

/**
 * Returns the path to the persisted IDE selection file (~/.refacil-sdd-ai/selected-ides.json).
 * @param {string} [homeDir] - injectable for testing
 * @returns {string}
 */
function globalSelectedIDEsPath(homeDir) {
  return path.join(homeDir || os.homedir(), '.refacil-sdd-ai', 'selected-ides.json');
}

/**
 * Reads the persisted IDE selection. Returns null if the file does not exist or is invalid.
 * @param {string} [homeDir]
 * @returns {string[]|null}
 */
function readSelectedIDEs(homeDir) {
  try {
    const content = fs.readFileSync(globalSelectedIDEsPath(homeDir), 'utf8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return null;
}

/**
 * Persists the IDE selection to ~/.refacil-sdd-ai/selected-ides.json.
 * @param {string[]} ides
 * @param {string} [homeDir]
 */
function writeSelectedIDEs(ides, homeDir) {
  const dir = path.join(homeDir || os.homedir(), '.refacil-sdd-ai');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(globalSelectedIDEsPath(homeDir), JSON.stringify(ides), 'utf8');
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not persist IDE selection: ${err.message}\n`);
  }
}

module.exports = {
  globalClaudeDir,
  globalCursorDir,
  globalOpenCodeDir,
  globalSddVersionPath,
  globalSelectedIDEsPath,
  readSelectedIDEs,
  writeSelectedIDEs,
};
