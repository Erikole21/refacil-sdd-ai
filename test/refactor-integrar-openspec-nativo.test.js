'use strict';

/**
 * Tests de contenido textual para el cambio refactor-integrar-openspec-nativo.
 * Verifican criterios CA y CR sobre archivos .md (agentes y skills) y el .js.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Rutas de archivos bajo test
const PROPOSER_MD = path.join(ROOT, 'agents', 'proposer.md');
const IMPLEMENTER_MD = path.join(ROOT, 'agents', 'implementer.md');
const VALIDATOR_MD = path.join(ROOT, 'agents', 'validator.md');
const ARCHIVE_SKILL = path.join(ROOT, 'skills', 'archive', 'SKILL.md');
const REVIEW_SKILL = path.join(ROOT, 'skills', 'review', 'SKILL.md');
const APPLY_SKILL = path.join(ROOT, 'skills', 'apply', 'SKILL.md');
const VERIFY_SKILL = path.join(ROOT, 'skills', 'verify', 'SKILL.md');
const SETUP_SKILL = path.join(ROOT, 'skills', 'setup', 'SKILL.md');
const CONTRACT_MD = path.join(ROOT, 'skills', 'prereqs', 'METHODOLOGY-CONTRACT.md');
const MIGRATION_LIB = path.join(ROOT, 'lib', 'methodology-migration-pending.js');

// ── CA-01: Proposer no lee archivos bajo .claude/skills/openspec-propose/ ni OPENSPEC-DELTAS.md ──

test('CA-01: proposer.md no referencia .claude/skills/openspec-propose/', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    !content.includes('openspec-propose/'),
    'proposer.md NO debe referenciar .claude/skills/openspec-propose/',
  );
});

test('CA-01: proposer.md no referencia OPENSPEC-DELTAS.md', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    !content.includes('OPENSPEC-DELTAS.md'),
    'proposer.md NO debe referenciar OPENSPEC-DELTAS.md',
  );
});

// ── CA-02: Proposer usa `refacil-sdd-ai sdd new-change "<name>"` ──

test('CA-02: proposer.md usa refacil-sdd-ai sdd new-change', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    content.includes('refacil-sdd-ai sdd new-change'),
    'proposer.md DEBE usar "refacil-sdd-ai sdd new-change"',
  );
});

test('CA-02: proposer.md no usa "openspec new change"', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    !content.includes('openspec new change'),
    'proposer.md NO debe usar "openspec new change"',
  );
});

// ── CA-03: Proposer genera artefactos con templates inline ──

test('CA-03: proposer.md contiene template de proposal.md', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    content.includes('### Template: proposal.md'),
    'proposer.md DEBE incluir template inline de proposal.md',
  );
});

test('CA-03: proposer.md contiene template de specs.md', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    content.includes('### Template: specs.md'),
    'proposer.md DEBE incluir template inline de specs.md',
  );
});

test('CA-03: proposer.md contiene template de design.md', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    content.includes('### Template: design.md'),
    'proposer.md DEBE incluir template inline de design.md',
  );
});

test('CA-03: proposer.md contiene template de tasks.md', () => {
  const content = fs.readFileSync(PROPOSER_MD, 'utf8');
  assert.ok(
    content.includes('### Template: tasks.md'),
    'proposer.md DEBE incluir template inline de tasks.md',
  );
});

// ── CA-04: Implementer no lee archivos bajo .claude/skills/openspec-apply-change/ ni OPENSPEC-DELTAS.md ──

test('CA-04: implementer.md no referencia .claude/skills/openspec-apply-change/', () => {
  const content = fs.readFileSync(IMPLEMENTER_MD, 'utf8');
  assert.ok(
    !content.includes('openspec-apply-change/'),
    'implementer.md NO debe referenciar .claude/skills/openspec-apply-change/',
  );
});

test('CA-04: implementer.md no referencia OPENSPEC-DELTAS.md', () => {
  const content = fs.readFileSync(IMPLEMENTER_MD, 'utf8');
  assert.ok(
    !content.includes('OPENSPEC-DELTAS.md'),
    'implementer.md NO debe referenciar OPENSPEC-DELTAS.md',
  );
});

// ── CA-05: Implementer usa `refacil-sdd-ai sdd tasks-update <changeName> --task N --done` ──

test('CA-05: implementer.md usa refacil-sdd-ai sdd tasks-update', () => {
  const content = fs.readFileSync(IMPLEMENTER_MD, 'utf8');
  assert.ok(
    content.includes('refacil-sdd-ai sdd tasks-update'),
    'implementer.md DEBE usar "refacil-sdd-ai sdd tasks-update"',
  );
});

test('CA-05: implementer.md incluye --task y --done en el comando tasks-update', () => {
  const content = fs.readFileSync(IMPLEMENTER_MD, 'utf8');
  assert.ok(
    content.includes('--task') && content.includes('--done'),
    'implementer.md DEBE incluir flags --task N --done',
  );
});

// ── CA-06: Validator no lee archivos bajo .claude/skills/openspec-verify-change/ ni delega a OpenSpec verify ──

test('CA-06: validator.md no referencia .claude/skills/openspec-verify-change/', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  assert.ok(
    !content.includes('openspec-verify-change/'),
    'validator.md NO debe referenciar .claude/skills/openspec-verify-change/',
  );
});

test('CA-06: validator.md no delega a "openspec verify"', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  assert.ok(
    !content.includes('openspec verify'),
    'validator.md NO debe delegar a "openspec verify"',
  );
});

// ── CA-07: Validator aplica framework 3D (Completeness/Correctness/Coherence) ──

test('CA-07: validator.md menciona framework 3D o tridimensional', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  const has3D = content.includes('3D') || content.includes('tridimensional');
  assert.ok(has3D, 'validator.md DEBE mencionar framework 3D o tridimensional');
});

test('CA-07: validator.md incluye Completeness', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  assert.ok(
    content.includes('Completeness'),
    'validator.md DEBE incluir dimensión Completeness',
  );
});

test('CA-07: validator.md incluye Correctness', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  assert.ok(
    content.includes('Correctness'),
    'validator.md DEBE incluir dimensión Correctness',
  );
});

test('CA-07: validator.md incluye Coherence', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  assert.ok(
    content.includes('Coherence'),
    'validator.md DEBE incluir dimensión Coherence',
  );
});

// ── CA-08: Validator degrada gracefully ──

test('CA-08: validator.md tiene regla de degradación graceful', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  const hasGraceful =
    content.includes('graceful') || content.includes('Degradacion graceful') || content.includes('Degradación graceful');
  assert.ok(hasGraceful, 'validator.md DEBE tener reglas de degradación graceful');
});

test('CA-08: validator.md menciona que sin specs solo aplica Completeness con nota', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  // Debe indicar que cuando no hay specs se aplica solo Dimension 1 (Completeness)
  const hasOnly1 =
    content.includes('solo Dimension 1') ||
    content.includes('solo Completeness') ||
    content.includes('aplica solo Dimension 1') ||
    (content.includes('Completeness') && content.includes('WARNING'));
  assert.ok(hasOnly1, 'validator.md DEBE indicar que sin specs solo aplica Completeness con nota/WARNING');
});

// ── CA-09: Archive Paso 2B ejecuta `refacil-sdd-ai sdd archive <changeName>` ──

test('CA-09: archive/SKILL.md usa refacil-sdd-ai sdd archive en Paso 2B', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  assert.ok(
    content.includes('refacil-sdd-ai sdd archive'),
    'archive/SKILL.md DEBE usar "refacil-sdd-ai sdd archive <changeName>"',
  );
});

test('CA-09: archive/SKILL.md no usa openspec-archive-change', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  assert.ok(
    !content.includes('openspec-archive-change'),
    'archive/SKILL.md NO debe usar openspec-archive-change',
  );
});

// ── CA-10: Review Paso 3 ejecuta `refacil-sdd-ai sdd mark-reviewed` ──

test('CA-10: review/SKILL.md usa refacil-sdd-ai sdd mark-reviewed', () => {
  const content = fs.readFileSync(REVIEW_SKILL, 'utf8');
  assert.ok(
    content.includes('refacil-sdd-ai sdd mark-reviewed'),
    'review/SKILL.md DEBE usar "refacil-sdd-ai sdd mark-reviewed"',
  );
});

test('CA-10: review/SKILL.md no escribe .review-passed manualmente', () => {
  const content = fs.readFileSync(REVIEW_SKILL, 'utf8');
  // No debe tener "echo" + ".review-passed" ni "Write" + ".review-passed" como escritura directa
  const hasManualWrite =
    /echo[^)]*\.review-passed/.test(content) ||
    /fs\.writeFileSync[^)]*\.review-passed/.test(content);
  assert.ok(!hasManualWrite, 'review/SKILL.md NO debe escribir .review-passed manualmente');
});

// ── CA-11: Apply/verify/archive/review usan sdd status --json en Paso 0 ──

test('CA-11: apply/SKILL.md usa sdd status <changeName> --json en Paso 0', () => {
  const content = fs.readFileSync(APPLY_SKILL, 'utf8');
  assert.ok(
    content.includes('sdd status') && content.includes('--json'),
    'apply/SKILL.md DEBE usar "sdd status <changeName> --json" en Paso 0',
  );
});

test('CA-11: verify/SKILL.md usa sdd status <changeName> --json en Paso 0', () => {
  const content = fs.readFileSync(VERIFY_SKILL, 'utf8');
  assert.ok(
    content.includes('sdd status') && content.includes('--json'),
    'verify/SKILL.md DEBE usar "sdd status <changeName> --json" en Paso 0',
  );
});

test('CA-11: archive/SKILL.md usa sdd status <changeName> --json en Paso 0', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  assert.ok(
    content.includes('sdd status') && content.includes('--json'),
    'archive/SKILL.md DEBE usar "sdd status <changeName> --json" en Paso 0',
  );
});

test('CA-11: review/SKILL.md usa sdd status <changeName> --json en Paso 0', () => {
  const content = fs.readFileSync(REVIEW_SKILL, 'utf8');
  assert.ok(
    content.includes('sdd status') && content.includes('--json'),
    'review/SKILL.md DEBE usar "sdd status <changeName> --json" en Paso 0',
  );
});

// ── CA-12: Setup no instala @fission-ai/openspec ni ejecuta openspec config set workflows ──

test('CA-12: setup/SKILL.md no instala @fission-ai/openspec', () => {
  const content = fs.readFileSync(SETUP_SKILL, 'utf8');
  assert.ok(
    !content.includes('@fission-ai/openspec'),
    'setup/SKILL.md NO debe referenciar @fission-ai/openspec',
  );
});

test('CA-12: setup/SKILL.md no ejecuta openspec config set workflows', () => {
  const content = fs.readFileSync(SETUP_SKILL, 'utf8');
  assert.ok(
    !content.includes('openspec config set workflows'),
    'setup/SKILL.md NO debe ejecutar "openspec config set workflows"',
  );
});

test('CA-12: setup/SKILL.md no ejecuta openspec init', () => {
  const content = fs.readFileSync(SETUP_SKILL, 'utf8');
  // Debe no tener "openspec init" como comando (puede mencionar "refacil-sdd-ai init")
  const hasOpensSpecInit = /\bopenspec\s+init\b/.test(content);
  assert.ok(!hasOpensSpecInit, 'setup/SKILL.md NO debe ejecutar "openspec init"');
});

// ── CA-13: Setup crea carpeta refacil-sdd/ cuando no existe ──

test('CA-13: setup/SKILL.md referencia refacil-sdd/changes/', () => {
  const content = fs.readFileSync(SETUP_SKILL, 'utf8');
  assert.ok(
    content.includes('refacil-sdd/changes'),
    'setup/SKILL.md DEBE mencionar creación de refacil-sdd/changes/',
  );
});

test('CA-13: setup/SKILL.md verifica o instala refacil-sdd-ai --version', () => {
  const content = fs.readFileSync(SETUP_SKILL, 'utf8');
  assert.ok(
    content.includes('refacil-sdd-ai --version') || content.includes('refacil-sdd-ai --version'),
    'setup/SKILL.md DEBE verificar "refacil-sdd-ai --version"',
  );
});

// ── CA-14: METHODOLOGY-CONTRACT.md tiene sección §10 con regla de idioma ──

test('CA-14: METHODOLOGY-CONTRACT.md contiene sección §10', () => {
  const content = fs.readFileSync(CONTRACT_MD, 'utf8');
  assert.ok(
    content.includes('§10'),
    'METHODOLOGY-CONTRACT.md DEBE tener sección §10',
  );
});

test('CA-14: METHODOLOGY-CONTRACT.md §10 menciona idioma (español / inglés o English/language)', () => {
  const content = fs.readFileSync(CONTRACT_MD, 'utf8');
  const section10Index = content.indexOf('§10');
  assert.ok(section10Index !== -1, 'Debe existir §10');
  const section10 = content.slice(section10Index, section10Index + 500);
  // Acepta tanto formato español (español/inglés/idioma) como inglés (language/English/Spanish)
  const mentionsLanguage =
    section10.includes('español') ||
    section10.includes('inglés') ||
    section10.includes('idioma') ||
    section10.includes('Idioma') ||
    section10.includes('language') ||
    section10.includes('Language') ||
    section10.includes('English') ||
    section10.includes('Spanish');
  assert.ok(mentionsLanguage, 'La sección §10 DEBE mencionar regla de idioma (español/inglés o language/English)');
});

// ── CA-15: methodologyMigrationPending() no reporta carpetas openspec-* como migración pendiente ──

test('CA-15: methodology-migration-pending.js no tiene REQUIRED_OPENSPEC_SKILLS', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  assert.ok(
    !content.includes('REQUIRED_OPENSPEC_SKILLS'),
    'methodology-migration-pending.js NO debe tener REQUIRED_OPENSPEC_SKILLS',
  );
});

test('CA-15: methodology-migration-pending.js no tiene collectExtraOpenspecSkills', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  assert.ok(
    !content.includes('collectExtraOpenspecSkills'),
    'methodology-migration-pending.js NO debe tener collectExtraOpenspecSkills',
  );
});

test('CA-15: methodologyMigrationPending no detecta carpetas openspec-* como pendiente (runtime)', () => {
  const { methodologyMigrationPending } = require(MIGRATION_LIB);
  const os = require('os');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-ca15-'));
  try {
    // Crear carpeta openspec-legacy en .claude/skills/
    const skillDir = path.join(tmpRoot, '.claude', 'skills', 'openspec-legacy');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: x\n---\n', 'utf8');
    const r = methodologyMigrationPending(tmpRoot);
    assert.equal(r.pending, false, 'NO debe reportar carpetas openspec-* en .claude/skills/ como pendiente');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// ── CR-01: Las carpetas openspec-* en .claude/skills/ y .cursor/skills/ NO son eliminadas ──

test('CR-01: no existe código de eliminación de carpetas openspec-* en migration lib', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  // No debe haber rm/unlink/rmdir apuntando a openspec-*
  const hasDeletion = /rm.*openspec|unlink.*openspec|rmdir.*openspec|removeSync.*openspec/i.test(content);
  assert.ok(!hasDeletion, 'methodology-migration-pending.js NO debe eliminar carpetas openspec-*');
});

// ── CR-02: Archivos bajo .claude/skills/openspec-*/SKILL.md no son modificados ──
// Este CR se verifica a nivel de que los archivos de source del paquete no tocan esos paths

