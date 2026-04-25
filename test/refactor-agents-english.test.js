'use strict';

/**
 * Tests for the refactor-agents-english change.
 * Verify CA/CR criteria on agent .md files and skill SKILL.md files.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Agent paths ──
const PROPOSER_MD    = path.join(ROOT, 'agents', 'proposer.md');
const IMPLEMENTER_MD = path.join(ROOT, 'agents', 'implementer.md');
const VALIDATOR_MD   = path.join(ROOT, 'agents', 'validator.md');
const AUDITOR_MD     = path.join(ROOT, 'agents', 'auditor.md');
const TESTER_MD      = path.join(ROOT, 'agents', 'tester.md');
const DEBUGGER_MD    = path.join(ROOT, 'agents', 'debugger.md');
const INVESTIGATOR_MD = path.join(ROOT, 'agents', 'investigator.md');

const ALL_AGENTS = [
  { label: 'proposer.md',     path: PROPOSER_MD },
  { label: 'implementer.md',  path: IMPLEMENTER_MD },
  { label: 'validator.md',    path: VALIDATOR_MD },
  { label: 'auditor.md',      path: AUDITOR_MD },
  { label: 'tester.md',       path: TESTER_MD },
  { label: 'debugger.md',     path: DEBUGGER_MD },
  { label: 'investigator.md', path: INVESTIGATOR_MD },
];

// ── Skill paths ──
const PROPOSE_SKILL   = path.join(ROOT, 'skills', 'propose',  'SKILL.md');
const APPLY_SKILL     = path.join(ROOT, 'skills', 'apply',    'SKILL.md');
const VERIFY_SKILL    = path.join(ROOT, 'skills', 'verify',   'SKILL.md');
const REVIEW_SKILL    = path.join(ROOT, 'skills', 'review',   'SKILL.md');
const TEST_SKILL      = path.join(ROOT, 'skills', 'test',     'SKILL.md');
const BUG_SKILL       = path.join(ROOT, 'skills', 'bug',      'SKILL.md');
const EXPLORE_SKILL   = path.join(ROOT, 'skills', 'explore',  'SKILL.md');
const ARCHIVE_SKILL   = path.join(ROOT, 'skills', 'archive',  'SKILL.md');
const SETUP_SKILL     = path.join(ROOT, 'skills', 'setup',    'SKILL.md');
const GUIDE_SKILL     = path.join(ROOT, 'skills', 'guide',    'SKILL.md');
const UPCODE_SKILL    = path.join(ROOT, 'skills', 'up-code',  'SKILL.md');
const UPDATE_SKILL    = path.join(ROOT, 'skills', 'update',   'SKILL.md');
const JOIN_SKILL      = path.join(ROOT, 'skills', 'join',     'SKILL.md');
const ASK_SKILL       = path.join(ROOT, 'skills', 'ask',      'SKILL.md');
const REPLY_SKILL     = path.join(ROOT, 'skills', 'reply',    'SKILL.md');
const ATTEND_SKILL    = path.join(ROOT, 'skills', 'attend',   'SKILL.md');
const INBOX_SKILL     = path.join(ROOT, 'skills', 'inbox',    'SKILL.md');
const SAY_SKILL       = path.join(ROOT, 'skills', 'say',      'SKILL.md');
const PREREQS_SKILL   = path.join(ROOT, 'skills', 'prereqs',  'SKILL.md');

const ALL_SKILLS = [
  { label: 'propose/SKILL.md',  path: PROPOSE_SKILL,  name: 'refacil:propose' },
  { label: 'apply/SKILL.md',    path: APPLY_SKILL,    name: 'refacil:apply' },
  { label: 'verify/SKILL.md',   path: VERIFY_SKILL,   name: 'refacil:verify' },
  { label: 'review/SKILL.md',   path: REVIEW_SKILL,   name: 'refacil:review' },
  { label: 'test/SKILL.md',     path: TEST_SKILL,     name: 'refacil:test' },
  { label: 'bug/SKILL.md',      path: BUG_SKILL,      name: 'refacil:bug' },
  { label: 'explore/SKILL.md',  path: EXPLORE_SKILL,  name: 'refacil:explore' },
  { label: 'archive/SKILL.md',  path: ARCHIVE_SKILL,  name: 'refacil:archive' },
  { label: 'setup/SKILL.md',    path: SETUP_SKILL,    name: 'refacil:setup' },
  { label: 'guide/SKILL.md',    path: GUIDE_SKILL,    name: 'refacil:guide' },
  { label: 'up-code/SKILL.md',  path: UPCODE_SKILL,   name: 'refacil:up-code' },
  { label: 'update/SKILL.md',   path: UPDATE_SKILL,   name: 'refacil:update' },
  { label: 'join/SKILL.md',     path: JOIN_SKILL,     name: 'refacil:join' },
  { label: 'ask/SKILL.md',      path: ASK_SKILL,      name: 'refacil:ask' },
  { label: 'reply/SKILL.md',    path: REPLY_SKILL,    name: 'refacil:reply' },
  { label: 'attend/SKILL.md',   path: ATTEND_SKILL,   name: 'refacil:attend' },
  { label: 'inbox/SKILL.md',    path: INBOX_SKILL,    name: 'refacil:inbox' },
  { label: 'say/SKILL.md',      path: SAY_SKILL,      name: 'refacil:say' },
  { label: 'prereqs/SKILL.md',  path: PREREQS_SKILL,  name: null },
];

// ── Prereq / ancillary paths ──
const CONTRACT_MD        = path.join(ROOT, 'skills', 'prereqs', 'METHODOLOGY-CONTRACT.md');
const BUS_MD             = path.join(ROOT, 'skills', 'prereqs', 'BUS-CROSS-REPO.md');
const CHECKLIST_MD       = path.join(ROOT, 'skills', 'review',  'checklist.md');
const CHECKLIST_BACK_MD  = path.join(ROOT, 'skills', 'review',  'checklist-back.md');
const CHECKLIST_FRONT_MD = path.join(ROOT, 'skills', 'review',  'checklist-front.md');
const TESTING_PATTERNS_MD = path.join(ROOT, 'skills', 'test',   'testing-patterns.md');
const CLI_JS             = path.join(ROOT, 'bin', 'cli.js');

// ── Helpers ──
function readFile(p) { return fs.readFileSync(p, 'utf8'); }

// Parse key: value pairs from YAML frontmatter (no external lib)
function getFrontmatterFields(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const m = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fields = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    fields[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return fields;
}

// Strip fenced code blocks (``` ... ```) before prose checks
function stripCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, '[CODE_BLOCK]');
}

// Extract frontmatter description: value
function getFrontmatterDescription(content) {
  const m = content.match(/^---\s*[\s\S]*?^description:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Extract frontmatter name: value
function getFrontmatterName(content) {
  const m = content.match(/^---\s*[\s\S]*?^name:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Get text after frontmatter (skip --- block)
function getBody(content) {
  const match = content.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/);
  return match ? match[1] : content;
}

// Check for obviously Spanish prose (whole-word patterns common in Spanish instructions)
const SPANISH_PROSE_PATTERNS = [
  /\bEres\s+el\b/,
  /\bDebes\b/,
  /\bNunca\s+generes?\b/i,
  /\bSiempre\s+delega\b/i,
  /\bRetorna\s+UN\b/i,
  /\bArtefactos\s+SDD\b/i,
  /\bPaso\s+\d+:/,
  /\bPasos?\b(?![\w-])/,
  /\bInstrucciones\b(?![\w-])/,
  /\bReglas\b(?![\w-])/,
  /\bFlujo\b(?![\w-])/,
  /\bObjetivo\b(?![\w-])/,
  /\b[Ee]jecuta\s+(el|la|los|un)\b/,
  /\blee\s+el\b/i,
  /\bSi\s+el\s+usuario\b/,
  /\bsi\s+existe\b/,
  /\bsi\s+hay\b/,
  /\bno\s+existe\b/,
  /\bno\s+hay\b/,
];

function hasSpanishProse(content) {
  const stripped = stripCodeBlocks(content);
  return SPANISH_PROSE_PATTERNS.some(re => re.test(stripped));
}

// ════════════════════════════════════════════════════════════
// CA-01: Agent description: field has no repo-specific references
// ════════════════════════════════════════════════════════════

const REPO_SPECIFIC = ['refacil-ia', 'agent-products-payments', 'message-trace-writer'];

for (const agent of ALL_AGENTS) {
  test(`CA-01: agents/${agent.label} description: has no repo-specific references`, () => {
    const content = readFile(agent.path);
    const desc = getFrontmatterDescription(content);
    assert.ok(desc !== null, `agents/${agent.label} MUST have a description: frontmatter field`);
    for (const ref of REPO_SPECIFIC) {
      assert.ok(
        !desc.includes(ref),
        `agents/${agent.label} description: MUST NOT mention "${ref}"`,
      );
    }
  });
}

// ════════════════════════════════════════════════════════════
// CA-02: Agent opening role statement defines input, output, and boundary
// ════════════════════════════════════════════════════════════

for (const agent of ALL_AGENTS) {
  test(`CA-02: agents/${agent.label} opening role statement has You are/receive/produce/never`, () => {
    const content = readFile(agent.path);
    const body = getBody(content);
    // First ~800 chars of body should have the role statement (case-insensitive for receive/produce)
    const opening = body.slice(0, 800);
    assert.ok(
      opening.includes('You are a') || opening.includes('You are an'),
      `agents/${agent.label} MUST start body with "You are a/an ..."`,
    );
    assert.ok(
      /you receive/i.test(opening),
      `agents/${agent.label} role statement MUST include "You receive" (input)`,
    );
    assert.ok(
      /you produce/i.test(opening),
      `agents/${agent.label} role statement MUST include "You produce" (output)`,
    );
    assert.ok(
      /you never/i.test(opening),
      `agents/${agent.label} role statement MUST include "You never" (hard boundary)`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CA-02b: Agent body prose is in English (no obvious Spanish)
// ════════════════════════════════════════════════════════════

for (const agent of ALL_AGENTS) {
  test(`CA-02b: agents/${agent.label} body prose is in English`, () => {
    const content = readFile(agent.path);
    const body = getBody(content);
    assert.ok(
      !hasSpanishProse(body),
      `agents/${agent.label} body MUST NOT contain Spanish prose (found a Spanish pattern)`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CA-03: SKILL.md files have no repo-specific references
// ════════════════════════════════════════════════════════════

for (const skill of ALL_SKILLS) {
  test(`CA-03: ${skill.label} has no repo-specific references`, () => {
    const content = readFile(skill.path);
    const prose = stripCodeBlocks(content);
    for (const ref of REPO_SPECIFIC) {
      assert.ok(
        !prose.includes(ref),
        `${skill.label} MUST NOT contain repo-specific reference "${ref}"`,
      );
    }
  });
}

// ════════════════════════════════════════════════════════════
// CA-04: METHODOLOGY-CONTRACT.md is in English, no repo-specific refs
// ════════════════════════════════════════════════════════════

test('CA-04: METHODOLOGY-CONTRACT.md has no repo-specific references', () => {
  const content = readFile(CONTRACT_MD);
  const prose = stripCodeBlocks(content);
  for (const ref of REPO_SPECIFIC) {
    assert.ok(
      !prose.includes(ref),
      `METHODOLOGY-CONTRACT.md MUST NOT contain "${ref}"`,
    );
  }
});

test('CA-04: METHODOLOGY-CONTRACT.md has substantial English content', () => {
  const content = readFile(CONTRACT_MD);
  assert.ok(content.length > 1000, 'METHODOLOGY-CONTRACT.md MUST have substantial content (>1000 chars)');
  // Check for key English section headings that should be there
  assert.ok(
    content.includes('Protected branch') || content.includes('protected branch'),
    'METHODOLOGY-CONTRACT.md MUST contain English branch policy content',
  );
});

// ════════════════════════════════════════════════════════════
// CA-05: BUS-CROSS-REPO.md is in English
// ════════════════════════════════════════════════════════════

test('CA-05: BUS-CROSS-REPO.md has no repo-specific references', () => {
  const content = readFile(BUS_MD);
  const prose = stripCodeBlocks(content);
  for (const ref of REPO_SPECIFIC) {
    assert.ok(!prose.includes(ref), `BUS-CROSS-REPO.md MUST NOT contain "${ref}"`);
  }
});

test('CA-05: BUS-CROSS-REPO.md has no obvious Spanish prose', () => {
  const content = readFile(BUS_MD);
  assert.ok(!hasSpanishProse(content), 'BUS-CROSS-REPO.md MUST NOT contain Spanish prose');
});

// ════════════════════════════════════════════════════════════
// CA-06: Checklist files are in English
// ════════════════════════════════════════════════════════════

const CHECKLISTS = [
  { label: 'review/checklist.md',       path: CHECKLIST_MD },
  { label: 'review/checklist-back.md',  path: CHECKLIST_BACK_MD },
  { label: 'review/checklist-front.md', path: CHECKLIST_FRONT_MD },
];

for (const cl of CHECKLISTS) {
  test(`CA-06: ${cl.label} has no Spanish prose`, () => {
    const content = readFile(cl.path);
    assert.ok(!hasSpanishProse(content), `${cl.label} MUST NOT contain Spanish prose`);
  });
}

// Only the main checklist.md uses PASS/FAIL/N/A verdict labels (not the sub-checklists)
test('CA-06: review/checklist.md preserves PASS/FAIL/N/A labels', () => {
  const content = readFile(CHECKLIST_MD);
  assert.ok(
    content.includes('PASS') || content.includes('FAIL') || content.includes('N/A'),
    'review/checklist.md MUST still contain PASS/FAIL/N/A verdict labels',
  );
});

// ════════════════════════════════════════════════════════════
// CA-07: testing-patterns.md is in English
// ════════════════════════════════════════════════════════════

test('CA-07: test/testing-patterns.md has no Spanish prose', () => {
  const content = readFile(TESTING_PATTERNS_MD);
  assert.ok(!hasSpanishProse(content), 'test/testing-patterns.md MUST NOT contain Spanish prose');
});

test('CA-07: test/testing-patterns.md has substantial content', () => {
  const content = readFile(TESTING_PATTERNS_MD);
  assert.ok(content.length > 200, 'test/testing-patterns.md MUST have content (>200 chars)');
});

// ════════════════════════════════════════════════════════════
// CA-08: Fence tag strings are unchanged in agent files
// ════════════════════════════════════════════════════════════

const AGENT_FENCE_TAGS = [
  { label: 'proposer.md',    path: PROPOSER_MD,    tag: 'refacil-propose-result' },
  { label: 'implementer.md', path: IMPLEMENTER_MD, tag: 'refacil-apply-result' },
  { label: 'validator.md',   path: VALIDATOR_MD,   tag: 'refacil-verify-result' },
  { label: 'auditor.md',     path: AUDITOR_MD,     tag: 'refacil-review-result' },
  { label: 'tester.md',      path: TESTER_MD,      tag: 'refacil-test-result' },
  // debugger uses two-mode tags (investigation + fix), not a single result tag
  { label: 'debugger.md',    path: DEBUGGER_MD,    tag: 'refacil-debug-fix' },
];

for (const entry of AGENT_FENCE_TAGS) {
  test(`CA-08: agents/${entry.label} fence tag "${entry.tag}" is unchanged`, () => {
    const content = readFile(entry.path);
    assert.ok(
      content.includes(entry.tag),
      `agents/${entry.label} MUST still contain fence tag "${entry.tag}" (not renamed during translation)`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CA-09: Agent name: frontmatter fields are unchanged
// ════════════════════════════════════════════════════════════

const AGENT_NAMES = [
  { label: 'proposer.md',    path: PROPOSER_MD,    name: 'refacil-proposer' },
  { label: 'implementer.md', path: IMPLEMENTER_MD, name: 'refacil-implementer' },
  { label: 'validator.md',   path: VALIDATOR_MD,   name: 'refacil-validator' },
  { label: 'auditor.md',     path: AUDITOR_MD,     name: 'refacil-auditor' },
  { label: 'tester.md',      path: TESTER_MD,      name: 'refacil-tester' },
  { label: 'debugger.md',    path: DEBUGGER_MD,    name: 'refacil-debugger' },
  { label: 'investigator.md', path: INVESTIGATOR_MD, name: 'refacil-investigator' },
];

for (const entry of AGENT_NAMES) {
  test(`CA-09: agents/${entry.label} name: is "${entry.name}" (unchanged)`, () => {
    const content = readFile(entry.path);
    const name = getFrontmatterName(content);
    assert.strictEqual(
      name,
      entry.name,
      `agents/${entry.label} frontmatter name: MUST remain "${entry.name}"`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CA-10: Skill name: frontmatter fields are unchanged
// ════════════════════════════════════════════════════════════

for (const skill of ALL_SKILLS) {
  if (!skill.name) continue; // prereqs/SKILL.md has no name:
  test(`CA-10: ${skill.label} name: is "${skill.name}" (unchanged)`, () => {
    const content = readFile(skill.path);
    const name = getFrontmatterName(content);
    assert.strictEqual(
      name,
      skill.name,
      `${skill.label} frontmatter name: MUST remain "${skill.name}"`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CA-11: bin/cli.js console output was migrated to English
// ════════════════════════════════════════════════════════════

test('CA-11: bin/cli.js exists and has English console output', () => {
  const content = readFile(CLI_JS);
  assert.ok(content.length > 500, 'bin/cli.js MUST exist and have content');
  // cli.js console output was migrated to English
  const hasEnglishOutput =
    content.includes('refacil-sdd-ai') &&
    (content.includes('Installing') || content.includes('installed') ||
     content.includes('Updating') || content.includes('updated') ||
     content.includes('Restart') || content.includes('RESTART') ||
     content.includes('skills'));
  assert.ok(
    hasEnglishOutput,
    'bin/cli.js MUST contain English console output after migration',
  );
});

// ════════════════════════════════════════════════════════════
// CR-01: No repo-specific names in any agent description:
// ════════════════════════════════════════════════════════════

for (const agent of ALL_AGENTS) {
  for (const ref of REPO_SPECIFIC) {
    test(`CR-01: agents/${agent.label} description: does not mention "${ref}"`, () => {
      const content = readFile(agent.path);
      const desc = getFrontmatterDescription(content);
      if (desc === null) return; // skip if no description
      assert.ok(
        !desc.includes(ref),
        `CR-01 FAIL: agents/${agent.label} description: mentions "${ref}" — must be removed`,
      );
    });
  }
}

// ════════════════════════════════════════════════════════════
// CR-02: Guardrail blocks retain all 3 elements
// (the "Delegated by /refacil:X — do not invoke directly" pattern in description covers this;
// verify body has the key guardrail keywords)
// ════════════════════════════════════════════════════════════

for (const agent of ALL_AGENTS) {
  test(`CR-02: agents/${agent.label} description: includes "do not invoke directly"`, () => {
    const content = readFile(agent.path);
    const desc = getFrontmatterDescription(content);
    assert.ok(
      desc !== null && desc.includes('do not invoke directly'),
      `agents/${agent.label} description: MUST include "do not invoke directly" guardrail`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CR-03: Fence tag strings not modified
// ════════════════════════════════════════════════════════════

for (const entry of AGENT_FENCE_TAGS) {
  test(`CR-03: agents/${entry.label} "${entry.tag}" tag string not modified`, () => {
    const content = readFile(entry.path);
    assert.ok(
      content.includes(entry.tag),
      `CR-03 FAIL: fence tag "${entry.tag}" was modified or removed in agents/${entry.label}`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CR-04: Key rule semantics preserved (NEVER not weakened)
// ════════════════════════════════════════════════════════════

test('CR-04: agents/proposer.md body contains "NEVER" for source code prohibition', () => {
  const content = readFile(PROPOSER_MD);
  const body = getBody(content);
  // The rule "NUNCA generar codigo fuente" must become "NEVER generate source code" or similar
  const hasNeverRule =
    /never\s+generate\s+source\s+code/i.test(body) ||
    /never\s+generate.*source\s+code/i.test(body) ||
    body.includes('You never generate source code') ||
    body.includes('You never generate Source Code');
  assert.ok(
    hasNeverRule,
    'agents/proposer.md MUST contain "never generate source code" rule (semantic preservation)',
  );
});

test('CR-04: agents/validator.md body contains read-only boundary', () => {
  const content = readFile(VALIDATOR_MD);
  const body = getBody(content);
  const hasReadOnly =
    /never\s+apply\s+fix/i.test(body) ||
    /never\s+modif/i.test(body) ||
    /read.only/i.test(body) ||
    /report\s+only/i.test(body);
  assert.ok(
    hasReadOnly,
    'agents/validator.md MUST preserve read-only boundary in English',
  );
});

test('CR-04: agents/investigator.md body contains read-only boundary', () => {
  const content = readFile(INVESTIGATOR_MD);
  const body = getBody(content);
  const hasReadOnly =
    /never\s+modif/i.test(body) ||
    /read.only/i.test(body) ||
    /read only/i.test(body);
  assert.ok(
    hasReadOnly,
    'agents/investigator.md MUST preserve read-only boundary in English',
  );
});

// ════════════════════════════════════════════════════════════
// CR-05: No Spanish prose remains in migrated files
// ════════════════════════════════════════════════════════════

for (const agent of ALL_AGENTS) {
  test(`CR-05: agents/${agent.label} has no Spanish prose`, () => {
    const content = readFile(agent.path);
    const body = getBody(content);
    assert.ok(
      !hasSpanishProse(body),
      `CR-05 FAIL: agents/${agent.label} still contains Spanish prose`,
    );
  });
}

for (const skill of ALL_SKILLS) {
  test(`CR-05: ${skill.label} has no Spanish prose`, () => {
    const content = readFile(skill.path);
    assert.ok(
      !hasSpanishProse(content),
      `CR-05 FAIL: ${skill.label} still contains Spanish prose`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CR-06: JSON contract enum values in agents are in English
// (COMPLETADO, PARCIAL, FALLO, ALTO, MEDIO, BAJO must not appear)
// ════════════════════════════════════════════════════════════

const SPANISH_ENUM_PATTERN = /\b(COMPLETADO|PARCIAL|FALLO|ALTO|MEDIO|BAJO)\b/;

for (const agent of ALL_AGENTS) {
  test(`CR-06: agents/${agent.label} JSON contract enum values are in English`, () => {
    const content = readFile(agent.path);
    assert.ok(
      !SPANISH_ENUM_PATTERN.test(content),
      `CR-06 FAIL: agents/${agent.label} still contains Spanish enum values (COMPLETADO/PARCIAL/FALLO/ALTO/MEDIO/BAJO)`,
    );
  });
}

// ════════════════════════════════════════════════════════════
// CR-07: Agent frontmatter is valid YAML (no colon+space in unquoted values)
// A `: ` inside a plain scalar breaks YAML parsers — Claude Code silently
// drops the agent from its index, making it unavailable as a sub-agent.
// ════════════════════════════════════════════════════════════

const REQUIRED_FRONTMATTER_FIELDS = ['name', 'description', 'tools', 'model'];

for (const agent of ALL_AGENTS) {
  test(`CR-07: agents/${agent.label} frontmatter has no colon+space in unquoted values`, () => {
    const content = readFile(agent.path);
    const fields = getFrontmatterFields(content);
    for (const [key, value] of Object.entries(fields)) {
      assert.ok(
        !value.includes(': '),
        `CR-07 FAIL: agents/${agent.label} field '${key}' contains ': ' in unquoted value — ` +
        `YAML parsers reject this, causing Claude Code to silently drop the agent. ` +
        `Value: "${value.slice(0, 80)}"`,
      );
    }
  });

  test(`CR-07: agents/${agent.label} frontmatter has all required fields`, () => {
    const content = readFile(agent.path);
    const fields = getFrontmatterFields(content);
    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      assert.ok(
        field in fields && fields[field].trim().length > 0,
        `CR-07 FAIL: agents/${agent.label} frontmatter is missing required field '${field}'`,
      );
    }
  });
}
