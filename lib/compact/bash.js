const fs = require('fs');
const { findRule, findAlreadyCompactRule } = require('./rules');
const telemetry = require('./telemetry');

function run() {
  let input;
  try {
    const stdin = fs.readFileSync(0, 'utf8');
    if (!stdin.trim()) return;
    input = JSON.parse(stdin);
  } catch (_) {
    return;
  }

  if (input.tool_name !== 'Bash') return;
  if (telemetry.isDisabled()) return;

  const origCommand = input.tool_input && input.tool_input.command;
  if (typeof origCommand !== 'string') return;

  const rule = findRule(origCommand);
  if (!rule) {
    const compactRule = findAlreadyCompactRule(origCommand);
    if (compactRule) {
      telemetry.logAlreadyCompact(compactRule.id, compactRule.savedTokensEst);
    }
    return;
  }

  let newCommand;
  try {
    newCommand = rule.rewrite(origCommand);
  } catch (_) {
    return;
  }

  if (!newCommand || newCommand === origCommand) return;

  telemetry.logRewrite(rule.id, rule.savedTokensEst);

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `compact-bash: ${rule.reason}`,
      updatedInput: {
        ...input.tool_input,
        command: newCommand,
      },
    },
  };

  process.stdout.write(JSON.stringify(output));
}

module.exports = { run };
