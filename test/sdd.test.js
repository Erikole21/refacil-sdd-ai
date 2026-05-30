'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Importar funciones puras exportadas (no dependen de projectRoot)
const { parseArgs, autoMigrateOpenspec, validateChangeName, resolveArchivedChangeName } = require('../lib/commands/sdd');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

/**
 * Invoca "node cli.js sdd <sub> [...args]" con cwd=tmpDir.
 * Retorna { status, stdout, stderr }.
 */
function runSdd(tmpDir, sub, args = []) {
  const result = spawnSync(node, [CLI, 'sdd', sub, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Invoca "node cli.js sdd" (sin subcomando) con cwd=tmpDir.
 */
function runSddBare(tmpDir, args = []) {
  const result = spawnSync(node, [CLI, 'sdd', ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── validateChangeName (función pura exportada) ──────────────────────────────

describe('validateChangeName — función pura', () => {
  test('CA-01: nombre válido my-feature-123 → valid: true', () => {
    const r = validateChangeName('my-feature-123');
    assert.equal(r.valid, true);
  });

  test('CA-01: nombre válido solo letras → valid: true', () => {
    const r = validateChangeName('myfeature');
    assert.equal(r.valid, true);
  });

  test('CA-02: nombre que inicia con dígito → valid: false', () => {
    const r = validateChangeName('1feature');
    assert.equal(r.valid, false);
    assert.ok(r.reason.length > 0);
  });

  test('CA-03: nombre con guión bajo → valid: false', () => {
    const r = validateChangeName('my_feature');
    assert.equal(r.valid, false);
    assert.ok(r.reason.length > 0);
  });

  test('CA-03: nombre con mayúscula → valid: false', () => {
    const r = validateChangeName('MyFeature');
    assert.equal(r.valid, false);
    assert.ok(r.reason.length > 0);
  });

  test('CR-01: nombre con / → valid: false', () => {
    const r = validateChangeName('../evil');
    assert.equal(r.valid, false);
    assert.ok(r.reason.length > 0);
  });

  test('CR-01: nombre con punto → valid: false', () => {
    const r = validateChangeName('my.feature');
    assert.equal(r.valid, false);
    assert.ok(r.reason.length > 0);
  });

  test('nombre vacío → valid: false', () => {
    const r = validateChangeName('');
    assert.equal(r.valid, false);
  });

  test('nombre undefined → valid: false', () => {
    const r = validateChangeName(undefined);
    assert.equal(r.valid, false);
  });
});

// ── autoMigrateOpenspec (función pura exportada) ─────────────────────────────

describe('autoMigrateOpenspec — función pura', () => {
  test('CA-05: migra openspec/ → refacil-sdd/ si refacil-sdd/ no existe', () => {
    fs.mkdirSync(path.join(tmpDir, 'openspec', 'changes'), { recursive: true });
    autoMigrateOpenspec(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'refacil-sdd')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });

  test('CR-08: no toca openspec/ si refacil-sdd/ ya existe', () => {
    fs.mkdirSync(path.join(tmpDir, 'openspec'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd'), { recursive: true });
    autoMigrateOpenspec(tmpDir);
    // Ambos deben seguir existiendo
    assert.ok(fs.existsSync(path.join(tmpDir, 'openspec')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'refacil-sdd')));
  });

  test('sin openspec/ y sin refacil-sdd/ → no crea nada', () => {
    assert.doesNotThrow(() => autoMigrateOpenspec(tmpDir));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'refacil-sdd')));
  });
});

// ── sdd validate-name (CLI) ──────────────────────────────────────────────────

describe('sdd validate-name — CLI', () => {
  test('CA-01: nombre válido → exit 0, sin stderr', () => {
    const r = runSdd(tmpDir, 'validate-name', ['my-feature-123']);
    assert.equal(r.status, 0);
    assert.equal(r.stderr.trim(), '');
  });

  test('CA-02: nombre con dígito inicial → exit 1, mensaje en stdout', () => {
    const r = runSdd(tmpDir, 'validate-name', ['1bad']);
    assert.equal(r.status, 1);
    assert.ok(r.stdout.trim().length > 0);
  });

  test('CA-03: nombre con guión bajo → exit 1, mensaje en stdout', () => {
    const r = runSdd(tmpDir, 'validate-name', ['bad_name']);
    assert.equal(r.status, 1);
    assert.ok(r.stdout.trim().length > 0);
  });

  test('CA-03: nombre con otros caracteres especiales → exit 1', () => {
    const r = runSdd(tmpDir, 'validate-name', ['bad@name']);
    assert.equal(r.status, 1);
    assert.ok(r.stdout.trim().length > 0);
  });
});

// ── sdd new-change (CLI) ─────────────────────────────────────────────────────

describe('sdd new-change — CLI', () => {
  test('CA-04: crea scaffold con 4 archivos con encabezado correcto → exit 0', () => {
    const r = runSdd(tmpDir, 'new-change', ['my-feature']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);

    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature');
    assert.ok(fs.existsSync(changeDir), 'El directorio del cambio debe existir');

    const artifacts = ['proposal', 'design', 'tasks', 'specs'];
    for (const artifact of artifacts) {
      const filePath = path.join(changeDir, `${artifact}.md`);
      assert.ok(fs.existsSync(filePath), `${artifact}.md debe existir`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        content.startsWith(`# ${artifact}: my-feature`),
        `${artifact}.md debe iniciar con "# ${artifact}: my-feature", obtuvo: "${content.slice(0, 50)}"`,
      );
    }
  });

  test('CA-05: auto-migra openspec/ → refacil-sdd/ silenciosamente', () => {
    // Crear openspec/ con un cambio existente
    fs.mkdirSync(path.join(tmpDir, 'openspec', 'changes', 'old-change'), { recursive: true });

    const r = runSdd(tmpDir, 'new-change', ['new-feature']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    // refacil-sdd/ debe existir (migrado desde openspec/)
    assert.ok(fs.existsSync(path.join(tmpDir, 'refacil-sdd')));
    // openspec/ ya no debe existir
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });

  test('CA-06: falla si el cambio ya existe → exit 1', () => {
    runSdd(tmpDir, 'new-change', ['my-feature']); // primera vez
    const r = runSdd(tmpDir, 'new-change', ['my-feature']); // segunda vez
    assert.equal(r.status, 1);
    assert.ok(r.stderr.trim().length > 0);
  });

  test('CR-01: rechaza nombre con ../ → exit 1, no crea directorios', () => {
    const r = runSdd(tmpDir, 'new-change', ['../evil']);
    assert.equal(r.status, 1);
    // No debe haber creado refacil-sdd/changes/../evil
    assert.ok(!fs.existsSync(path.join(tmpDir, 'evil')));
  });

  test('CR-01: rechaza nombre con barras → exit 1', () => {
    const r = runSdd(tmpDir, 'new-change', ['bad/name']);
    assert.equal(r.status, 1);
  });
});

// ── sdd archive (CLI) ────────────────────────────────────────────────────────

describe('sdd archive — CLI', () => {
  const MINIMAL_SPECS = '## CA-01: Archive test\n\n**Dado** x\n**Cuando** y\n**Entonces** z\n';

  function createChange(name) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    if (name.startsWith('fix-')) {
      fs.writeFileSync(path.join(changeDir, 'summary.md'), `# summary: ${name}\n`);
    } else {
      fs.writeFileSync(path.join(changeDir, 'proposal.md'), `# proposal: ${name}\n`);
      fs.writeFileSync(path.join(changeDir, 'specs.md'), MINIMAL_SPECS);
    }
    return changeDir;
  }

  test('CA-07: mueve cambio a archive/<YYYY-MM-DD>-<name>/ → exit 0', () => {
    createChange('my-feature');
    const r = runSdd(tmpDir, 'archive', ['my-feature']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);

    // Origen debe haber desaparecido
    const sourceDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature');
    assert.ok(!fs.existsSync(sourceDir), 'El origen debe desaparecer');

    // Destino debe existir con patrón YYYY-MM-DD-my-feature
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    assert.ok(fs.existsSync(archiveDir), 'El directorio archive debe existir');
    const entries = fs.readdirSync(archiveDir);
    const found = entries.find((e) => e.match(/^\d{4}-\d{2}-\d{2}-my-feature$/));
    assert.ok(found, `Debe existir un directorio con patrón YYYY-MM-DD-my-feature, encontrado: ${entries.join(', ')}`);
  });

  test('CA-07b: archive acepta nombre con mayúsculas y lo normaliza a minúsculas', () => {
    createChange('fix-seginf-20');
    const r = runSdd(tmpDir, 'archive', ['fix-SEGINF-20']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /omitiendo sincronización de spec/i);

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const found = entries.find((e) => e.match(/^\d{4}-\d{2}-\d{2}-fix-seginf-20$/));
    assert.ok(found, `Debe existir un directorio con patrón YYYY-MM-DD-fix-seginf-20, encontrado: ${entries.join(', ')}`);
  });

  test('CA-07c: archive preserves a minimal fix-* change with review, memory, and extra evidence', () => {
    const name = 'fix-fraud-detection-pay-user-block';
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    const summaryContent = '# Bug fix summary\n';
    const reviewContent = JSON.stringify({ verdict: 'approved', changeName: name, summary: 'ok', failCount: 0 });
    const memoryContent = 'lastStep: review\ncommandsRun: node --test test/sdd.test.js\n';
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'summary.md'), summaryContent);
    fs.writeFileSync(path.join(changeDir, '.review-passed'), reviewContent);
    fs.writeFileSync(path.join(changeDir, 'memory.yaml'), memoryContent);
    fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'evidence', 'notes.txt'), 'manual reproduction attached\n');

    const r = runSdd(tmpDir, 'archive', [name]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /omitiendo sincronización de spec/i);
    assert.ok(!fs.existsSync(changeDir), 'El origen debe desaparecer');

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const found = fs.readdirSync(archiveDir).find((e) => e.endsWith(`-${name}`));
    assert.ok(found, 'Debe existir carpeta archivada con fecha');
    const archivedDir = path.join(archiveDir, found);
    assert.equal(fs.readFileSync(path.join(archivedDir, 'summary.md'), 'utf8'), summaryContent);
    assert.equal(fs.readFileSync(path.join(archivedDir, '.review-passed'), 'utf8'), reviewContent);
    assert.equal(fs.readFileSync(path.join(archivedDir, 'memory.yaml'), 'utf8'), memoryContent);
    assert.equal(
      fs.readFileSync(path.join(archivedDir, 'evidence', 'notes.txt'), 'utf8'),
      'manual reproduction attached\n',
    );
  });

  test('CA-07d: archive succeeds for bare-minimum fix-* with only summary.md (no memory, no review)', () => {
    const name = 'fix-bare-minimum-only-summary';
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    const summaryContent = '# Bare minimum bug fix\n';
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'summary.md'), summaryContent);

    const r = runSdd(tmpDir, 'archive', [name]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /omitiendo sincronización de spec/i);
    assert.ok(!fs.existsSync(changeDir), 'The active fix folder must be moved away');

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const found = fs.readdirSync(archiveDir).find((e) => e.endsWith(`-${name}`));
    assert.ok(found, 'Archived folder must exist with date prefix');
    const archivedDir = path.join(archiveDir, found);

    // Destination must contain exactly what was in the source — only summary.md.
    assert.equal(fs.readFileSync(path.join(archivedDir, 'summary.md'), 'utf8'), summaryContent);
    const archivedEntries = fs.readdirSync(archivedDir);
    assert.deepEqual(archivedEntries, ['summary.md'], 'Archived folder must contain exactly summary.md and nothing else');
  });

  test('CR-fix-archive: existing archived fix-* destination is not overwritten and source remains', () => {
    const name = 'fix-existing-archive-target';
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'summary.md'), '# Current bug fix summary\n');

    // Use today's date to force a same-day collision with the destination the CLI would produce.
    const date = new Date().toISOString().slice(0, 10);
    const destDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', `${date}-${name}`);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'summary.md'), '# Existing archived summary\n');

    const r = runSdd(tmpDir, 'archive', [name]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Ya existe un archivo/);
    assert.ok(fs.existsSync(changeDir), 'The active source must remain when destination exists');
    assert.equal(
      fs.readFileSync(path.join(destDir, 'summary.md'), 'utf8'),
      '# Existing archived summary\n',
      'The archived destination must not be overwritten',
    );
  });

  test('CR-01: missing fix-* archive does not create active or partial archive folders', () => {
    const name = 'fix-missing-archive-source';
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });

    const r = runSdd(tmpDir, 'archive', [name]);

    assert.equal(r.status, 1);
    assert.ok(r.stderr.trim().length > 0);
    assert.ok(
      !fs.existsSync(path.join(tmpDir, 'refacil-sdd', 'changes', name)),
      'The missing active fix folder must not be created',
    );

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const archiveEntries = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : [];
    assert.ok(
      !archiveEntries.some((entry) => entry.endsWith(`-${name}`)),
      'The failed archive must not leave a partial archived folder',
    );
  });

  test('CR-03: fix-* without specs.md archives without creating synced specs', () => {
    const name = 'fix-without-specs-file';
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'summary.md'), '# Summary only bug fix\n');

    const r = runSdd(tmpDir, 'archive', [name]);

    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /omitiendo sincronización de spec/i);
    assert.ok(!fs.existsSync(changeDir), 'The active fix folder must be moved away');
    assert.ok(
      !fs.existsSync(path.join(tmpDir, 'refacil-sdd', 'specs', name)),
      'A specs sync target must not be created for a summary-only fix',
    );
  });

  test('CA-08: falla si el destino ya existe → exit 1', () => {
    createChange('my-feature');
    // Archivar la primera vez
    runSdd(tmpDir, 'archive', ['my-feature']);

    // Crear de nuevo el cambio y forzar que el destino exista
    createChange('my-feature');
    // El destino ya existe (del archive previo), debe fallar
    const r = runSdd(tmpDir, 'archive', ['my-feature']);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.trim().length > 0);
  });

  test('CA-09: post-condición — origen desaparece, destino existe', () => {
    createChange('my-change');
    runSdd(tmpDir, 'archive', ['my-change']);

    const sourceDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    assert.ok(!fs.existsSync(sourceDir), 'Origen debe desaparecer');

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const found = entries.find((e) => e.endsWith('-my-change'));
    assert.ok(found, 'Destino debe existir en archive');
    assert.ok(fs.existsSync(path.join(archiveDir, found)));
  });

  test('CR-02: falla si el cambio origen no existe → exit 1', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    const r = runSdd(tmpDir, 'archive', ['nonexistent']);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.trim().length > 0);
  });

  test('CA-20: archive también auto-migra openspec/ si aplica', () => {
    // Crear cambio bajo openspec/
    const oldChangeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-feature');
    fs.mkdirSync(oldChangeDir, { recursive: true });
    fs.writeFileSync(path.join(oldChangeDir, 'proposal.md'), '# proposal: legacy-feature\n');
    fs.writeFileSync(path.join(oldChangeDir, 'specs.md'), MINIMAL_SPECS);

    const r = runSdd(tmpDir, 'archive', ['legacy-feature']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    // openspec/ migrado a refacil-sdd/
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });
});

