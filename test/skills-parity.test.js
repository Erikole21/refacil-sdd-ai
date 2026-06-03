'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SKILLS } = require('../lib/installer');

const packageRoot = path.resolve(__dirname, '..');
const skillsRoot = path.join(packageRoot, 'skills');
const readmePath = path.join(packageRoot, 'README.md');

const EXPECTED_USER_INVOCABLE_COUNT = 22;

function parseUserInvocableSkillNames() {
  const names = [];
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const content = fs.readFileSync(skillFile, 'utf8');
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const invocable = /user-invocable:\s*true/i.test(fm[1]);
    if (invocable) names.push(entry.name);
  }
  return names.sort();
}

function parseReadmeSkillCommands() {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const start = readme.indexOf('## Available IDE Skills');
  const end = readme.indexOf('\n## Recommended Flow', start);
  assert.ok(start >= 0, 'README must contain Available IDE Skills section');
  const section = readme.slice(start, end > start ? end : undefined);
  const matches = [...section.matchAll(/`\/refacil:([a-z][a-z0-9-]*)/g)];
  return [...new Set(matches.map((m) => m[1]))].sort();
}

function parseGuideSkillCommands() {
  const guidePath = path.join(skillsRoot, 'guide', 'SKILL.md');
  const guide = fs.readFileSync(guidePath, 'utf8');
  const slash = [...guide.matchAll(/`\/refacil:([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
  const quoted = [...guide.matchAll(/skill:\s*"refacil:([a-z][a-z0-9-]*)"/g)].map((m) => m[1]);
  return [...new Set([...slash, ...quoted])].sort();
}

const FOUR_IDES = ['Claude Code', 'Cursor', 'OpenCode', 'Codex'];

function docMentionsIde(content, ide) {
  if (content.includes(ide)) return true;
  const aliases = {
    'Claude Code': ['~/.claude', '.claude/', 'Claude →'],
    Cursor: ['~/.cursor', '.cursor/', 'Cursor →'],
    OpenCode: ['~/.config/opencode', 'OpenCode', 'opencode'],
    Codex: ['~/.codex', '.codex/', 'Codex'],
  };
  return (aliases[ide] || []).some((token) => content.includes(token));
}

describe('SKILLS parity — user-invocable vs SKILLS[] vs README', () => {
  test('exactly 22 user-invocable skills in skills/', () => {
    const invocable = parseUserInvocableSkillNames();
    assert.equal(
      invocable.length,
      EXPECTED_USER_INVOCABLE_COUNT,
      `expected ${EXPECTED_USER_INVOCABLE_COUNT} user-invocable skills, got: ${invocable.join(', ')}`,
    );
    assert.ok(!invocable.includes('prereqs'), 'prereqs must not be user-invocable');
  });

  test('every user-invocable skill is listed in SKILLS[] (except internal prereqs)', () => {
    const invocable = parseUserInvocableSkillNames();
    for (const name of invocable) {
      assert.ok(SKILLS.includes(name), `SKILLS[] missing '${name}'`);
    }
    assert.ok(SKILLS.includes('prereqs'), 'SKILLS[] retains internal prereqs');
  });

  test('README Available IDE Skills table lists each user-invocable command', () => {
    const invocable = parseUserInvocableSkillNames();
    const readmeSkills = parseReadmeSkillCommands();
    for (const name of invocable) {
      assert.ok(
        readmeSkills.includes(name),
        `README Available IDE Skills missing /refacil:${name}`,
      );
    }
  });

  test('stats and read-spec appear in SKILLS[] and README', () => {
    assert.ok(SKILLS.includes('stats'));
    assert.ok(SKILLS.includes('read-spec'));
    const readmeSkills = parseReadmeSkillCommands();
    assert.ok(readmeSkills.includes('stats'));
    assert.ok(readmeSkills.includes('read-spec'));
  });
});

describe('CA-15: guide/SKILL.md menu parity', () => {
  test('guide lists all user-invocable skills including stats (except self-referential guide)', () => {
    const invocable = parseUserInvocableSkillNames().filter((n) => n !== 'guide');
    const guideSkills = parseGuideSkillCommands();
    for (const name of invocable) {
      assert.ok(guideSkills.includes(name), `guide/SKILL.md missing /refacil:${name}`);
    }
    assert.ok(guideSkills.includes('stats'));
  });
});

describe('CA-08: skill docs mention all four IDEs', () => {
  const docPaths = [
    path.join(skillsRoot, 'prereqs', 'SKILL.md'),
    path.join(skillsRoot, 'join', 'SKILL.md'),
    path.join(skillsRoot, 'setup', 'troubleshooting.md'),
    path.join(skillsRoot, 'setup', 'SKILL.md'),
  ];

  for (const docPath of docPaths) {
    test(`${path.basename(path.dirname(docPath))}/${path.basename(docPath)} references four IDEs`, () => {
      const content = fs.readFileSync(docPath, 'utf8');
      for (const ide of FOUR_IDES) {
        assert.ok(docMentionsIde(content, ide), `${docPath} must mention ${ide}`);
      }
    });
  }

  test('setup Step 7 final summary mentions all four IDEs', () => {
    const setup = fs.readFileSync(path.join(skillsRoot, 'setup', 'SKILL.md'), 'utf8');
    const step7 = setup.slice(setup.indexOf('### Step 7:'));
    for (const ide of FOUR_IDES) {
      assert.ok(step7.includes(ide), `Step 7 must mention ${ide}`);
    }
  });
});

describe('CA-17: README Windows OpenCode path', () => {
  test('documents ~/.config/opencode and OPENCODE_CONFIG_DIR override', () => {
    const readme = fs.readFileSync(readmePath, 'utf8');
    assert.match(readme, /\.config\/opencode/);
    assert.match(readme, /OPENCODE_CONFIG_DIR/);
    assert.ok(
      !readme.includes('%APPDATA%\\opencode') && !readme.includes('%APPDATA%/opencode'),
      'README must not document legacy %APPDATA%\\opencode as primary path',
    );
  });
});

describe('CA-18: apply/SKILL.md doNotTouch scope', () => {
  test('includes .opencode/ and Codex global dir note', () => {
    const apply = fs.readFileSync(path.join(skillsRoot, 'apply', 'SKILL.md'), 'utf8');
    assert.match(apply, /\.opencode\//);
    assert.match(apply, /\.codex/);
    assert.match(apply, /doNotTouch/i);
  });
});
