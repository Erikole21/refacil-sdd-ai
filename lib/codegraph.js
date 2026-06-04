'use strict';

/**
 * CodeGraph abstraction layer.
 *
 * Wraps @colbymchenry/codegraph as an optional dependency.
 * Never throws to the caller — all errors are swallowed silently.
 *
 * IDE support matrix (MCP registration):
 *   - Claude Code  : ~/.claude/settings.json          → mcpServers.codegraph
 *   - Cursor       : ~/.cursor/mcp.json                → mcpServers.codegraph
 *   - OpenCode     : <globalOpenCodeDir>/opencode.jsonc → mcp.codegraph
 *   - Codex        : ~/.codex/config.toml              → mcp_servers.codegraph
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Check whether @colbymchenry/codegraph is installed in the current Node.js resolution chain.
 * @returns {boolean}
 */
function isInstalled() {
  try {
    const { spawnSync } = require('child_process');
    // shell: true is required on Windows where npm binaries are installed as .cmd files
    const result = spawnSync('codegraph', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      shell: true,
    });
    return result.status === 0;
  } catch (_) {
    return false;
  }
}

/**
 * Check whether the given repo path has already been indexed by CodeGraph.
 * A repo is considered indexed when a `.codegraph/` directory exists at its root.
 * @param {string} repoPath - absolute path to the project root
 * @returns {boolean}
 */
function isInitialized(repoPath) {
  try {
    return fs.existsSync(path.join(repoPath, '.codegraph'));
  } catch (_) {
    return false;
  }
}

/** Timestamp file written inside .codegraph/ each time we trigger init. */
const LAST_INIT_FILE = '.codegraph/.refacil-last-init';

/**
 * Spawn a background CodeGraph indexing process for the given repo.
 * Uses the global `codegraph` CLI binary (shell: true for Windows .cmd support).
 * Also writes a timestamp so isStale() can compare against git history.
 * Fire-and-forget — returns immediately. Never throws.
 * @param {string} repoPath - absolute path to the project root
 */
function init(repoPath) {
  try {
    const { spawn } = require('child_process');
    // `codegraph init` creates .codegraph/ (structure only, 0 nodes).
    // `codegraph index` builds the actual graph (must run after init).
    // For first-time: chain both commands so the graph is built in one shot.
    // For re-index:   only `codegraph index` (structure already exists).
    const cgDir = path.join(repoPath, '.codegraph');
    const isFirstTime = !fs.existsSync(cgDir);
    // Use shell chaining (&&) so the second command only runs if the first succeeds.
    const cmd = isFirstTime ? 'codegraph init && codegraph index' : 'codegraph index';
    const child = spawn(cmd, [], {
      detached: true,
      stdio: 'ignore',
      shell: true,        // required for && chaining and Windows .cmd binaries
      windowsHide: true,  // suppress console window pop-ups on Windows
      cwd: repoPath,
    });
    child.unref();
    // Update the timestamp on re-index (.codegraph/ exists). For first-time,
    // the directory does not exist yet so we skip — isStale() falls back to mtime.
    if (!isFirstTime) {
      fs.writeFileSync(path.join(cgDir, '.refacil-last-init'), new Date().toISOString());
    }
  } catch (_) {
    // Swallow: CodeGraph not installed, spawn failed, or fs write failed
  }
}

/**
 * Return true when there are git commits newer than the last time we triggered
 * `codegraph init` for this repo. Always returns false when git is unavailable,
 * the repo has no commits, or any error occurs — never blocks, never throws.
 * @param {string} repoPath - absolute path to the project root
 * @returns {boolean}
 */
