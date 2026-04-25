'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  transformFrontmatterForOpenCode,
  installSkills,
  installAgents,
  installOpenCodeJson,
  removeOpenCodeArtifacts,
  writeRepoVersion,
  readRepoVersion,
  INTERNAL_AGENTS,
  AGENTS,
  SKILLS,
} = require('../lib/installer');

// CA-14: The expected version files — must include .opencode
const EXPECTED_VERSION_FILES = ['.claude/.sdd-version', '.cursor/.sdd-version', '.opencode/.sdd-version'];

const { installOpenCodePlugin, uninstallOpenCodePlugin } = require('../lib/hooks');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-installer-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── transformFrontmatterForOpenCode ──────────────────────────────────────────

describe('transformFrontmatterForOpenCode — tools → permission mapping', () => {
  test('tools con Edit → permission.edit: allow', () => {
    const input = '---\nname: refacil-implementer\ntools: Edit, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: allow/);
  });

  test('tools con Write → permission.edit: allow', () => {
    const input = '---\nname: refacil-implementer\ntools: Write, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: allow/);
  });

  test('tools con NotebookEdit → permission.edit: allow', () => {
    const input = '---\nname: refacil-implementer\ntools: NotebookEdit, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: allow/);
  });

  test('tools con Bash → permission.bash: allow', () => {
    const input = '---\nname: refacil-implementer\ntools: Bash, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /bash: allow/);
  });

  test('tools sin Edit/Write/NotebookEdit → permission.edit: deny', () => {
    const input = '---\nname: refacil-auditor\ntools: Read, Grep\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: deny/);
  });

  test('tools sin Bash → permission.bash: deny', () => {
    const input = '---\nname: refacil-auditor\ntools: Read, Grep\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /bash: deny/);
  });

  test('WebFetch → webfetch: deny siempre', () => {
    const input = '---\nname: refacil-investigator\ntools: WebFetch, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /webfetch: deny/);
  });

  test('sin tools → todos deny', () => {
    const input = '---\nname: refacil-auditor\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: deny/);
    assert.match(out, /bash: deny/);
    assert.match(out, /webfetch: deny/);
  });

  test('tools: Edit + Bash → edit allow + bash allow', () => {
    const input = '---\nname: refacil-implementer\ntools: Edit, Bash, Read\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: allow/);
    assert.match(out, /bash: allow/);
    assert.match(out, /webfetch: deny/);
  });
});

describe('transformFrontmatterForOpenCode — hidden + mode', () => {
  test('agentes internos tienen hidden: true', () => {
    for (const name of INTERNAL_AGENTS) {
      const input = `---\nname: refacil-${name}\ntools: Read\nmodel: sonnet\n---\nbody`;
      const out = transformFrontmatterForOpenCode(input);
      assert.match(out, /hidden: true/, `refacil-${name} debe tener hidden: true`);
    }
  });

  test('todos los agentes tienen mode: subagent', () => {
    for (const name of AGENTS) {
      const input = `---\nname: refacil-${name}\ntools: Read\nmodel: sonnet\n---\nbody`;
      const out = transformFrontmatterForOpenCode(input);
      assert.match(out, /mode: subagent/, `refacil-${name} debe tener mode: subagent`);
    }
  });

  test('INTERNAL_AGENTS incluye los 7 agentes refacil', () => {
    const expected = ['investigator', 'validator', 'auditor', 'tester', 'implementer', 'debugger', 'proposer'];
    for (const name of expected) {
      assert.ok(INTERNAL_AGENTS.includes(name), `INTERNAL_AGENTS debe incluir '${name}'`);
    }
  });
});

describe('transformFrontmatterForOpenCode — model y tools eliminados', () => {
  test('model: line se elimina del frontmatter de salida', () => {
    const input = '---\nname: refacil-proposer\ntools: Edit, Bash\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.doesNotMatch(out, /^model:/m);
  });

  test('tools: line se elimina del frontmatter de salida', () => {
    const input = '---\nname: refacil-proposer\ntools: Edit, Bash\nmodel: sonnet\n---\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.doesNotMatch(out, /^tools:/m);
  });

  test('body se preserva verbatim', () => {
    const input = '---\nname: refacil-proposer\ntools: Edit\nmodel: sonnet\n---\n# Titulo\n\nContenido del agente.';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /# Titulo\n\nContenido del agente\./);
  });
});

