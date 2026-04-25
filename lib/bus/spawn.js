const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { BUS_INFO_PATH, HOST } = require('./broker');

function readBusInfo() {
  try {
    const raw = fs.readFileSync(BUS_INFO_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function checkPort(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, HOST);
  });
}

async function isBrokerAlive() {
  const info = readBusInfo();
  if (!info) return { alive: false };
  if (!isProcessAlive(info.pid)) return { alive: false, staleInfo: info };
  const portOk = await checkPort(info.port);
  if (!portOk) return { alive: false, staleInfo: info };
  return { alive: true, info };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBroker(maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const status = await isBrokerAlive();
    if (status.alive) return status.info;
    await sleep(100);
  }
  return null;
}

function cleanStaleInfo() {
  try {
    fs.unlinkSync(BUS_INFO_PATH);
  } catch (_) {}
}

async function ensureBroker(packageRoot) {
  const status = await isBrokerAlive();
  if (status.alive) return { info: status.info, started: false };

  if (status.staleInfo) cleanStaleInfo();

  const cliPath = path.join(packageRoot, 'bin', 'cli.js');
  const child = spawn(process.execPath, [cliPath, 'bus', 'serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const info = await waitForBroker(5000);
  if (!info) {
    throw new Error(
      'El broker no respondió en 5s. Verifica que la dependencia "ws" esté instalada: npm install -g ws',
    );
  }
  return { info, started: true };
}

function stopBroker() {
  const info = readBusInfo();
  if (!info) return { stopped: false, reason: 'no-info' };
  if (!isProcessAlive(info.pid)) {
    cleanStaleInfo();
    return { stopped: false, reason: 'not-alive', info };
  }
  try {
    process.kill(info.pid, 'SIGTERM');
  } catch (err) {
    return { stopped: false, reason: err.message, info };
  }
  // En Windows, SIGTERM termina sin ejecutar handlers del broker, así que
  // limpiamos el bus.json desde aquí para dejar el estado consistente.
  cleanStaleInfo();
  return { stopped: true, info };
}

module.exports = {
  readBusInfo,
  isBrokerAlive,
  ensureBroker,
  stopBroker,
  waitForBroker,
  cleanStaleInfo,
};
