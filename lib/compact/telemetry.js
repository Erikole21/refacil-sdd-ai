const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const LOG_PATH = path.join(HOME_DIR, 'compact.log');
const DISABLED_PATH = path.join(HOME_DIR, 'disabled');

function ensureDir() {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
  } catch (_) {}
}

function isDisabled() {
  return fs.existsSync(DISABLED_PATH);
}

function logEvent(eventType, ruleId, savedTokensEst, meta = {}) {
  try {
    ensureDir();
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        eventType: eventType || 'hook_rewrite',
        ruleId,
        savedTokensEst: savedTokensEst || 0,
        ...meta,
      }) + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {
    // Telemetry must never break the hook
  }
}

function logRewrite(ruleId, savedTokensEst) {
  logEvent('hook_rewrite', ruleId, savedTokensEst);
}

function logAlreadyCompact(ruleId, savedTokensEst) {
  // Assumption: command arrived compact due to skills/agent discipline.
  logEvent('already_compact', ruleId, savedTokensEst, {
    source: 'skill_assumed',
  });
}

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

function stats() {
  const entries = readLog();
  const byRule = {};
  let totalSaved = 0;
  let totalAlreadyCompactPotential = 0;
  let totalAlreadyCompact = 0;
  let totalRewrites = 0;

  for (const e of entries) {
    const eventType = e.eventType || 'hook_rewrite';
    if (!byRule[e.ruleId]) {
      byRule[e.ruleId] = {
        rewriteCount: 0,
        rewriteSaved: 0,
        alreadyCompactCount: 0,
        alreadyCompactPotential: 0,
      };
    }

    if (eventType === 'already_compact') {
      byRule[e.ruleId].alreadyCompactCount++;
      byRule[e.ruleId].alreadyCompactPotential += e.savedTokensEst || 0;
      totalAlreadyCompact++;
      totalAlreadyCompactPotential += e.savedTokensEst || 0;
    } else {
      byRule[e.ruleId].rewriteCount++;
      byRule[e.ruleId].rewriteSaved += e.savedTokensEst || 0;
      totalRewrites++;
      totalSaved += e.savedTokensEst || 0;
    }
  }

  return {
    byRule,
    totalSaved,
    totalRewrites,
    totalAlreadyCompact,
    totalAlreadyCompactPotential,
    totalObservedPotential: totalSaved + totalAlreadyCompactPotential,
    totalEvents: entries.length,
  };
}

function disable() {
  ensureDir();
  fs.writeFileSync(DISABLED_PATH, new Date().toISOString());
}

function enable() {
  try {
    fs.unlinkSync(DISABLED_PATH);
  } catch (_) {}
}

function clearLog() {
  try {
    fs.unlinkSync(LOG_PATH);
  } catch (_) {}
}

module.exports = {
  HOME_DIR,
  LOG_PATH,
  DISABLED_PATH,
  isDisabled,
  logRewrite,
  logAlreadyCompact,
  stats,
  disable,
  enable,
  clearLog,
};
