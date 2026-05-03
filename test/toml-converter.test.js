'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { convertAgentToToml, mergeCodexHooks, removeCodexHooks } = require('../lib/toml-converter');

// ── convertAgentToToml ────────────────────────────────────────────────────────

describe('convertAgentToToml: typical agent conversion', () => {
  test('produces valid TOML with name, description, developer_instructions', () => {
    const md = `---
name: refacil-implementer
description: Implements tasks from SDD briefings
tools: [Edit, Write, Bash]
---
# Body content here

Some instructions.
`;
    const result = convertAgentToToml(md);
    assert.ok(result !== null, 'must return a TOML string');
    assert.match(result, /^name = "refacil-implementer"/m, 'must contain name field');
    assert.match(result, /^description = "Implements tasks from SDD briefings"/m, 'must contain description field');
    assert.match(result, /developer_instructions = """/, 'must contain developer_instructions multiline field');
    assert.match(result, /# Body content here/, 'body must be in developer_instructions');
    assert.match(result, /Some instructions\./, 'body content must be preserved');
  });

  test('TOML output ends with closing triple-quote', () => {
    const md = `---
name: refacil-tester
description: Runs tests
---
body line
`;
    const result = convertAgentToToml(md);
    assert.ok(result !== null);
    // Must end with """ followed by a newline
    assert.ok(result.trimEnd().endsWith('"""'), 'TOML must end with closing triple-quote');
  });
});

describe('convertAgentToToml: escaping double quotes in name/description', () => {
  test('double quotes in name are escaped', () => {
    const md = `---
name: refacil-"special"
description: Normal description
---
body
`;
    const result = convertAgentToToml(md);
    assert.ok(result !== null);
    // The name field must have escaped inner quotes
    assert.match(result, /name = "refacil-\\"special\\""/m, 'inner double-quotes in name must be escaped');
  });

  test('double quotes in description are escaped', () => {
    const md = `---
name: refacil-agent
description: The "best" agent
---
body
`;
    const result = convertAgentToToml(md);
    assert.ok(result !== null);
    assert.match(result, /description = "The \\"best\\" agent"/m, 'inner double-quotes in description must be escaped');
  });
});

describe('convertAgentToToml: body containing triple-quotes', () => {
  test('body with """ is escaped to prevent TOML multiline string termination', () => {
    const smolToml = require('smol-toml');
    const md = `---
name: refacil-agent
description: Agent with tricky body
---
Some text with """ inside.
More text.
`;
    const result = convertAgentToToml(md);
    assert.ok(result !== null, 'must return a string even when body has triple-quotes');
    // The TOML must be parseable without errors (no premature termination)
    let parsed;
    assert.doesNotThrow(() => { parsed = smolToml.parse(result); }, 'generated TOML must be valid (parseable)');
    // The body content must be present in developer_instructions
    assert.ok(parsed.developer_instructions.includes('Some text with'), 'body content must be preserved in developer_instructions');
    assert.ok(parsed.developer_instructions.includes('"""'), 'original triple-quote must survive round-trip');
  });
});

describe('convertAgentToToml: agent without frontmatter', () => {
  test('returns null when no frontmatter is present (CR-04)', () => {
    const md = `# Just a markdown file with no frontmatter

Some content here.
`;
    // Must not throw
    let result;
    assert.doesNotThrow(() => { result = convertAgentToToml(md); });
    assert.equal(result, null, 'must return null when frontmatter is missing');
  });

  test('returns null for empty string input', () => {
    let result;
    assert.doesNotThrow(() => { result = convertAgentToToml(''); });
    assert.equal(result, null);
  });
});

// ── mergeCodexHooks ───────────────────────────────────────────────────────────

describe('mergeCodexHooks: merges into existing config with non-SDD keys preserved', () => {
  test('non-SDD keys are preserved after merge', () => {
    const smolToml = require('smol-toml');
    const existing = smolToml.stringify({ someUserKey: 'value', model: 'o3' });

    const hooksToAdd = [
      { marker: '_sdd', event: 'sessionStart', command: 'refacil-sdd-ai check-update' },
    ];

    const result = mergeCodexHooks(existing, hooksToAdd);
    assert.ok(result !== null, 'must return merged TOML string');

    const parsed = smolToml.parse(result);
    assert.equal(parsed.someUserKey, 'value', 'non-SDD top-level key must be preserved');
    assert.equal(parsed.model, 'o3', 'non-SDD model key must be preserved');
    assert.ok(Array.isArray(parsed.hooks.sessionStart), 'hooks.sessionStart must be an array');
    assert.ok(parsed.hooks.sessionStart.some((h) => h._sdd === true), 'SDD hook must be present');
  });

  test('non-SDD hook entries in [hooks] are preserved', () => {
    const smolToml = require('smol-toml');
    const existing = smolToml.stringify({
      hooks: {
        sessionStart: [{ myCustomHook: true, command: 'my-tool' }],
      },
    });

    const hooksToAdd = [
      { marker: '_sdd', event: 'sessionStart', command: 'refacil-sdd-ai check-update' },
    ];

    const result = mergeCodexHooks(existing, hooksToAdd);
    const parsed = smolToml.parse(result);

    assert.ok(parsed.hooks.sessionStart.some((h) => h.myCustomHook === true), 'custom hook must be preserved');
    assert.ok(parsed.hooks.sessionStart.some((h) => h._sdd === true), 'SDD hook must be added');
  });

  test('ensures [features] codex_hooks = true is set', () => {
    const smolToml = require('smol-toml');
    const result = mergeCodexHooks('', [
      { marker: '_sdd', event: 'sessionStart', command: 'check-update' },
    ]);
    assert.ok(result !== null);
    const parsed = smolToml.parse(result);
    assert.equal(parsed.features && parsed.features.codex_hooks, true, '[features] codex_hooks must be true');
  });

  test('merges into empty string (fresh config)', () => {
    const smolToml = require('smol-toml');
    const hooksToAdd = [
      { marker: '_sdd', event: 'sessionStart', command: 'refacil-sdd-ai check-update' },
      { marker: '_sdd_notify', event: 'userPromptSubmit', command: 'refacil-sdd-ai notify-update' },
    ];
    const result = mergeCodexHooks('', hooksToAdd);
    assert.ok(result !== null);
    const parsed = smolToml.parse(result);
    assert.ok(parsed.hooks.sessionStart.some((h) => h._sdd === true));
    assert.ok(parsed.hooks.userPromptSubmit.some((h) => h._sdd_notify === true));
  });
});

describe('mergeCodexHooks: idempotence', () => {
  test('calling merge twice does not duplicate hooks', () => {
    const smolToml = require('smol-toml');
    const hooksToAdd = [
      { marker: '_sdd', event: 'sessionStart', command: 'refacil-sdd-ai check-update' },
      { marker: '_sdd_compact', event: 'preToolUse', command: 'refacil-sdd-ai compact-bash', matcher: 'Bash' },
    ];

    const firstPass = mergeCodexHooks('', hooksToAdd);
    const secondPass = mergeCodexHooks(firstPass, hooksToAdd);

    assert.ok(secondPass !== null);
    const parsed = smolToml.parse(secondPass);

    const sessionStartCount = parsed.hooks.sessionStart.filter((h) => h._sdd === true).length;
    assert.equal(sessionStartCount, 1, 'sessionStart _sdd hook must appear exactly once');

    const compactCount = parsed.hooks.preToolUse.filter((h) => h._sdd_compact === true).length;
    assert.equal(compactCount, 1, 'preToolUse _sdd_compact hook must appear exactly once');
  });
});

describe('mergeCodexHooks: invalid TOML input', () => {
  test('returns null and emits warning when existing TOML is invalid — does not overwrite', () => {
    const invalidToml = 'this is not [ valid TOML ===';
    const hooksToAdd = [
      { marker: '_sdd', event: 'sessionStart', command: 'check-update' },
    ];

    let result;
    // Must not throw
    assert.doesNotThrow(() => { result = mergeCodexHooks(invalidToml, hooksToAdd); });
    assert.equal(result, null, 'must return null for invalid TOML input');
  });
});

// ── removeCodexHooks ──────────────────────────────────────────────────────────

describe('removeCodexHooks: removes only _sdd entries', () => {
  test('removes SDD-marked hooks and preserves non-SDD hooks', () => {
    const smolToml = require('smol-toml');
    const config = {
      features: { codex_hooks: true },
      hooks: {
        sessionStart: [
          { _sdd: true, command: 'refacil-sdd-ai check-update' },
          { myTool: true, command: 'my-tool start' },
        ],
        preToolUse: [
          { _sdd_compact: true, command: 'refacil-sdd-ai compact-bash', matcher: 'Bash' },
          { _sdd_review: true, command: 'refacil-sdd-ai check-review', matcher: 'Bash' },
        ],
      },
    };
    const input = smolToml.stringify(config);

    const result = removeCodexHooks(input);
    assert.ok(result !== null);
    const parsed = smolToml.parse(result);

    // SDD hooks must be removed
    const sessionStart = parsed.hooks && parsed.hooks.sessionStart;
    assert.ok(!sessionStart || !sessionStart.some((h) => h._sdd === true), '_sdd hook must be removed');

    // Non-SDD hook must be preserved
    assert.ok(sessionStart && sessionStart.some((h) => h.myTool === true), 'custom hook must be preserved');

    // preToolUse with only SDD hooks must be removed (empty event array)
    assert.ok(!parsed.hooks || !parsed.hooks.preToolUse, 'preToolUse with only SDD hooks must be removed');
  });

  test('removes [hooks] section when all entries are SDD', () => {
    const smolToml = require('smol-toml');
    const config = {
      features: { codex_hooks: true },
      hooks: {
        sessionStart: [{ _sdd: true, command: 'check-update' }],
        userPromptSubmit: [{ _sdd_notify: true, command: 'notify-update' }],
      },
    };
    const input = smolToml.stringify(config);

    const result = removeCodexHooks(input);
    assert.ok(result !== null);
    const parsed = smolToml.parse(result);
    assert.ok(!parsed.hooks, '[hooks] section must be absent when all hooks were SDD');
  });

  test('is non-destructive when called on empty string', () => {
    let result;
    assert.doesNotThrow(() => { result = removeCodexHooks(''); });
    assert.equal(result, '');
  });

  test('removes only _sdd_notify hook and leaves others intact', () => {
    const smolToml = require('smol-toml');
    const config = {
      hooks: {
        sessionStart: [{ _sdd: true, command: 'check-update' }],
        userPromptSubmit: [
          { _sdd_notify: true, command: 'notify-update' },
          { _userHook: true, command: 'user-thing' },
        ],
      },
    };
    const input = smolToml.stringify(config);

    const result = removeCodexHooks(input);
    assert.ok(result !== null);
    const parsed = smolToml.parse(result);

    assert.ok(!parsed.hooks.sessionStart, 'sessionStart must be removed (was SDD-only)');
    const ups = parsed.hooks && parsed.hooks.userPromptSubmit;
    assert.ok(ups && ups.some((h) => h._userHook === true), 'non-SDD userPromptSubmit hook must survive');
    assert.ok(!ups.some((h) => h._sdd_notify === true), '_sdd_notify must be removed');
  });
});