function isStale(repoPath) {
  try {
    // Determine the reference date: prefer our timestamp file, fall back to .codegraph/ mtime
    let refDate;
    const lastInitPath = path.join(repoPath, LAST_INIT_FILE);
    if (fs.existsSync(lastInitPath)) {
      const parsed = new Date(fs.readFileSync(lastInitPath, 'utf8').trim());
      if (!isNaN(parsed.getTime())) refDate = parsed;
    }
    if (!refDate) {
      const cgDir = path.join(repoPath, '.codegraph');
      if (!fs.existsSync(cgDir)) return false;
      refDate = fs.statSync(cgDir).mtime;
    }

    // Check for git commits after refDate — gracefully skip if no git
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      'git', ['-C', repoPath, 'log', '--oneline', `--after=${refDate.toISOString()}`, '-1'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 },
    );
    if (result.status !== 0 || result.error) return false; // no git or git error
    return result.stdout.trim().length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Return the MCP tool hint string for the agent system prompt.
 * All four IDEs support MCP, so this returns a non-null value for all of them
 * when CodeGraph is installed.
 * Returns null when CodeGraph is not installed or any error occurs.
 *
 * @param {string} ide - 'claude' | 'cursor' | 'opencode' | 'codex'
 * @returns {string|null}
 */
function mcpEntry(ide) {
  try {
    if (!ide) return null;
    if (!isInstalled()) return null;
    return (
      'CodeGraph MCP tools available: ' +
      'codegraph_search, codegraph_callers, codegraph_callees, codegraph_context, codegraph_impact. ' +
      'Use these BEFORE Grep or Read for symbol and call-graph queries when .codegraph/ is present.'
    );
  } catch (_) {
    return null;
  }
}

// ── MCP server registration ───────────────────────────────────────────────────

const CODEGRAPH_MCP_KEY = 'codegraph';

function _upsertMcpEntry(filePath, entry) {
  let config = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed;
  } catch (_) {}
  if (!config.mcpServers) config.mcpServers = {};
  if (config.mcpServers[CODEGRAPH_MCP_KEY]) return; // already registered — idempotent
  config.mcpServers[CODEGRAPH_MCP_KEY] = entry;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function _registerClaudeMcp(homeDir) {
  const dir = path.join(homeDir, '.claude');
  if (!fs.existsSync(dir)) return;
  _upsertMcpEntry(path.join(dir, 'settings.json'), {
    command: 'codegraph',
    args: ['serve', '--mcp', '--path', '.'],
  });
}

function _registerCursorMcp(homeDir) {
  const dir = path.join(homeDir, '.cursor');
  if (!fs.existsSync(dir)) return;
  _upsertMcpEntry(path.join(dir, 'mcp.json'), {
    type: 'stdio',
    command: 'codegraph',
    args: ['serve', '--mcp', '--path', '${workspaceFolder}'],
  });
}

function _registerOpenCodeMcp(homeDir) {
  const { globalOpenCodeDir } = require('./global-paths');
  const openCodeDir = globalOpenCodeDir(homeDir);
  fs.mkdirSync(openCodeDir, { recursive: true });
  const configPath = path.join(openCodeDir, 'opencode.jsonc');
  let config = { $schema: 'https://opencode.ai/config.json' };
  try {
    const raw = fs.readFileSync(configPath, 'utf8').replace(/\/\/[^\n]*/g, '');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') config = parsed;
  } catch (_) {}
  if (!config.mcp) config.mcp = {};
  if (config.mcp[CODEGRAPH_MCP_KEY]) return;
  config.mcp[CODEGRAPH_MCP_KEY] = { type: 'local', command: ['codegraph', 'serve', '--mcp'], enabled: true };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function _registerCodexMcp(homeDir) {
  const codexDir = path.join(homeDir, '.codex');
  if (!fs.existsSync(codexDir)) return;
  const configPath = path.join(codexDir, 'config.toml');
  const smolToml = require('smol-toml');
  let config = {};
  try {
    config = smolToml.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {}
  if (!config.mcp_servers) config.mcp_servers = {};
  if (config.mcp_servers[CODEGRAPH_MCP_KEY]) return;
  config.mcp_servers[CODEGRAPH_MCP_KEY] = { command: 'codegraph', args: ['serve', '--mcp'] };
  fs.writeFileSync(configPath, smolToml.stringify(config), 'utf8');
}

/**
 * Register the CodeGraph MCP server entry in each selected IDE's config file.
 * Idempotent — no-ops if the entry already exists or the IDE dir is absent. Never throws.
 *
 * Accepts both dot-prefixed (.claude) and plain (claude) IDE names — both formats are normalized.
 *
 * IDE → file:
 *   claude   → ~/.claude/settings.json           (mcpServers.codegraph)
 *   cursor   → ~/.cursor/mcp.json                (mcpServers.codegraph)
 *   opencode → <globalOpenCodeDir>/opencode.jsonc  (mcp.codegraph)
 *   codex    → ~/.codex/config.toml              (mcp_servers.codegraph)
 *
 * @param {string[]} selectedIDEs - e.g. ['.claude','.cursor'] or ['claude','cursor']
 * @param {string} [homeDir] - injectable for testing
 */
function registerMcp(selectedIDEs, homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const ides = Array.isArray(selectedIDEs) ? selectedIDEs : [];
  for (const ide of ides) {
    try {
      const name = ide.startsWith('.') ? ide.slice(1) : ide;
      if (name === 'claude') _registerClaudeMcp(resolvedHome);
      else if (name === 'cursor') _registerCursorMcp(resolvedHome);
      else if (name === 'opencode') _registerOpenCodeMcp(resolvedHome);
      else if (name === 'codex') _registerCodexMcp(resolvedHome);
    } catch (_) {}
  }
}

/**
 * Write the .refacil-last-init timestamp into an existing .codegraph/ directory.
 * No-op when .codegraph/ does not exist. Used by checkUpdate to stamp indexes
 * that were built externally (not through our setup/init commands).
 * @param {string} repoPath
 */
function touchTimestamp(repoPath) {
  try {
    const cgDir = path.join(repoPath, '.codegraph');
    if (!fs.existsSync(cgDir)) return;
    const tsFile = path.join(cgDir, '.refacil-last-init');
    if (!fs.existsSync(tsFile)) {
      fs.writeFileSync(tsFile, new Date().toISOString());
    }
  } catch (_) {}
}

// ── Version floor + global upgrade ────────────────────────────────────────────

/**
 * Minimum codegraph CLI version we want users to run. Existing global installs
 * below this floor are upgraded automatically (throttled) by checkUpdate, and
 * synchronously by `codegraph setup`.
 *
 * 0.9.9 dropped the native better-sqlite3 build (which pulled the deprecated
 * prebuild-install) in favour of prebuilt per-platform binaries.
 */
const MIN_VERSION = '0.9.9';

/**
 * Version at/above which the codegraph MCP daemon keeps the index fresh on its
 * own across sessions, making our SessionStart stale-reindex redundant.
 *
 * The live file watcher (auto-sync while running) has existed since ~0.8.0, but
 * that alone does NOT cover our case: isStale() fires on commits made WHILE the
 * daemon/IDE was closed (a pull, a branch switch), which a live-only watcher
 * misses. The capability that covers it is catch-up-on-connect — added in 0.9.5
 * ("the MCP server now catches up on connect, reconciling anything that changed
 * while it wasn't running"), shipped alongside the persistent per-project daemon.
 * So 0.9.5 is the real floor. Below it (older installs not yet upgraded) we keep
 * triggering `codegraph index` ourselves. See hasAutoSync.
 */
const WATCHER_VERSION = '0.9.5';

/**
 * Return the installed global codegraph version string (e.g. "0.9.9"), or null
 * when codegraph is not installed or the version cannot be determined.
 * Never throws.
 * @returns {string|null}
 */
function installedVersion() {
  try {
    const { spawnSync } = require('child_process');
    // shell: true is required on Windows where npm binaries are installed as .cmd files
    const result = spawnSync('codegraph', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      shell: true,
    });
    if (result.status !== 0 || !result.stdout) return null;
    const match = result.stdout.trim().match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Compare two dotted numeric versions. Returns true when `version` is strictly
 * lower than `floor`. Malformed / non-numeric segments are treated as 0.
 * Pure and total — never throws. Exported for testing.
 * @param {string} version
 * @param {string} floor
 * @returns {boolean}
 */
function isVersionBelow(version, floor) {
  const parse = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(floor);
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/**
 * True when codegraph is installed but its version is below the floor.
 * Returns false when not installed or the version cannot be parsed — callers
 * handle the "missing" case separately, and an unknown version never triggers
 * a disruptive upgrade.
 * @param {string} [floor] - override the version floor (defaults to MIN_VERSION)
 * @returns {boolean}
 */
function isOutdated(floor) {
  const current = installedVersion();
  if (!current) return false;
  return isVersionBelow(current, floor || MIN_VERSION);
}

/**
 * True when the installed codegraph's MCP daemon keeps the graph fresh on its
 * own (file watcher + startup catch-up, WATCHER_VERSION and up) — in which case
 * our SessionStart stale-reindex would just duplicate the daemon's work and
 * should be skipped. Returns false for older versions (no watcher → keep doing
 * the manual reindex) and when the version can't be determined (be conservative
 * and keep the manual refresh). Never throws.
 * @returns {boolean}
 */
function hasAutoSync() {
  const current = installedVersion();
  if (!current) return false; // unknown version → keep the manual refresh (safe)
  return !isVersionBelow(current, WATCHER_VERSION);
}

/**
 * Upgrade the global codegraph CLI to the latest published version.
 * Never throws.
 * @param {object} [opts]
 * @param {boolean} [opts.background=true] - true: detached fire-and-forget (does not block);
 *                                           false: synchronous with inherited stdio (used by setup).
 */
function upgrade(opts) {
  const background = !opts || opts.background !== false;
  try {
    if (background) {
      const { spawn } = require('child_process');
      const child = spawn('npm install -g @colbymchenry/codegraph@latest', [], {
        detached: true,
        stdio: 'ignore',
        shell: true,        // required for Windows .cmd binaries
        windowsHide: true,  // suppress console window pop-ups on Windows
      });
      child.unref();
    } else {
      const { execSync } = require('child_process');
      execSync('npm install -g @colbymchenry/codegraph@latest', {
        stdio: 'inherit',
        timeout: 120000,
      });
    }
  } catch (_) {
    // Swallow: upgrade is best-effort, must never break the caller
  }
}

module.exports = {
  isInstalled,
  isInitialized,
  isStale,
  init,
  touchTimestamp,
  mcpEntry,
  registerMcp,
  MIN_VERSION,
  WATCHER_VERSION,
  installedVersion,
  isVersionBelow,
  isOutdated,
  hasAutoSync,
  upgrade,
};
