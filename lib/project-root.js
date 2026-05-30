'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Walk up from startDir and return the topmost directory that contains a .git entry.
 * @param {string} [startDir]
 * @returns {string|null}
 */
function findGitRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  let gitRoot = null;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.git'))) gitRoot = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return gitRoot;
}

/**
 * Walk up from startDir and return the topmost directory that contains refacil-sdd/.
 * @param {string} [startDir]
 * @returns {string|null}
 */
function findRefacilSddRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  let sddRoot = null;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'refacil-sdd'))) sddRoot = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return sddRoot;
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
function isRefacilSddAiPackageDir(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg && pkg.name === 'refacil-sdd-ai';
  } catch (_) {
    return false;
  }
}

/**
 * If dir is the methodology npm package inside a monorepo, return the git repo root above it.
 * @param {string} dir
 * @returns {string}
 */
function elevateFromEmbeddedPackage(dir) {
  const resolved = path.resolve(dir);
  if (!isRefacilSddAiPackageDir(resolved)) return resolved;

  const parent = path.dirname(resolved);
  if (fs.existsSync(path.join(parent, '.git'))) return parent;

  const gitRoot = findGitRoot(parent);
  return gitRoot || resolved;
}

/**
 * Repo root for SDD commands: prefer .git (full tree), then refacil-sdd/, else cwd.
 * @param {string} [startDir]
 * @returns {string}
 */
function findProjectRoot(startDir = process.cwd()) {
  const gitRoot = findGitRoot(startDir);
  if (gitRoot) return gitRoot;

  const sddRoot = findRefacilSddRoot(startDir);
  if (sddRoot) return sddRoot;

  return path.resolve(startDir);
}

/**
 * Read optional JSON from stdin (Cursor/Claude hooks).
 * @returns {object|null}
 */
function readHookStdinJson() {
  try {
    if (process.stdin.isTTY) return null;
    const stdin = fs.readFileSync(0, 'utf8');
    if (!stdin.trim()) return null;
    return JSON.parse(stdin);
  } catch (_) {
    return null;
  }
}

/**
 * Root of the workspace/repo for hook-driven commands (check-update, CodeGraph).
 *
 * Resolution order (first match wins):
 *  1. CURSOR_PROJECT_DIR — Cursor hooks (sessionStart, workspaceOpen, preToolUse, …)
 *  2. CLAUDE_PROJECT_DIR — Claude Code hooks (SessionStart, PreToolUse, …); Codex uses the same alias
 *  3. workspace_roots[0] from hook JSON stdin — Cursor workspaceOpen when env is absent
 *  4. Ascend from process.cwd(): topmost .git, then topmost refacil-sdd/
 *  5. If result is the embedded refacil-sdd-ai npm package inside a monorepo → parent .git root
 *
 * OpenCode: session.created passes event.projectRoot as child `cwd` and mirrors it into (1)/(2)
 * in runCheckUpdateCli — same effective root without Cursor-specific APIs.
 *
 * @param {{ hookInput?: object|null, skipStdin?: boolean }} [options]
 * @returns {string}
 */
function resolveWorkspaceRoot(options = {}) {
  const hookInput = options.hookInput !== undefined
    ? options.hookInput
    : (options.skipStdin ? null : readHookStdinJson());

  const envDir = process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR;
  if (envDir) {
    const resolved = path.resolve(envDir);
    if (fs.existsSync(resolved)) return resolved;
  }

  const workspaceRoot = hookInput && Array.isArray(hookInput.workspace_roots)
    ? hookInput.workspace_roots[0]
    : null;
  if (workspaceRoot) {
    const resolved = path.resolve(workspaceRoot);
    if (fs.existsSync(resolved)) return resolved;
  }

  const fromTraversal = findProjectRoot(process.cwd());
  return elevateFromEmbeddedPackage(fromTraversal);
}

module.exports = {
  findGitRoot,
  findRefacilSddRoot,
  findProjectRoot,
  isRefacilSddAiPackageDir,
  elevateFromEmbeddedPackage,
  readHookStdinJson,
  resolveWorkspaceRoot,
};
