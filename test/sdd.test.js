'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Importar funciones puras exportadas (no dependen de projectRoot)
const { parseArgs, autoMigrateOpenspec, validateChangeName } = require('../lib/commands/sdd');

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
  function createChange(name) {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), `# proposal: ${name}\n`);
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

    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const found = entries.find((e) => e.match(/^\d{4}-\d{2}-\d{2}-fix-seginf-20$/));
    assert.ok(found, `Debe existir un directorio con patrón YYYY-MM-DD-fix-seginf-20, encontrado: ${entries.join(', ')}`);
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

  test('CA-13: ready.forApply es true si hay proposal + tasks', () => {
    createFullChange('my-change', { design: false, specs: false });
    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.ready.forApply, true);
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
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# tasks: my-change\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'api.md'), '# api spec\n');

    const r = runSdd(tmpDir, 'status', ['my-change', '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.artifacts.specs, true, 'specs debe ser true cuando specs/ existe con .md');
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

  test('CA-BUG2-08: sdd archive elimina memory.yaml automáticamente', () => {
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# proposal: my-change\n');
    fs.writeFileSync(path.join(changeDir, 'memory.yaml'), 'lastStep: apply\n');

    const r = runSdd(tmpDir, 'archive', ['my-change']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    // Verify the archived folder does NOT contain memory.yaml
    const archiveDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'archive');
    const entries = fs.readdirSync(archiveDir);
    const archivedName = entries.find((e) => e.endsWith('-my-change'));
    assert.ok(archivedName, 'El cambio debe haberse archivado');
    const archivedMemory = path.join(archiveDir, archivedName, 'memory.yaml');
    assert.ok(!fs.existsSync(archivedMemory), 'memory.yaml no debe existir en el archivo');
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
  // Para testear la lógica de selección de ruta, invocamos directamente via spawnSync
  // simulando el input JSON de un git push hook.

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
    // Crear refacil-sdd/ sin .review-passed → debe bloquear
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature');
    fs.mkdirSync(changeDir, { recursive: true });

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    // Debe emitir block o al menos mencionar review pendiente
    const output = result.stdout + result.stderr;
    const blocked = output.includes('block') || output.includes('Review pendiente') || output.includes('review');
    assert.ok(blocked, `Debe bloquear cuando hay cambio sin review. Output: "${output.slice(0, 300)}"`);
  });

  test('CA-22: checkReview hace fallback a openspec/changes/ si refacil-sdd/ no existe', () => {
    // Solo existe openspec/changes/ sin .review-passed → debe bloquear
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'legacy-feature');
    fs.mkdirSync(changeDir, { recursive: true });

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const output = result.stdout + result.stderr;
    const blocked = output.includes('block') || output.includes('review');
    assert.ok(blocked, `Debe bloquear usando openspec/ como fallback. Output: "${output.slice(0, 300)}"`);
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