// ── sdd list (CLI) ───────────────────────────────────────────────────────────

describe('sdd list — CLI', () => {
  function createChanges(names) {
    for (const name of names) {
      const d = path.join(tmpDir, 'refacil-sdd', 'changes', name);
      fs.mkdirSync(d, { recursive: true });
    }
  }

  test('CA-10: muestra cambios activos con estado [reviewed]/[pending-review], excluye archive/', () => {
    createChanges(['feat-a', 'feat-b']);
    // feat-a tiene review
    fs.writeFileSync(
      path.join(tmpDir, 'refacil-sdd', 'changes', 'feat-a', '.review-passed'),
      JSON.stringify({ verdict: 'approved', changeName: 'feat-a', summary: 'ok', failCount: 0, preexistingCount: 0, blockers: false, date: new Date().toISOString() }),
    );
    // Crear un archive (no debe aparecer)
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', 'old'), { recursive: true });

    const r = runSdd(tmpDir, 'list', []);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('feat-a'), 'debe incluir feat-a');
    assert.ok(r.stdout.includes('feat-b'), 'debe incluir feat-b');
    assert.ok(r.stdout.includes('[reviewed]'), 'debe mostrar [reviewed]');
    assert.ok(r.stdout.includes('[pending-review]'), 'debe mostrar [pending-review]');
    assert.ok(!r.stdout.includes('old'), 'no debe incluir contenido del archive');
  });

  test('CA-11: --json retorna array JSON válido con { name, reviewPassed }', () => {
    createChanges(['feat-x', 'feat-y']);
    const r = runSdd(tmpDir, 'list', ['--json']);
    assert.equal(r.status, 0);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); }, 'Debe ser JSON válido');
    assert.ok(Array.isArray(parsed), 'Debe ser un array');
    assert.ok(parsed.length === 2, `Debe tener 2 elementos, tiene ${parsed.length}`);
    for (const item of parsed) {
      assert.ok('name' in item, 'Cada item debe tener name');
      assert.ok('reviewPassed' in item, 'Cada item debe tener reviewPassed');
    }
  });

  test('CR-09: list no incluye archive/ ni sus subdirectorios como cambios activos', () => {
    createChanges(['active-feat']);
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-01-01-old'), { recursive: true });

    const r = runSdd(tmpDir, 'list', ['--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    const names = parsed.map((i) => i.name);
    assert.ok(!names.includes('archive'), 'No debe incluir "archive" como cambio activo');
    assert.ok(names.includes('active-feat'), 'Debe incluir el cambio activo');
  });

  test('CA-20: list auto-migra openspec/ antes de listar', () => {
    const oldChangeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-change');
    fs.mkdirSync(oldChangeDir, { recursive: true });

    const r = runSdd(tmpDir, 'list', ['--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    const names = parsed.map((i) => i.name);
    assert.ok(names.includes('legacy-change'), 'Debe incluir el cambio migrado');
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')), 'openspec/ debe haber sido migrado');
  });
});

// ── sdd status (CLI) ─────────────────────────────────────────────────────────

describe('sdd status — CLI', () => {
  function createFullChange(name, opts = {}) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    if (opts.proposal !== false) fs.writeFileSync(path.join(changeDir, 'proposal.md'), `# proposal: ${name}\n`);
    if (opts.design !== false) fs.writeFileSync(path.join(changeDir, 'design.md'), `# design: ${name}\n`);
    if (opts.tasks !== false) {
      const tasksContent = opts.tasksContent || `# tasks: ${name}\n\n- [ ] Tarea 1\n- [x] Tarea 2\n`;
      fs.writeFileSync(path.join(changeDir, 'tasks.md'), tasksContent);
    }
    if (opts.specs !== false) fs.writeFileSync(path.join(changeDir, 'specs.md'), `# specs: ${name}\n`);
    if (opts.reviewed) {
      fs.writeFileSync(
        path.join(changeDir, '.review-passed'),
        JSON.stringify({ verdict: 'approved', changeName: name, summary: 'ok', failCount: 0, preexistingCount: 0, blockers: false, date: new Date().toISOString() }),
      );
    }
    return changeDir;
  }

  test('CA-12: --json retorna objeto con estructura completa', () => {
    createFullChange('my-change');
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); }, 'Debe ser JSON válido');
    assert.ok('name' in parsed, 'Debe tener name');
    assert.ok('artifacts' in parsed, 'Debe tener artifacts');
    assert.ok('tasks' in parsed, 'Debe tener tasks');
    assert.ok('reviewPassed' in parsed, 'Debe tener reviewPassed');
    assert.ok('ready' in parsed, 'Debe tener ready');
    assert.ok('proposal' in parsed.artifacts);
    assert.ok('design' in parsed.artifacts);
    assert.ok('tasks' in parsed.artifacts);
    assert.ok('specs' in parsed.artifacts);
    assert.ok('total' in parsed.tasks);
    assert.ok('done' in parsed.tasks);
    assert.ok('pending' in parsed.tasks);
    assert.ok('forApply' in parsed.ready);
    assert.ok('forArchive' in parsed.ready);
  });

  test('CA-13: ready.forApply es true si existen proposal, design, tasks y specs', () => {
    createFullChange('my-change');
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.ready.forApply, true);
  });

  test('CA-13b: ready.forApply es false si falta design o specs', () => {
    createFullChange('missing-design', { design: false });
    createFullChange('missing-specs', { specs: false });

    const missingDesign = JSON.parse(runSdd(tmpDir, 'status', ['missing-design', '--json']).stdout.trim());
    const missingSpecs = JSON.parse(runSdd(tmpDir, 'status', ['missing-specs', '--json']).stdout.trim());

    assert.equal(missingDesign.ready.forApply, false);
    assert.equal(missingSpecs.ready.forApply, false);
  });

  test('CA-13: ready.forApply es false si falta tasks', () => {
    createFullChange('my-change', { tasks: false });
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.ready.forApply, false);
  });

  test('CA-14: ready.forArchive es true si reviewPassed y todas las tasks son [x]', () => {
    createFullChange('my-change', {
      tasksContent: '# tasks: my-change\n\n- [x] Tarea 1\n- [x] Tarea 2\n',
      reviewed: true,
    });
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.ready.forArchive, true);
  });

  test('CA-14: ready.forArchive es false si hay tasks pendientes', () => {
    createFullChange('my-change', {
      tasksContent: '# tasks: my-change\n\n- [ ] Tarea 1\n- [x] Tarea 2\n',
      reviewed: true,
    });
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.ready.forArchive, false);
  });

  test('CA-15: artifacts.specs es true si existe specs/ como directorio con al menos un .md', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    fs.mkdirSync(path.join(changeDir, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: my-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: my-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: my-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'api.md'), '# api spec\n');

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, true, 'specs debe ser true cuando specs/ existe con .md');
    assert.equal(parsed.ready.forApply, true, 'ready.forApply debe aceptar specs/ con .md');
  });

  test('CA-15b: artifacts.specs es true con specs anidadas en specs/**/*.md', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'nested-specs-change');
    fs.mkdirSync(path.join(changeDir, 'specs', 'payments', 'pse'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: nested-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: nested-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: nested-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'payments', 'pse', 'flow.md'), '# nested spec\n');

    const r = runSdd(tmpDir, 'status', ['nested-specs-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, true, 'specs debe ser true con specs/**/*.md');
    assert.equal(parsed.ready.forApply, true, 'ready.forApply debe aceptar specs anidadas');
  });

  test('CA-15e: artifacts.specs remains true when specs.md and specs/**/*.md both exist', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'combined-specs-change');
    fs.mkdirSync(path.join(changeDir, 'specs', 'payments'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: combined-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: combined-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: combined-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '# root specs\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'payments', 'flow.md'), '# nested specs\n');

    const r = runSdd(tmpDir, 'status', ['combined-specs-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, true, 'specs debe ser true con specs.md y specs/**/*.md');
    assert.equal(parsed.ready.forApply, true, 'ready.forApply debe aceptar specs combinadas');
  });

  test('CR-15: artifacts.specs es false si specs/ existe pero está vacío', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'empty-specs-change');
    fs.mkdirSync(path.join(changeDir, 'specs', 'empty-child'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: empty-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: empty-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: empty-specs-change\n');

    const r = runSdd(tmpDir, 'status', ['empty-specs-change', '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, false, 'specs debe ser false con specs/ vacío');
    assert.equal(parsed.ready.forApply, false, 'ready.forApply debe requerir specs válidas');
  });

  test('CR-15c: artifacts.specs is false when specs/ contains only non-Markdown files', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'non-markdown-specs-change');
    fs.mkdirSync(path.join(changeDir, 'specs', 'payments'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: non-markdown-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: non-markdown-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: non-markdown-specs-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'payments', 'flow.txt'), '## CA-01: text spec\n');

    const r = runSdd(tmpDir, 'status', ['non-markdown-specs-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, false, 'specs must be false when specs/ has no .md files');
    assert.equal(parsed.ready.forApply, false, 'ready.forApply must reject non-Markdown specs');
  });

  test('CR-15d: artifacts.specs is false when root specs.md is empty', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'empty-root-spec-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: empty-root-spec-change\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: empty-root-spec-change\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: empty-root-spec-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '');

    const r = runSdd(tmpDir, 'status', ['empty-root-spec-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, false, 'specs must be false when specs.md is empty');
    assert.equal(parsed.ready.forApply, false, 'ready.forApply must reject empty specs.md');
  });

  test('CR-15b: status humano muestra specs FALTANTE y apply No con specs/ vacío', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'empty-specs-human');
    fs.mkdirSync(path.join(changeDir, 'specs', 'empty-child'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: empty-specs-human\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# design: empty-specs-human\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: empty-specs-human\n');

    const r = runSdd(tmpDir, 'status', ['empty-specs-human']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /specs\s+FALTANTE/, 'La salida humana debe marcar specs como FALTANTE');
    assert.match(r.stdout, /apply:\s+No/, 'La salida humana debe indicar apply: No');
  });

  test('CR-03: falla con exit 1 si el cambio no existe, no emite JSON inválido', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    const r = runSdd(tmpDir, 'status', ['nonexistent', '--json']);
    assert.equal(r.status, 1);
    // stdout no debe ser JSON válido (o debe estar vacío)
    let parsedOk = false;
    try { JSON.parse(r.stdout.trim()); parsedOk = true; } catch (_) {}
    // Si hay algo en stdout, no debe ser JSON válido de status
    if (parsedOk && r.stdout.trim().length > 0) {
      // Si parsea, no debe tener la estructura de status válida
      const obj = JSON.parse(r.stdout.trim());
      assert.ok(!obj.artifacts, 'No debe emitir JSON de status válido en caso de error');
    }
  });

  test('CA-20: status auto-migra openspec/ si aplica', () => {
    const oldChangeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-change');
    fs.mkdirSync(oldChangeDir, { recursive: true });
    fs.writeFileSync(path.join(oldChangeDir, 'proposal.md'), '# proposal: legacy-change\n');
    fs.writeFileSync(path.join(oldChangeDir, 'tasks.md'), '# tasks: legacy-change\n');

    const r = runSdd(tmpDir, 'status', ['legacy-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });

  test('CA-20b: status acepta nombre con mayúsculas y resuelve el change existente', () => {
    createFullChange('fix-seginf-20');
    const r = runSdd(tmpDir, 'status', ['fix-SEGINF-20', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.name, 'fix-seginf-20');
  });
});

// ── sdd mark-reviewed (CLI) ──────────────────────────────────────────────────

describe('sdd mark-reviewed — CLI', () => {
  function createChange(name) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    return changeDir;
  }

  test('CA-16: escribe .review-passed como JSON con todos los campos requeridos', () => {
    const changeDir = createChange('my-change');
    const r = runSdd(tmpDir, 'mark-reviewed', [
      'my-change', '--verdict', 'approved', '--summary', 'Todo ok',
      '--fail-count', '0', '--preexisting-count', '2', '--blockers',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);

    const reviewFile = path.join(changeDir, '.review-passed');
    assert.ok(fs.existsSync(reviewFile), '.review-passed debe existir');

    const parsed = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    assert.equal(parsed.verdict, 'approved');
    assert.equal(parsed.changeName, 'my-change');
    assert.equal(parsed.summary, 'Todo ok');
    assert.ok('failCount' in parsed);
    assert.ok('preexistingCount' in parsed);
    assert.ok('blockers' in parsed);
    assert.ok('date' in parsed);
  });

  test('CA-17: campo date es cadena ISO-8601 válida', () => {
    const changeDir = createChange('my-change');
    runSdd(tmpDir, 'mark-reviewed', ['my-change', '--verdict', 'approved', '--summary', 'ok']);

    const parsed = JSON.parse(fs.readFileSync(path.join(changeDir, '.review-passed'), 'utf8'));
    const d = new Date(parsed.date);
    assert.ok(!isNaN(d.getTime()), `date debe ser ISO-8601 válido, obtuvo: ${parsed.date}`);
    assert.ok(parsed.date.includes('T'), 'date debe tener componente de tiempo (ISO-8601)');
  });

  test('CR-10: sobreescribe .review-passed si ya existe (re-review permitido)', () => {
    const changeDir = createChange('my-change');
    runSdd(tmpDir, 'mark-reviewed', ['my-change', '--verdict', 'rejected', '--summary', 'Problemas']);
    runSdd(tmpDir, 'mark-reviewed', ['my-change', '--verdict', 'approved', '--summary', 'Corregido']);

    const parsed = JSON.parse(fs.readFileSync(path.join(changeDir, '.review-passed'), 'utf8'));
    assert.equal(parsed.verdict, 'approved', 'Debe sobreescribir con el nuevo verdict');
  });

  test('CR-04: falla si falta --verdict → exit 1', () => {
    createChange('my-change');
    const r = runSdd(tmpDir, 'mark-reviewed', ['my-change', '--summary', 'ok']);
    assert.equal(r.status, 1);
  });

  test('CR-05: falla si falta --summary → exit 1', () => {
    createChange('my-change');
    const r = runSdd(tmpDir, 'mark-reviewed', ['my-change', '--verdict', 'approved']);
    assert.equal(r.status, 1);
  });

  test('CA-20: mark-reviewed auto-migra openspec/ si aplica', () => {
    const oldChangeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-change');
    fs.mkdirSync(oldChangeDir, { recursive: true });

    const r = runSdd(tmpDir, 'mark-reviewed', [
      'legacy-change', '--verdict', 'approved', '--summary', 'ok migrado',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });
});

// ── sdd tasks-update (CLI) ───────────────────────────────────────────────────

describe('sdd tasks-update — CLI', () => {
  function createChangeWithTasks(name, tasksContent) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), tasksContent);
    return changeDir;
  }

  test('CA-18: marca la task N (1-indexed) de [ ] a [x]', () => {
    const changeDir = createChangeWithTasks(
      'my-change',
      '# tasks: my-change\n\n- [ ] Tarea 1\n- [ ] Tarea 2\n- [ ] Tarea 3\n',
    );
    const r = runSdd(tmpDir, 'tasks-update', ['my-change', '--task', '2', '--done']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);

    const content = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    const lines = content.split('\n').filter((l) => l.match(/^- \[/));
    assert.ok(lines[0].includes('- [ ]'), 'Tarea 1 debe seguir pendiente');
    assert.ok(lines[1].includes('- [x]'), 'Tarea 2 debe estar completada');
    assert.ok(lines[2].includes('- [ ]'), 'Tarea 3 debe seguir pendiente');
  });

  test('CA-19: es idempotente si la task ya está [x]', () => {
    const changeDir = createChangeWithTasks(
      'my-change',
      '# tasks: my-change\n\n- [x] Tarea 1\n- [ ] Tarea 2\n',
    );
    // Marcar la task 1 que ya está [x]
    const r = runSdd(tmpDir, 'tasks-update', ['my-change', '--task', '1', '--done']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const content = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    const lines = content.split('\n').filter((l) => l.match(/^- \[/));
    assert.ok(lines[0].includes('- [x]'), 'Tarea 1 debe seguir [x]');
    assert.ok(lines[1].includes('- [ ]'), 'Tarea 2 no debe haber cambiado');
  });

  test('CR-06: falla si falta --task → exit 1', () => {
    createChangeWithTasks('my-change', '# tasks\n\n- [ ] Tarea 1\n');
    const r = runSdd(tmpDir, 'tasks-update', ['my-change', '--done']);
    assert.equal(r.status, 1);
  });

  test('CR-06: falla si falta --done → exit 1', () => {
    createChangeWithTasks('my-change', '# tasks\n\n- [ ] Tarea 1\n');
    const r = runSdd(tmpDir, 'tasks-update', ['my-change', '--task', '1']);
    assert.equal(r.status, 1);
  });

  test('CR-07: falla si la task N no existe → exit 1, sin modificar archivo', () => {
    const changeDir = createChangeWithTasks(
      'my-change',
      '# tasks: my-change\n\n- [ ] Tarea 1\n',
    );
    const originalContent = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    const r = runSdd(tmpDir, 'tasks-update', ['my-change', '--task', '5', '--done']);
    assert.equal(r.status, 1, 'Debe fallar con exit 1');
    const newContent = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    assert.equal(newContent, originalContent, 'El archivo no debe haber sido modificado');
  });

  test('CA-20: tasks-update auto-migra openspec/ si aplica', () => {
    const oldChangeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-change');
    fs.mkdirSync(oldChangeDir, { recursive: true });
    fs.writeFileSync(path.join(oldChangeDir, 'tasks.md'), '# tasks\n\n- [ ] Tarea 1\n');

    const r = runSdd(tmpDir, 'tasks-update', ['legacy-change', '--task', '1', '--done']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'openspec')));
  });
});

// ── sdd sin subcomando o subcomando desconocido (CLI) ─────────────────────────

describe('sdd sin subcomando / subcomando desconocido — CLI', () => {
  test('CA-23: sin subcomando imprime ayuda y termina con exit 1', () => {
    const r = runSddBare(tmpDir, []);
    const output = r.stdout + r.stderr;
    assert.ok(
      output.includes('new-change') || output.includes('refacil-sdd-ai sdd'),
      `Debe imprimir ayuda con subcomandos. Output: "${output.slice(0, 200)}"`,
    );
    assert.equal(r.status, 1, 'Debe terminar con exit code 1');
  });

  test('CA-23: subcomando desconocido imprime ayuda y termina con exit 1', () => {
    const r = runSdd(tmpDir, 'unknown-subcmd', []);
    const output = r.stdout + r.stderr;
    assert.ok(
      output.includes('new-change') || output.includes('refacil-sdd-ai sdd'),
      `Debe imprimir ayuda. Output: "${output.slice(0, 200)}"`,
    );
    assert.equal(r.status, 1, 'Debe terminar con exit code 1');
  });
});

// ── sdd set-memory / get-memory (CLI) ────────────────────────────────────────

describe('sdd set-memory / get-memory — CLI', () => {
  function createChange(name) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    return changeDir;
  }

  test('CA-BUG2-01: set-memory crea memory.yaml con lastStep y touchedFiles', () => {
    const changeDir = createChange('my-change');
    const r = runSdd(tmpDir, 'set-memory', [
      'my-change',
      '--last-step', 'apply',
      '--touched-files', 'src/foo.ts,src/bar.ts',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const memPath = path.join(changeDir, 'memory.yaml');
    assert.ok(fs.existsSync(memPath), 'memory.yaml debe existir');
    const content = fs.readFileSync(memPath, 'utf8');
    assert.ok(content.includes('lastStep: apply'), 'Debe contener lastStep: apply');
    assert.ok(content.includes('src/foo.ts'), 'Debe contener src/foo.ts');
    assert.ok(content.includes('src/bar.ts'), 'Debe contener src/bar.ts');
  });

  test('CA-BUG2-02: set-memory fusiona sin borrar campos existentes', () => {
    const changeDir = createChange('my-change');
    // Primera escritura: apply
    runSdd(tmpDir, 'set-memory', ['my-change', '--last-step', 'apply', '--touched-files', 'src/foo.ts']);
    // Segunda escritura: test (agrega commandsRun, no borra touchedFiles)
    const r = runSdd(tmpDir, 'set-memory', ['my-change', '--last-step', 'test', '--commands-run', 'npm test']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const content = fs.readFileSync(path.join(changeDir, 'memory.yaml'), 'utf8');
    assert.ok(content.includes('lastStep: test'), 'lastStep debe actualizarse a test');
    assert.ok(content.includes('commandsRun: npm test'), 'commandsRun debe haberse añadido');
    assert.ok(content.includes('src/foo.ts'), 'touchedFiles debe preservarse');
  });

  test('CA-BUG2-03: get-memory --json retorna JSON válido con los campos guardados', () => {
    createChange('my-change');
    runSdd(tmpDir, 'set-memory', [
      'my-change',
      '--last-step', 'test',
      '--stack-detected', 'NestJS',
      '--criteria-run', 'CA-01,CR-01',
    ]);
    const r = runSdd(tmpDir, 'get-memory', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); }, 'Debe ser JSON válido');
    assert.equal(parsed.lastStep, 'test');
    assert.equal(parsed.stackDetected, 'NestJS');
    assert.ok(Array.isArray(parsed.criteriaRun), 'criteriaRun debe ser array');
    assert.ok(parsed.criteriaRun.includes('CA-01'));
  });

  test('CA-BUG2-04: get-memory --json retorna {} si memory.yaml no existe', () => {
    createChange('my-change');
    const r = runSdd(tmpDir, 'get-memory', ['my-change', '--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stdout.trim(), '{}');
  });

  test('CA-BUG2-05: set-review-fails crea .review-last-fails.json con failedFiles', () => {
    const changeDir = createChange('my-change');
    const r = runSdd(tmpDir, 'set-review-fails', ['my-change', '--files', 'src/a.ts,src/b.ts']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const filePath = path.join(changeDir, '.review-last-fails.json');
    assert.ok(fs.existsSync(filePath), '.review-last-fails.json debe existir');
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.ok(Array.isArray(parsed.failedFiles));
    assert.ok(parsed.failedFiles.includes('src/a.ts'));
    assert.ok(parsed.failedFiles.includes('src/b.ts'));
  });

  test('CA-BUG2-06: clear-review-fails elimina .review-last-fails.json si existe', () => {
    const changeDir = createChange('my-change');
    fs.writeFileSync(path.join(changeDir, '.review-last-fails.json'), JSON.stringify({ failedFiles: ['x.ts'] }));
    const r = runSdd(tmpDir, 'clear-review-fails', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(changeDir, '.review-last-fails.json')), 'Archivo debe haberse eliminado');
  });

  test('CA-BUG2-07: clear-review-fails termina con exit 0 si el archivo no existe', () => {
    createChange('my-change');
    const r = runSdd(tmpDir, 'clear-review-fails', ['my-change']);
    assert.equal(r.status, 0, 'Debe ser idempotente: exit 0 aunque no exista el archivo');
  });

  test('CA-BUG2-08: sdd archive preserva memory.yaml dentro del directorio archivado', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: my-change\n');
    fs.writeFileSync(
      path.join(changeDir, 'specs.md'),
      '## CA-01: Memory cleanup\n\n**Dado** x\n**Cuando** y\n**Entonces** z\n',
    );
    fs.writeFileSync(path.join(changeDir, 'memory.yaml'), 'lastStep: apply\n');

    const r = runSdd(tmpDir, 'archive', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    // Verify the archived folder CONTAINS memory.yaml (moved with the change)
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const archivedName = entries.find((e) => e.endsWith('-my-change'));
    assert.ok(archivedName, 'El cambio debe haberse archivado');
    const archivedMemory = path.join(archiveDir, archivedName, 'memory.yaml');
    assert.ok(fs.existsSync(archivedMemory), 'memory.yaml debe existir en el directorio archivado');
  });

  test('CA-BUG2-09: sdd help lista los nuevos subcomandos', () => {
    const r = runSddBare(tmpDir, []);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('set-memory'), 'Help debe mencionar set-memory');
    assert.ok(output.includes('get-memory'), 'Help debe mencionar get-memory');
    assert.ok(output.includes('set-review-fails'), 'Help debe mencionar set-review-fails');
    assert.ok(output.includes('clear-review-fails'), 'Help debe mencionar clear-review-fails');
  });

  test('CA-BUG2-10: set-memory con changeName inexistente retorna exit 1 y no crea archivo', () => {
    const r = runSdd(tmpDir, 'set-memory', ['nonexistent-change', '--last-step', 'apply']);
    assert.equal(r.status, 1, 'Debe fallar con exit 1 si el change no existe');
    const memPath = path.join(tmpDir, 'refacil-sdd', 'changes', 'nonexistent-change', 'memory.yaml');
    assert.ok(!fs.existsSync(memPath), 'No debe crear memory.yaml si el change no existe');
  });

  test('CA-BUG2-11: set-memory sin flags retorna exit 1', () => {
    createChange('my-change');
    const r = runSdd(tmpDir, 'set-memory', ['my-change']);
    assert.equal(r.status, 1, 'Debe fallar con exit 1 si no se provee ningún flag');
    assert.ok(r.stderr.includes('al menos un campo'), 'Debe indicar que se requiere al menos un campo');
  });

  test('CA-BUG2-12: set/get-memory aceptan nombre con mayúsculas (resolución case-insensitive)', () => {
    const changeDir = createChange('fix-seginf-20');
    const setResult = runSdd(tmpDir, 'set-memory', [
      'fix-SEGINF-20',
      '--last-step', 'apply',
    ]);
    assert.equal(setResult.status, 0, `stderr: ${setResult.stderr}\nstdout: ${setResult.stdout}`);

    const memPath = path.join(changeDir, 'memory.yaml');
    assert.ok(fs.existsSync(memPath), 'memory.yaml debe existir en el change real');

    const getResult = runSdd(tmpDir, 'get-memory', ['fix-SEGINF-20', '--json']);
    assert.equal(getResult.status, 0, `stderr: ${getResult.stderr}\nstdout: ${getResult.stdout}`);
    const parsed = JSON.parse(getResult.stdout.trim());
    assert.equal(parsed.lastStep, 'apply');
  });
});

// ── sdd config (CLI integration) ─────────────────────────────────────────────

describe('sdd config — CLI integration', () => {
  const GLOBAL_CONFIG_PATH = require('node:path').join(require('node:os').homedir(), '.refacil-sdd-ai', 'config.yaml');

  test('CA-CONFIG-01: exit 0 without --json; stdout contains protectedBranches and baseBranch lines', () => {
    const r = runSdd(tmpDir, 'config', []);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.ok(r.stdout.includes('protectedBranches'), 'stdout must contain "protectedBranches"');
    assert.ok(r.stdout.includes('baseBranch'), 'stdout must contain "baseBranch"');
  });

  test('CA-CONFIG-02: exit 0 with --json; stdout is valid JSON with protectedBranches and baseBranch', () => {
    const r = runSdd(tmpDir, 'config', ['--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); }, 'stdout must be valid JSON');
    assert.ok('protectedBranches' in parsed, 'JSON must have protectedBranches');
    assert.ok('baseBranch' in parsed, 'JSON must have baseBranch');
    assert.ok(Array.isArray(parsed.protectedBranches), 'protectedBranches must be an array');
    assert.equal(typeof parsed.baseBranch, 'string', 'baseBranch must be a string');
  });

  test('CA-CONFIG-03: --json output contains sources field with level indicators', () => {
    const r = runSdd(tmpDir, 'config', ['--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok('sources' in parsed, 'JSON output must include sources field');
    assert.ok(typeof parsed.sources === 'object' && parsed.sources !== null, 'sources must be an object');
    assert.ok('artifactLanguage' in parsed.sources, 'sources must include artifactLanguage level');
    assert.ok(['project', 'global', 'default'].includes(parsed.sources.artifactLanguage), `sources.artifactLanguage must be 'project', 'global', or 'default'. Got: ${parsed.sources.artifactLanguage}`);
  });

  test('CA-CONFIG-04: human-readable output contains source label in brackets', () => {
    const r = runSdd(tmpDir, 'config', []);
    assert.equal(r.status, 0);
    // Output must include [project], [global], or [default] label
    const hasLabel = r.stdout.includes('[project]') || r.stdout.includes('[global]') || r.stdout.includes('[default]');
    assert.ok(hasLabel, `Output must include a source label. Got: "${r.stdout}"`);
  });

  test('CA-CONFIG-05: project config overrides default — visible in --json output', () => {
    // Write a project config with custom values
    const sddDir = path.join(tmpDir, 'refacil-sdd');
    fs.mkdirSync(sddDir, { recursive: true });
    fs.writeFileSync(
      path.join(sddDir, 'config.yaml'),
      'protectedBranches:\n  - main\n  - staging\n  - production\nbaseBranch: main\n',
    );
    const r = runSdd(tmpDir, 'config', ['--json']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.deepEqual(parsed.protectedBranches, ['main', 'staging', 'production']);
    assert.equal(parsed.baseBranch, 'main');
  });

  test('CA-CONFIG-06: global config override visible in --json (using HOME env override)', () => {
    // Create a fake HOME directory with a global config
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-home-'));
    const fakeGlobalDir = path.join(fakeHome, '.refacil-sdd-ai');
    fs.mkdirSync(fakeGlobalDir, { recursive: true });
    fs.writeFileSync(
      path.join(fakeGlobalDir, 'config.yaml'),
      'protectedBranches:\n  - master\n  - release\nbaseBranch: develop\n',
    );

    // Run the CLI with overridden HOME so os.homedir() resolves to fakeHome
    const result = spawnSync(node, [CLI, 'sdd', 'config', '--json'], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
    });

    fs.rmSync(fakeHome, { recursive: true, force: true });

    assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
    const parsed = JSON.parse((result.stdout || '').trim());
    assert.deepEqual(parsed.protectedBranches, ['master', 'release']);
    assert.equal(parsed.baseBranch, 'develop');
  });

  test('CA-CONFIG-07: human-readable output shows [project] label when project config is used', () => {
    const sddDir = path.join(tmpDir, 'refacil-sdd');
    fs.mkdirSync(sddDir, { recursive: true });
    fs.writeFileSync(
      path.join(sddDir, 'config.yaml'),
      'protectedBranches:\n  - main\nbaseBranch: main\n',
    );
    const r = runSdd(tmpDir, 'config', []);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('[project]'), `Expected [project] label. Got: "${r.stdout}"`);
  });

  test('CA-CONFIG-08: sdd config works when cwd is a subdirectory (findProjectRoot traversal)', () => {
    // Create a project config at the root level
    const sddDir = path.join(tmpDir, 'refacil-sdd');
    fs.mkdirSync(sddDir, { recursive: true });
    fs.writeFileSync(
      path.join(sddDir, 'config.yaml'),
      'protectedBranches:\n  - main\n  - staging\nbaseBranch: main\n',
    );
    // Run from a nested subdirectory — findProjectRoot must traverse up
    const subDir = path.join(tmpDir, 'src', 'lib');
    fs.mkdirSync(subDir, { recursive: true });
    const result = spawnSync(node, [CLI, 'sdd', 'config', '--json'], {
      cwd: subDir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
    const parsed = JSON.parse((result.stdout || '').trim());
    assert.deepEqual(parsed.protectedBranches, ['main', 'staging']);
    assert.equal(parsed.baseBranch, 'main');
  });
});

// ── checkReview (CA-21, CA-22) — test de humo con filesystem ────────────────

describe('checkReview — lógica de path (CA-21, CA-22)', () => {
  // checkReview en cli.js lee stdin y verifica la ruta correcta en el filesystem.
  // Solo bloquea si hay implementación iniciada (≥1 task [x] en tasks.md) sin .review-passed.

  function seedChangeAwaitingReview(changeDir) {
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '# Tasks\n\n- [x] Implementación iniciada\n- [ ] Pendiente\n',
    );
  }

  function runCheckReview(tmpDir, changesLayout) {
    // Crear el layout en tmpDir
    for (const [dir, changes] of Object.entries(changesLayout)) {
      for (const change of changes) {
        fs.mkdirSync(path.join(tmpDir, dir, 'changes', change), { recursive: true });
      }
    }

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });
    return {
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  test('CA-21: checkReview usa refacil-sdd/changes/ cuando existe', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature');
    seedChangeAwaitingReview(changeDir);

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const parsed = JSON.parse((result.stdout || '').trim());
    assert.equal(parsed.decision, 'block');
    assert.match(parsed.reason, /my-feature/i);
    assert.match(parsed.reason, /Review pending/i);
  });

  test('CA-21b: no bloquea propuesta pura (tasks sin [x])', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-proposal');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] Solo pendiente\n');

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    assert.equal((result.stdout || '').trim(), '');
  });

  test('CA-22: checkReview hace fallback a openspec/changes/ si refacil-sdd/ no existe', () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-feature');
    seedChangeAwaitingReview(changeDir);

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const parsed = JSON.parse((result.stdout || '').trim());
    assert.equal(parsed.decision, 'block');
    assert.match(parsed.reason, /legacy-feature/i);
  });

  test('CA-22: checkReview no bloquea si no hay cambios directorio alguno', () => {
    // Sin refacil-sdd/ ni openspec/ → no bloquea
    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const output = result.stdout.trim();
    // No debe emitir block
    if (output.length > 0) {
      let parsed;
      try { parsed = JSON.parse(output); } catch (_) { parsed = null; }
      if (parsed) {
        assert.ok(parsed.decision !== 'block', 'No debe bloquear sin cambios');
      }
    }
    // exit 0 es lo esperado
    assert.equal(result.status, 0);
  });
});

// ── cmdStats — sdd stats (CLI) ────────────────────────────────────────────────

describe('cmdStats — sdd stats', () => {
  /**
   * Creates the minimal directory structure required by cmdStats.
   * proposal.md is required for mtime detection; other files are optional.
   */
  function createStatsChange(name, opts = {}) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });

    // proposal.md is the mtime anchor — always create it
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), `# proposal: ${name}\n`);

    if (opts.memory) {
      fs.writeFileSync(path.join(changeDir, 'memory.yaml'), opts.memory);
    }

    if (opts.review) {
      fs.writeFileSync(
        path.join(changeDir, '.review-passed'),
        JSON.stringify(opts.review),
      );
    }

    return changeDir;
  }

  // CA-12: non-existent change → exit 1, stderr contains error message
  test('CA-12: stats with non-existent change exits with exit code 1 and error message', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    const r = runSdd(tmpDir, 'stats', ['non-existent-change']);
    assert.equal(r.status, 1, 'exit code must be 1 for non-existent change');
    assert.ok(
      r.stderr.trim().length > 0,
      `stderr must contain an error message, got: "${r.stderr}"`,
    );
    assert.ok(
      r.stderr.includes('non-existent-change') || r.stderr.toLowerCase().includes('no existe') || r.stderr.toLowerCase().includes('not found'),
      `error message should reference the change name or describe absence. stderr: "${r.stderr}"`,
    );
  });

  // CA-09 / CR-05: existing change with no logs → exit 0, tabular output contains expected sections
  test('CA-09 / CR-05: stats with existing change but no logs returns exit 0 and tabular output', () => {
    createStatsChange('my-change');
    const r = runSdd(tmpDir, 'stats', ['my-change']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    // Tabular output must contain key section headers
    assert.ok(r.stdout.includes('my-change'), 'tabular output must include the change name');
    assert.ok(r.stdout.includes('Memory'), 'tabular output must include a Memory section');
    assert.ok(r.stdout.includes('Review'), 'tabular output must include a Review section');
    assert.ok(r.stdout.includes('lastStep') || r.stdout.includes('testCommand'), 'tabular output must include memory fields');
  });

  // CA-10: --json flag returns parseable JSON with expected fields
  test('CA-10: stats --json returns valid JSON with expected top-level fields', () => {
    createStatsChange('my-change');
    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);

    let parsed;
    assert.doesNotThrow(
      () => { parsed = JSON.parse(r.stdout.trim()); },
      `stdout must be valid JSON. Got: "${r.stdout.slice(0, 200)}"`,
    );

    // Verify all expected top-level fields are present
    assert.ok('changeName' in parsed, 'JSON must have changeName');
    assert.ok('startDate' in parsed, 'JSON must have startDate');
    assert.ok('memory' in parsed, 'JSON must have memory');
    assert.ok('review' in parsed, 'JSON must have review');
    assert.ok('compact' in parsed, 'JSON must have compact');
    assert.ok('codegraph' in parsed, 'JSON must have codegraph');

    // Verify memory sub-fields
    assert.ok('testCommand' in parsed.memory, 'memory must have testCommand');
    assert.ok('lastStep' in parsed.memory, 'memory must have lastStep');
    assert.ok('criteriaRun' in parsed.memory, 'memory must have criteriaRun');

    // Verify review sub-fields
    assert.ok('passed' in parsed.review, 'review must have passed');
    assert.ok('verdict' in parsed.review, 'review must have verdict');
    assert.ok('date' in parsed.review, 'review must have date');
    assert.ok('failCount' in parsed.review, 'review must have failCount');

    // changeName must match
    assert.equal(parsed.changeName, 'my-change', 'changeName must match input');
  });

  // CA-10: --json output contains no extra text (only JSON line)
  test('CA-10: --json stdout is parseable as a single JSON object with exit code 0', () => {
    createStatsChange('clean-change');
    const r = runSdd(tmpDir, 'stats', ['clean-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);

    // stdout must parse as JSON without wrapping/trimming tricks that would hide extra text
    const trimmed = r.stdout.trim();
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(trimmed); }, 'stdout must be valid JSON');
    assert.equal(typeof parsed, 'object', 'parsed JSON must be an object');
    assert.ok(!Array.isArray(parsed), 'parsed JSON must not be an array');
  });

  // CR-05: stats with memory.yaml data shows testCommand in output (both tabular and JSON)
  test('CR-05: stats with memory.yaml containing testCommand shows it in tabular output', () => {
    createStatsChange('mem-change', {
      memory: 'testCommand: npm test -- --grep mytest\nlastStep: test\ncriteriaRun:\n  - CA-09\n  - CA-10\n',
    });

    const r = runSdd(tmpDir, 'stats', ['mem-change']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('npm test') || r.stdout.includes('testCommand'),
      `tabular output must show testCommand value. stdout: "${r.stdout}"`,
    );
  });

  test('CR-05: stats with memory.yaml containing testCommand shows it in JSON output', () => {
    createStatsChange('mem-change-json', {
      memory: 'testCommand: npm test -- --grep mytest\nlastStep: test\n',
    });

    const r = runSdd(tmpDir, 'stats', ['mem-change-json', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    // testCommand or commandsRun key is used — check the returned value
    assert.ok(
      parsed.memory.testCommand !== null && parsed.memory.testCommand !== undefined,
      `memory.testCommand must be populated from memory.yaml. Got: ${JSON.stringify(parsed.memory)}`,
    );
  });

  // CR-05: stats with partial data (missing memory.yaml, missing .review-passed) returns exit 0
  test('CR-05: stats with no optional files (no memory.yaml, no .review-passed) returns exit 0', () => {
    createStatsChange('sparse-change'); // no memory, no review
    const r = runSdd(tmpDir, 'stats', ['sparse-change', '--json']);
    assert.equal(r.status, 0, `must not fail with partial data. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    // testCommand and lastStep should be null when memory.yaml is absent
    assert.equal(parsed.memory.testCommand, null, 'testCommand must be null when memory.yaml absent');
    assert.equal(parsed.memory.lastStep, null, 'lastStep must be null when memory.yaml absent');
    assert.equal(parsed.review.passed, false, 'review.passed must be false when .review-passed absent');
  });

  // CR-05: stats with .review-passed shows review data
  test('CR-05: stats with .review-passed shows review verdict and date in JSON output', () => {
    const reviewDate = new Date().toISOString();
    createStatsChange('reviewed-change', {
      review: {
        verdict: 'approved',
        changeName: 'reviewed-change',
        summary: 'All good',
        failCount: 0,
        preexistingCount: 0,
        blockers: false,
        date: reviewDate,
      },
    });

    const r = runSdd(tmpDir, 'stats', ['reviewed-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.review.passed, true, 'review.passed must be true when .review-passed exists');
    assert.equal(parsed.review.verdict, 'approved', 'review.verdict must match .review-passed content');
    assert.equal(parsed.review.date, reviewDate, 'review.date must match .review-passed content');
    assert.equal(parsed.review.failCount, 0, 'review.failCount must match .review-passed content');
  });

  // CR-04: stats does not invoke LLM — verified structurally by timing (< 2s) and no network calls
  test('CR-04: stats completes in under 2 seconds (no network/LLM calls)', () => {
    createStatsChange('fast-change');
    const start = Date.now();
    const r = runSdd(tmpDir, 'stats', ['fast-change', '--json']);
    const elapsed = Date.now() - start;
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(elapsed < 2000, `stats must complete in < 2s (no LLM calls). Took: ${elapsed}ms`);
  });

  // CR-04: structural check — cmdStats source does not contain LLM API endpoint patterns
  test('CR-04: cmdStats source does not contain LLM API call patterns', () => {
    const { cmdStats: cmdStatsExport } = require('../lib/commands/sdd');
    assert.equal(typeof cmdStatsExport, 'function', 'cmdStats must be exported');

    // Read the source of the function and verify it has no API call patterns
    const srcPath = path.resolve(__dirname, '..', 'lib', 'commands', 'sdd.js');
    const src = fs.readFileSync(srcPath, 'utf8');

    // Extract just the cmdStats function text for inspection (between its definition and the next function)
    const fnStart = src.indexOf('function cmdStats(');
    const fnEnd = src.indexOf('\nfunction ', fnStart + 1);
    const fnSrc = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src;

    // LLM API endpoint patterns that would indicate network calls
    const llmPatterns = [
      'anthropic.com',
      'openai.com',
      'api.anthropic',
      'api.openai',
      'fetch(',
      'axios.',
      'https.request',
      'http.request',
      'new Anthropic',
      'new OpenAI',
    ];

    for (const pattern of llmPatterns) {
      assert.ok(
        !fnSrc.includes(pattern),
        `cmdStats must not contain LLM/network pattern: "${pattern}"`,
      );
    }
  });

  // Missing arg (distinct from CA-12 non-existent change): no positional arg at all → exit 1, usage hint
  test('stats with no positional arg (no change name) exits 1 and shows usage hint', () => {
    // Ensure the changes dir exists so the failure is purely from missing rawName
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    const r = runSdd(tmpDir, 'stats', []); // no positional argument at all
    assert.equal(r.status, 1, 'exit code must be 1 when no change name is given');
    const combined = r.stderr + r.stdout;
    assert.ok(
      combined.includes('stats') || combined.includes('Uso') || combined.includes('usage'),
      `output must contain a usage hint. combined: "${combined.slice(0, 300)}"`,
    );
  });

  // CR-05: memory.yaml with commandsRun key (not testCommand) — aliased by implementation
  test('CR-05: memory.yaml with commandsRun key appears as testCommand in both tabular and JSON output', () => {
    createStatsChange('cmd-run-change', {
      memory: 'commandsRun: npm run test:unit\nlastStep: test\n',
    });

    // Tabular output
    const rTabular = runSdd(tmpDir, 'stats', ['cmd-run-change']);
    assert.equal(rTabular.status, 0, `tabular exit must be 0. stderr: ${rTabular.stderr}`);
    assert.ok(
      rTabular.stdout.includes('npm run test:unit') || rTabular.stdout.includes('testCommand'),
      `tabular output must show commandsRun value. stdout: "${rTabular.stdout}"`,
    );

    // JSON output
    const rJson = runSdd(tmpDir, 'stats', ['cmd-run-change', '--json']);
    assert.equal(rJson.status, 0, `json exit must be 0. stderr: ${rJson.stderr}`);
    const parsed = JSON.parse(rJson.stdout.trim());
    assert.equal(
      parsed.memory.testCommand,
      'npm run test:unit',
      `memory.testCommand must be populated from commandsRun alias. Got: ${JSON.stringify(parsed.memory)}`,
    );
  });

  // CR-05: .review-passed with non-zero failCount round-trips as a number
  test('CR-05: .review-passed with failCount: 2 appears as number 2 in JSON output', () => {
    createStatsChange('fail-count-change', {
      review: {
        verdict: 'approved',
        changeName: 'fail-count-change',
        summary: 'Had some failures',
        failCount: 2,
        preexistingCount: 0,
        blockers: false,
        date: new Date().toISOString(),
      },
    });

    const r = runSdd(tmpDir, 'stats', ['fail-count-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(typeof parsed.review.failCount, 'number', 'review.failCount must be a number');
    assert.equal(parsed.review.failCount, 2, 'review.failCount must round-trip as 2');
  });

  // CA-10 / CA-09: criteriaRun array in JSON output
  test('CA-10 / CA-09: criteriaRun in memory.yaml appears as an array in JSON output', () => {
    createStatsChange('criteria-change', {
      memory: 'criteriaRun:\n  - CA-09\n  - CA-10\nlastStep: test\n',
    });

    const r = runSdd(tmpDir, 'stats', ['criteria-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(Array.isArray(parsed.memory.criteriaRun), 'memory.criteriaRun must be an array');
    assert.ok(parsed.memory.criteriaRun.includes('CA-09'), 'criteriaRun must contain CA-09');
    assert.ok(parsed.memory.criteriaRun.includes('CA-10'), 'criteriaRun must contain CA-10');
    assert.equal(parsed.memory.criteriaRun.length, 2, 'criteriaRun must have exactly 2 elements');
  });

  // CR-04: structural contract — optional telemetry adapters expose readLog as function when present
  test('CR-04: telemetry adapters export readLog as function when modules are loadable', () => {
    try {
      const compactTelemetry = require('../lib/compact/telemetry');
      if ('readLog' in compactTelemetry) {
        assert.equal(typeof compactTelemetry.readLog, 'function', 'compact/telemetry.readLog must be a function');
      }
    } catch (_) { /* optional module — absence is acceptable */ }

    try {
      const cgTelemetry = require('../lib/codegraph-telemetry');
      if ('readLog' in cgTelemetry) {
        assert.equal(typeof cgTelemetry.readLog, 'function', 'codegraph-telemetry.readLog must be a function');
      }
    } catch (_) { /* optional module — absence is acceptable */ }
  });

  // CR-05: corrupt .review-passed (invalid JSON) → exit 0, no crash, review.passed false
  test('CR-05: corrupt .review-passed (invalid JSON) results in exit 0 and review.passed false in JSON', () => {
    const changeDir = createStatsChange('corrupt-review-change');
    // Write malformed JSON to .review-passed
    fs.writeFileSync(path.join(changeDir, '.review-passed'), 'not valid json{{{');

    const r = runSdd(tmpDir, 'stats', ['corrupt-review-change', '--json']);
    assert.equal(r.status, 0, `must not crash on corrupt .review-passed. stderr: ${r.stderr}`);
    let parsed;
    assert.doesNotThrow(
      () => { parsed = JSON.parse(r.stdout.trim()); },
      `stdout must still be valid JSON even with corrupt .review-passed. Got: "${r.stdout.slice(0, 200)}"`,
    );
    assert.ok('review' in parsed, 'JSON output must still have review field');
    assert.equal(parsed.review.passed, false, 'review.passed must be false when .review-passed is corrupt JSON');
  });

  // ── NEW: archived change support ─────────────────────────────────────────────

  // CA-01: cmdStats with archived change → exit 0, isArchived: true, archivedDate set
  test('CA-01 (archived): stats for an archived change exits 0 and returns isArchived: true', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-03-15-my-change');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# proposal: my-change\n');

    const r = runSdd(tmpDir, 'stats', ['my-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0 for archived change. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.isArchived, true, 'isArchived must be true for an archived change');
    assert.equal(parsed.archivedDate, '2024-03-15', 'archivedDate must match the date prefix');
    assert.equal(parsed.changeName, 'my-change', 'changeName must match the input');
  });

  // CA-02: archived change badge in tabular output
  test('CA-02 (archived): tabular output shows "Archivado" line for archived change', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-05-10-arched-change');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# proposal: arched-change\n');

    const r = runSdd(tmpDir, 'stats', ['arched-change']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('[archivado el 2024-05-10]'),
      `tabular output must include '[archivado el 2024-05-10]' badge. stdout: "${r.stdout}"`,
    );
  });

  // CA-03: archived change shows "(archivado)" instead of "(sin datos)" in memory fields
  test('CA-03 (archived): memory fields show "(archivado)" badge in tabular output when no memory.yaml', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-06-01-bare-change');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# proposal: bare-change\n');

    const r = runSdd(tmpDir, 'stats', ['bare-change']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('(archivado)'),
      `tabular output must show "(archivado)" for empty memory fields. stdout: "${r.stdout}"`,
    );
    assert.ok(
      !r.stdout.includes('(sin datos)'),
      `tabular output must NOT show "(sin datos)" for archived changes. stdout: "${r.stdout}"`,
    );
  });

  // CA-04: startDate from summary.md when proposal.md doesn't exist (bug fix archived changes)
  test('CA-04 (archived): startDate uses summary.md mtime when proposal.md is absent', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-07-20-fix-bug');
    fs.mkdirSync(archiveDir, { recursive: true });
    // Only summary.md, no proposal.md
    fs.writeFileSync(path.join(archiveDir, 'summary.md'), '# summary: fix-bug\n');

    const r = runSdd(tmpDir, 'stats', ['fix-bug', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(parsed.startDate !== null, 'startDate must be set from summary.md mtime');
    assert.equal(parsed.isArchived, true, 'must be recognized as archived');
  });

  // CA-05: most recent archived entry is returned when duplicates exist
  test('CA-05 (archived): most recent archived entry returned when multiple dates exist for same name', () => {
    const archive = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archive, '2024-01-01-dup-change'), { recursive: true });
    fs.mkdirSync(path.join(archive, '2024-06-15-dup-change'), { recursive: true });
    fs.writeFileSync(path.join(archive, '2024-01-01-dup-change', 'proposal.md'), '# old\n');
    fs.writeFileSync(path.join(archive, '2024-06-15-dup-change', 'proposal.md'), '# new\n');

    const r = runSdd(tmpDir, 'stats', ['dup-change', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.archivedDate, '2024-06-15', 'must return most recent archived entry');
  });

  // CR-04: active change takes priority over archived
  test('CR-04 (priority): active change takes priority over archived change with same name', () => {
    // Create active change
    const activeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'shared-name');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'proposal.md'), '# proposal: shared-name\n');
    // Also create archived entry
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-01-01-shared-name');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# old proposal\n');

    const r = runSdd(tmpDir, 'stats', ['shared-name', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.isArchived, false, 'active change must take priority over archived');
    assert.equal(parsed.archivedDate, null, 'archivedDate must be null for active change');
  });

  // CA-12: non-existent in both active and archive → exit 1 with clear message
  test('CA-12 (not found anywhere): stats for genuinely missing change exits 1 with clear message', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'archive'), { recursive: true });
    const r = runSdd(tmpDir, 'stats', ['truly-missing']);
    assert.equal(r.status, 1, 'exit code must be 1 for change absent in both active and archive');
    assert.ok(r.stderr.trim().length > 0, 'stderr must contain an error message');
  });

  // Improvement 2: archived change with memory.yaml — memory fields populate, isArchived: true
  test('archived change with memory.yaml populates memory fields and keeps isArchived true', () => {
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', '2024-09-01-mem-archived');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'proposal.md'), '# proposal: mem-archived\n');
    fs.writeFileSync(
      path.join(archiveDir, 'memory.yaml'),
      'lastStep: verify\ncriteriaRun:\n  - CA-01\n  - CA-02\ntestCommand: node --test test/sdd.test.js\n',
    );

    const r = runSdd(tmpDir, 'stats', ['mem-archived', '--json']);
    assert.equal(r.status, 0, `exit code must be 0 for archived change with memory. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());

    // Must still be recognized as archived
    assert.equal(parsed.isArchived, true, 'isArchived must be true');
    assert.equal(parsed.archivedDate, '2024-09-01', 'archivedDate must match date prefix');

    // Memory fields must be populated from memory.yaml (not shown as placeholder)
    assert.equal(parsed.memory.lastStep, 'verify', 'memory.lastStep must be populated from memory.yaml');
    assert.equal(
      parsed.memory.testCommand,
      'node --test test/sdd.test.js',
      'memory.testCommand must be populated from memory.yaml',
    );
    assert.ok(Array.isArray(parsed.memory.criteriaRun), 'memory.criteriaRun must be an array');
    assert.ok(parsed.memory.criteriaRun.includes('CA-01'), 'criteriaRun must contain CA-01');
    assert.ok(parsed.memory.criteriaRun.includes('CA-02'), 'criteriaRun must contain CA-02');
  });

  // CA-09: tabular output with complete data shows all expected header/field labels
  test('CA-09: tabular output includes all expected section headers and field labels', () => {
    const reviewDate = new Date().toISOString();
    createStatsChange('full-change', {
      memory: 'testCommand: npm test\nlastStep: review\ncriteriaRun:\n  - CA-09\n  - CA-10\n',
      review: {
        verdict: 'approved',
        changeName: 'full-change',
        summary: 'Looks great',
        failCount: 1,
        preexistingCount: 0,
        blockers: false,
        date: reviewDate,
      },
    });

    const r = runSdd(tmpDir, 'stats', ['full-change']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);

    // Section headers
    assert.ok(r.stdout.includes('Memory'), 'tabular output must include Memory section');
    assert.ok(r.stdout.includes('Review'), 'tabular output must include Review section');
    assert.ok(r.stdout.includes('Compact') || r.stdout.includes('compact'), 'tabular output must include compact telemetry section');

    // Field labels
    assert.ok(r.stdout.includes('lastStep'), 'tabular output must include lastStep field');
    assert.ok(r.stdout.includes('testCommand'), 'tabular output must include testCommand field');
    assert.ok(r.stdout.includes('criteriaRun'), 'tabular output must include criteriaRun field');
    assert.ok(r.stdout.includes('passed'), 'tabular output must include review passed field');

    // Values
    assert.ok(r.stdout.includes('npm test'), 'tabular output must show testCommand value');
    assert.ok(r.stdout.includes('full-change'), 'tabular output must include the change name');
  });

  // CR-04: active change with no memory.yaml → tabular shows "(sin datos)", NOT "(archivado)"
  test('CR-04: active change with no memory.yaml shows (sin datos) and not (archivado) in tabular output', () => {
    // Active change — no memory.yaml written
    createStatsChange('active-no-mem'); // createStatsChange without opts.memory leaves no memory.yaml

    const r = runSdd(tmpDir, 'stats', ['active-no-mem']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('(sin datos)'),
      `tabular output must show "(sin datos)" for active change with no memory.yaml. stdout: "${r.stdout}"`,
    );
    assert.ok(
      !r.stdout.includes('(archivado)'),
      `tabular output must NOT show "(archivado)" for an active (non-archived) change. stdout: "${r.stdout}"`,
    );
  });

  // CR-01: CLI exits 1 and stderr contains change name when archive has ambiguous entries
  test('CR-01: sdd stats exits 1 with stderr containing name when archive entries are ambiguous', () => {
    // Two archive entries whose names both end with "-cambio", making "cambio" ambiguous:
    // "feat-cambio" ends with "-cambio" AND "fix-cambio" ends with "-cambio"
    const archive = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archive, '2026-04-01-feat-cambio'), { recursive: true });
    fs.mkdirSync(path.join(archive, '2026-04-01-fix-cambio'), { recursive: true });
    fs.writeFileSync(path.join(archive, '2026-04-01-feat-cambio', 'proposal.md'), '# proposal: feat-cambio\n');
    fs.writeFileSync(path.join(archive, '2026-04-01-fix-cambio', 'proposal.md'), '# proposal: fix-cambio\n');
    // Ensure no active change named "cambio" exists
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });

    const r = runSdd(tmpDir, 'stats', ['cambio']);
    assert.equal(r.status, 1, `exit code must be 1 for ambiguous archived name. stderr: "${r.stderr}"`);
    assert.ok(
      r.stderr.trim().length > 0,
      'stderr must be non-empty when archive name is ambiguous',
    );
    assert.ok(
      r.stderr.includes('cambio'),
      `stderr must contain the searched name "cambio". Got: "${r.stderr}"`,
    );
  });
});

