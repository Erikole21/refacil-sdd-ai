'use strict';

/**
 * Session-start repo documentation sync (compact-guidance + testing-policy).
 * Used by `refacil-sdd-ai check-update`, `update`, `init`, and the OpenCode plugin.
 */

const fs = require('fs');
const path = require('path');
const { syncCompactGuidance } = require('./compact-guidance');
const { syncTestingPolicyBlock } = require('./testing-policy-sync');

/**
 * Locate the refacil-sdd-ai installation (templates + lib) for a project.
 * Walks upward from projectRoot for node_modules, then tries require.resolve from projectRoot.
 *
 * @param {string} projectRoot
 * @returns {string | null} absolute package root
 */
function findRefacilPackageRoot(projectRoot) {
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
    /* global install may not be resolvable from arbitrary cwd */
  }
  const self = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(self, marker))) return self;
  return null;
}

/**
 * @param {string} projectRoot
 * @param {string | null | undefined} explicitPackageRoot - when null, discover via findRefacilPackageRoot
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   compact: import('./compact-guidance').syncCompactGuidance extends object,
 *   testing: import('./testing-policy-sync').syncTestingPolicyBlock extends object
 * }}
 */
function syncRepoSessionMarkers(projectRoot, explicitPackageRoot) {
  const pkgRoot = explicitPackageRoot || findRefacilPackageRoot(projectRoot);
  if (!pkgRoot) {
    return {
      ok: false,
      reason:
        'refacil-sdd-ai package not found (install in project or globally so templates are available)',
      compact: { status: 'skipped-no-package' },
      testing: { status: 'skipped-no-package' },
    };
  }

  let compact = { status: 'unknown' };
  let testing = { status: 'unknown' };
  try {
    compact = syncCompactGuidance(projectRoot, pkgRoot);
  } catch (err) {
    compact = { status: 'error', message: err.message };
  }
  try {
    testing = syncTestingPolicyBlock(projectRoot, pkgRoot);
  } catch (err) {
    testing = { status: 'error', message: err.message };
  }
  return { ok: true, compact, testing };
}

module.exports = {
  findRefacilPackageRoot,
  syncRepoSessionMarkers,
};
