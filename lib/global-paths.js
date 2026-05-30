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
 * Returns legacy OpenCode config directories that may contain pre-migration artifacts.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string[]}
 */
function legacyOpenCodeDirs(homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const dirs = [path.join(resolvedHome, '.opencode')];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(resolvedHome, 'AppData', 'Roaming');
    dirs.push(path.join(appData, 'opencode'));
  }
  return dirs;
}

/**
 * Returns the global OpenCode user directory (official upstream path).
 * Production:
 *   - OPENCODE_CONFIG_DIR when set (absolute)
 *   - Otherwise ~/.config/opencode on all platforms (Windows: %USERPROFILE%\.config\opencode)
 * Test injection:
 *   When homeDir is explicitly provided, returns homeDir/.config/opencode.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string}
 */
function globalOpenCodeDir(homeDir) {
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (envDir && String(envDir).trim()) {
    return path.resolve(envDir.trim());
  }

  if (homeDir) {
    return path.join(homeDir, '.config', 'opencode');
  }

  return path.join(os.homedir(), '.config', 'opencode');
}

/**
 * When OPENCODE_CONFIG_DIR is set, verify the directory exists and is writable.
 * Emits a clear stderr message on failure. No-op when the env var is unset.
 * @returns {boolean} true when OpenCode global installs may proceed
 */
function validateOpenCodeConfigDir() {
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (!envDir || !String(envDir).trim()) return true;

  const dir = path.resolve(envDir.trim());
  if (!fs.existsSync(dir)) {
    process.stderr.write(
      `[refacil-sdd-ai] OPENCODE_CONFIG_DIR is not accessible: directory does not exist: ${dir}\n`,
    );
    return false;
  }

  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    process.stderr.write(
      `[refacil-sdd-ai] OPENCODE_CONFIG_DIR is not writable: ${dir} (${err.message})\n`,
    );
    return false;
  }

  return true;
}

/**
 * Returns the global Codex CLI user directory.
 * Always ~/.codex regardless of OS.
 * @param {string} [homeDir] - injectable for testing (default: os.homedir())
 * @returns {string}
 */
function globalCodexDir(homeDir) {
  return path.join(homeDir || os.homedir(), '.codex');
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
  validateOpenCodeConfigDir,
  legacyOpenCodeDirs,
  globalCodexDir,
  globalSddVersionPath,
  globalSelectedIDEsPath,
  readSelectedIDEs,
  writeSelectedIDEs,
};
