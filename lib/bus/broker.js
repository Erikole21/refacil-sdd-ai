const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const HOME_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const BUS_INFO_PATH = path.join(HOME_DIR, 'bus.json');
const SESSIONS_PATH = path.join(HOME_DIR, 'sessions.json');

const PORT_CANDIDATES = [7821, 7822, 7823];
const HOST = '127.0.0.1';

const storage = require('./storage');
const { askHasMatchingReply } = require('./askFulfillment');

let WebSocketServer;
try {
  ({ WebSocketServer } = require('ws'));
} catch (_) {
  WebSocketServer = null;
}

function ensureHomeDir() {
  fs.mkdirSync(HOME_DIR, { recursive: true });
}

function writeBusInfo(port) {
  ensureHomeDir();
  const info = {
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(BUS_INFO_PATH, JSON.stringify(info, null, 2) + '\n');
  return info;
}

function removeBusInfo() {
  try {
    fs.unlinkSync(BUS_INFO_PATH);
  } catch (_) {
    // ignore
  }
}

function readSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeSessions(data) {
  ensureHomeDir();
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2) + '\n');
}

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

async function pickPort(server) {
  for (const port of PORT_CANDIDATES) {
    try {
      await tryListen(server, port);
      return port;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') continue;
      throw err;
    }
  }
  throw new Error(
    `No hay puertos disponibles (intentados: ${PORT_CANDIDATES.join(', ')})`,
  );
}

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (_) {
    // ignore broken pipe
  }
}

function createState() {
  return {
    rooms: new Map(), // roomName -> Set<sessionName>
    sessions: new Map(), // sessionName -> { ws, room, repo, lastSeen, attending, watchOnly }
  };
}

function persistSessions(state) {
  const data = {};
  for (const [name, s] of state.sessions.entries()) {
    if (s.watchOnly) continue;
    data[name] = {
      repo: s.repo || null,
      room: s.room || null,
      lastSeen: s.lastSeen || null,
    };
  }
  try {
    writeSessions(data);
  } catch (_) {
    // non-fatal
  }
}

function broadcast(state, roomName, msg, exceptSession = null) {
  const members = state.rooms.get(roomName);
  if (!members) return;
  for (const name of members) {
    if (name === exceptSession) continue;
    const s = state.sessions.get(name);
    if (!s) continue;
    if (s.wss && s.wss.size > 0) {
      for (const sockets of s.wss) send(sockets, { type: 'msg', ...msg });
    }
  }
  // Watchers no están en rooms, pero sí en sessions con watchOnly=true.
  // Si watchRoom es null, recibe msgs de TODAS las salas (modo UI / observador global).
  for (const [, s] of state.sessions.entries()) {
    if (!s.watchOnly) continue;
    if (s.watchRoom === null || s.watchRoom === undefined || s.watchRoom === roomName) {
      if (s.ws) send(s.ws, { type: 'msg', ...msg });
    }
  }
}

function attachWs(state, sessionName, ws) {
  const s = state.sessions.get(sessionName);
  if (!s || s.watchOnly) return;
  if (!s.wss) s.wss = new Set();
  s.wss.add(ws);
  if (!ws._refacilAttachedSessions) ws._refacilAttachedSessions = new Set();
  ws._refacilAttachedSessions.add(sessionName);
}

function detachWs(state, ws) {
  if (!ws._refacilAttachedSessions) return;
  for (const name of ws._refacilAttachedSessions) {
    const s = state.sessions.get(name);
    if (s && s.wss) s.wss.delete(ws);
  }
  ws._refacilAttachedSessions.clear();
}

function appendHistory(_state, roomName, msg) {
  try {
    storage.append(roomName, msg);
  } catch (_) {
    // persistencia no debe romper el broker
  }
}

