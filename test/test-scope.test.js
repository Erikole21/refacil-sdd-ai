'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const {
  detectStack,
  findTestFileByConvention,
  findTestFilesByImport,
  testScope,
  isPlanningFile,
  findModuleRoot,
  isTestFile,
  affectedComponents,
  isCodeFileForStack,
} = require('../lib/test-scope');

const CLI = path.resolve(__dirname, '..', 'bin', 'cli.js');
const node = process.execPath;

function runTestScope(cwd, args = []) {
  const result = spawnSync(node, [CLI, 'sdd', 'test-scope', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scope-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// detectStack
// ---------------------------------------------------------------------------

describe('detectStack', () => {
  test('returns node when package.json exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    assert.equal(detectStack(tmpDir), 'node');
  });

  test('returns python when pyproject.toml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.pytest]');
    assert.equal(detectStack(tmpDir), 'python');
  });

  test('returns go when go.mod exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/hello');
    assert.equal(detectStack(tmpDir), 'go');
  });

  test('returns rust when Cargo.toml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]');
    assert.equal(detectStack(tmpDir), 'rust');
  });

  test('returns unknown when no config files exist', () => {
    assert.equal(detectStack(tmpDir), 'unknown');
  });

  test('returns unknown for non-existent directory', () => {
    assert.equal(detectStack(path.join(tmpDir, 'nonexistent')), 'unknown');
  });

  test('returns java when pom.xml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'pom.xml'), '<project/>');
    assert.equal(detectStack(tmpDir), 'java');
  });

  test('returns java when build.gradle exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'build.gradle'), '// gradle');
    assert.equal(detectStack(tmpDir), 'java');
  });

  test('returns dotnet when global.json exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'global.json'), '{"sdk":{}}');
    assert.equal(detectStack(tmpDir), 'dotnet');
  });
});

// ---------------------------------------------------------------------------
// isPlanningFile
// ---------------------------------------------------------------------------

describe('isPlanningFile', () => {
  test('refacil-sdd markdown files are planning-only', () => {
    assert.ok(isPlanningFile('refacil-sdd/changes/my-change/proposal.md'));
    assert.ok(isPlanningFile('refacil-sdd/changes/my-change/design.md'));
    assert.ok(isPlanningFile('refacil-sdd/changes/my-change/tasks.md'));
  });

  test('source files are not planning-only', () => {
    assert.ok(!isPlanningFile('lib/installer.js'));
    assert.ok(!isPlanningFile('src/app.ts'));
    assert.ok(!isPlanningFile('test/foo.test.js'));
  });

  test('AGENTS.md is planning-only', () => {
    assert.ok(isPlanningFile('AGENTS.md'));
  });

  test('.cursorrules is planning-only', () => {
    assert.ok(isPlanningFile('.cursorrules'));
  });

  test('README.md is planning-only', () => {
    assert.ok(isPlanningFile('README.md'));
  });

  test('openspec markdown files are planning-only', () => {
    assert.ok(isPlanningFile('openspec/my-change/design.md'));
  });

  test('real source file is not planning-only', () => {
    assert.ok(!isPlanningFile('lib/installer.js'));
    assert.ok(!isPlanningFile('src/index.ts'));
  });
});

// ---------------------------------------------------------------------------
// findTestFileByConvention — CA-07, CA-08
// ---------------------------------------------------------------------------

