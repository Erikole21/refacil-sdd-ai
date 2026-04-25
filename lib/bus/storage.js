const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const BUS_DIR = path.join(HOME_DIR, 'bus');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATE_INTERVAL_MS = 60 * 60 * 1000; // evalúa rotación como máx. 1 vez por hora por sala

function sanitizeRoom(name) {
  // Evita path traversal y nombres raros.
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function roomDir(room) {
  return path.join(BUS_DIR, sanitizeRoom(room));
}

function inboxPath(room) {
  return path.join(roomDir(room), 'inbox.jsonl');
}

function metaPath(room) {
  return path.join(roomDir(room), 'meta.json');
}

function ensureRoomDir(room) {
  fs.mkdirSync(roomDir(room), { recursive: true });
}

function readMeta(room) {
  try {
    return JSON.parse(fs.readFileSync(metaPath(room), 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeMeta(room, meta) {
  ensureRoomDir(room);
  fs.writeFileSync(metaPath(room), JSON.stringify(meta, null, 2) + '\n');
}

function touchMeta(room) {
  const now = new Date().toISOString();
  const existing = readMeta(room);
  if (existing) return existing;
  const meta = { createdAt: now, lastRotatedAt: null };
  writeMeta(room, meta);
  return meta;
}

function parseLineSafe(line) {
  if (!line || !line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch (_) {
    return null;
  }
}

function readAll(room) {
  const file = inboxPath(room);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    const msg = parseLineSafe(line);
    if (msg) out.push(msg);
  }
  return out;
}

function rotateIfNeeded(room) {
  const meta = touchMeta(room);
  const now = Date.now();
  if (meta.lastRotatedAt) {
    const last = new Date(meta.lastRotatedAt).getTime();
    if (!Number.isNaN(last) && now - last < ROTATE_INTERVAL_MS) return;
  }
  const file = inboxPath(room);
  if (!fs.existsSync(file)) {
    writeMeta(room, { ...meta, lastRotatedAt: new Date(now).toISOString() });
    return;
  }
  const cutoff = now - RETENTION_MS;
  const all = readAll(room);
  const kept = all.filter((m) => {
    const t = m.ts ? new Date(m.ts).getTime() : NaN;
    return Number.isNaN(t) ? true : t >= cutoff;
  });
  if (kept.length !== all.length) {
    const body = kept.map((m) => JSON.stringify(m)).join('\n');
    fs.writeFileSync(file, body ? body + '\n' : '');
  }
  writeMeta(room, { ...meta, lastRotatedAt: new Date(now).toISOString() });
}

function append(room, msg) {
  ensureRoomDir(room);
  rotateIfNeeded(room);
  fs.appendFileSync(inboxPath(room), JSON.stringify(msg) + '\n');
}

function readLast(room, n) {
  const all = readAll(room);
  const limit = Math.max(1, Math.min(500, n || 20));
  return all.slice(-limit);
}

function readSince(room, sinceIso, excludeFrom = null) {
  const all = readAll(room);
  const since = sinceIso || '1970-01-01T00:00:00.000Z';
  return all.filter((m) => {
    if (!m.ts || m.ts <= since) return false;
    if (excludeFrom && m.from === excludeFrom) return false;
    return true;
  });
}

function listRooms() {
  if (!fs.existsSync(BUS_DIR)) return [];
  return fs.readdirSync(BUS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

module.exports = {
  BUS_DIR,
  RETENTION_MS,
  ROTATE_INTERVAL_MS,
  append,
  readAll,
  readLast,
  readSince,
  rotateIfNeeded,
  touchMeta,
  readMeta,
  writeMeta,
  inboxPath,
  metaPath,
  roomDir,
  listRooms,
};
