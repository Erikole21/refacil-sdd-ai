'use strict';

/**
 * test-scope.js — Multi-language test file selection logic.
 *
 * Encapsulates stack detection and scoped test file discovery so LLM
 * skills do not have to implement this logic themselves.
 *
 * Public API:
 *   detectStack(projectRoot)
 *   findTestFileByConvention(sourceFile, stack, projectRoot)
 *   findTestFilesByImport(sourceFile, stack, projectRoot)
 *   testScope({ files, stack, baseline, projectRoot })
 *   findModuleRoot(filePath, projectRoot)
 *   isTestFile(filePath, stack, projectRoot?)
 *   affectedComponents({ files, projectRoot })
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Known stacks — used to validate caller-supplied hints (Fix #3).
// An unrecognized hint is treated as 'unknown' to trigger the fallback path
// rather than silently building a wrong command.
// ---------------------------------------------------------------------------

const KNOWN_STACKS = ['node', 'python', 'go', 'rust', 'java', 'dotnet'];

// ---------------------------------------------------------------------------
// Planning-only file patterns — never justify a test run on their own.
// ---------------------------------------------------------------------------

const PLANNING_PATTERNS = [
  /refacil-sdd[\\/].+\.md$/i,
  /openspec[\\/].+\.md$/i,
  /^AGENTS\.md$/i,
  /^CLAUDE\.md$/i,
  /^\.cursorrules$/i,
  /^README\.md$/i,
  /^CHANGELOG\.md$/i,
];

function isPlanningFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return PLANNING_PATTERNS.some((re) => re.test(normalized));
}

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

/**
 * Detect the project stack from well-known config files.
 *
 * Returns one of: 'node', 'python', 'go', 'rust', 'java', 'dotnet', or 'unknown'.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function detectStack(projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return 'unknown';

  // Node.js
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) return 'node';

  // Python
  if (
    fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
    fs.existsSync(path.join(projectRoot, 'setup.py')) ||
    fs.existsSync(path.join(projectRoot, 'pytest.ini')) ||
    fs.existsSync(path.join(projectRoot, 'setup.cfg'))
  ) {
    return 'python';
  }

  // Go
  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) return 'go';

  // Rust
  if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) return 'rust';

  // Java/Kotlin (Maven or Gradle)
  if (
    fs.existsSync(path.join(projectRoot, 'pom.xml')) ||
    fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
    fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))
  ) {
    return 'java';
  }

  // .NET
  if (
    fs.existsSync(path.join(projectRoot, 'global.json')) ||
    fs.existsSync(path.join(projectRoot, 'Directory.Build.props'))
  ) {
    return 'dotnet';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Convention-based test file lookup
// ---------------------------------------------------------------------------

/**
 * Naming conventions per stack: given a source file, return candidate test
 * file paths (absolute) to check on disk.
 *
 * @param {string} sourceFile - absolute or relative path to source file
 * @param {string} stack
 * @param {string} projectRoot
 * @returns {string[]} existing test file paths
 */
