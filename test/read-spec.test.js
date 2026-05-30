'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'bin', 'cli.js');
const broker = require('../lib/bus/broker');
const { writeSession, writeFolderSession, readSession, SESSIONS_DIR } = require('../lib/spec-reader/session');
const { openInBrowser } = require('../lib/open-browser');
const { installSkills, SKILLS } = require('../lib/installer');
const { sortFolderFiles, FOLDER_FILE_ORDER } = require('../lib/commands/read-spec');
const { stopBroker } = require('../lib/bus/spawn');

function runCli(args, cwd) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runCliFail(args, cwd) {
  try {
    execFileSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return null;
  } catch (err) {
    return err;
  }
}

describe('read-spec CLI and HTTP', () => {
  let tmpProject;
  let brokerInfo;
  let server;

  before(async () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-test-'));
    fs.mkdirSync(path.join(tmpProject, 'refacil-sdd', 'changes'), { recursive: true });
    const specPath = path.join(tmpProject, 'refacil-sdd', 'changes', 'demo', 'specs.md');
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, '## CA-01\nHello spec.\n', 'utf8');

    // Use an ephemeral OS-assigned port so the test never conflicts with a
    // broker/read-spec instance already running on the default port candidates.
    const prevEnv = process.env.REFACIL_BUS_PORT;
    process.env.REFACIL_BUS_PORT = '0';
    try {
      const started = await broker.start();
      brokerInfo = started;
      server = started.server;
    } finally {
      if (prevEnv === undefined) {
        delete process.env.REFACIL_BUS_PORT;
      } else {
        process.env.REFACIL_BUS_PORT = prevEnv;
      }
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (tmpProject) fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  test('CA-01: help documents read-spec flags', () => {
    const out = runCli(['help'], tmpProject);
    assert.match(out, /read-spec/);
    assert.match(out, /--file/);
    assert.match(out, /--lang/);
    assert.match(out, /--voice/);
    assert.match(out, /--speed/);
  });

  test('CA-02: missing --file exits with error', () => {
    const err = runCliFail(['read-spec'], tmpProject);
    assert.ok(err);
    assert.notEqual(err.status, 0);
    const msg = (err.stderr || err.stdout || '').toString();
    assert.match(msg, /--file/i);
  });

  test('CA-03/CA-07: read-spec creates session and API returns JSON', async () => {
    const rel = 'refacil-sdd/changes/demo/specs.md';
    const out = runCli([
      'read-spec',
      '--file', rel,
    ], tmpProject);
    assert.match(out, /read-spec session:/);

    const sessionId = out.match(/session:\s*([a-f0-9-]+)/i)[1];
    const payload = readSession(sessionId);
    assert.ok(payload);
    assert.equal(payload.meta.lang, 'es');
    assert.equal(payload.meta.voice, 'M3');
    assert.equal(payload.meta.speed, 1);
    assert.ok(Array.isArray(payload.sections));

    const apiBody = await httpGetJson(`http://127.0.0.1:${brokerInfo.port}/api/read-spec/${sessionId}`);
    assert.equal(apiBody.sourcePath, rel.replace(/\\/g, '/'));
    assert.ok(apiBody.sections.length >= 1);
  });

  test('CA-04: optional TTS flags applied to session and URL', async () => {
    const rel = 'refacil-sdd/changes/demo/specs.md';
    const out = runCli([
      'read-spec',
      '--file', rel,
      '--lang', 'en',
      '--voice', 'f2',
      '--speed', '1.2',
    ], tmpProject);
    const sessionId = out.match(/session:\s*([a-f0-9-]+)/i)[1];
    const payload = readSession(sessionId);
    assert.equal(payload.meta.lang, 'en');
    assert.equal(payload.meta.voice, 'F2');
    assert.equal(payload.meta.speed, 1.2);
    const urlMatch = out.match(/Open:\s*(http[^\s]+)/i);
    assert.ok(urlMatch);
    assert.match(urlMatch[1], new RegExp(`read-spec\\?id=${sessionId}`));
  });

  test('CA-05: reuses broker port when already running', async () => {
    const rel = 'refacil-sdd/changes/demo/specs.md';
    const portBefore = brokerInfo.port;
    const out = runCli(['read-spec', '--file', rel], tmpProject);
    assert.match(out, new RegExp(`127\\.0\\.0\\.1:${portBefore}/read-spec`));
  });

  test('CR-01: missing file exits without orphan session files', () => {
    const before = fs.existsSync(SESSIONS_DIR)
      ? fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
      : [];
    const err = runCliFail(['read-spec', '--file', 'refacil-sdd/changes/missing/specs.md'], tmpProject);
    assert.ok(err);
    const msg = (err.stderr || '').toString();
    assert.match(msg, /not found/i);
    const after = fs.existsSync(SESSIONS_DIR)
      ? fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
      : [];
    assert.equal(after.length, before.length);
  });

  test('CR-08: API returns 400 for invalid session id and 404 for missing', async () => {
    const bad = await httpGetStatus(`http://127.0.0.1:${brokerInfo.port}/api/read-spec/not-a-uuid`);
    assert.equal(bad.status, 400);
    const missing = await httpGetStatus(
      `http://127.0.0.1:${brokerInfo.port}/api/read-spec/00000000-0000-4000-8000-000000000000`,
    );
    assert.equal(missing.status, 404);
  });

  test('CA-06: GET /read-spec serves HTML shell', async () => {
    const sessionId = writeSession({
      sections: [{ title: 'T', text: 'body' }],
      meta: { lang: 'es', voice: 'M3', speed: 1 },
      sourcePath: 'test.md',
      createdAt: new Date().toISOString(),
    });
    const html = await httpGetText(`http://127.0.0.1:${brokerInfo.port}/read-spec?id=${sessionId}`);
    assert.match(html, /read-spec/i);
    assert.match(html, /app\.js/);
  });

  test('CR-02: rejects path outside project root', () => {
    const outside = path.join(tmpProject, '..', 'outside-spec.md');
    fs.writeFileSync(outside, '# outside\n', 'utf8');
    const err = runCliFail(['read-spec', '--file', outside], tmpProject);
    assert.ok(err);
    const msg = (err.stderr || '').toString();
    assert.match(msg, /project root|Security/i);
  });

  test('CR-03: rejects non-md extension', () => {
    const txt = path.join(tmpProject, 'notes.txt');
    fs.writeFileSync(txt, 'x', 'utf8');
    const err = runCliFail(['read-spec', '--file', 'notes.txt'], tmpProject);
    assert.ok(err);
    const msg = (err.stderr || '').toString();
    assert.match(msg, /\.md/i);
  });

  test('open-browser module exports spawn-based helper', () => {
    assert.equal(typeof openInBrowser, 'function');
    assert.equal(openInBrowser('http://127.0.0.1:1/'), true);
  });
});

describe('read-spec folder mode (--change)', () => {
  let tmpProject;
  let brokerInfo;
  let server;

  before(async () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-folder-test-'));
    // Create a change folder with all 4 standard artifacts + one extra
    const changeDir = path.join(tmpProject, 'refacil-sdd', 'changes', 'feat-x');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Proposal\nProposal content.\n', 'utf8');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '## Design\nDesign content.\n', 'utf8');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '## Tasks\nTask content.\n', 'utf8');
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '## Specs\nSpec content.\n', 'utf8');
    fs.writeFileSync(path.join(changeDir, 'notes.md'), '## Notes\nExtra notes.\n', 'utf8');

    // Create a change folder with only some files
    const partialDir = path.join(tmpProject, 'refacil-sdd', 'changes', 'feat-partial');
    fs.mkdirSync(partialDir, { recursive: true });
    fs.writeFileSync(path.join(partialDir, 'proposal.md'), '## Proposal\nPartial proposal.\n', 'utf8');
    fs.writeFileSync(path.join(partialDir, 'specs.md'), '## Specs\nPartial specs.\n', 'utf8');

    // Create an empty change folder (no .md files)
    const emptyDir = path.join(tmpProject, 'refacil-sdd', 'changes', 'feat-empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    // Use an ephemeral OS-assigned port so the test never conflicts with a
    // broker/read-spec instance already running on the default port candidates.
    const prevEnv = process.env.REFACIL_BUS_PORT;
    process.env.REFACIL_BUS_PORT = '0';
    try {
      const started = await broker.start();
      brokerInfo = started;
      server = started.server;
    } finally {
      if (prevEnv === undefined) {
        delete process.env.REFACIL_BUS_PORT;
      } else {
        process.env.REFACIL_BUS_PORT = prevEnv;
      }
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Small delay on Windows to let OS release file handles before rmSync
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (tmpProject) {
      try {
        fs.rmSync(tmpProject, { recursive: true, force: true });
      } catch (_) {
        // Ignore EBUSY on Windows — temp dir will be cleaned by the OS
      }
    }
  });

  // sortFolderFiles unit tests
  test('sortFolderFiles: orders canonical files first, rest alphabetically', () => {
    const input = ['notes.md', 'tasks.md', 'specs.md', 'proposal.md', 'design.md', 'alpha.md'];
    const result = sortFolderFiles(input);
    assert.deepEqual(result, ['proposal.md', 'design.md', 'tasks.md', 'specs.md', 'alpha.md', 'notes.md']);
  });

  test('sortFolderFiles: works with subset of canonical files', () => {
    const input = ['specs.md', 'proposal.md'];
    const result = sortFolderFiles(input);
    assert.deepEqual(result, ['proposal.md', 'specs.md']);
  });

  test('sortFolderFiles: non-canonical files only — sorted alphabetically', () => {
    const input = ['zzz.md', 'aaa.md', 'mmm.md'];
    const result = sortFolderFiles(input);
    assert.deepEqual(result, ['aaa.md', 'mmm.md', 'zzz.md']);
  });

  test('FOLDER_FILE_ORDER contains expected canonical filenames', () => {
    assert.ok(FOLDER_FILE_ORDER.includes('proposal.md'));
    assert.ok(FOLDER_FILE_ORDER.includes('design.md'));
    assert.ok(FOLDER_FILE_ORDER.includes('tasks.md'));
    assert.ok(FOLDER_FILE_ORDER.includes('specs.md'));
  });

  // CR-01: mutual exclusivity
  test('CR-01: --change and --file are mutually exclusive', () => {
    const err = runCliFail(
      ['read-spec', '--change', 'feat-x', '--file', 'refacil-sdd/changes/feat-x/proposal.md'],
      tmpProject,
    );
    assert.ok(err, 'expected error');
    assert.notEqual(err.status, 0);
    const msg = (err.stderr || err.stdout || '').toString();
    assert.match(msg, /mutuamente excluyentes/i);
  });

  // CR-02: non-existent folder
  test('CR-02: error if change folder does not exist', () => {
    const err = runCliFail(['read-spec', '--change', 'cambio-inexistente'], tmpProject);
    assert.ok(err, 'expected error');
    assert.notEqual(err.status, 0);
    const msg = (err.stderr || err.stdout || '').toString();
    assert.match(msg, /cambio-inexistente/);
    assert.match(msg, /no se encontr/i);
  });

  // CR-03: empty folder (no .md files)
  test('CR-03: error if change folder has no .md files', () => {
    const err = runCliFail(['read-spec', '--change', 'feat-empty'], tmpProject);
    assert.ok(err, 'expected error');
    assert.notEqual(err.status, 0);
    const msg = (err.stderr || err.stdout || '').toString();
    assert.match(msg, /no contiene archivos Markdown/i);
  });

  // CR-04: invalid --select
  test('CR-04: error if --select references a file not in the folder', () => {
    const err = runCliFail(['read-spec', '--change', 'feat-x', '--select', 'nonexistent.md'], tmpProject);
    assert.ok(err, 'expected error');
    assert.notEqual(err.status, 0);
    const msg = (err.stderr || err.stdout || '').toString();
    assert.match(msg, /nonexistent\.md/);
    assert.match(msg, /no existe/i);
  });

  // CA-10: session format in folder mode
  test('CA-10: --change creates folder-mode session with correct structure', () => {
    const out = runCli(['read-spec', '--change', 'feat-x'], tmpProject);
    assert.match(out, /read-spec session:/);
    const sessionId = out.match(/session:\s*([a-f0-9-]+)/i)[1];
    const payload = readSession(sessionId);
    assert.ok(payload, 'session should exist on disk');
    assert.equal(payload.mode, 'folder');
    assert.ok(Array.isArray(payload.files), 'files array must exist');
    assert.ok(payload.files.length >= 4, 'should have at least 4 files');
    assert.equal(payload.selectedFile, 'proposal.md', 'default selection is proposal.md');
    // Verify canonical order: proposal first
    assert.equal(payload.files[0].name, 'proposal.md');
    assert.equal(payload.files[1].name, 'design.md');
    assert.equal(payload.files[2].name, 'tasks.md');
    assert.equal(payload.files[3].name, 'specs.md');
    // notes.md comes after canonical files
    assert.equal(payload.files[4].name, 'notes.md');
    // Each file entry has required shape
    for (const f of payload.files) {
      assert.ok(typeof f.name === 'string', 'file.name must be string');
      assert.ok(typeof f.relPath === 'string', 'file.relPath must be string');
      assert.ok(Array.isArray(f.sections), 'file.sections must be array');
    }
    // sections at top level = sections of selectedFile (proposal.md)
    const proposalEntry = payload.files.find((f) => f.name === 'proposal.md');
    assert.deepEqual(payload.sections, proposalEntry.sections);
    // meta has changeName
    assert.equal(payload.meta.changeName, 'feat-x');
  });

  // CA-03: --select pre-selects a specific file
  test('CA-03: --select pre-selects specified file in session', () => {
    const out = runCli(['read-spec', '--change', 'feat-x', '--select', 'specs.md'], tmpProject);
    const sessionId = out.match(/session:\s*([a-f0-9-]+)/i)[1];
    const payload = readSession(sessionId);
    assert.equal(payload.mode, 'folder');
    assert.equal(payload.selectedFile, 'specs.md');
    // Top-level sections should match specs.md sections
    const specsEntry = payload.files.find((f) => f.name === 'specs.md');
    assert.deepEqual(payload.sections, specsEntry.sections);
  });

  // CA-07: partial folder (missing some standard files)
  test('CA-07: partial folder — only existing files included, no error', () => {
    const out = runCli(['read-spec', '--change', 'feat-partial'], tmpProject);
    const sessionId = out.match(/session:\s*([a-f0-9-]+)/i)[1];
    const payload = readSession(sessionId);
    assert.equal(payload.mode, 'folder');
    const names = payload.files.map((f) => f.name);
    assert.ok(names.includes('proposal.md'));
    assert.ok(names.includes('specs.md'));
    assert.ok(!names.includes('design.md'));
    assert.ok(!names.includes('tasks.md'));
  });

  // CA-05/CR-05: backward compat — sessions without mode still work (writeFolderSession vs writeSession)
  test('CR-05: session written by writeSession (no mode field or mode=file) is read back correctly', () => {
    const sessionId = writeSession({
      sections: [{ title: 'T', text: 'body' }],
      meta: { lang: 'es', voice: 'M3', speed: 1 },
      sourcePath: 'test.md',
    });
    const payload = readSession(sessionId);
    assert.ok(payload, 'session must be readable');
    // mode field added by new writeSession
    assert.equal(payload.mode, 'file');
    assert.ok(Array.isArray(payload.sections));
  });

  // writeFolderSession unit test
  test('writeFolderSession produces valid folder-mode session', () => {
    const files = [
      { name: 'proposal.md', relPath: 'refacil-sdd/changes/test/proposal.md', sections: [{ title: 'P', text: 'p body' }] },
      { name: 'specs.md', relPath: 'refacil-sdd/changes/test/specs.md', sections: [{ title: 'S', text: 's body' }] },
    ];
    const sessionId = writeFolderSession({
      files,
      selectedFile: 'specs.md',
      meta: { lang: 'es', voice: 'M3', speed: 1, changeName: 'test' },
      sourcePath: 'refacil-sdd/changes/test',
    });
    const payload = readSession(sessionId);
    assert.ok(payload);
    assert.equal(payload.mode, 'folder');
    assert.equal(payload.selectedFile, 'specs.md');
    assert.equal(payload.files.length, 2);
    // Top-level sections = selected file's sections
    assert.deepEqual(payload.sections, files[1].sections);
  });
});

describe('read-spec skill install', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-skill-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("SKILLS includes 'read-spec'", () => {
    assert.ok(SKILLS.includes('read-spec'));
  });

  test('skills/read-spec/SKILL.md exists with frontmatter', () => {
    const skillPath = path.join(packageRoot, 'skills', 'read-spec', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath));
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.match(content, /name:\s*refacil:read-spec/);
  });

  test('installSkills copies refacil-read-spec to IDE dirs', () => {
    installSkills(packageRoot, tmpDir, ['claude']);
    const installed = path.join(tmpDir, '.claude', 'skills', 'refacil-read-spec', 'SKILL.md');
    assert.ok(fs.existsSync(installed));
  });
});

