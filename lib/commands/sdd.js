'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadBranchConfigWithSources, parseYaml, readConfigFile } = require('../config');

function findProjectRoot() {
  let dir = process.cwd();
  const { root } = path.parse(dir);
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'refacil-sdd')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// --- Helpers ---

function parseArgs(argv) {
  const args = { _positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (!token.startsWith('--')) {
      args._positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function validateChangeName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, reason: 'El nombre del cambio no puede estar vacío.' };
  }
  if (/[A-Z]/.test(name[0])) {
    return { valid: false, reason: 'El nombre no puede empezar con mayúscula. Usa solo minúsculas, números y guiones.' };
  }
  if (/^[0-9]/.test(name)) {
    return { valid: false, reason: 'El nombre no puede empezar con un número. Debe comenzar con una letra minúscula.' };
  }
  if (name.includes('_')) {
    return { valid: false, reason: 'El nombre no puede contener guiones bajos (_). Usa guiones medios (-).' };
  }
  if (name.includes('/') || name.includes('.')) {
    return { valid: false, reason: 'El nombre no puede contener / ni . (puntos). Usa solo letras, números y guiones medios.' };
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return { valid: false, reason: 'El nombre solo puede contener letras minúsculas, números y guiones medios, y debe comenzar con una letra minúscula.' };
  }
  return { valid: true };
}

function resolveExistingChangeName(projectRoot, inputName) {
  if (!inputName || typeof inputName !== 'string') {
    return { ok: false, reason: 'El nombre del cambio no puede estar vacío.' };
  }

  const normalizedInput = inputName.trim();
  const lowerInput = normalizedInput.toLowerCase();
  const changesDir = path.join(projectRoot, 'refacil-sdd', 'changes');

  // Keep backward-compatible behavior when directory doesn't exist yet.
  if (!fs.existsSync(changesDir)) {
    return { ok: true, name: lowerInput };
  }

  const entries = fs.readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive')
    .map((e) => e.name);

  if (entries.includes(normalizedInput)) {
    return { ok: true, name: normalizedInput };
  }

  if (entries.includes(lowerInput)) {
    return { ok: true, name: lowerInput };
  }

  const ciMatches = entries.filter((n) => n.toLowerCase() === lowerInput);
  if (ciMatches.length === 1) {
    return { ok: true, name: ciMatches[0] };
  }

  if (ciMatches.length > 1) {
    return {
      ok: false,
      reason: `Nombre de cambio ambiguo: '${inputName}'. Coincidencias: ${ciMatches.join(', ')}`,
    };
  }

  return { ok: true, name: lowerInput };
}

function autoMigrateOpenspec(root) {
  const oldDir = path.join(root, 'openspec');
  const newDir = path.join(root, 'refacil-sdd');
  const oldExists = fs.existsSync(oldDir);
  const newExists = fs.existsSync(newDir);
  if (oldExists && !newExists) {
    try {
      fs.renameSync(oldDir, newDir);
    } catch (err) {
      throw new Error(`No se pudo migrar openspec/ a refacil-sdd/: ${err.message}`);
    }
  }
  // Si ambos existen o ninguno existe → no hacer nada
}

// parseYaml is imported from lib/config.js (shared parser, no duplication)

function serializeMemoryYaml(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n') + '\n';
}

// --- Subcomandos ---

function cmdValidateName(argv) {
  const args = parseArgs(argv);
  const name = args._positional[0];
  const result = validateChangeName(name);
  if (result.valid) {
    process.exit(0);
  } else {
    console.log(result.reason);
    process.exit(1);
  }
}