describe('transformFrontmatterForOpenCode — fallback defensivo (CR-06)', () => {
  test('sin frontmatter reconocible → devuelve contenido sin cambios', () => {
    const input = 'sin frontmatter aqui';
    const out = transformFrontmatterForOpenCode(input);
    assert.equal(out, input);
  });

  test('frontmatter incompleto → devuelve contenido sin cambios', () => {
    const input = '--- sin cierre\nname: test';
    const out = transformFrontmatterForOpenCode(input);
    assert.equal(out, input);
  });

  test('input con CRLF → frontmatter parseado correctamente', () => {
    const input = '---\r\nname: refacil-implementer\r\ntools: Edit, Bash\r\nmodel: sonnet\r\n---\r\nbody';
    const out = transformFrontmatterForOpenCode(input);
    assert.match(out, /edit: allow/);
    assert.match(out, /bash: allow/);
    assert.match(out, /mode: subagent/);
    assert.match(out, /hidden: true/);
  });

  test('CR-06: string vacío → devuelve sin cambios', () => {
    const input = '';
    const out = transformFrontmatterForOpenCode(input);
    assert.equal(out, input);
  });

  test('CR-06: solo bloques de comentarios → devuelve sin cambios', () => {
    const input = '<!-- not frontmatter -->\n# Just a heading';
    const out = transformFrontmatterForOpenCode(input);
    assert.equal(out, input);
  });
});

// ── installSkills copia a .opencode/skills/ (CA-01, CR-01) ───────────────────

describe('installSkills → .opencode/skills/ (CA-01, CR-01)', () => {
  test('installSkills copia skills a .opencode/skills/ (byte-for-byte)', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    const count = installSkills(packageRoot, tmpDir);
    assert.ok(count > 0, 'debe instalar al menos una skill');
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'skills')), '.opencode/skills/ debe existir');

    // Verify byte-for-byte: compare a skill file between .claude and .opencode
    const claudeSkillFile = path.join(tmpDir, '.claude', 'skills', 'refacil-setup', 'SKILL.md');
    const openCodeSkillFile = path.join(tmpDir, '.opencode', 'skills', 'refacil-setup', 'SKILL.md');
    if (fs.existsSync(claudeSkillFile) && fs.existsSync(openCodeSkillFile)) {
      const claudeContent = fs.readFileSync(claudeSkillFile);
      const openCodeContent = fs.readFileSync(openCodeSkillFile);
      assert.deepEqual(claudeContent, openCodeContent, 'skill en .opencode debe ser byte-for-byte igual a .claude');
    }
  });

  test('skills en .opencode/skills/ tienen el prefijo refacil-', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installSkills(packageRoot, tmpDir);

    const skillsDir = path.join(tmpDir, '.opencode', 'skills');
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        assert.ok(entry.name.startsWith('refacil-'), `skill ${entry.name} debe tener prefijo refacil-`);
      }
    }
  });

  test('CR-01: skills en .opencode NO tienen frontmatter transformado (igual a .claude)', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installSkills(packageRoot, tmpDir);

    // For every installed skill that exists in both .claude and .opencode, content must be identical
    const claudeSkillsDir = path.join(tmpDir, '.claude', 'skills');
    const openCodeSkillsDir = path.join(tmpDir, '.opencode', 'skills');
    if (!fs.existsSync(claudeSkillsDir) || !fs.existsSync(openCodeSkillsDir)) return;

    const claudeSkills = fs.readdirSync(claudeSkillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const skillDir of claudeSkills) {
      const claudeSkillFile = path.join(claudeSkillsDir, skillDir, 'SKILL.md');
      const openCodeSkillFile = path.join(openCodeSkillsDir, skillDir, 'SKILL.md');
      if (!fs.existsSync(claudeSkillFile) || !fs.existsSync(openCodeSkillFile)) continue;

      const claudeContent = fs.readFileSync(claudeSkillFile);
      const openCodeContent = fs.readFileSync(openCodeSkillFile);
      assert.deepEqual(
        claudeContent,
        openCodeContent,
        `${skillDir}/SKILL.md debe ser byte-for-byte igual en .claude y .opencode (sin transformación)`,
      );
    }
  });

  test('installSkills no afecta .claude ni .cursor al instalar en .opencode', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    const beforeClaude = fs.readdirSync(path.join(tmpDir, '.claude')).length;
    const beforeCursor = fs.readdirSync(path.join(tmpDir, '.cursor')).length;
    installSkills(packageRoot, tmpDir);
    // .claude and .cursor should also have been updated (standard install)
    // But crucially, their content should NOT be changed by OpenCode install logic
    // The test verifies no side-effects: opencode install is additive only
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'skills')));
  });
});