describe('findTestFileByConvention', () => {
  // CA-07: convention-based lookup for node stack
  test('CA-07: finds test/foo.test.js for lib/foo.js (node stack)', () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.mkdirSync(path.join(tmpDir, 'test'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), '// test');

    const results = findTestFileByConvention(
      path.join(tmpDir, 'lib', 'foo.js'),
      'node',
      tmpDir,
    );
    assert.ok(results.length > 0, 'should find at least one test file');
    assert.ok(
      results.some((f) => f.includes('foo.test.js')),
      'must include foo.test.js',
    );
  });

  // CA-08: fallback when test file doesn't exist on disk
  test('CA-08: returns empty array when test file does not exist on disk', () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'bar.js'), '// source');
    // No test/bar.test.js created

    const results = findTestFileByConvention(
      path.join(tmpDir, 'lib', 'bar.js'),
      'node',
      tmpDir,
    );
    assert.equal(results.length, 0, 'should return empty array when no test file exists');
  });

  test('finds sibling test file (lib/foo.test.js) for node stack', () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.test.js'), '// test');

    const results = findTestFileByConvention(
      path.join(tmpDir, 'lib', 'foo.js'),
      'node',
      tmpDir,
    );
    assert.ok(results.some((f) => f.endsWith('foo.test.js')), 'should find sibling test');
  });

  test('finds test_foo.py for python stack', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'foo.py'), '# source');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'test_foo.py'), '# test');

    const results = findTestFileByConvention(
      path.join(tmpDir, 'src', 'foo.py'),
      'python',
      tmpDir,
    );
    assert.ok(results.some((f) => f.includes('test_foo.py')), 'should find test_foo.py');
  });

  test('finds foo_test.go for go stack', () => {
    fs.mkdirSync(path.join(tmpDir, 'pkg', 'foo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pkg', 'foo', 'foo.go'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'pkg', 'foo', 'foo_test.go'), '// test');

    const results = findTestFileByConvention(
      path.join(tmpDir, 'pkg', 'foo', 'foo.go'),
      'go',
      tmpDir,
    );
    assert.ok(results.some((f) => f.includes('foo_test.go')), 'should find foo_test.go');
  });

  // Fix #5 — Python sibling-file convention (test_foo.py in same dir as source)
  test('finds sibling test_utils.py in same directory for python stack', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.py'), '# source');
    fs.writeFileSync(path.join(tmpDir, 'src', 'test_utils.py'), '# test sibling');

    const results = findTestFileByConvention(
      path.join(tmpDir, 'src', 'utils.py'),
      'python',
      tmpDir,
    );
    assert.ok(
      results.some((f) => f.includes('test_utils.py')),
      'should find test_utils.py sibling in same directory as source',
    );
  });
});

// ---------------------------------------------------------------------------
// findTestFilesByImport — CA-12
// ---------------------------------------------------------------------------

