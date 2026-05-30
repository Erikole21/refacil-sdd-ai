'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./sdd');
const { parseFile, extractArtifactLanguageMeta } = require('../spec-reader/md-parser');
const { artifactLanguageToTtsCode } = require('../spec-reader/lang');
const { writeSession, writeFolderSession } = require('../spec-reader/session');
const busSpawn = require('../bus/spawn');
const { openInBrowser } = require('../open-browser');
const {
  resolveDefaultTtsLang,
  isValidTtsLang,
  detectTtsLangFromContent,
  DEFAULT_TTS_LANG,
} = require('../spec-reader/lang');
const { loadBranchConfigWithSources } = require('../config');

const DEFAULT_LANG = DEFAULT_TTS_LANG;
const DEFAULT_VOICE = 'M3';
const DEFAULT_SPEED = 1;
const VALID_VOICES = new Set(['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5']);

function parseReadSpecArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
  read-spec — Listen to a Markdown spec in the browser (on-device TTS)

  Usage:
    refacil-sdd-ai read-spec --file <path> [options]
    refacil-sdd-ai read-spec --change <changeName> [--select <file.md>] [options]

  Options:
    --file <path>          Markdown file (must be inside project root)
    --change <changeName>  Load all SDD artifacts for a change folder
    --select <file.md>     Pre-select a specific file in folder mode (default: proposal.md)
    --lang <code>          TTS language (default: SDD artifactLanguage → es/en)
    --voice <id>           Voice style M1–M5 or F1–F5 (default: ${DEFAULT_VOICE})
    --speed <n>            Speech speed 0.9–1.5 (default: ${DEFAULT_SPEED})
    --help                 Show this help
