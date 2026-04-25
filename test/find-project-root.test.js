'use strict';

/**
 * Regression tests for findProjectRoot() — fix-project-root-consistency
 *
 * These tests verify that:
 *  1. When CWD is the repo root (contains .git)  → returns CWD directly.
 *  2. When CWD is a subdirectory                 → ascends and returns the root.
 *  3. When no .git nor refacil-sdd/ in any ancestor → fallback to process.cwd().
 *  4. When CWD is a subdirectory with refacil-sdd/ at the root → ascends via refacil-sdd marker.
 *  5. The CLI commands that use projectRoot (check-review, sdd list) operate on the
 *     correct root when invoked from a subdirectory.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

/**
 * Run a small inline Node.js script that calls findProjectRoot() and prints the result.
 * cwd controls process.cwd() for the call.
 */
function runFindProjectRoot(cwd) {
  const script = `
    const { findProjectRoot } = require(${JSON.stringify(path.resolve(__dirname, '..', 'lib', 'commands', 'sdd'))});
    process.stdout.write(findProjectRoot());
  `;
  const result = spawnSync(node, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: result.stderr || '',
  };
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpr-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── findProjectRoot() — unit-level via inline script ─────────────────────────

describe('findProjectRoot — detección por .git', () => {
  test('PR-01: CWD es la raíz (.git presente) → retorna CWD sin ascender', () => {
    // Place .git at root
    fs.mkdirSync(path.join(tmpDir, '.git'));

    const r = runFindProjectRoot(tmpDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Normalize separators for cross-platform comparison
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe retornar el CWD cuando .git está en él',
    );
  });

  test('PR-02: CWD es un subdirectorio → asciende hasta encontrar .git', () => {
    // Root has .git, CWD is a nested subdir
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const subDir = path.join(tmpDir, 'packages', 'agent');
    fs.mkdirSync(subDir, { recursive: true });

    const r = runFindProjectRoot(subDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe retornar la raíz del repo, no el subdirectorio',
    );
  });

  test('PR-03: CWD es dos niveles abajo de .git → asciende correctamente', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const deepDir = path.join(tmpDir, 'src', 'modules', 'payments');
    fs.mkdirSync(deepDir, { recursive: true });

    const r = runFindProjectRoot(deepDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe ascender múltiples niveles hasta .git',
    );
  });
});

describe('findProjectRoot — detección por refacil-sdd/', () => {
  test('PR-04: CWD es la raíz (refacil-sdd/ presente, sin .git) → retorna CWD', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd'));

    const r = runFindProjectRoot(tmpDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe retornar CWD cuando refacil-sdd/ está en él',
    );
  });

  test('PR-05: CWD es un subdirectorio, refacil-sdd/ está en la raíz → asciende', () => {
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd'));
    const subDir = path.join(tmpDir, 'src', 'lib');
    fs.mkdirSync(subDir, { recursive: true });

    const r = runFindProjectRoot(subDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe retornar la raíz donde está refacil-sdd/',
    );
  });
});

describe('findProjectRoot — fallback cuando no hay marcador', () => {
  test('PR-06: sin .git ni refacil-sdd/ en ningún ancestro → retorna CWD (fallback)', () => {
    // tmpDir has no .git and no refacil-sdd/ — isolated temp dir
    const r = runFindProjectRoot(tmpDir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(
      r.stdout.replace(/\\/g, '/'),
      tmpDir.replace(/\\/g, '/'),
      'Debe retornar CWD como fallback cuando no se encuentra marcador',
    );
  });
});

// ── Regression: CLI commands use findProjectRoot() when invoked from subdir ───

describe('checkReview — usa findProjectRoot() desde subdirectorio (regresión)', () => {
  test('PR-07: checkReview bloquea git push aunque se invoque desde un subdir del repo', () => {
    // Set up: root has .git + refacil-sdd/changes/my-feature (no .review-passed)
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature'), { recursive: true });

    // Invoke from a subdirectory
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: subDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const output = result.stdout + result.stderr;
    assert.ok(
      output.includes('block') || output.includes('review') || output.includes('Review'),
      `Debe bloquear cuando hay cambio sin review, incluso desde subdir. Output: "${output.slice(0, 300)}"`,
    );
  });

  test('PR-08: checkReview NO bloquea desde subdir cuando todos los cambios tienen .review-passed', () => {
    // Set up: root has .git + refacil-sdd/changes/my-feature/.review-passed
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const changeDir = path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, '.review-passed'),
      JSON.stringify({ verdict: 'approved', changeName: 'my-feature', summary: 'ok', failCount: 0, preexistingCount: 0, blockers: false, date: new Date().toISOString() }),
    );

    // Invoke from a subdirectory
    const subDir = path.join(tmpDir, 'packages', 'agent');
    fs.mkdirSync(subDir, { recursive: true });

    const input = JSON.stringify({ tool_input: { command: 'git push origin main' } });
    const result = spawnSync(node, [CLI, 'check-review'], {
      cwd: subDir,
      input,
      encoding: 'utf8',
      env: { ...process.env },
    });

    const output = result.stdout.trim();
    if (output.length > 0) {
      let parsed;
      try { parsed = JSON.parse(output); } catch (_) { parsed = null; }
      if (parsed) {
        assert.ok(parsed.decision !== 'block', 'No debe bloquear cuando el review está aprobado');
      }
    }
    assert.equal(result.status, 0, 'Debe terminar con exit 0 cuando todo está aprobado');
  });
});

describe('sdd list — usa findProjectRoot() desde subdirectorio (regresión)', () => {
  test('PR-09: sdd list encuentra cambios en la raíz aunque CWD sea un subdir', () => {
    // Set up: root has .git + refacil-sdd/changes/my-feature
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.mkdirSync(path.join(tmpDir, 'refacil-sdd', 'changes', 'my-feature'), { recursive: true });

    // Invoke from a subdirectory
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);

    const result = spawnSync(node, [CLI, 'sdd', 'list', '--json'], {
      cwd: subDir,
      encoding: 'utf8',
      env: { ...process.env },
    });

    assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse((result.stdout || '').trim()); }, 'Debe retornar JSON válido');
    const names = parsed.map((i) => i.name);
    assert.ok(names.includes('my-feature'), `Debe encontrar my-feature desde subdir. Found: ${names.join(', ')}`);
  });
});
