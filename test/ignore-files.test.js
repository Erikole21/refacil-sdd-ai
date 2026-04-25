'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { syncIgnoreFiles, BASE_ENTRIES } = require('../lib/ignore-files');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'refacil-ignore-test-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// CA-1: Creates both files when they don't exist
test('CA-1: creates .claudeignore and .cursorignore when absent', () => {
  const dir = makeTmpDir();
  try {
    const result = syncIgnoreFiles(dir);
    assert.equal(result.claude.status, 'created');
    assert.equal(result.cursor.status, 'created');
    assert.ok(fs.existsSync(path.join(dir, '.claudeignore')));
    assert.ok(fs.existsSync(path.join(dir, '.cursorignore')));
  } finally {
    cleanup(dir);
  }
});

// CA-2: Non-destructive update — keeps existing custom content, adds missing entries
test('CA-2: preserves custom content and appends missing base entries', () => {
  const dir = makeTmpDir();
  try {
    const customLine = 'my-custom-dir/';
    fs.writeFileSync(path.join(dir, '.claudeignore'), `${customLine}\n`);
    fs.writeFileSync(path.join(dir, '.cursorignore'), `${customLine}\n`);

    syncIgnoreFiles(dir);

    const content = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    assert.ok(content.includes(customLine), 'custom line should be preserved');
    assert.ok(content.includes('node_modules/'), 'node_modules/ should be added');
  } finally {
    cleanup(dir);
  }
});

// CA-3: All mandatory base entries present after creation
test('CA-3: created file contains all mandatory base entries', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir);
    const content = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    const mandatoryEntries = [
      'node_modules/', 'dist/', 'build/', '*.log', 'logs/',
      '.cache/', 'tmp/', '*.png', '*.jpg', '*.pdf', '*.zip',
      '.env', '.env.*', '*.pem', '*.key', 'credentials.json',
      'secrets.json', 'coverage/',
    ];
    for (const entry of mandatoryEntries) {
      assert.ok(content.includes(entry), `missing entry: ${entry}`);
    }
  } finally {
    cleanup(dir);
  }
});

// CA-4: Both files created/updated together
test('CA-4: both .claudeignore and .cursorignore have same base entries', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir);
    const claude = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    const cursor = fs.readFileSync(path.join(dir, '.cursorignore'), 'utf8');
    assert.equal(claude, cursor, '.claudeignore and .cursorignore should have identical content');
  } finally {
    cleanup(dir);
  }
});

// CA-6 / noop: returns noop status when already up to date
test('noop when all entries already present', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir); // first call creates
    const result2 = syncIgnoreFiles(dir); // second call should be noop
    assert.equal(result2.claude.status, 'noop');
    assert.equal(result2.cursor.status, 'noop');
    assert.equal(result2.claude.added, 0);
    assert.equal(result2.cursor.added, 0);
  } finally {
    cleanup(dir);
  }
});

// CR-1: Existing lines not removed during update
test('CR-1: existing lines are never removed during update', () => {
  const dir = makeTmpDir();
  try {
    const original = 'node_modules/\nmy-special-folder/\n';
    fs.writeFileSync(path.join(dir, '.claudeignore'), original);
    fs.writeFileSync(path.join(dir, '.cursorignore'), original);
    syncIgnoreFiles(dir);
    const content = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    assert.ok(content.includes('my-special-folder/'), 'custom line must not be removed');
    assert.ok(content.includes('node_modules/'), 'existing entry must still be present');
  } finally {
    cleanup(dir);
  }
});

// CR-2: Both files always processed together
test('CR-2: syncIgnoreFiles always processes both files', () => {
  const dir = makeTmpDir();
  try {
    const result = syncIgnoreFiles(dir);
    assert.ok('claude' in result && 'cursor' in result, 'result must have claude and cursor keys');
    assert.ok(fs.existsSync(path.join(dir, '.claudeignore')));
    assert.ok(fs.existsSync(path.join(dir, '.cursorignore')));
  } finally {
    cleanup(dir);
  }
});