describe('findTestFilesByImport', () => {
  // CA-12: import-based detection
  test('CA-12: finds test files that require the source file by basename', () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.mkdirSync(path.join(tmpDir, 'test'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'installer.js'), '// source');
    fs.writeFileSync(
      path.join(tmpDir, 'test', 'installer.test.js'),
      "const { foo } = require('../lib/installer');\n// tests",
    );

    const results = findTestFilesByImport(
      path.join(tmpDir, 'lib', 'installer.js'),
      'node',
      tmpDir,
    );
    assert.ok(
      results.some((f) => f.includes('installer.test.js')),
      'should find test file that imports the source',
    );
  });

  test('returns empty array when no test directory exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');

    const results = findTestFilesByImport(
      path.join(tmpDir, 'lib', 'foo.js'),
      'node',
      tmpDir,
    );
    assert.equal(results.length, 0);
  });

  // CR-03: no test paths from other monorepo packages
  test('CR-03: does not pick up test files outside the project root', () => {
    // Create a sibling package directory that is NOT under tmpDir
    const siblingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibling-pkg-'));
    try {
      fs.mkdirSync(path.join(siblingDir, 'test'));
      fs.writeFileSync(
        path.join(siblingDir, 'test', 'foo.test.js'),
        "const { x } = require('../lib/foo');\n",
      );
      fs.mkdirSync(path.join(tmpDir, 'lib'));
      fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');

      const results = findTestFilesByImport(
        path.join(tmpDir, 'lib', 'foo.js'),
        'node',
        tmpDir,
      );
      // None of the results should be from the sibling directory
      assert.ok(
        results.every((f) => f.startsWith(tmpDir)),
        'all results must be within projectRoot',
      );
    } finally {
      fs.rmSync(siblingDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// testScope — CA-09, CA-10, CA-11, CA-13
// ---------------------------------------------------------------------------

describe('testScope', () => {
  // CA-09: fallback when scope contains only planning files
  test('CA-09: returns fallback when all files are planning-only', () => {
    const result = testScope({
      files: ['refacil-sdd/changes/my-change/proposal.md', 'AGENTS.md'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback, 'should be fallback');
    assert.equal(result.testCommand, 'npm test', 'fallback testCommand must be baseline');
    assert.ok(typeof result.fallbackReason === 'string' && result.fallbackReason.length > 0);
  });

  // CA-10: when files is empty → fallback
  test('CA-10: returns fallback when files array is empty', () => {
    const result = testScope({
      files: [],
      baseline: 'node --test test/',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback, 'should be fallback');
    assert.equal(result.testCommand, 'node --test test/');
  });

  // CA-11: valid source files + existing test file → non-fallback result
  test('CA-11: returns scoped testCommand when test files are found', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.mkdirSync(path.join(tmpDir, 'test'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), '// test');

    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'node --test --test-concurrency=1 test/foo.test.js',
      projectRoot: tmpDir,
    });
    assert.ok(!result.fallback, 'should NOT be fallback when test file exists');
    assert.ok(
      result.testCommand.includes('foo.test.js'),
      'testCommand must reference the found test file',
    );
    assert.ok(result.files.length > 0, 'files must be non-empty');
    assert.equal(result.fallbackReason, null);
  });

  // CA-13: fallback when files empty or stack undetermined
  test('CA-13: returns fallback when stack is unknown and no config found', () => {
    // tmpDir has no package.json, pyproject.toml, go.mod, etc.
    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback, 'should fallback when stack is unknown');
    assert.equal(result.testCommand, 'npm test');
  });

  test('CA-13: returns fallback when no source files provided (null)', () => {
    const result = testScope({
      files: null,
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback);
    assert.equal(result.testCommand, 'npm test');
  });

  test('result always has testCommand, files, fallback, fallbackReason fields', () => {
    const result = testScope({ files: [], baseline: 'npm test', projectRoot: tmpDir });
    assert.ok('testCommand' in result, 'must have testCommand');
    assert.ok('files' in result, 'must have files');
    assert.ok('fallback' in result, 'must have fallback');
    assert.ok('fallbackReason' in result, 'must have fallbackReason');
  });

  // Fix #3 — unrecognized stack hint triggers fallback instead of wrong command
  test('Fix #3: unknown stack hint triggers fallback (not silent wrong command)', () => {
    const result = testScope({
      files: ['lib/foo.js'],
      stack: 'foobar-unknown-stack',
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback, 'unrecognized stack hint must produce fallback=true');
    assert.equal(result.testCommand, 'npm test', 'fallback testCommand must be baseline');
    assert.ok(typeof result.fallbackReason === 'string' && result.fallbackReason.length > 0);
  });

  // Fix #3 — valid stack hint is accepted and used
  test('Fix #3: valid KNOWN_STACKS hint is accepted (not treated as unknown)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), '// test');

    const result = testScope({
      files: ['lib/foo.js'],
      stack: 'node',  // valid hint
      baseline: 'node --test',
      projectRoot: tmpDir,
    });
    assert.ok(!result.fallback, 'valid stack hint must NOT produce fallback');
  });

  // Mixed planning + real files — planning file is filtered out, real file is used
  test('filters out planning files and proceeds with real source files', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'real.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'real.test.js'), '// test');

    const result = testScope({
      files: ['refacil-sdd/changes/foo/proposal.md', 'lib/real.js'],
      baseline: 'node --test',
      projectRoot: tmpDir,
    });
    // The planning file is filtered; lib/real.js has a test file — must not fall back
    assert.ok(!result.fallback, 'must not fallback when real source file has a corresponding test');
    assert.ok(
      result.testCommand.includes('real.test.js'),
      'testCommand must reference the real test file, not the planning file',
    );
  });

  test('mixed planning + real files — result does not reference the planning file', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'real.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'real.test.js'), '// test');

    const result = testScope({
      files: ['AGENTS.md', 'lib/real.js'],
      baseline: 'node --test',
      projectRoot: tmpDir,
    });
    assert.ok(
      !result.testCommand.includes('AGENTS.md'),
      'testCommand must not reference AGENTS.md (planning file)',
    );
  });

  // jest baseline branch
  test('uses jest executor when baseline starts with jest', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), '// test');

    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'jest --runInBand',
      projectRoot: tmpDir,
    });
    assert.ok(!result.fallback, 'must not fallback when test file exists');
    assert.ok(
      result.testCommand.startsWith('jest'),
      `testCommand must start with jest, got: ${result.testCommand}`,
    );
    assert.ok(
      result.testCommand.includes('foo.test.js'),
      'testCommand must include the test file path',
    );
    assert.ok(
      result.testCommand.includes('--runInBand'),
      'jest baseline flags must be preserved in scoped command',
    );
  });

  // vitest baseline branch
  test('uses vitest run executor when baseline contains vitest', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'bar.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'bar.test.js'), '// test');

    const result = testScope({
      files: ['lib/bar.js'],
      baseline: 'vitest',
      projectRoot: tmpDir,
    });
    assert.ok(!result.fallback, 'must not fallback when test file exists');
    assert.ok(
      result.testCommand.startsWith('vitest run'),
      `testCommand must start with 'vitest run', got: ${result.testCommand}`,
    );
    assert.ok(
      result.testCommand.includes('bar.test.js'),
      'testCommand must include the test file path',
    );
  });
});

