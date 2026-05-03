'use strict';

const fs = require('fs');
const path = require('path');

const MARKER_START = '<!-- refacil-sdd-ai:testing-policy:start -->';
const MARKER_END = '<!-- refacil-sdd-ai:testing-policy:end -->';

function readTemplate(packageRoot) {
  const tplPath = path.join(packageRoot, 'templates', 'testing-policy.md');
  return fs.readFileSync(tplPath, 'utf8').trimEnd();
}

function buildBlock(templateContent) {
  return `${MARKER_START}\n${templateContent}\n${MARKER_END}`;
}

/**
 * Merge or replace the managed SDD-AI testing policy block in `.agents/testing.md`.
 * Skips if `.agents/` does not exist (no SDD layout yet).
 * Creates `testing.md` when `.agents/` exists but the file does not.
 *
 * @param {string} projectRoot
 * @param {string} packageRoot - refacil-sdd-ai package root (for template path)
 * @returns {{ status: string }}
 */
function syncTestingPolicyBlock(projectRoot, packageRoot) {
  const agentsDir = path.join(projectRoot, '.agents');
  const testingPath = path.join(agentsDir, 'testing.md');

  if (!fs.existsSync(agentsDir)) {
    return { status: 'skipped-no-agents-dir' };
  }

  const template = readTemplate(packageRoot);
  const block = buildBlock(template);

  if (!fs.existsSync(testingPath)) {
    const tail =
      '## Repo-specific commands\n\n' +
      'Edit this section only (it sits **below** the synced markers and is preserved on SessionStart):\n\n' +
      '- **Baseline (whole repo / CI):** …\n' +
      '- **Scoped example 1:** …\n' +
      '- **Scoped example 2:** …\n';
    const body = `# Testing\n\n${block}\n\n${tail}`;
    fs.writeFileSync(testingPath, body);
    return { status: 'created-file' };
  }

  const existing = fs.readFileSync(testingPath, 'utf8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  let next;
  let action;

  if (startIdx === -1 || endIdx === -1) {
    const trimmed = existing.trimEnd();
    if (!trimmed) {
      next = `# Testing\n\n${block}\n`;
      action = 'written-empty';
    } else {
      next = `${trimmed}\n\n${block}\n`;
      action = 'appended';
    }
  } else {
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + MARKER_END.length);
    next = before + block + after;
    action = 'replaced';
  }

  if (next === existing) {
    return { status: 'unchanged' };
  }

  fs.writeFileSync(testingPath, next);
  return { status: action };
}

/**
 * Remove the managed block only (for uninstall / clean flows if needed).
 * @param {string} projectRoot
 * @returns {{ status: string }}
 */
function removeTestingPolicyBlock(projectRoot) {
  const testingPath = path.join(projectRoot, '.agents', 'testing.md');
  if (!fs.existsSync(testingPath)) {
    return { status: 'skipped-no-file' };
  }

  const existing = fs.readFileSync(testingPath, 'utf8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    return { status: 'not-present' };
  }

  const before = existing.substring(0, startIdx).trimEnd();
  const after = existing.substring(endIdx + MARKER_END.length);
  const next = (before + '\n' + after.replace(/^\s+/, '')).trimEnd() + '\n';

  fs.writeFileSync(testingPath, next);
  return { status: 'removed' };
}

module.exports = {
  syncTestingPolicyBlock,
  removeTestingPolicyBlock,
  MARKER_START,
  MARKER_END,
};
