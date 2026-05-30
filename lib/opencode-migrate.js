'use strict';

const fs = require('fs');
const path = require('path');
const { globalOpenCodeDir, legacyOpenCodeDirs } = require('./global-paths');

const REFACIL_PREFIX = 'refacil-';
const PLUGIN_FILES = ['refacil-hooks.js', 'refacil-check-review.js', 'rules.js'];

function listRefacilEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.name.startsWith(REFACIL_PREFIX));
  } catch (_) {
    return [];
  }
}

function primaryHasRefacilSkills(primaryDir) {
  const skillsDir = path.join(primaryDir, 'skills');
  return listRefacilEntries(skillsDir).length > 0;
}

function primaryHasRefacilAgents(primaryDir) {
  const agentsDir = path.join(primaryDir, 'agents');
  return listRefacilEntries(agentsDir).length > 0;
}

function copyRefacilTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  let copied = 0;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of listRefacilEntries(srcDir)) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (fs.existsSync(destPath)) continue;
    try {
      if (entry.isDirectory()) {
        fs.cpSync(srcPath, destPath, { recursive: true });
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      copied++;
    } catch (_) {}
  }
  return copied;
}

function copyRefacilPlugins(srcPlugins, destPlugins) {
  if (!fs.existsSync(srcPlugins)) return 0;
  let copied = 0;
  fs.mkdirSync(destPlugins, { recursive: true });
  for (const name of PLUGIN_FILES) {
    const src = path.join(srcPlugins, name);
    const dest = path.join(destPlugins, name);
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
    try {
      fs.copyFileSync(src, dest);
      copied++;
    } catch (_) {}
  }
  return copied;
}

/**
 * Non-destructive migration: copy refacil artifacts from legacy OpenCode dirs into the primary config dir.
 * Emits stderr warnings when migration occurs. Safe to call on every install.
 * @param {string} [homeDir] - injectable for testing
 * @returns {{ migrated: boolean, fromDirs: string[] }}
 */
function migrateOpenCodeLegacyArtifacts(homeDir) {
  const primary = globalOpenCodeDir(homeDir);
  const needsSkills = !primaryHasRefacilSkills(primary);
  const needsAgents = !primaryHasRefacilAgents(primary);
  const pluginsDir = path.join(primary, 'plugins');
  const needsPlugins = !PLUGIN_FILES.every((f) => fs.existsSync(path.join(pluginsDir, f)));

  if (!needsSkills && !needsAgents && !needsPlugins) {
    for (const legacyDir of legacyOpenCodeDirs(homeDir)) {
      if (legacyDir === primary || !fs.existsSync(legacyDir)) continue;
      const legacySkills = listRefacilEntries(path.join(legacyDir, 'skills'));
      const legacyAgents = listRefacilEntries(path.join(legacyDir, 'agents'));
      const legacyPlugins = path.join(legacyDir, 'plugins');
      const hasLegacyPlugins = PLUGIN_FILES.some((f) => fs.existsSync(path.join(legacyPlugins, f)));
      if (legacySkills.length > 0 || legacyAgents.length > 0 || hasLegacyPlugins) {
        process.stderr.write(
          `[refacil-sdd-ai] OpenCode primary config already has refacil artifacts; skipped legacy migration from ${legacyDir} (no overwrite).\n`,
        );
      }
    }
    return { migrated: false, fromDirs: [] };
  }

  const fromDirs = [];
  let totalCopied = 0;

  for (const legacyDir of legacyOpenCodeDirs(homeDir)) {
    if (legacyDir === primary || !fs.existsSync(legacyDir)) continue;

    const legacySkillsDir = path.join(legacyDir, 'skills');
    const legacyAgentsDir = path.join(legacyDir, 'agents');
    const legacyPluginsDir = path.join(legacyDir, 'plugins');
    const legacySkills = listRefacilEntries(legacySkillsDir);
    const legacyAgents = listRefacilEntries(legacyAgentsDir);
    const hasLegacyPlugins = PLUGIN_FILES.some((f) => fs.existsSync(path.join(legacyPluginsDir, f)));

    if (!needsSkills && legacySkills.length > 0) {
      process.stderr.write(
        `[refacil-sdd-ai] OpenCode primary config already has refacil artifacts; skipped legacy migration from ${legacyDir} (no overwrite).\n`,
      );
    } else if (!needsAgents && legacyAgents.length > 0) {
      process.stderr.write(
        `[refacil-sdd-ai] OpenCode primary config already has refacil artifacts; skipped legacy migration from ${legacyDir} (no overwrite).\n`,
      );
    } else if (!needsPlugins && hasLegacyPlugins) {
      process.stderr.write(
        `[refacil-sdd-ai] OpenCode primary config already has refacil artifacts; skipped legacy migration from ${legacyDir} (no overwrite).\n`,
      );
    }

    let copied = 0;
    if (needsSkills) {
      copied += copyRefacilTree(path.join(legacyDir, 'skills'), path.join(primary, 'skills'));
    }
    if (needsAgents) {
      copied += copyRefacilTree(path.join(legacyDir, 'agents'), path.join(primary, 'agents'));
    }
    if (needsPlugins) {
      copied += copyRefacilPlugins(path.join(legacyDir, 'plugins'), pluginsDir);
    }

    if (copied > 0) {
      fromDirs.push(legacyDir);
      totalCopied += copied;
    }
  }

  if (totalCopied > 0) {
    process.stderr.write(
      `[refacil-sdd-ai] Migrated OpenCode refacil artifacts from legacy path(s) to ${primary}\n`,
    );
    return { migrated: true, fromDirs };
  }

  return { migrated: false, fromDirs: [] };
}

module.exports = { migrateOpenCodeLegacyArtifacts };
