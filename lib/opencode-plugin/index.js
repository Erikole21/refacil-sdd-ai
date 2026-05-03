'use strict';

/**
 * refacil-sdd-ai OpenCode plugin
 *
 * Provides 4 hook equivalents for OpenCode:
 *   - session.created       → check-update logic (sync compact-guidance + testing-policy, flag pending migrations)
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

// ── Hook handlers ────────────────────────────────────────────────────────────

/**
 * session.created — equivalent of check-update (SessionStart hook)
 * Syncs compact-guidance + testing-policy like `refacil-sdd-ai check-update`, then flags pending methodology migrations.
 */
async function checkUpdateHandler(event) {
  const projectRoot = event.projectRoot || process.cwd();

  const pkgRoot = resolveRefacilPackageRootForOpenCode(projectRoot);
  if (pkgRoot) {
    try {
      const { syncRepoSessionMarkers } = require(path.join(pkgRoot, 'lib', 'session-repo-sync.js'));
      const out = syncRepoSessionMarkers(projectRoot, pkgRoot);
      if (out.compact && out.compact.status === 'error') {
        process.stderr.write(`[refacil-sdd-ai] compact-guidance: ${out.compact.message}\n`);
      }
      if (out.testing && out.testing.status === 'error') {
        process.stderr.write(`[refacil-sdd-ai] testing-policy: ${out.testing.message}\n`);
      } else if (
        out.testing &&
        ['created-file', 'appended', 'replaced', 'written-empty'].includes(out.testing.status)
      ) {
        process.stderr.write(`[refacil-sdd-ai] testing-policy: ${out.testing.status} (.agents/testing.md)\n`);
      }
    } catch (err) {
      process.stderr.write(`[refacil-sdd-ai] session repo sync: ${err.message}\n`);
    }
  }

  // Check if there is a pending methodology migration
  try {
    const migFn = loadMethodologyMigrationPending(projectRoot);
    if (!migFn) return;
    const mig = migFn(projectRoot);
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
