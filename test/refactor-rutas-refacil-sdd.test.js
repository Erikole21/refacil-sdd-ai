'use strict';

/**
 * Tests de contenido textual para el cambio refactor-rutas-refacil-sdd.
 * Verifican criterios CA y CR sobre archivos .md (skills, agentes, .claude/agents).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { globalClaudeDir } = require('../lib/global-paths');

// ROOT apunta a refacil-sdd-ai/
const ROOT = path.join(__dirname, '..');
// REPO_ROOT apunta a la raiz del monorepo (un nivel arriba de refacil-sdd-ai)
const REPO_ROOT = path.join(ROOT, '..');

// ── Rutas de skills ──
const PROPOSE_SKILL   = path.join(ROOT, 'skills', 'propose', 'SKILL.md');
const APPLY_SKILL     = path.join(ROOT, 'skills', 'apply', 'SKILL.md');
const VERIFY_SKILL    = path.join(ROOT, 'skills', 'verify', 'SKILL.md');
const ARCHIVE_SKILL   = path.join(ROOT, 'skills', 'archive', 'SKILL.md');
const REVIEW_SKILL    = path.join(ROOT, 'skills', 'review', 'SKILL.md');
const REVIEW_CHECKLIST = path.join(ROOT, 'skills', 'review', 'checklist.md');
const BUG_SKILL       = path.join(ROOT, 'skills', 'bug', 'SKILL.md');
const TEST_SKILL      = path.join(ROOT, 'skills', 'test', 'SKILL.md');
const UP_CODE_SKILL   = path.join(ROOT, 'skills', 'up-code', 'SKILL.md');
const GUIDE_SKILL     = path.join(ROOT, 'skills', 'guide', 'SKILL.md');
const CONTRACT_MD     = path.join(ROOT, 'skills', 'prereqs', 'METHODOLOGY-CONTRACT.md');
const PREREQS_SKILL   = path.join(ROOT, 'skills', 'prereqs', 'SKILL.md');

// ── Rutas de agentes (source en el paquete) ──
const PROPOSER_MD    = path.join(ROOT, 'agents', 'proposer.md');
const IMPLEMENTER_MD = path.join(ROOT, 'agents', 'implementer.md');
const AUDITOR_MD     = path.join(ROOT, 'agents', 'auditor.md');
const DEBUGGER_MD    = path.join(ROOT, 'agents', 'debugger.md');
const VALIDATOR_MD   = path.join(ROOT, 'agents', 'validator.md');

// ── Rutas de agentes instalados en ~/.claude/agents/ (global desde imp-global-install) ──
const CLAUDE_PROPOSER    = path.join(globalClaudeDir(os.homedir()), 'agents', 'refacil-proposer.md');
const CLAUDE_IMPLEMENTER = path.join(globalClaudeDir(os.homedir()), 'agents', 'refacil-implementer.md');
const CLAUDE_VALIDATOR   = path.join(globalClaudeDir(os.homedir()), 'agents', 'refacil-validator.md');

// ── Helpers ──
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// ════════════════════════════════════════════════════════════
// CA-01: Skills NO contienen `openspec/changes/` como ruta de trabajo
// (excl. OPENSPEC-DELTAS.md, setup/SKILL.md, setup/troubleshooting.md)
// ════════════════════════════════════════════════════════════

test('CA-01: propose/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(PROPOSE_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'propose/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: apply/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(APPLY_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'apply/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: verify/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(VERIFY_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'verify/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: archive/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(ARCHIVE_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'archive/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: review/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(REVIEW_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'review/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: review/checklist.md no contiene openspec/changes/', () => {
  const content = readFile(REVIEW_CHECKLIST);
  assert.ok(
    !content.includes('openspec/changes/'),
    'review/checklist.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: bug/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(BUG_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'bug/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: test/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(TEST_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'test/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: up-code/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(UP_CODE_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'up-code/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: guide/SKILL.md no contiene openspec/changes/', () => {
  const content = readFile(GUIDE_SKILL);
  assert.ok(
    !content.includes('openspec/changes/'),
    'guide/SKILL.md NO debe contener "openspec/changes/"',
  );
});

test('CA-01: prereqs/METHODOLOGY-CONTRACT.md no contiene openspec/changes/', () => {
  const content = readFile(CONTRACT_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'prereqs/METHODOLOGY-CONTRACT.md NO debe contener "openspec/changes/"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-02: Agentes (source) NO contienen `openspec/changes/` en instrucciones activas
// ════════════════════════════════════════════════════════════

test('CA-02: agents/proposer.md no contiene openspec/changes/', () => {
  const content = readFile(PROPOSER_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'agents/proposer.md NO debe contener "openspec/changes/"',
  );
});

test('CA-02: agents/implementer.md no contiene openspec/changes/', () => {
  const content = readFile(IMPLEMENTER_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'agents/implementer.md NO debe contener "openspec/changes/"',
  );
});

test('CA-02: agents/auditor.md no contiene openspec/changes/', () => {
  const content = readFile(AUDITOR_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'agents/auditor.md NO debe contener "openspec/changes/"',
  );
});

test('CA-02: agents/debugger.md no contiene openspec/changes/', () => {
  const content = readFile(DEBUGGER_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'agents/debugger.md NO debe contener "openspec/changes/"',
  );
});

test('CA-02: agents/validator.md no contiene openspec/changes/', () => {
  const content = readFile(VALIDATOR_MD);
  assert.ok(
    !content.includes('openspec/changes/'),
    'agents/validator.md NO debe contener "openspec/changes/"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-03: Skills y agentes NO contienen `openspec/specs/` como ruta activa
// ════════════════════════════════════════════════════════════

test('CA-03: propose/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(PROPOSE_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'propose/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: apply/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(APPLY_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'apply/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: verify/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(VERIFY_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'verify/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: archive/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(ARCHIVE_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'archive/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: review/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(REVIEW_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'review/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: bug/SKILL.md no contiene openspec/specs/', () => {
  const content = readFile(BUG_SKILL);
  assert.ok(!content.includes('openspec/specs/'), 'bug/SKILL.md NO debe contener "openspec/specs/"');
});

test('CA-03: agents/proposer.md no contiene openspec/specs/', () => {
  const content = readFile(PROPOSER_MD);
  assert.ok(!content.includes('openspec/specs/'), 'agents/proposer.md NO debe contener "openspec/specs/"');
});

test('CA-03: agents/implementer.md no contiene openspec/specs/', () => {
  const content = readFile(IMPLEMENTER_MD);
  assert.ok(!content.includes('openspec/specs/'), 'agents/implementer.md NO debe contener "openspec/specs/"');
});

test('CA-03: agents/validator.md no contiene openspec/specs/', () => {
  const content = readFile(VALIDATOR_MD);
  assert.ok(!content.includes('openspec/specs/'), 'agents/validator.md NO debe contener "openspec/specs/"');
});

// ════════════════════════════════════════════════════════════
// CA-04: METHODOLOGY-CONTRACT.md §8 menciona refacil-sdd/changes/<cambio>/
// Nota: las secciones usan la forma "## 8)" (no "§8" como heading); §8 se menciona inline
// ════════════════════════════════════════════════════════════

test('CA-04: METHODOLOGY-CONTRACT.md sección 8 menciona refacil-sdd/changes/', () => {
  const content = readFile(CONTRACT_MD);
  // La sección usa "## §8" como heading (traducido de "## 8)")
  const s8idx = content.indexOf('## §8');
  assert.ok(s8idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §8"');
  const s9idx = content.indexOf('## §9', s8idx);
  const section8 = s9idx !== -1
    ? content.slice(s8idx, s9idx)
    : content.slice(s8idx, s8idx + 800);
  assert.ok(
    section8.includes('refacil-sdd/changes/'),
    'METHODOLOGY-CONTRACT.md sección 8 DEBE mencionar "refacil-sdd/changes/" (no "openspec/changes/")',
  );
});

test('CA-04: METHODOLOGY-CONTRACT.md sección 8 NO menciona openspec/changes/', () => {
  const content = readFile(CONTRACT_MD);
  const s8idx = content.indexOf('## §8');
  assert.ok(s8idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §8"');
  const s9idx = content.indexOf('## §9', s8idx);
  const section8 = s9idx !== -1
    ? content.slice(s8idx, s9idx)
    : content.slice(s8idx, s8idx + 800);
  assert.ok(
    !section8.includes('openspec/changes/'),
    'METHODOLOGY-CONTRACT.md sección 8 NO debe mencionar "openspec/changes/"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-05: METHODOLOGY-CONTRACT.md §9 describe refacil-sdd/changes/<cambio>/
// y NO contiene "openspec/changes/" ni "CLI de OpenSpec falla"
// ════════════════════════════════════════════════════════════

test('CA-05: METHODOLOGY-CONTRACT.md sección 9 menciona refacil-sdd/changes/', () => {
  const content = readFile(CONTRACT_MD);
  const s9idx = content.indexOf('## §9');
  assert.ok(s9idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §9"');
  const s10idx = content.indexOf('## §10', s9idx);
  const section9 = s10idx !== -1
    ? content.slice(s9idx, s10idx)
    : content.slice(s9idx, s9idx + 800);
  assert.ok(
    section9.includes('refacil-sdd/changes/'),
    'METHODOLOGY-CONTRACT.md sección 9 DEBE mencionar "refacil-sdd/changes/"',
  );
});

test('CA-05: METHODOLOGY-CONTRACT.md sección 9 NO contiene openspec/changes/', () => {
  const content = readFile(CONTRACT_MD);
  const s9idx = content.indexOf('## §9');
  assert.ok(s9idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §9"');
  const s10idx = content.indexOf('## §10', s9idx);
  const section9 = s10idx !== -1
    ? content.slice(s9idx, s10idx)
    : content.slice(s9idx, s9idx + 800);
  assert.ok(
    !section9.includes('openspec/changes/'),
    'METHODOLOGY-CONTRACT.md sección 9 NO debe contener "openspec/changes/"',
  );
});

test('CA-05: METHODOLOGY-CONTRACT.md sección 9 NO contiene "CLI de OpenSpec falla"', () => {
  const content = readFile(CONTRACT_MD);
  const s9idx = content.indexOf('## §9');
  assert.ok(s9idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §9"');
  const s10idx = content.indexOf('## §10', s9idx);
  const section9 = s10idx !== -1
    ? content.slice(s9idx, s10idx)
    : content.slice(s9idx, s9idx + 800);
  assert.ok(
    !section9.includes('CLI de OpenSpec falla'),
    'METHODOLOGY-CONTRACT.md sección 9 NO debe contener "CLI de OpenSpec falla"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-06: METHODOLOGY-CONTRACT.md §7 usa refacil-sdd/specs/ y NO openspec/specs/
// ════════════════════════════════════════════════════════════

test('CA-06: METHODOLOGY-CONTRACT.md sección 7 usa refacil-sdd/specs/', () => {
  const content = readFile(CONTRACT_MD);
  const s7idx = content.indexOf('## §7');
  assert.ok(s7idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §7"');
  const s8idx = content.indexOf('## §8', s7idx);
  const section7 = s8idx !== -1
    ? content.slice(s7idx, s8idx)
    : content.slice(s7idx, s7idx + 800);
  assert.ok(
    section7.includes('refacil-sdd/specs/'),
    'METHODOLOGY-CONTRACT.md sección 7 DEBE usar "refacil-sdd/specs/" como destino de metadata de review',
  );
});

test('CA-06: METHODOLOGY-CONTRACT.md sección 7 NO contiene openspec/specs/', () => {
  const content = readFile(CONTRACT_MD);
  const s7idx = content.indexOf('## §7');
  assert.ok(s7idx !== -1, 'METHODOLOGY-CONTRACT.md DEBE tener sección "## §7"');
  const s8idx = content.indexOf('## §8', s7idx);
  const section7 = s8idx !== -1
    ? content.slice(s7idx, s8idx)
    : content.slice(s7idx, s7idx + 800);
  assert.ok(
    !section7.includes('openspec/specs/'),
    'METHODOLOGY-CONTRACT.md §7 NO debe contener "openspec/specs/"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-07: prereqs/SKILL.md perfil `openspec` NO contiene instrucción de abortar si openspec --version falla
// ════════════════════════════════════════════════════════════

test('CA-07: prereqs/SKILL.md NO contiene instrucción de abortar si openspec --version falla', () => {
  const content = readFile(PREREQS_SKILL);
  // Verificar que no existe la combinación de "openspec --version" + abortar/abort/stop
  const hasAbortOnVersion =
    /openspec\s+--version.*abortar/i.test(content) ||
    /openspec\s+--version.*abort/i.test(content) ||
    /openspec\s+--version.*falla.*abortar/i.test(content) ||
    /si.*openspec.*falla.*abortar/i.test(content) ||
    /openspec.*falla.*aborta/i.test(content);
  assert.ok(
    !hasAbortOnVersion,
    'prereqs/SKILL.md NO debe tener instrucción de abortar si openspec --version falla',
  );
});

test('CA-07: prereqs/SKILL.md contiene perfil sdd (no fue eliminado)', () => {
  const content = readFile(PREREQS_SKILL);
  // Acepta tanto formato español ("Perfil `sdd`") como inglés ("sdd` profile" o "## `sdd`")
  const hasSddProfile =
    content.includes('## Perfil `sdd`') ||
    content.includes('perfil `sdd`') ||
    content.includes('`sdd` profile') ||
    content.includes('## `sdd`');
  assert.ok(
    hasSddProfile,
    'prereqs/SKILL.md DEBE contener el perfil "sdd" (no fue eliminado por el refactor)',
  );
});

// ════════════════════════════════════════════════════════════
// CA-08: Agentes instalados en .claude/agents/ NO apuntan a openspec/changes/
// ════════════════════════════════════════════════════════════

test('CA-08: .claude/agents/refacil-proposer.md existe', () => {
  assert.ok(
    fileExists(CLAUDE_PROPOSER),
    '.claude/agents/refacil-proposer.md DEBE existir (instalado)',
  );
});

test('CA-08: .claude/agents/refacil-proposer.md no contiene openspec/changes/', () => {
  if (!fileExists(CLAUDE_PROPOSER)) return; // skip si no instalado
  const content = readFile(CLAUDE_PROPOSER);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-proposer.md NO debe contener "openspec/changes/"',
  );
});

test('CA-08: .claude/agents/refacil-implementer.md existe', () => {
  assert.ok(
    fileExists(CLAUDE_IMPLEMENTER),
    '.claude/agents/refacil-implementer.md DEBE existir (instalado)',
  );
});

test('CA-08: .claude/agents/refacil-implementer.md no contiene openspec/changes/', () => {
  if (!fileExists(CLAUDE_IMPLEMENTER)) return; // skip si no instalado
  const content = readFile(CLAUDE_IMPLEMENTER);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-implementer.md NO debe contener "openspec/changes/"',
  );
});

test('CA-08: .claude/agents/refacil-validator.md existe', () => {
  assert.ok(
    fileExists(CLAUDE_VALIDATOR),
    '.claude/agents/refacil-validator.md DEBE existir (instalado)',
  );
});

test('CA-08: .claude/agents/refacil-validator.md no contiene openspec/changes/', () => {
  if (!fileExists(CLAUDE_VALIDATOR)) return; // skip si no instalado
  const content = readFile(CLAUDE_VALIDATOR);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-validator.md NO debe contener "openspec/changes/"',
  );
});

// ════════════════════════════════════════════════════════════
// CA-09: lib/installer.js sin rutas de trabajo refacil:* hacia openspec/
// ════════════════════════════════════════════════════════════

test('CA-09: lib/installer.js no tiene rutas refacil-* apuntando a openspec/', () => {
  const installerPath = path.join(ROOT, 'lib', 'installer.js');
  const content = readFile(installerPath);
  // Las rutas openspec/ que sigan apareciendo deben estar en contexto opsx (openspec-*)
  // Estrategia: buscar líneas que contengan 'openspec/' pero que no estén en contexto opsx
  // Forma simple: verificar que no haya "refacil-sdd/openspec/" ni "refacil/openspec/" ni rutas de trabajo
  // La regla es que rutas de trabajo para skills refacil:* deben ir a refacil-sdd/, no a openspec/
  // Verificamos que no exista patrón de path que combine skills refacil con openspec/changes
  const hasRefacilToOpenspec =
    /refacil.*openspec\/changes/i.test(content) ||
    /refacil.*openspec\/specs/i.test(content);
  assert.ok(
    !hasRefacilToOpenspec,
    'lib/installer.js NO debe tener rutas de trabajo refacil:* apuntando a openspec/changes/ o openspec/specs/',
  );
});

// ════════════════════════════════════════════════════════════
// CR-01 (actualizado — remove-openspec-skills): openspec-* en .claude/skills/ fueron
// eliminados por removeOpenspecLegacyAssets. Se verifica que ya NO existen.
// ════════════════════════════════════════════════════════════

test('CR-01: .claude/skills/openspec-archive-change/ ya no existe (eliminado por removeOpenspecLegacyAssets)', () => {
  const opsx = path.join(REPO_ROOT, '.claude', 'skills', 'openspec-archive-change');
  assert.ok(!fileExists(opsx), '.claude/skills/openspec-archive-change/ DEBE haber sido eliminado por removeOpenspecLegacyAssets');
});

test('CR-01: .claude/skills/openspec-archive-change/SKILL.md sigue siendo opsx (contiene openspec/changes/)', () => {
  const opsx = path.join(REPO_ROOT, '.claude', 'skills', 'openspec-archive-change', 'SKILL.md');
  if (!fileExists(opsx)) return;
  const content = readFile(opsx);
  assert.ok(
    content.includes('openspec/changes/'),
    '.claude/skills/openspec-archive-change/SKILL.md DEBE seguir conteniendo "openspec/changes/" (skill opsx intacta)',
  );
});

test('CR-01: .claude/skills/openspec-propose/ ya no existe (eliminado por removeOpenspecLegacyAssets)', () => {
  const opsx = path.join(REPO_ROOT, '.claude', 'skills', 'openspec-propose');
  assert.ok(!fileExists(opsx), '.claude/skills/openspec-propose/ DEBE haber sido eliminado por removeOpenspecLegacyAssets');
});

// ════════════════════════════════════════════════════════════
// CR-02: Agentes instalados en .claude/agents/ no apuntan a openspec/changes/
// (mismo que CA-08, pero desde la perspectiva de rechazo)
// ════════════════════════════════════════════════════════════

test('CR-02: .claude/agents/refacil-proposer.md no apunta a openspec/changes/', () => {
  if (!fileExists(CLAUDE_PROPOSER)) return;
  const content = readFile(CLAUDE_PROPOSER);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-proposer.md NO debe apuntar a openspec/changes/',
  );
});

test('CR-02: .claude/agents/refacil-implementer.md no apunta a openspec/changes/', () => {
  if (!fileExists(CLAUDE_IMPLEMENTER)) return;
  const content = readFile(CLAUDE_IMPLEMENTER);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-implementer.md NO debe apuntar a openspec/changes/',
  );
});

test('CR-02: .claude/agents/refacil-validator.md no apunta a openspec/changes/', () => {
  if (!fileExists(CLAUDE_VALIDATOR)) return;
  const content = readFile(CLAUDE_VALIDATOR);
  assert.ok(
    !content.includes('openspec/changes/'),
    '.claude/agents/refacil-validator.md NO debe apuntar a openspec/changes/',
  );
});

// ════════════════════════════════════════════════════════════
// CR-03: No se perdieron instrucciones funcionales — verificar que archivos clave no están vacíos
// y que conservan sus secciones principales
// ════════════════════════════════════════════════════════════

test('CR-03: propose/SKILL.md conserva instrucciones funcionales (no está vacío)', () => {
  const content = readFile(PROPOSE_SKILL);
  assert.ok(content.length > 500, 'propose/SKILL.md DEBE tener contenido sustancial (>500 chars)');
});

test('CR-03: apply/SKILL.md conserva instrucciones funcionales', () => {
  const content = readFile(APPLY_SKILL);
  assert.ok(content.length > 500, 'apply/SKILL.md DEBE tener contenido sustancial (>500 chars)');
});

test('CR-03: archive/SKILL.md conserva instrucciones funcionales', () => {
  const content = readFile(ARCHIVE_SKILL);
  assert.ok(content.length > 500, 'archive/SKILL.md DEBE tener contenido sustancial (>500 chars)');
});

test('CR-03: agents/proposer.md conserva instrucciones funcionales', () => {
  const content = readFile(PROPOSER_MD);
  assert.ok(content.length > 500, 'agents/proposer.md DEBE tener contenido sustancial (>500 chars)');
});

test('CR-03: agents/implementer.md conserva instrucciones funcionales', () => {
  const content = readFile(IMPLEMENTER_MD);
  assert.ok(content.length > 500, 'agents/implementer.md DEBE tener contenido sustancial (>500 chars)');
});

test('CR-03: METHODOLOGY-CONTRACT.md conserva instrucciones funcionales', () => {
  const content = readFile(CONTRACT_MD);
  assert.ok(content.length > 1000, 'METHODOLOGY-CONTRACT.md DEBE tener contenido sustancial (>1000 chars)');
});

// ════════════════════════════════════════════════════════════
// CR-04: METHODOLOGY-CONTRACT.md §7, §8 y §9 son consistentes — usan refacil-sdd/ en todas
// ════════════════════════════════════════════════════════════

test('CR-04: METHODOLOGY-CONTRACT.md sección 7 usa refacil-sdd/ (consistencia)', () => {
  const content = readFile(CONTRACT_MD);
  const s7idx = content.indexOf('## §7');
  assert.ok(s7idx !== -1, 'DEBE existir sección "## §7"');
  const s8idx = content.indexOf('## §8', s7idx);
  const section7 = s8idx !== -1
    ? content.slice(s7idx, s8idx)
    : content.slice(s7idx, s7idx + 800);
  assert.ok(
    section7.includes('refacil-sdd/'),
    'METHODOLOGY-CONTRACT.md sección 7 DEBE usar "refacil-sdd/" (consistencia entre secciones)',
  );
});

test('CR-04: METHODOLOGY-CONTRACT.md sección 8 usa refacil-sdd/ (consistencia)', () => {
  const content = readFile(CONTRACT_MD);
  const s8idx = content.indexOf('## §8');
  assert.ok(s8idx !== -1, 'DEBE existir sección "## §8"');
  const s9idx = content.indexOf('## §9', s8idx);
  const section8 = s9idx !== -1
    ? content.slice(s8idx, s9idx)
    : content.slice(s8idx, s8idx + 800);
  assert.ok(
    section8.includes('refacil-sdd/'),
    'METHODOLOGY-CONTRACT.md sección 8 DEBE usar "refacil-sdd/" (consistencia entre secciones)',
  );
});

test('CR-04: METHODOLOGY-CONTRACT.md sección 9 usa refacil-sdd/ (consistencia)', () => {
  const content = readFile(CONTRACT_MD);
  const s9idx = content.indexOf('## §9');
  assert.ok(s9idx !== -1, 'DEBE existir sección "## §9"');
  const s10idx = content.indexOf('## §10', s9idx);
  const section9 = s10idx !== -1
    ? content.slice(s9idx, s10idx)
    : content.slice(s9idx, s9idx + 800);
  assert.ok(
    section9.includes('refacil-sdd/'),
    'METHODOLOGY-CONTRACT.md sección 9 DEBE usar "refacil-sdd/" (consistencia entre secciones)',
  );
});

test('CR-04: METHODOLOGY-CONTRACT.md NO contiene openspec/specs/ en ninguna seccion', () => {
  const content = readFile(CONTRACT_MD);
  assert.ok(
    !content.includes('openspec/specs/'),
    'METHODOLOGY-CONTRACT.md NO debe contener "openspec/specs/" en ninguna sección',
  );
});

// ════════════════════════════════════════════════════════════
// CR-05: El perfil fue renombrado a `sdd` (T-14) — debe existir como `sdd`, no como `openspec`
// ════════════════════════════════════════════════════════════

test('CR-05: prereqs/SKILL.md contiene el perfil sdd (renombrado de openspec por T-14)', () => {
  const content = readFile(PREREQS_SKILL);
  // T-14 renombró el perfil de `openspec` a `sdd` — acepta formato español e inglés
  const hasProfile =
    content.includes('## Perfil `sdd`') ||
    content.includes('perfil `sdd`') ||
    content.includes('`sdd` profile') ||
    content.includes('## `sdd`');
  assert.ok(
    hasProfile,
    'prereqs/SKILL.md DEBE contener el perfil "sdd" (renombrado de openspec por T-14)',
  );
});

test('CR-05: prereqs/SKILL.md no contiene el perfil openspec (fue renombrado)', () => {
  const content = readFile(PREREQS_SKILL);
  const hasOldProfile =
    content.includes('## Perfil `openspec`') ||
    content.includes('perfil `openspec`');
  assert.ok(
    !hasOldProfile,
    'prereqs/SKILL.md NO debe contener el perfil "openspec" — fue renombrado a "sdd" por T-14',
  );
});

test('CR-05: prereqs/SKILL.md no está vacío después del refactor', () => {
  const content = readFile(PREREQS_SKILL);
  assert.ok(content.length > 200, 'prereqs/SKILL.md DEBE tener contenido (>200 chars) — no vacío por refactor');
});
