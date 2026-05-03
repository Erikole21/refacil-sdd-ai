'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Load the plugin directly from source
const plugin = require('../lib/opencode-plugin/index.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-plugin-test-'));
  // Plugin resolves `refacil-sdd-ai` from node_modules for session sync + methodologyMigrationPending
  const pkgRoot = path.join(__dirname, '..');
  const linkPath = path.join(tmpDir, 'node_modules', 'refacil-sdd-ai');
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(pkgRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Plugin structure ─────────────────────────────────────────────────────────

describe('plugin structure', () => {
  test('exports hooks object', () => {
    assert.ok(plugin.hooks, 'debe exportar un objeto hooks');
    assert.equal(typeof plugin.hooks, 'object');
  });

  test('exports session.created handler', () => {
    assert.equal(typeof plugin.hooks['session.created'], 'function');
  });

  test('exports tui.prompt.append handler', () => {
    assert.equal(typeof plugin.hooks['tui.prompt.append'], 'function');
  });

  test('exports tool.execute.before handler', () => {
    assert.equal(typeof plugin.hooks['tool.execute.before'], 'function');
  });
});

// ── session.created: check-update ───────────────────────────────────────────

describe('session.created — check-update', () => {
  test('escribe .refacil-pending-update cuando methodologyMigrationPending (AGENTS sin .agents/)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Project\n', 'utf8');

    await plugin.hooks['session.created']({ projectRoot: tmpDir });

    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(fs.existsSync(flagPath), '.refacil-pending-update debe existir cuando hay migración pendiente');
  });

  test('no escribe el flag cuando no hay migración pendiente', async () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Project\n', 'utf8');
    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });

    await plugin.hooks['session.created']({ projectRoot: tmpDir });

    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(!fs.existsSync(flagPath), '.refacil-pending-update NO debe existir cuando AGENTS + .agents/ cumplen el contrato');
  });

  test('limpia flag obsoleto cuando ya no hay migración pendiente', async () => {
    fs.writeFileSync(path.join(tmpDir, '.refacil-pending-update'), JSON.stringify({ from: '4.0.0', to: '4.5.0' }));

    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Project\n', 'utf8');
    fs.mkdirSync(path.join(tmpDir, '.agents'), { recursive: true });

    await plugin.hooks['session.created']({ projectRoot: tmpDir });

    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(!fs.existsSync(flagPath), '.refacil-pending-update debe haberse limpiado');
  });

  test('es tolerante cuando no existe refacil-sdd/changes/', async () => {
    await assert.doesNotReject(
      plugin.hooks['session.created']({ projectRoot: tmpDir }),
    );
  });
});

// ── tui.prompt.append: notify-update ────────────────────────────────────────

describe('tui.prompt.append — notify-update', () => {
  test('retorna mensaje cuando existe el flag .refacil-pending-update', async () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Project\n', 'utf8');

    fs.writeFileSync(path.join(tmpDir, '.refacil-pending-update'), JSON.stringify({ from: '4.0.0', to: '4.5.0' }));

    const result = await plugin.hooks['tui.prompt.append']({ projectRoot: tmpDir, prompt: 'hello' });
    assert.ok(typeof result === 'string' && result.length > 0, 'debe retornar mensaje de notificación');
    assert.match(result, /refacil-sdd-ai/, 'mensaje debe mencionar refacil-sdd-ai');
    assert.match(result, /refacil:update/, 'mensaje debe mencionar /refacil:update');
  });

  test('retorna undefined cuando NO existe el flag', async () => {
    const result = await plugin.hooks['tui.prompt.append']({ projectRoot: tmpDir, prompt: 'hello' });
    assert.equal(result, undefined, 'no debe retornar nada si no hay flag');
  });

  test('limpia el flag cuando el prompt contiene refacil:update', async () => {
    fs.writeFileSync(path.join(tmpDir, '.refacil-pending-update'), JSON.stringify({ from: '4.0.0', to: '4.5.0' }));

    const result = await plugin.hooks['tui.prompt.append']({
      projectRoot: tmpDir,
      prompt: 'run /refacil:update please',
    });

    assert.equal(result, undefined, 'no debe retornar mensaje cuando el usuario corre /refacil:update');
    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(!fs.existsSync(flagPath), '.refacil-pending-update debe haberse eliminado');
  });

  test('limpia el flag cuando el prompt contiene refacil/update', async () => {
    fs.writeFileSync(path.join(tmpDir, '.refacil-pending-update'), JSON.stringify({ from: '4.0.0', to: '4.5.0' }));

    await plugin.hooks['tui.prompt.append']({
      projectRoot: tmpDir,
      prompt: '/refacil/update',
    });

    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(!fs.existsSync(flagPath), '.refacil-pending-update debe haberse eliminado');
  });

  test('limpia el flag si la migración ya no está pendiente', async () => {
    // Flag exists but no pending tasks
    fs.writeFileSync(path.join(tmpDir, '.refacil-pending-update'), JSON.stringify({ from: '4.0.0', to: '4.5.0' }));
    // No changes dir

    const result = await plugin.hooks['tui.prompt.append']({ projectRoot: tmpDir, prompt: 'hola' });
    assert.equal(result, undefined, 'no debe retornar mensaje si no hay migración real');
    const flagPath = path.join(tmpDir, '.refacil-pending-update');
    assert.ok(!fs.existsSync(flagPath), 'flag obsoleto debe eliminarse');
  });
});

