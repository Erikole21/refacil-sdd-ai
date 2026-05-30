#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { removeCompactGuidance } = require('../lib/compact-guidance');
const { removeTestingPolicyBlock } = require('../lib/testing-policy-sync');
const { syncRepoSessionMarkers } = require('../lib/session-repo-sync');
const compactBash = require('../lib/compact/bash');
const {
  installSkills,
  installAgents,
  installOpenCodeJson,
  removeSkills,
  removeGlobalSkills,
  removeOpenCodeArtifacts,
  removeOpenCodeGlobalArtifacts,
  removeCodexArtifacts,
  removeOpenspecLegacyAssets,
  removeProjectLevelArtifacts,
  createClaudeMd,
  createCursorRules,
  readRepoVersion,
  writeRepoVersion,
  readGlobalVersion,
  writeGlobalVersion,
  getPackageVersion,
  checkNodeVersion,
  checkClaudeCodeVersion,
  promptCodegraphMode,
} = require('../lib/installer');
const { installHooks, uninstallHooks, cleanLegacySettingsHooks, installOpenCodePlugin, uninstallOpenCodePlugin, removeProjectLevelHooks } = require('../lib/hooks');
const { globalClaudeDir, globalCursorDir, globalOpenCodeDir, globalCodexDir, readSelectedIDEs, writeSelectedIDEs } = require('../lib/global-paths');
const { detectInstalledIDEs } = require('../lib/ide-detection');
const { handleCompact } = require('../lib/commands/compact');
const { handleBus } = require('../lib/commands/bus');
const { handleReadSpec } = require('../lib/commands/read-spec');
const { handleSdd, autoMigrateOpenspec, findProjectRoot, cmdWriteConfig } = require('../lib/commands/sdd');
const { handleAutopilot } = require('../lib/commands/autopilot');
const { resolveWorkspaceRoot } = require('../lib/project-root');
const { evaluateGitPushReview } = require('../lib/check-review');
const { syncIgnoreFiles } = require('../lib/ignore-files');
const { methodologyMigrationPending } = require('../lib/methodology-migration-pending');
const { resolveSelectedIDEsForRepo, syncRepoIdeFiles } = require('../lib/repo-ide-sync');
const codegraph = require('../lib/codegraph');

const packageRoot = path.resolve(__dirname, '..');
const projectRoot = findProjectRoot();

// --- check-update (SessionStart) + notify-update (UserPromptSubmit) ---

const isCursor = process.argv.includes('--cursor');

function ideBaseDir(root) {
  const claudeDir = path.join(root, '.claude');
  const cursorDir = path.join(root, '.cursor');
  return fs.existsSync(claudeDir) ? claudeDir : fs.existsSync(cursorDir) ? cursorDir : null;
}

function writePendingUpdateFlag(root, fromVersion, toVersion) {
  try {
    fs.writeFileSync(path.join(root, '.refacil-pending-update'), JSON.stringify({ from: fromVersion, to: toVersion }));
  } catch (_) {}
}

/** Clears `.refacil-pending-update` if there is no longer a pending migration (stale flags or skill sync without migration). */
function clearStalePendingUpdateFlag(root) {
  const flagPath = path.join(root, '.refacil-pending-update');
  if (!fs.existsSync(flagPath)) return;
  if (!methodologyMigrationPending(root).pending) {
    try { fs.unlinkSync(flagPath); } catch (_) {}
  }
}

function readStdinPrompt() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const data = JSON.parse(raw);
    return (data.prompt || data.message || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

function notifyUpdate() {
  const flagPath = path.join(projectRoot, '.refacil-pending-update');
  if (!fs.existsSync(flagPath)) return;

  let info = {};
  try { info = JSON.parse(fs.readFileSync(flagPath, 'utf8')); } catch (_) {}

  const mig = methodologyMigrationPending(projectRoot);
  if (!mig.pending) {
    try { fs.unlinkSync(flagPath); } catch (_) {}
    return;
  }

  const fromLabel = info.from ? `v${info.from}` : 'previous version';

  // If the user is already running /refacil:update, let it through and clear the flag
  const prompt = readStdinPrompt();
  if (prompt.includes('refacil:update') || prompt.includes('refacil/update')) {
    try { fs.unlinkSync(flagPath); } catch (_) {}
    return;
  }

  if (!info.shown) {
    // First time: block so the user sees it clearly
    try { fs.writeFileSync(flagPath, JSON.stringify({ ...info, shown: true })); } catch (_) {}
    const isSameVersion = info.from && info.to && info.from === info.to;
    const header = isSameVersion
      ? '[refacil-sdd-ai] Pending SDD-AI configuration detected.'
      : `[refacil-sdd-ai] Methodology update detected (${fromLabel} → v${info.to}).`;
    const reasonLines = mig.reasons.length
      ? '\nPending:\n' + mig.reasons.map((r) => `  • ${r}`).join('\n')
      : '';
    const userMsg =
      `${header}${reasonLines}\n` +
      `Your message was paused. Do you want to apply the pending migrations before continuing?\n` +
      `  • Yes: run /refacil:update\n` +
      `  • No: resend your previous message to continue without updating.`;
    if (isCursor) {
      process.stdout.write(JSON.stringify({ continue: false, user_message: userMsg }) + '\n');
    } else {
      process.stdout.write(userMsg + '\n');
      process.stderr.write(userMsg + '\n');
    }
    process.exit(2);
  } else {
    // Second time: let through and notify the LLM (only Claude Code supports context injection)
    try { fs.unlinkSync(flagPath); } catch (_) {}
    if (!isCursor) {
      const reasonSummary = mig.reasons.length ? ` Pending: ${mig.reasons.join('; ')}` : '';
      console.log(
        `[refacil-sdd-ai] IMPORTANT: there is a pending SDD-AI methodology update (${fromLabel} → v${info.to}).${reasonSummary} ` +
        `Before responding to the user, ask them if they want to run /refacil:update now.`,
      );
    }
  }
}

function repoIsInitialized(repoRoot = projectRoot) {
  const home = os.homedir();
  // Check global dirs first (new installation model)
  if (
    fs.existsSync(path.join(globalClaudeDir(home), 'skills')) ||
    fs.existsSync(path.join(globalCursorDir(home), 'skills')) ||
    fs.existsSync(path.join(globalOpenCodeDir(home), 'skills')) ||
    fs.existsSync(path.join(globalCodexDir(home), 'skills'))
  ) {
    return true;
  }
  // Fallback: check legacy project-level dirs for backward compat
  return (
    fs.existsSync(path.join(repoRoot, '.claude', 'skills')) ||
    fs.existsSync(path.join(repoRoot, '.cursor', 'skills')) ||
    fs.existsSync(path.join(repoRoot, '.opencode', 'skills'))
  );
}

/**
 * Inline readline-based multi-select for IDE targets.
 * Shows a checklist of available IDEs and returns the selected ones.
 * Falls back to all IDEs if stdin is not a TTY.
 * @param {Array<{label: string, value: string, selected: boolean}>} options
 * @returns {Promise<string[]>} selected values
 */
function readlineMultiSelect(options) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const selected = options.map((o) => o.selected);
    let renderCount = 0;

    function render() {
      if (renderCount > 0) {
        process.stdout.write(`\x1B[${options.length + 7}A\x1B[J`);
      }
      renderCount++;
      console.log('\n  Select IDEs to install refacil-sdd-ai into:');
      console.log('  (space = toggle, enter = confirm, a = toggle all)\n');
      for (let i = 0; i < options.length; i++) {
        const check = selected[i] ? '[x]' : '[ ]';
        console.log(`  ${check} ${options[i].label}`);
      }
      console.log('\n  Enter numbers to toggle (e.g. 1,2,3) or "a" for all, then Enter to confirm:');
    }

    render();

    rl.on('line', (line) => {
      const input = line.trim().toLowerCase();
      if (input === '') {
        rl.close();
        resolve(options.filter((_, i) => selected[i]).map((o) => o.value));
        return;
      }
      if (input === 'a') {
        const anySelected = selected.some(Boolean);
        for (let i = 0; i < selected.length; i++) selected[i] = !anySelected;
      } else {
        const nums = input.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n) && n >= 1 && n <= options.length);
        for (const n of nums) selected[n - 1] = !selected[n - 1];
      }
      render();
    });

    rl.on('close', () => {
      resolve(options.filter((_, i) => selected[i]).map((o) => o.value));
    });
  });
}

