'use strict';

/**
 * CodeGraph telemetry — analogous to lib/compact/telemetry.js.
 *
 * Logs events to ~/.refacil-sdd-ai/codegraph.log (JSONL).
 * Uses the same try/catch-silent pattern and ensureDir() approach
 * as compact telemetry. Never throws to the caller.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const LOG_PATH = path.join(HOME_DIR, 'codegraph.log');

function ensureDir() {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
  } catch (_) {}
}

/**
 * Log a CodeGraph usage event.
 * @param {string} skillId             — e.g. 'investigator' | 'proposer' | 'debugger'
 * @param {boolean} hasGraph           — whether .codegraph/ was present in the repo
 * @param {number}  toolCallsCount     — number of CodeGraph tool calls made this session
 * @param {number}  estimatedTokensSaved — estimated tokens saved vs reading files directly
 */
function logEvent(skillId, hasGraph, toolCallsCount, estimatedTokensSaved) {
  try {
    ensureDir();
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        skillId: skillId || 'unknown',
        hasGraph: Boolean(hasGraph),
        toolCallsCount: toolCallsCount || 0,
        estimatedTokensSaved: estimatedTokensSaved || 0,
      }) + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {
    // Telemetry must never break the caller
  }
}

/**
 * Read all log entries as an array of parsed objects.
 * Returns [] if the log file does not exist or cannot be read.
 * @returns {object[]}
 */
function readLog() {
  try {
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Compute stats grouped by skillId, comparing with-graph vs without-graph.
 * @returns {{
 *   bySkill: Record<string, { withGraph: { events: number, toolCalls: number, tokensSaved: number }, withoutGraph: { events: number } }>,
 *   totalEvents: number,
 *   totalTokensSaved: number,
 *   totalToolCalls: number
 * }}
 */
function stats() {
  const entries = readLog();
  const bySkill = {};
  let totalEvents = 0;
  let totalTokensSaved = 0;
  let totalToolCalls = 0;

  for (const e of entries) {
    const skillId = e.skillId || 'unknown';
    if (!bySkill[skillId]) {
      bySkill[skillId] = {
        withGraph: { events: 0, toolCalls: 0, tokensSaved: 0 },
        withoutGraph: { events: 0 },
      };
    }

    if (e.hasGraph) {
      bySkill[skillId].withGraph.events++;
      bySkill[skillId].withGraph.toolCalls += e.toolCallsCount || 0;
      bySkill[skillId].withGraph.tokensSaved += e.estimatedTokensSaved || 0;
      totalToolCalls += e.toolCallsCount || 0;
      totalTokensSaved += e.estimatedTokensSaved || 0;
    } else {
      bySkill[skillId].withoutGraph.events++;
    }

    totalEvents++;
  }

  return {
    bySkill,
    totalEvents,
    totalTokensSaved,
    totalToolCalls,
  };
}

/**
 * Delete the log file.
 * Silent on errors (file may not exist).
 */
function clearLog() {
  try {
    fs.unlinkSync(LOG_PATH);
  } catch (_) {}
}

module.exports = {
  HOME_DIR,
  LOG_PATH,
  logEvent,
  readLog,
  stats,
  clearLog,
};