// CR-3: Files created at projectRoot, not a subdirectory
test('CR-3: files are created at project root', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir);
    assert.ok(fs.existsSync(path.join(dir, '.claudeignore')));
    assert.ok(fs.existsSync(path.join(dir, '.cursorignore')));
    // Must not exist in any subdirectory
    assert.ok(!fs.existsSync(path.join(dir, 'sub', '.claudeignore')));
  } finally {
    cleanup(dir);
  }
});

// CR-4: Sensitive entries always included
test('CR-4: sensitive entries always included (security)', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir);
    const content = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    const sensitiveEntries = ['.env', '.env.*', '*.key', 'credentials.json'];
    for (const entry of sensitiveEntries) {
      assert.ok(content.includes(entry), `missing sensitive entry: ${entry}`);
    }
  } finally {
    cleanup(dir);
  }
});

// Added entries count is correct
test('added count reflects number of missing entries', () => {
  const dir = makeTmpDir();
  try {
    const result = syncIgnoreFiles(dir);
    const significantBase = BASE_ENTRIES.filter(
      (l) => l.trim().length > 0 && !l.trim().startsWith('#'),
    );
    assert.equal(result.claude.added, significantBase.length);
  } finally {
    cleanup(dir);
  }
});

// CA-15: .opencodeignore created/updated with same base entries as .claudeignore
test('CA-15: syncIgnoreFiles crea .opencodeignore con las mismas entradas base que .claudeignore', () => {
  const dir = makeTmpDir();
  try {
    const result = syncIgnoreFiles(dir);
    assert.equal(result.opencode.status, 'created', '.opencodeignore debe crearse');
    assert.ok(fs.existsSync(path.join(dir, '.opencodeignore')), '.opencodeignore debe existir');

    const claude = fs.readFileSync(path.join(dir, '.claudeignore'), 'utf8');
    const opencode = fs.readFileSync(path.join(dir, '.opencodeignore'), 'utf8');
    assert.equal(claude, opencode, '.opencodeignore debe tener el mismo contenido que .claudeignore');
  } finally {
    cleanup(dir);
  }
});

test('CA-15: .opencodeignore contiene todas las entradas obligatorias', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir);
    const content = fs.readFileSync(path.join(dir, '.opencodeignore'), 'utf8');
    const mandatoryEntries = [
      'node_modules/', 'dist/', 'build/', '*.log', 'logs/',
      '.cache/', 'tmp/', '*.png', '*.jpg', '*.pdf', '*.zip',
      '.env', '.env.*', '*.pem', '*.key', 'credentials.json',
      'secrets.json', 'coverage/',
    ];
    for (const entry of mandatoryEntries) {
      assert.ok(content.includes(entry), `.opencodeignore debe contener: ${entry}`);
    }
  } finally {
    cleanup(dir);
  }
});

test('CA-15: .opencodeignore se actualiza de forma no destructiva cuando ya existe', () => {
  const dir = makeTmpDir();
  try {
    const customLine = 'my-opencode-ignore/';
    fs.writeFileSync(path.join(dir, '.opencodeignore'), `${customLine}\n`);

    syncIgnoreFiles(dir);

    const content = fs.readFileSync(path.join(dir, '.opencodeignore'), 'utf8');
    assert.ok(content.includes(customLine), 'línea personalizada debe preservarse');
    assert.ok(content.includes('node_modules/'), 'node_modules/ debe añadirse');
  } finally {
    cleanup(dir);
  }
});

test('CA-15: syncIgnoreFiles retorna resultado con clave opencode', () => {
  const dir = makeTmpDir();
  try {
    const result = syncIgnoreFiles(dir);
    assert.ok('opencode' in result, 'resultado debe tener clave opencode');
    assert.ok('status' in result.opencode, 'resultado.opencode debe tener clave status');
    assert.ok('added' in result.opencode, 'resultado.opencode debe tener clave added');
  } finally {
    cleanup(dir);
  }
});

test('CA-15: .opencodeignore noop cuando ya tiene todas las entradas', () => {
  const dir = makeTmpDir();
  try {
    syncIgnoreFiles(dir); // first call creates
    const result2 = syncIgnoreFiles(dir); // second call should be noop
    assert.equal(result2.opencode.status, 'noop');
    assert.equal(result2.opencode.added, 0);
  } finally {
    cleanup(dir);
  }
});
