'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS = [
  'setup',
  'prereqs',
  'guide',
  'explore',
  'propose',
  'apply',
  'test',
  'verify',
  'review',
  'archive',
  'bug',
  'up-code',
  'join',
  'say',
  'ask',
  'reply',
  'inbox',
  'attend',
  'update',
];

const AGENTS = [
  'auditor',
  'investigator',
  'validator',
  'tester',
  'implementer',
  'debugger',
  'proposer',
];

// All 7 refacil agents are internal sub-agents — hidden from the agent picker in OpenCode
const INTERNAL_AGENTS = [
  'investigator',
  'validator',
  'auditor',
  'tester',
  'implementer',
  'debugger',
  'proposer',
];

const REPO_VERSION_FILES = ['.claude/.sdd-version', '.cursor/.sdd-version', '.opencode/.sdd-version'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installSkills(packageRoot, projectRoot, ideDirs) {
  const dirs = ideDirs || ['.claude', '.cursor', '.opencode'];
  let installed = 0;
  for (const skill of SKILLS) {
    const srcDir = path.join(packageRoot, 'skills', skill);
    if (!fs.existsSync(srcDir)) continue;

    if (dirs.includes('.claude')) {
      copyDir(srcDir, path.join(projectRoot, '.claude', 'skills', `refacil-${skill}`));
    }
    if (dirs.includes('.cursor')) {
      copyDir(srcDir, path.join(projectRoot, '.cursor', 'skills', `refacil-${skill}`));
    }
    if (dirs.includes('.opencode')) {
      // OpenCode: byte-for-byte copy (same as Claude Code — no transformation needed)
      copyDir(srcDir, path.join(projectRoot, '.opencode', 'skills', `refacil-${skill}`));
    }

    installed++;
  }
  return installed;
}

// Create or safely merge .opencode/opencode.json with SDD-AI managed keys
// Preserves any pre-existing keys — never destructive
function installOpenCodeJson(projectRoot) {
  const ocDir = path.join(projectRoot, '.opencode');
  fs.mkdirSync(ocDir, { recursive: true });
  const ocJsonPath = path.join(ocDir, 'opencode.json');

  let existing = {};
  if (fs.existsSync(ocJsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(ocJsonPath, 'utf8'));
    } catch (_) {
      existing = {};
    }
  }

  // SDD-AI managed keys (minimal — only $schema)
  const sddKeys = {
    '$schema': 'https://opencode.ai/config.json',
  };

  const merged = Object.assign({}, sddKeys, existing);
  // Ensure $schema is always the SDD-AI value if not already set by user
  if (!existing['$schema']) {
    merged['$schema'] = sddKeys['$schema'];
  }

  fs.writeFileSync(ocJsonPath, JSON.stringify(merged, null, 2) + '\n');
}

