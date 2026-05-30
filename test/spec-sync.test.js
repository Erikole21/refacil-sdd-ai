'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  syncSpecToCatalog,
  detectLanguageFromChange,
  collectSpecSourceFiles,
  parseCriteriaBlocks,
} = require('../lib/spec-sync');

describe('spec-sync', () => {
  test('detects Spanish from ## Objetivo in proposal', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'demo-es');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      '## Objetivo\n\nIntegrar TTS.\n',
      'utf8',
    );
    assert.equal(detectLanguageFromChange(changeDir), 'spanish');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('sync-spec preserves Spanish Dado/Cuando/Entonces in catalog spec', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'demo-es');
    const specsDir = path.join(changeDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      '## Objetivo\n\nLectura en voz alta de specs.\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(specsDir, '01.md'),
      [
        '## CA-01: Comando registrado',
        '',
        '**Dado** el paquete instalado',
        '**Cuando** ejecuto read-spec --help',
        '**Entonces** aparece la documentación',
      ].join('\n'),
      'utf8',
    );

    const result = syncSpecToCatalog(tmp, 'demo-es');
    const spec = fs.readFileSync(result.specPath, 'utf8');

    assert.equal(result.language, 'spanish');
    assert.match(spec, /Especificación/);
    assert.match(spec, /## Propósito/);
    assert.match(spec, /## Requisitos/);
    assert.match(spec, /\*\*Dado\*\*/);
    assert.match(spec, /\*\*Cuando\*\*/);
    assert.match(spec, /\*\*Entonces\*\*/);
    assert.ok(!spec.includes('**Given**'));
    assert.match(spec, /artifactLanguage=spanish/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('parseCriteriaBlocks extracts CA and CR', () => {
    const md = '## CA-01: A\n**Dado** x\n\n## CR-01: B\n**Cuando** y';
    const items = parseCriteriaBlocks(md);
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 'CA-01');
    assert.equal(items[1].isRejection, true);
  });

  test('collectSpecSourceFiles finds nested specs/**/*.md in sorted order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'nested-specs');
    fs.mkdirSync(path.join(changeDir, 'specs', 'b'), { recursive: true });
    fs.mkdirSync(path.join(changeDir, 'specs', 'a', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs', 'b', '02.md'), '## CA-02: B\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'a', 'deep', '01.md'), '## CA-01: A\n');

    const files = collectSpecSourceFiles(changeDir).map((file) =>
      path.relative(changeDir, file).replace(/\\/g, '/'));

    assert.deepEqual(files, ['specs/a/deep/01.md', 'specs/b/02.md']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('collectSpecSourceFiles returns empty list for empty specs/ directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'empty-specs');
    fs.mkdirSync(path.join(changeDir, 'specs', 'empty-child'), { recursive: true });

    assert.deepEqual(collectSpecSourceFiles(changeDir), []);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('collectSpecSourceFiles ignores empty specs.md and empty nested Markdown files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'empty-markdown');
    fs.mkdirSync(path.join(changeDir, 'specs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '   \n\t');
    fs.writeFileSync(path.join(changeDir, 'specs', 'nested', 'empty.md'), '\n\n');

    assert.deepEqual(collectSpecSourceFiles(changeDir), []);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('collectSpecSourceFiles falls back to nested specs when specs.md is empty', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'empty-root-with-nested');
    fs.mkdirSync(path.join(changeDir, 'specs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '');
    fs.writeFileSync(path.join(changeDir, 'specs', 'nested', 'valid.md'), '## CA-01: Valid nested spec\n');

    const files = collectSpecSourceFiles(changeDir).map((file) =>
      path.relative(changeDir, file).replace(/\\/g, '/'));

    assert.deepEqual(files, ['specs/nested/valid.md']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('collectSpecSourceFiles includes specs.md and recursive specs/**/*.md together', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'root-and-nested');
    fs.mkdirSync(path.join(changeDir, 'specs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs.md'), '## CA-01: Root spec\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'nested', 'valid.md'), '## CA-02: Nested spec\n');

    const files = collectSpecSourceFiles(changeDir).map((file) =>
      path.relative(changeDir, file).replace(/\\/g, '/'));

    assert.deepEqual(files, ['specs.md', 'specs/nested/valid.md']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('sync-spec consumes nested specs/**/*.md when specs.md is absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'nested-sync');
    const specsDir = path.join(changeDir, 'specs', 'payments');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Objective\n\nSync nested specs.\n', 'utf8');
    fs.writeFileSync(
      path.join(specsDir, 'pse.md'),
      '## CA-01: Nested criterion\n\n**Given** nested specs\n**When** syncing\n**Then** catalog includes them\n',
      'utf8',
    );

    const result = syncSpecToCatalog(tmp, 'nested-sync');
    const spec = fs.readFileSync(result.specPath, 'utf8');

    assert.equal(result.criteriaCount, 1);
    assert.match(spec, /Nested criterion/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('sync-spec consumes both specs.md and nested specs/**/*.md for compatibility', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-'));
    const changeDir = path.join(tmp, 'refacil-sdd', 'changes', 'combined-sync');
    const specsDir = path.join(changeDir, 'specs', 'payments');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Objective\n\nSync all specs.\n', 'utf8');
    fs.writeFileSync(
      path.join(changeDir, 'specs.md'),
      '## CA-01: Root criterion\n\n**Given** root specs\n**When** syncing\n**Then** catalog includes root\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(specsDir, 'pse.md'),
      '## CA-02: Nested criterion\n\n**Given** nested specs\n**When** syncing\n**Then** catalog includes nested\n',
      'utf8',
    );

    const result = syncSpecToCatalog(tmp, 'combined-sync');
    const spec = fs.readFileSync(result.specPath, 'utf8');

    assert.equal(result.criteriaCount, 2);
    assert.match(spec, /Root criterion/);
    assert.match(spec, /Nested criterion/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
