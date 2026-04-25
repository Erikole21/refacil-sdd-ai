const { HOST } = require('./broker');

let WebSocket;
try {
  WebSocket = require('ws');
} catch (_) {
  WebSocket = null;
}

function connect(port) {
  if (!WebSocket) {
    return Promise.reject(
      new Error("Dependencia 'ws' no encontrada. Instala con: npm install -g ws"),
    );
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${HOST}:${port}`);
    const onOpen = () => {
      ws.removeListener('error', onError);
      resolve(ws);
    };
    const onError = (err) => {
      ws.removeListener('open', onOpen);
      reject(err);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function send(ws, op, payload) {
  ws.send(JSON.stringify({ op, ...payload }));
}

// Envía `op` y espera el primer mensaje que matchea `predicate`.
// Si pasa `timeoutMs` sin match, resuelve con null.
function sendAndWait(ws, op, payload, predicate, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      ws.removeListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (raw) => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (_) { return; }
      if (predicate(data)) finish(data);
    };
    ws.on('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
    send(ws, op, payload);
  });
}

function close(ws) {
  try { ws.close(); } catch (_) {}
}

module.exports = {
  connect,
  send,
  sendAndWait,
  close,
};
