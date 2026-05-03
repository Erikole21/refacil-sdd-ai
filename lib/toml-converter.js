'use strict';

// TOML strategy: smol-toml — lightweight parser/serializer with zero transitive dependencies.
// Chosen over @iarna/toml (unmaintained) and toml (parse-only).
const smolToml = require('smol-toml');

/**
 * Parse YAML frontmatter from a .md agent file and produce a Codex-compatible TOML string.
 *
 * Expected agent file format:
 *   ---
 *   name: refacil-<agent>
 *   description: ...
 *   ...
 *   ---
 *   <markdown body>
 *
 * Output TOML format:
 *   name = "refacil-<agent>"
 *   description = "..."
 *   developer_instructions = """
 *   <markdown body>
 *   """
 *
 * @param {string} content - raw .md file content
 * @returns {string|null} TOML string, or null if frontmatter is absent/unparseable
 */
function convertAgentToToml(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    process.stderr.write('[refacil-sdd-ai] toml-converter: agent has no valid frontmatter — skipping.\n');
    return null;
  }

  const [, frontmatterRaw, body] = match;

  // Extract name and description from YAML frontmatter (simple line-by-line parse)
  let name = null;
  let description = null;

  for (const line of frontmatterRaw.split('\n')) {
    if (line.startsWith('name:') && name === null) {
      name = line.slice('name:'.length).trim();
    } else if (line.startsWith('description:') && description === null) {
      description = line.slice('description:'.length).trim();
    }
  }

  if (!name) {
    process.stderr.write('[refacil-sdd-ai] toml-converter: agent frontmatter missing `name` field — skipping.\n');
    return null;
  }

  if (!description) {
    description = '';
  }

  // Escape double quotes inside name/description for TOML basic strings
  const escapedName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // In a TOML basic multiline string ("""..."""), backslashes are escape characters.
  // Escape backslashes first, then escape any """ sequences that would terminate the string.
  const escapedBody = body
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '""\\\"');

  return `name = "${escapedName}"\ndescription = "${escapedDesc}"\ndeveloper_instructions = """\n${escapedBody}"""\n`;
}

/**
 * Merge SDD hooks into an existing ~/.codex/config.toml string.
 *
 * - Preserves all non-SDD keys in [hooks] and any other top-level sections.
 * - Each SDD hook entry carries _sdd = true (or _sdd_compact / _sdd_review / _sdd_notify).
 * - Also ensures [features] codex_hooks = true is present.
 * - If hooksToAdd is already present (idempotent), does not duplicate.
 * - Returns null (with a warning) if existingToml is invalid TOML.
 *
 * @param {string} existingToml - current contents of config.toml (may be empty string)
 * @param {Array<{marker: string, event: string, command: string, matcher?: string}>} hooksToAdd
 * @returns {string|null}
 */
function mergeCodexHooks(existingToml, hooksToAdd) {
  let config = {};

  if (existingToml && existingToml.trim()) {
    try {
      config = smolToml.parse(existingToml);
    } catch (err) {
      process.stderr.write(`[refacil-sdd-ai] toml-converter: invalid TOML in config.toml — not overwriting. Error: ${err.message}\n`);
      return null;
    }
  }

  // Ensure [features] section with codex_hooks = true
  if (!config.features) config.features = {};
  config.features.codex_hooks = true;

  // Ensure [hooks] section exists
  if (!config.hooks) config.hooks = {};

  // Merge each hook entry, grouped by event name
  for (const hook of hooksToAdd) {
    const { marker, event, command, matcher } = hook;
    if (!config.hooks[event]) config.hooks[event] = [];

    // Idempotence: skip if an entry with this marker already exists
    const alreadyPresent = Array.isArray(config.hooks[event]) &&
      config.hooks[event].some((h) => h[marker] === true);
    if (alreadyPresent) continue;

    const entry = { [marker]: true, command };
    if (matcher !== undefined) entry.matcher = matcher;
    config.hooks[event].push(entry);
  }

  return smolToml.stringify(config);
}

/**
 * Remove all entries marked with _sdd*, _sdd_compact, _sdd_review, or _sdd_notify
 * from a Codex config.toml string.
 *
 * - Removes only entries that have an _sdd* boolean marker set to true.
 * - Removes the [hooks] section entirely if it becomes empty after removal.
 * - Returns the cleaned TOML string.
 *
 * @param {string} existingToml - current contents of config.toml
 * @returns {string|null} cleaned TOML string, or null if parse fails
 */
function removeCodexHooks(existingToml) {
  if (!existingToml || !existingToml.trim()) return existingToml || '';

  let config;
  try {
    config = smolToml.parse(existingToml);
  } catch (err) {
    process.stderr.write(`[refacil-sdd-ai] toml-converter: invalid TOML in config.toml — cannot remove hooks. Error: ${err.message}\n`);
    return null;
  }

  if (!config.hooks) return smolToml.stringify(config);

  const sddMarkers = ['_sdd', '_sdd_compact', '_sdd_review', '_sdd_notify'];

  for (const event of Object.keys(config.hooks)) {
    if (!Array.isArray(config.hooks[event])) continue;
    config.hooks[event] = config.hooks[event].filter(
      (h) => !sddMarkers.some((m) => h[m] === true),
    );
    if (config.hooks[event].length === 0) {
      delete config.hooks[event];
    }
  }

  // Remove [hooks] section entirely if now empty
  if (Object.keys(config.hooks).length === 0) {
    delete config.hooks;
  }

  return smolToml.stringify(config);
}

module.exports = {
  convertAgentToToml,
  mergeCodexHooks,
  removeCodexHooks,
};