function leaveRoom(state, sessionName) {
  const s = state.sessions.get(sessionName);
  if (!s || !s.room) return;
  const roomName = s.room;
  const members = state.rooms.get(roomName);
  if (members) {
    members.delete(sessionName);
    if (members.size === 0) state.rooms.delete(roomName);
  }
  const msg = {
    id: newId(),
    ts: nowIso(),
    from: sessionName,
    to: null,
    room: roomName,
    text: `${sessionName} salió de la sala`,
    kind: 'system',
  };
  appendHistory(state, roomName, msg);
  broadcast(state, roomName, msg);
  s.room = null;
}

function handleJoin(state, ws, data) {
  const { session, room, repo, intro } = data;
  if (!session || !room) {
    return send(ws, { type: 'system', event: 'error', detail: 'join requiere session y room' });
  }

  // Si la sesión ya existe en otra sala, sacarla primero
  const existing = state.sessions.get(session);
  const isReturningToSameRoom = !!(existing && existing.room === room);
  if (existing && existing.room && existing.room !== room) {
    leaveRoom(state, session);
  }

  const meta = existing || {};
  meta.repo = repo || meta.repo || null;
  meta.room = room;
  meta.watchOnly = false;
  // Primer join o cambio de sala → lastSeen = ahora (sin backlog).
  // Reingreso a la misma sala tras desconectar → preservar lastSeen existente
  // para que /inbox traiga los mensajes perdidos mientras estuvo fuera.
  if (!isReturningToSameRoom || !meta.lastSeen) {
    meta.lastSeen = nowIso();
  }
  if (!meta.wss) meta.wss = new Set();
  state.sessions.set(session, meta);
  ws._refacilSession = session;
  attachWs(state, session, ws);

  if (!state.rooms.has(room)) state.rooms.set(room, new Set());
  state.rooms.get(room).add(session);

  const introText = intro || `${session} se unió a la sala`;
  const msg = {
    id: newId(),
    ts: nowIso(),
    from: session,
    to: null,
    room,
    text: introText,
    kind: 'system',
  };
  appendHistory(state, room, msg);
  broadcast(state, room, msg);

  send(ws, {
    type: 'system',
    event: 'joined',
    detail: { room, session, members: Array.from(state.rooms.get(room)) },
  });
  persistSessions(state);
}

function handleLeave(state, ws, data) {
  const session = data.session || ws._refacilSession;
  if (!session) return;
  leaveRoom(state, session);
  send(ws, { type: 'system', event: 'left', detail: { session } });
  persistSessions(state);
}

/** Destinos especiales: un ask por cada miembro de la sala excepto el emisor. */
const ASK_ALL_ALIASES = new Set(['all', '*', 'everyone']);

function resolveAskTargets(state, room, fromSession, rawTo) {
  if (rawTo === undefined || rawTo === null) return [null];
  const trimmed = String(rawTo).trim();
  if (trimmed === '') return [null];
  const bare = trimmed.replace(/^@/, '');
  const key = bare.toLowerCase();
  if (ASK_ALL_ALIASES.has(key)) {
    const members = state.rooms.get(room);
    if (!members || members.size === 0) return [];
    const others = Array.from(members).filter((n) => n !== fromSession);
    return others.length ? others.sort() : [];
  }
  return [bare];
}

function handleSay(state, ws, data) {
  const session = data.session || ws._refacilSession;
  const s = session && state.sessions.get(session);
  if (!s || !s.room) {
    return send(ws, { type: 'system', event: 'error', detail: 'sesión no está en ninguna sala' });
  }
  const msg = {
    id: newId(),
    ts: nowIso(),
    from: session,
    to: null,
    room: s.room,
    text: data.text || '',
    kind: 'broadcast',
  };
  appendHistory(state, s.room, msg);
  broadcast(state, s.room, msg);
  send(ws, { type: 'system', event: 'sent', detail: { id: msg.id } });
}