/**
 * Show interactive IDE selector if TTY and --all not in args.
 * Pre-selects IDEs based on detected installations and global dir presence.
 * Returns selected IDE dirs (e.g. ['.claude', '.cursor', '.opencode']).
 */
async function selectIDEs() {
  const allFlag = process.argv.includes('--all');
  const allIDEs = ['.claude', '.cursor', '.opencode', '.codex'];

  // --all or non-TTY: install all four
  if (allFlag || !process.stdout.isTTY) {
    return allIDEs;
  }

  // Determine pre-selection: persisted selection takes priority over detection.
  // Detection only filters which IDEs are available (installed in system).
  const detectedIds = detectInstalledIDEs();
  const savedSelection = readSelectedIDEs();
  const hasSaved = savedSelection !== null;

  const claudeSelected = hasSaved
    ? savedSelection.includes('.claude')
    : detectedIds.includes('claude') || fs.existsSync(path.join(projectRoot, '.claude'));
  const cursorSelected = hasSaved
    ? savedSelection.includes('.cursor')
    : detectedIds.includes('cursor') || fs.existsSync(path.join(projectRoot, '.cursor'));
  const openCodeSelected = hasSaved
    ? savedSelection.includes('.opencode')
    : detectedIds.includes('opencode') || fs.existsSync(path.join(projectRoot, '.opencode'));
  const codexSelected = hasSaved
    ? savedSelection.includes('.codex')
    : detectedIds.includes('codex');

  const options = [
    { label: 'Claude Code (~/.claude/)', value: '.claude', selected: claudeSelected },
    { label: 'Cursor (~/.cursor/)', value: '.cursor', selected: cursorSelected },
    { label: 'OpenCode (global config dir)', value: '.opencode', selected: openCodeSelected },
    { label: 'Codex (~/.codex/)', value: '.codex', selected: codexSelected },
  ];

  // Try @clack/prompts first, fall back to inline readline
  let selected;
  try {
    // @clack/prompts is an optional peer dep — try to load it without crashing if absent
    const clack = require('@clack/prompts');
    const result = await clack.multiselect({
      message: 'Select IDEs to install refacil-sdd-ai into:',
      options: options.map((o) => ({ label: o.label, value: o.value })),
      initialValues: options.filter((o) => o.selected).map((o) => o.value),
      required: false,
    });
    if (clack.isCancel(result)) {
      console.log('\n  Installation cancelled.\n');
      process.exit(0);
    }
    selected = result;
  } catch (_) {
    // @clack/prompts not available — use inline readline fallback
    selected = await readlineMultiSelect(options);
  }

  return selected;
}