function cmdNewChange(argv, projectRoot) {
  const args = parseArgs(argv);
  const name = args._positional[0];

  const validation = validateChangeName(name);
  if (!validation.valid) {
    console.error(validation.reason);
    process.exit(1);
  }

  autoMigrateOpenspec(projectRoot);

  const changeDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
  if (fs.existsSync(changeDir)) {
    console.error(`Ya existe un cambio con el nombre '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  fs.mkdirSync(changeDir, { recursive: true });

  const artifacts = ['proposal', 'design', 'tasks', 'specs'];
  for (const artifact of artifacts) {
    fs.writeFileSync(path.join(changeDir, `${artifact}.md`), `# ${artifact}: ${name}\n`);
  }

  console.log(`Cambio '${name}' creado en refacil-sdd/changes/${name}/`);
}

function cmdArchive(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  const validation = validateChangeName(name);
  if (!validation.valid) {
    console.error(validation.reason);
    process.exit(1);
  }

  const sourceDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
  if (!fs.existsSync(sourceDir)) {
    console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(projectRoot, 'refacil-sdd', 'changes', 'archive');
  const destDir = path.join(archiveDir, `${date}-${name}`);

  if (fs.existsSync(destDir)) {
    console.error(`Ya existe un archivo con ese nombre: refacil-sdd/changes/archive/${date}-${name}/`);
    process.exit(1);
  }

  // Delete memory.yaml before archiving (CA-18)
  const memoryFile = path.join(sourceDir, 'memory.yaml');
  if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(sourceDir, destDir);

  if (!(!fs.existsSync(sourceDir) && fs.existsSync(destDir))) {
    console.error('Error: la operación de archivado no se completó correctamente.');
    process.exit(1);
  }

  console.log(`Cambio '${name}' archivado en refacil-sdd/changes/archive/${date}-${name}/`);
}

function cmdSetMemory(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd set-memory <nombre-cambio> [--last-step <value>] [--stack-detected <value>] [--touched-files <csv>] [--commands-run <value>] [--criteria-run <csv>]');
    process.exit(1);
  }

  const root = projectRoot;
  autoMigrateOpenspec(root);
  const resolved = resolveExistingChangeName(root, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  // Guard: ensure the change directory exists before any file operation
  const changeDir = path.join(root, 'refacil-sdd', 'changes', name);
  if (!fs.existsSync(changeDir)) {
    console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  // Require at least one field flag
  const knownFlags = ['last-step', 'stack-detected', 'touched-files', 'commands-run', 'criteria-run'];
  if (!knownFlags.some((f) => args[f] !== undefined)) {
    console.error('set-memory: debe especificar al menos un campo (--last-step, --stack-detected, --touched-files, --commands-run, --criteria-run)');
    process.exit(1);
  }

  const memoryPath = path.join(changeDir, 'memory.yaml');

  // Read existing memory to merge
  let existing = {};
  if (fs.existsSync(memoryPath)) {
    try {
      existing = parseYaml(fs.readFileSync(memoryPath, 'utf8'));
    } catch (_) {
      existing = {};
    }
  }

  // Apply flags
  if (args['last-step']) existing['lastStep'] = args['last-step'];
  if (args['stack-detected']) existing['stackDetected'] = args['stack-detected'];
  if (args['touched-files']) {
    existing['touchedFiles'] = args['touched-files'].split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (args['commands-run']) existing['commandsRun'] = args['commands-run'];
  if (args['criteria-run']) {
    existing['criteriaRun'] = args['criteria-run'].split(',').map((s) => s.trim()).filter(Boolean);
  }

  fs.writeFileSync(memoryPath, serializeMemoryYaml(existing), 'utf8');
  console.log(`memory.yaml actualizado para '${name}'`);
}

function cmdGetMemory(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];
  const wantJson = args.json === true;

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd get-memory <nombre-cambio> [--json]');
    process.exit(1);
  }

  const root = projectRoot;
  autoMigrateOpenspec(root);
  const resolved = resolveExistingChangeName(root, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;
  const memoryPath = path.join(root, 'refacil-sdd', 'changes', name, 'memory.yaml');

  if (!fs.existsSync(memoryPath)) {
    if (wantJson) {
      process.stdout.write('{}\n');
    }
    process.exit(0);
  }

  const content = fs.readFileSync(memoryPath, 'utf8');

  if (wantJson) {
    let parsed = {};
    try {
      parsed = parseYaml(content);
    } catch (_) {
      parsed = {};
    }
    process.stdout.write(JSON.stringify(parsed) + '\n');
  } else {
    process.stdout.write(content);
  }
}

function cmdSetReviewFails(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd set-review-fails <nombre-cambio> --files <csv>');
    process.exit(1);
  }

  const root = projectRoot;
  autoMigrateOpenspec(root);
  const resolved = resolveExistingChangeName(root, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;
  const changeDir = path.join(root, 'refacil-sdd', 'changes', name);
  if (!fs.existsSync(changeDir)) {
    console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  const files = args.files
    ? args.files.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const reviewFailsPath = path.join(changeDir, '.review-last-fails.json');
  fs.writeFileSync(reviewFailsPath, JSON.stringify({ failedFiles: files }, null, 2), 'utf8');
  console.log(`.review-last-fails.json actualizado para '${name}'`);
}

function cmdClearReviewFails(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd clear-review-fails <nombre-cambio>');
    process.exit(1);
  }

  const root = projectRoot;
  autoMigrateOpenspec(root);
  const resolved = resolveExistingChangeName(root, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;
  const reviewFailsPath = path.join(root, 'refacil-sdd', 'changes', name, '.review-last-fails.json');

  if (fs.existsSync(reviewFailsPath)) {
    fs.unlinkSync(reviewFailsPath);
    console.log(`.review-last-fails.json eliminado para '${name}'`);
  }
  // Silent exit 0 if not exists
}

function cmdList(argv, projectRoot) {
  const args = parseArgs(argv);
  const wantJson = args.json === true;

  autoMigrateOpenspec(projectRoot);

  const changesDir = path.join(projectRoot, 'refacil-sdd', 'changes');
  if (!fs.existsSync(changesDir)) {
    if (wantJson) {
      process.stdout.write(JSON.stringify([]) + '\n');
    } else {
      console.log('Sin cambios activos.');
    }
    return;
  }

  const entries = fs.readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive');

  const result = entries.map((e) => {
    const reviewPassed = fs.existsSync(path.join(changesDir, e.name, '.review-passed'));
    return { name: e.name, reviewPassed };
  });

  if (wantJson) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    if (result.length === 0) {
      console.log('Sin cambios activos.');
      return;
    }
    console.log('Cambios activos en refacil-sdd/changes/:');
    for (const item of result) {
      const badge = item.reviewPassed ? '[reviewed]' : '[pending-review]';
      console.log(`  ${item.name}  ${badge}`);
    }
  }
}

function cmdStatus(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];
  const wantJson = args.json === true;

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd status <nombre-cambio> [--json]');
    process.exit(1);
  }

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  const changeDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
  if (!fs.existsSync(changeDir)) {
    console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  // Verificar artefactos
  const hasProposal = fs.existsSync(path.join(changeDir, 'proposal.md'));
  const hasDesign = fs.existsSync(path.join(changeDir, 'design.md'));
  const hasTasks = fs.existsSync(path.join(changeDir, 'tasks.md'));

  // specs: specs.md existe OR specs/ dir con al menos un .md
  let hasSpecs = false;
  const specsMd = path.join(changeDir, 'specs.md');
  const specsDir = path.join(changeDir, 'specs');
  if (fs.existsSync(specsMd)) {
    hasSpecs = true;
  } else if (fs.existsSync(specsDir) && fs.statSync(specsDir).isDirectory()) {
    const mdFiles = fs.readdirSync(specsDir).filter((f) => f.endsWith('.md'));
    hasSpecs = mdFiles.length > 0;
  }

  const artifacts = {
    proposal: hasProposal,
    design: hasDesign,
    tasks: hasTasks,
    specs: hasSpecs,
  };

  // Parsear tasks.md
  let taskStats = { total: 0, done: 0, pending: 0 };
  if (hasTasks) {
    const tasksContent = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    const matches = [...tasksContent.matchAll(/^- \[([ x])\]/gm)];
    taskStats.total = matches.length;
    taskStats.done = matches.filter((m) => m[1] === 'x').length;
    taskStats.pending = taskStats.total - taskStats.done;
  }

  const reviewPassed = fs.existsSync(path.join(changeDir, '.review-passed'));

  const ready = {
    forApply: artifacts.proposal && artifacts.tasks,
    forArchive: reviewPassed && taskStats.total > 0 && taskStats.pending === 0,
  };

  const status = {
    name,
    artifacts,
    tasks: taskStats,
    reviewPassed,
    ready,
  };

  if (wantJson) {
    process.stdout.write(JSON.stringify(status) + '\n');
  } else {
    console.log(`Estado del cambio '${name}':`);
    console.log('');
    console.log('  Artefactos:');
    for (const [key, val] of Object.entries(artifacts)) {
      console.log(`    ${key.padEnd(10)} ${val ? 'OK' : 'FALTANTE'}`);
    }
    console.log('');
    console.log('  Tasks:');
    console.log(`    total:   ${taskStats.total}`);
    console.log(`    hechas:  ${taskStats.done}`);
    console.log(`    pendientes: ${taskStats.pending}`);
    console.log('');
    console.log(`  Review aprobado: ${reviewPassed ? 'Si' : 'No'}`);
    console.log('');
    console.log('  Listo para:');
    console.log(`    apply:   ${ready.forApply ? 'Si' : 'No'}`);
    console.log(`    archive: ${ready.forArchive ? 'Si' : 'No'}`);
  }
}

function cmdMarkReviewed(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd mark-reviewed <nombre-cambio> --verdict <verdict> --summary "<resumen>" [--fail-count N] [--preexisting-count N] [--blockers]');
    process.exit(1);
  }

  if (!args.verdict) {
    console.error('Error: --verdict es requerido (ej: approved, approved-with-notes, rejected)');
    process.exit(1);
  }

  if (!args.summary) {
    console.error('Error: --summary es requerido');
    process.exit(1);
  }

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  const changeDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
  if (!fs.existsSync(changeDir)) {
    console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
    process.exit(1);
  }

  const payload = {
    verdict: args.verdict,
    changeName: name,
    summary: args.summary,
    failCount: Number(args['fail-count'] || 0),
    preexistingCount: Number(args['preexisting-count'] || 0),
    blockers: args.blockers === true,
    date: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(changeDir, '.review-passed'), JSON.stringify(payload, null, 2));
  console.log(`Review marcado como aprobado para '${name}' (verdict: ${payload.verdict})`);
}

function cmdTasksUpdate(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd tasks-update <nombre-cambio> --task N --done');
    process.exit(1);
  }

  const taskN = Number(args.task);
  if (!args.task || !Number.isInteger(taskN) || taskN <= 0) {
    console.error('Error: --task debe ser un entero positivo (ej: --task 1)');
    process.exit(1);
  }

  if (args.done !== true) {
    console.error('Error: --done es requerido para marcar una task como completada');
    process.exit(1);
  }

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  const tasksFile = path.join(projectRoot, 'refacil-sdd', 'changes', name, 'tasks.md');
  if (!fs.existsSync(tasksFile)) {
    console.error(`No existe tasks.md para el cambio '${name}'`);
    process.exit(1);
  }

  const content = fs.readFileSync(tasksFile, 'utf8');
  const matches = [...content.matchAll(/^(- \[[ x]\].*)/gm)];

  if (taskN > matches.length) {
    console.error(`Error: task ${taskN} no encontrada (el archivo tiene ${matches.length} task(s))`);
    process.exit(1);
  }

  const targetMatch = matches[taskN - 1];
  const originalLine = targetMatch[1];
  // Reemplazar [ ] por [x] (idempotente: [x] queda [x])
  const updatedLine = originalLine.replace(/^- \[ \]/, '- [x]');

  // Reemplazar solo la primera ocurrencia exacta de la línea original (en la posición correcta)
  let replaced = false;
  let count = 0;
  const newContent = content.replace(/^(- \[[ x]\].*)/gm, (match) => {
    count++;
    if (count === taskN && !replaced) {
      replaced = true;
      return updatedLine;
    }
    return match;
  });

  fs.writeFileSync(tasksFile, newContent, 'utf8');
  console.log(`Task ${taskN} de '${name}' marcada como completada.`);
}

