#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  syncCompactGuidance,
  removeCompactGuidance,
} = require('../lib/compact-guidance');
const compactBash = require('../lib/compact/bash');
const {
  installSkills,
  installAgents,
  installOpenCodeJson,
  removeSkills,
  removeGlobalSkills,
  removeOpenCodeArtifacts,
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
} = require('../lib/installer');
const { installHooks, uninstallHooks, cleanLegacySettingsHooks, installOpenCodePlugin, uninstallOpenCodePlugin, removeProjectLevelHooks } = require('../lib/hooks');
const { globalClaudeDir, globalCursorDir, globalOpenCodeDir, readSelectedIDEs, writeSelectedIDEs } = require('../lib/global-paths');
const { detectInstalledIDEs } = require('../lib/ide-detection');
const { handleCompact } = require('../lib/commands/compact');
const { handleBus } = require('../lib/commands/bus');
const { handleSdd, autoMigrateOpenspec, findProjectRoot, cmdWriteConfig } = require('../lib/commands/sdd');
const { syncIgnoreFiles } = require('../lib/ignore-files');
const { methodologyMigrationPending } = require('../lib/methodology-migration-pending');

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
    const userMsg =
      `[refacil-sdd-ai] Methodology update detected (${fromLabel} → v${info.to}).\n` +
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
      console.log(
        `[refacil-sdd-ai] IMPORTANT: there is a pending SDD-AI methodology update (${fromLabel} → v${info.to}). ` +
        `Before responding to the user, ask them if they want to run /refacil:update now.`,
      );
    }
  }
}

