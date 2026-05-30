'use strict';

/**
 * refacil-sdd-ai OpenCode plugin
 *
 * Provides 4 hook equivalents for OpenCode:
 *   - session.created       → runs `refacil-sdd-ai check-update` (same CLI as Claude/Cursor/Codex)
 *   - tui.prompt.append     → notify-update logic (prompt user to run /refacil:update if pending)
 *   - tool.execute.before   → check-review + compact-bash logic
 *
 * This file is installed as .opencode/plugins/refacil-hooks.js.
 * It resolves lib/compact/rules.js relative to its own __dirname at install time.
 */

const path = require('path');
const fs = require('fs');

/** @type {import('../check-review').evaluateGitPushReview | null} */
let evaluateGitPushReview = null;

(function loadCheckReviewModule() {
  const candidates = [
    // Co-installed by installOpenCodePlugin (global ~/.config/.../plugins/)
    path.join(__dirname, 'refacil-check-review.js'),
    // Running from package source (lib/opencode-plugin/index.js)
    path.resolve(__dirname, '..', 'check-review.js'),
    // Project-local node_modules
    path.resolve(__dirname, '..', '..', 'node_modules', 'refacil-sdd-ai', 'lib', 'check-review.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        evaluateGitPushReview = require(candidate).evaluateGitPushReview;
        return;
      }
    } catch (_) {
      // try next candidate
    }
  }

  try {
    evaluateGitPushReview = require('refacil-sdd-ai/lib/check-review').evaluateGitPushReview;
  } catch (_) {
    process.stderr.write(
      '[refacil-sdd-ai] WARNING: Could not load check-review.js — git push review gate disabled.\n',
    );
  }
})();

// ── Resolve compact rules ────────────────────────────────────────────────────
// When installed, this file lives at .opencode/plugins/refacil-hooks.js.
// The compact rules live at <package>/lib/compact/rules.js.
// We walk up from __dirname looking for the package (node_modules/refacil-sdd-ai or
// the package root directly), falling back gracefully if not found.

let findRule = null;

(function loadCompactRules() {
  const candidates = [
    // Co-installed beside refacil-hooks.js (global ~/.config/opencode/plugins/)
    path.join(__dirname, 'rules.js'),
    // Installed as plugin in .opencode/plugins/ — package is in node_modules
    path.resolve(__dirname, '..', '..', 'node_modules', 'refacil-sdd-ai', 'lib', 'compact', 'rules.js'),
    // Running from source (lib/opencode-plugin/index.js)
    path.resolve(__dirname, '..', 'compact', 'rules.js'),
    path.resolve(__dirname, 'rules.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const rules = require(candidate);
        if (typeof rules.findRule === 'function') {
          findRule = rules.findRule;
          break;
        }
      }
    } catch (_) {
      // Try next candidate
    }
  }

  if (!findRule) {
    process.stderr.write('[refacil-sdd-ai] WARNING: Could not load compact/rules.js — compact-bash hook disabled.\n');
  }
})();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPendingUpdateFlagPath(projectRoot) {
  return path.join(projectRoot, '.refacil-pending-update');
}