function handleAsk(state, ws, data) {
  const session = data.session || ws._refacilSession;
  const s = session && state.sessions.get(session);
  if (!s || !s.room) {
    return send(ws, { type: 'system', event: 'error', detail: 'sesión no está en ninguna sala' });
  }
  const correlationId = data.correlationId || newId();
  const targets = resolveAskTargets(state, s.room, session, data.to);
  if (targets.length === 0) {
    return send(ws, {
      type: 'system',
      event: 'error',
      detail: 'sin destinatarios (@all en sala vacía o solo tú)',
    });
  }
  let firstId = null;
  for (const to of targets) {
    const msg = {
      id: newId(),
      ts: nowIso(),
      from: session,
      to,
      room: s.room,
      text: data.text || '',
      kind: 'ask',
      correlationId,
    };
    if (!firstId) firstId = msg.id;
    appendHistory(state, s.room, msg);
    broadcast(state, s.room, msg);
  }
  send(ws, {
    type: 'system',
    event: 'sent',
    detail: { id: firstId, correlationId, fanOut: targets.length },
  });
}

function handleReply(state, ws, data) {
  const session = data.session || ws._refacilSession;
  const s = session && state.sessions.get(session);
  if (!s || !s.room) {
    return send(ws, { type: 'system', event: 'error', detail: 'sesión no está en ninguna sala' });
  }
  let correlationId = data.correlationId || null;
  let toOverride = data.to || null;
  // Si el cliente no pasó correlationId, autocompletar con el ask MÁS ANTIGUO
  // sin respuesta dirigido a esta sesión — así se alinea con el orden FIFO en
  // que `attend` entrega las preguntas al LLM.
  if (!correlationId) {
    const hist = storage.readLast(s.room, 200);
    for (const ask of hist) {
      if (ask.kind !== 'ask') continue;
      if (ask.to && ask.to !== session) continue;
      const replied = askHasMatchingReply(hist, ask);
      if (replied) continue;
      correlationId = ask.correlationId || null;
      if (!toOverride) toOverride = ask.from;
      break;
    }
  }
  const msg = {
    id: newId(),
    ts: nowIso(),
    from: session,
    to: toOverride,
    room: s.room,
    text: data.text || '',
    kind: 'reply',
    correlationId,
  };
  appendHistory(state, s.room, msg);
  broadcast(state, s.room, msg);
  send(ws, { type: 'system', event: 'sent', detail: { id: msg.id, correlationId } });
}

function handleHistory(state, ws, data) {
  const session = data.session || ws._refacilSession;
  const s = session && state.sessions.get(session);
  const roomName = (s && s.room) || data.room;
  if (!roomName) {
    return send(ws, { type: 'history', messages: [] });
  }
  const messages = storage.readLast(roomName, data.n || 20);
  send(ws, { type: 'history', messages });
}

function handleInbox(state, ws, data) {
  const session = data.session || ws._refacilSession;
  const s = session && state.sessions.get(session);
  if (!s || !s.room) {
    return send(ws, { type: 'inbox', messages: [], newLastSeen: nowIso() });
  }
  const since = s.lastSeen || '1970-01-01T00:00:00.000Z';
  const newMsgs = storage.readSince(s.room, since, session);
  const newLastSeen = nowIso();
  s.lastSeen = newLastSeen;
  send(ws, { type: 'inbox', messages: newMsgs, newLastSeen });
  persistSessions(state);
}

function handleWatch(state, ws, data) {
  const session = data.session || ('watcher-' + newId().slice(0, 8));
  const room = data.room || null;
  state.sessions.set(session, {
    ws,
    room: null,
    repo: null,
    lastSeen: null,
    watchOnly: true,
    watchRoom: room,
  });
  ws._refacilSession = session;
  send(ws, { type: 'system', event: 'watching', detail: { session, room } });
}

function handleStatus(state, ws) {
  const rooms = {};
  for (const [name, members] of state.rooms.entries()) {
    rooms[name] = Array.from(members);
  }
  send(ws, {
    type: 'system',
    event: 'status',
    detail: {
      rooms,
      sessions: Array.from(state.sessions.keys()).filter(
        (n) => !state.sessions.get(n).watchOnly,
      ),
      port: state._port,
      pid: process.pid,
      startedAt: state._startedAt,
    },
  });
}

