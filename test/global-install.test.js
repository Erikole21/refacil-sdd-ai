'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { installSkills, installAgents, removeProjectLevelArtifacts, readGlobalVersion, writeGlobalVersion, removeSkills, removeGlobalSkills } = require('../lib/installer');
const {
  installHooks,
  uninstallHooks,
  installOpenCodePlugin,
  uninstallOpenCodePlugin,
  removeProjectLevelHooks,
} = require('../lib/hooks');
const { globalClaudeDir, globalCursorDir, globalOpenCodeDir } = require('../lib/global-paths');
const { detectInstalledIDEs } = require('../lib/ide-detection');

const packageRoot = path.resolve(__dirname, '..');

let homeDir;
let projectRoot;

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-install-home-'));
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'global-install-proj-'));
});

afterEach(() => {
  fs.rmSync(homeDir, { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

// ── CA-01: skills installed to global ~/.claude/skills/ ─────────────────────

describe('CA-01: installSkills writes to global homeDir/.claude/skills/', () => {
  test('skills land in homeDir/.claude/skills/ not projectRoot', () => {
    installSkills(packageRoot, homeDir);

    const globalSkillsDir = path.join(globalClaudeDir(homeDir), 'skills');
    assert.ok(fs.existsSync(globalSkillsDir), 'global skills dir must exist');
    const entries = fs.readdirSync(globalSkillsDir);
    assert.ok(entries.some((e) => e.startsWith('refacil-')), 'global skills must have refacil-* entries');

    // Must NOT install in projectRoot
    assert.ok(!fs.existsSync(path.join(projectRoot, '.claude', 'skills')), 'skills must not appear in projectRoot/.claude');
  });

  test('skills land in homeDir/.cursor/skills/', () => {
    installSkills(packageRoot, homeDir);

    const globalCursorSkills = path.join(globalCursorDir(homeDir), 'skills');
    assert.ok(fs.existsSync(globalCursorSkills), '~/.cursor/skills must exist');
  });

  test('skills land in opencode global dir', () => {
    installSkills(packageRoot, homeDir);

    const globalOcSkills = path.join(globalOpenCodeDir(homeDir), 'skills');
    assert.ok(fs.existsSync(globalOcSkills), 'opencode global skills must exist');
  });
});

// ── CA-02: agents installed to global dirs ───────────────────────────────────

describe('CA-02: installAgents writes to global homeDir dirs', () => {
  test('agents land in homeDir/.claude/agents/ not projectRoot', () => {
    installAgents(packageRoot, homeDir);

    const globalAgentsDir = path.join(globalClaudeDir(homeDir), 'agents');
    assert.ok(fs.existsSync(globalAgentsDir), 'global agents dir must exist');
    const entries = fs.readdirSync(globalAgentsDir);
    assert.ok(entries.some((e) => e.startsWith('refacil-') && e.endsWith('.md')), 'global agents must have refacil-*.md entries');

    assert.ok(!fs.existsSync(path.join(projectRoot, '.claude', 'agents')), 'agents must not appear in projectRoot/.claude');
  });

  test('agents land in homeDir/.cursor/agents/ with Cursor transforms', () => {
    installAgents(packageRoot, homeDir);

    const cursorAgentsDir = path.join(globalCursorDir(homeDir), 'agents');
    assert.ok(fs.existsSync(cursorAgentsDir));
    const agentFiles = fs.readdirSync(cursorAgentsDir).filter((f) => f.endsWith('.md'));
    assert.ok(agentFiles.length >= 7, 'must install all 7 agents for Cursor');
    // Cursor agents have readonly: field
    const sampleContent = fs.readFileSync(path.join(cursorAgentsDir, agentFiles[0]), 'utf8');
    assert.match(sampleContent, /readonly:/);
  });
});

// ── CA-06: hooks installed to global settings.json ──────────────────────────

describe('CA-06: installHooks writes to global homeDir dirs', () => {
  test('Claude Code hooks land in homeDir/.claude/settings.json', () => {
    installHooks('.claude', homeDir);

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    assert.ok(fs.existsSync(settingsPath), '~/.claude/settings.json must exist');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.hooks.SessionStart.some((h) => h._sdd === true));
    assert.ok(settings.hooks.UserPromptSubmit.some((h) => h._sdd_notify === true));
    assert.ok(settings.hooks.PreToolUse.some((h) => h._sdd_compact === true));
    assert.ok(settings.hooks.PreToolUse.some((h) => h._sdd_review === true));
  });

  test('Claude Code hooks do NOT land in projectRoot/.claude/settings.json', () => {
    installHooks('.claude', homeDir);
    assert.ok(!fs.existsSync(path.join(projectRoot, '.claude', 'settings.json')));
  });

  test('Cursor hooks land in homeDir/.cursor/hooks.json', () => {
    installHooks('.cursor', homeDir);

    const hooksPath = path.join(globalCursorDir(homeDir), 'hooks.json');
    assert.ok(fs.existsSync(hooksPath), '~/.cursor/hooks.json must exist');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.ok(hooks.hooks.sessionStart.some((h) => h._sdd === true));
    assert.ok(hooks.hooks.beforeSubmitPrompt.some((h) => h._sdd_notify === true));
  });
});

// ── CA-07: uninstallHooks removes from global dirs ──────────────────────────

describe('CA-07: uninstallHooks removes from global dirs', () => {
  test('Claude Code hooks removed from homeDir/.claude/settings.json', () => {
    installHooks('.claude', homeDir);
    const result = uninstallHooks('.claude', homeDir);
    assert.equal(result, true);

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.ok(!settings.hooks, 'SDD hooks should be removed');
    }
  });

  test('Cursor hooks removed from homeDir/.cursor/hooks.json', () => {
    installHooks('.cursor', homeDir);
    const result = uninstallHooks('.cursor', homeDir);
    assert.equal(result, true);

    const hooksPath = path.join(globalCursorDir(homeDir), 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const remaining = Object.keys(hooks.hooks || {});
      assert.equal(remaining.length, 0, 'no SDD hooks should remain');
    }
  });
});

// ── CA-09: installOpenCodePlugin installs to global dir ─────────────────────

describe('CA-09: installOpenCodePlugin writes to global dir', () => {
  test('plugin lands in homeDir opencode plugins dir', () => {
    const result = installOpenCodePlugin(homeDir);
    assert.equal(result, true);

    const pluginPath = path.join(globalOpenCodeDir(homeDir), 'plugins', 'refacil-hooks.js');
    assert.ok(fs.existsSync(pluginPath), 'plugin must exist in global opencode plugins dir');
  });

  test('plugin does NOT land in projectRoot/.opencode/plugins/', () => {
    installOpenCodePlugin(homeDir);
    assert.ok(!fs.existsSync(path.join(projectRoot, '.opencode', 'plugins', 'refacil-hooks.js')));
  });
});

// ── CR-01: removeProjectLevelArtifacts cleans only refacil-* ─────────────────

describe('CR-01: removeProjectLevelArtifacts is prefix-safe', () => {
  test('removes refacil-* entries from project .claude/skills/', () => {
    // Create both refacil- and non-refacil entries
    const skillsDir = path.join(projectRoot, '.claude', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'refacil-setup'), { recursive: true });
    fs.mkdirSync(path.join(skillsDir, 'my-custom-skill'), { recursive: true });

    removeProjectLevelArtifacts(projectRoot);

    assert.ok(!fs.existsSync(path.join(skillsDir, 'refacil-setup')), 'refacil-setup must be removed');
    assert.ok(fs.existsSync(path.join(skillsDir, 'my-custom-skill')), 'non-refacil entry must be preserved');
  });

  test('removes refacil-* from all three IDE dirs', () => {
    for (const ideDir of ['.claude', '.cursor', '.opencode']) {
      const skillsDir = path.join(projectRoot, ideDir, 'skills');
      fs.mkdirSync(path.join(skillsDir, 'refacil-test'), { recursive: true });
    }

    removeProjectLevelArtifacts(projectRoot);

    for (const ideDir of ['.claude', '.cursor', '.opencode']) {
      const skillDir = path.join(projectRoot, ideDir, 'skills', 'refacil-test');
      assert.ok(!fs.existsSync(skillDir), `${ideDir}/skills/refacil-test must be removed`);
    }
  });

  test('is non-destructive when dirs do not exist', () => {
    assert.doesNotThrow(() => removeProjectLevelArtifacts(projectRoot));
  });

  test('removes refacil-*.md from agents dirs', () => {
    const agentsDir = path.join(projectRoot, '.claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'refacil-implementer.md'), 'content');
    fs.writeFileSync(path.join(agentsDir, 'my-agent.md'), 'keep me');

    removeProjectLevelArtifacts(projectRoot);

    assert.ok(!fs.existsSync(path.join(agentsDir, 'refacil-implementer.md')));
    assert.ok(fs.existsSync(path.join(agentsDir, 'my-agent.md')));
  });
});

// ── CR-03: removeProjectLevelHooks strips SDD markers ───────────────────────

describe('CR-03: removeProjectLevelHooks strips SDD hooks from project files', () => {
  test('removes SDD hooks from .claude/settings.json', () => {
    const claudeDir = path.join(projectRoot, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');
    const settings = {
      hooks: {
        SessionStart: [{ _sdd: true, matcher: '', hooks: [{ type: 'command', command: 'refacil-sdd-ai check-update' }] }],
        PreToolUse: [{ _sdd_compact: true, matcher: 'Bash', hooks: [] }],
        myCustomHook: [{ custom: true }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    removeProjectLevelHooks(projectRoot);

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(!result.hooks?.SessionStart?.some((h) => h._sdd === true), 'SDD hook must be removed');
    assert.ok(!result.hooks?.PreToolUse?.some((h) => h._sdd_compact === true), 'compact hook must be removed');
    assert.ok(result.hooks?.myCustomHook?.some((h) => h.custom === true), 'custom hook must be preserved');
  });

  test('removes SDD hooks from .cursor/hooks.json', () => {
    const cursorDir = path.join(projectRoot, '.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });
    const hooksPath = path.join(cursorDir, 'hooks.json');
    const config = {
      version: 1,
      hooks: {
        sessionStart: [{ _sdd: true, command: 'refacil-sdd-ai check-update' }],
        preToolUse: [{ _sdd_compact: true, command: 'compact-bash', matcher: 'Bash' }],
      },
    };
    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));

    removeProjectLevelHooks(projectRoot);

    const result = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.ok(!result.hooks?.sessionStart?.some((h) => h._sdd === true));
    assert.ok(!result.hooks?.preToolUse?.some((h) => h._sdd_compact === true));
  });

  test('is non-destructive when project files do not exist', () => {
    assert.doesNotThrow(() => removeProjectLevelHooks(projectRoot));
  });
});

// ── CA-03: preexisting non-SDD hooks are preserved after installHooks ────────

describe('CA-03: installHooks merges without destroying preexisting non-SDD hooks', () => {
  test('preexisting non-SDD hook in settings.json SessionStart is preserved after Claude hooks install', () => {
    const claudeDir = path.join(globalClaudeDir(homeDir));
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');
    const preExisting = {
      hooks: {
        SessionStart: [{ _myCustomHook: true, command: 'my-custom-tool run' }],
      },
      someOtherConfig: 'preserved-value',
    };
    fs.writeFileSync(settingsPath, JSON.stringify(preExisting, null, 2));

    installHooks('.claude', homeDir);

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    // SDD hooks must be present
    assert.ok(result.hooks.SessionStart.some((h) => h._sdd === true), 'SDD hook must be added');
    // Preexisting non-SDD hook must still be present
    assert.ok(result.hooks.SessionStart.some((h) => h._myCustomHook === true), 'non-SDD hook must be preserved');
    // Other config keys must be untouched
    assert.equal(result.someOtherConfig, 'preserved-value', 'non-hook config keys must be preserved');
  });

  test('preexisting non-SDD hook in .cursor/hooks.json is preserved after Cursor hooks install', () => {
    const cursorDir = path.join(globalCursorDir(homeDir));
    fs.mkdirSync(cursorDir, { recursive: true });
    const hooksPath = path.join(cursorDir, 'hooks.json');
    const preExisting = {
      version: 1,
      hooks: {
        sessionStart: [{ _myTool: true, command: 'my-tool start' }],
      },
    };
    fs.writeFileSync(hooksPath, JSON.stringify(preExisting, null, 2));

    installHooks('.cursor', homeDir);

    const result = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.ok(result.hooks.sessionStart.some((h) => h._sdd === true), 'SDD hook must be added');
    assert.ok(result.hooks.sessionStart.some((h) => h._myTool === true), 'non-SDD hook must be preserved');
  });
});

// ── CA-04: Cursor project-local .cursor/hooks.json not touched ───────────────

describe('CA-04: project-local .cursor/hooks.json is untouched by installHooks', () => {
  test('installHooks(.cursor) does not create or modify projectRoot/.cursor/hooks.json', () => {
    // Ensure projectRoot/.cursor/ does NOT have hooks.json before install
    const localHooksPath = path.join(projectRoot, '.cursor', 'hooks.json');

    installHooks('.cursor', homeDir);

    // Project-level file should not exist
    assert.ok(!fs.existsSync(localHooksPath), 'project-level .cursor/hooks.json must not be created');
  });

  test('installHooks(.cursor) leaves preexisting projectRoot/.cursor/hooks.json intact', () => {
    const localCursorDir = path.join(projectRoot, '.cursor');
    fs.mkdirSync(localCursorDir, { recursive: true });
    const localHooksPath = path.join(localCursorDir, 'hooks.json');
    const original = { version: 1, hooks: { sessionStart: [{ _user: true, command: 'user-hook' }] } };
    fs.writeFileSync(localHooksPath, JSON.stringify(original, null, 2));

    installHooks('.cursor', homeDir);

    // Project-level file must be unchanged
    const result = JSON.parse(fs.readFileSync(localHooksPath, 'utf8'));
    assert.ok(result.hooks.sessionStart.some((h) => h._user === true), 'user hook in local file must be preserved');
    assert.ok(!result.hooks.sessionStart.some((h) => h._sdd === true), 'SDD hooks must NOT be in project-local file');
  });
});

// ── CA-08: version written to ~/.refacil-sdd-ai/sdd-version ─────────────────

describe('CA-08: writeGlobalVersion writes to homeDir/.refacil-sdd-ai/sdd-version', () => {
  test('writeGlobalVersion creates the sdd-version file in homeDir', () => {
    writeGlobalVersion('9.9.9', homeDir);

    const versionPath = path.join(homeDir, '.refacil-sdd-ai', 'sdd-version');
    assert.ok(fs.existsSync(versionPath), 'sdd-version file must be created');
    assert.equal(fs.readFileSync(versionPath, 'utf8').trim(), '9.9.9');
  });

  test('readGlobalVersion reads back what writeGlobalVersion wrote', () => {
    writeGlobalVersion('1.2.3', homeDir);
    const version = readGlobalVersion(homeDir);
    assert.equal(version, '1.2.3');
  });

  test('readGlobalVersion returns null when no file exists', () => {
    const version = readGlobalVersion(homeDir);
    assert.equal(version, null);
  });

  test('writeGlobalVersion overwrites the previous version', () => {
    writeGlobalVersion('1.0.0', homeDir);
    writeGlobalVersion('2.0.0', homeDir);
    const version = readGlobalVersion(homeDir);
    assert.equal(version, '2.0.0', 'must reflect the latest written version');
  });

  test('sdd-version is in homeDir not in projectRoot', () => {
    writeGlobalVersion('3.0.0', homeDir);
    // Verify version file is under homeDir
    const versionPath = path.join(homeDir, '.refacil-sdd-ai', 'sdd-version');
    assert.ok(fs.existsSync(versionPath));
    // Verify no version file under projectRoot
    assert.ok(!fs.existsSync(path.join(projectRoot, '.refacil-sdd-ai', 'sdd-version')));
  });
});

// ── CA-09: installation is idempotent — hooks not duplicated ─────────────────

describe('CA-09: installHooks is idempotent — no hook duplication', () => {
  test('calling installHooks(.claude) twice results in exactly one SDD SessionStart hook', () => {
    installHooks('.claude', homeDir);
    installHooks('.claude', homeDir);

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const sddSessionStart = settings.hooks.SessionStart.filter((h) => h._sdd === true);
    assert.equal(sddSessionStart.length, 1, 'exactly one _sdd SessionStart hook must exist');
  });

  test('calling installHooks(.claude) twice results in exactly one _sdd_compact PreToolUse hook', () => {
    installHooks('.claude', homeDir);
    installHooks('.claude', homeDir);

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const compact = settings.hooks.PreToolUse.filter((h) => h._sdd_compact === true);
    assert.equal(compact.length, 1, 'exactly one _sdd_compact PreToolUse hook must exist');
  });

  test('calling installHooks(.cursor) twice results in exactly one _sdd sessionStart hook', () => {
    installHooks('.cursor', homeDir);
    installHooks('.cursor', homeDir);

    const hooksPath = path.join(globalCursorDir(homeDir), 'hooks.json');
    const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const sddSession = config.hooks.sessionStart.filter((h) => h._sdd === true);
    assert.equal(sddSession.length, 1, 'exactly one _sdd sessionStart hook must exist');
  });

  test('calling installSkills twice does not multiply skill directories', () => {
    installSkills(packageRoot, homeDir);
    installSkills(packageRoot, homeDir);

    const globalSkillsDir = path.join(globalClaudeDir(homeDir), 'skills');
    const entries = fs.readdirSync(globalSkillsDir).filter((e) => e.startsWith('refacil-'));
    // Each skill name must appear exactly once
    const unique = new Set(entries);
    assert.equal(entries.length, unique.size, 'skill names must be unique (no duplicates)');
  });
});

// ── CA-10: clean removes global artifacts and hooks ──────────────────────────

describe('CA-10: uninstallHooks removes global hooks; removeSkills removes global skills', () => {
  test('uninstallHooks(.claude) removes SDD hooks from homeDir/.claude/settings.json', () => {
    installHooks('.claude', homeDir);
    const result = uninstallHooks('.claude', homeDir);
    assert.equal(result, true, 'uninstall must return true when hooks were removed');

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const hasSdd = Object.values(settings.hooks || {}).some((arr) =>
        Array.isArray(arr) && arr.some((h) => h._sdd === true || h._sdd_compact === true || h._sdd_review === true || h._sdd_notify === true),
      );
      assert.ok(!hasSdd, 'no SDD hooks must remain after uninstall');
    }
  });

  test('uninstallHooks(.cursor) removes SDD hooks from homeDir/.cursor/hooks.json', () => {
    installHooks('.cursor', homeDir);
    const result = uninstallHooks('.cursor', homeDir);
    assert.equal(result, true);

    const hooksPath = path.join(globalCursorDir(homeDir), 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const hasSdd = Object.values(config.hooks || {}).some((arr) =>
        Array.isArray(arr) && arr.some((h) => h._sdd === true || h._sdd_compact === true),
      );
      assert.ok(!hasSdd, 'no SDD hooks must remain after cursor uninstall');
    }
  });

  test('uninstallOpenCodePlugin removes plugin from global opencode dir', () => {
    installOpenCodePlugin(homeDir);
    const result = uninstallOpenCodePlugin(homeDir);
    assert.equal(result, true);

    const pluginPath = path.join(globalOpenCodeDir(homeDir), 'plugins', 'refacil-hooks.js');
    assert.ok(!fs.existsSync(pluginPath), 'plugin file must be removed');
  });

  test('removeGlobalSkills removes installed skills from global IDE dirs', () => {
    installSkills(packageRoot, homeDir);

    const removed = removeGlobalSkills(homeDir, ['claude', 'cursor', 'opencode']);
    assert.ok(removed > 0, 'at least one skill must have been removed');

    // Verify dirs are actually gone
    const skillsDir = path.join(globalClaudeDir(homeDir), 'skills');
    if (fs.existsSync(skillsDir)) {
      const remaining = fs.readdirSync(skillsDir).filter(n => n.startsWith('refacil-'));
      assert.equal(remaining.length, 0, 'no refacil-* skills should remain');
    }
  });

  test('uninstallHooks with wrong dir (projectRoot) leaves global hooks intact — regression for clean() bug', () => {
    // Install hooks to homeDir (global)
    installHooks('.claude', homeDir);
    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'settings.json must exist after install');

    // Calling uninstallHooks with projectRoot (a different tmpDir) must NOT affect homeDir
    const result = uninstallHooks('.claude', projectRoot);
    assert.equal(result, false, 'must return false — no hooks at projectRoot');

    // Global hooks in homeDir must still be present
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const hasSdd = Object.values(settings.hooks || {}).some((arr) =>
      Array.isArray(arr) && arr.some((h) => h._sdd === true || h._sdd_compact === true),
    );
    assert.ok(hasSdd, 'global hooks must survive when wrong dir is passed');
  });

  test('uninstallHooks with correct homeDir removes global hooks — verifies clean() fix', () => {
    installHooks('.claude', homeDir);
    const result = uninstallHooks('.claude', homeDir);
    assert.equal(result, true, 'must return true when correct homeDir is passed');

    const settingsPath = path.join(globalClaudeDir(homeDir), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const hasSdd = Object.values(settings.hooks || {}).some((arr) =>
        Array.isArray(arr) && arr.some((h) => h._sdd === true || h._sdd_compact === true),
      );
      assert.ok(!hasSdd, 'no SDD hooks must remain in global dir after correct uninstall');
    }
  });
});

// ── CA-11: repoIsInitialized checks global dirs ──────────────────────────────

describe('CA-11: repoIsInitialized is based on global dirs (lib logic)', () => {
  test('globalClaudeDir(homeDir)/skills existence implies initialized state', () => {
    // Simulate what repoIsInitialized checks: global skills dir
    const globalSkillsDir = path.join(globalClaudeDir(homeDir), 'skills');
    assert.ok(!fs.existsSync(globalSkillsDir), 'skills dir must not exist before install');

    installSkills(packageRoot, homeDir);
    assert.ok(fs.existsSync(globalSkillsDir), 'skills dir must exist after install');
  });

  test('globalCursorDir(homeDir)/skills existence is also a valid initialized indicator', () => {
    installSkills(packageRoot, homeDir, ['.cursor']);
    const cursorSkillsDir = path.join(globalCursorDir(homeDir), 'skills');
    assert.ok(fs.existsSync(cursorSkillsDir), 'cursor global skills dir must exist');
    // Claude dir must NOT exist (only cursor was targeted)
    assert.ok(!fs.existsSync(path.join(globalClaudeDir(homeDir), 'skills')));
  });
});

// ── CR-01: undetected IDE receives no artifacts ───────────────────────────────

describe('CR-01: excluded IDE receives no artifacts', () => {
  test('installSkills with [.claude] does not create cursor skills', () => {
    installSkills(packageRoot, homeDir, ['.claude']);

    const cursorSkillsDir = path.join(globalCursorDir(homeDir), 'skills');
    assert.ok(!fs.existsSync(cursorSkillsDir), '.cursor/skills must not be created when cursor not selected');
  });

  test('installSkills with [.cursor] does not create claude skills', () => {
    installSkills(packageRoot, homeDir, ['.cursor']);

    const claudeSkillsDir = path.join(globalClaudeDir(homeDir), 'skills');
    assert.ok(!fs.existsSync(claudeSkillsDir), '.claude/skills must not be created when claude not selected');
  });

  test('installSkills with [.claude] does not create opencode skills', () => {
    installSkills(packageRoot, homeDir, ['.claude']);

    const ocSkillsDir = path.join(globalOpenCodeDir(homeDir), 'skills');
    assert.ok(!fs.existsSync(ocSkillsDir), 'opencode/skills must not be created when opencode not selected');
  });

  test('installAgents with [.claude] does not create cursor agents', () => {
    installAgents(packageRoot, homeDir, ['.claude']);

    const cursorAgentsDir = path.join(globalCursorDir(homeDir), 'agents');
    assert.ok(!fs.existsSync(cursorAgentsDir), '.cursor/agents must not be created when cursor not selected');
  });

  test('installAgents produces no error when ideDirs is an empty array', () => {
    assert.doesNotThrow(() => installAgents(packageRoot, homeDir, []));
  });
});

// ── CR-02: merge never destroys preexisting user config ───────────────────────

describe('CR-02: installHooks merge preserves all preexisting non-SDD config', () => {
  test('preexisting settings keys outside hooks are preserved after Claude install', () => {
    const claudeDir = globalClaudeDir(homeDir);
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');
    const pre = {
      theme: 'dark',
      editor: { fontSize: 14, wordWrap: true },
      hooks: {},
    };
    fs.writeFileSync(settingsPath, JSON.stringify(pre, null, 2));

    installHooks('.claude', homeDir);

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(result.theme, 'dark', 'theme must be preserved');
    assert.deepEqual(result.editor, { fontSize: 14, wordWrap: true }, 'editor config must be preserved');
  });

  test('non-SDD PreToolUse hooks are preserved alongside SDD hooks after Claude install', () => {
    const claudeDir = globalClaudeDir(homeDir);
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');
    const pre = {
      hooks: {
        PreToolUse: [{ _myLinter: true, matcher: 'Write', hooks: [{ type: 'command', command: 'lint' }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(pre, null, 2));

    installHooks('.claude', homeDir);

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(result.hooks.PreToolUse.some((h) => h._myLinter === true), 'custom PreToolUse hook must be preserved');
    assert.ok(result.hooks.PreToolUse.some((h) => h._sdd_compact === true), 'SDD compact hook must be present');
  });
});

// ── CR-04: detectInstalledIDEs failure is non-fatal ──────────────────────────

describe('CR-04: detectInstalledIDEs is error-tolerant', () => {
  test('returns an array (possibly empty) — never throws', () => {
    let result;
    assert.doesNotThrow(() => {
      result = detectInstalledIDEs();
    });
    assert.ok(Array.isArray(result), 'detectInstalledIDEs must return an array');
  });

  test('returned values are a subset of known IDE identifiers', () => {
    const result = detectInstalledIDEs();
    const known = new Set(['claude', 'cursor', 'opencode']);
    for (const ide of result) {
      assert.ok(known.has(ide), `unexpected IDE identifier: ${ide}`);
    }
  });
});