// ── resolveArchivedChangeName — pure function unit tests ──────────────────────

describe('resolveArchivedChangeName — pure function', () => {
  // CR-05: returns most recent when multiple archived dates exist for same name
  test('CR-05: returns most recent archived path when multiple dates exist for same name', () => {
    const archiveBase = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archiveBase, '2024-01-01-my-feature'), { recursive: true });
    fs.mkdirSync(path.join(archiveBase, '2024-08-20-my-feature'), { recursive: true });
    fs.mkdirSync(path.join(archiveBase, '2023-12-31-my-feature'), { recursive: true });

    const result = resolveArchivedChangeName(tmpDir, 'my-feature');
    assert.ok(result !== null, 'must return a path');
    assert.ok(result.includes('2024-08-20-my-feature'), `must return most recent (2024-08-20). Got: ${result}`);
  });

  // CR-01: ambiguous name (two distinct names both match) → returns null
  test('CR-01: returns null for ambiguous name (two distinct clean names match suffix)', () => {
    // This cannot happen with exact suffix matching — but verify robustness:
    // "-my-feature" can only match entries ending in "-my-feature", not "-other-my-feature" unless
    // we deliberately create one. This test validates that only exact suffix matching is applied.
    const archiveBase = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archiveBase, '2024-01-01-my-feature'), { recursive: true });
    // "other-my-feature" ends with "-my-feature" — this IS a match, making it ambiguous
    fs.mkdirSync(path.join(archiveBase, '2024-02-01-other-my-feature'), { recursive: true });

    const result = resolveArchivedChangeName(tmpDir, 'my-feature');
    assert.equal(result, null, 'must return null when name is ambiguous (multiple distinct clean names match)');
  });

  // CR-05: ignores entries without valid YYYY-MM-DD prefix
  test('CR-05: ignores archive entries without valid YYYY-MM-DD- prefix', () => {
    const archiveBase = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archiveBase, 'no-date-prefix-my-feature'), { recursive: true });
    fs.mkdirSync(path.join(archiveBase, '2024-03-10-my-feature'), { recursive: true });

    const result = resolveArchivedChangeName(tmpDir, 'my-feature');
    assert.ok(result !== null, 'must still find the valid dated entry');
    assert.ok(result.includes('2024-03-10-my-feature'), 'must return the valid dated entry');
  });

  // Returns null when archive dir doesn't exist
  test('returns null when archive directory does not exist', () => {
    // No archive dir created
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
    const result = resolveArchivedChangeName(tmpDir, 'my-feature');
    assert.equal(result, null, 'must return null when archive dir is absent');
  });

  // Improvement 1: returns null (not throws) when entire refacil-sdd/ path is absent
  test('returns null when the entire refacil-sdd/changes/archive/ path does not exist', () => {
    // tmpDir has no refacil-sdd/ directory at all
    assert.doesNotThrow(
      () => {
        const result = resolveArchivedChangeName(tmpDir, 'my-feature');
        assert.equal(result, null, 'must return null when refacil-sdd/ is entirely absent');
      },
      'must not throw when the entire refacil-sdd/ tree is missing',
    );
  });

  // Improvement 5: returns null (not throws) when name is null or empty string
  test('returns null when name argument is null', () => {
    assert.doesNotThrow(
      () => {
        const result = resolveArchivedChangeName(tmpDir, null);
        assert.equal(result, null, 'must return null for null name');
      },
      'must not throw when name is null',
    );
  });

  test('returns null when name argument is empty string', () => {
    assert.doesNotThrow(
      () => {
        const result = resolveArchivedChangeName(tmpDir, '');
        assert.equal(result, null, 'must return null for empty string name');
      },
      'must not throw when name is empty string',
    );
  });

  // Returns null when no match found
  test('returns null when no archived entry matches the name', () => {
    const archiveBase = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    fs.mkdirSync(path.join(archiveBase, '2024-01-01-other-change'), { recursive: true });

    const result = resolveArchivedChangeName(tmpDir, 'my-feature');
    assert.equal(result, null, 'must return null when no match exists');
  });
});

