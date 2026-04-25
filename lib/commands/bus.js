'use strict';

const fs = require('fs');
const path = require('path');
const busBroker = require('../bus/broker');
const busSpawn = require('../bus/spawn');
const busClient = require('../bus/client');
const busWatch = require('../bus/watch');
const busPresenter = require('../bus/presenter');
const { askHasMatchingReply } = require('../bus/askFulfillment');

function parseBusArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function defaultSessionName() {
  return path.basename(process.cwd()) || 'sesion';
}

async function connectOrDie(packageRoot) {
  try {
    const { info } = await busSpawn.ensureBroker(packageRoot);
    const ws = await busClient.connect(info.port);
    return { ws, info };
  } catch (err) {
    console.error(`  No se pudo conectar al bus: ${err.message}`);
    process.exit(1);
  }
}

function formatMessage(m) {
  const target = m.to ? ` → @${m.to}` : '';
  return `  [${m.ts}] ${m.from}${target} (${m.kind}): ${m.text}`;
}

async function busStart(packageRoot) {
  try {
    const { info, started } = await busSpawn.ensureBroker(packageRoot);
    if (started) {
      console.log(`  refacil-bus broker iniciado en 127.0.0.1:${info.port} (pid ${info.pid}).`);
    } else {
      console.log(`  refacil-bus broker ya estaba activo en 127.0.0.1:${info.port} (pid ${info.pid}).`);
    }
  } catch (err) {
    console.error(`  No se pudo iniciar el broker: ${err.message}`);
    process.exit(1);
  }
}

function busStop() {
  const result = busSpawn.stopBroker();
  if (result.stopped) {
    console.log(`  refacil-bus broker detenido (pid ${result.info.pid}).`);
  } else if (result.reason === 'no-info') {
    console.log('  refacil-bus broker no está corriendo.');
  } else if (result.reason === 'not-alive') {
    console.log('  refacil-bus broker no estaba vivo; info obsoleta limpiada.');
  } else {
    console.error(`  No se pudo detener el broker: ${result.reason}`);
    process.exit(1);
  }
}

async function busStatus() {
  const status = await busSpawn.isBrokerAlive();
  if (!status.alive) {
    console.log('  refacil-bus broker: INACTIVO');
    if (status.staleInfo) {
      console.log(`  (info obsoleta encontrada: pid ${status.staleInfo.pid}, puerto ${status.staleInfo.port})`);
    }
    return;
  }
  const info = status.info;
  const uptimeMs = Date.now() - new Date(info.startedAt).getTime();
  const uptimeMin = Math.floor(uptimeMs / 60000);
  console.log('  refacil-bus broker: ACTIVO');
  console.log(`    host:    127.0.0.1`);
  console.log(`    puerto:  ${info.port}`);
  console.log(`    pid:     ${info.pid}`);
  console.log(`    iniciado: ${info.startedAt}`);
  console.log(`    uptime:  ${uptimeMin} min`);
  console.log(`    info:    ${busBroker.BUS_INFO_PATH}`);
}

function busServe() {
  busBroker.start().catch((err) => {
    process.stderr.write(`Error arrancando broker: ${err.message}\n`);
    process.exit(1);
  });
}

async function busJoin(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const room = args.room;
  const repo = args.repo || process.cwd();
  let intro = args.intro;
  if (!intro) {
    try {
      intro = busPresenter.buildIntro({ repoDir: repo, session });
    } catch (_) {
      intro = `${session} se unió a la sala`;
    }
  }
  if (!room) {
    console.error('  Uso: refacil-sdd-ai bus join --room <sala> [--session <s>] [--intro "..."]');
    process.exit(1);
  }
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'join',
    { session, room, repo, intro },
    (d) => d.type === 'system' && d.event === 'joined',
    3000,
  );
  busClient.close(ws);
  if (!reply) {
    console.error('  Timeout uniéndose a la sala.');
    process.exit(1);
  }
  const members = (reply.detail && reply.detail.members) || [];
  console.log(`  Unido a la sala "${room}" como "${session}".`);
  console.log(`  Miembros actuales: ${members.join(', ') || '(solo tú)'}`);
  console.log(`  Para consultarte: /refacil:ask @${session} "..."`);
}

async function busLeave(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'leave',
    { session },
    (d) => d.type === 'system' && (d.event === 'left' || d.event === 'error'),
    3000,
  );
  busClient.close(ws);
  if (reply && reply.event === 'left') {
    console.log(`  "${session}" salió de la sala.`);
  } else {
    console.log(`  "${session}" no estaba en ninguna sala.`);
  }
}