test('CR-02: migration lib no escribe en .claude/skills/openspec-*', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  const writesToOpenspecSkill =
    content.includes('.claude/skills/openspec') ||
    content.includes('.cursor/skills/openspec');
  assert.ok(!writesToOpenspecSkill, 'methodology-migration-pending.js NO debe escribir en .claude/skills/openspec-* ni .cursor/skills/openspec-*');
});

// ── CR-04: Lógica de sync de specs en archive (Paso 2B, post-delegación) se conserva idéntica ──

test('CR-04: archive/SKILL.md conserva lógica de sync de specs en Paso 2B', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  // La lógica de sincronización de specs debe estar presente
  const hasSyncSpecs =
    content.includes('sync') ||
    content.includes('refacil-sdd/specs') ||
    content.includes('specs sincronizadas') ||
    content.includes('Verificar sincronizacion');
  assert.ok(hasSyncSpecs, 'archive/SKILL.md DEBE conservar lógica de sync de specs en Paso 2B');
});

// ── CR-05: Reglas de degradación graceful presentes en el cuerpo del validator ──

test('CR-05: validator.md tiene reglas de degradación graceful en el cuerpo', () => {
  const content = fs.readFileSync(VALIDATOR_MD, 'utf8');
  // Las reglas deben estar en el cuerpo, no solo como comentario
  const hasGracefulBody =
    content.includes('Degradacion graceful') ||
    content.includes('Degradación graceful') ||
    content.includes('graceful');
  assert.ok(hasGracefulBody, 'validator.md DEBE tener reglas de degradación graceful en su cuerpo');
});

