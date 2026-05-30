'use strict';

const fs = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 512 * 1024;

const SPEAKABLE_REPLACEMENTS = {
  '→': ' arrow ',
  '←': ' back ',
  '⇒': ' then ',
  '✅': '',
  '❌': '',
  '⚠️': '',
  'ℹ️': '',
};

/**
 * @param {string} raw
 * @returns {string}
 */
function stripFencedCodeBlocks(raw) {
  return raw.replace(/```(\w*)[\s\S]*?```/g, (_match, lang) => {
    if (lang && lang.trim()) {
      // Named language: actual code — replace with spoken label, never read source
      return ` code block: ${lang.trim()} `;
    }
    // No language specifier: plain-text diagram or prose — extract body and read it
    const firstNewline = _match.indexOf('\n');
    const lastFence = _match.lastIndexOf('```');
    if (firstNewline < 0 || firstNewline >= lastFence) return '';
    return _match.slice(firstNewline + 1, lastFence).trim();
  });
}

/**
 * Replace markdown table blocks with a spoken label.
 * Extracts column headers from the first row: "tabla: ColA, ColB."
 * The separator row (|----|) is used to confirm a real table.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownTables(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|.+\|/.test(line)) {
      const nextLine = lines[i + 1] || '';
      if (/^\|[-:| ]+\|/.test(nextLine)) {
        const headers = line.split('|').map((h) => h.trim()).filter(Boolean);
        const label = headers.length > 0
          ? `tabla: ${headers.join(', ')}.`
          : 'tabla.';
        result.push(label);
        i += 2; // skip header + separator
        // Read each data row as a comma-separated list
        while (i < lines.length && /^\|/.test(lines[i])) {
          const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
          if (cells.length > 0) result.push(`${cells.join(', ')}.`);
          i++;
        }
        continue;
      }
    }
    result.push(line);
    i++;
  }
  return result.join('\n');
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripInlineMarkdown(text) {
  let out = text;
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/^>\s?/gm, '');
  out = out.replace(/^[-*+]\s+/gm, '');
  out = out.replace(/^\d+\.\s+/gm, '');
  out = out.replace(/~~([^~]+)~~/g, '$1');
  // Replace HTML tag references with the tag name so TTS can pronounce them
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\/?>/g, (_, name) => ` ${name} `);
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeSpeakable(text) {
  const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const lines = text.split('\n').map((line) => {
    let out = line;
    out = out.replace(emojiPattern, '');
    for (const [sym, repl] of Object.entries(SPEAKABLE_REPLACEMENTS)) {
      out = out.split(sym).join(repl);
    }
    out = out.replace(/\s+/g, ' ').trim();
    // CA-07: add period at end of paragraph lines without terminal punctuation.
    // Exclude lines ending with :,; — colons introduce lists, semicolons/commas
    // already have their own prosodic meaning in TTS.
    if (out && !/[.!?:,;]$/.test(out)) {
      out = `${out}.`;
    }
    return out;
  }).filter(Boolean);
  return lines.join('\n');
}

/**
 * @param {string} content
 * @returns {string}
 */
