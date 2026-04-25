'use strict';

const compactTelemetry = require('../compact/telemetry');

function showCompactStats() {
  const s = compactTelemetry.stats();
  if (s.totalEvents === 0) {
    console.log('\n  No hay eventos registrados todavia. Ejecuta comandos Bash para generar telemetria de compactacion.\n');
    return;
  }

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
      const kTokens = (data.rewriteSaved / 1000).toFixed(1);
      console.log(
        `    ${id.padEnd(18)} ${String(data.rewriteCount).padStart(6)} rewrites   ~${kTokens.padStart(7)}k tokens`,
      );
    }
    const totalHookK = (s.totalSaved / 1000).toFixed(1);
    const hookUsd = ((s.totalSaved / 1_000_000) * 3).toFixed(2);
    console.log(`    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total hook'.padEnd(18)} ${String(s.totalRewrites).padStart(6)} rewrites   ~${totalHookK.padStart(7)}k tokens (~$${hookUsd} USD)`,
    );
    console.log('');
  }

  if (sortedAlreadyCompact.length > 0) {
    console.log('  Ahorro potencial ya capturado por skill/agente (sin rewrite):');
    for (const [id, data] of sortedAlreadyCompact) {
      const kTokens = (data.alreadyCompactPotential / 1000).toFixed(1);
      console.log(
        `    ${id.padEnd(18)} ${String(data.alreadyCompactCount).padStart(6)} eventos    ~${kTokens.padStart(7)}k tokens potenciales`,
      );
    }
    const totalAgentK = (s.totalAlreadyCompactPotential / 1000).toFixed(1);
    const agentUsd = ((s.totalAlreadyCompactPotential / 1_000_000) * 3).toFixed(2);
    console.log(`    ${'-'.repeat(62)}`);
    console.log(
      `    ${'Total skill'.padEnd(18)} ${String(s.totalAlreadyCompact).padStart(6)} eventos    ~${totalAgentK.padStart(7)}k tokens (~$${agentUsd} USD)`,
    );
    console.log('');
  }

  const totalK = (s.totalObservedPotential / 1000).toFixed(1);
  const totalUsd = ((s.totalObservedPotential / 1_000_000) * 3).toFixed(2);
  console.log(`    ${'-'.repeat(62)}`);
  console.log(
    `    ${'Total observado'.padEnd(18)} ${String(s.totalEvents).padStart(6)} eventos    ~${totalK.padStart(7)}k tokens (~$${totalUsd} USD, Sonnet input)`,
  );
  console.log(`\n  Log: ${compactTelemetry.LOG_PATH}`);
  if (compactTelemetry.isDisabled()) {
    console.log('  Estado: DESHABILITADO (no se registran nuevos eventos)');
  }
  console.log('');
}

function handleCompact(sub) {
  switch (sub) {
    case 'stats':
      showCompactStats();
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
    default:
      console.log('Uso: refacil-sdd-ai compact <stats|disable|enable|clear-log>');
  }
}

module.exports = { handleCompact };
