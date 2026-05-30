'use strict';

const compactTelemetry = require('../compact/telemetry');
const codegraphTelemetry = require('../codegraph-telemetry');

const USD_PER_MTOK = 3;

function formatUsd(tokens) {
  return ((tokens / 1_000_000) * USD_PER_MTOK).toFixed(2);
}

function formatK(tokens) {
  return (tokens / 1000).toFixed(1);
}

function parseCompactArgs(argv) {
  const args = { _positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (!token.startsWith('--')) {
      args._positional.push(token);
      continue;
    }
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

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (value === true) return true;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return defaultValue;
}

function showCodegraphSection(cg) {
  console.log(`\n  CodeGraph — estimated savings by sub-agent\n`);
  const sortedSkills = Object.entries(cg.bySkill)
    .filter(([, data]) => data.withGraph.events > 0)
    .sort((a, b) => b[1].withGraph.tokensSaved - a[1].withGraph.tokensSaved);

  if (sortedSkills.length > 0) {
    console.log('  With CodeGraph:');
    for (const [skillId, data] of sortedSkills) {
      const kTokens = formatK(data.withGraph.tokensSaved);
      console.log(
        `    ${skillId.padEnd(18)} ${String(data.withGraph.events).padStart(5)} sessions   ` +
          `${String(data.withGraph.toolCalls).padStart(5)} tool calls   ~${kTokens.padStart(7)}k tokens saved`,
      );
    }
    const totalCgK = formatK(cg.totalTokensSaved);
    const totalCgUsd = formatUsd(cg.totalTokensSaved);
    console.log(`    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total CodeGraph'.padEnd(18)} ${String(cg.totalEvents).padStart(5)} events     ` +
        `${String(cg.totalToolCalls).padStart(5)} tool calls   ~${totalCgK.padStart(7)}k tokens (~$${totalCgUsd} USD)`,
    );
  }

  const withoutGraph = Object.entries(cg.bySkill).filter(
    ([, data]) => data.withoutGraph.events > 0,
  );
  if (withoutGraph.length > 0) {
    console.log('\n  Sessions without graph (baseline):');
    for (const [skillId, data] of withoutGraph) {
      console.log(
        `    ${skillId.padEnd(18)} ${String(data.withoutGraph.events).padStart(5)} sessions`,
      );
    }
  }

  console.log(`\n  Log: ${codegraphTelemetry.LOG_PATH}`);
}

function showCompactStats() {
  const s = compactTelemetry.stats();
  const cg = codegraphTelemetry.stats();
  const hasCompact = s.totalEvents > 0;
  const hasCg = cg.totalEvents > 0;

  if (!hasCompact && !hasCg) {
    console.log('\n  No hay eventos registrados todavia.');
    console.log('  - Bash con hook compact-bash → compact.log');
    console.log(
      '  - Tras sub-agentes: refacil-sdd-ai compact log-codegraph-event --skill <id> --has-graph true|false --tool-calls N --tokens N\n',
    );
    return;
  }

  if (hasCompact) {
    const sortedRewrites = Object.entries(s.byRule)
      .filter(([, data]) => data.rewriteCount > 0)
      .sort((a, b) => b[1].rewriteSaved - a[1].rewriteSaved);
    const sortedAlreadyCompact = Object.entries(s.byRule)
      .filter(([, data]) => data.alreadyCompactCount > 0)
      .sort((a, b) => b[1].alreadyCompactPotential - a[1].alreadyCompactPotential);

    console.log(`\n  compact-bash stats\n`);
    console.log(`  Rewrites por hook: ${s.totalRewrites}`);
    console.log(`  Comandos ya compactos detectados (skill/agente): ${s.totalAlreadyCompact}\n`);

    if (sortedRewrites.length > 0) {
      console.log('  Ahorro aplicado por hook (rewrite):');
      for (const [id, data] of sortedRewrites) {
        const kTokens = formatK(data.rewriteSaved);
        console.log(
          `    ${id.padEnd(18)} ${String(data.rewriteCount).padStart(6)} rewrites   ~${kTokens.padStart(7)}k tokens`,
        );
      }
      const totalHookK = formatK(s.totalSaved);
      const hookUsd = formatUsd(s.totalSaved);
      console.log(`    ${'-'.repeat(62)}`);
      console.log(
        `    ${'Total hook'.padEnd(18)} ${String(s.totalRewrites).padStart(6)} rewrites   ~${totalHookK.padStart(7)}k tokens (~$${hookUsd} USD)`,
      );
      console.log('');
    }

    if (sortedAlreadyCompact.length > 0) {
      console.log('  Ahorro potencial ya capturado por skill/agente (sin rewrite):');
      for (const [id, data] of sortedAlreadyCompact) {
        const kTokens = formatK(data.alreadyCompactPotential);
        console.log(
          `    ${id.padEnd(18)} ${String(data.alreadyCompactCount).padStart(6)} eventos    ~${kTokens.padStart(7)}k tokens potenciales`,
        );
      }
      const totalAgentK = formatK(s.totalAlreadyCompactPotential);
      const agentUsd = formatUsd(s.totalAlreadyCompactPotential);
      console.log(`    ${'-'.repeat(62)}`);
      console.log(
        `    ${'Total skill'.padEnd(18)} ${String(s.totalAlreadyCompact).padStart(6)} eventos    ~${totalAgentK.padStart(7)}k tokens (~$${agentUsd} USD)`,
      );
      console.log('');
    }

    const compactK = formatK(s.totalObservedPotential);
    const compactUsd = formatUsd(s.totalObservedPotential);
    console.log(`    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total compact'.padEnd(18)} ${String(s.totalEvents).padStart(6)} eventos    ~${compactK.padStart(7)}k tokens (~$${compactUsd} USD, Sonnet input)`,
    );
    console.log(`\n  Log: ${compactTelemetry.LOG_PATH}`);
    if (compactTelemetry.isDisabled()) {
      console.log('  Estado: DESHABILITADO (no se registran nuevos eventos)');
    }
  }

  if (hasCg) {
    showCodegraphSection(cg);
  }

  const grandTotal = s.totalObservedPotential + cg.totalTokensSaved;
  if (hasCompact && hasCg) {
    const grandK = formatK(grandTotal);
    const grandUsd = formatUsd(grandTotal);
    console.log(`\n    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total combinado'.padEnd(18)} compact + CodeGraph   ~${grandK.padStart(7)}k tokens (~$${grandUsd} USD, Sonnet input)`,
    );
  } else if (!hasCompact && hasCg && cg.totalTokensSaved > 0) {
    const grandK = formatK(grandTotal);
    const grandUsd = formatUsd(grandTotal);
    console.log(`\n    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total observado'.padEnd(18)} ${String(cg.totalEvents).padStart(6)} eventos    ~${grandK.padStart(7)}k tokens (~$${grandUsd} USD, Sonnet input)`,
    );
  }

  console.log('');
}

function cmdLogCodegraphEvent(argv) {
  const args = parseCompactArgs(argv);
  const skillId = args.skill || args._positional[0];
  if (!skillId) {
    console.error(
      '  Uso: refacil-sdd-ai compact log-codegraph-event --skill <id> --has-graph true|false [--tool-calls N] [--tokens N]',
    );
    process.exitCode = 1;
    return;
  }

  const hasGraph = parseBool(args['has-graph'], false);
  const toolCalls = Math.max(0, parseInt(args['tool-calls'] || '0', 10) || 0);
  const tokens = Math.max(0, parseInt(args.tokens || '0', 10) || 0);

  codegraphTelemetry.logEvent(skillId, hasGraph, toolCalls, tokens);
}

function handleCompact(sub, argv = []) {
  switch (sub) {
    case 'stats':
      showCompactStats();
      break;
    case 'log-codegraph-event':
      cmdLogCodegraphEvent(argv);
      break;
    case 'disable':
      compactTelemetry.disable();
      console.log('  compact-bash deshabilitado. Reactiva con: refacil-sdd-ai compact enable');
      break;
    case 'enable':
      compactTelemetry.enable();
      console.log('  compact-bash habilitado.');
      break;
    case 'clear-log':
      compactTelemetry.clearLog();
      console.log('  compact.log limpiado.');
      break;
    case 'codegraph-clear-log':
      codegraphTelemetry.clearLog();
      console.log('  codegraph.log limpiado.');
      break;
    default:
      console.log(
        'Uso: refacil-sdd-ai compact <stats|log-codegraph-event|disable|enable|clear-log|codegraph-clear-log>',
      );
  }
}

module.exports = { handleCompact, showCompactStats, cmdLogCodegraphEvent };
