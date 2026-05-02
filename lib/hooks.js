'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { globalClaudeDir, globalCursorDir, globalOpenCodeDir } = require('./global-paths');

// ── Cursor: todos los hooks en .cursor/hooks.json ────────────────────────────

function readCursorHooksJson(cursorDir) {
  const p = path.join(cursorDir, 'hooks.json');
  if (!fs.existsSync(p)) return { version: 1, hooks: {} };
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!c.hooks) c.hooks = {};
    return c;
  } catch (_) {
    return { version: 1, hooks: {} };
  }
}

function writeCursorHooksJson(cursorDir, config) {
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(cursorDir, 'hooks.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Install Cursor hooks into the global ~/.cursor/hooks.json.
 * Also cleans legacy hooks from .cursor/settings.json in the project root (if any).
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 * @param {string} [projectRoot] - project root for legacy cleanup (optional)
 */
function installCursorHooks(homeDir, projectRoot) {
  const resolvedHome = homeDir || os.homedir();
  const cursorDir = globalCursorDir(resolvedHome);
  // Clean legacy hooks in the project root's .cursor/settings.json if different from cursorDir
  if (projectRoot && path.join(projectRoot, '.cursor') !== cursorDir) {
    cleanLegacySettingsHooks(projectRoot);
  }
  const config = readCursorHooksJson(cursorDir);
  let changed = false;

  function ensure(event, marker, entry) {
    if (!config.hooks[event]) config.hooks[event] = [];
    if (!config.hooks[event].some((h) => h[marker] === true)) {
      config.hooks[event].push(entry);
      changed = true;
    }
  }

  ensure('sessionStart', '_sdd', {
    _sdd: true,
    command: 'refacil-sdd-ai check-update',
  });

  // compact-bash must be BEFORE check-review
  if (!config.hooks.preToolUse) config.hooks.preToolUse = [];
  if (!config.hooks.preToolUse.some((h) => h._sdd_compact === true)) {
    config.hooks.preToolUse.unshift({ _sdd_compact: true, command: 'refacil-sdd-ai compact-bash', matcher: 'Bash' });
    changed = true;
  }
  if (!config.hooks.preToolUse.some((h) => h._sdd_review === true)) {
    config.hooks.preToolUse.push({ _sdd_review: true, command: 'refacil-sdd-ai check-review', matcher: 'Bash' });
    changed = true;
  }

  ensure('beforeSubmitPrompt', '_sdd_notify', {
    _sdd_notify: true,
    command: 'refacil-sdd-ai notify-update --cursor',
  });

  if (!changed) {
    console.log('  Hooks SDD-AI ya configurados en ~/.cursor/hooks.json.');
    return false;
  }

  writeCursorHooksJson(cursorDir, config);
  return true;
}

/**
 * Uninstall Cursor hooks from the global ~/.cursor/hooks.json.
 * Also cleans legacy hooks from .cursor/settings.json in the project root (if any).
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 * @param {string} [projectRoot] - project root for legacy cleanup (optional)
 */
function uninstallCursorHooks(homeDir, projectRoot) {
  const resolvedHome = homeDir || os.homedir();
  const cursorDir = globalCursorDir(resolvedHome);
  const hooksJsonPath = path.join(cursorDir, 'hooks.json');
  let changed = false;

  if (fs.existsSync(hooksJsonPath)) {
    let config;
    try { config = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8')); } catch (_) { config = null; }

    if (config && config.hooks) {
      const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];
      for (const event of Object.keys(config.hooks)) {
        if (!Array.isArray(config.hooks[event])) continue;
        const before = config.hooks[event].length;
        config.hooks[event] = config.hooks[event].filter(
          (h) => !sddMarkers.some((m) => h[m] === true),
        );
        if (config.hooks[event].length !== before) changed = true;
        if (config.hooks[event].length === 0) delete config.hooks[event];
      }
      if (changed) writeCursorHooksJson(cursorDir, config);
    }
  }

  // Clean up vestigial hooks in .cursor/settings.json (same dir as hooks.json)
  const settingsPath = path.join(cursorDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    let settings;
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { settings = null; }
    if (settings && settings.hooks) {
      const evts = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'beforeSubmitPrompt', 'Stop', 'afterAgentResponse'];
      const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];
      for (const evt of evts) {
        if (!Array.isArray(settings.hooks[evt])) continue;
        const before = settings.hooks[evt].length;
        settings.hooks[evt] = settings.hooks[evt].filter((h) => !sddMarkers.some((m) => h[m] === true));
        if (settings.hooks[evt].length !== before) changed = true;
        if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      if (changed) fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  }

  // Also clean vestigial hooks in project-level .cursor/settings.json (if different from homeDir)
  if (projectRoot) {
    const projectSettingsPath = path.join(projectRoot, '.cursor', 'settings.json');
    if (projectSettingsPath !== settingsPath && fs.existsSync(projectSettingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'));
        if (settings && settings.hooks) {
          const evts = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'beforeSubmitPrompt', 'Stop', 'afterAgentResponse'];
          const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];
          let changed2 = false;
          for (const evt of evts) {
            if (!Array.isArray(settings.hooks[evt])) continue;
            const before = settings.hooks[evt].length;
            settings.hooks[evt] = settings.hooks[evt].filter((h) => !sddMarkers.some((m) => h[m] === true));
            if (settings.hooks[evt].length !== before) changed2 = true;
            if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
          }
          if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
          if (changed2) fs.writeFileSync(projectSettingsPath, JSON.stringify(settings, null, 2) + '\n');
        }
      } catch (_) {}
    }
  }

  return changed;
}