function onMessage(state, ws, raw) {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch (_) {
    return send(ws, { type: 'system', event: 'error', detail: 'JSON inválido' });
  }
  // Si el cliente declara una sesión existente (no es join/watch), attach el ws
  // para que reciba broadcasts mientras la conexión esté viva.
  if (data.session && data.op !== 'watch' && data.op !== 'join') {
    const s = state.sessions.get(data.session);
    if (s && !s.watchOnly) {
      ws._refacilSession = data.session;
      attachWs(state, data.session, ws);
    }
  }
  switch (data.op) {
    case 'join': return handleJoin(state, ws, data);
    case 'leave': return handleLeave(state, ws, data);
    case 'say': return handleSay(state, ws, data);
    case 'ask': return handleAsk(state, ws, data);
    case 'reply': return handleReply(state, ws, data);
    case 'history': return handleHistory(state, ws, data);
    case 'inbox': return handleInbox(state, ws, data);
    case 'watch': return handleWatch(state, ws, data);
    case 'status': return handleStatus(state, ws);
    case 'ping': return send(ws, { type: 'system', event: 'pong' });
    default:
      return send(ws, { type: 'system', event: 'error', detail: `op desconocida: ${data.op}` });
  }
}

function onClose(state, ws) {
  detachWs(state, ws);
  const session = ws._refacilSession;
  if (!session) return;
  const s = state.sessions.get(session);
  if (!s) return;
  // Watchers son efímeros: se borran al cerrar WS.
  if (s.watchOnly) {
    state.sessions.delete(session);
  }
  // Sesiones normales persisten en la sala aunque cierren el WS — las skills del
  // CLI abren conexiones cortas (say/ask/reply/history/inbox) y confían en que
  // "estar unido" sobrevive entre invocaciones. Solo `leave` explícito saca.
}

const UI_DIR = path.join(__dirname, 'ui');
const UI_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveUi(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const safePath = urlPath.replace(/^\/+/, '').replace(/\.\./g, '');
  const filePath = path.join(UI_DIR, safePath);
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = UI_MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    res.end(data);
  });
}

async function start() {
  if (!WebSocketServer) {
    throw new Error(
      "Dependencia 'ws' no encontrada. Instala con: npm install -g ws (o npm install ws en el paquete)",
    );
  }

  const state = createState();
  // Restaurar sesiones persistidas para sobrevivir reinicios del broker.
  try {
    const persisted = readSessions();
    for (const [name, meta] of Object.entries(persisted || {})) {
      if (!meta || !meta.room) continue;
      state.sessions.set(name, {
        ws: null,
        repo: meta.repo || null,
        room: meta.room,
        lastSeen: meta.lastSeen || null,
        watchOnly: false,
      });
      if (!state.rooms.has(meta.room)) state.rooms.set(meta.room, new Set());
      state.rooms.get(meta.room).add(name);
    }
  } catch (_) {
    // sin persistencia previa
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      serveUi(req, res);
      return;
    }
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('method not allowed');
  });

  const port = await pickPort(server);

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => onMessage(state, ws, raw));
    ws.on('close', () => onClose(state, ws));
    ws.on('error', () => {});
  });
  const info = writeBusInfo(port);
  state._port = port;
  state._startedAt = info.startedAt;

  const shutdown = () => {
    try {
      wss.close();
      server.close();
    } catch (_) {}
    removeBusInfo();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  return { port, pid: process.pid, startedAt: info.startedAt, state, server, wss };
}

module.exports = {
  start,
  BUS_INFO_PATH,
  SESSIONS_PATH,
  HOME_DIR,
  PORT_CANDIDATES,
  HOST,
};

if (require.main === module) {
  start()
    .then((info) => {
      process.stdout.write(
        `refacil-bus broker escuchando en ${HOST}:${info.port} (pid ${info.pid})\n`,
      );
    })
    .catch((err) => {
      process.stderr.write(`Error arrancando broker: ${err.message}\n`);
      process.exit(1);
    });
}