`);
}

/**
 * @param {string} fileArg
 * @param {string} projectRoot
 * @returns {string} absolute path
 */
function resolveFileWithinProject(fileArg, projectRoot) {
  const resolved = path.resolve(projectRoot, fileArg);
  const rootNorm = path.resolve(projectRoot) + path.sep;
  if (!resolved.startsWith(rootNorm) && resolved !== path.resolve(projectRoot)) {
    throw new Error('Security: --file must resolve inside the project root');
  }
  return resolved;
}

/**
 * Canonical ordering for SDD artifact files in a change folder.
 * Files not in this list are appended alphabetically after.
 */
const FOLDER_FILE_ORDER = ['proposal.md', 'design.md', 'tasks.md', 'specs.md'];

/**
 * Sort .md filenames: canonical order first, then remaining alphabetically.
 * @param {string[]} names
 * @returns {string[]}
 */
function sortFolderFiles(names) {
  const canonical = FOLDER_FILE_ORDER.filter((n) => names.includes(n));
  const rest = names
    .filter((n) => !FOLDER_FILE_ORDER.includes(n))
    .sort((a, b) => a.localeCompare(b));
  return [...canonical, ...rest];
}

/**
 * @param {string[]} argv
 * @param {string} packageRoot
 * @param {string} [projectRootOverride]
 */
async function handleReadSpec(argv, packageRoot, projectRootOverride) {
  const args = parseReadSpecArgs(argv || []);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Mutual exclusivity: --change and --file cannot be used together
  if (args.change && args.file) {
    console.error('  Error: --change y --file son mutuamente excluyentes. Usa solo uno de los dos.');
    process.exit(1);
  }

  // Neither --change nor --file provided
  if (!args.change && !args.file) {
    console.error('  Error: --file is required');
    printHelp();
    process.exit(1);
  }

  const projectRoot = projectRootOverride || findProjectRoot();

  // -----------------------------------------------------------------------
  // FOLDER MODE: --change <changeName>
  // -----------------------------------------------------------------------
  if (args.change) {
    const changeName = String(args.change);
    const changeFolder = path.join(projectRoot, 'refacil-sdd', 'changes', changeName);

    const changesRoot = path.join(projectRoot, 'refacil-sdd', 'changes') + path.sep;
    if (!changeFolder.startsWith(changesRoot)) {
      console.error('  Error: --change must be a simple folder name (no path separators).');
      process.exit(1);
    }

    if (!fs.existsSync(changeFolder)) {
      console.error(`  Error: no se encontró la carpeta de cambio '${changeName}' en refacil-sdd/changes/.`);
      process.exit(1);
    }

    // Collect .md files in the change folder
    let allEntries;
    try {
      allEntries = fs.readdirSync(changeFolder);
    } catch (err) {
      console.error(`  Error: could not read change folder: ${err.message}`);
      process.exit(1);
    }
    const mdFiles = allEntries.filter((n) => n.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.error(`  Error: la carpeta '${changeName}' no contiene archivos Markdown.`);
      process.exit(1);
    }

    const sortedFiles = sortFolderFiles(mdFiles);

    // Validate --select if provided
    const selectArg = typeof args.select === 'string' ? args.select : 'proposal.md';
    const resolvedSelect = sortedFiles.includes(selectArg) ? selectArg : null;
    if (typeof args.select === 'string' && !resolvedSelect) {
      console.error(`  Error: el archivo '${args.select}' no existe en la carpeta de cambio '${changeName}'.`);
      process.exit(1);
    }
    if (!resolvedSelect && typeof args.select !== 'string') {
      console.warn(`  Note: proposal.md not found in '${changeName}', opening '${sortedFiles[0]}' instead.`);
    }
    const selectedFile = resolvedSelect || sortedFiles[0];

    const voice = typeof args.voice === 'string' ? args.voice.toUpperCase() : DEFAULT_VOICE;
    const speedRaw = args.speed !== undefined ? parseFloat(args.speed) : DEFAULT_SPEED;

    if (!VALID_VOICES.has(voice)) {
      console.error(`  Error: invalid --voice "${args.voice}". Use M1–M5 or F1–F5`);
      process.exit(1);
    }
    if (Number.isNaN(speedRaw) || speedRaw < 0.9 || speedRaw > 1.5) {
      console.error('  Error: --speed must be between 0.9 and 1.5');
      process.exit(1);
    }

    const { artifactLanguage } = loadBranchConfigWithSources(projectRoot);
    let resolvedLang = typeof args.lang === 'string' ? args.lang : null;

    // Parse each file and collect sections
    const files = [];
    const allContents = [];
    for (const name of sortedFiles) {
      const absPath = path.join(changeFolder, name);
      const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
      let sections;
      let fileContent;
      try {
        fileContent = fs.readFileSync(absPath, 'utf8');
        sections = parseFile(absPath);
      } catch (err) {
        console.error(`  Error parsing ${name}: ${err.message}`);
        process.exit(1);
      }
      // Explicit meta comment takes priority (first file that has one wins)
      if (!resolvedLang) {
        const metaFromFile = extractArtifactLanguageMeta(fileContent);
        if (metaFromFile) {
          resolvedLang = artifactLanguageToTtsCode(metaFromFile);
        }
      }
      allContents.push(fileContent);
      files.push({ name, relPath, sections });
    }

    if (!resolvedLang) {
      // Content-based detection: inspect heading patterns across all files
      resolvedLang = detectTtsLangFromContent(allContents.join('\n'));
    }

    if (!resolvedLang) {
      resolvedLang = resolveDefaultTtsLang(projectRoot);
    }

    if (!isValidTtsLang(resolvedLang)) {
      console.error(`  Error: invalid --lang "${resolvedLang}". Use a Supertonic code (e.g. es, en).`);
      process.exit(1);
    }

    const relativeChangeFolder = path.relative(projectRoot, changeFolder).replace(/\\/g, '/');

    const sessionId = writeFolderSession({
      files,
      selectedFile,
      meta: {
        lang: resolvedLang,
        voice,
        speed: speedRaw,
        changeName,
        artifactLanguage,
      },
      sourcePath: relativeChangeFolder,
      createdAt: new Date().toISOString(),
    });

    let info;
    try {
      ({ info } = await busSpawn.ensureBroker(packageRoot));
    } catch (err) {
      console.error(`  Error: could not start broker: ${err.message}`);
      process.exit(1);
    }

    const url = `http://127.0.0.1:${info.port}/read-spec?id=${sessionId}`;
    console.log(`  read-spec session: ${sessionId}`);
    console.log(`  Open: ${url}`);

    const opened = openInBrowser(url);
    if (!opened) {
      console.log('  (could not open browser automatically — open the URL above manually)');
    }
    return;
  }

  // -----------------------------------------------------------------------
  // FILE MODE: --file <path>
  // -----------------------------------------------------------------------
  let filePath;
  try {
    filePath = resolveFileWithinProject(args.file, projectRoot);
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`  Error: file not found: ${args.file}`);
    process.exit(1);
  }

  if (path.extname(filePath).toLowerCase() !== '.md') {
    console.error('  Error: --file must be a .md Markdown file');
    process.exit(1);
  }

  const voice = typeof args.voice === 'string' ? args.voice.toUpperCase() : DEFAULT_VOICE;
  const speedRaw = args.speed !== undefined ? parseFloat(args.speed) : DEFAULT_SPEED;

  if (!VALID_VOICES.has(voice)) {
    console.error(`  Error: invalid --voice "${args.voice}". Use M1–M5 or F1–F5`);
    process.exit(1);
  }
  if (Number.isNaN(speedRaw) || speedRaw < 0.9 || speedRaw > 1.5) {
    console.error('  Error: --speed must be between 0.9 and 1.5');
    process.exit(1);
  }

  let sections;
  let fileContent;
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
    sections = parseFile(filePath);
  } catch (err) {
    console.error(`  Error parsing Markdown: ${err.message}`);
    process.exit(1);
  }

  const relativeSource = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const { artifactLanguage } = loadBranchConfigWithSources(projectRoot);
  const metaFromFile = extractArtifactLanguageMeta(fileContent);
  const resolvedLang = typeof args.lang === 'string'
    ? args.lang
    : (metaFromFile
      ? artifactLanguageToTtsCode(metaFromFile)
      : (detectTtsLangFromContent(fileContent) || resolveDefaultTtsLang(projectRoot)));
  if (!isValidTtsLang(resolvedLang)) {
    console.error(`  Error: invalid --lang "${resolvedLang}". Use a Supertonic code (e.g. es, en).`);
    process.exit(1);
  }

  const sessionId = writeSession({
    sections,
    meta: {
      lang: resolvedLang,
      voice,
      speed: speedRaw,
      artifactLanguage: metaFromFile || artifactLanguage,
    },
    sourcePath: relativeSource,
    createdAt: new Date().toISOString(),
  });

  let info;
  try {
    ({ info } = await busSpawn.ensureBroker(packageRoot));
  } catch (err) {
    console.error(`  Error: could not start broker: ${err.message}`);
    process.exit(1);
  }

  const url = `http://127.0.0.1:${info.port}/read-spec?id=${sessionId}`;
  console.log(`  read-spec session: ${sessionId}`);
  console.log(`  Open: ${url}`);

  const opened = openInBrowser(url);
  if (!opened) {
    console.log('  (could not open browser automatically — open the URL above manually)');
  }
}

module.exports = {
  handleReadSpec,
  parseReadSpecArgs,
  sortFolderFiles,
  FOLDER_FILE_ORDER,
  printHelp,
  DEFAULT_LANG,
  DEFAULT_VOICE,
  DEFAULT_SPEED,
};