// ── Claude Code: todos los hooks en .claude/settings.json ───────────────────

/**
 * Install Claude Code hooks into the global ~/.claude/settings.json.
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 */
function installClaudeHooks(homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const claudeDir = globalClaudeDir(resolvedHome);
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { settings = {}; }
  }

  if (!settings.hooks) settings.hooks = {};
  let changed = false;

  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  if (!settings.hooks.SessionStart.some((h) => h._sdd === true)) {
    settings.hooks.SessionStart.push({ _sdd: true, matcher: '', hooks: [{ type: 'command', command: 'refacil-sdd-ai check-update' }] });
    changed = true;
  }

  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  if (!settings.hooks.UserPromptSubmit.some((h) => h._sdd_notify === true)) {
    settings.hooks.UserPromptSubmit.push({ _sdd_notify: true, matcher: '', hooks: [{ type: 'command', command: 'refacil-sdd-ai notify-update' }] });
    changed = true;
  }

  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  if (!settings.hooks.PreToolUse.some((h) => h._sdd_compact === true)) {
    settings.hooks.PreToolUse.unshift({ _sdd_compact: true, matcher: 'Bash', hooks: [{ type: 'command', command: 'refacil-sdd-ai compact-bash' }] });
    changed = true;
  }
  if (!settings.hooks.PreToolUse.some((h) => h._sdd_review === true)) {
    settings.hooks.PreToolUse.push({ _sdd_review: true, matcher: 'Bash', hooks: [{ type: 'command', command: 'refacil-sdd-ai check-review' }] });
    changed = true;
  }

  if (!changed) {
    console.log('  Hooks SDD-AI ya configurados en ~/.claude/settings.json.');
    return false;
  }

  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

/**
 * Uninstall Claude Code hooks from the global ~/.claude/settings.json.
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 */
function uninstallClaudeHooks(homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const claudeDir = globalClaudeDir(resolvedHome);
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) return false;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_) {
    console.log('  No se pudieron remover hooks: ~/.claude/settings.json invalido.');
    return false;
  }

  if (!settings.hooks) return false;

  let changed = false;
  const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];

  for (const event of Object.keys(settings.hooks)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter((h) => !sddMarkers.some((m) => h[m] === true));
    if (settings.hooks[event].length !== before) changed = true;
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  if (!changed) return false;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

// ── Limpieza de hooks SDD en settings.json (migracion legacy) ───────────────

function cleanLegacySettingsHooks(projectRoot) {
  const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];
  const evts = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'beforeSubmitPrompt', 'Stop', 'afterAgentResponse'];

  for (const ideDir of ['.cursor']) {
    const settingsPath = path.join(projectRoot, ideDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) continue;

    let settings;
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) { continue; }
    if (!settings || !settings.hooks) continue;

    let changed = false;
    for (const evt of evts) {
      if (!Array.isArray(settings.hooks[evt])) continue;
      const before = settings.hooks[evt].length;
      settings.hooks[evt] = settings.hooks[evt].filter((h) => !sddMarkers.some((m) => h[m] === true));
      if (settings.hooks[evt].length !== before) changed = true;
      if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    if (changed) {
      try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n'); } catch (_) {}
    }
  }
}

// ── OpenCode: plugin file ────────────────────────────────────────────────────

/**
 * Install OpenCode plugin to global user config dir.
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 */
function installOpenCodePlugin(homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const ocDir = globalOpenCodeDir(resolvedHome);
  const pluginsDir = path.join(ocDir, 'plugins');
  fs.mkdirSync(pluginsDir, { recursive: true });

  const srcPlugin = path.join(__dirname, 'opencode-plugin', 'index.js');
  const destPlugin = path.join(pluginsDir, 'refacil-hooks.js');

  try {
    fs.copyFileSync(srcPlugin, destPlugin);
    return true;
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not install OpenCode plugin: ${err.message}\n`);
    return false;
  }
}

/**
 * Uninstall OpenCode plugin from global user config dir.
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 */
function uninstallOpenCodePlugin(homeDir) {
  const resolvedHome = homeDir || os.homedir();
  const ocDir = globalOpenCodeDir(resolvedHome);
  const pluginPath = path.join(ocDir, 'plugins', 'refacil-hooks.js');
  if (!fs.existsSync(pluginPath)) return false;
  try {
    fs.unlinkSync(pluginPath);
    return true;
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not remove OpenCode plugin: ${err.message}\n`);
    return false;
  }
}

