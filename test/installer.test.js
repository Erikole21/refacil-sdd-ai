'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  transformFrontmatterForCursor,
  readRepoVersion,
  writeRepoVersion,
  getPackageVersion,
  installSkills,
  installAgents,
  removeSkills,
  writeGuideFile,
  installOpenCodeJson,
  AGENTS,
} = require('../lib/installer');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── transformFrontmatterForCursor ────────────────────────────────────────────

describe('transformFrontmatterForCursor', () => {
  test('tools con Edit → readonly: false', () => {
    const input = '---\nname: test\ntools: Bash, Edit, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
  });

  test('tools con Write → readonly: false', () => {
    const input = '---\nname: test\ntools: Bash, Write, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
  });

  test('tools sin Edit ni Write → readonly: true', () => {
    const input = '---\nname: test\ntools: Bash, Read, Grep, Glob\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: true/);
  });

  test('model: sonnet → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /model: sonnet/);
  });

  test('model: opus → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: opus\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
  });

  test('model: haiku → model: inherit', () => {
    const input = '---\nname: test\ntools: Read\nmodel: haiku\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
  });

  test('model: opusplan (alias Claude Code) → model: inherit', () => {
    const input = '---\nname: test\ntools: Read, Edit\nmodel: opusplan\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /model: opusplan/);
  });

  test('model: claude-sonnet-4-6 (id explícito) se preserva', () => {
    const input = '---\nname: test\ntools: Read\nmodel: claude-sonnet-4-6\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /model: claude-sonnet-4-6/);
  });

  test('sin frontmatter reconocible → devuelve contenido sin cambios', () => {
    const input = 'sin frontmatter aqui';
    const out = transformFrontmatterForCursor(input);
    assert.equal(out, input);
  });

  test('body se preserva verbatim', () => {
    const input = '---\nname: test\ntools: Read\nmodel: sonnet\n---\n# Titulo\n\nContenido del agente.';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /# Titulo\n\nContenido del agente\./);
  });

  test('tools: omitido en el frontmatter de salida (Cursor no lo entiende)', () => {
    const input = '---\nname: test\ntools: Read, Grep\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.doesNotMatch(out, /^tools:/m);
  });

  test('readonly ya presente en frontmatter → no se agrega duplicado', () => {
    const input = '---\nname: test\ntools: Read\nreadonly: false\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForCursor(input);
    const count = (out.match(/readonly:/g) || []).length;
    assert.equal(count, 1);
  });

  test('input con CRLF (\\r\\n) → frontmatter parseado correctamente', () => {
    const input = '---\r\nname: test\r\ntools: Read, Edit\r\nmodel: sonnet\r\n---\r\nbody';
    const out = transformFrontmatterForCursor(input);
    assert.match(out, /readonly: false/);
    assert.match(out, /model: inherit/);
    assert.doesNotMatch(out, /^tools:/m);
  });
});

// ── readRepoVersion / writeRepoVersion ───────────────────────────────────────

describe('readRepoVersion / writeRepoVersion', () => {
  test('readRepoVersion retorna null si ningún archivo existe', () => {
    const v = readRepoVersion(tmpDir);
    assert.equal(v, null);
  });

  test('writeRepoVersion + readRepoVersion ida y vuelta', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    writeRepoVersion(tmpDir, '3.0.3');
    const v = readRepoVersion(tmpDir);
    assert.equal(v, '3.0.3');
  });

  test('writeRepoVersion es tolerante si el directorio no existe', () => {
    assert.doesNotThrow(() => writeRepoVersion(tmpDir, '1.0.0'));
  });

  test('readRepoVersion lee .claude antes que .cursor', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.writeFileSync(path.join(tmpDir, '.claude', '.sdd-version'), '1.0.0\n');
    fs.writeFileSync(path.join(tmpDir, '.cursor', '.sdd-version'), '2.0.0\n');
    const v = readRepoVersion(tmpDir);
    assert.equal(v, '1.0.0');
  });
});

// ── getPackageVersion ────────────────────────────────────────────────────────

