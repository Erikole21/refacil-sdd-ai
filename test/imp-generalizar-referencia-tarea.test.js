'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ARCHIVE_SKILL = path.join(ROOT, 'skills', 'archive', 'SKILL.md');
const UP_CODE_SKILL = path.join(ROOT, 'skills', 'up-code', 'SKILL.md');
const README = path.join(ROOT, 'README.md');
const CONTRACT_MD = path.join(ROOT, 'skills', 'prereqs', 'METHODOLOGY-CONTRACT.md');

test('CA-01/CR-01: archive solicita referencia neutral y bloquea ausencia', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  assert.ok(content.includes('Task reference(s) associated with this change'));
  assert.ok(content.includes('URL, ticket number, or task name'));
  assert.ok(content.includes('Cannot archive without at least one task reference.'));
  assert.ok(!content.includes('Jira') && !content.includes('jira'));
});

test('CA-02/CR-02: archive define validacion minima operativa y taskReferences', () => {
  const content = fs.readFileSync(ARCHIVE_SKILL, 'utf8');
  assert.ok(content.includes('Minimum validation rule for each reference'));
  assert.ok(content.includes('starts with `http://` or `https://`'));
  assert.ok(content.includes('^[A-Za-z][A-Za-z0-9_-]*-\\d+$'));
  assert.ok(content.includes('3-80 characters') && content.includes('includes at least one letter'));
  assert.ok(content.includes('Invalid task reference format.'));
  assert.ok(content.includes('taskReferences:'));
  assert.ok(!content.includes('jiraTasks'));
});

test('CA-03: README documenta archive en terminos neutrales', () => {
  const content = fs.readFileSync(README, 'utf8');
  assert.ok(content.includes('/refacil:archive'));
  assert.ok(content.includes('task references'));
  assert.ok(content.includes('taskReferences'));
  assert.ok(!content.includes('Jira') && !content.includes('jira'));
});

test('up-code: enlace PR/MR segun proveedor real del remote', () => {
  const content = fs.readFileSync(UP_CODE_SKILL, 'utf8');
  assert.ok(content.includes('detect the VCS hosting used by this repository'));
  assert.ok(content.includes('GitHub'));
  assert.ok(content.includes('Bitbucket Cloud'));
  assert.ok(content.includes('GitLab'));
  assert.ok(content.includes('Azure DevOps'));
  assert.ok(content.includes('If hosting cannot be determined, do not assume a provider'));
});

test('contract: recomienda taskReferences y evita campos acoplados', () => {
  const content = fs.readFileSync(CONTRACT_MD, 'utf8');
  assert.ok(content.includes('The recommended field in `review.yaml` is `taskReferences`'));
  assert.ok(content.includes('Do not enforce provider-specific fields such as `jiraTasks`'));
});
