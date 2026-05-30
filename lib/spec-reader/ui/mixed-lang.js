/**
 * Split Spanish spec text into TTS segments so English terms (paths, flags, code)
 * are synthesized with lang=en and the rest with lang=es.
 */

/** @typedef {{ lang: string, text: string }} LangSegment */

/** Pausa mínima recomendada entre trozos es/en al concatenar WAV (segundos). */
export const MIXED_LANG_GAP_SEC = 0.015;

/** Máximo de inferencias TTS por sección (cada una ~varios segundos en el navegador). */
export const MAX_TTS_SEGMENTS = 16;

/** Case-sensitive patterns only (no /i) to avoid marking Spanish words as English. */
const ENGLISH_SPAN_RE = new RegExp(
  [
    'code block:\\s*\\w+',
    '\\brefacil-sdd-ai(?:\\s+(?:read-spec|sync-spec|bus|archive|propose|verify|review|test|apply|help|config|--[\\w-]+|(?:[\\w@]+/)+[\\w./-]+|[\\w@][\\w./-]*\\.[a-z]{2,5}))*\\b',
    '/refacil:[\\w-]+',
    '--[\\w-]+',
    '\\brefacil-[\\w-]+\\b',
    '(?:\\b[\\w@]+/)+[\\w./-]+',
    '\\b[\\w@][\\w./-]*\\.[a-z]{2,5}\\b',
    // Uppercase acronyms: HTML, CSS, API, TTS, CDN, SRI, REST, DOM, JSON, CI, CD, PR, etc.
    '\\b[A-Z]{2,}(?:[.-][A-Z0-9]+)*\\b',
    '\\b(?:endpoint|payload|token|broker|queue|webhook|session|request|response|handler|middleware|callback|schema|query|buffer|stream|chunk|pipeline|runtime|deploy|build|merge|branch|commit|staging|timeout|mock|stub|parser|router|store|state|action|backend|frontend|gateway|socket|worker|event|hook|plugin|cache|blob|lambda|trigger|scaffold|view|model|repository|migration|seed|rollback|snapshot|diff|patch|header|cookie|cors|csrf|jwt|oauth|scoped|typed|mixin|decorator|hydrat)(?:e|s|es|ed|ing|er)?\\b',
    // Common English tech words that appear in Spanish SDD specs
    '\\b(?:scope|render|parse|fetch|input|output|format|sanitize|validate|serialize|deserialize|encode|decode|import|export|layout|sidebar|fallback|checkbox|dropdown|tooltip|toggle|badge|overlay|modal|toast|banner|loader|spinner|inline|bundle|chunk|wrapper|container|grid|flex|offset|margin|padding|breakpoint|viewport|hover|focus|click|submit|reset|drag|drop|resize|scroll|swipe|tab|panel|frame|slot|portal|fixture|snapshot|coverage|lint|typecheck|watch|serve|preview|release|tag|label|badge|draft|issue|ticket|pr|branch|rebase|squash|stash|worktree|submodule|monorepo|workspace|package|registry|artifact|manifest|lockfile|polyfill|shim|transpile|minify|tree.shak|tree-shak)(?:e|s|es|ed|ing|er)?\\b',
    '\\b[a-z][a-z0-9]*(?:_[a-z][a-z0-9]*)+\\b',
    '\\b[a-z]{2,}(?:-[a-z0-9]+)+\\b',
    '\\b[a-z]+(?:[A-Z][a-z0-9]*)+\\b',
    '\\b(?:IndexedDB|HuggingFace|Supertonic|onnxruntime(?:-web)?|Markdown|onnxruntime-web|Node\\.js|Human-in-the-Loop)\\b',
  ].join('|'),
  'g',
);

/**
 * @param {Float32Array|number[]} wav
 * @param {number} sampleRate
 * @param {number} [threshold]
 * @returns {number[]}
 */
export function trimTrailingSilence(wav, sampleRate, threshold = 0.006) {
  const minTail = Math.floor(sampleRate * 0.02);
  let end = wav.length;
  while (end > minTail && Math.abs(wav[end - 1]) < threshold) {
    end -= 1;
  }
  return wav.slice(0, end);
}