function readPendingUpdateFlag(projectRoot) {
  const flagPath = getPendingUpdateFlagPath(projectRoot);
  if (!fs.existsSync(flagPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(flagPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function clearPendingUpdateFlag(projectRoot) {
  try {
    const flagPath = getPendingUpdateFlagPath(projectRoot);
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
  } catch (_) {}
}

/** Same resolution strategy as `lib/session-repo-sync.js` (kept local so the copied plugin stays self-contained). */
function resolveRefacilPackageRootForOpenCode(projectRoot) {
  const marker = path.join('templates', 'testing-policy.md');
  let cur = path.resolve(projectRoot);
  for (let depth = 0; depth < 12; depth++) {
    const pkg = path.join(cur, 'node_modules', 'refacil-sdd-ai');
    if (fs.existsSync(path.join(pkg, marker))) return pkg;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  try {
    const { execSync } = require('child_process');
    const resolved = execSync('node -p "require.resolve(\'refacil-sdd-ai/package.json\')"', {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const pkg = path.dirname(resolved);
    if (fs.existsSync(path.join(pkg, marker))) return pkg;
  } catch (_) {
    /* optional */
  }
  return null;
}

function loadMethodologyMigrationPending(projectRoot) {
  const pkg = resolveRefacilPackageRootForOpenCode(projectRoot);
  if (!pkg) return null;
  try {
    return require(path.join(pkg, 'lib', 'methodology-migration-pending.js')).methodologyMigrationPending;
  } catch (_) {
    return null;
  }
}

/**
 * Run the same entrypoint as Claude/Cursor/Codex SessionStart hooks.
 * Prefers `node <package>/bin/cli.js check-update` when the package resolves from the repo;
 * falls back to global `refacil-sdd-ai check-update`.
 */
function runCheckUpdateCli(projectRoot) {
  const { execFileSync, execSync } = require('child_process');
  const pkgRoot = resolveRefacilPackageRootForOpenCode(projectRoot);
  const opts = {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Mirror workspace into the same env vars Cursor/Claude hooks set (child-only).
    env: {
      ...process.env,
      CURSOR_PROJECT_DIR: projectRoot,
      CLAUDE_PROJECT_DIR: projectRoot,
    },
  };

  try {
    if (pkgRoot) {
      const cliPath = path.join(pkgRoot, 'bin', 'cli.js');
      const stdout = execFileSync(process.execPath, [cliPath, 'check-update'], opts);
      if (stdout) process.stderr.write(String(stdout));
      return;
    }
    const stdout = execSync('refacil-sdd-ai check-update', { ...opts, shell: true });
    if (stdout) process.stderr.write(String(stdout));
  } catch (err) {
    if (err.stdout) process.stderr.write(String(err.stdout));
    if (err.stderr) process.stderr.write(String(err.stderr));
    if (err.status !== undefined && err.status !== 0) {
      process.stderr.write(`[refacil-sdd-ai] check-update exited with code ${err.status}\n`);
    } else if (err.message) {
      process.stderr.write(`[refacil-sdd-ai] check-update: ${err.message}\n`);
    }
  }
}

// ── Hook handlers ────────────────────────────────────────────────────────────

/**
 * session.created — equivalent of check-update (SessionStart hook)
 * Delegates to `refacil-sdd-ai check-update` for full parity (npm/skills sync, compact-guidance, CodeGraph reindex).
 */
async function checkUpdateHandler(event) {
  const projectRoot = event.projectRoot || process.cwd();
  runCheckUpdateCli(projectRoot);
}

/**
 * tui.prompt.append — equivalent of notify-update (UserPromptSubmit hook)
 * Returns an instruction string if there is a pending update, otherwise returns nothing.
 * Also clears the flag if the user is running /refacil:update.
 */
async function notifyUpdateHandler(event) {
  const projectRoot = event.projectRoot || process.cwd();
  const prompt = (event.prompt || '').trim().toLowerCase();

  // If user is running /refacil:update, clear the flag and let it through
  if (prompt.includes('refacil:update') || prompt.includes('refacil/update')) {
    clearPendingUpdateFlag(projectRoot);
    return;
  }

  const flagInfo = readPendingUpdateFlag(projectRoot);
  if (!flagInfo) return;

  const migFn = loadMethodologyMigrationPending(projectRoot);
  if (!migFn) return;
  const mig = migFn(projectRoot);
  if (!mig.pending) {
    clearPendingUpdateFlag(projectRoot);
    return;
  }

  const fromLabel = flagInfo.from ? `v${flagInfo.from}` : 'previous version';
  const toLabel = flagInfo.to ? `v${flagInfo.to}` : 'latest';

  return (
    `[refacil-sdd-ai] Methodology update detected (${fromLabel} → ${toLabel}). ` +
    `Run /refacil:update to apply pending migrations before continuing.`
  );
}

/**
 * tool.execute.before — handles Bash tool calls:
 *   (a) check-review: blocks git push if an active change has started implementation without .review-passed
 *   (b) compact-bash: rewrites matched commands to reduce token usage
 */
async function toolExecuteBeforeHandler(event) {
  // Only handle Bash tool calls
  if (!event || !event.tool || event.tool !== 'bash') return;

  const command = (event.input && event.input.command) || (event.params && event.params.command) || '';
  if (!command) return;

  const projectRoot = event.projectRoot || process.cwd();

  // (a) check-review: same rules as refacil-sdd-ai check-review CLI (shared lib/check-review.js)
  if (evaluateGitPushReview) {
    const block = evaluateGitPushReview(command, projectRoot);
    if (block) throw new Error(block.reason);
  }

  // (b) compact-bash: rewrite matched commands to reduce token usage
  // Skip if COMPACT=0 is set or findRule is not available
  if (!findRule) return;
  if (/\bCOMPACT=0\b/.test(command)) return;

  const rule = findRule(command);
  if (!rule) return;

  const rewritten = rule.rewrite(command);
  // Return the rewritten command for OpenCode to use instead
  return { command: rewritten };
}

// ── Plugin export ────────────────────────────────────────────────────────────

module.exports = {
  hooks: {
    'session.created': checkUpdateHandler,
    'tui.prompt.append': notifyUpdateHandler,
    'tool.execute.before': toolExecuteBeforeHandler,
  },
};