function semverGt(a, b) {
  if (!a || !b) return false;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function syncRepoSkillsIfStale(globalVersion, repoRoot = projectRoot) {
  if (!repoIsInitialized(repoRoot)) return null;
  // Repo-level version takes priority; fall back to global store
  const repoVersion = readRepoVersion(repoRoot) || readGlobalVersion(os.homedir(), repoRoot);
  if (repoVersion === globalVersion) return null;

  // Repo has newer skills than the installed package — do not downgrade
  if (semverGt(repoVersion, globalVersion)) {
    process.stderr.write(
      `[refacil-sdd-ai] Global install uses methodology v${repoVersion} but the global package is v${globalVersion}. ` +
      `Run: npm update -g refacil-sdd-ai\n`,
    );
    return null;
  }

  const { execSync } = require('child_process');
  const localCli = path.join(packageRoot, 'bin', 'cli.js');
  try {
    execSync(`"${process.execPath}" "${localCli}" update`, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    writeGlobalVersion(globalVersion);
    return { from: repoVersion, to: globalVersion };
  } catch (_) {
    return { from: repoVersion, to: globalVersion, failed: true };
  }
}

function migrationPendingCmd() {
  const wantJson = process.argv.includes('--json');
  const { pending, reasons } = methodologyMigrationPending(projectRoot);
  if (wantJson) {
    process.stdout.write(`${JSON.stringify({ pending, reasons })}\n`);
  } else if (pending) {
    console.log('  Pending methodology migrations:');
    for (const r of reasons) console.log(`    - ${r}`);
  } else {
    console.log('  No pending methodology migrations (criteria aligned with hooks and /refacil:update).');
  }
  clearStalePendingUpdateFlag(projectRoot);
  process.exit(pending ? 1 : 0);
}

/**
 * Detect whether any active refacil flow is in progress (any .review-passed, proposal.md, etc.).
 * Returns true if the user is mid-flow so we don't interrupt with the CodeGraph suggestion.
 */
function isActiveRefacilFlow() {
  try {
    const changesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
    if (!fs.existsSync(changesDir)) return false;
    const entries = fs.readdirSync(changesDir, { withFileTypes: true });
    return entries.some(
      (e) => e.isDirectory() && e.name !== 'archive' &&
        fs.existsSync(path.join(changesDir, e.name, 'proposal.md')),
    );
  } catch (_) {
    return false;
  }
}

/**
 * Inject a CodeGraph suggestion block if conditions are met:
 *   1. codegraphMode is null/undefined (no preference set yet)
 *   2. No active refacil flow detected
 *   3. Suggestion has not been permanently suppressed (codegraph-suggest-shown: true)
 *   4. Snooze period has not expired
 */
function maybeInjectCodegraphSuggestion() {
  try {
    const { readConfigFile, extractCodegraphMode, extractCodegraphSuggestState, writeConfigValue } = require('../lib/config');
    const globalConfigPath = path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml');
    const globalCfg = readConfigFile(globalConfigPath) || {};

    const codegraphMode = extractCodegraphMode(globalCfg, 'global');
    if (codegraphMode !== null) return; // Already answered — do not suggest again

    const { shown, snoozeUntil } = extractCodegraphSuggestState(globalCfg, 'global');
    if (shown === true) return; // Permanently suppressed

    if (snoozeUntil) {
      try {
        const snoozeDate = new Date(snoozeUntil);
        if (!isNaN(snoozeDate.getTime()) && new Date() < snoozeDate) return; // Still snoozed
      } catch (_) {}
    }

    if (isActiveRefacilFlow()) return; // Mid-flow — do not interrupt

    const msg =
      '[refacil-sdd-ai] CodeGraph is available — an optional tool that reduces token usage ~71% ' +
      'in exploratory sub-agents (investigate, propose, debug) by querying the call graph instead of reading files.\n' +
      'https://github.com/colbymchenry/codegraph (MIT, Colby McHenry)\n\n' +
      'Would you like to enable CodeGraph integration?\n' +
      '  1) yes-now     — enable and index this repo immediately\n' +
      '  2) yes-later   — enable globally (index repos on /refacil:setup)\n' +
      '  3) no-7d       — remind me in 7 days\n' +
      '  4) never       — disable permanently\n\n' +
      'Type a number (1-4) and press Enter, or press Enter to skip: ';

    process.stdout.write(msg);

    // Only read stdin when running in a real TTY — in hook context stdin is a pipe
    // and fs.readFileSync(0) would block indefinitely waiting for data or EOF.
    if (!process.stdin.isTTY) return;

    let response = '';
    try {
      const raw = fs.readFileSync(0, { encoding: 'utf8', flag: 'r' });
      response = raw.trim().toLowerCase();
    } catch (_) {
      return; // stdin not readable in this context — skip
    }

    if (response === '1' || response === 'yes-now') {
      writeConfigValue('codegraphMode', 'enabled', os.homedir());
      writeConfigValue('codegraph-suggest-shown', 'true', os.homedir());
      const selectedIDEs = readSelectedIDEs() || ['.claude', '.cursor', '.opencode', '.codex'];
      codegraph.registerMcp(selectedIDEs);
      if (codegraph.isInstalled()) {
        codegraph.init(projectRoot);
        process.stdout.write('[refacil-sdd-ai] CodeGraph indexing started in background.\n');
      } else {
        process.stdout.write(
          '[refacil-sdd-ai] CodeGraph mode set to enabled. ' +
          'Install @colbymchenry/codegraph to activate: npm install -g @colbymchenry/codegraph\n',
        );
      }
    } else if (response === '2' || response === 'yes-later') {
      writeConfigValue('codegraphMode', 'enabled', os.homedir());
      writeConfigValue('codegraph-suggest-shown', 'true', os.homedir());
      process.stdout.write('[refacil-sdd-ai] CodeGraph mode set to enabled. Repos will be indexed on /refacil:setup.\n');
    } else if (response === '3' || response === 'no-7d') {
      const snoozeDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      writeConfigValue('codegraph-suggest-snooze', snoozeDate, os.homedir());
      process.stdout.write('[refacil-sdd-ai] CodeGraph suggestion snoozed for 7 days.\n');
    } else if (response === '4' || response === 'never') {
      writeConfigValue('codegraphMode', 'disabled', os.homedir());
      writeConfigValue('codegraph-suggest-shown', 'true', os.homedir());
      process.stdout.write(
        '[refacil-sdd-ai] CodeGraph disabled. Re-enable with: ' +
        'refacil-sdd-ai sdd config --set codegraph enabled\n',
      );
    }
    // Empty/unrecognised response — skip silently
  } catch (_) {
    // Suggestion injection must never break session startup
  }
}

function checkUpdate() {
  const root = resolveWorkspaceRoot();

  clearStalePendingUpdateFlag(root);

  try {
    autoMigrateOpenspec(root);
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not migrate openspec/ to refacil-sdd/: ${err.message}\n`);
  }

  try {
    const legacyRemoved = removeOpenspecLegacyAssets(root);
    if (legacyRemoved > 0) {
      process.stderr.write(`[refacil-sdd-ai] Removed ${legacyRemoved} legacy OpenSpec assets (openspec-* skills, opsx-* commands)\n`);
    }
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not remove legacy OpenSpec assets: ${err.message}\n`);
  }

  // Automatic cleanup of project-level refacil-* artifacts when global installation is active
  try {
    const home = os.homedir();
    const globalActive =
      fs.existsSync(path.join(globalClaudeDir(home), 'skills')) ||
      fs.existsSync(path.join(globalCursorDir(home), 'skills')) ||
      fs.existsSync(path.join(globalOpenCodeDir(home), 'skills')) ||
      fs.existsSync(path.join(globalCodexDir(home), 'skills'));

    if (globalActive) {
      const cleaned = removeProjectLevelArtifacts(root);
      removeProjectLevelHooks(root);
      if (cleaned > 0) {
        process.stdout.write(`[refacil-sdd-ai] Cleaned up ${cleaned} project-level artifact(s) — global installation is active.\n`);
      }
    }
  } catch (_) {
    // Tolerant — cleanup should never break session startup
  }

  const { execSync } = require('child_process');
  let localVersion = getPackageVersion(packageRoot);

  try {
    const syncOut = syncRepoSessionMarkers(root, packageRoot);
    if (!syncOut.ok) {
      process.stderr.write(`[refacil-sdd-ai] session repo sync: ${syncOut.reason}\n`);
    } else {
      if (syncOut.compact.status === 'error') {
        process.stderr.write(`[refacil-sdd-ai] Could not sync compact-guidance: ${syncOut.compact.message}\n`);
      }
      if (syncOut.testing.status === 'error') {
        process.stderr.write(`[refacil-sdd-ai] Could not sync testing-policy block: ${syncOut.testing.message}\n`);
      } else if (
        ['created-file', 'appended', 'replaced', 'written-empty'].includes(syncOut.testing.status)
      ) {
        process.stdout.write(`[refacil-sdd-ai] testing-policy: ${syncOut.testing.status} (.agents/testing.md)\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] session repo sync: ${err.message}\n`);
  }

  cleanLegacySettingsHooks(root);

  // Self-healing: if selected-ides.json exists but global skills/hooks are missing, restore them
  // Covers the case where the Claude Code desktop app overwrites settings.json and wipes SDD hooks,
  // or where skills were deleted by any means while the package is still installed.
  try {
    const home = os.homedir();
    const sddSelectedIDEs = readSelectedIDEs(home);
    if (sddSelectedIDEs && sddSelectedIDEs.length > 0) {
      const dirMap = {
        '.claude': globalClaudeDir(home),
        '.cursor': globalCursorDir(home),
        '.opencode': globalOpenCodeDir(home),
        '.codex': globalCodexDir(home),
      };
      const missingSkills = sddSelectedIDEs.some(
        (ide) => dirMap[ide] && !fs.existsSync(path.join(dirMap[ide], 'skills')),
      );
      if (missingSkills) {
        installSkills(packageRoot, home, sddSelectedIDEs);
        installAgents(packageRoot, home, sddSelectedIDEs);
        writeGlobalVersion(getPackageVersion(packageRoot));
        process.stdout.write('[refacil-sdd-ai] Self-healed: global skills and agents restored.\n');
      }
      // Always verify hooks are present for all selected IDEs — idempotent, only writes if missing
      for (const ide of ['.claude', '.cursor', '.opencode', '.codex']) {
        if (sddSelectedIDEs.includes(ide)) {
          installHooks(ide, home, root);
        }
      }
    }
  } catch (_) {
    // Tolerant — self-healing must never break session startup
  }

  // Step 1: update the global package if a newer version is available on npm
  try {
    const latest = execSync('npm view refacil-sdd-ai version', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (latest && semverGt(latest, localVersion)) {
      try {
        execSync('npm update -g refacil-sdd-ai', { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
        localVersion = latest;
      } catch (_) {
        console.log(
          `[refacil-sdd-ai] A new version is available (v${localVersion} -> v${latest}) but the automatic update failed. ` +
          `Run manually: npm update -g refacil-sdd-ai && refacil-sdd-ai update`,
        );
      }
    }
  } catch (_) {
    // Silent: sin internet o registry no disponible
  }

  // Step 2: sync repo skills with the (now updated) package
  const syncResult = syncRepoSkillsIfStale(localVersion, root);
  if (syncResult && !syncResult.failed) {
    const fromLabel = syncResult.from ? `v${syncResult.from}` : 'unknown version';
    console.log(
      `[refacil-sdd-ai] Repo skills synced (${fromLabel} -> v${syncResult.to}). ` +
      'Restart your IDE session to pick up the changes.',
    );
    if (methodologyMigrationPending(root).pending) {
      writePendingUpdateFlag(root, syncResult.from, syncResult.to);
    }
  } else if (syncResult && syncResult.failed) {
    console.log(
      `[refacil-sdd-ai] Repo skills are out of date with the global package (v${syncResult.to}) ` +
      'but automatic sync failed. Run manually: refacil-sdd-ai update',
    );
  }

  // Inject CodeGraph suggestion if the user has not set a preference yet
  maybeInjectCodegraphSuggestion();

  // CodeGraph auto-refresh — silent background operation, no user interaction
  try {
    const { loadBranchConfigWithSources } = require('../lib/config');
    const cfgInfo = loadBranchConfigWithSources(root);
    const cgMode = cfgInfo.codegraphMode;
    if (cgMode === 'enabled' || cgMode === 'per-repo') {
      if (!codegraph.isInstalled()) {
        // CLI missing: surface via notify-update banner (blocking once)
        writePendingUpdateFlag(root, localVersion, localVersion);
        process.stdout.write(
          '[refacil-sdd-ai] CodeGraph is enabled but the CLI is not installed. ' +
          'Run /refacil:update to install and configure it.\n',
        );
      } else if (!codegraph.isInitialized(root)) {
        // Not indexed: start automatically in the background, no question needed
        codegraph.init(root);
        process.stdout.write('[refacil-sdd-ai] CodeGraph: building index in background (~30s).\n');
      } else if (codegraph.isStale(root)) {
        // Index exists but new commits since last init: refresh silently
        codegraph.init(root);
        process.stdout.write('[refacil-sdd-ai] CodeGraph: refreshing index (new commits detected).\n');
      } else {
        // Initialized and up to date. If the timestamp file is absent (index was built
        // externally, not through our tools), write it now so isStale() has a reference.
        codegraph.touchTimestamp(root);
      }
    }
  } catch (_) {
    // Tolerant — CodeGraph state check must never break session startup
  }
}

// --- Check review (PreToolUse hook) ---

function checkReview() {
  let input;
  try {
    const stdin = fs.readFileSync(0, 'utf8');
    input = JSON.parse(stdin);
  } catch (_) {
    return;
  }

  const command = (input.tool_input && input.tool_input.command) || '';
  const block = evaluateGitPushReview(command, resolveWorkspaceRoot({ hookInput: input, skipStdin: true }));
  if (block) console.log(JSON.stringify(block));
}

// --- Branch config prompt (used by init) ---

/**
 * Prompt the user for global branch configuration interactively.
 * Skips if --yes or --defaults flag is present, or if stdout is not a TTY.
 * Pre-fills from existing global config values.
 * On confirmation, writes the global config via cmdWriteConfig.
 */
/** Normalize a comma-separated branch string into a trimmed, non-empty array. Falls back to `fallback` if empty. */
function parseBranchList(raw, fallback) {
  const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

async function promptBranchConfig() {
  const skipFlags = ['--yes', '--defaults'];
  if (skipFlags.some((f) => process.argv.includes(f))) return;
  if (!process.stdout.isTTY) return;

  const { readConfigFile, DEFAULT_PROTECTED_BRANCHES, DEFAULT_BASE_BRANCH, SUPPORTED_LANGUAGES, DEFAULT_ARTIFACT_LANGUAGE } = require('../lib/config');
  const globalConfigPath = path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml');
  const globalConfig = readConfigFile(globalConfigPath) || {};
  const currentBaseBranch = (typeof globalConfig.baseBranch === 'string' && globalConfig.baseBranch.trim()) ? globalConfig.baseBranch.trim() : DEFAULT_BASE_BRANCH;
  const currentProtected = (Array.isArray(globalConfig.protectedBranches) && globalConfig.protectedBranches.length > 0) ? globalConfig.protectedBranches : DEFAULT_PROTECTED_BRANCHES;
  const currentArtifactLanguage = (typeof globalConfig.artifactLanguage === 'string' && SUPPORTED_LANGUAGES.includes(globalConfig.artifactLanguage.trim())) ? globalConfig.artifactLanguage.trim() : DEFAULT_ARTIFACT_LANGUAGE;

  console.log('\n  Branch configuration (global, stored in ~/.refacil-sdd-ai/config.yaml)');
  console.log(`  Current base branch:        ${currentBaseBranch}`);
  console.log(`  Current protected branches: ${currentProtected.join(', ')}`);
  console.log(`  Current artifact language:  ${currentArtifactLanguage}`);
  console.log('  Press Enter to keep current values, or type new ones.\n');

  let baseBranch;
  let protectedBranches;
  let artifactLanguage;

  try {
    const clack = require('@clack/prompts');

    const bbResult = await clack.text({
      message: `Base branch (current: ${currentBaseBranch}):`,
      placeholder: currentBaseBranch,
      validate: () => undefined,
    });
    if (clack.isCancel(bbResult)) {
      console.log('  Branch config prompt cancelled. Keeping existing values.\n');
      return;
    }
    baseBranch = (bbResult && bbResult.trim()) ? bbResult.trim() : currentBaseBranch;

    const pbResult = await clack.text({
      message: `Protected branches, comma-separated (current: ${currentProtected.join(', ')}):`,
      placeholder: currentProtected.join(', '),
      validate: () => undefined,
    });
    if (clack.isCancel(pbResult)) {
      console.log('  Branch config prompt cancelled. Keeping existing values.\n');
      return;
    }
    protectedBranches = parseBranchList((pbResult && pbResult.trim()) ? pbResult.trim() : currentProtected.join(', '), currentProtected);

    const alResult = await clack.text({
      message: `Artifact language — ${SUPPORTED_LANGUAGES.join(' | ')} (current: ${currentArtifactLanguage}):`,
      placeholder: currentArtifactLanguage,
      validate: () => undefined,
    });
    if (clack.isCancel(alResult)) {
      console.log('  Branch config prompt cancelled. Keeping existing values.\n');
      return;
    }
    const alRaw = (alResult && alResult.trim()) ? alResult.trim() : currentArtifactLanguage;
    artifactLanguage = SUPPORTED_LANGUAGES.includes(alRaw) ? alRaw : currentArtifactLanguage;

    const confirm = await clack.confirm({
      message: `Save global config — base: "${baseBranch}", protected: [${protectedBranches.join(', ')}], language: ${artifactLanguage}?`,
      initialValue: true,
    });
    if (clack.isCancel(confirm) || !confirm) {
      console.log('  Branch config not saved.\n');
      return;
    }
  } catch (_) {
    // @clack/prompts not available — use inline readline fallback
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    const bbAnswer = await ask(`  Base branch [${currentBaseBranch}]: `);
    baseBranch = (bbAnswer && bbAnswer.trim()) ? bbAnswer.trim() : currentBaseBranch;

    const pbAnswer = await ask(`  Protected branches [${currentProtected.join(', ')}]: `);
    protectedBranches = parseBranchList((pbAnswer && pbAnswer.trim()) ? pbAnswer.trim() : currentProtected.join(', '), currentProtected);

    const alAnswer = await ask(`  Artifact language [${currentArtifactLanguage}] (${SUPPORTED_LANGUAGES.join('/')}): `);
    const alRaw = (alAnswer && alAnswer.trim()) ? alAnswer.trim() : currentArtifactLanguage;
    artifactLanguage = SUPPORTED_LANGUAGES.includes(alRaw) ? alRaw : currentArtifactLanguage;

    const confirmAnswer = await ask(`  Save global config — base: "${baseBranch}", protected: [${protectedBranches.join(', ')}], language: ${artifactLanguage}? (Y/n): `);
    rl.close();
    if (confirmAnswer.trim().toLowerCase() === 'n') {
      console.log('  Branch config not saved.\n');
      return;
    }
  }

  // Pre-check to avoid process.exit(0) from cmdWriteConfig no-op path when called programmatically
  const valuesUnchanged = baseBranch === currentBaseBranch &&
    JSON.stringify(protectedBranches.slice().sort()) === JSON.stringify(currentProtected.slice().sort()) &&
    artifactLanguage === currentArtifactLanguage;
  if (valuesUnchanged) {
    console.log('  Branch config unchanged. Keeping existing values.\n');
    return;
  }

  // Build argv-style array and call cmdWriteConfig directly
  // Only write artifactLanguage if user chose a non-default value
  const writeArgv = [
    '--global',
    '--base-branch', baseBranch,
    '--protected-branches', protectedBranches.join(','),
    '--artifact-language', artifactLanguage,
  ];
  try {
    cmdWriteConfig(writeArgv, projectRoot);
  } catch (err) {
    console.error(`  Warning: could not write global branch config: ${err.message}`);
  }
  console.log('');
}

// --- High-level commands ---

async function init() {
  console.log('\n  refacil-sdd-ai: Initializing SDD-AI methodology...\n');

  const nodeOk = checkNodeVersion();
  if (nodeOk) console.log(`  Node.js ${process.version} OK`);

  const claudeCheck = checkClaudeCodeVersion();
  if (claudeCheck.ok === true) {
    console.log(`  Claude Code ${claudeCheck.version} OK`);
  } else if (claudeCheck.ok === false) {
    console.log(`\n  WARNING: Claude Code ${claudeCheck.version} detected.`);
    console.log('  The compact-bash hook requires Claude Code >= 2.1.89 for silent rewrite.');
    console.log('  It will still install on older versions but the rewrite will have no effect.');
    console.log('  Update with: npm install -g @anthropic-ai/claude-code\n');
  }

  // Select target IDEs (interactive selector or --all / non-TTY)
  const selectedIDEs = await selectIDEs();

  // Prompt for global branch configuration (skipped with --yes/--defaults or non-TTY)
  await promptBranchConfig();

  // Prompt for CodeGraph integration mode (skipped with --yes/--defaults or non-TTY)
  await promptCodegraphMode(os.homedir());

  if (selectedIDEs.length === 0) {
    console.log('\n  No IDEs selected. Nothing installed.\n');
    console.log('  Re-run with: refacil-sdd-ai init --all   to install for all IDEs');
    process.exit(0);
    return;
  }

  // Persist the user's IDE selection — used by update and check-update as source of truth
  writeSelectedIDEs(selectedIDEs);

  const installClaude = selectedIDEs.includes('.claude');
  const installCursor = selectedIDEs.includes('.cursor');
  const installOpenCode = selectedIDEs.includes('.opencode');
  const installCodex = selectedIDEs.includes('.codex');
  const homeDir = os.homedir();

  // Migration step: remove project-level artifacts (now global) — silent, non-destructive
  try {
    removeProjectLevelArtifacts(projectRoot);
    removeProjectLevelHooks(projectRoot);
  } catch (_) {
    // Tolerant — migration cleanup should not block installation
  }

  const count = installSkills(packageRoot, homeDir, selectedIDEs);
  const ideList = selectedIDEs.map((d) => {
    if (d === '.claude') return `~/.claude/skills/`;
    if (d === '.cursor') return `~/.cursor/skills/`;
    if (d === '.codex') return `~/.codex/skills/`;
    return `(opencode-global)/skills/`;
  }).join(', ');
  console.log(`  ${count} skills installed in ${ideList}`);

  const agentsCount = installAgents(packageRoot, homeDir, selectedIDEs);
  if (agentsCount > 0) {
    const agentList = selectedIDEs.map((d) => {
      if (d === '.claude') return `~/.claude/agents/`;
      if (d === '.cursor') return `~/.cursor/agents/`;
      if (d === '.codex') return `~/.codex/agents/`;
      return `(opencode-global)/agents/`;
    }).join(', ');
    console.log(`  ${agentsCount} sub-agents installed in ${agentList}`);
  }

  writeGlobalVersion(getPackageVersion(packageRoot));

  if (installClaude) {
    if (createClaudeMd(packageRoot, projectRoot)) console.log('  CLAUDE.md OK');
    if (installHooks('.claude', homeDir, projectRoot)) {
      console.log('  Hook check-update added to ~/.claude/settings.json');
    }
  }

  if (installCursor) {
    if (createCursorRules(packageRoot, projectRoot)) console.log('  .cursorrules OK');
    if (installHooks('.cursor', homeDir, projectRoot)) {
      console.log('  Hook check-update added to ~/.cursor/hooks.json');
    }
  }

  if (installOpenCode) {
    if (installHooks('.opencode', homeDir, projectRoot)) {
      console.log('  OpenCode plugin installed to global plugins directory');
    }
  }

  if (installCodex) {
    if (installHooks('.codex', homeDir)) {
      console.log('  Hook check-update added to ~/.codex/config.toml');
    }
  }

  try {
    const IDE_TO_IGNORE = { '.claude': '.claudeignore', '.cursor': '.cursorignore', '.opencode': '.opencodeignore' };
    const ignoreResult = syncIgnoreFiles(projectRoot, selectedIDEs);
    const ignoreNames = selectedIDEs.map((d) => IDE_TO_IGNORE[d]).filter(Boolean).join(', ');
    const s = ignoreResult.claude || ignoreResult.cursor || ignoreResult.opencode;
    if (s && s.status === 'created') {
      console.log(`  ${ignoreNames} created`);
    } else if (s && s.status === 'updated') {
      console.log(`  ${ignoreNames} updated (${s.added} entries added)`);
    } else if (ignoreNames) {
      console.log(`  ${ignoreNames} are up to date`);
    }
  } catch (err) {
    console.error(`  Warning: could not sync ignore files: ${err.message}`);
  }

  try {
    const syncOut = syncRepoSessionMarkers(projectRoot, packageRoot);
    if (!syncOut.ok) {
      console.error(`  Warning: session repo sync: ${syncOut.reason}`);
    } else {
      if (syncOut.compact.status === 'error') {
        console.error(`  Warning: could not sync compact-guidance: ${syncOut.compact.message}`);
      } else if (syncOut.compact.status === 'appended') {
        console.log('  compact-guidance block added to AGENTS.md');
      } else if (syncOut.compact.status === 'replaced') {
        console.log('  compact-guidance block updated in AGENTS.md');
      }
      if (syncOut.testing.status === 'error') {
        console.error(`  Warning: could not sync testing-policy: ${syncOut.testing.message}`);
      } else if (syncOut.testing.status === 'created-file') {
        console.log('  testing-policy: created .agents/testing.md');
      } else if (syncOut.testing.status === 'appended' || syncOut.testing.status === 'written-empty') {
        console.log('  testing-policy block added to .agents/testing.md');
      } else if (syncOut.testing.status === 'replaced') {
        console.log('  testing-policy block updated in .agents/testing.md');
      }
    }
  } catch (err) {
    console.error(`  Warning: session repo sync: ${err.message}`);
  }

  console.log('\n  Next steps:\n');
  console.log('  1. RESTART your IDE session');
  console.log('     (new skills are not detected until the session is restarted)\n');
  console.log('  2. Run: /refacil:setup');
  console.log('     (generates AGENTS.md for your project)\n');
}

function update() {
  console.log('\n  refacil-sdd-ai: Updating skills...\n');

  const homeDir = os.homedir();

  const selectedIDEs = resolveSelectedIDEsForRepo(projectRoot, homeDir);

  const hasClaudeDir = selectedIDEs.includes('.claude');
  const hasCursorDir = selectedIDEs.includes('.cursor');
  const hasOpenCodeDir = selectedIDEs.includes('.opencode');
  const hasCodexDir = selectedIDEs.includes('.codex');
  const detectedIDEs = selectedIDEs;

  // Migration step: remove project-level artifacts — silent, non-destructive
  try {
    removeProjectLevelArtifacts(projectRoot);
    removeProjectLevelHooks(projectRoot);
  } catch (_) {}

  const count = installSkills(packageRoot, homeDir, detectedIDEs);
  const installedDirs = detectedIDEs.map((d) => {
    if (d === '.claude') return '~/.claude/skills/';
    if (d === '.cursor') return '~/.cursor/skills/';
    if (d === '.codex') return '~/.codex/skills/';
    return '(opencode-global)/skills/';
  });
  console.log(`  ${count} skills updated in ${installedDirs.join(', ') || '(none detected)'}`);

  const agentsCount = installAgents(packageRoot, homeDir, detectedIDEs);
  if (agentsCount > 0) {
    const agentDirs = [
      hasClaudeDir && '~/.claude/agents/',
      hasCursorDir && '~/.cursor/agents/',
      hasOpenCodeDir && '(opencode-global)/agents/',
      hasCodexDir && '~/.codex/agents/',
    ].filter(Boolean);
    console.log(`  ${agentsCount} sub-agents updated in ${agentDirs.join(', ')}`);
  }

  try {
    const legacyRemoved = removeOpenspecLegacyAssets(projectRoot);
    if (legacyRemoved > 0) {
      console.log(`  ${legacyRemoved} legacy OpenSpec assets removed (openspec-* skills, opsx-* commands)`);
    }
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not remove legacy OpenSpec assets: ${err.message}\n`);
  }

  writeGlobalVersion(getPackageVersion(packageRoot));
  if (hasClaudeDir) {
    createClaudeMd(packageRoot, projectRoot);
    if (installHooks('.claude', homeDir, projectRoot)) {
      console.log('  Hook check-update added to ~/.claude/settings.json');
    }
  }

  if (hasCursorDir) {
    createCursorRules(packageRoot, projectRoot);
    if (installHooks('.cursor', homeDir, projectRoot)) {
      console.log('  Hook check-update added to ~/.cursor/hooks.json');
    }
  }

  if (hasOpenCodeDir) {
    if (installHooks('.opencode', homeDir, projectRoot)) {
      console.log('  OpenCode plugin updated in global config directory');
    }
  }

  if (hasCodexDir) {
    if (installHooks('.codex', homeDir)) {
      console.log('  Hook check-update updated in ~/.codex/config.toml');
    }
  }

  try {
    const IDE_TO_IGNORE = { '.claude': '.claudeignore', '.cursor': '.cursorignore', '.opencode': '.opencodeignore' };
    const ignoreResult = syncIgnoreFiles(projectRoot, detectedIDEs);
    const ignoreNames = detectedIDEs.map((d) => IDE_TO_IGNORE[d]).filter(Boolean).join(', ');
    const s = ignoreResult.claude || ignoreResult.cursor || ignoreResult.opencode;
    if (s && s.status === 'created') {
      console.log(`  ${ignoreNames} created`);
    } else if (s && s.status === 'updated') {
      console.log(`  ${ignoreNames} updated (${s.added} entries added)`);
    } else if (ignoreNames) {
      console.log(`  ${ignoreNames} are up to date`);
    }
  } catch (err) {
    console.error(`  Warning: could not sync ignore files: ${err.message}`);
  }

  try {
    const syncOut = syncRepoSessionMarkers(projectRoot, packageRoot);
    if (!syncOut.ok) {
      console.error(`  Warning: session repo sync: ${syncOut.reason}`);
    } else {
      if (syncOut.compact.status === 'error') {
        console.error(`  Warning: could not sync compact-guidance: ${syncOut.compact.message}`);
      } else if (syncOut.compact.status === 'appended') {
        console.log('  compact-guidance block added to AGENTS.md');
      } else if (syncOut.compact.status === 'replaced') {
        console.log('  compact-guidance block updated in AGENTS.md');
      }
      if (syncOut.testing.status === 'error') {
        console.error(`  Warning: could not sync testing-policy: ${syncOut.testing.message}`);
      } else if (syncOut.testing.status === 'created-file') {
        console.log('  testing-policy: created .agents/testing.md');
      } else if (syncOut.testing.status === 'appended' || syncOut.testing.status === 'written-empty') {
        console.log('  testing-policy block added to .agents/testing.md');
      } else if (syncOut.testing.status === 'replaced') {
        console.log('  testing-policy block updated in .agents/testing.md');
      }
    }
  } catch (err) {
    console.error(`  Warning: session repo sync: ${err.message}`);
  }

  try {
    const { loadBranchConfigWithSources } = require('../lib/config');
    const cfgInfo = loadBranchConfigWithSources(projectRoot);
    if (cfgInfo.codegraphMode && cfgInfo.codegraphMode !== 'disabled') {
      codegraph.registerMcp(selectedIDEs, homeDir);
    }
  } catch (_) {}

  console.log('\n  RESTART your IDE session to apply the changes.\n');
}

/**
 * Per-repo CLAUDE.md, .cursorrules, ignore files, and session markers (compact-guidance, testing-policy).
 * IDE list: ~/.refacil-sdd-ai/selected-ides.json, with the same fallback heuristics as `update`.
 * Does not install skills or hooks (use `init` / `update`).
 */
function syncRepoIde() {
  console.log('\n  refacil-sdd-ai: sync-repo-ide — per-repo files for selected IDEs...\n');

  const homeDir = os.homedir();
  const { selectedIDEs, ignoreResult, sessionOut } = syncRepoIdeFiles(packageRoot, projectRoot, homeDir);

  if (selectedIDEs.length === 0) {
    const selPath = path.join(homeDir, '.refacil-sdd-ai', 'selected-ides.json');
    console.log('  No IDE selection found and nothing could be inferred.');
    console.log(`  Run: refacil-sdd-ai init   (writes ${selPath})\n`);
    return;
  }

  console.log(`  IDE selection: ${selectedIDEs.join(', ')}`);

  try {
    const IDE_TO_IGNORE = { '.claude': '.claudeignore', '.cursor': '.cursorignore', '.opencode': '.opencodeignore' };
    const ignoreNames = selectedIDEs.map((d) => IDE_TO_IGNORE[d]).filter(Boolean).join(', ');
    const s = ignoreResult.claude || ignoreResult.cursor || ignoreResult.opencode;
    if (s && s.status === 'created') {
      console.log(`  ${ignoreNames} created`);
    } else if (s && s.status === 'updated') {
      console.log(`  ${ignoreNames} updated (${s.added} entries added)`);
    } else if (ignoreNames) {
      console.log(`  ${ignoreNames} are up to date`);
    }
  } catch (err) {
    console.error(`  Warning: could not sync ignore files: ${err.message}`);
  }

  if (sessionOut && !sessionOut.ok) {
    console.error(`  Warning: session repo sync: ${sessionOut.reason || 'unknown'}`);
  } else if (sessionOut && sessionOut.ok) {
    try {
      if (sessionOut.compact.status === 'error') {
        console.error(`  Warning: could not sync compact-guidance: ${sessionOut.compact.message}`);
      } else if (sessionOut.compact.status === 'appended') {
        console.log('  compact-guidance block added to AGENTS.md');
      } else if (sessionOut.compact.status === 'replaced') {
        console.log('  compact-guidance block updated in AGENTS.md');
      }
      if (sessionOut.testing.status === 'error') {
        console.error(`  Warning: could not sync testing-policy: ${sessionOut.testing.message}`);
      } else if (sessionOut.testing.status === 'created-file') {
        console.log('  testing-policy: created .agents/testing.md');
      } else if (sessionOut.testing.status === 'appended' || sessionOut.testing.status === 'written-empty') {
        console.log('  testing-policy block added to .agents/testing.md');
      } else if (sessionOut.testing.status === 'replaced') {
        console.log('  testing-policy block updated in .agents/testing.md');
      }
    } catch (err) {
      console.error(`  Warning: session repo sync: ${err.message}`);
    }
  }

  console.log('');
}

function clean() {
  console.log('\n  refacil-sdd-ai: Removing skills...\n');

  const homeDir = os.homedir();

  const selectedIDEs = resolveSelectedIDEsForRepo(projectRoot, homeDir);
  const fallbackIDEs = ['.claude', '.cursor', '.opencode', '.codex'];
  const ideDirsForClean = selectedIDEs.length > 0 ? selectedIDEs : fallbackIDEs;
  const globalCount = removeGlobalSkills(homeDir, ideDirsForClean);
  if (globalCount > 0) {
    console.log(`  ${globalCount} global skills removed from IDE user directories`);
  }

  const count = removeSkills(projectRoot);
  if (count > 0) {
    console.log(`  ${count} project-level skills removed from .claude/skills/ and .cursor/skills/`);
  }

  if (ideDirsForClean.includes('.claude') || ideDirsForClean.includes('claude')) {
    if (uninstallHooks('.claude', homeDir)) {
      console.log('  SDD-AI hooks removed from ~/.claude/settings.json');
    } else {
      console.log('  No SDD-AI hooks found to remove in ~/.claude/settings.json.');
    }
  }
  if (ideDirsForClean.includes('.cursor') || ideDirsForClean.includes('cursor')) {
    if (uninstallHooks('.cursor', homeDir)) {
      console.log('  SDD-AI hooks removed from ~/.cursor/hooks.json');
    }
  }

  if (ideDirsForClean.includes('.opencode') || ideDirsForClean.includes('opencode')) {
    try {
      removeOpenCodeGlobalArtifacts(homeDir);
      if (uninstallOpenCodePlugin(homeDir)) {
        console.log('  OpenCode global skills, agents, and plugin removed');
      } else {
        console.log('  OpenCode global artifacts removed from config directory');
      }
    } catch (err) {
      console.error(`  Warning: could not remove OpenCode global artifacts: ${err.message}`);
    }
  }

  if (ideDirsForClean.includes('.codex') || ideDirsForClean.includes('codex')) {
    try {
      removeCodexArtifacts(homeDir);
      console.log('  Codex skills and agents removed from ~/.codex/');
    } catch (err) {
      console.error(`  Warning: could not remove Codex artifacts: ${err.message}`);
    }
    if (uninstallHooks('.codex', homeDir)) {
      console.log('  SDD-AI hooks removed from ~/.codex/config.toml');
    }
  }

  // Clean project-level OpenCode artifacts if .opencode/ directory is present
  if (fs.existsSync(path.join(projectRoot, '.opencode'))) {
    try {
      removeOpenCodeArtifacts(projectRoot);
      console.log('  OpenCode skills and agents removed from .opencode/');
    } catch (err) {
      console.error(`  Warning: could not remove OpenCode artifacts: ${err.message}`);
    }
  }

  try {
    const result = removeCompactGuidance(projectRoot);
    if (result.status === 'removed') {
      console.log('  compact-guidance block removed from AGENTS.md');
    }
  } catch (err) {
    console.error(`  Warning: could not clean compact-guidance: ${err.message}`);
  }

  try {
    const tp = removeTestingPolicyBlock(projectRoot);
    if (tp.status === 'removed') {
      console.log('  testing-policy block removed from .agents/testing.md');
    }
  } catch (err) {
    console.error(`  Warning: could not clean testing-policy: ${err.message}`);
  }

  console.log('  AGENTS.md, CLAUDE.md and .cursorrules were not removed.');
  console.log('\n  Note: if you have openspec/ in the repo, migrate first with: refacil-sdd-ai sdd status');
  console.log('  (the openspec/ → refacil-sdd/ migration is automatic on any sdd subcommand)');
  console.log('  To remove the openspec/ directory after migrating: rm -rf openspec/\n');
}

function help() {
  const home = os.homedir();
  const claudePath = globalClaudeDir(home);
  const cursorPath = globalCursorDir(home);
  const opencodePath = globalOpenCodeDir(home);
  const codexPath = globalCodexDir(home);

  console.log(`
  refacil-sdd-ai — SDD-AI Methodology

  Commands:
    init          Install skills globally for Claude Code, Cursor, OpenCode and/or Codex (interactive IDE selector).
                  Use --all to install for all four IDEs without prompting.
                  Use --yes or --defaults to skip interactive branch config prompts.
                  Creates repo stubs (CLAUDE.md, .cursorrules, ignores) for selected IDEs; same logic as sync-repo-ide.
                  Migrates any project-level artifacts to global dirs automatically.
    update        Re-copy skills for all selected IDEs to global user dirs
    sync-repo-ide Same IDE list as update (selected-ides.json): CLAUDE.md, .cursorrules,
                  ignore files, compact-guidance + testing-policy in repo (no global install)
    migration-pending  Same validation as hooks/notify-update: list migrations (exit 1 if any; --json)
    check-update   Sync skills, compact-guidance (AGENTS.md), and testing-policy block (.agents/testing.md) at session start
    notify-update  Notify methodology migration only if applicable (UserPromptSubmit hook)
    check-review   Verify that review has been completed (used by PreToolUse hook)
    compact-bash  Rewrite bare Bash commands to reduce tokens (used by PreToolUse hook)
    compact       Subcommands for the compact-bash hook:
                    compact stats      - Stats (hook + CodeGraph) and estimated savings
                    compact log-codegraph-event - Log CodeGraph session (--skill --has-graph --tool-calls --tokens)
                    compact disable    - Temporarily disable rewrite
                    compact enable     - Re-enable rewrite
                    compact clear-log  - Clear compact.log
                    compact codegraph-clear-log - Clear codegraph.log
    bus           Subcommands for the inter-agent chat room (refacil-bus):
                    bus start          - Start the local broker (auto-spawn detached)
                    bus stop           - Stop the broker
                    bus status         - Show port, pid, uptime of the broker
                    bus serve          - (internal) Run the broker in foreground
                    bus join --room <room> [--session <s>] [--intro "..."]
                    bus leave [--session <s>]
                    bus say --text "..." [--from-env VAR] [--session <s>]
                    bus ask --to <name|all|*|everyone> --text "..." [--from-env VAR] [--wait N] [--session <s>]
                    bus reply --text "..." [--from-env VAR] [--correlation <id>] [--to <name>]
                    bus history [--n N] [--session <s>]
                    bus inbox [--session <s>]
                    bus rooms
                    bus watch <session> [--room <room>]  (live panel, no tokens)
                    bus attend [--timeout N]             (listen for directed questions)
                    bus view                             (open the web UI in the browser)
    read-spec     Read a Markdown spec aloud in the browser (on-device TTS):
                    read-spec --file <path> [--lang es] [--voice M3] [--speed 1]
    sdd           Subcommands for managing SDD-AI artifacts in refacil-sdd/:
                    sdd new-change <name>         Create a change with proposal/design/tasks/specs scaffold
                    sdd archive <name>             Archive a change to refacil-sdd/changes/archive/
                    sdd list [--json]              List active changes with review status
                    sdd status <name> [--json]     Artifact and task status of a change
                    sdd mark-reviewed <name>       Write .review-passed (requires --verdict and --summary)
                    sdd tasks-update <name>        Mark task N as completed (--task N --done)
                    sdd validate-name <name>       Validate change name format
                    sdd config [--json]            Show effective branch config (project > global > defaults)
                    sdd write-config              Write branch config to project or global config file
                      [--global]                    Write to ~/.refacil-sdd-ai/config.yaml (global level)
                      [--base-branch <branch>]      Base branch for new changes
                      [--protected-branches <csv>]  Protected branches (comma-separated)
                      [--artifact-language <lang>]  Artifact language: english (default) or spanish
    kapso         Subcommands for Kapso WhatsApp notification setup:
                    kapso setup       Interactive setup of ~/.refacil-sdd-ai/kapso.env
                                      (KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID, NOTIFY_PHONE)
                    kapso preflight   Check credentials and print 24h window notice (--json)
                    kapso notify      Send a WhatsApp notification (success|failure) with flags
    autopilot     Subcommands for the autopilot pipeline:
                    autopilot ready-message   Generate the pre-flight ready message
                                              (--change <name> [--ide <ide>] [--lang es|en])
    clean         Remove SDD-AI hooks from global IDE config dirs and skills from global dirs
    help          Show this help

  Full flow:
    1. npm install -g refacil-sdd-ai
    2. refacil-sdd-ai init
    3. RESTART your IDE session (Claude Code, Cursor, OpenCode, or Codex)
    4. Run: /refacil:setup (generates AGENTS.md + sync-repo-ide stubs/ignores for selected IDEs)

  Global installation paths (this machine):
    - Claude Code: ${claudePath}/skills/, ${claudePath}/agents/
                   ${claudePath}/settings.json (hooks)
    - Cursor:      ${cursorPath}/skills/, ${cursorPath}/agents/
                   ${cursorPath}/hooks.json (hooks)
    - OpenCode:    ${opencodePath}/skills/, ${opencodePath}/agents/
                   ${opencodePath}/plugins/refacil-hooks.js
    - Codex:       ${codexPath}/skills/, ${codexPath}/agents/
                   ${codexPath}/config.toml (hooks)

  Requirements:
    - Node.js >= 20.0.0
    - Claude Code >= 2.1.89 (required by compact-bash for silent rewrite), Cursor, or OpenCode
  `);
}

// --- Main ---

const args = process.argv.slice(2);
const command = args[0] || 'help';

if (command === '--version' || command === '-v') {
  console.log(getPackageVersion(packageRoot));
  process.exit(0);
}

switch (command) {
  case 'init':
    init().catch((err) => {
      console.error(`  Error during init: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'update':
    update();
    break;
  case 'sync-repo-ide':
    syncRepoIde();
    break;
  case 'migration-pending':
    migrationPendingCmd();
    break;
  case 'check-update':
    checkUpdate();
    break;
  case 'notify-update':
    notifyUpdate();
    break;
  case 'check-review':
    checkReview();
    break;
  case 'compact-bash':
    compactBash.run();
    break;
  case 'compact':
    handleCompact(process.argv[3], process.argv.slice(4));
    break;
  case 'bus':
    handleBus(process.argv[3], process.argv.slice(4), packageRoot);
    break;
  case 'read-spec':
    handleReadSpec(process.argv.slice(3), packageRoot, projectRoot).catch((err) => {
      console.error(`  Error: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'sdd':
    handleSdd(process.argv[3], process.argv.slice(4), projectRoot);
    break;
  case 'codegraph': {
    const cgSub = process.argv[3];
    if (cgSub === 'init') {
      codegraph.init(projectRoot);
      codegraph.registerMcp(readSelectedIDEs() || ['.claude', '.cursor', '.opencode', '.codex']);
      console.log('[refacil-sdd-ai] CodeGraph indexing started in background. Run your next /refacil:explore when it finishes.');
    } else if (cgSub === 'status') {
      const { loadBranchConfigWithSources } = require('../lib/config');
      const cfgInfo = loadBranchConfigWithSources(projectRoot);
      const installed = codegraph.isInstalled();
      const initialized = codegraph.isInitialized(projectRoot);
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify({
          installed,
          initialized,
          mode: cfgInfo.codegraphMode,
          modeSource: cfgInfo.sources.codegraphMode,
        }));
      } else {
        console.log('  CodeGraph status:');
        console.log(`    installed:    ${installed}`);
        console.log(`    initialized:  ${initialized} (${projectRoot})`);
        console.log(`    mode:         ${cfgInfo.codegraphMode || '(not set)'} [source: ${cfgInfo.sources.codegraphMode}]`);
      }
    } else if (cgSub === 'setup') {
      // Install CLI if missing, register MCP, then index synchronously so the caller
      // (skill / agent) does not continue until .codegraph/ is fully built.
      const { execSync } = require('child_process');
      const selectedIDEs = readSelectedIDEs() || ['.claude', '.cursor', '.opencode', '.codex'];
      if (!codegraph.isInstalled()) {
        process.stdout.write('[refacil-sdd-ai] Installing @colbymchenry/codegraph globally...\n');
        try {
          execSync('npm install -g @colbymchenry/codegraph', { stdio: 'inherit', timeout: 120000 });
          process.stdout.write('[refacil-sdd-ai] @colbymchenry/codegraph installed.\n');
        } catch (err) {
          process.stderr.write(`[refacil-sdd-ai] Failed to install codegraph: ${err.message}\n`);
          process.exit(1);
        }
      }
      codegraph.registerMcp(selectedIDEs);
      if (!codegraph.isInitialized(projectRoot)) {
        process.stdout.write(`[refacil-sdd-ai] Initializing CodeGraph at ${projectRoot} ...\n`);
        try {
          // Step 1: init creates .codegraph/ structure (fast, ~1s).
          execSync('codegraph init', {
            stdio: 'inherit',
            cwd: projectRoot,
            timeout: 30000,
            shell: true,
          });
          process.stdout.write('[refacil-sdd-ai] Building index (this may take ~30s) ...\n');
          // Step 2: index builds the actual symbol graph.
          // Run synchronously with inherited stdio so the agent sees all output and
          // waits for the graph to be fully built before continuing.
          execSync('codegraph index', {
            stdio: 'inherit',
            cwd: projectRoot,
            timeout: 300000, // 5 min ceiling for large repos
            shell: true,
          });
          // Record timestamp so isStale() can detect subsequent commits
          try {
            const lastInitPath = path.join(projectRoot, '.codegraph', '.refacil-last-init');
            fs.mkdirSync(path.dirname(lastInitPath), { recursive: true });
            fs.writeFileSync(lastInitPath, new Date().toISOString());
          } catch (_) {}
          process.stdout.write('[refacil-sdd-ai] CodeGraph index complete. .codegraph/ is ready.\n');
        } catch (err) {
          process.stderr.write(`[refacil-sdd-ai] codegraph index failed: ${err.message}\n`);
          process.exit(1);
        }
      } else {
        console.log('[refacil-sdd-ai] CodeGraph already initialized for this repo. MCP registration refreshed.');
      }
    } else {
      console.error(`  Unknown codegraph subcommand: ${cgSub || '(none)'}. Usage: refacil-sdd-ai codegraph <init|setup|status>`);
      process.exit(1);
    }
    break;
  }
  case 'kapso': {
    const kapsoSub = args[1];
    const kapso = require('../lib/kapso');
    if (kapsoSub === 'setup') {
      kapso.setup().catch((err) => {
        console.error(`  Error during kapso setup: ${err.message}`);
        process.exit(1);
      });
    } else if (kapsoSub === 'preflight') {
      const result = kapso.preflight();
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(0);
    } else if (kapsoSub === 'notify') {
      const notifyType = args[2]; // "success" or "failure"
      if (!notifyType) {
        console.error('  Usage: refacil-sdd-ai kapso notify <success|failure> [flags]');
        process.exit(1);
      }
      // Parse flags from process.argv
      const getFlag = (flag, fallback = '') => {
        const idx = process.argv.indexOf(flag);
        return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
      };
      // Compute duration from marker startedAt (authoritative) or fall back to --duration flag.
      let computedDuration = getFlag('--duration', '0');
      try {
        const markerPath = path.join(findProjectRoot(), 'refacil-sdd', '.autopilot-active');
        if (fs.existsSync(markerPath)) {
          const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
          if (marker.startedAt) {
            const elapsed = Math.round((Date.now() - new Date(marker.startedAt).getTime()) / 60000);
            computedDuration = String(elapsed);
          }
        }
      } catch (_) { /* keep fallback */ }
      const opts = {
        repo:       getFlag('--repo'),
        change:     getFlag('--change'),
        branch:     getFlag('--branch'),
        tasks:      getFlag('--tasks', '0/0'),
        duration:   computedDuration,
        pr:         getFlag('--pr') || null,
        apply:      getFlag('--apply', '0'),
        test:       getFlag('--test', '0'),
        review:     getFlag('--review', '0'),
        warnings:   getFlag('--warnings', ''),
        phase:      getFlag('--phase'),
        lastCommit: getFlag('--last-commit'),
        error:      getFlag('--error'),
      };
      kapso.notify(notifyType, opts).catch((err) => {
        console.error(`  Error: ${err.message}`);
        process.exit(1);
      });
    } else {
      console.error(`  Unknown kapso subcommand: ${kapsoSub || '(none)'}. Usage: kapso <setup|preflight|notify>`);
      process.exit(1);
    }
    break;
  }
  case 'autopilot':
    handleAutopilot(process.argv[3], process.argv.slice(4));
    break;
  case 'clean':
    clean();
    break;
  case 'help':
  case '--help':
  case '-h':
    help();
    break;
  default:
    console.error(`  Unknown command: ${command}`);
    help();
    process.exit(1);
}
