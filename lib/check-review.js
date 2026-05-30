'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Active changes directory: refacil-sdd/changes, or openspec/changes as legacy fallback.
 * @param {string} projectRoot
 * @returns {string|null}
 */
function resolveChangesDir(projectRoot) {
  const sddChangesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
  const legacyChangesDir = path.join(projectRoot, 'openspec', 'changes');
  if (fs.existsSync(sddChangesDir)) return sddChangesDir;
  if (fs.existsSync(legacyChangesDir)) return legacyChangesDir;
  return null;
}

/**
 * @param {string} changesDir
 * @param {string} changeName
 * @returns {boolean}
 */
function changeNeedsReview(changesDir, changeName) {
  const changePath = path.join(changesDir, changeName);
  if (fs.existsSync(path.join(changePath, '.review-passed'))) return false;

  // Only block if implementation has started (at least one task done).
  // Pure proposals (all tasks pending) and bug fixes without tasks.md do not block push.
  const tasksPath = path.join(changePath, 'tasks.md');
  if (!fs.existsSync(tasksPath)) return false;

  const tasksContent = fs.readFileSync(tasksPath, 'utf8');
  const done = (tasksContent.match(/^- \[x\]/gm) || []).length;
  return done > 0;
}

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
function listActiveChangesMissingReview(projectRoot) {
  const changesDir = resolveChangesDir(projectRoot);
  if (!changesDir || !fs.existsSync(changesDir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(changesDir, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  const active = entries.filter((e) => e.isDirectory() && e.name !== 'archive');
  return active.filter((e) => changeNeedsReview(changesDir, e.name)).map((e) => e.name);
}

/**
 * @param {string[]} names
 * @returns {string}
 */
function buildReviewBlockReason(names) {
  if (names.length === 0) return '';

  const joined = names.join(', ');
  if (names.length === 1) {
    return (
      `[refacil-sdd-ai] Review pending for: ${joined}. ` +
      'Stop the push and run /refacil:review on that change before pushing code. ' +
      'If the review passes, retry the git push. ' +
      'If the review requires corrections, report the findings to the user and DO NOT retry the push.'
    );
  }

  return (
    `[refacil-sdd-ai] Multiple changes without approved review: ${joined}. ` +
    'Stop the push and ask the user to explicitly select which change they want to push. ' +
    'Then run /refacil:review <change-name> for that specific change and retry the push. ' +
    'Do not run automatic review without explicit selection when there is more than one pending change.'
  );
}

/**
 * @param {string} command
 * @param {string} projectRoot
 * @returns {{ decision: 'block', reason: string }|null}
 */
function evaluateGitPushReview(command, projectRoot) {
  if (!command || !/git\s+push/.test(command)) return null;

  const missing = listActiveChangesMissingReview(projectRoot);
  if (missing.length === 0) return null;

  return { decision: 'block', reason: buildReviewBlockReason(missing) };
}

module.exports = {
  resolveChangesDir,
  changeNeedsReview,
  listActiveChangesMissingReview,
  buildReviewBlockReason,
  evaluateGitPushReview,
};