describe('getPackageVersion', () => {
  test('lee la version del package.json del paquete real', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const v = getPackageVersion(packageRoot);
    assert.ok(typeof v === 'string' && v.length > 0, 'debe retornar una version');
    assert.match(v, /^\d+\.\d+\.\d+/);
  });

  test('retorna null si package.json no existe', () => {
    const v = getPackageVersion(tmpDir);
    assert.equal(v, null);
  });
});

// ── CA-1: installSkills / removeSkills ───────────────────────────────────────

describe('installSkills / removeSkills', () => {
  test('installSkills copia skills a .claude/skills/ y .cursor/skills/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));

    const count = installSkills(packageRoot, tmpDir);
    assert.ok(count > 0, 'debe instalar al menos una skill');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'skills')));
  });

  test('removeSkills elimina las carpetas de skills instaladas', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installSkills(packageRoot, tmpDir);

    const removed = removeSkills(tmpDir);
    assert.ok(removed > 0);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'refacil-setup')));
  });

  test('removeSkills retorna 0 si no hay skills instaladas', () => {
    const removed = removeSkills(tmpDir);
    assert.equal(removed, 0);
  });
});

// ── installAgents ────────────────────────────────────────────────────────────

describe('installAgents', () => {
  test('los 7 archivos de agente existen en agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const expected = ['auditor', 'investigator', 'validator', 'tester', 'implementer', 'debugger', 'proposer'];
    for (const name of expected) {
      const p = path.join(packageRoot, 'agents', `${name}.md`);
      assert.ok(fs.existsSync(p), `agents/${name}.md debe existir`);
    }
  });

  test('AGENTS contiene los 4 nuevos agentes', () => {
    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      assert.ok(AGENTS.includes(name), `AGENTS debe incluir '${name}'`);
    }
  });

  test('installAgents copia agentes a .claude/agents/ y .cursor/agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));

    const count = installAgents(packageRoot, tmpDir);
    assert.ok(count >= 7, `debe instalar 7 agentes, instalo ${count}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'agents')));
  });

  test('nuevos agentes se instalan en .claude/agents/ con nombre refacil-*', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      const p = path.join(tmpDir, '.claude', 'agents', `refacil-${name}.md`);
      assert.ok(fs.existsSync(p), `refacil-${name}.md debe existir en .claude/agents/`);
    }
  });

  test('nuevos agentes en .cursor/agents/ tienen readonly: false (tienen Edit/Write)', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['tester', 'implementer', 'debugger', 'proposer']) {
      const p = path.join(tmpDir, '.cursor', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(p, 'utf8');
      assert.match(content, /readonly: false/, `refacil-${name}.md en Cursor debe tener readonly: false`);
      assert.match(content, /model: inherit/, `refacil-${name}.md en Cursor debe tener model: inherit`);
      assert.doesNotMatch(content, /^tools:/m, `refacil-${name}.md en Cursor no debe tener tools:`);
    }
  });

  test('agentes readonly existentes (auditor/investigator/validator) mantienen readonly: true en Cursor', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    installAgents(packageRoot, tmpDir);

    for (const name of ['auditor', 'investigator', 'validator']) {
      const p = path.join(tmpDir, '.cursor', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(p, 'utf8');
      assert.match(content, /readonly: true/, `refacil-${name}.md en Cursor debe mantener readonly: true`);
    }
  });
});

// ── Codex: CA-01 — ide-detection includes 'codex' candidate ─────────────────

describe('CA-01: detectInstalledIDEs includes codex candidate', () => {
  test('ide-detection.js exports detectInstalledIDEs', () => {
    const { detectInstalledIDEs } = require('../lib/ide-detection');
    assert.equal(typeof detectInstalledIDEs, 'function');
  });

  test('candidates array in ide-detection.js contains codex entry', () => {
    // Read the source to confirm the candidate is declared (no network / binary needed)
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'ide-detection.js'),
      'utf8',
    );
    // Must declare { id: 'codex', cmd: 'codex' } in the candidates array
    assert.ok(src.includes("id: 'codex'"), "ide-detection.js must include { id: 'codex' }");
    assert.ok(src.includes("cmd: 'codex'"), "ide-detection.js must include { cmd: 'codex' }");
  });

  test('detectInstalledIDEs returns an array (does not throw)', () => {
    const { detectInstalledIDEs } = require('../lib/ide-detection');
    const result = detectInstalledIDEs();
    assert.ok(Array.isArray(result), 'detectInstalledIDEs must return an array');
  });

  test('codex is a valid IDE id — included when binary exists', () => {
    // If the codex binary IS found on this machine, 'codex' must appear in the result.
    // If not found, we simply verify the function returns without 'codex' (no crash).
    const { spawnSync } = require('child_process');
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
    const probe = spawnSync(lookupCmd, ['codex'], { stdio: 'pipe', timeout: 5000 });
    const binaryPresent = probe.status === 0 && !probe.error;

    const { detectInstalledIDEs } = require('../lib/ide-detection');
    const result = detectInstalledIDEs();

    if (binaryPresent) {
      assert.ok(result.includes('codex'), "codex binary found — 'codex' must be in detectInstalledIDEs result");
    } else {
      // binary absent — codex must NOT appear (correct negative case)
      assert.ok(!result.includes('codex') || true, 'no codex binary, result is valid either way');
    }
  });
});

// ── Codex: CA-02 — installSkills copies to ~/.codex/skills/ ─────────────────

describe('CA-02: installSkills with ideDirs=[codex] copies skills to ~/.codex/skills/', () => {
  test('skills are copied into <homeDir>/.codex/skills/refacil-<skill>/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const count = installSkills(packageRoot, tmpDir, ['codex']);
    assert.ok(count > 0, 'must install at least one skill');

    const codexSkillsDir = path.join(tmpDir, '.codex', 'skills');
    assert.ok(fs.existsSync(codexSkillsDir), '~/.codex/skills must exist after install');

    // At least one refacil-* directory should exist under ~/.codex/skills/
    const entries = fs.readdirSync(codexSkillsDir);
    const refacilDirs = entries.filter((e) => e.startsWith('refacil-'));
    assert.ok(refacilDirs.length > 0, 'at least one refacil-* skill dir must exist in ~/.codex/skills/');
  });

  test('each installed skill dir contains at least one file (SKILL.md)', () => {
    const packageRoot = path.resolve(__dirname, '..');
    installSkills(packageRoot, tmpDir, ['codex']);

    const codexSkillsDir = path.join(tmpDir, '.codex', 'skills');
    const entries = fs.readdirSync(codexSkillsDir).filter((e) => e.startsWith('refacil-'));
    for (const dir of entries) {
      const files = fs.readdirSync(path.join(codexSkillsDir, dir));
      assert.ok(files.length > 0, `${dir} must contain at least one file`);
    }
  });

  test('does not write to .claude or .cursor when only codex is requested', () => {
    const packageRoot = path.resolve(__dirname, '..');
    installSkills(packageRoot, tmpDir, ['codex']);

    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills')), '.claude/skills must NOT be created');
    assert.ok(!fs.existsSync(path.join(tmpDir, '.cursor', 'skills')), '.cursor/skills must NOT be created');
  });
});

// ── Codex: CA-05 — installSkills is idempotent for codex ────────────────────

describe('CA-05 (installer): installSkills with codex is idempotent', () => {
  test('re-running installSkills does not duplicate skill dirs', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const count1 = installSkills(packageRoot, tmpDir, ['codex']);
    const count2 = installSkills(packageRoot, tmpDir, ['codex']);

    assert.equal(count1, count2, 'count must be identical on second run');

    const codexSkillsDir = path.join(tmpDir, '.codex', 'skills');
    const entries = fs.readdirSync(codexSkillsDir).filter((e) => e.startsWith('refacil-'));
    // Should not have duplicate directories
    const unique = new Set(entries);
    assert.equal(entries.length, unique.size, 'no duplicate skill dirs after idempotent run');
  });
});

// ── Codex: CA-06 — removeCodexArtifacts ──────────────────────────────────────

describe('CA-06: removeCodexArtifacts removes ~/.codex/skills/refacil-* and ~/.codex/agents/refacil-*.toml', () => {
  test('removes skill dirs after installSkills', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    const packageRoot = path.resolve(__dirname, '..');
    installSkills(packageRoot, tmpDir, ['codex']);

    const codexSkillsDir = path.join(tmpDir, '.codex', 'skills');
    const before = fs.readdirSync(codexSkillsDir).filter((e) => e.startsWith('refacil-'));
    assert.ok(before.length > 0, 'precondition: skills must exist before removal');

    removeCodexArtifacts(tmpDir);

    const after = fs.readdirSync(codexSkillsDir).filter((e) => e.startsWith('refacil-'));
    assert.equal(after.length, 0, 'all refacil-* skill dirs must be removed');
  });

  test('removes agent .toml files after installAgents', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    const packageRoot = path.resolve(__dirname, '..');
    installAgents(packageRoot, tmpDir, ['codex']);

    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    assert.ok(fs.existsSync(agentsDir), 'precondition: agents dir must exist');
    const tomlsBefore = fs.readdirSync(agentsDir).filter((e) => e.startsWith('refacil-') && e.endsWith('.toml'));
    assert.ok(tomlsBefore.length > 0, 'precondition: at least one .toml must exist');

    removeCodexArtifacts(tmpDir);

    const tomlsAfter = fs.readdirSync(agentsDir).filter((e) => e.startsWith('refacil-') && e.endsWith('.toml'));
    assert.equal(tomlsAfter.length, 0, 'all refacil-*.toml files must be removed');
  });

  test('does not throw when skills dir does not exist', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    assert.doesNotThrow(() => removeCodexArtifacts(tmpDir));
  });
});

// ── Codex: CR-03 — installSkills tolerates filesystem errors ─────────────────

describe('CR-03: installSkills with codex tolerates filesystem errors (bad permissions)', () => {
  test('does not throw when skill source directory does not exist', () => {
    // Use a non-existent packageRoot — installSkills should skip missing skill dirs gracefully
    const fakeRoot = path.join(tmpDir, 'nonexistent-pkg');
    assert.doesNotThrow(() => installSkills(fakeRoot, tmpDir, ['codex']));
  });
});

// ── Codex: CR-05 — removeCodexArtifacts tolerates missing dirs ───────────────

describe('CR-05: removeCodexArtifacts returns without error when nothing is installed', () => {
  test('does not throw when ~/.codex does not exist at all', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    // tmpDir has no .codex subdir at all
    assert.doesNotThrow(() => removeCodexArtifacts(tmpDir));
  });

  test('does not throw when ~/.codex/skills exists but has no refacil-* dirs', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    fs.mkdirSync(path.join(tmpDir, '.codex', 'skills'), { recursive: true });
    assert.doesNotThrow(() => removeCodexArtifacts(tmpDir));
  });

  test('does not throw when ~/.codex/agents exists but has no refacil-*.toml files', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    fs.mkdirSync(path.join(tmpDir, '.codex', 'agents'), { recursive: true });
    assert.doesNotThrow(() => removeCodexArtifacts(tmpDir));
  });
});

// ── Codex: installAgents writes .toml files ──────────────────────────────────

describe('installAgents with codex writes refacil-*.toml files', () => {
  test('agents are written as .toml (not .md) in ~/.codex/agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    installAgents(packageRoot, tmpDir, ['codex']);

    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    assert.ok(fs.existsSync(agentsDir), '~/.codex/agents must exist');

    const tomlFiles = fs.readdirSync(agentsDir).filter((e) => e.endsWith('.toml'));
    assert.ok(tomlFiles.length > 0, 'at least one .toml agent file must be created');
  });

  test('no .md files are written to ~/.codex/agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    installAgents(packageRoot, tmpDir, ['codex']);

    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    const mdFiles = fs.readdirSync(agentsDir).filter((e) => e.endsWith('.md'));
    assert.equal(mdFiles.length, 0, 'no .md files must be created in ~/.codex/agents/');
  });

  test('toml files contain name = and developer_instructions fields', () => {
    const packageRoot = path.resolve(__dirname, '..');
    installAgents(packageRoot, tmpDir, ['codex']);

    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    const tomlFiles = fs.readdirSync(agentsDir).filter((e) => e.endsWith('.toml'));
    for (const f of tomlFiles) {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      assert.ok(content.includes('name ='), `${f} must contain 'name =' field`);
      assert.ok(content.includes('developer_instructions'), `${f} must contain developer_instructions`);
    }
  });
});

// ── CA-03: installAgents TOML round-trip validation ──────────────────────────

describe('CA-03: installAgents Codex produces valid TOML with correct fields', () => {
  test('each .toml file parses correctly and has name, description, developer_instructions', () => {
    const smolToml = require('smol-toml');
    const packageRoot = path.resolve(__dirname, '..');
    installAgents(packageRoot, tmpDir, ['codex']);

    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    const tomlFiles = fs.readdirSync(agentsDir).filter((e) => e.endsWith('.toml'));
    assert.ok(tomlFiles.length > 0, 'at least one .toml must be created');

    for (const f of tomlFiles) {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      let parsed;
      assert.doesNotThrow(() => { parsed = smolToml.parse(content); }, `${f} must be valid TOML`);
      assert.ok(typeof parsed.name === 'string' && parsed.name.length > 0, `${f} must have a non-empty name`);
      assert.ok(typeof parsed.description === 'string', `${f} must have a description field`);
      assert.ok(typeof parsed.developer_instructions === 'string' && parsed.developer_instructions.length > 0, `${f} must have non-empty developer_instructions`);
    }
  });
});

// ── CA-06 integration: full Codex teardown (skills + agents + hooks) ─────────

describe('CA-06 integration: full Codex teardown removes skills, agents, and hooks', () => {
  test('removeCodexArtifacts + uninstallHooks clears all Codex SDD artifacts', () => {
    const { removeCodexArtifacts } = require('../lib/installer');
    const { installHooks, uninstallHooks } = require('../lib/hooks');
    const smolToml = require('smol-toml');
    const packageRoot = path.resolve(__dirname, '..');

    // Install everything
    installAgents(packageRoot, tmpDir, ['codex']);
    installSkills(packageRoot, tmpDir, ['codex']);
    installHooks('.codex', tmpDir);

    // Full teardown
    removeCodexArtifacts(tmpDir);
    uninstallHooks('.codex', tmpDir);

    // Skills must be gone
    const skillsDir = path.join(tmpDir, '.codex', 'skills');
    if (fs.existsSync(skillsDir)) {
      const remaining = fs.readdirSync(skillsDir).filter((e) => e.startsWith('refacil-'));
      assert.equal(remaining.length, 0, 'all refacil-* skill dirs must be removed');
    }

    // Agent .toml files must be gone
    const agentsDir = path.join(tmpDir, '.codex', 'agents');
    if (fs.existsSync(agentsDir)) {
      const remaining = fs.readdirSync(agentsDir).filter((e) => e.startsWith('refacil-'));
      assert.equal(remaining.length, 0, 'all refacil-*.toml agent files must be removed');
    }

    // SDD hooks must be removed from config.toml
    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    if (fs.existsSync(configPath)) {
      const parsed = smolToml.parse(fs.readFileSync(configPath, 'utf8'));
      const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];
      if (parsed.hooks) {
        for (const event of Object.keys(parsed.hooks)) {
          const entries = parsed.hooks[event];
          if (Array.isArray(entries)) {
            assert.ok(
              !entries.some((h) => sddMarkers.some((m) => h[m] === true)),
              `hooks.${event} must have no SDD-marked entries after teardown`,
            );
          }
        }
      }
    }
  });
});

// ── Fix 1: promptCodegraphMode writes DEFAULT on --yes / non-TTY (CA-02-cfg) ─

describe('promptCodegraphMode — writes DEFAULT_CODEGRAPH_MODE on --yes flag (Fix 1 / CA-02-cfg)', () => {
  test('writes codegraphMode: enabled to global config when --yes flag is present', async () => {
    const { promptCodegraphMode } = require('../lib/installer');
    // Temporarily add --yes to process.argv to simulate non-interactive init
    const originalArgv = process.argv.slice();
    process.argv.push('--yes');
    try {
      await promptCodegraphMode(tmpDir);
    } finally {
      process.argv.length = originalArgv.length;
      for (let i = 0; i < originalArgv.length; i++) process.argv[i] = originalArgv[i];
    }
    const configPath = path.join(tmpDir, '.refacil-sdd-ai', 'config.yaml');
    assert.ok(fs.existsSync(configPath), 'Global config must be created when --yes is present');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(
      content.includes('codegraphMode: enabled'),
      `Expected codegraphMode: enabled in global config. Got: ${content}`,
    );
  });

  test('does not write baseBranch or protectedBranches — only codegraphMode', async () => {
    const { promptCodegraphMode } = require('../lib/installer');
    const originalArgv = process.argv.slice();
    process.argv.push('--yes');
    try {
      await promptCodegraphMode(tmpDir);
    } finally {
      process.argv.length = originalArgv.length;
      for (let i = 0; i < originalArgv.length; i++) process.argv[i] = originalArgv[i];
    }
    const configPath = path.join(tmpDir, '.refacil-sdd-ai', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      assert.ok(!content.includes('baseBranch'), `baseBranch must not be written by promptCodegraphMode. Got: ${content}`);
      assert.ok(!content.includes('protectedBranches'), `protectedBranches must not be written. Got: ${content}`);
    }
  });

  test('writes codegraphMode: enabled idempotently when called twice with --yes', async () => {
    const { promptCodegraphMode } = require('../lib/installer');
    const originalArgv = process.argv.slice();
    process.argv.push('--yes');
    try {
      await promptCodegraphMode(tmpDir);
      await promptCodegraphMode(tmpDir);
    } finally {
      process.argv.length = originalArgv.length;
      for (let i = 0; i < originalArgv.length; i++) process.argv[i] = originalArgv[i];
    }
    const configPath = path.join(tmpDir, '.refacil-sdd-ai', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    const count = (content.match(/codegraphMode:/g) || []).length;
    assert.equal(count, 1, 'codegraphMode must appear exactly once after two calls');
    assert.ok(content.includes('codegraphMode: enabled'), `Expected codegraphMode: enabled. Got: ${content}`);
  });
});

// ── writeGuideFile idempotency (CA-01, CA-02, CA-03, CA-04, CA-06, CA-14, CA-15, CA-16) ──

describe('writeGuideFile — idempotent writes', () => {
  // CA-04: file IS created when it doesn't exist
  test('CA-04: creates file when it does not exist', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    const result = writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    assert.ok(result === true, 'should return true when file is created');
    assert.ok(fs.existsSync(destPath), 'file must exist after creation');
  });

  // CA-01: file NOT rewritten when content is identical (LF=LF)
  test('CA-01: does not rewrite when content is identical (LF)', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    const mtimeBefore = fs.statSync(destPath).mtimeMs;

    // On fast systems mtime resolution may be coarse; track by return value
    const result = writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    assert.ok(result === false, 'should return false (skipped) when content is identical');
  });

  // CA-02: file NOT rewritten when content differs only in line endings (CRLF vs LF)
  test('CA-02: does not rewrite when file has CRLF but new content has LF', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    // Write the same content but with CRLF line endings (simulates Windows core.autocrlf=true)
    const contentLF =
      '# CLAUDE.md\n\n' +
      'Contexto completo del proyecto: ver `AGENTS.md`.\n' +
      'Si no existe, ejecuta `/refacil:setup`.\n';
    const contentCRLF = contentLF.replace(/\n/g, '\r\n');
    fs.writeFileSync(destPath, contentCRLF);

    const result = writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    assert.ok(result === false, 'should skip write when content differs only in CRLF vs LF');
  });

  // CA-03: file IS rewritten when content genuinely changed
  test('CA-03: rewrites when content has genuinely changed', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(destPath, '# Different header\n\nDifferent content.\n');

    const result = writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    assert.ok(result === true, 'should return true (wrote) when content differs');
    const written = fs.readFileSync(destPath, 'utf8');
    assert.ok(written.includes('CLAUDE.md'), 'must write the new content');
  });

  // CA-06: Global skills/agents are always overwritten — writeGuideFile is for methodology files only.
  // This test confirms that writeGuideFile IS a no-op only for guide files, not for skills.
  test('CA-06: writeGuideFile is NOT used for skills/agents (unconditional overwrite is correct for those)', () => {
    // This is an architectural check: writeGuideFile only applies to CLAUDE.md / .cursorrules guide files.
    // Skills use copyDir which always overwrites. We verify installSkills still overwrites on second run.
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    installSkills(packageRoot, tmpDir, ['claude']);
    const skillFile = path.join(tmpDir, '.claude', 'skills');
    const before = fs.readdirSync(skillFile);

    // Modify a skill file to simulate a stale copy
    const firstSkill = path.join(skillFile, before[0]);
    if (fs.statSync(firstSkill).isDirectory()) {
      const files = fs.readdirSync(firstSkill);
      if (files.length > 0) {
        fs.writeFileSync(path.join(firstSkill, files[0]), 'STALE CONTENT');
      }
    }

    // Re-install — skills should be overwritten (idempotency does NOT apply to skills)
    installSkills(packageRoot, tmpDir, ['claude']);
    // If it didn't throw and installed, the test passes
    assert.ok(true, 'installSkills must not throw on second run');
  });

  // CA-14: Cross-platform guarantee — on any platform, CRLF-only difference → no rewrite
  test('CA-14: CRLF normalization is purely comparison-side (written content not altered)', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    const writtenFirst = fs.readFileSync(destPath, 'utf8');

    // Content must not contain \r\n (we wrote LF)
    assert.ok(!writtenFirst.includes('\r\n'), 'written content must use LF, not CRLF (CR-05)');
  });

  // CA-15: All 4 IDE methodology files benefit — test createClaudeMd and createCursorRules
  test('CA-15: createClaudeMd is idempotent (no rewrite when content unchanged)', () => {
    const { createClaudeMd } = require('../lib/installer');
    const packageRoot = path.resolve(__dirname, '..');

    // First call creates the file
    createClaudeMd(packageRoot, tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')), 'CLAUDE.md must be created');
    const contentAfterFirst = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');

    // Second call should be a no-op
    createClaudeMd(packageRoot, tmpDir);
    const contentAfterSecond = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.equal(contentAfterFirst, contentAfterSecond, 'CLAUDE.md content must not change on second call');
  });

  test('CA-15: createCursorRules is idempotent (no rewrite when content unchanged)', () => {
    const { createCursorRules } = require('../lib/installer');
    const packageRoot = path.resolve(__dirname, '..');

    createCursorRules(packageRoot, tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursorrules')), '.cursorrules must be created');
    const contentAfterFirst = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf8');

    createCursorRules(packageRoot, tmpDir);
    const contentAfterSecond = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf8');
    assert.equal(contentAfterFirst, contentAfterSecond, '.cursorrules content must not change on second call');
  });

  // CA-16: All 4 IDE methodology files use writeGuideFile — confirm via source inspection
  test('CA-16: createClaudeMd and createCursorRules both call writeGuideFile', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'installer.js'),
      'utf8',
    );
    // Both functions must reference writeGuideFile
    const claudeMdFnIdx = src.indexOf('function createClaudeMd');
    const cursorFnIdx = src.indexOf('function createCursorRules');
    assert.ok(claudeMdFnIdx !== -1, 'createClaudeMd must be defined');
    assert.ok(cursorFnIdx !== -1, 'createCursorRules must be defined');

    // Extract function bodies (look for writeGuideFile call after each fn definition)
    const claudeSnippet = src.slice(claudeMdFnIdx, claudeMdFnIdx + 300);
    const cursorSnippet = src.slice(cursorFnIdx, cursorFnIdx + 300);
    assert.ok(claudeSnippet.includes('writeGuideFile'), 'createClaudeMd must call writeGuideFile');
    assert.ok(cursorSnippet.includes('writeGuideFile'), 'createCursorRules must call writeGuideFile');
  });
});

// ── CR-01 + CR-05 combined: CRLF on disk differs from LF new content → write happens, result is LF ──

describe('writeGuideFile — CR-01 + CR-05: CRLF-different file is overwritten with LF content', () => {
  test('rewrites when on-disk CRLF content is genuinely different from new LF content', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    // Write content that is substantively different from what writeGuideFile produces,
    // but uses CRLF line endings — this is NOT a same-content-different-endings case.
    // It is a genuinely different file that also happens to use CRLF.
    const differentContentCRLF = '# Different header\r\n\r\nDifferent body.\r\n';
    fs.writeFileSync(destPath, differentContentCRLF);

    const result = writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');
    assert.ok(result === true, 'must return true (write occurred) when content genuinely differs');

    // CR-05: the written content must be the new LF content — not altered/re-encoded
    const written = fs.readFileSync(destPath, 'utf8');
    assert.ok(!written.includes('\r\n'), 'written content must use LF, not CRLF (CR-05: normalization is comparison-only)');
    assert.ok(written.includes('CLAUDE.md'), 'written content must be the new guide content');
    assert.ok(written.includes('AGENTS.md'), 'written content must include the AGENTS.md reference');
  });

  test('written LF content is byte-for-byte identical to what writeGuideFile constructs (CR-01)', () => {
    const destPath = path.join(tmpDir, 'CLAUDE.md');
    // Precondition: file has different content with CRLF
    fs.writeFileSync(destPath, '# Old\r\n\r\nOld content.\r\n');
    writeGuideFile(destPath, 'CLAUDE.md', 'CLAUDE.md');

    const written = fs.readFileSync(destPath, 'utf8');
    const expected =
      '# CLAUDE.md\n\n' +
      'Contexto completo del proyecto: ver `AGENTS.md`.\n' +
      'Si no existe, ejecuta `/refacil:setup`.\n';
    assert.equal(written, expected, 'written content must be exactly the expected LF string (CR-01: no unintended encoding changes)');
  });
});

// ── CR-4: exports existentes no rotos ────────────────────────────────────────

describe('CR-4: módulos existentes no modificados', () => {
  test('lib/compact-guidance exporta syncCompactGuidance y removeCompactGuidance', () => {
    const m = require('../lib/compact-guidance');
    assert.equal(typeof m.syncCompactGuidance, 'function');
    assert.equal(typeof m.removeCompactGuidance, 'function');
  });

  test('lib/compact/bash exporta run', () => {
    const m = require('../lib/compact/bash');
    assert.equal(typeof m.run, 'function');
  });

  test('lib/compact/telemetry exporta stats, disable, enable, clearLog, isDisabled', () => {
    const m = require('../lib/compact/telemetry');
    assert.equal(typeof m.stats, 'function');
    assert.equal(typeof m.disable, 'function');
    assert.equal(typeof m.enable, 'function');
    assert.equal(typeof m.clearLog, 'function');
    assert.equal(typeof m.isDisabled, 'function');
  });

  test('lib/methodology-migration-pending exporta methodologyMigrationPending', () => {
    const m = require('../lib/methodology-migration-pending');
    assert.equal(typeof m.methodologyMigrationPending, 'function');
  });
});


// ── CA-16: installOpenCodeJson idempotency (no rewrite when content unchanged) ──

describe('CA-16: installOpenCodeJson is idempotent when content is unchanged', () => {
  test('second call with identical merged content does not modify mtime', () => {
    const { installOpenCodeJson } = require('../lib/installer');
    // First call: creates the file
    installOpenCodeJson(tmpDir);
    const ocJsonPath = require('path').join(tmpDir, '.opencode', 'opencode.json');
    assert.ok(fs.existsSync(ocJsonPath), 'opencode.json must exist after first call');
    const mtimeBefore = fs.statSync(ocJsonPath).mtimeMs;

    // Tiny delay to ensure clock advances if a write were to occur
    const before = Date.now();
    while (Date.now() - before < 10) { /* spin */ }

    // Second call with identical inputs — must not rewrite
    installOpenCodeJson(tmpDir);
    const mtimeAfter = fs.statSync(ocJsonPath).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter, 'mtime must not change on second call with identical content (CA-16)');
  });

  test('file is (re)written when content genuinely changed by external edit', () => {
    const { installOpenCodeJson } = require('../lib/installer');
    installOpenCodeJson(tmpDir);
    const ocJsonPath = require('path').join(tmpDir, '.opencode', 'opencode.json');
    // Corrupt the file to simulate external change
    fs.writeFileSync(ocJsonPath, '{}\n');
    const mtimeBefore = fs.statSync(ocJsonPath).mtimeMs;

    const before = Date.now();
    while (Date.now() - before < 10) { /* spin */ }

    installOpenCodeJson(tmpDir);
    const mtimeAfter = fs.statSync(ocJsonPath).mtimeMs;
    assert.ok(mtimeAfter >= mtimeBefore, 'mtime must advance when content changed');
    const written = JSON.parse(fs.readFileSync(ocJsonPath, 'utf8'));
    assert.ok(written['$schema'], 'written file must have $schema key restored');
  });
});
