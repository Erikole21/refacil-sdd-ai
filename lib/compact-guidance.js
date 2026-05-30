const fs = require('fs');
const path = require('path');

const MARKER_START = '<!-- refacil-sdd-ai:compact-guidance:start -->';
const MARKER_END = '<!-- refacil-sdd-ai:compact-guidance:end -->';
const LEGACY_MARKER_START = '<!-- compact-guidance:start -->';
const LEGACY_MARKER_END = '<!-- compact-guidance:end -->';

/**
 * Removes obsolete empty placeholder pair (pre-refacil-sdd-ai naming).
 * Preserves the block if non-whitespace content exists between legacy markers.
 */
function stripLegacyCompactGuidanceMarkers(content) {
  const startIdx = content.indexOf(LEGACY_MARKER_START);
  if (startIdx === -1) return content;

  const endIdx = content.indexOf(LEGACY_MARKER_END, startIdx + LEGACY_MARKER_START.length);
  if (endIdx === -1) return content;

  const inner = content.substring(startIdx + LEGACY_MARKER_START.length, endIdx);
  if (inner.trim() !== '') return content;

  const before = content.substring(0, startIdx).trimEnd();
  const after = content.substring(endIdx + LEGACY_MARKER_END.length).replace(/^\s+/, '');
  if (!before) return after.trimStart();
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

function readTemplate(packageRoot) {
  const tplPath = path.join(packageRoot, 'templates', 'compact-guidance.md');
  return fs.readFileSync(tplPath, 'utf8').trimEnd();
}

function buildBlock(templateContent) {
  return `${MARKER_START}\n${templateContent}\n${MARKER_END}`;
}

/** Normalize line endings for idempotent compare (CA-02 / Windows CRLF). */
function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

function contentUnchanged(next, raw) {
  const a = normalizeEol(next).trimEnd() + '\n';
  const b = normalizeEol(raw).trimEnd() + '\n';
  return a === b;
}

function syncCompactGuidance(projectRoot, packageRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return { status: 'skipped-no-agents-md' };
  }

  const template = readTemplate(packageRoot);
  const block = buildBlock(template);
  const raw = fs.readFileSync(agentsPath, 'utf8');
  const existing = stripLegacyCompactGuidanceMarkers(raw);

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

  const normalized = next.trimEnd() + '\n';
  if (contentUnchanged(normalized, raw)) {
    return { status: 'unchanged' };
  }

  fs.writeFileSync(agentsPath, normalized);
  return { status: action };
}

function removeCompactGuidance(projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    return { status: 'skipped-no-agents-md' };
  }

  const raw = fs.readFileSync(agentsPath, 'utf8');
  const existing = stripLegacyCompactGuidanceMarkers(raw);
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    const legacyOnly = stripLegacyCompactGuidanceMarkers(raw);
    if (legacyOnly !== raw) {
      fs.writeFileSync(agentsPath, legacyOnly.trimEnd() + '\n');
      return { status: 'legacy-removed' };
    }
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
  stripLegacyCompactGuidanceMarkers,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
};