/**
 * @param {Float32Array|number[]} wav
 * @param {number} [threshold]
 * @returns {number[]}
 */
export function trimLeadingSilence(wav, threshold = 0.006) {
  let start = 0;
  while (start < wav.length && Math.abs(wav[start]) < threshold) {
    start += 1;
  }
  return wav.slice(start);
}

/**
 * @param {LangSegment[]} segments
 * @returns {LangSegment[]}
 */
function mergeAdjacentSegments(segments) {
  /** @type {LangSegment[]} */
  const out = [];
  for (const seg of segments) {
    const text = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.lang === seg.lang) {
      prev.text = `${prev.text} ${text}`;
    } else {
      out.push({ lang: seg.lang, text });
    }
  }
  return out;
}

/** Minimum chars for a Spanish segment to stand alone; below this it is punctuation/conjunction. */
const MIN_SEGMENT_CHARS = 4;

/**
 * Merge short Spanish segments (punctuation, conjunctions) into the previous segment
 * to avoid generating a separate TTS inference — and a perceptible pause — for single commas
 * or short connectors sandwiched between English spans.
 * @param {LangSegment[]} segments
 * @returns {LangSegment[]}
 */
function mergeShortSegments(segments) {
  const out = [];
  for (const seg of segments) {
    const text = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (seg.lang === 'es' && text.length <= MIN_SEGMENT_CHARS && prev) {
      prev.text = `${prev.text} ${text}`;
    } else {
      out.push({ lang: seg.lang, text });
    }
  }
  return mergeAdjacentSegments(out);
}

/**
 * Reduce fragmentación: fusiona pares adyacentes baratos priorizando pares del mismo idioma.
 * @param {LangSegment[]} segments
 * @param {number} [max]
 * @returns {LangSegment[]}
 */
export function consolidateSegments(segments, max = MAX_TTS_SEGMENTS) {
  let list = segments.map((s) => ({ lang: s.lang, text: s.text }));
  while (list.length > max) {
    if (list.length < 2) break;

    // Find the cheapest adjacent pair. Heavy penalty for cross-language merges.
    let bestI = -1;
    let bestScore = Infinity;
    for (let i = 0; i < list.length - 1; i++) {
      const combined = list[i].text.length + list[i + 1].text.length;
      const crossPenalty = list[i].lang !== list[i + 1].lang ? 10000 : 0;
      const score = combined + crossPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestI = i;
      }
    }

    const a = list[bestI];
    const b = list[bestI + 1];
    // Same-lang: keep that lang. Cross-lang: keep Spanish (primary doc language).
    const mergedLang = a.lang === b.lang ? a.lang : 'es';
    list[bestI] = { lang: mergedLang, text: `${a.text} ${b.text}`.trim() };
    list.splice(bestI + 1, 1);
    list = mergeAdjacentSegments(list);
  }
  return list;
}

/**
 * @param {number[][]} parts
 * @returns {Float32Array}
 */
export function concatWavParts(parts) {
  const totalLen = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} primaryLang Supertonic code (e.g. es, en)
 * @returns {LangSegment[]}
 */
export function splitBilingualText(text, primaryLang) {
  const primary = (primaryLang || 'es').toLowerCase();
  if (!text || primary !== 'es') {
    return [{ lang: primary, text: (text || '').trim() }];
  }

  /** @type {LangSegment[]} */
  const segments = [];
  let lastIndex = 0;
  const re = new RegExp(ENGLISH_SPAN_RE.source, ENGLISH_SPAN_RE.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ lang: 'es', text: before });
    }
    segments.push({ lang: 'en', text: match[0] });
    lastIndex = re.lastIndex;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim()) {
    segments.push({ lang: 'es', text: tail });
  }

  const merged = mergeAdjacentSegments(segments);
  if (!merged.length) {
    return [{ lang: 'es', text: text.trim() }];
  }
  // Absorb short Spanish fragments (punctuation, conjunctions) before counting segments.
  const compacted = mergeShortSegments(merged);
  return consolidateSegments(compacted);
}