// ---------------------------------------------------------------------------
// CLI sdd test-scope — CA-17, CR-04
// ---------------------------------------------------------------------------

describe('CLI sdd test-scope', () => {
  // CA-17: CLI returns valid JSON with required fields, exits 0
  test('CA-17: --json output has testCommand, files, fallback, fallbackReason fields', () => {
    const r = runTestScope(tmpDir, ['--files', 'lib/foo.js', '--baseline', 'npm test', '--json']);
    assert.equal(r.status, 0, 'must exit 0');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); }, 'stdout must be valid JSON');
    assert.ok('testCommand' in parsed, 'must have testCommand');
    assert.ok('files' in parsed, 'must have files');
    assert.ok('fallback' in parsed, 'must have fallback');
    assert.ok('fallbackReason' in parsed, 'must have fallbackReason');
  });

  // CR-04: CLI doesn't fail when --files is empty
  test('CR-04: exits 0 when --files is empty string', () => {
    const r = runTestScope(tmpDir, ['--files', '', '--baseline', 'npm test', '--json']);
    assert.equal(r.status, 0, 'must exit 0 even with empty --files');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout.trim()); });
    assert.ok(parsed.fallback, 'empty files should produce fallback=true');
  });

  test('CR-04: exits 0 when --files flag is omitted entirely', () => {
    const r = runTestScope(tmpDir, ['--baseline', 'npm test', '--json']);
    assert.equal(r.status, 0, 'must exit 0 when --files is omitted');
  });

  test('CR-04: exits 0 when --baseline is omitted', () => {
    const r = runTestScope(tmpDir, ['--json']);
    assert.equal(r.status, 0, 'must exit 0 when --baseline is omitted');
  });

  test('non-json output includes testCommand line', () => {
    const r = runTestScope(tmpDir, ['--files', 'lib/foo.js', '--baseline', 'npm test']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('testCommand:'), 'non-json output must include testCommand: label');
  });

  test('dotnet: findTestFileByConvention finds <BaseName>Tests.cs in *.Tests/ dir', () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'Services'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'MyApp.Tests', 'Services'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'Services', 'PaymentService.cs'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'MyApp.Tests', 'Services', 'PaymentServiceTests.cs'), '// test');

    const result = findTestFileByConvention(
      path.join(tmpDir, 'src', 'Services', 'PaymentService.cs'),
      'dotnet',
      tmpDir,
    );
    assert.ok(result.length > 0, 'should find PaymentServiceTests.cs');
    assert.ok(result[0].endsWith('PaymentServiceTests.cs'));
  });

  test('dotnet: testScope generates dotnet test --filter command', () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'Services'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'MyApp.Tests', 'Services'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'Services', 'PaymentService.cs'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'MyApp.Tests', 'Services', 'PaymentServiceTests.cs'), '// test');
    fs.writeFileSync(path.join(tmpDir, 'global.json'), '{"sdk":{"version":"8.0.0"}}');

    const result = testScope({
      files: ['src/Services/PaymentService.cs'],
      baseline: 'dotnet test',
      projectRoot: tmpDir,
    });
    assert.ok(!result.fallback, 'should not fallback when test file exists');
    assert.ok(result.testCommand.startsWith('dotnet test --filter'), 'command must use dotnet test --filter');
    assert.ok(result.testCommand.includes('PaymentServiceTests'), 'filter must reference test class name');
  });

  test('dotnet: findTestFilesByImport finds .cs test by class name reference', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'MyApp.Tests'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'OrderService.cs'), '// source');
    // Test file references the class name
    fs.writeFileSync(
      path.join(tmpDir, 'MyApp.Tests', 'OrderServiceTests.cs'),
      'using MyApp.Services;\n\npublic class OrderServiceTests { OrderService sut; }',
    );
    fs.writeFileSync(path.join(tmpDir, 'global.json'), '{}');

    const result = findTestFilesByImport(
      path.join(tmpDir, 'src', 'OrderService.cs'),
      'dotnet',
      tmpDir,
    );
    assert.ok(result.length > 0, 'should find test file via class name reference');
    assert.ok(result[0].endsWith('OrderServiceTests.cs'));
  });

  test('--stack flag is accepted and used', () => {
    // Create a test file to make scoping succeed
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), '// test');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

    const r = runTestScope(tmpDir, [
      '--files', 'lib/foo.js',
      '--stack', 'node',
      '--baseline', 'node --test',
      '--json',
    ]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(!parsed.fallback, 'with stack=node and existing test file, should not fallback');
    assert.ok(parsed.testCommand.includes('foo.test.js'));
  });
});