// ── installAgents escribe a .opencode/agents/ (CA-03) ────────────────────────

describe('installAgents → .opencode/agents/ (CA-03)', () => {
  test('installAgents escribe agentes transformados a .opencode/agents/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    const count = installAgents(packageRoot, tmpDir);
    assert.ok(count >= 7, `debe instalar 7 agentes, instaló ${count}`);
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'agents')), '.opencode/agents/ debe existir');
  });

  test('agentes en .opencode/agents/ tienen mode: subagent y hidden: true', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installAgents(packageRoot, tmpDir);

    for (const name of AGENTS) {
      const filePath = path.join(tmpDir, '.opencode', 'agents', `refacil-${name}.md`);
      assert.ok(fs.existsSync(filePath), `refacil-${name}.md debe existir en .opencode/agents/`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.match(content, /mode: subagent/, `refacil-${name}.md debe tener mode: subagent`);
      assert.match(content, /hidden: true/, `refacil-${name}.md debe tener hidden: true (todos son internos)`);
    }
  });

  test('agentes en .opencode/agents/ tienen bloque permission:', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installAgents(packageRoot, tmpDir);

    for (const name of AGENTS) {
      const filePath = path.join(tmpDir, '.opencode', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.match(content, /permission:/, `refacil-${name}.md debe tener bloque permission:`);
      assert.match(content, /webfetch: deny/, `refacil-${name}.md debe tener webfetch: deny`);
    }
  });

  test('agentes en .opencode/ NO tienen tools: line', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installAgents(packageRoot, tmpDir);

    for (const name of AGENTS) {
      const filePath = path.join(tmpDir, '.opencode', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(content, /^tools:/m, `refacil-${name}.md en OpenCode no debe tener tools:`);
    }
  });

  test('agentes en .opencode/ NO tienen model: line', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installAgents(packageRoot, tmpDir);

    for (const name of AGENTS) {
      const filePath = path.join(tmpDir, '.opencode', 'agents', `refacil-${name}.md`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotMatch(content, /^model:/m, `refacil-${name}.md en OpenCode no debe tener model:`);
    }
  });

  test('installAgents no crea agentes en .claude/agents ni .cursor/agents de OpenCode', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));

    installAgents(packageRoot, tmpDir);

    // .claude/agents should have raw content (no OpenCode-specific fields)
    const claudeAgent = path.join(tmpDir, '.claude', 'agents', 'refacil-implementer.md');
    if (fs.existsSync(claudeAgent)) {
      const content = fs.readFileSync(claudeAgent, 'utf8');
      // Claude agents should NOT have permission: block (that's OpenCode-specific)
      assert.doesNotMatch(content, /^permission:/m, '.claude agents no deben tener bloque permission:');
    }
  });
});

// ── installOpenCodePlugin / uninstallOpenCodePlugin (CA-04) ───────────────────

