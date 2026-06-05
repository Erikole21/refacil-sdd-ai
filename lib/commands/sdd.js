'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadBranchConfigWithSources, parseYaml, readConfigFile, SUPPORTED_LANGUAGES, CODEGRAPH_MODES } = require('../config');
const { findProjectRoot } = require('../project-root');
const { collectSpecSourceFiles } = require('../spec-sync');

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

/** Bug-fix changes from refacil:bug use fix-* and only carry summary.md (no specs/). */
function isBugFixChangeName(name) {
  return typeof name === 'string' && name.startsWith('fix-');
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

/**
 * Looks up a change name inside the archive directory.
 * Archive entry format: refacil-sdd/changes/archive/YYYY-MM-DD-<changeName>/
 *
 * Rules:
 * - Matches by exact suffix `-<name>` (not substring).
 * - Validates prefix matches /^\d{4}-\d{2}-\d{2}-/.
 * - Returns most recent directory path (sorted descending by date prefix).
 * - If two entries share the same suffix (same name, different dates) → returns most recent.
 * - If the name is ambiguous (two entries with truly different names both match) → returns null and emits error.
 * - Returns null if no match or archive dir doesn't exist.
 */
function resolveArchivedChangeName(projectRoot, name) {
  if (!name || typeof name !== 'string') return null;

  const archiveDir = path.join(projectRoot, 'refacil-sdd', 'changes', 'archive');
  if (!fs.existsSync(archiveDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(archiveDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (_) {
    return null;
  }

  // Date prefix pattern
  const datePrefix = /^\d{4}-\d{2}-\d{2}-/;

  // Filter by exact suffix match AND valid date prefix
  const suffix = `-${name}`;
  const matches = entries.filter((entry) => {
    if (!datePrefix.test(entry)) return false;
    return entry.endsWith(suffix);
  });

  if (matches.length === 0) return null;

  // Check for ambiguity: extract the clean name (strip date prefix) and verify all match the same name
  const cleanNames = new Set(matches.map((entry) => entry.replace(datePrefix, '')));
  if (cleanNames.size > 1) {
    // Multiple distinct clean names matched — truly ambiguous
    console.error(`Nombre de cambio archivado ambiguo: '${name}'. Coincidencias: ${matches.join(', ')}`);
    return null;
  }

  // Sort descending by date prefix so most recent is first
  matches.sort((a, b) => b.localeCompare(a));

  return path.join(archiveDir, matches[0]);
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

// --- State tracking ---

const VALID_STATES = [
  'proposed',
  'approved',
  'apply-in-progress',
  'applied',
  'tested',
  'verified',
  'reviewed',
  'archived',
];

/**
 * Infers the current state of a change from its artifacts when no explicit
 * currentState is stored in memory. Retrocompatible — never writes to disk.
 *
 * Priority (descending):
 *  1. .review-passed exists                                   → 'reviewed'
 *  2. lastStep === 'verify' or 'verified'                    → 'verified'
 *  3. lastStep === 'test'                                     → 'tested'
 *  4. lastStep === 'apply'                                    → 'applied'
 *  5. tasks.md has at least one [x] and lastStep is absent   → 'apply-in-progress'
 *  6. only proposal.md exists                                → 'proposed'
 *  7. none of the above                                       → 'unknown'
 *
 * NOTE — 'approved' is intentionally absent from this table.
 * There is no artifact signal that distinguishes an approved proposal from a
 * merely proposed one: both have proposal.md, specs.md, design.md, tasks.md.
 * 'approved' is set exclusively via `set-memory --state approved --actor propose-skill`
 * when the human approves the artifacts in /refacil:propose Step 4.
 * Inference can only detect 'proposed' (artifact exists but no explicit state recorded).
 *
 * @param {string} changeDir  Absolute path to the change directory.
 * @param {object} memory     Parsed memory.yaml object (may be empty).
 * @returns {{ currentState: string, inferred: boolean }}
 */
function inferCurrentState(changeDir, memory) {
  // 1. .review-passed
  if (fs.existsSync(path.join(changeDir, '.review-passed'))) {
    return { currentState: 'reviewed', inferred: true };
  }

  const lastStep = memory.lastStep || null;

  // 2. lastStep verify/verified
  if (lastStep === 'verify' || lastStep === 'verified') {
    return { currentState: 'verified', inferred: true };
  }

  // 3. lastStep test
  if (lastStep === 'test') {
    return { currentState: 'tested', inferred: true };
  }

  // 4. lastStep apply
  if (lastStep === 'apply') {
    return { currentState: 'applied', inferred: true };
  }

  // 5. tasks.md has at least one [x] and lastStep absent
  const tasksPath = path.join(changeDir, 'tasks.md');
  if (!lastStep && fs.existsSync(tasksPath)) {
    try {
      const tasksContent = fs.readFileSync(tasksPath, 'utf8');
      if (/^- \[x\]/m.test(tasksContent)) {
        return { currentState: 'apply-in-progress', inferred: true };
      }
    } catch (_) {
      // Unexpected read error (e.g. permission denied): swallow and fall through
      // to the proposal.md check so inference still produces a useful result.
    }
  }

  // 6. only proposal.md exists (no design, tasks, specs)
  if (fs.existsSync(path.join(changeDir, 'proposal.md'))) {
    return { currentState: 'proposed', inferred: true };
  }

  return { currentState: 'unknown', inferred: true };
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

function cmdSyncSpec(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;
  const fromArchive = args['from-archive'] === true;

  if (!fromArchive) {
    const sourceDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
    if (!fs.existsSync(sourceDir)) {
      console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/`);
      process.exit(1);
    }
  }

  try {
    const { syncSpecToCatalog } = require('../spec-sync');
    const result = syncSpecToCatalog(projectRoot, name, { fromArchive });
    const rel = path.relative(projectRoot, result.specPath).replace(/\\/g, '/');
    console.log(`  Spec sincronizado: ${rel} (${result.criteriaCount} criterios, idioma: ${result.language})`);
  } catch (err) {
    console.error(`  Error sincronizando spec: ${err.message}`);
    process.exit(1);
  }
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

  if (!isBugFixChangeName(name)) {
    try {
      const { syncSpecToCatalog } = require('../spec-sync');
      const result = syncSpecToCatalog(projectRoot, name);
      const rel = path.relative(projectRoot, result.specPath).replace(/\\/g, '/');
      console.log(`  Spec sincronizado: ${rel} (idioma: ${result.language}, ${result.criteriaCount} criterios)`);
    } catch (err) {
      console.error(`  Error sincronizando spec antes de archivar: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('  Bug fix (fix-*): omitiendo sincronización de spec (use refacil:archive para documentar en refacil-sdd/specs/)');
  }

  const date = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(projectRoot, 'refacil-sdd', 'changes', 'archive');
  const destDir = path.join(archiveDir, `${date}-${name}`);

  if (fs.existsSync(destDir)) {
    console.error(`Ya existe un archivo con ese nombre: refacil-sdd/changes/archive/${date}-${name}/`);
    process.exit(1);
  }

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
    console.error('Uso: refacil-sdd-ai sdd set-memory <nombre-cambio> [--last-step <value>] [--stack-detected <value>] [--touched-files <csv>] [--commands-run <value>] [--criteria-run <csv>] [--state <estado>] [--actor <nombre>]');
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

  // Validate --state before touching any file (CR-01: exit 1 without modifying file)
  if (args['state'] !== undefined) {
    const stateValue = args['state'];
    // CR-02: empty string or bare flag (parsed as boolean true) → explicit empty-state error
    if (stateValue === '' || stateValue === true) {
      console.error('set-memory: el estado no puede estar vacío');
      process.exit(1);
    }
    if (!VALID_STATES.includes(stateValue)) {
      console.error(`set-memory: estado inválido '${stateValue}'. Estados válidos: ${VALID_STATES.join(', ')}`);
      process.exit(1);
    }
  }

  // Validate --actor: pipe character would corrupt the stateHistory pipe format
  if (args['actor'] !== undefined && String(args['actor']).includes('|')) {
    console.error("set-memory: --actor no puede contener el carácter '|'");
    process.exit(1);
  }

  // Require at least one field flag
  const knownFlags = ['last-step', 'stack-detected', 'touched-files', 'commands-run', 'criteria-run', 'state', 'actor'];
  if (!knownFlags.some((f) => args[f] !== undefined)) {
    console.error('set-memory: debe especificar al menos un campo (--last-step, --stack-detected, --touched-files, --commands-run, --criteria-run, --state, --actor)');
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

  // State tracking (T-01)
  if (args['state'] !== undefined) {
    const actor = args['actor'] !== undefined ? String(args['actor']) : 'cli';
    existing['currentState'] = args['state'];
    const iso = new Date().toISOString();
    const entry = `${args['state']}|${iso}|${actor}`;
    if (!Array.isArray(existing['stateHistory'])) {
      existing['stateHistory'] = [];
    }
    existing['stateHistory'].push(entry);
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
  const includeArchived = args['include-archived'] === true;

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

  // Build archived entries when --include-archived is requested
  const archivedResult = [];
  if (includeArchived) {
    const archiveDir = path.join(changesDir, 'archive');
    if (fs.existsSync(archiveDir)) {
      const datePrefix = /^\d{4}-\d{2}-\d{2}-/;
      try {
        const archiveEntries = fs.readdirSync(archiveDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && datePrefix.test(e.name));
        for (const e of archiveEntries) {
          const dateMatch = e.name.match(/^(\d{4}-\d{2}-\d{2})-/);
          const archivedDate = dateMatch ? dateMatch[1] : null;
          const cleanName = e.name.replace(datePrefix, '');
          archivedResult.push({ name: cleanName, reviewPassed: null, archived: true, archivedDate });
        }
        // Sort descending by date prefix (most recent first)
        archivedResult.sort((a, b) => {
          const da = a.archivedDate || '';
          const db = b.archivedDate || '';
          return db.localeCompare(da);
        });
      } catch (_) {}
    }
    // If archive dir doesn't exist, gracefully produce empty list (exit 0)
  }

  if (wantJson) {
    const combined = result.concat(archivedResult);
    process.stdout.write(JSON.stringify(combined) + '\n');
  } else {
    if (result.length === 0 && archivedResult.length === 0) {
      console.log('Sin cambios activos.');
      return;
    }
    if (result.length > 0) {
      console.log('Cambios activos en refacil-sdd/changes/:');
      for (const item of result) {
        const badge = item.reviewPassed ? '[reviewed]' : '[pending-review]';
        console.log(`  ${item.name}  ${badge}`);
      }
    } else if (!includeArchived) {
      console.log('Sin cambios activos.');
    }
    if (includeArchived && archivedResult.length > 0) {
      if (result.length > 0) console.log('');
      console.log('Cambios archivados en refacil-sdd/changes/archive/:');
      for (const item of archivedResult) {
        console.log(`  ${item.name}  [archived]  (${item.archivedDate || '?'})`);
      }
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

  const hasSpecs = collectSpecSourceFiles(changeDir).length > 0;

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
    forApply: artifacts.proposal && artifacts.design && artifacts.tasks && artifacts.specs,
    forArchive: reviewPassed && taskStats.total > 0 && taskStats.pending === 0,
  };

  // Read memory for currentState / lastStep / touchedFiles
  const memoryPath = path.join(changeDir, 'memory.yaml');
  let memory = {};
  if (fs.existsSync(memoryPath)) {
    try {
      memory = parseYaml(fs.readFileSync(memoryPath, 'utf8')) || {};
    } catch (_) {
      memory = {};
    }
  }

  // Resolve currentState: explicit from memory or inferred
  let currentState = null;
  let stateInferred = false;
  if (memory.currentState) {
    currentState = memory.currentState;
    stateInferred = false;
  } else {
    const inferred = inferCurrentState(changeDir, memory);
    currentState = inferred.currentState;
    stateInferred = inferred.inferred;
  }

  const lastStep = memory.lastStep || null;
  const touchedFiles = Array.isArray(memory.touchedFiles) ? memory.touchedFiles : [];

  const status = {
    name,
    artifacts,
    tasks: taskStats,
    reviewPassed,
    ready,
    currentState,
    stateInferred,
    lastStep,
    touchedFiles,
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
    console.log('  Estado:');
    console.log(`    currentState: ${currentState}${stateInferred ? ' (inferido)' : ''}`);
    if (lastStep) console.log(`    lastStep:     ${lastStep}`);
    if (touchedFiles.length > 0) console.log(`    touchedFiles: ${touchedFiles.join(', ')}`);
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

  const { protectedBranches, baseBranch, artifactLanguage, sources } = loadBranchConfigWithSources(projectRoot);

  if (wantJson) {
    process.stdout.write(JSON.stringify({ protectedBranches, baseBranch, artifactLanguage, sources }) + '\n');
  } else {
    console.log(`protectedBranches [${sources.protectedBranches}]: ${protectedBranches.join(', ')}`);
    console.log(`baseBranch [${sources.baseBranch}]: ${baseBranch}`);
    console.log(`artifactLanguage [${sources.artifactLanguage}]: ${artifactLanguage}`);
  }
}


function cmdWriteConfig(argv, projectRoot) {
  const args = parseArgs(argv);

  const isGlobal = args.global === true;
  const rawBaseBranch = args['base-branch'];
  const rawProtectedBranches = args['protected-branches'];
  const rawArtifactLanguage = args['artifact-language'];
  const rawCodegraph = args['codegraph'];

  // CR-03: no flags provided
  if (rawBaseBranch === undefined && rawProtectedBranches === undefined && rawArtifactLanguage === undefined && rawCodegraph === undefined) {
    console.error('Uso: refacil-sdd-ai sdd write-config [--global] [--base-branch <branch>] [--protected-branches <csv>] [--artifact-language <language>] [--codegraph <mode>]');
    console.error('Debe especificar al menos --base-branch, --protected-branches, --artifact-language o --codegraph.');
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

  // --artifact-language: must be non-empty and in SUPPORTED_LANGUAGES
  if (rawArtifactLanguage !== undefined) {
    if (typeof rawArtifactLanguage !== 'string' || rawArtifactLanguage.trim() === '') {
      console.error('Error: --artifact-language no puede estar vacío.');
      process.exit(1);
    }
    if (!SUPPORTED_LANGUAGES.includes(rawArtifactLanguage.trim())) {
      console.error(`Error: --artifact-language "${rawArtifactLanguage.trim()}" no es un lenguaje soportado. Valores válidos: ${SUPPORTED_LANGUAGES.join(', ')}.`);
      process.exit(1);
    }
  }

  // --codegraph: must be a valid CODEGRAPH_MODES value
  if (rawCodegraph !== undefined) {
    if (typeof rawCodegraph !== 'string' || rawCodegraph.trim() === '') {
      console.error('Error: --codegraph no puede estar vacío.');
      process.exit(1);
    }
    if (!CODEGRAPH_MODES.includes(rawCodegraph.trim())) {
      console.error(`Error: --codegraph "${rawCodegraph.trim()}" no es un modo válido. Valores válidos: ${CODEGRAPH_MODES.join(', ')}.`);
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
  if (rawArtifactLanguage !== undefined) {
    merged.artifactLanguage = rawArtifactLanguage.trim();
  }
  if (rawCodegraph !== undefined) {
    merged.codegraphMode = rawCodegraph.trim();
  }

  // CA-03: no-op when all provided keys already match existing config (semantic comparison)
  const isNoOp = Object.keys(existing).length > 0 &&
    (rawBaseBranch === undefined || existing.baseBranch === rawBaseBranch.trim()) &&
    (protectedBranchesList === undefined ||
      (Array.isArray(existing.protectedBranches) &&
       JSON.stringify(existing.protectedBranches.slice().sort()) === JSON.stringify(protectedBranchesList.slice().sort()))) &&
    (rawArtifactLanguage === undefined || existing.artifactLanguage === rawArtifactLanguage.trim()) &&
    (rawCodegraph === undefined || existing.codegraphMode === rawCodegraph.trim());
  if (isNoOp) {
    console.log(`Sin cambios: ${targetPath} ya tiene los valores indicados.`);
    process.exit(0);
  }
  const proposed = serializeMemoryYaml(merged);

  // Create directory if absent
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  fs.writeFileSync(targetPath, proposed, 'utf8');

  const level = isGlobal ? 'global' : 'proyecto';
  console.log(`Configuración escrita en ${targetPath} (nivel: ${level})`);
}

function cmdTestScope(argv, projectRoot) {
  const args = parseArgs(argv);
  const wantJson = args.json === true;

  const filesRaw = args.files || '';
  const stackHint = args.stack || undefined;
  const baselineCmd = args.baseline || '';
  // When set, fallback returns an EMPTY testCommand instead of the full baseline.
  // Used by /refacil:apply so the implementer can never run the whole suite even if
  // it only looks at the CLI output and ignores the contract's SKIP rule.
  const noBaselineFallback = args['no-baseline-fallback'] === true;
  // Use the already-resolved projectRoot from handleSdd (via findProjectRoot()) so
  // the CLI works correctly when invoked from a subdirectory within the monorepo.
  const root = projectRoot || process.cwd();

  // Parse CSV files — empty string or missing → empty array (CR-04: never fail on empty)
  const files = filesRaw
    ? filesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const { testScope } = require('../test-scope');
  const result = testScope({ files, stack: stackHint, baseline: baselineCmd, projectRoot: root, noBaselineFallback });

  if (wantJson) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    console.log(`testCommand: ${result.testCommand}`);
    console.log(`files: ${result.files.join(', ') || '(none)'}`);
    console.log(`fallback: ${result.fallback}`);
    if (result.fallbackReason) console.log(`fallbackReason: ${result.fallbackReason}`);
  }
  // Always exit 0 (CR-04)
  process.exit(0);
}

function cmdStats(argv, projectRoot) {
  const args = parseArgs(argv);
  const rawName = args._positional[0];
  const wantJson = args.json === true;

  if (!rawName) {
    console.error('Uso: refacil-sdd-ai sdd stats <nombre-cambio> [--json]');
    process.exit(1);
  }

  autoMigrateOpenspec(projectRoot);
  const resolved = resolveExistingChangeName(projectRoot, rawName);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }
  const name = resolved.name;

  let changeDir = path.join(projectRoot, 'refacil-sdd', 'changes', name);
  let isArchived = false;
  let archivedDate = null;

  if (!fs.existsSync(changeDir)) {
    // Fallback: try to find in archive
    const archivedPath = resolveArchivedChangeName(projectRoot, name);
    if (archivedPath) {
      changeDir = archivedPath;
      isArchived = true;
      // Extract YYYY-MM-DD from the directory basename
      const baseName = path.basename(archivedPath);
      const dateMatch = baseName.match(/^(\d{4}-\d{2}-\d{2})-/);
      archivedDate = dateMatch ? dateMatch[1] : null;
    } else {
      console.error(`No existe el cambio '${name}' en refacil-sdd/changes/${name}/ ni en el archivo.`);
      process.exit(1);
    }
  }

  // --- Read memory.yaml ---
  const memoryPath = path.join(changeDir, 'memory.yaml');
  let memory = {};
  if (fs.existsSync(memoryPath)) {
    try {
      memory = parseYaml(fs.readFileSync(memoryPath, 'utf8')) || {};
    } catch (_) {
      memory = {};
    }
  }
  const testCommand = memory.testCommand || memory.commandsRun || null;
  const lastStep = memory.lastStep || null;
  const criteriaRun = Array.isArray(memory.criteriaRun) ? memory.criteriaRun : [];

  // Resolve currentState for stats
  let statsCurrentState = null;
  let statsStateInferred = false;
  if (memory.currentState) {
    statsCurrentState = memory.currentState;
    statsStateInferred = false;
  } else {
    const inferred = inferCurrentState(changeDir, memory);
    statsCurrentState = inferred.currentState;
    statsStateInferred = inferred.inferred;
  }

  // --- Read .review-passed ---
  const reviewPassedPath = path.join(changeDir, '.review-passed');
  let reviewDate = null;
  let reviewVerdict = null;
  let reviewFailCount = 0;
  if (fs.existsSync(reviewPassedPath)) {
    try {
      const rp = JSON.parse(fs.readFileSync(reviewPassedPath, 'utf8'));
      reviewDate = rp.date || null;
      reviewVerdict = rp.verdict || null;
      reviewFailCount = rp.failCount || 0;
    } catch (_) {}
  }

  // --- Determine change start date from proposal.md mtime (fallback: summary.md) ---
  const proposalPath = path.join(changeDir, 'proposal.md');
  let startDate = null;
  if (fs.existsSync(proposalPath)) {
    try {
      const stat = fs.statSync(proposalPath);
      startDate = stat.mtime;
    } catch (_) {}
  }
  if (!startDate) {
    const summaryPath = path.join(changeDir, 'summary.md');
    if (fs.existsSync(summaryPath)) {
      try {
        const stat = fs.statSync(summaryPath);
        startDate = stat.mtime;
      } catch (_) {}
    }
  }

  // --- Read compact.log filtered by change period ---
  let compactStats = { totalRewrites: 0, totalSaved: 0, totalAlreadyCompact: 0, totalAlreadyCompactPotential: 0, totalEvents: 0 };
  try {
    const compactTelemetry = require('../compact/telemetry');
    const allCompact = compactTelemetry.readLog ? compactTelemetry.readLog() : [];
    const filtered = startDate ? allCompact.filter((e) => e.ts && new Date(e.ts) >= startDate) : allCompact;
    let totalRewrites = 0, totalSaved = 0, totalAlreadyCompact = 0, totalAlreadyCompactPotential = 0;
    for (const e of filtered) {
      const evType = e.eventType || 'hook_rewrite';
      if (evType === 'already_compact') {
        totalAlreadyCompact++;
        totalAlreadyCompactPotential += e.savedTokensEst || 0;
      } else {
        totalRewrites++;
        totalSaved += e.savedTokensEst || 0;
      }
    }
    compactStats = { totalRewrites, totalSaved, totalAlreadyCompact, totalAlreadyCompactPotential, totalEvents: filtered.length };
  } catch (_) {}

  // --- Read codegraph.log filtered by change period ---
  let codegraphStats = { totalEvents: 0, totalToolCalls: 0, totalTokensSaved: 0 };
  try {
    const cgTelemetry = require('../codegraph-telemetry');
    const allCg = cgTelemetry.readLog ? cgTelemetry.readLog() : [];
    const filtered = startDate ? allCg.filter((e) => e.ts && new Date(e.ts) >= startDate) : allCg;
    let totalEvents = 0, totalToolCalls = 0, totalTokensSaved = 0;
    for (const e of filtered) {
      totalEvents++;
      totalToolCalls += e.toolCallsCount || 0;
      totalTokensSaved += e.estimatedTokensSaved || 0;
    }
    codegraphStats = { totalEvents, totalToolCalls, totalTokensSaved };
  } catch (_) {}

  // --- Build stats object ---
  const statsObj = {
    changeName: name,
    isArchived,
    archivedDate,
    startDate: startDate ? startDate.toISOString() : null,
    memory: {
      testCommand: testCommand || null,
      lastStep: lastStep || null,
      criteriaRun,
      currentState: statsCurrentState,
      stateInferred: statsStateInferred,
    },
    review: {
      passed: reviewDate !== null,
      verdict: reviewVerdict,
      date: reviewDate,
      failCount: reviewFailCount,
    },
    compact: {
      eventsInPeriod: compactStats.totalEvents,
      rewrites: compactStats.totalRewrites,
      estimatedTokensSavedByRewrites: compactStats.totalSaved,
      alreadyCompact: compactStats.totalAlreadyCompact,
      estimatedTokensSavedAlreadyCompact: compactStats.totalAlreadyCompactPotential,
    },
    codegraph: {
      eventsInPeriod: codegraphStats.totalEvents,
      totalToolCalls: codegraphStats.totalToolCalls,
      estimatedTokensSaved: codegraphStats.totalTokensSaved,
    },
  };

  if (wantJson) {
    process.stdout.write(JSON.stringify(statsObj) + '\n');
    return;
  }

  // --- Tabular output ---
  const pad = (s, n) => String(s).padEnd(n);
  const noDataLabel = isArchived ? '(archivado)' : '(sin datos)';
  console.log('');
  console.log(`  Stats del cambio: ${name}${isArchived && archivedDate ? `  [archivado el ${archivedDate}]` : ""}`);
  if (startDate) console.log(`  Inicio estimado:  ${startDate.toISOString().slice(0, 10)}`);
  console.log('');
  console.log('  Memory');
  console.log(`    ${pad('currentState', 20)} ${statsCurrentState || noDataLabel}${statsStateInferred ? ' (inferido)' : ''}`);
  console.log(`    ${pad('lastStep', 20)} ${lastStep || noDataLabel}`);
  console.log(`    ${pad('criteriaRun', 20)} ${criteriaRun.length > 0 ? criteriaRun.join(', ') : noDataLabel}`);
  console.log(`    ${pad('testCommand', 20)} ${testCommand || noDataLabel}`);
  console.log('');
  console.log('  Review');
  console.log(`    ${pad('passed', 20)} ${reviewDate !== null ? 'Si' : 'No'}`);
  if (reviewVerdict) console.log(`    ${pad('verdict', 20)} ${reviewVerdict}`);
  if (reviewDate) console.log(`    ${pad('date', 20)} ${reviewDate}`);
  if (reviewDate) console.log(`    ${pad('failCount', 20)} ${reviewFailCount}`);
  console.log('');
  console.log('  Compact telemetry (periodo del cambio)');
  console.log(`    ${pad('eventos', 20)} ${compactStats.totalEvents}`);
  console.log(`    ${pad('rewrites', 20)} ${compactStats.totalRewrites}`);
  console.log(`    ${pad('tokens ahorrados', 20)} ${compactStats.totalSaved}`);
  console.log('');
  console.log('  CodeGraph telemetry (periodo del cambio)');
  console.log(`    ${pad('eventos', 20)} ${codegraphStats.totalEvents}`);
  console.log(`    ${pad('tool calls', 20)} ${codegraphStats.totalToolCalls}`);
  console.log(`    ${pad('tokens ahorrados', 20)} ${codegraphStats.totalTokensSaved}`);
  console.log('');
}

function sddHelp() {
  console.log(`
  refacil-sdd-ai sdd — Gestión de artefactos SDD-AI

  Subcomandos:
    sdd new-change <nombre>            Crea un nuevo cambio con los 4 artefactos scaffold
    sdd sync-spec <nombre>             Sincroniza specs del change a refacil-sdd/specs/<nombre>/spec.md
                                         (mismo idioma que los artefactos; sin traducción)
      [--from-archive]                 Lee el change desde refacil-sdd/changes/archive/*-<nombre>/
    sdd archive <nombre>               Archiva un cambio (sync-spec automático + mueve a archive/)
    sdd list [--json] [--include-archived]  Lista cambios activos con estado de review
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
      [--state <estado>]                 Estado del ciclo SDD-AI (proposed, approved, apply-in-progress, applied, tested, verified, reviewed, archived)
      [--actor <nombre>]                 Actor que origina el cambio de estado (default: cli)
    sdd get-memory <nombre>            Lee memory.yaml del cambio
      [--json]                           Salida en JSON (por defecto: YAML raw)
    sdd set-review-fails <nombre>      Escribe .review-last-fails.json con archivos fallidos
      --files <csv>                      Archivos con fallos (separados por coma)
    sdd clear-review-fails <nombre>    Elimina .review-last-fails.json del cambio
    sdd config [--json]                Muestra la configuración efectiva de ramas
                                         (project > global > defaults)
      [--json]                           Salida en JSON (útil para agentes)
    sdd write-config                   Escribe la configuración en el archivo de config
      [--global]                         Escribe en ~/.refacil-sdd-ai/config.yaml (global)
                                         Sin --global: escribe en refacil-sdd/config.yaml (proyecto)
      [--base-branch <branch>]           Rama base para nuevos cambios
      [--protected-branches <csv>]       Ramas protegidas (separadas por coma)
      [--artifact-language <language>]   Idioma para los artefactos SDD generados (english, spanish)
    sdd stats <nombre> [--json]        Muestra estadísticas del cambio: memoria (incluyendo currentState),
                                         review, compact telemetry y CodeGraph en el periodo del cambio
    sdd test-scope                     Resolves scoped test files for the given source files
      --files <csv>                      Comma-separated source file paths to scope tests for
      [--stack <name>]                   Stack hint (node, python, go, rust, java, dotnet)
      [--baseline <cmd>]                 Fallback test command when no test files are found
      [--no-baseline-fallback]           On fallback, return an EMPTY testCommand instead of the
                                         baseline (used by /refacil:apply so it can never run the
                                         whole suite). /refacil:test omits this flag.
      [--json]                           Output result as JSON (testCommand, files, fallback, fallbackReason)
                                         Always exits 0.

  Notas:
    - Los nombres de cambio deben empezar con minúscula y usar solo [a-z0-9-]
    - Si existe openspec/ y no existe refacil-sdd/, se migra automáticamente
    - sdd archive ejecuta sync-spec antes de mover (preserva idioma de CA/CR del change)
    - sdd archive mueve el cambio completo (incluyendo memory.yaml si existe) al directorio archive/
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
    case 'sync-spec':
      cmdSyncSpec(args, root);
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
    case 'stats':
      cmdStats(args, root);
      break;
    case 'test-scope':
      cmdTestScope(args, root);
      break;
    default:
      sddHelp();
      process.exit(1);
  }
}

module.exports = {
  handleSdd,
  parseArgs,
  autoMigrateOpenspec,
  validateChangeName,
  isBugFixChangeName,
  resolveExistingChangeName,
  resolveArchivedChangeName,
  findProjectRoot,
  cmdWriteConfig,
  cmdStats,
  cmdTestScope,
  VALID_STATES,
  inferCurrentState,
};