// ---------------------------------------------------------------------------
// findModuleRoot — monorepo subpackage detection
// ---------------------------------------------------------------------------

describe('findModuleRoot', () => {
  test('returns the directory containing package.json when walking up from a subdirectory', () => {
    // monorepo root (no manifest)
    const pkgDir = path.join(tmpDir, 'pkg');
    const libDir = path.join(pkgDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"subpkg"}');

    const result = findModuleRoot(libDir, tmpDir);
    assert.equal(result, pkgDir, 'should stop at the package.json directory');
  });

  test('returns projectRoot when no manifest is found anywhere below it', () => {
    // No manifests anywhere in tmpDir
    const srcDir = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(srcDir, { recursive: true });

    const result = findModuleRoot(srcDir, tmpDir);
    assert.equal(result, path.resolve(tmpDir), 'should fall back to projectRoot');
  });

  test('returns projectRoot when fileDir IS projectRoot and no manifest exists', () => {
    const result = findModuleRoot(tmpDir, tmpDir);
    assert.equal(result, path.resolve(tmpDir));
  });

  test('returns immediate dir when the file is directly inside a package dir', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"root"}');
    const result = findModuleRoot(tmpDir, tmpDir);
    assert.equal(result, path.resolve(tmpDir));
  });
});

// ---------------------------------------------------------------------------
// isTestFile
// ---------------------------------------------------------------------------

describe('isTestFile', () => {
  test('node: *.test.js is a test file', () => {
    assert.ok(isTestFile('foo.test.js', 'node'));
    assert.ok(isTestFile('foo.spec.ts', 'node'));
    assert.ok(isTestFile('bar.test.mjs', 'node'));
  });

  test('node: regular source file is NOT a test file', () => {
    assert.ok(!isTestFile('foo.js', 'node'));
    assert.ok(!isTestFile('installer.ts', 'node'));
  });

  test('python: test_*.py and *_test.py are test files', () => {
    assert.ok(isTestFile('test_foo.py', 'python'));
    assert.ok(isTestFile('foo_test.py', 'python'));
    assert.ok(!isTestFile('foo.py', 'python'));
  });

  test('go: *_test.go is a test file', () => {
    assert.ok(isTestFile('foo_test.go', 'go'));
    assert.ok(!isTestFile('foo.go', 'go'));
  });
});

// ---------------------------------------------------------------------------
// testScope — monorepo subpackage (FIX 1 new cases)
// ---------------------------------------------------------------------------

