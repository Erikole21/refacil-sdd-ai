const fs = require('fs');
const path = require('path');

const MARKER_START = '<!-- refacil-sdd-ai:compact-guidance:start -->';
const MARKER_END = '<!-- refacil-sdd-ai:compact-guidance:end -->';

function readTemplate(packageRoot) {
  const tplPath = path.join(packageRoot, 'templates', 'compact-guidance.md');
  return fs.readFileSync(tplPath, 'utf8').trimEnd();
}

function buildBlock(templateContent) {
  return `${MARKER_START}\n${templateContent}\n${MARKER_END}`;
}

function syncCompactGuidance(projectRoot, packageRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return { status: 'skipped-no-agents-md' };
  }

  const template = readTemplate(packageRoot);
  const block = buildBlock(template);
  const existing = fs.readFileSync(agentsPath, 'utf8');

  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  let next;
  let action;

  if (startIdx === -1 || endIdx === -1) {
    next = existing.trimEnd() + '\n\n' + block + '\n';
    action = 'appended';
  } else {
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + MARKER_END.length);
    next = before + block + after;
    action = 'replaced';
  }

  if (next === existing) {
    return { status: 'unchanged' };
  }

  fs.writeFileSync(agentsPath, next);
  return { status: action };
}

function removeCompactGuidance(projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return { status: 'skipped-no-agents-md' };
  }

  const existing = fs.readFileSync(agentsPath, 'utf8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    return { status: 'not-present' };
  }

  const before = existing.substring(0, startIdx).trimEnd();
  const after = existing.substring(endIdx + MARKER_END.length);
  const next = (before + '\n' + after.replace(/^\s+/, '')).trimEnd() + '\n';

  fs.writeFileSync(agentsPath, next);
  return { status: 'removed' };
}

module.exports = {
  syncCompactGuidance,
  removeCompactGuidance,
  MARKER_START,
  MARKER_END,
};
