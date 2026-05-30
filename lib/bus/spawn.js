const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const {
  BUS_INFO_PATH,
  BUS_STARTUP_ERROR_PATH,
  BUS_INFO_OWNER,
  BUS_INFO_SERVICE,
  HOST,
} = require('./broker');

function readBusInfo() {
  try {
    const raw = fs.readFileSync(BUS_INFO_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function readStartupError() {
  try {
    const raw = fs.readFileSync(BUS_STARTUP_ERROR_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function isRefacilBrokerInfo(info) {
  return !!(
    info &&
    info.owner === BUS_INFO_OWNER &&
    info.service === BUS_INFO_SERVICE
  );
}

function cleanStartupError() {
  try {
    fs.unlinkSync(BUS_STARTUP_ERROR_PATH);
  } catch (_) {}
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
  if (!isRefacilBrokerInfo(info)) return { alive: false, staleInfo: info };
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

function hasWsDependency(packageRoot) {
  try {
    require.resolve('ws', { paths: [packageRoot] });
    return true;
  } catch (_) {
    return false;
  }
}

function buildBrokerStartError(packageRoot, startupError) {
  if (!hasWsDependency(packageRoot) || (startupError && startupError.code === 'WS_MISSING')) {
    return new Error(
      'No se pudo iniciar el broker porque falta la dependencia "ws". Instala las dependencias del paquete refacil-sdd-ai.',
    );
  }

  if (startupError && startupError.code === 'EADDRINUSE') {
    return new Error(
      `No se pudo iniciar el broker porque el puerto solicitado está ocupado: ${startupError.message}`,
    );
  }

  if (startupError && startupError.message) {
    return new Error(`No se pudo iniciar el broker: ${startupError.message}`);
  }

  return new Error(
    'No se pudo iniciar el broker: el proceso no publicó bus.json ni reportó una causa de arranque.',
  );
}

async function ensureBroker(packageRoot) {
  const status = await isBrokerAlive();
  if (status.alive) return { info: status.info, started: false };

  if (status.staleInfo) cleanStaleInfo();
  cleanStartupError();

  const cliPath = path.join(packageRoot, 'bin', 'cli.js');
  const child = spawn(process.execPath, [cliPath, 'bus', 'serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const info = await waitForBroker(5000);
  if (!info) {
    throw buildBrokerStartError(packageRoot, readStartupError());
  }
  return { info, started: true };
}

function stopBroker() {
  const info = readBusInfo();
  if (!info) return { stopped: false, reason: 'no-info' };
  if (!isRefacilBrokerInfo(info)) {
    cleanStaleInfo();
    return { stopped: false, reason: 'foreign-info', info };
  }
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
  readStartupError,
  cleanStartupError,
  isRefacilBrokerInfo,
  buildBrokerStartError,
};