describe('testScope — monorepo subpackage awareness', () => {
  test('(a) source file in subpackage finds its test via subpackage test dir (non-fallback)', () => {
    // Monorepo layout:
    //   <tmpDir>/                   ← git root (no package.json here)
    //   <tmpDir>/pkg/package.json   ← subpackage manifest
    //   <tmpDir>/pkg/lib/foo.js     ← source file
    //   <tmpDir>/pkg/test/foo.test.js  ← test file
    const pkgDir = path.join(tmpDir, 'pkg');
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"mypkg"}');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(pkgDir, 'test', 'foo.test.js'), '// test');

    const result = testScope({
      files: ['pkg/lib/foo.js'],
      baseline: 'node --test --test-concurrency=1',
      projectRoot: tmpDir,
    });

    assert.ok(!result.fallback, 'must NOT fallback when test file exists in subpackage');
    assert.ok(
      result.testCommand.includes('foo.test.js'),
      `testCommand must reference foo.test.js, got: ${result.testCommand}`,
    );
    assert.ok(
      result.testCommand.includes('cd pkg'),
      `testCommand must cd into the subpackage, got: ${result.testCommand}`,
    );
    assert.ok(result.files.length > 0, 'files must be non-empty');
  });

  test('(a) returned testCommand uses cd <subdir> form when moduleRoot !== projectRoot', () => {
    const pkgDir = path.join(tmpDir, 'mypkg');
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"mypkg"}');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'bar.js'), '// source');
    fs.writeFileSync(path.join(pkgDir, 'test', 'bar.test.js'), '// test');

    const result = testScope({
      files: [path.join(pkgDir, 'lib', 'bar.js')],   // absolute input
      baseline: 'node --test --test-concurrency=1',
      projectRoot: tmpDir,
    });

    assert.ok(!result.fallback, 'non-fallback expected');
    assert.ok(result.testCommand.startsWith('cd mypkg &&'), `expected 'cd mypkg && ...', got: ${result.testCommand}`);
  });

  test('(b) passing a test file directly returns non-fallback referencing that file', () => {
    const pkgDir = path.join(tmpDir, 'subpkg');
    fs.mkdirSync(path.join(pkgDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"subpkg"}');
    fs.writeFileSync(path.join(pkgDir, 'test', 'foo.test.js'), '// test');

    const result = testScope({
      files: ['subpkg/test/foo.test.js'],
      baseline: 'node --test --test-concurrency=1',
      projectRoot: tmpDir,
    });

    assert.ok(!result.fallback, 'direct test file must not produce fallback');
    assert.ok(
      result.testCommand.includes('foo.test.js'),
      `testCommand must reference foo.test.js, got: ${result.testCommand}`,
    );
  });

  test('single-package repo still works without cd prefix (moduleRoot === projectRoot)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"single"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'x.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'x.test.js'), '// test');

    const result = testScope({
      files: ['lib/x.js'],
      baseline: 'node --test --test-concurrency=1',
      projectRoot: tmpDir,
    });

    assert.ok(!result.fallback, 'must not fallback');
    // Must NOT have a cd prefix when running from the same root
    assert.ok(
      !result.testCommand.startsWith('cd '),
      `single-package command must not have cd prefix, got: ${result.testCommand}`,
    );
    assert.ok(result.testCommand.includes('x.test.js'));
  });

  test('planning-only files still produce fallback even when subpackage exists', () => {
    const pkgDir = path.join(tmpDir, 'pkg2');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"pkg2"}');

    const result = testScope({
      files: ['refacil-sdd/changes/my-change/proposal.md'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback, 'planning-only inputs must still produce fallback');
  });
});

// ---------------------------------------------------------------------------
// testScope — noBaselineFallback (apply must never receive the full baseline)
// ---------------------------------------------------------------------------