function repoIsInitialized() {
  const home = os.homedir();
  // Check global dirs first (new installation model)
  if (
    fs.existsSync(path.join(globalClaudeDir(home), 'skills')) ||
    fs.existsSync(path.join(globalCursorDir(home), 'skills')) ||
    fs.existsSync(path.join(globalOpenCodeDir(home), 'skills'))
  ) {
    return true;
  }
  // Fallback: check legacy project-level dirs for backward compat
  return (
    fs.existsSync(path.join(projectRoot, '.claude', 'skills')) ||
    fs.existsSync(path.join(projectRoot, '.cursor', 'skills')) ||
    fs.existsSync(path.join(projectRoot, '.opencode', 'skills'))
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
  const allIDEs = ['.claude', '.cursor', '.opencode'];

  // --all or non-TTY: install all three
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

  const options = [
    { label: 'Claude Code (~/.claude/)', value: '.claude', selected: claudeSelected },
    { label: 'Cursor (~/.cursor/)', value: '.cursor', selected: cursorSelected },
    { label: 'OpenCode (global config dir)', value: '.opencode', selected: openCodeSelected },
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

function syncRepoSkillsIfStale(globalVersion) {
  if (!repoIsInitialized()) return null;
  // Repo-level version takes priority; fall back to global store
  const repoVersion = readRepoVersion(projectRoot) || readGlobalVersion(os.homedir(), projectRoot);
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

function checkUpdate() {
  clearStalePendingUpdateFlag(projectRoot);

  try {
    autoMigrateOpenspec(projectRoot);
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not migrate openspec/ to refacil-sdd/: ${err.message}\n`);
  }

  try {
    const legacyRemoved = removeOpenspecLegacyAssets(projectRoot);
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
      fs.existsSync(path.join(globalOpenCodeDir(home), 'skills'));

    if (globalActive) {
      const cleaned = removeProjectLevelArtifacts(projectRoot);
      removeProjectLevelHooks(projectRoot);
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
    syncCompactGuidance(projectRoot, packageRoot);
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] Could not sync compact-guidance: ${err.message}\n`);
  }

  cleanLegacySettingsHooks(projectRoot);

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
  const syncResult = syncRepoSkillsIfStale(localVersion);
  if (syncResult && !syncResult.failed) {
    const fromLabel = syncResult.from ? `v${syncResult.from}` : 'unknown version';
    console.log(
      `[refacil-sdd-ai] Repo skills synced (${fromLabel} -> v${syncResult.to}). ` +
      'Restart the Claude Code or Cursor session to pick up the changes.',
    );
    if (methodologyMigrationPending(projectRoot).pending) {
      writePendingUpdateFlag(projectRoot, syncResult.from, syncResult.to);
    }
  } else if (syncResult && syncResult.failed) {
    console.log(
      `[refacil-sdd-ai] Repo skills are out of date with the global package (v${syncResult.to}) ` +
      'but automatic sync failed. Run manually: refacil-sdd-ai update',
    );
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
  if (!command.match(/git\s+push/)) return;

  const sddChangesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
  const legacyChangesDir = path.join(projectRoot, 'openspec', 'changes');
  const changesDir = fs.existsSync(sddChangesDir) ? sddChangesDir : legacyChangesDir;
  if (!fs.existsSync(changesDir)) return;

  const entries = fs.readdirSync(changesDir, { withFileTypes: true });
  const activeChanges = entries.filter(
    (e) => e.isDirectory() && e.name !== 'archive',
  );

  if (activeChanges.length === 0) return;

  const missing = activeChanges.filter(
    (e) => !fs.existsSync(path.join(changesDir, e.name, '.review-passed')),
  );

  if (missing.length > 0) {
    const names = missing.map((e) => e.name).join(', ');
    const reason =
      missing.length === 1
        ? `[refacil-sdd-ai] Review pending for: ${names}. ` +
          'Stop the push and run /refacil:review on that change before pushing code. ' +
          'If the review passes, retry the git push. ' +
          'If the review requires corrections, report the findings to the user and DO NOT retry the push.'
        : `[refacil-sdd-ai] Multiple changes without approved review: ${names}. ` +
          'Stop the push and ask the user to explicitly select which change they want to push. ' +
          'Then run /refacil:review <change-name> for that specific change and retry the push. ' +
          'Do not run automatic review without explicit selection when there is more than one pending change.';
    console.log(JSON.stringify({ decision: 'block', reason }));
  }
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
    return `(opencode-global)/skills/`;
  }).join(', ');
  console.log(`  ${count} skills installed in ${ideList}`);

  const agentsCount = installAgents(packageRoot, homeDir, selectedIDEs);
  if (agentsCount > 0) {
    const agentList = selectedIDEs.map((d) => {
      if (d === '.claude') return `~/.claude/agents/`;
      if (d === '.cursor') return `~/.cursor/agents/`;
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
    const result = syncCompactGuidance(projectRoot, packageRoot);
    if (result.status === 'appended') {
      console.log('  compact-guidance block added to AGENTS.md');
    } else if (result.status === 'replaced') {
      console.log('  compact-guidance block updated in AGENTS.md');
    }
  } catch (err) {
    console.error(`  Warning: could not sync compact-guidance: ${err.message}`);
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

  // Source of truth: persisted selection from init.
  // Fall back to detection for backward compat (users who had the methodology installed
  // before selected-ides.json existed). In that case, infer selection from IDE dirs
  // already present in this repo and persist the result so future runs use the file.
  let selectedIDEs = readSelectedIDEs();
  if (!selectedIDEs) {
    const detectedIds = detectInstalledIDEs();
    const hasClaudeDir = detectedIds.includes('claude') ||
      fs.existsSync(path.join(globalClaudeDir(homeDir), 'skills')) ||
      fs.existsSync(path.join(projectRoot, '.claude'));
    const hasCursorDir = detectedIds.includes('cursor') ||
      fs.existsSync(path.join(globalCursorDir(homeDir), 'skills')) ||
      fs.existsSync(path.join(projectRoot, '.cursor'));
    const hasOpenCodeDir = detectedIds.includes('opencode') ||
      fs.existsSync(path.join(globalOpenCodeDir(homeDir), 'skills')) ||
      fs.existsSync(path.join(projectRoot, '.opencode'));
    selectedIDEs = [
      hasClaudeDir && '.claude',
      hasCursorDir && '.cursor',
      hasOpenCodeDir && '.opencode',
    ].filter(Boolean);
    // Persist for future runs so detection only happens once
    if (selectedIDEs.length > 0) writeSelectedIDEs(selectedIDEs);
  }

  const hasClaudeDir = selectedIDEs.includes('.claude');
  const hasCursorDir = selectedIDEs.includes('.cursor');
  const hasOpenCodeDir = selectedIDEs.includes('.opencode');
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
    return '(opencode-global)/skills/';
  });
  console.log(`  ${count} skills updated in ${installedDirs.join(', ') || '(none detected)'}`);

  const agentsCount = installAgents(packageRoot, homeDir, detectedIDEs);
  if (agentsCount > 0) {
    const agentDirs = [
      hasClaudeDir && '~/.claude/agents/',
      hasCursorDir && '~/.cursor/agents/',
      hasOpenCodeDir && '(opencode-global)/agents/',
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
    const result = syncCompactGuidance(projectRoot, packageRoot);
    if (result.status === 'appended') {
      console.log('  compact-guidance block added to AGENTS.md');
    } else if (result.status === 'replaced') {
      console.log('  compact-guidance block updated in AGENTS.md');
    }
  } catch (err) {
    console.error(`  Warning: could not sync compact-guidance: ${err.message}`);
  }

  console.log('\n  RESTART your IDE session to apply the changes.\n');
}

function clean() {
  console.log('\n  refacil-sdd-ai: Removing skills...\n');

  const homeDir = os.homedir();

  const selectedIDEs = readSelectedIDEs() || ['claude', 'cursor', 'opencode'];
  const globalCount = removeGlobalSkills(homeDir, selectedIDEs);
  if (globalCount > 0) {
    console.log(`  ${globalCount} global skills removed from IDE user directories`);
  }

  const count = removeSkills(projectRoot);
  if (count > 0) {
    console.log(`  ${count} project-level skills removed from .claude/skills/ and .cursor/skills/`);
  }

  if (uninstallHooks('.claude', homeDir)) {
    console.log('  SDD-AI hooks removed from ~/.claude/settings.json');
  } else {
    console.log('  No SDD-AI hooks found to remove in ~/.claude/settings.json.');
  }
  if (uninstallHooks('.cursor', homeDir)) {
    console.log('  SDD-AI hooks removed from ~/.cursor/hooks.json');
  }

  // Always attempt to uninstall the global OpenCode plugin
  try {
    if (uninstallOpenCodePlugin(homeDir)) {
      console.log('  OpenCode plugin removed from global plugins directory');
    }
  } catch (err) {
    console.error(`  Warning: could not remove OpenCode plugin: ${err.message}`);
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

  console.log(`
  refacil-sdd-ai — SDD-AI Methodology

  Commands:
    init          Install skills globally for Claude Code, Cursor and/or OpenCode (interactive IDE selector).
                  Use --all to install for all three IDEs without prompting.
                  Use --yes or --defaults to skip interactive branch config prompts.
                  Creates CLAUDE.md, .cursorrules and .opencode/opencode.json as appropriate.
                  Migrates any project-level artifacts to global dirs automatically.
    update        Re-copy skills for all detected IDEs to global user dirs
    migration-pending  Same validation as hooks/notify-update: list migrations (exit 1 if any; --json)
    check-update   Sync skills and compact-guidance at session start (SessionStart hook)
    notify-update  Notify methodology migration only if applicable (UserPromptSubmit hook)
    check-review   Verify that review has been completed (used by PreToolUse hook)
    compact-bash  Rewrite bare Bash commands to reduce tokens (used by PreToolUse hook)
    compact       Subcommands for the compact-bash hook:
                    compact stats      - Full stats (hook + already-compact) and estimated savings
                    compact disable    - Temporarily disable rewrite
                    compact enable     - Re-enable rewrite
                    compact clear-log  - Clear the history log
    bus           Subcommands for the inter-agent chat room (refacil-bus):
                    bus start          - Start the local broker (auto-spawn detached)
                    bus stop           - Stop the broker
                    bus status         - Show port, pid, uptime of the broker
                    bus serve          - (internal) Run the broker in foreground
                    bus join --room <room> [--session <s>] [--intro "..."]
                    bus leave [--session <s>]
                    bus say --text "..." [--session <s>]
                    bus ask --to <name|all|*|everyone> --text "..." [--wait N] [--session <s>]
                    bus reply --text "..." [--correlation <id>] [--to <name>]
                    bus history [--n N] [--session <s>]
                    bus inbox [--session <s>]
                    bus rooms
                    bus watch <session> [--room <room>]  (live panel, no tokens)
                    bus attend [--timeout N]             (listen for directed questions)
                    bus view                             (open the web UI in the browser)
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
    clean         Remove SDD-AI hooks from global IDE config dirs and skills from global dirs
    help          Show this help

  Full flow:
    1. npm install -g refacil-sdd-ai
    2. refacil-sdd-ai init
    3. RESTART your IDE session (Claude Code, Cursor, or OpenCode)
    4. Run: /refacil:setup (generates AGENTS.md for your project)

  Global installation paths (this machine):
    - Claude Code: ${claudePath}/skills/, ${claudePath}/agents/
                   ${claudePath}/settings.json (hooks)
    - Cursor:      ${cursorPath}/skills/, ${cursorPath}/agents/
                   ${cursorPath}/hooks.json (hooks)
    - OpenCode:    ${opencodePath}/skills/, ${opencodePath}/agents/
                   ${opencodePath}/plugins/refacil-hooks.js

  Requirements:
    - Node.js >= 20.0.0
    - Claude Code >= 2.1.89 (required by compact-bash for silent rewrite), Cursor, or OpenCode
  `);
}

// --- Main ---

const command = process.argv[2] || 'help';

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
    handleCompact(process.argv[3]);
    break;
  case 'bus':
    handleBus(process.argv[3], process.argv.slice(4), packageRoot);
    break;
  case 'sdd':
    handleSdd(process.argv[3], process.argv.slice(4), projectRoot);
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
