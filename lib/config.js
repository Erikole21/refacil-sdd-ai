'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PROTECTED_BRANCHES = ['master', 'main', 'develop', 'dev', 'testing', 'qa'];
const DEFAULT_BASE_BRANCH = 'develop';

// Minimal YAML parser — supports string scalars and string-array values only.
function parseYaml(content) {
  const result = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // List item: "  - value"
    if (/^\s{2,}- /.test(line)) {
      const value = line.replace(/^\s*- /, '').trim();
      if (currentKey && currentList !== null) {
        currentList.push(value);
      }
      continue;
    }

    // Key-value: "key: value" or "key:" (empty / start of list)
    const kvMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        currentList = [];
        result[currentKey] = currentList;
      } else {
        currentList = null;
        result[currentKey] = val;
      }
      continue;
    }

    currentKey = null;
    currentList = null;
  }

  return result;
}

/**
 * Try to read and parse a YAML config file.
 * Returns the parsed object on success, or null if the file does not exist or cannot be parsed.
 * File-not-found is silent (expected). Read/parse errors emit a warning to stderr.
 */
function readConfigFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseYaml(content);
    if (Object.keys(parsed).length === 0 && content.trim().length > 0) {
      process.stderr.write(`[refacil-sdd-ai] warning: could not parse config file at ${filePath} — treating as empty.\n`);
    }
    return parsed;
  } catch (_) {
    process.stderr.write(`[refacil-sdd-ai] warning: could not read config file at ${filePath} — ignoring.\n`);
    return null;
  }
}

/**
 * Validate `protectedBranches` from a parsed config object.
 * Returns the value if valid, or null + emits a warning if invalid.
 * @param {object} cfg  — parsed YAML object
 * @param {string} src  — source label for the warning ('project' | 'global')
 */
function extractProtectedBranches(cfg, src) {
  if (!('protectedBranches' in cfg)) return null;
  const val = cfg.protectedBranches;
  if (!Array.isArray(val)) {
    process.stderr.write(
      `[refacil-sdd-ai] warning: protectedBranches in ${src} config must be a list — ignoring.\n`,
    );
    return null;
  }
  return val;
}

/**
 * Validate `baseBranch` from a parsed config object.
 * Returns the value if valid, or null + emits a warning if invalid.
 * @param {object} cfg  — parsed YAML object
 * @param {string} src  — source label for the warning ('project' | 'global')
 */
function extractBaseBranch(cfg, src) {
  if (!('baseBranch' in cfg)) return null;
  const val = cfg.baseBranch;
  if (typeof val !== 'string' || val.trim() === '') {
    process.stderr.write(
      `[refacil-sdd-ai] warning: baseBranch in ${src} config must be a non-empty string — ignoring.\n`,
    );
    return null;
  }
  return val.trim();
}

/**
 * Load branch configuration with cascade (project > global > defaults) and source tracking.
 *
 * Returns:
 * ```
 * {
 *   protectedBranches: string[],
 *   baseBranch: string,
 *   sources: {
 *     protectedBranches: 'project' | 'global' | 'default',
 *     baseBranch: 'project' | 'global' | 'default',
 *   }
 * }
 * ```
 *
 * Never throws — all errors are handled internally.
 *
 * @param {string} projectRoot  — absolute path to the project root
 */
function loadBranchConfigWithSources(projectRoot) {
  const projectConfigPath = path.join(projectRoot, 'refacil-sdd', 'config.yaml');
  const globalConfigPath = path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml');

  const projectCfg = readConfigFile(projectConfigPath);
  const globalCfg = readConfigFile(globalConfigPath);

  // --- protectedBranches ---
  let protectedBranches = null;
  let protectedBranchesSource = 'default';

  if (projectCfg !== null) {
    const val = extractProtectedBranches(projectCfg, 'project');
    if (val !== null) {
      protectedBranches = val;
      protectedBranchesSource = 'project';
    }
  }

  if (protectedBranches === null && globalCfg !== null) {
    const val = extractProtectedBranches(globalCfg, 'global');
    if (val !== null) {
      protectedBranches = val;
      protectedBranchesSource = 'global';
    }
  }

  if (protectedBranches === null) {
    protectedBranches = DEFAULT_PROTECTED_BRANCHES.slice();
    protectedBranchesSource = 'default';
  }

  if (protectedBranches.length === 0) {
    process.stderr.write('[refacil-sdd-ai] warning: protectedBranches is empty — no branches will be protected.\n');
  }

  // --- baseBranch ---
  let baseBranch = null;
  let baseBranchSource = 'default';

  if (projectCfg !== null) {
    const val = extractBaseBranch(projectCfg, 'project');
    if (val !== null) {
      baseBranch = val;
      baseBranchSource = 'project';
    }
  }

  if (baseBranch === null && globalCfg !== null) {
    const val = extractBaseBranch(globalCfg, 'global');
    if (val !== null) {
      baseBranch = val;
      baseBranchSource = 'global';
    }
  }

  if (baseBranch === null) {
    baseBranch = DEFAULT_BASE_BRANCH;
    baseBranchSource = 'default';
  }

  return {
    protectedBranches,
    baseBranch,
    sources: {
      protectedBranches: protectedBranchesSource,
      baseBranch: baseBranchSource,
    },
  };
}

/**
 * Load branch configuration (no source tracking).
 * Returns { protectedBranches, baseBranch }.
 * Never throws.
 *
 * @param {string} projectRoot  — absolute path to the project root
 */
function loadBranchConfig(projectRoot) {
  const { protectedBranches, baseBranch } = loadBranchConfigWithSources(projectRoot);
  return { protectedBranches, baseBranch };
}

module.exports = {
  parseYaml,
  readConfigFile,
  loadBranchConfig,
  loadBranchConfigWithSources,
  DEFAULT_PROTECTED_BRANCHES,
  DEFAULT_BASE_BRANCH,
};