async function busSay(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const text = args.text;
  if (!text) {
    console.error('  Uso: refacil-sdd-ai bus say --text "..." [--session <s>]');
    process.exit(1);
  }
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'say',
    { session, text },
    (d) => d.type === 'system' && (d.event === 'sent' || d.event === 'error'),
    3000,
  );
  busClient.close(ws);
  if (reply && reply.event === 'sent') {
    console.log(`  Mensaje enviado (id ${reply.detail.id}).`);
  } else {
    const detail = (reply && reply.detail) || 'sin respuesta';
    console.error(`  No se pudo enviar: ${detail}`);
    process.exit(1);
  }
}

async function busAsk(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const to = args.to;
  const text = args.text;
  const waitSec = args.wait ? parseInt(args.wait, 10) : 0;
  if (!to || !text) {
    console.error('  Uso: refacil-sdd-ai bus ask --to <name|all> --text "..." [--wait N] [--session <s>]');
    process.exit(1);
  }
  const { ws } = await connectOrDie(packageRoot);
  const ack = await busClient.sendAndWait(
    ws,
    'ask',
    { session, to: to.replace(/^@/, ''), text },
    (d) => d.type === 'system' && (d.event === 'sent' || d.event === 'error'),
    3000,
  );
  if (!ack || ack.event !== 'sent') {
    busClient.close(ws);
    const detail = (ack && ack.detail) || 'sin respuesta';
    console.error(`  No se pudo enviar la pregunta: ${detail}`);
    process.exit(1);
  }
  const correlationId = ack.detail.correlationId;
  const fanOut = ack.detail && ack.detail.fanOut;
  const destLabel = fanOut && fanOut > 1 ? `${fanOut} miembros (@all)` : `@${to.replace(/^@/, '')}`;
  console.log(`  Pregunta enviada a ${destLabel} (correlationId ${correlationId}).`);

  if (waitSec > 0) {
    console.log(`  Esperando respuesta hasta ${waitSec}s...`);
    const resp = await busClient.sendAndWait(
      ws,
      'ping',
      {},
      (d) => d.type === 'msg' && d.kind === 'reply' && d.correlationId === correlationId,
      waitSec * 1000,
    );
    busClient.close(ws);
    if (!resp) {
      console.log(`  Sin respuesta en ${waitSec}s. Usa /refacil:inbox más tarde para recuperarla.`);
      return;
    }
    console.log(`  Respuesta de @${resp.from}:`);
    console.log(`    ${resp.text}`);
  } else {
    busClient.close(ws);
    console.log('  Usa /refacil:inbox para ver respuestas.');
  }
}

async function busReply(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const text = args.text;
  const correlationId = args.correlation || null;
  const to = args.to ? args.to.replace(/^@/, '') : null;
  if (!text) {
    console.error('  Uso: refacil-sdd-ai bus reply --text "..." [--to <name>] [--correlation <id>]');
    process.exit(1);
  }
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'reply',
    { session, text, to, correlationId },
    (d) => d.type === 'system' && (d.event === 'sent' || d.event === 'error'),
    3000,
  );
  busClient.close(ws);
  if (reply && reply.event === 'sent') {
    console.log(`  Respuesta enviada (id ${reply.detail.id}).`);
  } else {
    const detail = (reply && reply.detail) || 'sin respuesta';
    console.error(`  No se pudo responder: ${detail}`);
    process.exit(1);
  }
}

async function busHistory(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const n = args.n ? parseInt(args.n, 10) : 20;
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'history',
    { session, n },
    (d) => d.type === 'history',
    3000,
  );
  busClient.close(ws);
  if (!reply) {
    console.log('  Sin historial.');
    return;
  }
  const msgs = reply.messages || [];
  if (msgs.length === 0) {
    console.log('  Sin historial.');
    return;
  }
  console.log(`  Últimos ${msgs.length} mensajes:`);
  for (const m of msgs) console.log(formatMessage(m));
}

async function busInbox(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'inbox',
    { session },
    (d) => d.type === 'inbox',
    3000,
  );
  busClient.close(ws);
  if (!reply) {
    console.log('  Sin respuesta del broker.');
    return;
  }
  const msgs = reply.messages || [];
  if (msgs.length === 0) {
    console.log('  Sin mensajes nuevos.');
    return;
  }
  console.log(`  ${msgs.length} mensaje(s) nuevo(s):`);
  for (const m of msgs) console.log(formatMessage(m));
}

function findFirstUnansweredAsk(messages, session) {
  const asks = messages.filter((m) => m.kind === 'ask' && m.to === session);
  for (const ask of asks) {
    if (!askHasMatchingReply(messages, ask)) return ask;
  }
  return null;
}

function printAttendQuestion(msg) {
  console.log('  Pregunta recibida del bus:');
  console.log(`    de:             @${msg.from}`);
  console.log(`    correlationId:  ${msg.correlationId || '(sin id)'}`);
  console.log(`    texto:          ${msg.text}`);
  console.log('');
  console.log('  Responde con: /refacil:reply "<respuesta>"');
  console.log('  Luego vuelve a ejecutar /refacil:attend para seguir escuchando.');
}