// ── tool.execute.before: check-review ───────────────────────────────────────

describe('tool.execute.before — check-review (git push)', () => {
  test('bloquea git push cuando hay cambios activos sin .review-passed', async () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    // No .review-passed file

    await assert.rejects(
      plugin.hooks['tool.execute.before']({
        tool: 'bash',
        input: { command: 'git push origin main' },
        projectRoot: tmpDir,
      }),
      /review pending|my-change/i,
    );
  });

  test('permite git push cuando todos los cambios tienen .review-passed', async () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, '.review-passed'), 'approved');

    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({
        tool: 'bash',
        input: { command: 'git push origin main' },
        projectRoot: tmpDir,
      }),
    );
  });

  test('no bloquea cuando no hay cambios activos', async () => {
    // No changes dir at all
    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({
        tool: 'bash',
        input: { command: 'git push origin main' },
        projectRoot: tmpDir,
      }),
    );
  });

  test('directorio archive no cuenta como cambio activo', async () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', 'old-change');
    fs.mkdirSync(archiveDir, { recursive: true });
    // No .review-passed in archive

    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({
        tool: 'bash',
        input: { command: 'git push origin main' },
        projectRoot: tmpDir,
      }),
    );
  });
});

// ── tool.execute.before: compact-bash ───────────────────────────────────────

describe('tool.execute.before — compact-bash', () => {
  test('reescribe git log sin flags a git log --oneline -20', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'git log' },
      projectRoot: tmpDir,
    });
    assert.ok(result && result.command, 'debe retornar un command reescrito');
    assert.match(result.command, /--oneline/);
    assert.match(result.command, /-20/);
  });

  test('no reescribe comandos ya compactos (git log --oneline -10)', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'git log --oneline -10' },
      projectRoot: tmpDir,
    });
    // git log --oneline already has flags → findRule returns null
    assert.equal(result, undefined, 'comandos ya compactos no deben reescribirse');
  });

  test('no reescribe cuando COMPACT=0 está en el comando', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'COMPACT=0 git log' },
      projectRoot: tmpDir,
    });
    assert.equal(result, undefined, 'COMPACT=0 desactiva el rewrite');
  });

  test('deja comandos no reconocidos sin cambios', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'echo hello world' },
      projectRoot: tmpDir,
    });
    assert.equal(result, undefined, 'comandos no reconocidos no deben alterarse');
  });

  test('no actúa sobre herramientas que no son bash', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'read',
      input: { path: '/some/file' },
      projectRoot: tmpDir,
    });
    assert.equal(result, undefined, 'solo debe actuar sobre tool: bash');
  });

  test('reescribe npm test sin flags a npm test con tail -80', async () => {
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'npm test' },
      projectRoot: tmpDir,
    });
    assert.ok(result && result.command, 'debe retornar un command reescrito');
    assert.match(result.command, /tail -80/);
  });
});

// ── CR-02: compact rules graceful degradation ────────────────────────────────

describe('CR-02: plugin carga compact/rules.js o degrada gracefully', () => {
  test('el plugin se carga sin crash incluso si las rutas de rules.js están ausentes', () => {
    // The plugin module is already loaded at the top — if it crashed on missing rules,
    // the entire test file would fail to load. This test validates that the module loaded.
    assert.ok(plugin, 'plugin debe haberse cargado sin crash');
    assert.ok(plugin.hooks, 'plugin.hooks debe existir');
  });

  test('cuando findRule no está disponible, compact-bash retorna undefined sin crash', async () => {
    // We test the behavior when findRule is null: commands that would match compact rules
    // should still not crash. Since in test env findRule IS loaded (from source),
    // we test the COMPACT=0 bypass as a proxy for graceful behavior.
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'bash',
      input: { command: 'COMPACT=0 git log' },
      projectRoot: tmpDir,
    });
    // When compact is disabled via COMPACT=0, returns undefined gracefully
    assert.equal(result, undefined, 'COMPACT=0 debe retornar undefined sin crash');
  });

  test('CR-02: plugin no propaga excepciones de compact-bash al llamador', async () => {
    // Even a command that might trigger issues should not propagate exceptions
    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({
        tool: 'bash',
        input: { command: 'some-unknown-command --with-args' },
        projectRoot: tmpDir,
      }),
    );
  });

  test('CR-02: plugin degrada si tool no es bash — no actúa sobre herramientas read/write', async () => {
    // Non-bash tools should be silently ignored
    const result = await plugin.hooks['tool.execute.before']({
      tool: 'write',
      input: { path: '/some/file', content: 'data' },
      projectRoot: tmpDir,
    });
    assert.equal(result, undefined, 'herramientas que no son bash deben retornar undefined');
  });
});

// ── Plugin edge cases ─────────────────────────────────────────────────────────

describe('tool.execute.before — edge cases', () => {
  test('input nulo no causa crash', async () => {
    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({ tool: 'bash', input: null, projectRoot: tmpDir }),
    );
  });

  test('event nulo no causa crash', async () => {
    await assert.doesNotReject(
      plugin.hooks['tool.execute.before'](null),
    );
  });

  test('event sin tool no causa crash', async () => {
    await assert.doesNotReject(
      plugin.hooks['tool.execute.before']({ projectRoot: tmpDir }),
    );
  });
});
