function hasFlagAfterBase(cmd, baseTokens) {
  const tokens = cmd.trim().split(/\s+/);
  return tokens.slice(baseTokens).some((t) => t.startsWith('-'));
}

function hasPipeOrRedirect(cmd) {
  return /[|><]/.test(cmd);
}

const RULES = [
  // --- Fase 1: git / tests / docker logs ---
  {
    id: 'git-log',
    match: (cmd) =>
      /^\s*git\s+log(\s|$)/.test(cmd) && !hasFlagAfterBase(cmd, 2),
    compactMatch: (cmd) =>
      /^\s*git\s+log(\s|$)/.test(cmd) &&
      (/--oneline\b/.test(cmd) || /(^|\s)-\d+\b/.test(cmd)),
    rewrite: (cmd) => cmd.replace(/^(\s*git\s+log)/, '$1 --oneline -20'),
    reason: 'git log → --oneline -20',
    savedTokensEst: 850,
  },
  {
    id: 'git-status',
    match: (cmd) =>
      /^\s*git\s+status(\s|$)/.test(cmd) && !hasFlagAfterBase(cmd, 2),
    compactMatch: (cmd) =>
      /^\s*git\s+status(\s|$)/.test(cmd) &&
      (/\s-s(\s|$)/.test(cmd) || /--short\b/.test(cmd)),
    rewrite: (cmd) => cmd.replace(/^(\s*git\s+status)/, '$1 -s'),
    reason: 'git status → -s',
    savedTokensEst: 120,
  },
  {
    id: 'git-diff',
    match: (cmd) => /^\s*git\s+diff\s*$/.test(cmd),
    compactMatch: (cmd) => /^\s*git\s+diff(\s|$)/.test(cmd) && /--stat\b/.test(cmd),
    rewrite: (cmd) => cmd.replace(/^(\s*git\s+diff)\s*$/, '$1 --stat'),
    reason: 'git diff → --stat',
    savedTokensEst: 400,
  },
  {
    id: 'git-show',
    match: (cmd) =>
      /^\s*git\s+show(\s|$)/.test(cmd) && !hasFlagAfterBase(cmd, 2),
    compactMatch: (cmd) => /^\s*git\s+show(\s|$)/.test(cmd) && /--stat\b/.test(cmd),
    rewrite: (cmd) => cmd.replace(/^(\s*git\s+show)/, '$1 --stat'),
    reason: 'git show → --stat',
    savedTokensEst: 200,
  },
  {
    id: 'docker-logs',
    match: (cmd) => {
      if (!/^\s*docker\s+logs(\s|$)/.test(cmd)) return false;
      if (/\s--tail\b/.test(cmd)) return false;
      if (/\s-n\s+\d/.test(cmd)) return false;
      if (/\s--since\b/.test(cmd)) return false;
      return true;
    },
    compactMatch: (cmd) =>
      /^\s*docker\s+logs(\s|$)/.test(cmd) &&
      (/\s--tail\b/.test(cmd) || /\s-n\s+\d/.test(cmd) || /\s--since\b/.test(cmd)),
    rewrite: (cmd) => cmd.replace(/^(\s*docker\s+logs)/, '$1 --tail 100'),
    reason: 'docker logs → --tail 100',
    savedTokensEst: 1500,
  },
  {
    id: 'pkg-test',
    match: (cmd) => /^\s*(npm|yarn|pnpm)\s+(test|t)\s*$/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*(npm|yarn|pnpm)\s+(test|t)\b/.test(cmd) &&
      (hasPipeOrRedirect(cmd) || /--silent\b/.test(cmd) || /\b-q\b/.test(cmd)),
    rewrite: (cmd) => `${cmd.trim()} 2>&1 | tail -80`,
    reason: 'test bare → tail -80',
    savedTokensEst: 2400,
  },
  {
    id: 'jest-bare',
    match: (cmd) => /^\s*(npx\s+)?jest\s*$/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*(npx\s+)?jest(\s|$)/.test(cmd) &&
      (/--silent\b/.test(cmd) || /--reporters=summary\b/.test(cmd)),
    rewrite: (cmd) =>
      cmd.replace(/^(\s*(?:npx\s+)?jest)\s*$/, '$1 --silent --reporters=summary'),
    reason: 'jest → silent summary',
    savedTokensEst: 1800,
  },
  {
    id: 'pytest-bare',
    match: (cmd) => /^\s*pytest\s*$/.test(cmd),
    compactMatch: (cmd) => /^\s*pytest(\s|$)/.test(cmd) && /(^|\s)-q(\s|$)/.test(cmd),
    rewrite: (cmd) => cmd.replace(/^(\s*pytest)\s*$/, '$1 -q'),
    reason: 'pytest → -q',
    savedTokensEst: 600,
  },
  // --- Fase 2A: linters / type checkers / build ---
  {
    id: 'eslint',
    match: (cmd) => /^\s*eslint(\s+[^-]\S*)*\s*$/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*eslint(\s|$)/.test(cmd) &&
      (/--format\s+compact\b/.test(cmd) || /--quiet\b/.test(cmd)),
    rewrite: (cmd) => {
      const tokens = cmd.trim().split(/\s+/);
      if (tokens.length === 1) {
        return 'eslint . --format compact --quiet';
      }
      return `${cmd.trim()} --format compact`;
    },
    reason: 'eslint → --format compact',
    savedTokensEst: 700,
  },
  {
    id: 'biome-check',
    match: (cmd) =>
      /^\s*biome\s+check(\s|$)/.test(cmd) && !/--reporter\b/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*biome\s+check(\s|$)/.test(cmd) && /--reporter=summary\b/.test(cmd),
    rewrite: (cmd) =>
      cmd.replace(/^(\s*biome\s+check)/, '$1 --reporter=summary'),
    reason: 'biome check → --reporter=summary',
    savedTokensEst: 500,
  },
  {
    id: 'tsc',
    match: (cmd) => {
      if (!/^\s*(npx\s+)?tsc(\s|$)/.test(cmd)) return false;
      if (/(^|\s)--watch\b|(^|\s)-w\b/.test(cmd)) return false;
      if (hasPipeOrRedirect(cmd)) return false;
      return true;
    },
    compactMatch: (cmd) =>
      /^\s*(npx\s+)?tsc(\s|$)/.test(cmd) && hasPipeOrRedirect(cmd),
    rewrite: (cmd) => `${cmd.trim()} 2>&1 | head -80`,
    reason: 'tsc → head -80',
    savedTokensEst: 1200,
  },
  {
    id: 'prettier-check',
    match: (cmd) =>
      /^\s*prettier\s+--check\b/.test(cmd) && !/--loglevel\b/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*prettier\s+--check\b/.test(cmd) && /--loglevel\b/.test(cmd),
    rewrite: (cmd) =>
      cmd.replace(/^(\s*prettier\s+--check)/, '$1 --loglevel warn'),
    reason: 'prettier --check → --loglevel warn',
    savedTokensEst: 300,
  },
  {
    id: 'npm-audit',
    match: (cmd) => /^\s*npm\s+audit\s*$/.test(cmd),
    compactMatch: (cmd) => /^\s*npm\s+audit(\s|$)/.test(cmd) && hasPipeOrRedirect(cmd),
    rewrite: (cmd) => `${cmd.trim()} 2>&1 | tail -10`,
    reason: 'npm audit → tail -10',
    savedTokensEst: 900,
  },
  {
    id: 'npm-ls',
    match: (cmd) => /^\s*npm\s+ls\s*$/.test(cmd),
    compactMatch: (cmd) => /^\s*npm\s+ls(\s|$)/.test(cmd) && /--depth=0\b/.test(cmd),
    rewrite: (cmd) => cmd.replace(/^(\s*npm\s+ls)/, '$1 --depth=0'),
    reason: 'npm ls → --depth=0',
    savedTokensEst: 700,
  },
  {
    id: 'cargo-bare',
    match: (cmd) => /^\s*cargo\s+(build|test|check)\s*$/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*cargo\s+(build|test|check)(\s|$)/.test(cmd) && /--quiet\b/.test(cmd),
    rewrite: (cmd) => `${cmd.trim()} --quiet`,
    reason: 'cargo → --quiet',
    savedTokensEst: 400,
  },
  {
    id: 'go-test',
    match: (cmd) => {
      if (!/^\s*go\s+test\b/.test(cmd)) return false;
      const rest = cmd.trim().substring('go test'.length);
      if (/\s-\S/.test(rest)) return false;
      if (hasPipeOrRedirect(cmd)) return false;
      return true;
    },
    compactMatch: (cmd) => /^\s*go\s+test(\s|$)/.test(cmd) && hasPipeOrRedirect(cmd),
    rewrite: (cmd) => `${cmd.trim()} 2>&1 | tail -80`,
    reason: 'go test → tail -80',
    savedTokensEst: 1500,
  },
  {
    id: 'mvn-test',
    match: (cmd) => /^\s*mvn\s+test\s*$/.test(cmd),
    compactMatch: (cmd) => /^\s*mvn\s+test(\s|$)/.test(cmd) && /(^|\s)-q(\s|$)/.test(cmd),
    rewrite: (cmd) => `${cmd.trim()} -q`,
    reason: 'mvn test → -q',
    savedTokensEst: 1800,
  },
  {
    id: 'gradle-test',
    match: (cmd) => /^\s*(\.\/gradlew|gradle)\s+test\s*$/.test(cmd),
    compactMatch: (cmd) =>
      /^\s*(\.\/gradlew|gradle)\s+test(\s|$)/.test(cmd) &&
      /(^|\s)-q(\s|$)/.test(cmd),
    rewrite: (cmd) => `${cmd.trim()} -q`,
    reason: 'gradle test → -q',
    savedTokensEst: 1500,
  },
  {
    id: 'ps-aux',
    // Unix-only: en Windows `ps` mapea a PowerShell Get-Process y no entiende estos flags
    match: (cmd) =>
      process.platform !== 'win32' && /^\s*ps\s+aux\s*$/.test(cmd),
    rewrite: () => 'ps -eo pid,pcpu,pmem,comm | head -30',
    reason: 'ps aux → compact columns + head -30',
    savedTokensEst: 800,
  },
];

function findRule(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  if (/\bCOMPACT=0\b/.test(cmd)) return null;
  for (const rule of RULES) {
    if (rule.match(cmd)) return rule;
  }
  return null;
}

function findAlreadyCompactRule(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  for (const rule of RULES) {
    if (typeof rule.compactMatch === 'function' && rule.compactMatch(cmd)) {
      return rule;
    }
  }
  return null;
}

module.exports = { RULES, findRule, findAlreadyCompactRule };
