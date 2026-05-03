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

function readPackageJson(repoDir) {
  const p = path.join(repoDir, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const name = pkg.name || null;
    const description = pkg.description || null;
    return name || description ? { name, description } : null;
  } catch (_) {
    return null;
  }
}

function readPyprojectIdentity(repoDir) {
  const p = path.join(repoDir, 'pyproject.toml');
  if (!fs.existsSync(p)) return null;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
  const blockMatch = raw.match(/\[\s*project\s*\]([\s\S]*)/m);
  if (!blockMatch) return null;
  let block = blockMatch[1];
  const nextHdr = block.search(/^\[\s*[^\]\s]+\s*\]\s*$/m);
  if (nextHdr !== -1) block = block.slice(0, nextHdr);
  const nameM = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
  const descM = block.match(/^\s*description\s*=\s*"([^"]*)"/m);
  if (!nameM && !descM) return null;
  return { name: nameM ? nameM[1] : null, description: descM ? descM[1] : null };
}

function readCargoIdentity(repoDir) {
  const p = path.join(repoDir, 'Cargo.toml');
  if (!fs.existsSync(p)) return null;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
  const blockMatch = raw.match(/^\[\s*package\s*\]([\s\S]*)/m);
  if (!blockMatch) return null;
  let block = blockMatch[1];
  const nextHdr = block.search(/^\[\s*[^\]\s]+\s*\]\s*$/m);
  if (nextHdr !== -1) block = block.slice(0, nextHdr);
  const nameM = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
  const descM = block.match(/^\s*description\s*=\s*"([^"]*)"/m);
  if (!nameM) return null;
  return { name: nameM[1], description: descM ? descM[1] : null };
}

function readGoModIdentity(repoDir) {
  const p = path.join(repoDir, 'go.mod');
  if (!fs.existsSync(p)) return null;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
  const m = raw.match(/^module\s+(\S+)/m);
  if (!m) return null;
  const mod = m[1].replace(/\.git$/i, '');
  const parts = mod.split('/');
  const name = parts.length ? parts[parts.length - 1] : mod;
  return name ? { name, description: null } : null;
}

/**
 * Repo identity for bus intros when package.json does not exist (polyglot repos).
 */
function readRepoIdentity(repoDir) {
  const chain = [readPackageJson, readPyprojectIdentity, readCargoIdentity, readGoModIdentity];
  for (const fn of chain) {
    const out = fn(repoDir);
    if (out && (out.name || out.description)) return out;
  }
  return { name: null, description: null };
}

/** @deprecated Use readRepoIdentity — kept for callers expecting the old name */
function readPackageInfo(repoDir) {
  return readRepoIdentity(repoDir);
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
  // Fallback: manifests (Node/Python/Rust/Go…) + primer párrafo de AGENTS.md
  const { name, description } = readRepoIdentity(repoDir);
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
  readRepoIdentity,
  readPackageInfo,
  readAgentsSummary,
  BLOCK_START,
  BLOCK_END,
  MAX_SUMMARY_CHARS,
};