// Claude Code: tools allowlist granular, model: sonnet|opus|haiku
// Cursor: readonly: true|false (booleano), model: inherit (default)
function transformFrontmatterForCursor(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return content;

  const [, frontmatterRaw, body] = match;
  // work with normalized content from here on
  const lines = frontmatterRaw.split('\n');
  const out = [];
  let toolsLine = null;
  let hasReadonly = false;

  for (const line of lines) {
    if (line.startsWith('tools:')) {
      toolsLine = line;
      continue;
    }
    if (line.startsWith('readonly:')) {
      hasReadonly = true;
      out.push(line);
      continue;
    }
    if (line.startsWith('model:')) {
      const value = line.slice('model:'.length).trim();
      // Claude Code short aliases (and plan-mode alias) → Cursor always inherits session model
      const ccAlias = value.toLowerCase();
      if (ccAlias === 'sonnet' || ccAlias === 'opus' || ccAlias === 'haiku' || ccAlias === 'opusplan') {
        out.push('model: inherit');
      } else {
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }

  if (toolsLine && !hasReadonly) {
    const toolsList = toolsLine.slice('tools:'.length).trim();
    const canWrite = /\b(Edit|Write|NotebookEdit)\b/.test(toolsList);
    out.push(`readonly: ${canWrite ? 'false' : 'true'}`);
  }

  return `---\n${out.join('\n')}\n---\n${body}`;
}

// OpenCode: tools → permission mapping, adds mode: subagent, hidden: true for internal agents, removes model:
// tools:[Edit,Write,NotebookEdit] → edit:allow, tools:[Bash] → bash:allow, WebFetch → always deny
function transformFrontmatterForOpenCode(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return content;

  const [, frontmatterRaw, body] = match;
  const lines = frontmatterRaw.split('\n');
  const out = [];
  let toolsLine = null;
  let agentName = null;

  for (const line of lines) {
    if (line.startsWith('tools:')) {
      toolsLine = line;
      // Do not emit tools: line — OpenCode uses permission block instead
      continue;
    }
    if (line.startsWith('model:')) {
      // Remove model: line — OpenCode manages model selection separately
      continue;
    }
    if (line.startsWith('name:')) {
      const nameVal = line.slice('name:'.length).trim();
      // Extract the base agent name from "refacil-<name>" or plain "<name>"
      const nameMatch = nameVal.match(/refacil-(\S+)/);
      agentName = nameMatch ? nameMatch[1] : nameVal;
      out.push(line);
      continue;
    }
    out.push(line);
  }

  // Determine permission values from tools list
  const toolsList = toolsLine ? toolsLine.slice('tools:'.length).trim() : '';
  const canEdit = /\b(Edit|Write|NotebookEdit)\b/.test(toolsList);
  const canBash = /\bBash\b/.test(toolsList);

  // Build permission block
  out.push(`permission:`);
  out.push(`  edit: ${canEdit ? 'allow' : 'deny'}`);
  out.push(`  bash: ${canBash ? 'allow' : 'deny'}`);
  out.push(`  webfetch: deny`);

  // Add mode: subagent
  out.push(`mode: subagent`);

  // Add hidden: true for internal agents
  if (agentName && INTERNAL_AGENTS.includes(agentName)) {
    out.push(`hidden: true`);
  }

  return `---\n${out.join('\n')}\n---\n${body}`;
}

function installAgents(packageRoot, projectRoot, ideDirs) {
  const dirs = ideDirs || ['.claude', '.cursor', '.opencode'];
  let installed = 0;

  const claudeDir = path.join(projectRoot, '.claude', 'agents');
  const cursorDir = path.join(projectRoot, '.cursor', 'agents');
  const openCodeDir = path.join(projectRoot, '.opencode', 'agents');
  if (dirs.includes('.claude')) fs.mkdirSync(claudeDir, { recursive: true });
  if (dirs.includes('.cursor')) fs.mkdirSync(cursorDir, { recursive: true });
  if (dirs.includes('.opencode')) fs.mkdirSync(openCodeDir, { recursive: true });

  for (const agent of AGENTS) {
    const srcFile = path.join(packageRoot, 'agents', `${agent}.md`);
    if (!fs.existsSync(srcFile)) continue;

    const content = fs.readFileSync(srcFile, 'utf8');

    if (dirs.includes('.claude')) {
      fs.writeFileSync(path.join(claudeDir, `refacil-${agent}.md`), content);
    }
    if (dirs.includes('.cursor')) {
      fs.writeFileSync(
        path.join(cursorDir, `refacil-${agent}.md`),
        transformFrontmatterForCursor(content),
      );
    }
    if (dirs.includes('.opencode')) {
      fs.writeFileSync(
        path.join(openCodeDir, `refacil-${agent}.md`),
        transformFrontmatterForOpenCode(content),
      );
    }

    installed++;
  }

  return installed;
}

function removeOpenCodeArtifacts(projectRoot) {
  // Remove .opencode/skills/refacil-*/
  for (const skill of SKILLS) {
    const skillDir = path.join(projectRoot, '.opencode', 'skills', `refacil-${skill}`);
    if (fs.existsSync(skillDir)) {
      try { fs.rmSync(skillDir, { recursive: true }); } catch (_) {}
    }
  }

  // Remove .opencode/agents/refacil-*.md
  const agentsDir = path.join(projectRoot, '.opencode', 'agents');
  if (fs.existsSync(agentsDir)) {
    try {
      const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('refacil-') && entry.name.endsWith('.md')) {
          fs.unlinkSync(path.join(agentsDir, entry.name));
        }
      }
    } catch (_) {}
  }

  // Remove .opencode/plugins/refacil-hooks.js
  const pluginFile = path.join(projectRoot, '.opencode', 'plugins', 'refacil-hooks.js');
  if (fs.existsSync(pluginFile)) {
    try { fs.unlinkSync(pluginFile); } catch (_) {}
  }

  // Revert SDD-AI keys from .opencode/opencode.json (currently only $schema key, leave file if other keys remain)
  const ocJsonPath = path.join(projectRoot, '.opencode', 'opencode.json');
  if (fs.existsSync(ocJsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(ocJsonPath, 'utf8'));
      delete json['$schema'];
      const remaining = Object.keys(json);
      if (remaining.length === 0) {
        fs.unlinkSync(ocJsonPath);
      } else {
        fs.writeFileSync(ocJsonPath, JSON.stringify(json, null, 2) + '\n');
      }
    } catch (_) {}
  }
}

function writeGuideFile(destPath, header, label) {
  const content =
    `# ${header}\n\n` +
    'Contexto completo del proyecto: ver `AGENTS.md`.\n' +
    'Si no existe, ejecuta `/refacil:setup`.\n';
  fs.writeFileSync(destPath, content);
  console.log(`  ${label} generado.`);
  return true;
}

