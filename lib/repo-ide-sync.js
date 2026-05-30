'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  globalClaudeDir,
  globalCursorDir,
  globalOpenCodeDir,
  legacyOpenCodeDirs,
  globalCodexDir,
  readSelectedIDEs,
  writeSelectedIDEs,
} = require('./global-paths');
const { detectInstalledIDEs } = require('./ide-detection');
const { createClaudeMd, createCursorRules } = require('./installer');
const { syncIgnoreFiles } = require('./ignore-files');
const { syncRepoSessionMarkers } = require('./session-repo-sync');

/**
 * Same resolution as `update`: persisted `~/.refacil-sdd-ai/selected-ides.json` first;
 * if missing, heuristic detection (global skills dirs, optional project `.claude/` etc.) and persist.
 *
 * @param {string} projectRoot
 * @param {string} [homeDir]
 * @returns {string[]}
 */
function resolveSelectedIDEsForRepo(projectRoot, homeDir = os.homedir()) {
  let selectedIDEs = readSelectedIDEs(homeDir);
  if (!selectedIDEs) {
    const detectedIds = detectInstalledIDEs();
    const hasClaudeDir =
      detectedIds.includes('claude') ||
      fs.existsSync(path.join(globalClaudeDir(homeDir), 'skills')) ||
      fs.existsSync(path.join(projectRoot, '.claude'));
    const hasCursorDir =
      detectedIds.includes('cursor') ||
      fs.existsSync(path.join(globalCursorDir(homeDir), 'skills')) ||
      fs.existsSync(path.join(projectRoot, '.cursor'));
    const hasLegacyOpenCodeSkills = legacyOpenCodeDirs(homeDir).some((dir) =>
      fs.existsSync(path.join(dir, 'skills')),
    );
    const hasOpenCodeDir =
      detectedIds.includes('opencode') ||
      fs.existsSync(path.join(globalOpenCodeDir(homeDir), 'skills')) ||
      hasLegacyOpenCodeSkills ||
      fs.existsSync(path.join(projectRoot, '.opencode'));
    const hasCodexFallback =
      detectedIds.includes('codex') || fs.existsSync(path.join(globalCodexDir(homeDir), 'skills'));
    selectedIDEs = [
      hasClaudeDir && '.claude',
      hasCursorDir && '.cursor',
      hasOpenCodeDir && '.opencode',
      hasCodexFallback && '.codex',
    ].filter(Boolean);
    if (selectedIDEs.length > 0) writeSelectedIDEs(selectedIDEs, homeDir);
  }
  return selectedIDEs || [];
}

/**
 * Per-repo artifacts for the current IDE selection: CLAUDE.md, .cursorrules, ignore files,
 * compact-guidance / testing-policy (when `AGENTS.md` / `.agents/` exist).
 *
 * Does not install global skills or hooks (use `init` / `update` for that).
 *
 * @param {string} packageRoot
 * @param {string} projectRoot
 * @param {string} [homeDir]
 * @param {{ sessionMarkers?: boolean }} [options]
 * @returns {{
 *   selectedIDEs: string[],
 *   claudeOk: boolean,
 *   cursorOk: boolean,
 *   ignoreResult: Record<string, { status: string, added?: number }|undefined>,
 *   sessionOut: object | null
 * }}
 */
function syncRepoIdeFiles(packageRoot, projectRoot, homeDir = os.homedir(), options = {}) {
  const sessionMarkers = options.sessionMarkers !== false;
  const selectedIDEs = resolveSelectedIDEsForRepo(projectRoot, homeDir);

  const hasClaude = selectedIDEs.includes('.claude');
  const hasCursor = selectedIDEs.includes('.cursor');

  let claudeOk = false;
  let cursorOk = false;
  if (hasClaude) claudeOk = createClaudeMd(packageRoot, projectRoot);
  if (hasCursor) cursorOk = createCursorRules(packageRoot, projectRoot);

  const ignoreResult = syncIgnoreFiles(projectRoot, selectedIDEs);

  let sessionOut = null;
  if (sessionMarkers) {
    try {
      sessionOut = syncRepoSessionMarkers(projectRoot, packageRoot);
    } catch (err) {
      sessionOut = { ok: false, reason: err.message };
    }
  }

  return { selectedIDEs, claudeOk, cursorOk, ignoreResult, sessionOut };
}

module.exports = { resolveSelectedIDEsForRepo, syncRepoIdeFiles };