describe('read-spec broker port recovery', () => {
  let tmpProject;
  let blockers = [];

  before(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-port-recovery-'));
    const specPath = path.join(tmpProject, 'refacil-sdd', 'changes', 'demo', 'specs.md');
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, '## CA-01\nPort recovery spec.\n', 'utf8');
  });

  after(async () => {
    stopBroker();
    await closeServers(blockers);
    blockers = [];
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (tmpProject) {
      try {
        fs.rmSync(tmpProject, { recursive: true, force: true });
      } catch (_) {
        // Ignore transient Windows handles from short-lived child CLI processes.
      }
    }
  });

  test('read-spec starts broker on an alternate port when fixed candidates are occupied', async () => {
    blockers = await occupyPorts(broker.PORT_CANDIDATES);
    try {
      const out = runCli(['read-spec', '--file', 'refacil-sdd/changes/demo/specs.md'], tmpProject);
      const urlMatch = out.match(/Open:\s*http:\/\/127\.0\.0\.1:(\d+)\/read-spec/i);
      assert.ok(urlMatch, `Expected read-spec URL in output. Got: ${out}`);

      const selectedPort = Number(urlMatch[1]);
      assert.ok(!broker.PORT_CANDIDATES.includes(selectedPort), `Expected alternate port, got ${selectedPort}`);
      assert.ok(
        !out.includes('npm install -g ws'),
        'Port recovery must not suggest installing ws when fixed ports are occupied',
      );

      for (const blocker of blockers) {
        const blockerPort = blocker.address().port;
        const body = await httpGetText(`http://${broker.HOST}:${blockerPort}/`);
        assert.equal(body, 'occupied', `External blocker on ${blockerPort} must remain alive`);
      }
    } finally {
      stopBroker();
      await closeServers(blockers);
      blockers = [];
    }
  });

  test('read-spec cleans stale own bus metadata and starts a valid broker without blaming ws', () => {
    fs.mkdirSync(path.dirname(broker.BUS_INFO_PATH), { recursive: true });
    fs.writeFileSync(
      broker.BUS_INFO_PATH,
      JSON.stringify({
        owner: broker.BUS_INFO_OWNER,
        service: broker.BUS_INFO_SERVICE,
        pid: 0,
        port: 9,
        startedAt: new Date().toISOString(),
      }, null, 2) + '\n',
      'utf8',
    );

    try {
      const out = runCli(['read-spec', '--file', 'refacil-sdd/changes/demo/specs.md'], tmpProject);
      const urlMatch = out.match(/Open:\s*http:\/\/127\.0\.0\.1:(\d+)\/read-spec/i);
      assert.ok(urlMatch, `Expected read-spec URL in output. Got: ${out}`);
      assert.ok(
        !out.includes('npm install -g ws'),
        'Stale broker recovery must not suggest installing ws',
      );

      const busInfo = JSON.parse(fs.readFileSync(broker.BUS_INFO_PATH, 'utf8'));
      assert.equal(busInfo.owner, broker.BUS_INFO_OWNER);
      assert.equal(busInfo.service, broker.BUS_INFO_SERVICE);
      assert.notEqual(busInfo.pid, 0);
      assert.notEqual(busInfo.port, 9);
      assert.equal(Number(urlMatch[1]), busInfo.port);
    } finally {
      stopBroker();
    }
  });

  test('read-spec reuses an existing own Refacil broker without replacing it', async () => {
    let ownServer;
    let ownWss;
    const prevEnv = process.env.REFACIL_BUS_PORT;
    process.env.REFACIL_BUS_PORT = '0';
    try {
      const started = await broker.start();
      ownServer = started.server;
      ownWss = started.wss;
      const beforeInfo = JSON.parse(fs.readFileSync(broker.BUS_INFO_PATH, 'utf8'));

      const out = runCli(['read-spec', '--file', 'refacil-sdd/changes/demo/specs.md'], tmpProject);
      const urlMatch = out.match(/Open:\s*http:\/\/127\.0\.0\.1:(\d+)\/read-spec/i);
      assert.ok(urlMatch, `Expected read-spec URL in output. Got: ${out}`);
      assert.equal(Number(urlMatch[1]), beforeInfo.port);

      const afterInfo = JSON.parse(fs.readFileSync(broker.BUS_INFO_PATH, 'utf8'));
      assert.equal(afterInfo.pid, beforeInfo.pid);
      assert.equal(afterInfo.port, beforeInfo.port);
      assert.equal(afterInfo.owner, broker.BUS_INFO_OWNER);
      assert.equal(afterInfo.service, broker.BUS_INFO_SERVICE);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.REFACIL_BUS_PORT;
      } else {
        process.env.REFACIL_BUS_PORT = prevEnv;
      }
      if (ownWss) {
        try { ownWss.close(); } catch (_) {}
      }
      if (ownServer) {
        await new Promise((resolve) => ownServer.close(resolve));
      }
      try { fs.unlinkSync(broker.BUS_INFO_PATH); } catch (_) {}
    }
  });

  test('read-spec ignores foreign live bus metadata without killing that process', async () => {
    const foreignServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('foreign process still alive');
    });
    await listenServer(foreignServer, 0);
    blockers.push(foreignServer);
    const foreignPort = foreignServer.address().port;

    fs.mkdirSync(path.dirname(broker.BUS_INFO_PATH), { recursive: true });
    fs.writeFileSync(
      broker.BUS_INFO_PATH,
      JSON.stringify({
        owner: 'external-tool',
        service: 'not-refacil-bus',
        pid: process.pid,
        port: foreignPort,
        startedAt: new Date().toISOString(),
      }, null, 2) + '\n',
      'utf8',
    );

    const out = runCli(['read-spec', '--file', 'refacil-sdd/changes/demo/specs.md'], tmpProject);
    const urlMatch = out.match(/Open:\s*http:\/\/127\.0\.0\.1:(\d+)\/read-spec/i);
    assert.ok(urlMatch, `Expected read-spec URL in output. Got: ${out}`);
    assert.notEqual(Number(urlMatch[1]), foreignPort);

    const foreignBody = await httpGetText(`http://${broker.HOST}:${foreignPort}/`);
    assert.equal(foreignBody, 'foreign process still alive');

    const busInfo = JSON.parse(fs.readFileSync(broker.BUS_INFO_PATH, 'utf8'));
    assert.equal(busInfo.owner, broker.BUS_INFO_OWNER);
    assert.equal(busInfo.service, broker.BUS_INFO_SERVICE);
  });

  test('stopBroker handles foreign metadata without killing the external PID', async () => {
    const foreignServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('foreign stop target still alive');
    });
    await listenServer(foreignServer, 0);
    blockers.push(foreignServer);
    const foreignPort = foreignServer.address().port;

    fs.mkdirSync(path.dirname(broker.BUS_INFO_PATH), { recursive: true });
    fs.writeFileSync(
      broker.BUS_INFO_PATH,
      JSON.stringify({
        owner: 'external-tool',
        service: 'not-refacil-bus',
        pid: process.pid,
        port: foreignPort,
        startedAt: new Date().toISOString(),
      }, null, 2) + '\n',
      'utf8',
    );

    const result = stopBroker();

    assert.equal(result.stopped, false);
    assert.equal(result.reason, 'foreign-info');
    assert.ok(!fs.existsSync(broker.BUS_INFO_PATH), 'Foreign metadata should be cleaned');
    const foreignBody = await httpGetText(`http://${broker.HOST}:${foreignPort}/`);
    assert.equal(foreignBody, 'foreign stop target still alive');
  });
});

/**
 * @param {string} url
 * @returns {string}
 */
function httpGetText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(data);
      });
    }).on('error', reject);
  });
}

/**
 * @param {string} url
 * @returns {object}
 */
function httpGetJson(url) {
  return httpGetText(url).then((t) => JSON.parse(t));
}

/**
 * @param {string} url
 * @returns {Promise<{ status: number, body: string }>}
 */
function httpGetStatus(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function listenServer(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, broker.HOST);
  });
}

async function occupyPorts(ports) {
  const servers = [];
  for (const port of ports) {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('occupied');
    });
    try {
      await listenServer(server, port);
      servers.push(server);
    } catch (_) {
      try { server.close(); } catch (_) {}
      // Already occupied by another process still satisfies this test setup.
    }
  }
  return servers;
}

function closeServers(servers) {
  return Promise.all(servers.map((server) => new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch (_) {
      resolve();
    }
  })));
}
