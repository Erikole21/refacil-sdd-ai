'use strict';

const fs = require('fs');
const path = require('path');

const BASE_ENTRIES = [
  '# Dependencias',
  'node_modules/',
  '',
  '# Build/dist',
  'dist/',
  'build/',
  '.next/',
  'out/',
  '',
  '# Logs',
  '*.log',
  'logs/',
  'npm-debug.log*',
  '',
  '# Cache y temporales',
  '.cache/',
  'tmp/',
  'temp/',
  '.parcel-cache/',
  '.turbo/',
  '',
  '# Binarios y medios pesados',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.pdf',
  '*.zip',
  '*.tar.gz',
  '*.mp4',
  '*.mp3',
  '',
  '# Secretos y credenciales',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'credentials.json',
  'secrets.json',
  '',
  '# Cobertura y reportes',
  'coverage/',
  '.nyc_output/',
];

function isSignificant(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

function syncIgnoreFile(filePath) {
  const significantBase = BASE_ENTRIES.filter(isSignificant);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, BASE_ENTRIES.join('\n') + '\n');
    return { status: 'created', added: significantBase.length };
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const existingLines = existing.split('\n').map((l) => l.trim());

  const missing = BASE_ENTRIES.filter(
    (entry) => isSignificant(entry) && !existingLines.includes(entry.trim()),
  );

  if (missing.length === 0) {
    return { status: 'noop', added: 0 };
  }

  const separator = existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(filePath, existing + separator + missing.join('\n') + '\n');
  return { status: 'updated', added: missing.length };
}

function syncIgnoreFiles(projectRoot, ideDirs) {
  const dirs = ideDirs || ['.claude', '.cursor', '.opencode'];
  const result = {};
  if (dirs.includes('.claude')) {
    result.claude = syncIgnoreFile(path.join(projectRoot, '.claudeignore'));
  }
  if (dirs.includes('.cursor')) {
    result.cursor = syncIgnoreFile(path.join(projectRoot, '.cursorignore'));
  }
  if (dirs.includes('.opencode')) {
    result.opencode = syncIgnoreFile(path.join(projectRoot, '.opencodeignore'));
  }
  return result;
}

module.exports = { syncIgnoreFiles, BASE_ENTRIES };