function createClaudeMd(packageRoot, projectRoot) {
  return writeGuideFile(
    path.join(projectRoot, 'CLAUDE.md'),
    'CLAUDE.md',
    'CLAUDE.md',
  );
}

function createCursorRules(packageRoot, projectRoot) {
  return writeGuideFile(
    path.join(projectRoot, '.cursorrules'),
    'Cursor Rules',
    '.cursorrules',
  );
}

function readRepoVersion(rootDir) {
  for (const rel of REPO_VERSION_FILES) {
    const p = path.join(rootDir, rel);
    try {
      const raw = fs.readFileSync(p, 'utf8').trim();
      if (raw) return raw;
    } catch (_) {
      // siguiente
    }
  }
  return null;
}

function writeRepoVersion(rootDir, version) {
  for (const rel of REPO_VERSION_FILES) {
    const p = path.join(rootDir, rel);
    const parent = path.dirname(p);
    if (!fs.existsSync(parent)) continue;
    try {
      fs.writeFileSync(p, String(version) + '\n');
    } catch (_) {
      // tolerante
    }
  }
}

function getPackageVersion(packageRoot) {
  try {
    return require(path.join(packageRoot, 'package.json')).version;
  } catch (_) {
    return null;
  }
}

function removeSkills(projectRoot) {
  let removed = 0;
  for (const skill of SKILLS) {
    const claudeDir = path.join(projectRoot, '.claude', 'skills', `refacil-${skill}`);
    const cursorDir = path.join(projectRoot, '.cursor', 'skills', `refacil-${skill}`);

    if (fs.existsSync(claudeDir)) {
      fs.rmSync(claudeDir, { recursive: true });
      removed++;
    }
    if (fs.existsSync(cursorDir)) {
      fs.rmSync(cursorDir, { recursive: true });
    }
  }
  return removed;
}

function removeOpenspecLegacyAssets(projectRoot) {
  let removed = 0;

  // Remove .claude/skills/openspec-*/ and .cursor/skills/openspec-*/
  for (const ideDir of ['.claude', '.cursor']) {
    const skillsDir = path.join(projectRoot, ideDir, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('openspec-')) {
        fs.rmSync(path.join(skillsDir, entry.name), { recursive: true });
        removed++;
      }
    }
  }

  // Remove .claude/commands/opsx/ directory
  const claudeOpsx = path.join(projectRoot, '.claude', 'commands', 'opsx');
  if (fs.existsSync(claudeOpsx)) {
    fs.rmSync(claudeOpsx, { recursive: true });
    removed++;
  }

  // Remove .cursor/commands/opsx/ directory and opsx-*.md loose files
  const cursorCommandsDir = path.join(projectRoot, '.cursor', 'commands');
  const cursorOpsx = path.join(cursorCommandsDir, 'opsx');
  if (fs.existsSync(cursorOpsx)) {
    fs.rmSync(cursorOpsx, { recursive: true });
    removed++;
  }
  if (fs.existsSync(cursorCommandsDir)) {
    let entries;
    try {
      entries = fs.readdirSync(cursorCommandsDir, { withFileTypes: true });
    } catch (_) {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('opsx-') && entry.name.endsWith('.md')) {
        fs.unlinkSync(path.join(cursorCommandsDir, entry.name));
        removed++;
      }
    }
  }

  return removed;
}

function checkClaudeCodeVersion() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('claude --version 2>&1', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { ok: null, version: null };
    const maj = Number(match[1]);
    const min = Number(match[2]);
    const patch = Number(match[3]);
    const ok =
      maj > 2 ||
      (maj === 2 && min > 1) ||
      (maj === 2 && min === 1 && patch >= 89);
    return { ok, version: `${maj}.${min}.${patch}` };
  } catch (_) {
    return { ok: null, version: null };
  }
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.split('.')[0].replace('v', ''));
  const minor = parseInt(version.split('.')[1]);

  if (major < 20) {
    console.log(`\n  ADVERTENCIA: Node.js ${version} detectado.`);
    console.log('  refacil-sdd-ai requiere Node.js >= 20.0.0.');
    console.log('  Las skills se instalaran pero /refacil:setup podria fallar al instalar OpenSpec.\n');
    return false;
  }
  return true;
}

module.exports = {
  SKILLS,
  AGENTS,
  INTERNAL_AGENTS,
  copyDir,
  installSkills,
  installOpenCodeJson,
  transformFrontmatterForCursor,
  transformFrontmatterForOpenCode,
  installAgents,
  removeOpenCodeArtifacts,
  createClaudeMd,
  createCursorRules,
  readRepoVersion,
  writeRepoVersion,
  getPackageVersion,
  removeSkills,
  removeOpenspecLegacyAssets,
  checkClaudeCodeVersion,
  checkNodeVersion,
};