// ── sdd list --include-archived (CLI) ────────────────────────────────────────

describe('sdd list --include-archived — CLI', () => {
  function createActiveChange(name) {
    const d = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  function createArchivedChange(name, date = '2024-05-01') {
    const d = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive', `${date}-${name}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  // CA-06: tabular output shows [archived] badge for archived entries
  test('CA-06: tabular output shows [archived] badge for archived entries', () => {
    createActiveChange('active-feat');
    createArchivedChange('old-feat', '2024-03-10');

    const r = runSdd(tmpDir, 'list', ['--include-archived']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('[archived]'), 'tabular output must include [archived] badge');
    assert.ok(r.stdout.includes('old-feat'), 'must include archived change name');
    assert.ok(r.stdout.includes('active-feat'), 'must include active change');
  });

  // CA-07: JSON output has correct fields for archived entries
  test('CA-07: JSON output includes archived entries with correct fields when --include-archived', () => {
    createActiveChange('active-feat');
    createArchivedChange('old-feat', '2024-04-20');

    const r = runSdd(tmpDir, 'list', ['--include-archived', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(Array.isArray(parsed), 'must be an array');

    const active = parsed.find((i) => i.name === 'active-feat');
    assert.ok(active, 'must include active change');
    assert.ok('reviewPassed' in active, 'active entry must have reviewPassed');
    assert.ok(!active.archived, 'active entry must not be marked archived');

    const archived = parsed.find((i) => i.name === 'old-feat');
    assert.ok(archived, 'must include archived entry');
    assert.equal(archived.archived, true, 'archived entry must have archived: true');
    assert.equal(archived.archivedDate, '2024-04-20', 'archived entry must have correct archivedDate');
    assert.equal(archived.reviewPassed, null, 'archived entry reviewPassed must be null');
  });

  // CA-11: without --include-archived flag, behavior is identical to current (no archived entries)
  test('CA-11: without --include-archived flag, archived entries are not shown in JSON', () => {
    createActiveChange('active-feat');
    createArchivedChange('old-feat', '2024-01-15');

    const r = runSdd(tmpDir, 'list', ['--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    const archivedEntry = parsed.find((i) => i.name === 'old-feat');
    assert.equal(archivedEntry, undefined, 'archived entry must not appear without --include-archived');
    assert.equal(parsed.length, 1, 'only active changes must be listed');
  });

  // CA-11: without --include-archived flag, tabular shows no [archived] badge
  test('CA-11: without --include-archived flag, tabular output shows no [archived] badge', () => {
    createActiveChange('active-feat');
    createArchivedChange('old-feat', '2024-01-15');

    const r = runSdd(tmpDir, 'list', []);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    assert.ok(!r.stdout.includes('[archived]'), 'tabular must not show [archived] without the flag');
    assert.ok(!r.stdout.includes('old-feat'), 'archived change must not appear without the flag');
  });

  // CR-02: --include-archived with empty archive directory → exit 0, no crash
  test('CR-02: --include-archived with empty archive directory exits 0 gracefully', () => {
    createActiveChange('active-feat');
    // Create archive dir but leave it empty
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'archive'), { recursive: true });

    const r = runSdd(tmpDir, 'list', ['--include-archived', '--json']);
    assert.equal(r.status, 0, `exit code must be 0 with empty archive. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    const archivedEntries = parsed.filter((i) => i.archived === true);
    assert.equal(archivedEntries.length, 0, 'no archived entries expected from empty archive dir');
  });

  // CR-03: --include-archived when archive directory doesn't exist → exit 0 gracefully
  test('CR-03: --include-archived when archive directory is absent exits 0 gracefully', () => {
    createActiveChange('active-feat');
    // No archive dir created

    const r = runSdd(tmpDir, 'list', ['--include-archived', '--json']);
    assert.equal(r.status, 0, `exit code must be 0 when archive dir absent. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    const archivedEntries = parsed.filter((i) => i.archived === true);
    assert.equal(archivedEntries.length, 0, 'no archived entries expected when archive dir is absent');
  });

  // Improvement 3: archived entries in JSON output are sorted descending by archivedDate
  test('archived entries in JSON output are sorted descending by archivedDate', () => {
    createActiveChange('active-feat');
    createArchivedChange('feat-a', '2024-01-10');
    createArchivedChange('feat-b', '2024-06-20');
    createArchivedChange('feat-c', '2023-11-05');

    const r = runSdd(tmpDir, 'list', ['--include-archived', '--json']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout.trim());
    const archivedEntries = parsed.filter((i) => i.archived === true);
    assert.equal(archivedEntries.length, 3, 'must have 3 archived entries');

    // Dates must be in descending order
    const dates = archivedEntries.map((i) => i.archivedDate);
    const sortedDesc = [...dates].sort((a, b) => b.localeCompare(a));
    assert.deepEqual(dates, sortedDesc, `archived entries must be sorted descending by date. Got: ${JSON.stringify(dates)}`);
  });

  // Improvement 3: tabular output archived entries also appear in descending date order
  test('tabular output archived entries appear in descending date order', () => {
    createActiveChange('active-feat');
    createArchivedChange('feat-old', '2023-03-01');
    createArchivedChange('feat-new', '2024-12-31');

    const r = runSdd(tmpDir, 'list', ['--include-archived']);
    assert.equal(r.status, 0, `exit code must be 0. stderr: ${r.stderr}`);
    const oldIdx = r.stdout.indexOf('feat-old');
    const newIdx = r.stdout.indexOf('feat-new');
    assert.ok(oldIdx > -1, 'feat-old must appear in output');
    assert.ok(newIdx > -1, 'feat-new must appear in output');
    assert.ok(newIdx < oldIdx, 'most recent (feat-new/2024-12-31) must appear before older (feat-old/2023-03-01)');
  });

  // Improvement 4: help text documents --include-archived flag
  test('help text documents --include-archived in sdd list usage', () => {
    const r = runSddBare(tmpDir, []);
    const output = r.stdout + r.stderr;
    assert.ok(
      output.includes('--include-archived'),
      `help text must document --include-archived flag. Got: "${output.slice(0, 500)}"`,
    );
  });

  // CA-06: zero active changes + non-empty archive → archived entries shown with [archived] badge, exit 0
  test('CA-06: zero active changes with archived entries shows [archived] badge and exits 0', () => {
    // No active changes created — archive only
    createArchivedChange('past-feat', '2024-11-20');
    createArchivedChange('past-fix', '2024-09-05');

    const r = runSdd(tmpDir, 'list', ['--include-archived']);
    assert.equal(r.status, 0, `exit code must be 0 even with zero active changes. stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('[archived]'), 'tabular output must include [archived] badge when archive has entries');
    assert.ok(r.stdout.includes('past-feat'), 'must include first archived change name');
    assert.ok(r.stdout.includes('past-fix'), 'must include second archived change name');
  });
});