async function busAttend(args, packageRoot) {
  const session = args.session || defaultSessionName();
  const timeoutSec = args.timeout ? parseInt(args.timeout, 10) : 540;
  const { ws } = await connectOrDie(packageRoot);

  const hist = await busClient.sendAndWait(
    ws,
    'history',
    { session, n: 50 },
    (d) => d.type === 'history',
    3000,
  );
  if (hist) {
    const pending = findFirstUnansweredAsk(hist.messages || [], session);
    if (pending) {
      busClient.close(ws);
      printAttendQuestion(pending);
      return;
    }
  }

  const result = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      resolve(v);
    };
    const onMessage = (raw) => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (data.type === 'msg' && data.kind === 'ask' && data.to === session) {
        finish({ kind: 'message', msg: data });
      }
    };
    ws.on('message', onMessage);
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutSec * 1000);
    busClient.send(ws, 'attend', { session });
  });

  busClient.close(ws);

  if (result.kind === 'message') {
    printAttendQuestion(result.msg);
  } else {
    console.log(`  Sin preguntas en ${timeoutSec}s. Re-ejecuta /refacil:attend para seguir escuchando.`);
  }
}

function readPersistedSessions() {
  try {
    return JSON.parse(fs.readFileSync(busBroker.SESSIONS_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function busWatchCmd(positional, args, packageRoot) {
  const session = args.session || positional || null;
  let room = args.room || null;
  if (session && !room) {
    const persisted = readPersistedSessions();
    if (persisted[session] && persisted[session].room) {
      room = persisted[session].room;
    }
  }
  if (!session && !room) {
    console.error('  Uso: refacil-sdd-ai bus watch <session> [--room <sala>]');
    process.exit(1);
  }
  try {
    const { info } = await busSpawn.ensureBroker(packageRoot);
    await busWatch.start({ session, room, port: info.port });
  } catch (err) {
    console.error(`  No se pudo iniciar el watch: ${err.message}`);
    process.exit(1);
  }
}

async function busRooms(packageRoot) {
  const { ws } = await connectOrDie(packageRoot);
  const reply = await busClient.sendAndWait(
    ws,
    'status',
    {},
    (d) => d.type === 'system' && d.event === 'status',
    3000,
  );
  busClient.close(ws);
  if (!reply) {
    console.log('  Sin respuesta del broker.');
    return;
  }
  const rooms = (reply.detail && reply.detail.rooms) || {};
  const names = Object.keys(rooms);
  if (names.length === 0) {
    console.log('  No hay salas activas.');
    return;
  }
  console.log('  Salas activas:');
  for (const name of names) {
    const members = rooms[name] || [];
    console.log(`    ${name} (${members.length}): ${members.join(', ')}`);
  }
}

function openInBrowser(url) {
  const { spawn } = require('child_process');
  const platform = process.platform;
  let cmd;
  let cmdArgs;
  if (platform === 'win32') {
    cmd = 'cmd';
    cmdArgs = ['/c', 'start', '""', url];
  } else if (platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  } catch (_) {
    return false;
  }
}

async function busView(packageRoot) {
  try {
    const { info } = await busSpawn.ensureBroker(packageRoot);
    const url = `http://127.0.0.1:${info.port}/`;
    console.log(`  refacil-bus view disponible en: ${url}`);
    const opened = openInBrowser(url);
    if (!opened) {
      console.log('  (no se pudo abrir el navegador automáticamente, abre la URL manualmente)');
    }
  } catch (err) {
    console.error(`  No se pudo iniciar la vista: ${err.message}`);
    process.exit(1);
  }
}

async function handleBus(sub, argv, packageRoot) {
  const rest = argv || [];
  const positional = rest.length > 0 && !rest[0].startsWith('--') ? rest[0] : null;
  const args = parseBusArgs(rest);

  switch (sub) {
    case 'start':   return busStart(packageRoot);
    case 'stop':    return busStop();
    case 'status':  return busStatus();
    case 'serve':   return busServe();
    case 'join':    return busJoin(args, packageRoot);
    case 'leave':   return busLeave(args, packageRoot);
    case 'say':     return busSay(args, packageRoot);
    case 'ask':     return busAsk(args, packageRoot);
    case 'reply':   return busReply(args, packageRoot);
    case 'history': return busHistory(args, packageRoot);
    case 'inbox':   return busInbox(args, packageRoot);
    case 'rooms':   return busRooms(packageRoot);
    case 'watch':   return busWatchCmd(positional, args, packageRoot);
    case 'attend':  return busAttend(args, packageRoot);
    case 'view':    return busView(packageRoot);
    default:
      console.log('Uso: refacil-sdd-ai bus <start|stop|status|serve|join|leave|say|ask|reply|history|inbox|rooms|watch|attend|view>');
  }
}

module.exports = { handleBus, parseBusArgs };