function findTestFileByConvention(sourceFile, stack, projectRoot) {
  const abs = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(projectRoot, sourceFile);

  const dir = path.dirname(abs);
  const ext = path.extname(abs);
  const base = path.basename(abs, ext);
  const root = projectRoot || '';

  const candidates = [];

  if (stack === 'node') {
    // Common Node.js patterns
    // 1. Sibling test dir at same level: lib/foo.js → test/foo.test.js
    const relDir = root ? path.relative(root, dir) : dir;
    const relBase = path.join(relDir, base);

    // Direct sibling: lib/foo.js → lib/foo.test.js or lib/__tests__/foo.test.js
    candidates.push(path.join(dir, `${base}.test${ext}`));
    candidates.push(path.join(dir, `${base}.spec${ext}`));
    candidates.push(path.join(dir, '__tests__', `${base}.test${ext}`));

    // Parallel test directory (replace leading segment with 'test')
    if (root) {
      const segments = relBase.split(path.sep);
      if (segments.length >= 2) {
        // e.g. lib/foo → test/foo.test.js
        const withoutFirst = segments.slice(1).join(path.sep);
        candidates.push(path.join(root, 'test', `${withoutFirst}.test${ext}`));
        candidates.push(path.join(root, 'test', `${withoutFirst}.spec${ext}`));
        // e.g. lib/sub/foo → test/sub/foo.test.js
        candidates.push(
          path.join(root, 'test', path.dirname(withoutFirst), `${base}.test${ext}`),
        );
        // Direct test dir match
        candidates.push(path.join(root, 'test', `${base}.test${ext}`));
        candidates.push(path.join(root, 'test', `${base}.spec${ext}`));
      }
    }
  } else if (stack === 'python') {
    candidates.push(path.join(dir, `test_${base}.py`));
    candidates.push(path.join(dir, `${base}_test.py`));
    if (root) {
      candidates.push(path.join(root, 'tests', `test_${base}.py`));
      candidates.push(path.join(root, 'test', `test_${base}.py`));
    }
  } else if (stack === 'go') {
    // Go tests live alongside the source
    candidates.push(path.join(dir, `${base}_test.go`));
  } else if (stack === 'rust') {
    // Rust unit tests are inline; integration tests in tests/
    if (root) {
      candidates.push(path.join(root, 'tests', `${base}.rs`));
    }
  } else if (stack === 'java') {
    // Maven/Gradle: src/main/... → src/test/...
    const absNorm = abs.replace(/\\/g, '/');
    const testPath = absNorm.replace('/src/main/', '/src/test/');
    if (testPath !== absNorm) {
      const noExt = testPath.slice(0, -ext.length);
      candidates.push(`${noExt}Test${ext}`);
      candidates.push(`${noExt}Spec${ext}`);
    }
  } else if (stack === 'dotnet') {
    // .NET: look for <BaseName>Tests.cs / <BaseName>Test.cs in *.Tests/ or *.Test/ dirs at project root
    candidates.push(path.join(dir, `${base}Tests.cs`));
    candidates.push(path.join(dir, `${base}Test.cs`));
    if (root) {
      try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (!/\.(Tests?|Specs?)$/i.test(entry.name)) continue;
          const testProjectDir = path.join(root, entry.name);
          candidates.push(path.join(testProjectDir, `${base}Tests.cs`));
          candidates.push(path.join(testProjectDir, `${base}Test.cs`));
          // One level deeper (e.g. *.Tests/Services/PaymentServiceTests.cs)
          try {
            for (const sub of fs.readdirSync(testProjectDir, { withFileTypes: true })) {
              if (sub.isDirectory()) {
                candidates.push(path.join(testProjectDir, sub.name, `${base}Tests.cs`));
                candidates.push(path.join(testProjectDir, sub.name, `${base}Test.cs`));
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  // Deduplicate and return only existing files
  const seen = new Set();
  const result = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      if (fs.existsSync(c)) result.push(c);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Import-based test file lookup (grep for require/import of source file)
// ---------------------------------------------------------------------------

/**
 * Search the test directory for files that import/require the given source file.
 *
 * @param {string} sourceFile - absolute path to source file
 * @param {string} stack
 * @param {string} projectRoot
 * @returns {string[]} absolute paths of test files that import sourceFile
 */
function findTestFilesByImport(sourceFile, stack, projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return [];

  const abs = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(projectRoot, sourceFile);

  // Compute a relative require path fragment (without extension) to search for
  const relNoExt = path
    .relative(projectRoot, abs)
    .replace(/\\/g, '/')
    .replace(/\.[^.]+$/, '');

  // Also compute the basename without extension for local requires
  const baseNoExt = path.basename(abs, path.extname(abs));

  const testDirs = [];
  for (const d of ['test', 'tests', '__tests__', 'spec', 'specs']) {
    const full = path.join(projectRoot, d);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      testDirs.push(full);
    }
  }
  // For .NET, also scan *.Tests/ and *.Test/ project dirs at the root
  if (stack === 'dotnet') {
    try {
      for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && /\.(Tests?|Specs?)$/i.test(entry.name)) {
          testDirs.push(path.join(projectRoot, entry.name));
        }
      }
    } catch (_) {}
  }

  if (testDirs.length === 0) return [];

  // Determine file extensions to look for based on stack
  const exts = stack === 'python'
    ? ['.py']
    : stack === 'go'
      ? ['.go']
      : stack === 'rust'
        ? ['.rs']
        : stack === 'dotnet'
          ? ['.cs']
          : ['.js', '.ts', '.mjs', '.cjs'];

  const testExtPredicate = (f) => {
    const ext = path.extname(f);
    return exts.includes(ext);
  };

  function walkDir(dir) {
    let files = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          files = files.concat(walkDir(path.join(dir, e.name)));
        } else if (e.isFile() && testExtPredicate(e.name)) {
          files.push(path.join(dir, e.name));
        }
      }
    } catch (_) {}
    return files;
  }

  const result = [];
  for (const testDir of testDirs) {
    const testFiles = walkDir(testDir);
    for (const tf of testFiles) {
      try {
        const content = fs.readFileSync(tf, 'utf8');
        // Primary: match full relative path (e.g. require('../lib/installer'))
        // Fallback: match quoted basename (e.g. require('./installer') or import ... from 'installer')
        // The quote-bounded regex prevents false positives from comments or unrelated strings.
        const quotedBase = new RegExp("['\"]" + baseNoExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]");
        // For C#: match `using <ns>.<ClassName>` or direct class reference (e.g. `new PaymentService(`)
        const csClassRef = stack === 'dotnet'
          ? new RegExp('\\b' + baseNoExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
          : null;
        if (content.includes(relNoExt) || quotedBase.test(content) || (csClassRef && csClassRef.test(content))) {
          result.push(tf);
        }
      } catch (_) {}
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stack manifest filenames — used to detect a module root when walking up
// ---------------------------------------------------------------------------

const STACK_MANIFESTS = [
  'package.json',           // node
  'go.mod',                 // go
  'Cargo.toml',             // rust
  'pyproject.toml',         // python
  'setup.py',               // python
  'pytest.ini',             // python
  'setup.cfg',              // python
  'pom.xml',                // java (maven)
  'build.gradle',           // java (gradle)
  'build.gradle.kts',       // java (gradle kotlin dsl)
  'global.json',            // dotnet
  'Directory.Build.props',  // dotnet
];

/**
 * Find the nearest enclosing "module root" for a given source file.
 *
 * Walks up the directory tree from `fileDir`, stopping when it finds a
 * directory that contains any of the known stack manifests. Never goes above
 * `projectRoot`. If no manifest is found, returns `projectRoot` as fallback
 * (preserves single-package-repo behaviour).
 *
 * @param {string} fileDir      - absolute path to the directory of the source file
 * @param {string} projectRoot  - absolute project/git root — walking stops here
 * @returns {string} absolute path to the module root
 */
function findModuleRoot(fileDir, projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  let current = path.resolve(fileDir);

  // Safety: if fileDir is somehow above projectRoot, just return projectRoot.
  if (!current.startsWith(normalizedRoot)) return normalizedRoot;

  while (true) {
    const hasManifest = STACK_MANIFESTS.some((m) => fs.existsSync(path.join(current, m)));
    if (hasManifest) return current;
    // Stop at (and including) the project root — don't go above it.
    if (current === normalizedRoot) return normalizedRoot;
    const parent = path.dirname(current);
    // Guard against path.dirname returning the same dir at filesystem root.
    if (parent === current) return normalizedRoot;
    current = parent;
  }
}

// ---------------------------------------------------------------------------
// Test-file naming predicates per stack
// ---------------------------------------------------------------------------

/**
 * Returns true if the given filename/path looks like a test file for the stack.
 *
 * @param {string} filePath - absolute or relative path
 * @param {string} stack
 * @param {string} [projectRoot] - used only for rust (files under tests/)
 * @returns {boolean}
 */
function isTestFile(filePath, stack, projectRoot) {
  const base = path.basename(filePath);
  if (stack === 'node') {
    return /\.(test|spec)\.(js|ts|mjs|cjs)$/.test(base);
  }
  if (stack === 'python') {
    return /^test_/.test(base) || /_test\.py$/.test(base);
  }
  if (stack === 'go') {
    return base.endsWith('_test.go');
  }
  if (stack === 'rust') {
    if (!projectRoot) return false;
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    // Integration tests live under <moduleRoot>/tests/
    const normalized = abs.replace(/\\/g, '/');
    return /\/tests\/[^/]+\.rs$/.test(normalized);
  }
  if (stack === 'java') {
    return /Test\.|Spec\./.test(base);
  }
  if (stack === 'dotnet') {
    return /Tests?\.cs$/.test(base);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Build the scoped test command for a given (moduleRoot, detectedStack, testFiles)
// ---------------------------------------------------------------------------

/**
 * Build the stack-specific test command string for a set of test files,
 * ensuring the command runs from the correct module root.
 *
 * When `moduleRoot !== projectRoot`, the command is prefixed with a `cd`
 * directive so it executes from the subpackage directory. Test file paths
 * in the command are expressed relative to `moduleRoot`.
 *
 * @param {string[]} absTestFiles   - absolute paths to test files
 * @param {string}   detectedStack
 * @param {string}   moduleRoot     - absolute module root (may be a subdir of projectRoot)
 * @param {string}   projectRoot    - absolute project/git root
 * @param {string}   baseline       - the project baseline test command
 * @returns {string}
 */
function buildScopedCommand(absTestFiles, detectedStack, moduleRoot, projectRoot, baseline) {
  const base = baseline || '';
  const relTestFiles = absTestFiles.map((tf) =>
    path.relative(moduleRoot, tf).replace(/\\/g, '/'),
  );

  let innerCommand;
  if (detectedStack === 'node') {
    if (base.includes('node --test') || base.includes('node:test')) {
      innerCommand = `node --test --test-concurrency=1 ${relTestFiles.join(' ')}`;
    } else if (base.includes('jest')) {
      innerCommand = `${base} ${relTestFiles.join(' ')}`;
    } else if (base.includes('vitest')) {
      innerCommand = `vitest run ${relTestFiles.join(' ')}`;
    } else {
      innerCommand = `node --test --test-concurrency=1 ${relTestFiles.join(' ')}`;
    }
  } else if (detectedStack === 'python') {
    innerCommand = `pytest ${relTestFiles.join(' ')}`;
  } else if (detectedStack === 'go') {
    const pkgs = new Set(relTestFiles.map((f) => `./${path.dirname(f)}`));
    innerCommand = `go test ${Array.from(pkgs).join(' ')}`;
  } else if (detectedStack === 'rust') {
    innerCommand = `cargo test`;
  } else if (detectedStack === 'java') {
    innerCommand = `./gradlew test`;
  } else if (detectedStack === 'dotnet') {
    const filter = relTestFiles
      .map((f) => `FullyQualifiedName~${path.basename(f, '.cs')}`)
      .join('|');
    innerCommand = `dotnet test --filter "${filter}"`;
  } else {
    innerCommand = base;
  }

  // Prefix with `cd <subdir>` when running from a sub-package
  const normalizedRoot = path.resolve(projectRoot);
  const normalizedModule = path.resolve(moduleRoot);
  if (normalizedModule !== normalizedRoot) {
    const relModule = path.relative(normalizedRoot, normalizedModule).replace(/\\/g, '/');
    return `cd ${relModule} && ${innerCommand}`;
  }

  return innerCommand;
}

// ---------------------------------------------------------------------------
// Main testScope function
// ---------------------------------------------------------------------------

/**
 * Resolve the scoped test command for a set of changed source files.
 *
 * Monorepo-aware: for each input file, the enclosing module root is detected
 * independently so that files inside a sub-package resolve test conventions
 * relative to that sub-package (e.g. `refacil-sdd-ai/test/`) rather than
 * the git root.
 *
 * @param {object} opts
 * @param {string[]} opts.files        - source files changed (relative or absolute)
 * @param {string}   opts.stack        - stack hint (optional; auto-detected if omitted)
 * @param {string}   opts.baseline     - fallback test command (optional)
 * @param {string}   opts.projectRoot  - project root (optional; uses cwd if omitted)
 * @returns {{ testCommand: string, files: string[], fallback: boolean, fallbackReason: string|null }}
 */
function testScope({ files = [], stack, baseline = '', projectRoot } = {}) {
  const root = projectRoot || process.cwd();
  const base = baseline || '';

  // Fallback: empty files input
  if (!files || files.length === 0) {
    return {
      testCommand: base,
      files: [],
      fallback: true,
      fallbackReason: 'No source files provided — falling back to baseline.',
    };
  }

  // Filter out planning-only files
  const sourceFiles = files.filter((f) => !isPlanningFile(f));
  if (sourceFiles.length === 0) {
    return {
      testCommand: base,
      files: [],
      fallback: true,
      fallbackReason: 'All provided files are planning-only (markdown/SDD artifacts) — falling back to baseline.',
    };
  }

  // Validate caller-supplied stack hint: if the hint is not in KNOWN_STACKS,
  // treat it as 'unknown' to trigger fallback rather than silently building a
  // wrong command.
  const stackHintValid = stack && KNOWN_STACKS.includes(stack);
  const stackHintUnknown = stack && !KNOWN_STACKS.includes(stack);
  if (stackHintUnknown) {
    return {
      testCommand: base,
      files: [],
      fallback: true,
      fallbackReason: 'Stack could not be determined — falling back to baseline.',
    };
  }

  // Process each source file independently, resolving its module root so that
  // subpackages inside a monorepo narrow correctly.
  //
  // We group results by moduleRoot so that multi-module changes can produce
  // chained per-root commands. In the common (single-module) case this is
  // transparent — the result is identical to the previous behaviour.

  const byModule = new Map(); // moduleRoot -> { stack, testFiles: Set<absPath> }

  for (const f of sourceFiles) {
    const absSource = path.isAbsolute(f) ? f : path.resolve(root, f);

    // Determine the enclosing module root for this file.
    const fileDir = path.dirname(absSource);
    const moduleRoot = findModuleRoot(fileDir, root);

    // Detect stack for this module root (or use caller-supplied hint if valid).
    const fileStack = stackHintValid
      ? stack
      : detectStack(moduleRoot);

    if (fileStack === 'unknown') {
      // This file's stack is unknown — skip it but continue with others.
      continue;
    }

    if (!byModule.has(moduleRoot)) {
      byModule.set(moduleRoot, { stack: fileStack, testFiles: new Set() });
    }
    const entry = byModule.get(moduleRoot);

    // If this file is itself a test file, include it directly.
    if (isTestFile(absSource, fileStack, root)) {
      if (fs.existsSync(absSource)) {
        entry.testFiles.add(absSource);
      }
      continue;
    }

    // Convention-based lookup relative to the module root.
    const byConvention = findTestFileByConvention(absSource, fileStack, moduleRoot);
    for (const tf of byConvention) entry.testFiles.add(tf);

    // Import-based lookup relative to the module root.
    const byImport = findTestFilesByImport(absSource, fileStack, moduleRoot);
    for (const tf of byImport) entry.testFiles.add(tf);
  }

  // Remove modules with no test files found.
  for (const [mod, entry] of byModule.entries()) {
    if (entry.testFiles.size === 0) byModule.delete(mod);
  }

  // Fallback: no test files found at all (either stack unknown or no test files).
  if (byModule.size === 0) {
    // Distinguish "stack unknown" from "test files not found".
    // If stack hint was valid but no test files → "not found".
    // If stack was auto-detected and all files were 'unknown' stack → "stack unknown".
    const allAbsSources = sourceFiles.map((f) =>
      path.isAbsolute(f) ? f : path.resolve(root, f),
    );
    const anyKnownStack = allAbsSources.some((abs) => {
      const moduleRoot = findModuleRoot(path.dirname(abs), root);
      return detectStack(moduleRoot) !== 'unknown';
    });

    if (!anyKnownStack && !stackHintValid) {
      return {
        testCommand: base,
        files: [],
        fallback: true,
        fallbackReason: 'Stack could not be determined — falling back to baseline.',
      };
    }

    return {
      testCommand: base,
      files: [],
      fallback: true,
      fallbackReason: 'No test files found for the given source files — falling back to baseline.',
    };
  }

  // Build per-module commands and collect relative file paths (relative to projectRoot
  // for the returned `files` field — for observability; the command itself uses
  // module-relative paths).
  const commands = [];
  const allRelFiles = [];

  for (const [moduleRoot, entry] of byModule.entries()) {
    const absTestFiles = Array.from(entry.testFiles);
    const cmd = buildScopedCommand(absTestFiles, entry.stack, moduleRoot, root, base);
    commands.push(cmd);

    // For the `files` field, emit paths relative to projectRoot.
    for (const tf of absTestFiles) {
      allRelFiles.push(path.relative(root, tf).replace(/\\/g, '/'));
    }
  }

  const testCommand = commands.join(' && ');

  return {
    testCommand,
    files: allRelFiles,
    fallback: false,
    fallbackReason: null,
  };
}

// ---------------------------------------------------------------------------
// affectedComponents — identify the distinct components touched by a file set
// ---------------------------------------------------------------------------

/**
 * Given a list of changed files, return the distinct "components" (enclosing
 * module roots) that contain real (non-planning) source files.
 *
 * A component is the nearest ancestor directory (up from each changed file,
 * bounded by projectRoot) that contains a stack manifest. This is
 * language-agnostic: the same manifest list used by findModuleRoot() is used
 * here, so the result is correct for Node, Python, Go, Rust, Java, .NET, etc.
 *
 * Returns an array of objects in deterministic order (sorted by root):
 *   [{ root: '<relative-path-from-projectRoot>', stack: '<detected stack>' }, ...]
 *
 * Files whose module root IS projectRoot are returned with root '' (empty string)
 * rather than '.' so callers can test `if (component.root)` for "is a subdir".
 *
 * Planning-only files (isPlanningFile) are excluded before computing components.
 * Files with an unknown stack are included with stack 'unknown' so the caller
 * can decide whether to skip or warn.
 *
 * @param {object} opts
 * @param {string[]} opts.files        - changed/new file paths (relative or absolute)
 * @param {string}   opts.projectRoot  - project/git root (optional; uses cwd if omitted)
 * @returns {Array<{ root: string, stack: string }>}
 */
function affectedComponents({ files = [], projectRoot } = {}) {
  const root = path.resolve(projectRoot || process.cwd());

  if (!files || files.length === 0) return [];

  // Filter planning-only files first.
  const sourceFiles = files.filter((f) => !isPlanningFile(f));
  if (sourceFiles.length === 0) return [];

  // Collect distinct module roots (keyed by absolute path for dedup).
  const seen = new Map(); // absModuleRoot -> stack

  for (const f of sourceFiles) {
    const abs = path.isAbsolute(f) ? f : path.resolve(root, f);
    const fileDir = path.dirname(abs);
    const absModuleRoot = findModuleRoot(fileDir, root);
    if (!seen.has(absModuleRoot)) {
      seen.set(absModuleRoot, detectStack(absModuleRoot));
    }
  }

  // Convert to the public shape, sorting by relative root for determinism.
  const components = [];
  for (const [absModuleRoot, stack] of seen.entries()) {
    const rel = path.relative(root, absModuleRoot).replace(/\\/g, '/');
    // Files at the project root → root = '' (not '.')
    components.push({ root: rel === '.' ? '' : rel, stack });
  }

  components.sort((a, b) => a.root.localeCompare(b.root));
  return components;
}

module.exports = {
  detectStack,
  findTestFileByConvention,
  findTestFilesByImport,
  testScope,
  isPlanningFile,
  findModuleRoot,
  isTestFile,
  affectedComponents,
};
