'use strict';

const { loadBranchConfigWithSources } = require('../config');

/** Supertonic language codes supported for TTS. */
const TTS_LANG_CODES = new Set([
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr',
  'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk',
  'sl', 'sv', 'tr', 'uk', 'vi',
]);

const ARTIFACT_TO_TTS = {
  spanish: 'es',
  english: 'en',
};

const DEFAULT_TTS_LANG = 'es';

/**
 * Map SDD artifactLanguage (english | spanish) to Supertonic code.
 * @param {string} artifactLanguage
 * @returns {string}
 */
function artifactLanguageToTtsCode(artifactLanguage) {
  return ARTIFACT_TO_TTS[artifactLanguage] || DEFAULT_TTS_LANG;
}

/**
 * Default TTS language from project/global SDD config.
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveDefaultTtsLang(projectRoot) {
  const { artifactLanguage } = loadBranchConfigWithSources(projectRoot);
  return artifactLanguageToTtsCode(artifactLanguage);
}

/**
 * @param {string} code
 * @returns {boolean}
 */
function isValidTtsLang(code) {
  return TTS_LANG_CODES.has(code);
}

// Heading patterns that unambiguously identify the artifact language from content.
const ENGLISH_CONTENT_RE = /^##\s+(?:Objective|Purpose|Scope|Requirements?|Acceptance Criteria|Rejection Criteria)\b/im;
const SPANISH_CONTENT_RE = /^##\s+(?:Objetivo|Propósito|Alcance|Requisitos?|Criterios? de Aceptación|Criterios? de Rechazo)\b/im;

/**
 * Detect TTS language from markdown content when no explicit meta comment is present.
 * Returns 'en', 'es', or null if the content is ambiguous.
 * @param {string} content
 * @returns {string|null}
 */
function detectTtsLangFromContent(content) {
  const hasEnglish = ENGLISH_CONTENT_RE.test(content);
  const hasSpanish = SPANISH_CONTENT_RE.test(content);
  if (hasEnglish && !hasSpanish) return 'en';
  if (hasSpanish && !hasEnglish) return 'es';
  return null;
}

module.exports = {
  TTS_LANG_CODES,
  ARTIFACT_TO_TTS,
  DEFAULT_TTS_LANG,
  artifactLanguageToTtsCode,
  resolveDefaultTtsLang,
  isValidTtsLang,
  detectTtsLangFromContent,
};