// ── CR-06: Regla de idioma en METHODOLOGY-CONTRACT.md §10 ──

test('CR-06: METHODOLOGY-CONTRACT.md tiene §10 con regla de idioma antes de ser archivado', () => {
  const content = fs.readFileSync(CONTRACT_MD, 'utf8');
  assert.ok(content.includes('§10'), 'METHODOLOGY-CONTRACT.md DEBE tener §10');
  const s10idx = content.indexOf('§10');
  const slice = content.slice(s10idx, s10idx + 300);
  assert.ok(
    slice.includes('español') || slice.includes('inglés') || slice.includes('idioma') ||
    slice.includes('language') || slice.includes('Language') || slice.includes('English') || slice.includes('Spanish'),
    '§10 DEBE contener regla de idioma',
  );
});

// ── CR-07: collectExtraOpsxClaude() y collectExtraOpsxCursor() no son eliminadas ni modificadas ──

test('CR-07: methodology-migration-pending.js exporta collectExtraOpsxClaude via código fuente', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  assert.ok(
    content.includes('collectExtraOpsxClaude'),
    'methodology-migration-pending.js DEBE tener la función collectExtraOpsxClaude',
  );
});

test('CR-07: methodology-migration-pending.js exporta collectExtraOpsxCursor via código fuente', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  assert.ok(
    content.includes('collectExtraOpsxCursor'),
    'methodology-migration-pending.js DEBE tener la función collectExtraOpsxCursor',
  );
});

test('CR-07: collectExtraOpsxClaude usa .claude/commands/opsx como directorio (no skills)', () => {
  const content = fs.readFileSync(MIGRATION_LIB, 'utf8');
  // Verificar que la función apunta a commands/opsx, no a skills/openspec
  assert.ok(
    content.includes('.claude/commands/opsx') || content.includes("'opsx'"),
    'collectExtraOpsxClaude DEBE operar sobre .claude/commands/opsx',
  );
});

// ── CR-08: .review-passed generado por sdd mark-reviewed es JSON válido con los campos requeridos ──
// (tests en sdd.test.js CA-16 y CA-17 ya cubren esto, pero agregamos uno de contenido aquí también)

test('CR-08: review/SKILL.md pasa campos verdict, summary, fail-count al comando mark-reviewed', () => {
  const content = fs.readFileSync(REVIEW_SKILL, 'utf8');
  assert.ok(
    content.includes('--verdict') && content.includes('--summary') && content.includes('--fail-count'),
    'review/SKILL.md DEBE pasar --verdict, --summary y --fail-count al comando mark-reviewed',
  );
});
