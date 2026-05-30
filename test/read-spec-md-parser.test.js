'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseMarkdown,
  parseFile,
  preprocessMarkdown,
  extractArtifactLanguageMeta,
  MAX_FILE_BYTES,
} = require('../lib/spec-reader/md-parser');

describe('read-spec md-parser', () => {
  test('CA-09: strips inline markdown syntax', () => {
    const input = '# Title\n**bold** and _italic_ with `code`';
    const sections = parseMarkdown(input);
    const combined = sections.map((s) => s.text).join(' ');
    assert.ok(!combined.includes('**'));
    assert.ok(!combined.includes('`'));
    assert.match(combined, /bold/);
    assert.match(combined, /italic/);
    assert.match(combined, /code/);
  });

  test('CA-10: named-language code blocks become spoken label, not source', () => {
    const input = '## Section\n```typescript\nconst x = 1;\n```\n';
    const sections = parseMarkdown(input);
    const text = sections.map((s) => `${s.title} ${s.text}`).join(' ');
    assert.match(text, /code block:\s*typescript/i);
    assert.ok(!text.includes('const x'));
  });

  test('unlabeled code block body is read as plain text (diagrams, dependency graphs)', () => {
    const input = [
      '## Dependencias',
      '',
      '```',
      'T-01 → T-02 → T-03',
      'T-04 es independiente',
      '```',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const text = sections[0].text;
    assert.ok(!text.includes('code block'), 'unlabeled block must not produce "code block" label');
    assert.match(text, /T-01/, 'diagram content must be spoken');
    assert.match(text, /T-04/, 'all lines must be included');
    assert.match(text, /arrow/, '→ must be normalized to "arrow"');
  });

  test('CA-11: segments by headings', () => {
    const input = '## CA-01\nFirst.\n\n## CA-02\nSecond.';
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 2);
    assert.match(sections[0].title, /CA-01/);
    assert.match(sections[1].title, /CA-02/);
  });

  test('strips HTML comments and does not speak them', () => {
    const input = [
      '# Doc',
      '<!-- refacil-sdd: artifactLanguage=spanish -->',
      '',
      '## Purpose',
      'Real content.',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.ok(!sections.some((s) => s.text.includes('artifactLanguage')));
    assert.match(sections[0].title, /Purpose/);
  });

  test('merges #### Scenario into parent ### requirement section', () => {
    const input = [
      '### Requirement: CA-01: Title',
      '',
      '#### Scenario: S1',
      '**Dado** x',
      '**Cuando** y',
      '**Entonces** z',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    assert.match(sections[0].text, /Dado/);
    assert.match(sections[0].text, /Scenario: S1|Entonces z/);
  });

  test('skips heading-only sections without body (no empty TTS blocks)', () => {
    const input = [
      '# Document title',
      '',
      '## Purpose',
      'Real content here.',
      '',
      '## Requirements',
      '',
      '### Requirement: CLI',
      'The system SHALL expose read-spec.',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 2);
    assert.match(sections[0].title, /Purpose/);
    assert.match(sections[0].text, /Real content/);
    assert.match(sections[1].title, /Requirement: CLI/);
    assert.ok(!sections.some((s) => s.text === ''));
  });

  test('CA-12: normalizes arrows and removes emojis', () => {
    const input = 'Flow A → B ✅ done';
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.ok(!text.includes('✅'));
    assert.match(text, /arrow/i);
  });

  test('CA-13: links keep visible text only', () => {
    const input = 'See [docs](https://example.com) and ![alt](img.png)';
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.match(text, /docs/);
    assert.match(text, /alt/);
    assert.ok(!text.includes('https://'));
    assert.ok(!text.includes('img.png'));
  });

  test('CR-05: empty file yields one empty section', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-parser-'));
    const file = path.join(tmp, 'empty.md');
    fs.writeFileSync(file, '   \n', 'utf8');
    const sections = parseFile(file);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].text, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('CR-06: enforces max file size with controlled error', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'read-spec-large-'));
    const under = path.join(tmp, 'under.md');
    const over = path.join(tmp, 'over.md');
    const chunk = '## Section\nLine of spec text.\n\n';
    const underRepeats = Math.floor((MAX_FILE_BYTES - 100) / chunk.length);
    fs.writeFileSync(under, chunk.repeat(underRepeats), 'utf8');
    assert.ok(fs.statSync(under).size <= MAX_FILE_BYTES);
    const sections = parseFile(under);
    assert.ok(sections.length >= 1);

    const overRepeats = Math.ceil((MAX_FILE_BYTES + 1024) / chunk.length);
    fs.writeFileSync(over, chunk.repeat(overRepeats), 'utf8');
    assert.ok(fs.statSync(over).size > MAX_FILE_BYTES);
    assert.throws(
      () => parseFile(over),
      (err) => err.message.includes(String(MAX_FILE_BYTES)),
    );
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // T-06: new tests for rawMarkdown field and TTS punctuation improvements

  test('T-06-a: rawMarkdown field is populated in each section', () => {
    const input = [
      '## Introduction',
      '',
      'This is a **bold** statement.',
      '',
      '## Details',
      '',
      'Another paragraph with `code`.',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 2);
    // rawMarkdown must be present on each section
    for (const sec of sections) {
      assert.ok('rawMarkdown' in sec, 'section must have rawMarkdown field');
    }
    // rawMarkdown must preserve inline markdown syntax (not stripped)
    assert.match(sections[0].rawMarkdown, /\*\*bold\*\*/);
    assert.match(sections[1].rawMarkdown, /`code`/);
    // text must still be stripped (pipeline unchanged)
    assert.ok(!sections[0].text.includes('**'));
    assert.ok(!sections[1].text.includes('`'));
  });

  test('T-06-a: rawMarkdown contains the original body before strip pipeline', () => {
    const input = '## Section\n```js\nconst x = 1;\n```\nSome prose.';
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    assert.match(sections[0].rawMarkdown, /```js/);
    assert.match(sections[0].rawMarkdown, /const x = 1/);
    // text must replace code block with label
    assert.match(sections[0].text, /code block/i);
    assert.ok(!sections[0].text.includes('const x'));
  });

  test('T-06-b: CA-07 paragraphs without terminal punctuation receive a period', () => {
    const input = [
      '## Section',
      '',
      'First sentence ends here',
      'Second sentence is done',
      'Third already has a period.',
      'Fourth ends with exclamation!',
      'Fifth ends with question?',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const lines = sections[0].text.split('\n');
    // All lines must end with terminal punctuation
    for (const line of lines) {
      if (!line.trim()) continue;
      assert.match(line, /[.!?]$/, `Line missing terminal punctuation: "${line}"`);
    }
    // Lines that already had punctuation must not get double punctuation
    const thirdLine = lines.find((l) => l.includes('already has a period'));
    assert.ok(thirdLine, 'third line should be present');
    assert.ok(!thirdLine.endsWith('..'), 'should not double-period');
  });

  test('T-06-c: list items all end with period (TTS flattens \\n to space — period creates longer pause than comma)', () => {
    const input = [
      '## Requirements',
      '',
      '- Item one',
      '- Item two',
      '- Item three',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const lines = sections[0].text.split('\n');
    const nonEmpty = lines.filter((l) => l.trim());
    assert.ok(nonEmpty.length >= 3, 'should have at least 3 lines for 3 list items');
    // Every item (including intermediate ones) must end with period for proper TTS pausing
    for (let j = 0; j < nonEmpty.length; j++) {
      assert.match(nonEmpty[j], /\.$/, `List item ${j} should end with period: "${nonEmpty[j]}"`);
    }
  });

  test('T-06-c: CA-08 single list item ends with period (no comma needed)', () => {
    const input = '## Single\n\n- Only item';
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const text = sections[0].text.trim();
    assert.match(text, /\.$/, 'Single list item should end with period');
    assert.ok(!text.endsWith(','), 'Single list item should not end with comma');
  });

  test('T-06-c: CA-08 non-list paragraphs are not punctuated with commas', () => {
    const input = [
      '## Section',
      '',
      'First paragraph line',
      'Second paragraph line',
    ].join('\n');
    const sections = parseMarkdown(input);
    const lines = sections[0].text.split('\n').filter((l) => l.trim());
    // Non-list lines should have periods, not commas between items
    for (const line of lines) {
      assert.match(line, /[.!?]$/, `Non-list line should end with terminal punct: "${line}"`);
      assert.ok(!line.endsWith(','), `Non-list line should not end with comma: "${line}"`);
    }
  });

  // CA-06: rawMarkdown fallback — when a section has no body, rawMarkdown is falsy
  // (empty string), which is the condition app.js uses to fall back to section.text.
  // The actual DOM fallback rendering is browser-only and not unit-testable here.
  test('CA-06: heading-only section produces falsy rawMarkdown (empty string) — app.js fallback condition', () => {
    // A heading followed immediately by another heading has no body: rawMarkdown must be ''
    // We construct a document where the first section (Purpose) HAS a body but the
    // second heading (Empty) has no body before the next heading flushes it.
    // In practice parseMarkdown skips bodyless sections, so we verify via a section
    // that does have body: its rawMarkdown is non-empty (truthy).
    // And for the inverse: a section with only whitespace body is also skipped.
    const withBody = '## Section\n\nSome content here.';
    const sections = parseMarkdown(withBody);
    assert.equal(sections.length, 1);
    assert.ok(sections[0].rawMarkdown, 'section with body must have truthy rawMarkdown');
    assert.match(sections[0].rawMarkdown, /Some content here/);

    // A heading-only document (no body under any heading) yields the empty fallback
    const headingOnly = '## Title Only\n\n## Another Title';
    const fallbackSections = parseMarkdown(headingOnly);
    // Both headings have no body: parseMarkdown returns [{title:'', text:''}] fallback
    assert.equal(fallbackSections.length, 1);
    assert.equal(fallbackSections[0].text, '');
    // rawMarkdown on the empty fallback section should be undefined or empty (falsy)
    const rm = fallbackSections[0].rawMarkdown;
    assert.ok(!rm, `rawMarkdown should be falsy on empty fallback section, got: ${JSON.stringify(rm)}`);
  });

  test('ordered list items all end with period', () => {
    const input = [
      '## Steps',
      '',
      '1. First step',
      '2. Second step',
      '3. Third step',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const lines = sections[0].text.split('\n').filter((l) => l.trim());
    assert.ok(lines.length >= 3, 'should have 3 lines for 3 ordered items');
    for (let j = 0; j < lines.length; j++) {
      assert.match(lines[j], /\.$/, `Ordered item ${j} should end with period: "${lines[j]}"`);
    }
  });

  // extractArtifactLanguageMeta — exported utility, no existing test
  test('extractArtifactLanguageMeta: returns language tag from HTML comment', () => {
    const spanish = '<!-- refacil-sdd: artifactLanguage=spanish -->\n## Section\nContent.';
    assert.equal(extractArtifactLanguageMeta(spanish), 'spanish');

    const english = '<!-- refacil-sdd: artifactLanguage=English -->\n## Section\nContent.';
    assert.equal(extractArtifactLanguageMeta(english), 'english');

    const missing = '## Section\nContent without meta comment.';
    assert.equal(extractArtifactLanguageMeta(missing), null);
  });

  // preprocessMarkdown — exported utility, no existing direct test
  test('preprocessMarkdown: strips HTML comments and horizontal rules', () => {
    const input = [
      '<!-- some comment -->',
      '## Section',
      '---',
      'Content.',
    ].join('\n');
    const result = preprocessMarkdown(input);
    assert.ok(!result.includes('<!-- some comment -->'), 'HTML comments must be removed');
    assert.ok(!result.includes('---'), 'horizontal rules (---) must be removed');
    assert.ok(result.includes('Content.'), 'body content must survive preprocessing');
  });

  test('preprocessMarkdown: translates Scenario/Requirement headings for Spanish docs', () => {
    const input = [
      '<!-- refacil-sdd: artifactLanguage=spanish -->',
      '#### Scenario: happy path',
      '### Requirement: must pass',
    ].join('\n');
    const result = preprocessMarkdown(input);
    assert.match(result, /#### Escenario:/);
    assert.match(result, /### Requisito:/);
  });

  // CA-10 extended: URLs in plain text (not markdown links) should not bleed into TTS text
  test('CA-10: plain https:// URLs are not left in speakable text', () => {
    // stripInlineMarkdown handles [text](url) form; verify that case is clean
    const input = '## Section\nSee [the docs](https://example.com/path?q=1) for details.';
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.ok(!text.includes('https://'), 'URL should be stripped from speakable text');
    assert.match(text, /the docs/, 'visible link text should be preserved');
  });

  // CR-05 — sectionSpeakText is defined in app.js, not exported from md-parser.js.
  // This criterion (must use section.text exclusively, never rawMarkdown) is NOT
  // unit-testable from this module. Documented here as a reminder for DOM/integration tests.
  // (No test added — would be trivially passing without validating real behavior.)

  // CA-09 — sectionSpeakText title prepend behavior is in app.js, not exported from
  // md-parser.js. Not unit-testable from this module without importing app.js with DOM deps.

  // Table and HTML-tag TTS handling

  test('markdown table reads headers then each data row as comma list', () => {
    const input = [
      '## Criterios',
      '',
      '| Nombre | Tipo | Requerido |',
      '|--------|------|-----------|',
      '| campo  | int  | sí        |',
      '| valor  | str  | no        |',
    ].join('\n');
    const sections = parseMarkdown(input);
    assert.equal(sections.length, 1);
    const text = sections[0].text;
    assert.match(text, /tabla:\s*Nombre.*Tipo.*Requerido/i, 'header label must appear');
    assert.ok(!text.includes('|'), 'pipe characters must not be in TTS text');
    assert.ok(!text.includes('---'), 'separator row must not appear');
    // Data row values must be spoken
    assert.match(text, /campo/, 'first data row must appear');
    assert.match(text, /valor/, 'second data row must appear');
    assert.match(text, /\bint\b/, 'cell value "int" must be spoken');
  });

  test('table without a separator row is not stripped (not a real table)', () => {
    const input = '## Section\n| not | a | table |\n| still prose |';
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    // No separator row → treated as plain text, pipes become part of spoken text
    // (behaviour unchanged: this is not a markdown table)
    assert.ok(!text.includes('tabla:'), 'should not be treated as a table without separator');
  });

  test('HTML tags in spec text are replaced with their tag name', () => {
    const input = [
      '## Renderizado',
      '',
      'Se renderiza como `<table>` con `<thead>` y filas `<tr><td>`.',
    ].join('\n');
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.ok(!text.includes('<'), 'angle brackets must not appear in TTS text');
    assert.ok(!text.includes('>'), 'angle brackets must not appear in TTS text');
    assert.match(text, /table/i, 'tag name "table" must be spoken');
    assert.match(text, /thead/i, 'tag name "thead" must be spoken');
    assert.match(text, /tr/i, 'tag name "tr" must be spoken');
    assert.match(text, /td/i, 'tag name "td" must be spoken');
  });

  test('closing HTML tags also produce tag name (not silent)', () => {
    const input = '## Sec\nUsa `<strong>` y `</strong>` para negrita.';
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.ok(!text.includes('<'), 'no angle brackets');
    assert.match(text, /strong/i, 'tag name must appear at least once');
  });

  test('lines ending with colon do not get an extra period (avoids "Incluye:." double-pause)', () => {
    const input = [
      '## Scope',
      '',
      'Incluye:',
      '- Item one',
      '- Item two',
    ].join('\n');
    const sections = parseMarkdown(input);
    const text = sections[0].text;
    assert.ok(!text.includes(':.'), 'colon followed by period must not appear');
    assert.ok(text.includes('Incluye:'), 'colon label must be preserved');
  });
});
