'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Motor compartido con `refacil-sdd-ai migration-pending`, hooks `check-update` / `notify-update`
 * y la skill `refacil:update`. Si ninguna condicion aplica, no hace falta migrar metodologia.
 */
const REQUIRED_OPSX_CLAUDE = new Set([
  'apply.md',
  'archive.md',
  'explore.md',
  'propose.md',
  'verify.md',
]);

const REQUIRED_OPSX_CURSOR = new Set([
  'opsx-apply.md',
  'opsx-archive.md',
  'opsx-explore.md',
  'opsx-propose.md',
  'opsx-verify.md',
]);

function legacyIndexDoc(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).length;
  const pointsToAgents = /AGENTS\.md/i.test(content);
  return lines > 5 || !pointsToAgents;
}

function collectExtraOpsxClaude(root) {
  const dir = path.join(root, '.claude', 'commands', 'opsx');
  if (!fs.existsSync(dir)) return [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const extra = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    if (REQUIRED_OPSX_CLAUDE.has(name)) continue;
    extra.push(path.join('.claude/commands/opsx', name));
  }
  return extra;
}

function collectExtraOpsxCursor(root) {
  const dir = path.join(root, '.cursor', 'commands');
  if (!fs.existsSync(dir)) return [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const extra = [];
  for (const name of names) {
    if (!name.startsWith('opsx-') || !name.endsWith('.md')) continue;
    if (REQUIRED_OPSX_CURSOR.has(name)) continue;
    extra.push(path.join('.cursor/commands', name));
  }
  return extra;
}

/**
 * @param {string} root - raíz del repo
 * @returns {{ pending: boolean, reasons: string[] }}
 */
function methodologyMigrationPending(root) {
  const reasons = [];

  const agentsMd = path.join(root, 'AGENTS.md');
  const agentsDir = path.join(root, '.agents');
  if (fs.existsSync(agentsMd) && !fs.existsSync(agentsDir)) {
    reasons.push('AGENTS.md existe sin carpeta .agents/');
  }

  const claudeMd = path.join(root, 'CLAUDE.md');
  if (legacyIndexDoc(claudeMd)) {
    reasons.push('CLAUDE.md requiere normalización (índice mínimo → AGENTS.md)');
  }

  const cursorRules = path.join(root, '.cursorrules');
  if (legacyIndexDoc(cursorRules)) {
    reasons.push('.cursorrules requiere normalización (índice mínimo → AGENTS.md)');
  }

  const extraOpsx = [...collectExtraOpsxClaude(root), ...collectExtraOpsxCursor(root)];
  if (extraOpsx.length) {
    reasons.push(`commands opsx sobrantes: ${extraOpsx.join(', ')}`);
  }

  return { pending: reasons.length > 0, reasons };
}

module.exports = { methodologyMigrationPending };