function preprocessMarkdown(content) {
  let out = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*---\s*$/gm, '');
  const isSpanish = /artifactLanguage=spanish/i.test(content) || /^##\s+Propósito\s*$/im.test(content);
  if (isSpanish) {
    out = out
      .replace(/^####\s+Scenario:/gim, '#### Escenario:')
      .replace(/^###\s+Requirement:/gim, '### Requisito:');
  }
  return out;
}

/**
 * @param {string} content
 * @returns {string|null}
 */
function extractArtifactLanguageMeta(content) {
  const m = content.match(/<!--\s*refacil-sdd:\s*artifactLanguage=(\w+)\s*-->/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * CA-08: Given the raw body and its already-normalized speakable text, replace the
 * terminal period of each list item (except the last) with a comma, and ensure the
 * last list item ends with a period. Non-list lines are left untouched.
 *
 * Strategy: scan the raw body to identify which *line indices* (after stripping) came
 * from list items, then apply comma/period punctuation to those speakable lines.
 *
 * @param {string} rawBody  — original body before stripping
 * @param {string} speakable — already-normalized speakable text (output of normalizeSpeakable)
 * @returns {string}
 */
function applyListPunctuation(rawBody, speakable) {
  // Identify list-item line positions in rawBody
  const rawLines = rawBody.split('\n');
  const isListItem = rawLines.map((l) => /^[-*+]\s+/.test(l) || /^\d+\.\s+/.test(l));

  // Collect consecutive list-item runs; mark which speakable-line index corresponds
  // We re-derive speakable lines from the speakable text (already joined by \n, filtered)
  const speakLines = speakable.split('\n');
  if (speakLines.length === 0) return speakable;

  // Map each raw line to its speakable equivalent by filtering empty lines as done in
  // normalizeSpeakable (filter(Boolean)). We walk both arrays together.
  let speakIdx = 0;
  /** @type {boolean[]} — parallel to speakLines: true if this speakable line is a list item */
  const speakIsListItem = new Array(speakLines.length).fill(false);

  for (let r = 0; r < rawLines.length && speakIdx < speakLines.length; r++) {
    const rawTrimmed = rawLines[r].trim();
    if (!rawTrimmed) continue; // blank lines are filtered by normalizeSpeakable
    speakIsListItem[speakIdx] = isListItem[r];
    speakIdx += 1;
  }

  // Find all consecutive list-item runs in speakLines and apply punctuation
  let i = 0;
  const result = [...speakLines];
  while (i < result.length) {
    if (!speakIsListItem[i]) {
      i += 1;
      continue;
    }
    // Find end of this run
    let runEnd = i;
    while (runEnd + 1 < result.length && speakIsListItem[runEnd + 1]) {
      runEnd += 1;
    }
    if (runEnd > i) {
      // More than one item: replace period with comma for all except last
      for (let j = i; j < runEnd; j++) {
        result[j] = result[j].replace(/\.$/, ',');
      }
      // Ensure last item ends with period (normalizeSpeakable already adds it, but be safe)
      if (!/[.!?]$/.test(result[runEnd])) {
        result[runEnd] = `${result[runEnd]}.`;
      }
    }
    // Single-item lists already have a period from normalizeSpeakable — nothing to do
    i = runEnd + 1;
  }

  return result.join('\n');
}

/**
 * Split markdown into sections by ATX headings (## and deeper; # starts new section too).
 * @param {string} content
 * @returns {{ title: string, text: string, rawMarkdown: string }[]}
 */
function parseMarkdown(content) {
  const normalized = preprocessMarkdown(content).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const sections = [];
  let currentTitle = '';
  let currentLines = [];

  const flush = () => {
    const body = currentLines.join('\n').trim();
    const rawMarkdown = body;
    const afterCode = stripFencedCodeBlocks(body);
    const afterTables = stripMarkdownTables(afterCode);
    const inline = stripInlineMarkdown(afterTables);
    const speakable = normalizeSpeakable(inline);
    // TTS flattens \n to space (supertonic-helper line 107), so each line must end
    // with sentence-ending punctuation to create natural pauses. Commas produce only
    // a brief pause that runs long list items together; periods create a full stop.
    // applyListPunctuation (CA-08 comma conversion) is intentionally skipped here.
    const text = speakable;
    if (!text) {
      currentLines = [];
      return;
    }
    sections.push({ title: currentTitle.trim(), text, rawMarkdown });
    currentLines = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      // #### and deeper: stay inside the current requirement (avoid 40+ micro-sections)
      if (level >= 4) {
        const sub = normalizeSpeakable(stripInlineMarkdown(heading[2]));
        if (sub) currentLines.push(sub);
        continue;
      }
      const hasBody = currentLines.some((l) => l.trim());
      if (level === 1) {
        if (hasBody) flush();
        currentTitle = normalizeSpeakable(stripInlineMarkdown(heading[2]));
        currentLines = [];
        continue;
      }
      if (hasBody) flush();
      else if (currentTitle) currentLines = [];
      currentTitle = normalizeSpeakable(stripInlineMarkdown(heading[2]));
      continue;
    }
    if (line.trim()) currentLines.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [{ title: '', text: '' }];
  }

  return sections;
}

/**
 * @param {string} filePath
 * @returns {{ title: string, text: string }[]}
 */
function parseFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds maximum size (${MAX_FILE_BYTES} bytes)`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return [{ title: '', text: '' }];
  }
  return parseMarkdown(content);
}

module.exports = {
  parseMarkdown,
  parseFile,
  preprocessMarkdown,
  extractArtifactLanguageMeta,
  MAX_FILE_BYTES,
};