function cmdConfig(argv, projectRoot) {
  const args = parseArgs(argv);
  const wantJson = args.json === true;

  const { protectedBranches, baseBranch, sources } = loadBranchConfigWithSources(projectRoot);

  if (wantJson) {
    process.stdout.write(JSON.stringify({ protectedBranches, baseBranch }) + '\n');
  } else {
    console.log(`protectedBranches [${sources.protectedBranches}]: ${protectedBranches.join(', ')}`);
    console.log(`baseBranch [${sources.baseBranch}]: ${baseBranch}`);
  }
}


function cmdWriteConfig(argv, projectRoot) {
  const args = parseArgs(argv);

  const isGlobal = args.global === true;
  const rawBaseBranch = args['base-branch'];
  const rawProtectedBranches = args['protected-branches'];

  // CR-03: no flags provided
  if (rawBaseBranch === undefined && rawProtectedBranches === undefined) {
    console.error('Uso: refacil-sdd-ai sdd write-config [--global] [--base-branch <branch>] [--protected-branches <csv>]');
    console.error('Debe especificar al menos --base-branch o --protected-branches.');
    process.exit(1);
  }

  // CR-01: empty --base-branch after trim
  if (rawBaseBranch !== undefined && (typeof rawBaseBranch !== 'string' || rawBaseBranch.trim() === '')) {
    console.error('Error: --base-branch no puede estar vacío.');
    process.exit(1);
  }

  // CR-02: --protected-branches: split, trim, filter; error if empty result
  let protectedBranchesList;
  if (rawProtectedBranches !== undefined) {
    protectedBranchesList = String(rawProtectedBranches).split(',').map((s) => s.trim()).filter(Boolean);
    if (protectedBranchesList.length === 0) {
      console.error('Error: --protected-branches no puede resultar en una lista vacía.');
      process.exit(1);
    }
  }

  const targetPath = isGlobal
    ? path.join(os.homedir(), '.refacil-sdd-ai', 'config.yaml')
    : path.join(projectRoot, 'refacil-sdd', 'config.yaml');

  // CR-04: read existing file; null if absent or corrupt
  const existing = readConfigFile(targetPath) || {};

  // Merge: start from existing, overwrite only provided keys
  const merged = Object.assign({}, existing);
  if (rawBaseBranch !== undefined) {
    merged.baseBranch = rawBaseBranch.trim();
  }
  if (protectedBranchesList !== undefined) {
    merged.protectedBranches = protectedBranchesList;
  }

  // CA-03: no-op when all provided keys already match existing config (semantic comparison)
  const isNoOp = Object.keys(existing).length > 0 &&
    (rawBaseBranch === undefined || existing.baseBranch === rawBaseBranch.trim()) &&
    (protectedBranchesList === undefined ||
      (Array.isArray(existing.protectedBranches) &&
       JSON.stringify(existing.protectedBranches.slice().sort()) === JSON.stringify(protectedBranchesList.slice().sort())));
  if (isNoOp) {
    console.log(`Sin cambios: ${targetPath} ya tiene los valores indicados.`);
    process.exit(0);
  }
  const proposed = serializeMemoryYaml(merged);

  // Create directory if absent
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  fs.writeFileSync(targetPath, proposed, 'utf8');

  const level = isGlobal ? 'global' : 'proyecto';
  console.log(`Configuración de ramas escrita en ${targetPath} (nivel: ${level})`);
}