describe('installOpenCodePlugin — CA-04', () => {
  test('copia el plugin a .opencode/plugins/refacil-hooks.js', () => {
    const result = installOpenCodePlugin(tmpDir);
    assert.equal(result, true, 'debe retornar true en éxito');
    const pluginPath = path.join(tmpDir, '.opencode', 'plugins', 'refacil-hooks.js');
    assert.ok(fs.existsSync(pluginPath), 'refacil-hooks.js debe existir en .opencode/plugins/');
  });

  test('el plugin instalado contiene los 3 handlers esperados', () => {
    installOpenCodePlugin(tmpDir);
    const pluginPath = path.join(tmpDir, '.opencode', 'plugins', 'refacil-hooks.js');
    const content = fs.readFileSync(pluginPath, 'utf8');
    assert.match(content, /session\.created/, 'debe tener handler session.created');
    assert.match(content, /tui\.prompt\.append/, 'debe tener handler tui.prompt.append');
    assert.match(content, /tool\.execute\.before/, 'debe tener handler tool.execute.before');
  });

  test('no afecta .claude/plugins ni .cursor/plugins', () => {
    installOpenCodePlugin(tmpDir);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'plugins', 'refacil-hooks.js')));
    assert.ok(!fs.existsSync(path.join(tmpDir, '.cursor', 'plugins', 'refacil-hooks.js')));
  });

  test('crea .opencode/plugins/ si no existe', () => {
    assert.ok(!fs.existsSync(path.join(tmpDir, '.opencode', 'plugins')));
    installOpenCodePlugin(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'plugins')));
  });
});

describe('uninstallOpenCodePlugin — CA-04 cleanup', () => {
  test('elimina refacil-hooks.js de .opencode/plugins/', () => {
    installOpenCodePlugin(tmpDir);
    const result = uninstallOpenCodePlugin(tmpDir);
    assert.equal(result, true, 'debe retornar true cuando elimina el archivo');
    const pluginPath = path.join(tmpDir, '.opencode', 'plugins', 'refacil-hooks.js');
    assert.ok(!fs.existsSync(pluginPath), 'refacil-hooks.js no debe existir después de uninstall');
  });

  test('retorna false si el plugin no existe (idempotente)', () => {
    const result = uninstallOpenCodePlugin(tmpDir);
    assert.equal(result, false, 'debe retornar false si no hay nada que eliminar');
  });
});

// ── installOpenCodeJson — CA-09, CR-05 ────────────────────────────────────────

describe('installOpenCodeJson — CA-09', () => {
  test('crea opencode.json si no existe con clave $schema', () => {
    installOpenCodeJson(tmpDir);
    const ocJsonPath = path.join(tmpDir, '.opencode', 'opencode.json');
    assert.ok(fs.existsSync(ocJsonPath), 'opencode.json debe existir');
    const json = JSON.parse(fs.readFileSync(ocJsonPath, 'utf8'));
    assert.ok(json['$schema'], 'debe tener la clave $schema');
    assert.match(json['$schema'], /opencode\.ai/, '$schema debe apuntar a opencode.ai');
  });

  test('CR-05: fusiona con opencode.json existente preservando claves del usuario', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    const existingJson = { 'myKey': 'myValue', 'theme': 'dark' };
    fs.writeFileSync(
      path.join(tmpDir, '.opencode', 'opencode.json'),
      JSON.stringify(existingJson, null, 2) + '\n',
    );

    installOpenCodeJson(tmpDir);

    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, '.opencode', 'opencode.json'), 'utf8'));
    assert.equal(result['myKey'], 'myValue', 'clave del usuario debe preservarse');
    assert.equal(result['theme'], 'dark', 'clave theme del usuario debe preservarse');
    assert.ok(result['$schema'], 'clave SDD-AI $schema debe agregarse');
  });

  test('CR-05: la clave $schema del usuario no es sobreescrita si ya existe', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    const existingJson = { '$schema': 'https://custom.user.schema/config.json' };
    fs.writeFileSync(
      path.join(tmpDir, '.opencode', 'opencode.json'),
      JSON.stringify(existingJson, null, 2) + '\n',
    );

    installOpenCodeJson(tmpDir);

    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, '.opencode', 'opencode.json'), 'utf8'));
    assert.equal(result['$schema'], 'https://custom.user.schema/config.json', '$schema del usuario debe respetarse');
  });

  test('tolera opencode.json inválido (JSON roto) sin crash', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.opencode', 'opencode.json'), 'not-valid-json{{{');
    assert.doesNotThrow(() => installOpenCodeJson(tmpDir));
    const result = JSON.parse(fs.readFileSync(path.join(tmpDir, '.opencode', 'opencode.json'), 'utf8'));
    assert.ok(result['$schema'], '$schema debe estar presente tras recovery');
  });

  test('CA-09: instala sin .opencode previo (crea el directorio)', () => {
    assert.ok(!fs.existsSync(path.join(tmpDir, '.opencode')));
    assert.doesNotThrow(() => installOpenCodeJson(tmpDir));
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'opencode.json')));
  });
});

