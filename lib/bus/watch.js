const crypto = require('crypto');
const client = require('./client');

const COLOR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

function colorForKind(kind) {
  switch (kind) {
    case 'ask': return COLOR.cyan;
    case 'reply': return COLOR.green;
    case 'system': return COLOR.gray;
    default: return '';
  }
}

function formatLine(msg, ownSession) {
  const isMention = !!ownSession && msg.to === ownSession;
  const prefix = isMention ? `${COLOR.bold}${COLOR.yellow}🔔 ` : '';
  const kindColor = colorForKind(msg.kind);
  const target = msg.to ? ` → @${msg.to}` : '';
  const ts = (msg.ts || '').slice(11, 19); // HH:mm:ss
  const header = `${prefix}${kindColor}[${ts}] ${msg.from}${target} (${msg.kind})${COLOR.reset}`;
  const body = `    ${msg.text || ''}`;
  return `${header}\n${body}`;
}

function printHeader({ session, room, port }) {
  const line = '─'.repeat(60);
  console.log(
    `${COLOR.bold}bus · session: ${session || '(sin filtro)'} · room: ${room || '(todas)'} · port: ${port}${COLOR.reset}`,
  );
  console.log(COLOR.gray + line + COLOR.reset);
  console.log(COLOR.dim + 'Ctrl+C para salir' + COLOR.reset);
  console.log('');
}

async function start({ session, room, port }) {
  const ws = await client.connect(port);
  const watcherId = `watcher-${crypto.randomUUID().slice(0, 8)}`;

  printHeader({ session, room, port });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch (_) { return; }
    if (data.type === 'msg') {
      console.log(formatLine(data, session));
    }
  });

  ws.on('close', () => {
    console.log(COLOR.dim + '\n(conexión cerrada)' + COLOR.reset);
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error(`${COLOR.yellow}error: ${err.message}${COLOR.reset}`);
  });

  client.send(ws, 'watch', { session: watcherId, room });

  const shutdown = () => {
    try { ws.close(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start, formatLine, COLOR };
