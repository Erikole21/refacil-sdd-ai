'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CODEGRAPH_MODES = ['enabled', 'per-repo', 'disabled'];
const DEFAULT_CODEGRAPH_MODE = 'enabled';

const DEFAULT_PROTECTED_BRANCHES = ['master', 'main', 'develop', 'dev', 'testing', 'qa'];
const DEFAULT_BASE_BRANCH = 'develop';
const SUPPORTED_LANGUAGES = ['english', 'spanish'];
const DEFAULT_ARTIFACT_LANGUAGE = 'english';

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
 * Validate `artifactLanguage` from a parsed config object.
 * Returns the value if valid, or null + emits a warning if unknown.
 * @param {object} cfg  — parsed YAML object
 * @param {string} src  — source label for the warning ('project' | 'global')
 */
function extractArtifactLanguage(cfg, src) {
  if (!('artifactLanguage' in cfg)) return null;
  const val = cfg.artifactLanguage;
  if (typeof val !== 'string' || val.trim() === '') {
    process.stderr.write(
      `[refacil-sdd-ai] warning: artifactLanguage in ${src} config must be a non-empty string — ignoring.\n`,
    );
    return null;
  }
  const trimmed = val.trim();
  if (!SUPPORTED_LANGUAGES.includes(trimmed)) {
    process.stderr.write(
      `[refacil-sdd-ai] warning: artifactLanguage "${trimmed}" in ${src} config is not a supported language (${SUPPORTED_LANGUAGES.join(', ')}) — ignoring.\n`,
    );
    return null;
  }
  return trimmed;
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

  // --- artifactLanguage ---
  let artifactLanguage = null;
  let artifactLanguageSource = 'default';

  if (projectCfg !== null) {
    const val = extractArtifactLanguage(projectCfg, 'project');
    if (val !== null) {
      artifactLanguage = val;
      artifactLanguageSource = 'project';
    }
  }

  if (artifactLanguage === null && globalCfg !== null) {
    const val = extractArtifactLanguage(globalCfg, 'global');
    if (val !== null) {
      artifactLanguage = val;
      artifactLanguageSource = 'global';
    }
  }

  if (artifactLanguage === null) {
    artifactLanguage = DEFAULT_ARTIFACT_LANGUAGE;
    artifactLanguageSource = 'default';
  }

  // --- codegraphMode ---
  let codegraphMode = null;
  let codegraphModeSource = 'default';

  if (projectCfg !== null) {
    const val = extractCodegraphMode(projectCfg, 'project');
    if (val !== null) {
      codegraphMode = val;
      codegraphModeSource = 'project';
    }
  }

  if (codegraphMode === null && globalCfg !== null) {
    const val = extractCodegraphMode(globalCfg, 'global');
    if (val !== null) {
      codegraphMode = val;
      codegraphModeSource = 'global';
    }
  }

  // codegraphMode has no default — null means "no preference yet" (suggestion not yet answered)

  return {
    protectedBranches,
    baseBranch,
    artifactLanguage,
    codegraphMode,
    sources: {
      protectedBranches: protectedBranchesSource,
      baseBranch: baseBranchSource,
      artifactLanguage: artifactLanguageSource,
      codegraphMode: codegraphModeSource,
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
  const { protectedBranches, baseBranch, artifactLanguage } = loadBranchConfigWithSources(projectRoot);
  return { protectedBranches, baseBranch, artifactLanguage };
}

/**
 * Validate `codegraphMode` from a parsed config object.
 * Valid values: 'enabled' | 'per-repo' | 'disabled'. Default: 'enabled'.
 * Returns the value if valid, or null + emits a warning if invalid.
 * @param {object} cfg  — parsed YAML object
 * @param {string} src  — source label for the warning ('project' | 'global')
 * @returns {string|null}
 */
function extractCodegraphMode(cfg, src) {
  if (!('codegraphMode' in cfg)) return null;
  const val = cfg.codegraphMode;
  if (typeof val !== 'string' || val.trim() === '') {
    process.stderr.write(
      `[refacil-sdd-ai] warning: codegraphMode in ${src} config must be a non-empty string — ignoring.\n`,
    );
    return null;
  }
  const trimmed = val.trim();
  if (!CODEGRAPH_MODES.includes(trimmed)) {
    process.stderr.write(
      `[refacil-sdd-ai] warning: codegraphMode "${trimmed}" in ${src} config is not a valid value (${CODEGRAPH_MODES.join(', ')}) — ignoring.\n`,
    );
    return null;
  }
  return trimmed;
}

/**
 * Read CodeGraph suggestion UI state from a parsed config object.
 * Keys read: codegraph-suggest-shown (boolean), codegraph-suggest-snooze (ISO date string).
 * Returns { shown: bool|null, snoozeUntil: string|null }.
 * Never warns — these are internal state keys that may simply be absent.
 * @param {object} cfg  — parsed YAML object
 * @param {string} _src — source label (unused, kept for API consistency)
 * @returns {{ shown: boolean|null, snoozeUntil: string|null }}
 */
function extractCodegraphSuggestState(cfg, _src) {
  let shown = null;
  let snoozeUntil = null;

  if ('codegraph-suggest-shown' in cfg) {
    const raw = cfg['codegraph-suggest-shown'];
    if (raw === 'true' || raw === true) shown = true;
    else if (raw === 'false' || raw === false) shown = false;
  }

  if ('codegraph-suggest-snooze' in cfg) {
    const raw = cfg['codegraph-suggest-snooze'];
    if (typeof raw === 'string' && raw.trim() !== '') {
      snoozeUntil = raw.trim();
    }
  }

  return { shown, snoozeUntil };
}

/**
 * Write (set or update) a single flat key:value pair in a YAML config file.
 * Uses the same minimal YAML format as the existing parser — only flat key:value scalars.
 * If the key already exists, its line is replaced in-place (preserving other lines).
 * If the key does not exist, it is appended.
 * Creates the file and parent directories if they do not exist.
 * Never throws — all errors are swallowed silently.
 *
 * @param {string} key      — config key (e.g. 'codegraphMode')
 * @param {string} value    — scalar string value to set
 * @param {string} homeDir  — path to the user home directory (e.g. os.homedir())
 */
function writeConfigValue(key, value, homeDir) {
  try {
    const globalConfigPath = path.join(homeDir || os.homedir(), '.refacil-sdd-ai', 'config.yaml');
    fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });

    let lines = [];
    if (fs.existsSync(globalConfigPath)) {
      lines = fs.readFileSync(globalConfigPath, 'utf8').split('\n');
    }

    // Determine if key already exists (match "key:" or "key: value" at line start)
    const keyPattern = new RegExp(`^${key.replace(/[-]/g, '\\$&')}:`);
    let found = false;
    const updated = lines.map((line) => {
      if (keyPattern.test(line)) {
        found = true;
        return `${key}: ${value}`;
      }
      return line;
    });

    if (!found) {
      // Remove trailing empty line before appending to avoid double blank lines
      while (updated.length > 0 && updated[updated.length - 1].trim() === '') {
        updated.pop();
      }
      updated.push(`${key}: ${value}`);
      updated.push('');
    }

    fs.writeFileSync(globalConfigPath, updated.join('\n'));
  } catch (_) {
    // Silently swallow — config writes must never break caller flow
  }
}

module.exports = {
  parseYaml,
  readConfigFile,
  loadBranchConfig,
  loadBranchConfigWithSources,
  extractArtifactLanguage,
  extractCodegraphMode,
  extractCodegraphSuggestState,
  writeConfigValue,
  DEFAULT_PROTECTED_BRANCHES,
  DEFAULT_BASE_BRANCH,
  SUPPORTED_LANGUAGES,
  DEFAULT_ARTIFACT_LANGUAGE,
  CODEGRAPH_MODES,
  DEFAULT_CODEGRAPH_MODE,
};