function sddHelp() {
  console.log(`
  refacil-sdd-ai sdd — Gestión de artefactos SDD-AI

  Subcomandos:
    sdd new-change <nombre>            Crea un nuevo cambio con los 4 artefactos scaffold
    sdd archive <nombre>               Archiva un cambio completado a refacil-sdd/changes/archive/
    sdd list [--json]                  Lista cambios activos con estado de review
    sdd status <nombre> [--json]       Muestra estado de artefactos y tasks de un cambio
    sdd mark-reviewed <nombre>         Escribe .review-passed con veredicto y resumen
      --verdict <v>                      Veredicto (ej: approved, approved-with-notes, rejected)
      --summary "<texto>"                Resumen del review (requerido)
      [--fail-count N]                   Número de fallos encontrados
      [--preexisting-count N]            Número de issues preexistentes
      [--blockers]                       Indica si hay blockers
    sdd tasks-update <nombre>          Marca una task como completada en tasks.md
      --task N                           Número de task (1-indexed)
      --done                             Confirma que la task está hecha
    sdd validate-name <nombre>         Valida el formato del nombre de un cambio
    sdd set-memory <nombre>            Escribe o fusiona campos en memory.yaml del cambio
      [--last-step <value>]              Último paso ejecutado (apply, test, etc.)
      [--stack-detected <value>]         Stack tecnológico detectado
      [--touched-files <csv>]            Archivos modificados (separados por coma)
      [--commands-run <value>]           Comando de test ejecutado
      [--criteria-run <csv>]             Criterios CA/CR ejecutados (separados por coma)
    sdd get-memory <nombre>            Lee memory.yaml del cambio
      [--json]                           Salida en JSON (por defecto: YAML raw)
    sdd set-review-fails <nombre>      Escribe .review-last-fails.json con archivos fallidos
      --files <csv>                      Archivos con fallos (separados por coma)
    sdd clear-review-fails <nombre>    Elimina .review-last-fails.json del cambio
    sdd config [--json]                Muestra la configuración efectiva de ramas
                                         (project > global > defaults)
      [--json]                           Salida en JSON (útil para agentes)
    sdd write-config                   Escribe la configuración de ramas en el archivo de config
      [--global]                         Escribe en ~/.refacil-sdd-ai/config.yaml (global)
                                         Sin --global: escribe en refacil-sdd/config.yaml (proyecto)
      [--base-branch <branch>]           Rama base para nuevos cambios
      [--protected-branches <csv>]       Ramas protegidas (separadas por coma)

  Notas:
    - Los nombres de cambio deben empezar con minúscula y usar solo [a-z0-9-]
    - Si existe openspec/ y no existe refacil-sdd/, se migra automáticamente
    - sdd archive elimina memory.yaml automáticamente antes de mover el cambio
  `);
}

