'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HOME_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const SESSIONS_DIR = path.join(HOME_DIR, 'read-spec-sessions');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_ID_RE = /^[a-f0-9-]{36}$/i;

function ensureSessionsDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * @param {string} sessionId
 * @returns {boolean}
 */
function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId);
}

function sessionFilePath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

/**
 * Remove session files older than SESSION_TTL_MS.
 */
function cleanupStaleSessions() {
  ensureSessionsDir();
  const now = Date.now();
  let entries;
  try {
    entries = fs.readdirSync(SESSIONS_DIR);
  } catch (_) {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(SESSIONS_DIR, name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > SESSION_TTL_MS) {
        fs.unlinkSync(full);
      }
    } catch (_) {
      // ignore per-file errors
    }
  }
}

/**
 * Write a file-mode session (single file).
 *
 * @param {{ sections: object[], meta: object, sourcePath: string, createdAt?: string }} payload
 * @returns {string} sessionId
 */
function writeSession(payload) {
  ensureSessionsDir();
  cleanupStaleSessions();
  const sessionId = crypto.randomUUID();
  const filePath = sessionFilePath(sessionId);
  const data = {
    mode: 'file',
    sections: payload.sections,
    meta: payload.meta,
    sourcePath: payload.sourcePath,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return sessionId;
}

/**
 * Write a folder-mode session (multiple files with sidebar).
 *
 * Session format:
 * {
 *   mode: "folder",
 *   files: [{ name: string, relPath: string, sections: object[] }],
 *   selectedFile: string,
 *   meta: { lang, voice, speed, changeName },
 *   sourcePath: string,
 *   createdAt: string
 * }
 *
 * @param {{ files: Array<{ name: string, relPath: string, sections: object[] }>, selectedFile: string, meta: object, sourcePath: string, createdAt?: string }} payload
 * @returns {string} sessionId
 */
function writeFolderSession(payload) {
  ensureSessionsDir();
  cleanupStaleSessions();
  const sessionId = crypto.randomUUID();
  const filePath = sessionFilePath(sessionId);
  // Expose the sections of the selected file at the top level for backward compat
  // with the /api/read-spec handler which reads sessionData.sections.
  const selectedFile = payload.files.find((f) => f.name === payload.selectedFile) || payload.files[0];
  const data = {
    mode: 'folder',
    files: payload.files,
    selectedFile: payload.selectedFile,
    // sections of the initially selected file (for compat with existing HTTP handler)
    sections: selectedFile ? selectedFile.sections : [],
    meta: payload.meta,
    sourcePath: payload.sourcePath,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return sessionId;
}

/**
 * @param {string} sessionId
 * @returns {object | null}
 */
function readSession(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  const filePath = sessionFilePath(sessionId);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

module.exports = {
  HOME_DIR,
  SESSIONS_DIR,
  SESSION_TTL_MS,
  isValidSessionId,
  writeSession,
  writeFolderSession,
  readSession,
  cleanupStaleSessions,
};
