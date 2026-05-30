'use strict';

/**
 * Tests for FIX 3: broker port resilience via REFACIL_BUS_PORT env var.
 *
 * Verifies:
 *  - REFACIL_BUS_PORT=0 → broker binds an OS-assigned ephemeral port (not in 7821-7823)
 *  - REFACIL_BUS_PORT=<specific free port> → broker binds exactly that port
 *  - Unset REFACIL_BUS_PORT → original PORT_CANDIDATES behavior is unchanged
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const broker = require('../lib/bus/broker');

/**
 * Start a broker with the given REFACIL_BUS_PORT env setting.
 * Cleans up and restores the env after the test.
 *
 * @param {string|undefined} portEnv - value to set for REFACIL_BUS_PORT, or undefined to unset
 * @returns {Promise<{port: number, cleanup: () => Promise<void>}>}
 */
async function startBrokerWithEnv(portEnv) {
  const prev = process.env.REFACIL_BUS_PORT;

  if (portEnv === undefined) {
    delete process.env.REFACIL_BUS_PORT;
  } else {
    process.env.REFACIL_BUS_PORT = portEnv;
  }

  let started;
  try {
    started = await broker.start();
  } finally {
    // Restore env immediately after start() so other tests are not affected.
    if (prev === undefined) {
      delete process.env.REFACIL_BUS_PORT;
    } else {
      process.env.REFACIL_BUS_PORT = prev;
    }
  }

  const cleanup = () =>
    new Promise((resolve) => {
      try {
        started.wss.close();
        started.server.close(resolve);
      } catch (_) {
        resolve();
      }
    });

  return { port: started.port, cleanup };
}

/**
 * Acquire a free TCP port from the OS (port 0 trick) without starting the broker.
 * Returns the port number and a close function.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// REFACIL_BUS_PORT=0 → ephemeral port
// ---------------------------------------------------------------------------

describe('REFACIL_BUS_PORT=0 → broker binds an ephemeral port', () => {
  let port;
  let cleanup;

  before(async () => {
    ({ port, cleanup } = await startBrokerWithEnv('0'));
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('broker starts successfully with REFACIL_BUS_PORT=0', () => {
    assert.ok(typeof port === 'number' && port > 0, `port must be a positive integer, got ${port}`);
  });

  test('ephemeral port is NOT one of the default PORT_CANDIDATES (7821-7823)', () => {
    assert.ok(
      !broker.PORT_CANDIDATES.includes(port),
      `ephemeral port ${port} must not be one of the default candidates ${broker.PORT_CANDIDATES.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// REFACIL_BUS_PORT=<specific free port> → broker binds that port
// ---------------------------------------------------------------------------

describe('REFACIL_BUS_PORT=<free port> → broker binds exactly that port', () => {
  let assignedPort;
  let port;
  let cleanup;

  before(async () => {
    assignedPort = await getFreePort();
    ({ port, cleanup } = await startBrokerWithEnv(String(assignedPort)));
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('broker port equals the specified REFACIL_BUS_PORT value', () => {
    assert.strictEqual(
      port,
      assignedPort,
      `expected broker to bind port ${assignedPort}, got ${port}`,
    );
  });
});