// --- Dispatcher ---

function handleSdd(sub, argv, projectRoot) {
  const args = argv || [];
  const root = projectRoot || findProjectRoot();

  switch (sub) {
    case 'new-change':
      cmdNewChange(args, root);
      break;
    case 'archive':
      cmdArchive(args, root);
      break;
    case 'list':
      cmdList(args, root);
      break;
    case 'status':
      cmdStatus(args, root);
      break;
    case 'mark-reviewed':
      cmdMarkReviewed(args, root);
      break;
    case 'tasks-update':
      cmdTasksUpdate(args, root);
      break;
    case 'validate-name':
      cmdValidateName(args);
      break;
    case 'set-memory':
      cmdSetMemory(args, root);
      break;
    case 'get-memory':
      cmdGetMemory(args, root);
      break;
    case 'set-review-fails':
      cmdSetReviewFails(args, root);
      break;
    case 'clear-review-fails':
      cmdClearReviewFails(args, root);
      break;
    case 'config':
      cmdConfig(args, root);
      break;
    case 'write-config':
      cmdWriteConfig(args, root);
      break;
    default:
      sddHelp();
      process.exit(1);
  }
}

module.exports = { handleSdd, parseArgs, autoMigrateOpenspec, validateChangeName, resolveExistingChangeName, findProjectRoot, cmdWriteConfig };