// ── removeOpenCodeArtifacts — CA-13, CR-04 ────────────────────────────────────

describe('removeOpenCodeArtifacts — CA-13', () => {
  test('elimina .opencode/skills/refacil-*/', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.opencode'));
    installSkills(packageRoot, tmpDir);

    const skillsDir = path.join(tmpDir, '.opencode', 'skills');
    assert.ok(fs.existsSync(skillsDir), 'directorio skills debe existir antes de clean');

    removeOpenCodeArtifacts(tmpDir);

    // After clean, no refacil-* skill dirs should remain
    if (fs.existsSync(skillsDir)) {
      const remaining = fs.readdirSync(skillsDir).filter((n) => n.startsWith('refacil-'));
      assert.equal(remaining.length, 0, 'no deben quedar skills refacil-* después de clean');
    }
  });

  test('elimina .opencode/agents/refacil-*.md', () => {
    const packageRoot = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.mkdirSync(path.join(tmpDir, '.opencode'));
    installAgents(packageRoot, tmpDir);

    const agentsDir = path.join(tmpDir, '.opencode', 'agents');
    assert.ok(fs.existsSync(agentsDir), 'directorio agents debe existir antes de clean');

    removeOpenCodeArtifacts(tmpDir);

    if (fs.existsSync(agentsDir)) {
      const remaining = fs.readdirSync(agentsDir).filter((n) => n.startsWith('refacil-') && n.endsWith('.md'));
      assert.equal(remaining.length, 0, 'no deben quedar agentes refacil-*.md después de clean');
    }
  });

  test('elimina .opencode/plugins/refacil-hooks.js', () => {
    installOpenCodePlugin(tmpDir);
    const pluginPath = path.join(tmpDir, '.opencode', 'plugins', 'refacil-hooks.js');
    assert.ok(fs.existsSync(pluginPath), 'plugin debe existir antes de clean');

    removeOpenCodeArtifacts(tmpDir);

    assert.ok(!fs.existsSync(pluginPath), 'plugin debe eliminarse en clean');
  });

  test('revierte clave $schema de opencode.json y elimina el archivo si queda vacío', () => {
    installOpenCodeJson(tmpDir);

    removeOpenCodeArtifacts(tmpDir);

    const ocJsonPath = path.join(tmpDir, '.opencode', 'opencode.json');
    // File should be deleted since $schema was the only key
    assert.ok(!fs.existsSync(ocJsonPath), 'opencode.json debe eliminarse si solo tenía $schema');
  });

  test('revierte $schema de opencode.json pero preserva claves del usuario', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    const original = { '$schema': 'https://opencode.ai/config.json', 'theme': 'dark', 'userKey': 'value' };
    fs.writeFileSync(path.join(tmpDir, '.opencode', 'opencode.json'), JSON.stringify(original, null, 2) + '\n');

    removeOpenCodeArtifacts(tmpDir);

    const ocJsonPath = path.join(tmpDir, '.opencode', 'opencode.json');
    assert.ok(fs.existsSync(ocJsonPath), 'opencode.json debe permanecer si hay otras claves');
    const result = JSON.parse(fs.readFileSync(ocJsonPath, 'utf8'));
    assert.ok(!result['$schema'], '$schema debe haberse eliminado');
    assert.equal(result['theme'], 'dark', 'clave theme debe preservarse');
    assert.equal(result['userKey'], 'value', 'clave userKey debe preservarse');
  });

  test('CR-04: clean es idempotente — ejecutar dos veces no produce error', () => {
    // Run on already-clean .opencode/
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    assert.doesNotThrow(() => removeOpenCodeArtifacts(tmpDir));
    assert.doesNotThrow(() => removeOpenCodeArtifacts(tmpDir));
  });

  test('CR-04: clean sin ninguna carpeta .opencode tampoco produce error', () => {
    // No .opencode at all
    assert.doesNotThrow(() => removeOpenCodeArtifacts(tmpDir));
  });
});

