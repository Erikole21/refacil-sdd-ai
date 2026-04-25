'use strict';

/**
 * refacil-sdd-ai OpenCode plugin
 *
 * Provides 4 hook equivalents for OpenCode:
 *   - session.created       → check-update logic (sync compact-guidance, flag pending migrations)
 *   - tui.prompt.append     → notify-update logic (prompt user to run /refacil:update if pending)
 *   - tool.execute.before   → check-review + compact-bash logic
 *
 * This file is installed as .opencode/plugins/refacil-hooks.js.
 * It resolves lib/compact/rules.js relative to its own __dirname at install time.
 */

const path = require('path');
const fs = require('fs');

// ── Resolve compact rules ────────────────────────────────────────────────────
// When installed, this file lives at .opencode/plugins/refacil-hooks.js.
// The compact rules live at <package>/lib/compact/rules.js.
// We walk up from __dirname looking for the package (node_modules/refacil-sdd-ai or
// the package root directly), falling back gracefully if not found.

let findRule = null;

(function loadCompactRules() {
  const candidates = [
    // Installed as plugin in .opencode/plugins/ — package is in node_modules
    path.resolve(__dirname, '..', '..', 'node_modules', 'refacil-sdd-ai', 'lib', 'compact', 'rules.js'),
    // Running from source (lib/opencode-plugin/index.js)
    path.resolve(__dirname, '..', 'compact', 'rules.js'),
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

function writePendingUpdateFlag(projectRoot, from, to) {
  try {
    fs.writeFileSync(getPendingUpdateFlagPath(projectRoot), JSON.stringify({ from, to }));
  } catch (_) {}
}

function clearPendingUpdateFlag(projectRoot) {
  try {
    const flagPath = getPendingUpdateFlagPath(projectRoot);
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
  } catch (_) {}
}

function readRepoVersion(projectRoot) {
  const versionFiles = ['.opencode/.sdd-version', '.claude/.sdd-version', '.cursor/.sdd-version'];
  for (const rel of versionFiles) {
    try {
      const raw = fs.readFileSync(path.join(projectRoot, rel), 'utf8').trim();
      if (raw) return raw;
    } catch (_) {}
  }
  return null;
}

function methodologyMigrationPending(projectRoot) {
  // Look for refacil-sdd/changes with active (non-archived) tasks that still have pending migrations
  // This is a lightweight check: look for changes that have tasks.md but no .review-passed
  const changesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
  if (!fs.existsSync(changesDir)) return { pending: false, reasons: [] };

  let entries;
  try {
    entries = fs.readdirSync(changesDir, { withFileTypes: true });
  } catch (_) {
    return { pending: false, reasons: [] };
  }

  const reasons = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    const tasksPath = path.join(changesDir, entry.name, 'tasks.md');
    const tasksContent = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf8') : '';
    // Look for unchecked tasks: "- [ ]" pattern
    if (/- \[ \]/.test(tasksContent)) {
      reasons.push(`Change '${entry.name}' has pending tasks`);
    }
  }

  return { pending: reasons.length > 0, reasons };
}

// ── Hook handlers ────────────────────────────────────────────────────────────

/**
 * session.created — equivalent of check-update (SessionStart hook)
 * Checks if the installed skills are out of date and flags a pending update.
 */
async function checkUpdateHandler(event) {
  const projectRoot = event.projectRoot || process.cwd();

  // Check if there is a pending methodology migration
  try {
    const mig = methodologyMigrationPending(projectRoot);
    const repoVersion = readRepoVersion(projectRoot);

    // Try to get the current package version via refacil-sdd-ai CLI
    let packageVersion = null;
    try {
      const { execSync } = require('child_process');
      packageVersion = execSync('refacil-sdd-ai --version', {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (_) {}

    const existingFlag = readPendingUpdateFlag(projectRoot);

    if (mig.pending) {
      writePendingUpdateFlag(projectRoot, repoVersion, packageVersion);
    } else if (existingFlag) {
      clearPendingUpdateFlag(projectRoot);
    }
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] check-update handler error: ${err.message}\n`);
  }
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

  const mig = methodologyMigrationPending(projectRoot);
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
 *   (a) check-review: blocks git push if any active change is missing .review-passed
 *   (b) compact-bash: rewrites matched commands to reduce token usage
 */
async function toolExecuteBeforeHandler(event) {
  // Only handle Bash tool calls
  if (!event || !event.tool || event.tool !== 'bash') return;

  const command = (event.input && event.input.command) || (event.params && event.params.command) || '';
  if (!command) return;

  const projectRoot = event.projectRoot || process.cwd();

  // (a) check-review: block git push if missing .review-passed
  if (/git\s+push/.test(command)) {
    const sddChangesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
    if (fs.existsSync(sddChangesDir)) {
      let entries;
      try {
        entries = fs.readdirSync(sddChangesDir, { withFileTypes: true });
      } catch (_) {
        entries = [];
      }

      const activeChanges = entries.filter(
        (e) => e.isDirectory() && e.name !== 'archive',
      );

      if (activeChanges.length > 0) {
        const missing = activeChanges.filter(
          (e) => !fs.existsSync(path.join(sddChangesDir, e.name, '.review-passed')),
        );

        if (missing.length > 0) {
          const names = missing.map((e) => e.name).join(', ');
          const reason =
            missing.length === 1
              ? `[refacil-sdd-ai] Review pending for: ${names}. ` +
                'Stop the push and run /refacil:review on that change before pushing code. ' +
                'If the review passes, retry the git push.'
              : `[refacil-sdd-ai] Multiple changes without approved review: ${names}. ` +
                'Stop the push and ask the user to explicitly select which change they want to push. ' +
                'Then run /refacil:review <change-name> for that specific change and retry the push.';

          throw new Error(reason);
        }
      }
    }
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