// ── Remove project-level hooks (migration helper) ────────────────────────────

/**
 * Strip SDD hooks from project-level IDE config files.
 * Removes _sdd, _sdd_compact, _sdd_review, _sdd_notify markers from:
 *   .claude/settings.json, .cursor/hooks.json, .cursor/settings.json
 * @param {string} projectRoot
 */
function removeProjectLevelHooks(projectRoot) {
  const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];

  // .claude/settings.json
  const claudeSettingsPath = path.join(projectRoot, '.claude', 'settings.json');
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
      let changed = false;
      if (settings && settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          if (!Array.isArray(settings.hooks[event])) continue;
          const before = settings.hooks[event].length;
          settings.hooks[event] = settings.hooks[event].filter(
            (h) => !sddMarkers.some((m) => h[m] === true),
          );
          if (settings.hooks[event].length !== before) changed = true;
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
        }
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      } else if (settings && Object.keys(settings).length === 0) {
        // Already empty stub — treat as changed so it gets deleted below
        changed = true;
      }
      if (changed) {
        if (Object.keys(settings).length === 0) {
          fs.unlinkSync(claudeSettingsPath);
        } else {
          fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2) + '\n');
        }
      }
    } catch (_) {}
  }

  // .cursor/hooks.json and .cursor/settings.json
  const evts = [
    'SessionStart', 'PreToolUse', 'UserPromptSubmit', 'beforeSubmitPrompt',
    'Stop', 'afterAgentResponse', 'sessionStart', 'preToolUse',
  ];

  for (const cursorFile of ['hooks.json', 'settings.json']) {
    const cursorPath = path.join(projectRoot, '.cursor', cursorFile);
    if (!fs.existsSync(cursorPath)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
      const hooksObj = config.hooks;
      if (!hooksObj) {
        // No hooks key — delete if only a meaningless stub (version-only or empty)
        const meaningfulKeys = Object.keys(config).filter(k => k !== 'version');
        if (meaningfulKeys.length === 0) fs.unlinkSync(cursorPath);
        continue;
      }
      let changed = false;
      for (const evt of evts) {
        if (!Array.isArray(hooksObj[evt])) continue;
        const before = hooksObj[evt].length;
        hooksObj[evt] = hooksObj[evt].filter((h) => !sddMarkers.some((m) => h[m] === true));
        if (hooksObj[evt].length !== before) changed = true;
        if (hooksObj[evt].length === 0) delete hooksObj[evt];
      }
      if (Object.keys(hooksObj).length === 0) delete config.hooks;
      if (changed) {
        const remainingKeys = Object.keys(config).filter(k => k !== 'version');
        if (remainingKeys.length === 0) {
          fs.unlinkSync(cursorPath);
        } else {
          fs.writeFileSync(cursorPath, JSON.stringify(config, null, 2) + '\n');
        }
      }
    } catch (_) {}
  }

  // Remove IDE root dirs if now empty (hooks cleanup may have been the last file)
  for (const ideDir of ['.claude', '.cursor', '.opencode']) {
    const idePath = path.join(projectRoot, ideDir);
    try {
      if (fs.existsSync(idePath) && fs.readdirSync(idePath).length === 0) {
        fs.rmdirSync(idePath);
      }
    } catch (_) {}
  }
}

// ── Fachada pública ──────────────────────────────────────────────────────────

/**
 * Install hooks for the specified IDE into global user config dirs.
 * @param {string} ideDir - '.claude', '.cursor', or '.opencode'
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 * @param {string} [projectRoot] - project root for legacy cleanup (optional)
 */
function installHooks(ideDir, homeDir, projectRoot) {
  if (ideDir === '.cursor') return installCursorHooks(homeDir, projectRoot);
  if (ideDir === '.opencode') return installOpenCodePlugin(homeDir);
  return installClaudeHooks(homeDir);
}

/**
 * Uninstall hooks for the specified IDE from global user config dirs.
 * @param {string} ideDir - '.claude', '.cursor', or '.opencode'
 * @param {string} homeDir - user home directory (injectable; default: os.homedir())
 * @param {string} [projectRoot] - project root for legacy cleanup (optional)
 */
function uninstallHooks(ideDir, homeDir, projectRoot) {
  if (ideDir === '.cursor') return uninstallCursorHooks(homeDir, projectRoot);
  if (ideDir === '.opencode') return uninstallOpenCodePlugin(homeDir);
  return uninstallClaudeHooks(homeDir);
}

module.exports = {
  installHooks,
  uninstallHooks,
  cleanLegacySettingsHooks,
  installOpenCodePlugin,
  uninstallOpenCodePlugin,
  removeProjectLevelHooks,
};