describe('testScope — noBaselineFallback', () => {
  test('fallback returns EMPTY testCommand instead of baseline when noBaselineFallback', () => {
    // No stack manifest → stack unknown → fallback path
    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'npm test',
      projectRoot: tmpDir,
      noBaselineFallback: true,
    });
    assert.ok(result.fallback, 'should be fallback');
    assert.equal(result.testCommand, '', 'fallback testCommand must be empty, not the baseline');
    assert.ok(result.fallbackReason, 'fallbackReason must still explain why');
  });

  test('markdown-only input returns empty testCommand under noBaselineFallback', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"repo"}');
    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'agents', 'implementer.md'), '# implementer');

    const result = testScope({
      files: ['agents/implementer.md'],
      baseline: 'npm test',
      projectRoot: tmpDir,
      noBaselineFallback: true,
    });
    assert.ok(result.fallback);
    assert.equal(result.testCommand, '', 'apply must never receive the full suite command');
  });

  test('normal mode (default) still returns the baseline on fallback', () => {
    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });
    assert.ok(result.fallback);
    assert.equal(result.testCommand, 'npm test', '/refacil:test path keeps the baseline on fallback');
  });

  test('noBaselineFallback does NOT affect a successful scoped result', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"repo"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), "require('../lib/foo');");

    const result = testScope({
      files: ['lib/foo.js'],
      baseline: 'npm test',
      projectRoot: tmpDir,
      noBaselineFallback: true,
    });
    assert.ok(!result.fallback, 'a real scope must still narrow');
    assert.ok(result.testCommand.includes('foo.test.js'));
  });

  test('CLI --no-baseline-fallback yields empty testCommand on fallback', () => {
    const r = runTestScope(tmpDir, [
      '--files', 'lib/foo.js',
      '--baseline', 'npm test',
      '--no-baseline-fallback',
      '--json',
    ]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(parsed.fallback, 'should be fallback (no stack manifest in tmpDir)');
    assert.equal(parsed.testCommand, '', 'CLI must emit empty testCommand under --no-baseline-fallback');
  });
});

// ---------------------------------------------------------------------------
// isCodeFileForStack — non-code files must not drive test scoping
// ---------------------------------------------------------------------------

describe('isCodeFileForStack', () => {
  test('node: .js/.ts/.mjs are code; .md/.json/.yaml are not', () => {
    assert.ok(isCodeFileForStack('lib/foo.js', 'node'));
    assert.ok(isCodeFileForStack('lib/foo.ts', 'node'));
    assert.ok(isCodeFileForStack('lib/foo.mjs', 'node'));
    assert.ok(!isCodeFileForStack('skills/apply/SKILL.md', 'node'));
    assert.ok(!isCodeFileForStack('config.json', 'node'));
  });

  test('python: only .py is code', () => {
    assert.ok(isCodeFileForStack('src/foo.py', 'python'));
    assert.ok(!isCodeFileForStack('README.md', 'python'));
  });

  test('unknown stack → never code', () => {
    assert.ok(!isCodeFileForStack('foo.js', 'unknown'));
  });
});

// ---------------------------------------------------------------------------
// testScope — non-code (markdown) source files must not false-match tests
// Regression: skill/agent .md docs in a Node repo previously scoped unrelated
// tests via the loose basename import match (or forced a full-suite fallback).
// ---------------------------------------------------------------------------

describe('testScope — non-code source files do not false-match tests', () => {
  test('a markdown file does not scope a test that merely mentions its name', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"repo"}');
    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    // A non-code agent doc whose basename ('implementer') is mentioned by a test
    fs.writeFileSync(path.join(tmpDir, 'agents', 'implementer.md'), '# implementer agent');
    fs.writeFileSync(
      path.join(tmpDir, 'test', 'installer.test.js'),
      "const agents = ['implementer', 'tester'];\n// unrelated parity test",
    );

    const result = testScope({
      files: ['agents/implementer.md'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });

    assert.ok(result.fallback, 'a non-code markdown file must not produce a scoped run');
    assert.equal(result.testCommand, 'npm test');
    assert.equal(result.files.length, 0, 'no test files should be scoped from a .md input');
  });

  test('mixed code + markdown: markdown adds no unrelated tests; code still narrows', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"repo"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// source');
    fs.writeFileSync(path.join(tmpDir, 'test', 'foo.test.js'), "require('../lib/foo');");
    // An agent doc whose basename ('bar') is mentioned by an unrelated test
    fs.writeFileSync(path.join(tmpDir, 'agents', 'bar.md'), '# bar agent');
    fs.writeFileSync(path.join(tmpDir, 'test', 'bar.test.js'), "const name = 'bar';");

    const result = testScope({
      files: ['lib/foo.js', 'agents/bar.md'],
      baseline: 'npm test',
      projectRoot: tmpDir,
    });

    assert.ok(!result.fallback, 'code file must still narrow');
    assert.ok(result.testCommand.includes('foo.test.js'), 'must scope the code file test');
    assert.ok(
      !result.testCommand.includes('bar.test.js'),
      'markdown basename must not false-match an unrelated test',
    );
  });
});

