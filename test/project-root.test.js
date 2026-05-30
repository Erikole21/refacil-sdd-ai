'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  findGitRoot,
  findProjectRoot,
  isRefacilSddAiPackageDir,
  elevateFromEmbeddedPackage,
  resolveWorkspaceRoot,
} = require('../lib/project-root');

let tmpDir;
let savedEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-root-test-'));
  savedEnv = {
    CURSOR_PROJECT_DIR: process.env.CURSOR_PROJECT_DIR,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
  };
  delete process.env.CURSOR_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
});

afterEach(() => {
  if (savedEnv.CURSOR_PROJECT_DIR !== undefined) {
    process.env.CURSOR_PROJECT_DIR = savedEnv.CURSOR_PROJECT_DIR;
  } else {
    delete process.env.CURSOR_PROJECT_DIR;
  }
  if (savedEnv.CLAUDE_PROJECT_DIR !== undefined) {
    process.env.CLAUDE_PROJECT_DIR = savedEnv.CLAUDE_PROJECT_DIR;
  } else {
    delete process.env.CLAUDE_PROJECT_DIR;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function layoutMonorepo() {
  fs.mkdirSync(path.join(tmpDir, '.git'));
  fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes'), { recursive: true });
  const pkgDir = path.join(tmpDir, 'refacil-sdd-ai');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'refacil-sdd-ai', version: '0.0.0' }),
  );
  return pkgDir;
}

describe('resolveWorkspaceRoot — multi-IDE', () => {
  test('CURSOR_PROJECT_DIR (Cursor) usa la raíz del workspace abierto', () => {
    layoutMonorepo();
    process.env.CURSOR_PROJECT_DIR = tmpDir;

    const root = resolveWorkspaceRoot({ skipStdin: true });
    assert.equal(root.replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
  });

  test('CLAUDE_PROJECT_DIR (Claude / Codex alias) usa la raíz del workspace abierto', () => {
    layoutMonorepo();
    process.env.CLAUDE_PROJECT_DIR = tmpDir;

    const root = resolveWorkspaceRoot({ skipStdin: true });
    assert.equal(root.replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
  });

  test('workspace_roots en stdin (Cursor workspaceOpen) sin env', () => {
    layoutMonorepo();
    const root = resolveWorkspaceRoot({
      skipStdin: true,
      hookInput: { workspace_roots: [tmpDir] },
    });
    assert.equal(root.replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
  });

  test('cwd en subcarpeta del paquete → asciende al monorepo (.git), no se queda en refacil-sdd-ai', () => {
    const pkgDir = layoutMonorepo();
    const subDir = path.join(pkgDir, 'lib');
    fs.mkdirSync(subDir, { recursive: true });
    const prev = process.cwd();
    try {
      process.chdir(subDir);
      const root = resolveWorkspaceRoot({ skipStdin: true });
      assert.equal(root.replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
    } finally {
      process.chdir(prev);
    }
  });

  test('paquete refacil-sdd-ai aislado sin .git padre → permanece en el paquete', () => {
    const isolated = path.join(tmpDir, 'standalone-pkg');
    fs.mkdirSync(isolated, { recursive: true });
    fs.writeFileSync(
      path.join(isolated, 'package.json'),
      JSON.stringify({ name: 'refacil-sdd-ai', version: '0.0.0' }),
    );

    assert.ok(isRefacilSddAiPackageDir(isolated));
    const elevated = elevateFromEmbeddedPackage(isolated);
    assert.equal(elevated.replace(/\\/g, '/'), isolated.replace(/\\/g, '/'));
  });
});

describe('findProjectRoot — prefiere .git sobre refacil-sdd', () => {
  test('desde subdirectorio asciende al .git del monorepo', () => {
    layoutMonorepo();
    const sub = path.join(tmpDir, 'apps', 'api');
    fs.mkdirSync(sub, { recursive: true });

    const root = findProjectRoot(sub);
    assert.equal(root.replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
    assert.equal(findGitRoot(sub).replace(/\\/g, '/'), tmpDir.replace(/\\/g, '/'));
  });
});
