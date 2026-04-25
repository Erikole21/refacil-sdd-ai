'use strict';

const fs = require('fs');
const path = require('path');

// ── Cursor: todos los hooks en .cursor/hooks.json ────────────────────────────

function readCursorHooksJson(projectRoot) {
  const p = path.join(projectRoot, '.cursor', 'hooks.json');
  if (!fs.existsSync(p)) return { version: 1, hooks: {} };
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!c.hooks) c.hooks = {};
    return c;
  } catch (_) {
    return { version: 1, hooks: {} };
  }
}

function writeCursorHooksJson(projectRoot, config) {
  const dir = path.join(projectRoot, '.cursor');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'hooks.json'), JSON.stringify(config, null, 2) + '\n');
}

function installCursorHooks(projectRoot) {
  cleanLegacySettingsHooks(projectRoot);
  const config = readCursorHooksJson(projectRoot);
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

  // compact-bash debe ir ANTES de check-review
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
    console.log('  Hooks SDD-AI ya configurados en .cursor/hooks.json.');
    return false;
  }

  writeCursorHooksJson(projectRoot, config);
  return true;
}

function uninstallCursorHooks(projectRoot) {
  const hooksJsonPath = path.join(projectRoot, '.cursor', 'hooks.json');
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
      if (changed) writeCursorHooksJson(projectRoot, config);
    }
  }

  // Limpiar vestigios en settings.json de instalaciones previas
  const settingsPath = path.join(projectRoot, '.cursor', 'settings.json');
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

  return changed;
}

// ── Claude Code: todos los hooks en .claude/settings.json ───────────────────

function installClaudeHooks(projectRoot) {
  const settingsDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
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
    console.log('  Hooks SDD-AI ya configurados en .claude/settings.json.');
    return false;
  }

  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

function uninstallClaudeHooks(projectRoot) {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return false;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_) {
    console.log('  No se pudieron remover hooks: .claude/settings.json invalido.');
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

function installOpenCodePlugin(projectRoot) {
  const pluginsDir = path.join(projectRoot, '.opencode', 'plugins');
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

function uninstallOpenCodePlugin(projectRoot) {
  const pluginPath = path.join(projectRoot, '.opencode', 'plugins', 'refacil-hooks.js');
  if (!fs.existsSync(pluginPath)) return false;
  try {
    fs.unlinkSync(pluginPath);
    return true;
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not remove OpenCode plugin: ${err.message}\n`);
    return false;
  }
}

// ── Fachada pública ──────────────────────────────────────────────────────────

function installHooks(ideDir, projectRoot) {
  if (ideDir === '.cursor') return installCursorHooks(projectRoot);
  if (ideDir === '.opencode') return installOpenCodePlugin(projectRoot);
  return installClaudeHooks(projectRoot);
}

function uninstallHooks(ideDir, projectRoot) {
  if (ideDir === '.cursor') return uninstallCursorHooks(projectRoot);
  if (ideDir === '.opencode') return uninstallOpenCodePlugin(projectRoot);
  return uninstallClaudeHooks(projectRoot);
}

module.exports = {
  installHooks,
  uninstallHooks,
  cleanLegacySettingsHooks,
  installOpenCodePlugin,
  uninstallOpenCodePlugin,
};