// ---------------------------------------------------------------------------
// affectedComponents — language-agnostic component discovery
// ---------------------------------------------------------------------------

describe('affectedComponents', () => {
  test('returns empty array for empty files input', () => {
    const result = affectedComponents({ files: [], projectRoot: tmpDir });
    assert.deepEqual(result, []);
  });

  test('returns empty array when all files are planning-only', () => {
    const result = affectedComponents({
      files: ['refacil-sdd/changes/foo/proposal.md', 'AGENTS.md'],
      projectRoot: tmpDir,
    });
    assert.deepEqual(result, []);
  });

  test('single package at root → component root is empty string', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"root-pkg"}');
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib', 'foo.js'), '// src');

    const result = affectedComponents({
      files: ['lib/foo.js'],
      projectRoot: tmpDir,
    });
    assert.equal(result.length, 1, 'should detect exactly one component');
    assert.equal(result[0].root, '', 'root-level component must have root = ""');
    assert.equal(result[0].stack, 'node');
  });

  test('two distinct subpackages → two components, sorted by root', () => {
    // pkgA/ and pkgB/ each have their own package.json
    const pkgADir = path.join(tmpDir, 'pkgA');
    const pkgBDir = path.join(tmpDir, 'pkgB');
    fs.mkdirSync(path.join(pkgADir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(pkgBDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkgADir, 'package.json'), '{"name":"pkgA"}');
    fs.writeFileSync(path.join(pkgBDir, 'package.json'), '{"name":"pkgB"}');
    fs.writeFileSync(path.join(pkgADir, 'lib', 'a.js'), '// a');
    fs.writeFileSync(path.join(pkgBDir, 'src', 'b.js'), '// b');

    const result = affectedComponents({
      files: ['pkgA/lib/a.js', 'pkgB/src/b.js'],
      projectRoot: tmpDir,
    });

    assert.equal(result.length, 2, 'should detect two distinct components');
    assert.equal(result[0].root, 'pkgA', 'first component must be pkgA (sorted)');
    assert.equal(result[0].stack, 'node');
    assert.equal(result[1].root, 'pkgB', 'second component must be pkgB (sorted)');
    assert.equal(result[1].stack, 'node');
  });

  test('two files in the same subpackage → one component only', () => {
    const pkgDir = path.join(tmpDir, 'mypkg');
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"mypkg"}');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'x.js'), '// x');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'y.js'), '// y');

    const result = affectedComponents({
      files: ['mypkg/lib/x.js', 'mypkg/lib/y.js'],
      projectRoot: tmpDir,
    });

    assert.equal(result.length, 1, 'two files in same component → single component entry');
    assert.equal(result[0].root, 'mypkg');
  });

  test('mixed planning + real files → only real files contribute to components', () => {
    const pkgDir = path.join(tmpDir, 'realpkg');
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"realpkg"}');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'z.js'), '// z');

    const result = affectedComponents({
      files: ['refacil-sdd/changes/foo/tasks.md', 'realpkg/lib/z.js'],
      projectRoot: tmpDir,
    });

    assert.equal(result.length, 1, 'planning files are excluded; only real file contributes');
    assert.equal(result[0].root, 'realpkg');
  });

  test('file at projectRoot level (no subpackage manifest above) → root = ""', () => {
    // No package.json anywhere in tmpDir
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.go'), 'package main');
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/foo');

    const result = affectedComponents({
      files: ['src/main.go'],
      projectRoot: tmpDir,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].root, '', 'go module at root → root = ""');
    assert.equal(result[0].stack, 'go');
  });

  test('absolute file paths are handled correctly', () => {
    const pkgDir = path.join(tmpDir, 'abspkg');
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"abspkg"}');
    fs.writeFileSync(path.join(pkgDir, 'lib', 'abs.js'), '// abs');

    // Pass an absolute path
    const result = affectedComponents({
      files: [path.join(pkgDir, 'lib', 'abs.js')],
      projectRoot: tmpDir,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].root, 'abspkg');
    assert.equal(result[0].stack, 'node');
  });
});
