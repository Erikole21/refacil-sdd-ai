'use strict';

const fs = require('fs');
const path = require('path');
const { loadBranchConfigWithSources } = require('./config');

const LABELS = {
  spanish: {
    specSuffix: 'Especificación',
    purpose: 'Propósito',
    requirements: 'Requisitos',
    rejection: 'rechazo',
    requirement: 'Requisito',
    scenario: 'Escenario',
  },
  english: {
    specSuffix: 'Specification',
    purpose: 'Purpose',
    requirements: 'Requirements',
    rejection: 'rejection',
    requirement: 'Requirement',
    scenario: 'Scenario',
  },
};

/**
 * @param {string} changeDir
 * @returns {'spanish'|'english'}
 */
function detectLanguageFromChange(changeDir) {
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (fs.existsSync(proposalPath)) {
    const proposal = fs.readFileSync(proposalPath, 'utf8');
    if (/^##\s+Objetivo\s*$/im.test(proposal)) return 'spanish';
    if (/^##\s+Objective\s*$/im.test(proposal)) return 'english';
    if (/\*\*Dado\*\*/i.test(proposal) || /\*\*Cuando\*\*/i.test(proposal)) return 'spanish';
  }
  return 'english';
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function hasUsefulMarkdownContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim().length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} changeDir
 * @returns {string[]}
 */
function collectSpecSourceFiles(changeDir) {
  const files = [];
  const specsMd = path.join(changeDir, 'specs.md');
  if (fs.existsSync(specsMd) && hasUsefulMarkdownContent(specsMd)) {
    files.push(specsMd);
  }

  const specsDir = path.join(changeDir, 'specs');
  if (!fs.existsSync(specsDir)) {
    return files;
  }

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md') && hasUsefulMarkdownContent(full)) files.push(full);
    }
  };
  walk(specsDir);
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} markdown
 * @returns {{ id: string, title: string, body: string, isRejection: boolean }[]}
 */
function parseCriteriaBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const items = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    items.push({
      id: current.id,
      title: current.title,
      body: current.lines.join('\n').trim(),
      isRejection: current.id.startsWith('CR-'),
    });
    current = null;
  };

  for (const line of lines) {
    const m = line.match(/^##\s+((?:CA|CR)-\d+):\s*(.+)$/i);
    if (m) {
      pushCurrent();
      current = { id: m[1].toUpperCase(), title: m[2].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  pushCurrent();
  return items;
}

/**
 * @param {string} proposalMd
 * @param {'spanish'|'english'} lang
 * @returns {string}
 */
function extractPurpose(proposalMd, lang) {
  const headings = lang === 'spanish'
    ? ['Objetivo', 'Propósito', 'Objective', 'Purpose']
    : ['Objective', 'Purpose', 'Objetivo', 'Propósito'];
  for (const h of headings) {
    const re = new RegExp(`^##\\s+${h}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'im');
    const m = proposalMd.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

/**
 * @param {{ id: string, title: string, body: string, isRejection: boolean }} criterion
 * @param {'spanish'|'english'} lang
 * @returns {string}
 */
function criterionToRequirement(criterion, lang) {
  const labels = LABELS[lang] || LABELS.english;
  const rejectionTag = criterion.isRejection ? ` (${labels.rejection})` : '';
  const header = `### ${labels.requirement}: ${criterion.id}${rejectionTag}: ${criterion.title}`;
  if (!criterion.body) return header;

  const scenarioTitle = criterion.title.replace(/"/g, '\\"');
  return `${header}\n\n#### ${labels.scenario}: ${scenarioTitle}\n${criterion.body}`;
}

/**
 * @param {string} projectRoot
 * @param {string} changeName
 * @param {{ fromArchive?: boolean }} [options]
 * @returns {string}
 */
function resolveChangeDir(projectRoot, changeName, options = {}) {
  const activeDir = path.join(projectRoot, 'refacil-sdd', 'changes', changeName);
  if (!options.fromArchive && fs.existsSync(activeDir)) {
    return activeDir;
  }
  if (options.fromArchive) {
    const archiveRoot = path.join(projectRoot, 'refacil-sdd', 'changes', 'archive');
    if (!fs.existsSync(archiveRoot)) {
      throw new Error('No existe refacil-sdd/changes/archive/');
    }
    const suffix = `-${changeName}`;
    const matches = fs.readdirSync(archiveRoot)
      .filter((d) => d.endsWith(suffix))
      .sort();
    if (matches.length === 0) {
      throw new Error(`No archived change matching *${suffix} in refacil-sdd/changes/archive/`);
    }
    return path.join(archiveRoot, matches[matches.length - 1]);
  }
  if (!fs.existsSync(activeDir)) {
    throw new Error(`Change not found: refacil-sdd/changes/${changeName}/`);
  }
  return activeDir;
}

/**
 * Build catalog spec.md from change artifacts (no translation).
 * @param {string} projectRoot
 * @param {string} changeName
 * @param {{ fromArchive?: boolean }} [options]
 * @returns {{ specPath: string, language: string, criteriaCount: number }}
 */
function buildCatalogSpec(projectRoot, changeName, options = {}) {
  const changeDir = resolveChangeDir(projectRoot, changeName, options);

  const config = loadBranchConfigWithSources(projectRoot);
  const lang = detectLanguageFromChange(changeDir) || config.artifactLanguage;
  const labels = LABELS[lang] || LABELS.english;

  const proposalPath = path.join(changeDir, 'proposal.md');
  const purpose = fs.existsSync(proposalPath)
    ? extractPurpose(fs.readFileSync(proposalPath, 'utf8'), lang)
    : '';

  const specFiles = collectSpecSourceFiles(changeDir);
  if (specFiles.length === 0) {
    throw new Error(`No specs found under refacil-sdd/changes/${changeName}/ (specs.md or specs/**/*.md)`);
  }

  const allCriteria = [];
  for (const file of specFiles) {
    const content = fs.readFileSync(file, 'utf8');
    allCriteria.push(...parseCriteriaBlocks(content));
  }

  if (allCriteria.length === 0) {
    throw new Error('No CA/CR criteria blocks (## CA-XX / ## CR-XX) found in change specs');
  }

  const requirementsBody = allCriteria
    .map((c) => criterionToRequirement(c, lang))
    .join('\n\n---\n\n');

  const specContent = [
    `# ${changeName} ${labels.specSuffix}`,
    '',
    `<!-- refacil-sdd: artifactLanguage=${lang} -->`,
    '',
    `## ${labels.purpose}`,
    '',
    purpose || (lang === 'spanish'
      ? '_Sin sección de objetivo en proposal.md._'
      : '_No Objective section in proposal.md._'),
    '',
    `## ${labels.requirements}`,
    '',
    requirementsBody,
    '',
  ].join('\n');

  const specDir = path.join(projectRoot, 'refacil-sdd', 'specs', changeName);
  fs.mkdirSync(specDir, { recursive: true });
  const specPath = path.join(specDir, 'spec.md');
  fs.writeFileSync(specPath, specContent, 'utf8');

  return { specPath, language: lang, criteriaCount: allCriteria.length };
}

/**
 * @param {string} projectRoot
 * @param {string} changeName
 * @param {{ fromArchive?: boolean }} [options]
 * @returns {{ specPath: string, language: string, criteriaCount: number }}
 */
function syncSpecToCatalog(projectRoot, changeName, options = {}) {
  return buildCatalogSpec(projectRoot, changeName, options);
}

module.exports = {
  syncSpecToCatalog,
  buildCatalogSpec,
  resolveChangeDir,
  detectLanguageFromChange,
  collectSpecSourceFiles,
  hasUsefulMarkdownContent,
  parseCriteriaBlocks,
  LABELS,
};