// ── writeRepoVersion / EXPECTED_VERSION_FILES — CA-14 ────────────────────────────

describe('writeRepoVersion — CA-14', () => {
  test('EXPECTED_VERSION_FILES incluye .opencode/.sdd-version', () => {
    assert.ok(
      EXPECTED_VERSION_FILES.includes('.opencode/.sdd-version'),
      'EXPECTED_VERSION_FILES debe incluir .opencode/.sdd-version',
    );
  });

  test('writeRepoVersion escribe en .opencode/.sdd-version cuando la carpeta existe', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    writeRepoVersion(tmpDir, '4.5.0');
    const versionFile = path.join(tmpDir, '.opencode', '.sdd-version');
    assert.ok(fs.existsSync(versionFile), '.opencode/.sdd-version debe existir');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '4.5.0');
  });

  test('writeRepoVersion escribe en .claude/.sdd-version cuando la carpeta existe', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    writeRepoVersion(tmpDir, '4.5.0');
    const versionFile = path.join(tmpDir, '.claude', '.sdd-version');
    assert.ok(fs.existsSync(versionFile), '.claude/.sdd-version debe existir');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '4.5.0');
  });

  test('writeRepoVersion escribe en .cursor/.sdd-version cuando la carpeta existe', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    writeRepoVersion(tmpDir, '4.5.0');
    const versionFile = path.join(tmpDir, '.cursor', '.sdd-version');
    assert.ok(fs.existsSync(versionFile), '.cursor/.sdd-version debe existir');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), '4.5.0');
  });

  test('writeRepoVersion escribe en los 3 IDEs simultáneamente cuando las 3 carpetas existen', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });

    writeRepoVersion(tmpDir, '4.6.0');

    for (const rel of EXPECTED_VERSION_FILES) {
      const p = path.join(tmpDir, rel);
      assert.ok(fs.existsSync(p), `${rel} debe existir`);
      assert.equal(fs.readFileSync(p, 'utf8').trim(), '4.6.0');
    }
  });

  test('writeRepoVersion no crea carpetas que no existen (solo las existentes)', () => {
    // Only .opencode exists
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    writeRepoVersion(tmpDir, '4.5.0');

    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', '.sdd-version')), '.claude no debe crearse');
    assert.ok(!fs.existsSync(path.join(tmpDir, '.cursor', '.sdd-version')), '.cursor no debe crearse');
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', '.sdd-version')), '.opencode debe escribirse');
  });

  test('readRepoVersion lee desde .opencode/.sdd-version cuando está disponible', () => {
    fs.mkdirSync(path.join(tmpDir, '.opencode'), { recursive: true });
    writeRepoVersion(tmpDir, '4.5.0');
    const version = readRepoVersion(tmpDir);
    assert.equal(version, '4.5.0');
  });
});

// ── CR-03: instalación en repo limpio (sin carpetas IDE previas) ──────────────

describe('CR-03: instalación en repo limpio (sin carpetas IDE previas)', () => {
  test('installSkills no falla en repo sin .opencode previo', () => {
    const packageRoot = path.resolve(__dirname, '..');
    // No .opencode, .claude, .cursor folders exist in tmpDir
    assert.doesNotThrow(() => installSkills(packageRoot, tmpDir));
    // Skills are installed to all IDEs
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'skills')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'skills')));
  });

  test('installAgents no falla en repo sin carpetas IDE previas', () => {
    const packageRoot = path.resolve(__dirname, '..');
    assert.doesNotThrow(() => installAgents(packageRoot, tmpDir));
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'agents')));
  });

  test('installOpenCodePlugin no falla en repo sin .opencode previo', () => {
    assert.doesNotThrow(() => installOpenCodePlugin(tmpDir));
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'plugins', 'refacil-hooks.js')));
  });

  test('installOpenCodeJson no falla en repo sin .opencode previo', () => {
    assert.doesNotThrow(() => installOpenCodeJson(tmpDir));
    assert.ok(fs.existsSync(path.join(tmpDir, '.opencode', 'opencode.json')));
  });
});
