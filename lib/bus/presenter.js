const fs = require('fs');
const path = require('path');

const MAX_SUMMARY_CHARS = 400;
const BLOCK_START = '<!-- refacil-bus:presentation:start -->';
const BLOCK_END = '<!-- refacil-bus:presentation:end -->';

function readAgentsRaw(repoDir) {
  try {
    return fs.readFileSync(path.join(repoDir, 'AGENTS.md'), 'utf8');
  } catch (_) {
    return null;
  }
}

function readPresentationBlock(repoDir) {
  const raw = readAgentsRaw(repoDir);
  if (!raw) return null;
  const startIdx = raw.indexOf(BLOCK_START);
  if (startIdx === -1) return null;
  const endIdx = raw.indexOf(BLOCK_END, startIdx + BLOCK_START.length);
  if (endIdx === -1) return null;
  const body = raw.slice(startIdx + BLOCK_START.length, endIdx).trim();
  return body || null;
}

function hasPresentationBlock(repoDir) {
  return readPresentationBlock(repoDir) !== null;
}

function readPackageInfo(repoDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
    return {
      name: pkg.name || null,
      description: pkg.description || null,
    };
  } catch (_) {
    return { name: null, description: null };
  }
}

function readAgentsSummary(repoDir, maxChars = MAX_SUMMARY_CHARS) {
  const raw = readAgentsRaw(repoDir);
  if (!raw) return null;
  const lines = raw.split('\n');
  const body = [];
  let inLeadingHeaders = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inLeadingHeaders) {
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;
      inLeadingHeaders = false;
    }
    if (trimmed.startsWith('#')) break;
    if (!trimmed) {
      if (body.length > 0) break;
      continue;
    }
    body.push(trimmed);
    if (body.join(' ').length > maxChars) break;
  }
  const text = body.join(' ').trim();
  if (!text) return null;
  return text.length > maxChars ? text.slice(0, maxChars - 3).trimEnd() + '...' : text;
}

function buildIntro({ repoDir, session }) {
  const block = readPresentationBlock(repoDir);
  if (block) {
    // El bloque es la fuente de verdad: lo usamos literal, solo agregando el
    // prefijo de "se unió" y el sufijo con cómo consultar la sesión.
    return `${session} se unió a la sala.\n${block}\nPara consultarme: /refacil:ask @${session} "..."`;
  }
  // Fallback: componer desde package.json + primer párrafo de AGENTS.md
  const { name, description } = readPackageInfo(repoDir);
  const summary = readAgentsSummary(repoDir);
  const parts = [];
  parts.push(`${session} se unió a la sala.`);
  if (name && name !== session) parts.push(`Repo: ${name}.`);
  if (description) parts.push(`Descripción: ${description}.`);
  if (summary) parts.push(`Contexto: ${summary}`);
  parts.push(`Para consultarme: /refacil:ask @${session} "..."`);
  return parts.join(' ');
}

module.exports = {
  buildIntro,
  readPresentationBlock,
  hasPresentationBlock,
  readPackageInfo,
  readAgentsSummary,
  BLOCK_START,
  BLOCK_END,
  MAX_SUMMARY_CHARS,
};
