'use strict';

// Recognized IDE identifiers. Only 'cursor' gets a dedicated message path;
// all other values (including 'unknown') fall to the generic A/B options block.
const SUPPORTED_IDES = new Set(['cursor', 'claude-code', 'codex', 'opencode', 'unknown']);

function getFlag(argv, flag, fallback) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] !== undefined ? argv[idx + 1] : fallback;
}

function normalizeIde(raw) {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  return SUPPORTED_IDES.has(lower) ? lower : 'unknown';
}

/**
 * Shared message builder. Receives a localized strings object so both language
 * variants (ES / EN) share the same structural logic — only the copy differs.
 *
 * @param {string} changeName
 * @param {string} ide
 * @param {{ header: string, ideLabel: string, phases: string, cursorLines: string[], genericLines: string[] }} strings
 * @returns {string}
 */
function buildReadyMessage(changeName, ide, strings) {
  const lines = [
    strings.header,
    `Change: ${changeName}`,
    `${strings.ideLabel}: ${ide}`,
    ``,
    strings.phases,
    ``,
  ];

  if (ide === 'cursor') {
    lines.push(...strings.cursorLines);
  } else {
    lines.push(...strings.genericLines);
  }

  return lines.join('\n');
}

function buildReadyMessageEs(changeName, ide) {
  return buildReadyMessage(changeName, ide, {
    header: `Autopilot listo para arrancar`,
    ideLabel: `IDE detectado`,
    phases: `Fases: apply → test → verify → review → archive → up-code`,
    cursorLines: [
      `Para continuar en esta sesión, responde con una afirmación explícita:`,
      `  go · ok · start · sí · dale · arrancar`,
      ``,
      `Hasta que no respondas así, no inicio el pipeline.`,
    ],
    genericLines: [
      `Opciones:`,
      `  A) Ejecutar aquí (pueden aparecer prompts de permisos durante el pipeline)`,
      `     → responde "go" / "ok" / "start" para iniciar en esta sesión.`,
      ``,
      `  B) Ejecutar headless (sin interrupciones, salida visible en nueva terminal)`,
      `     → cierra esta sesión y abre el IDE con el flag de auto-permisos adecuado,`,
      `       luego escribe /refacil:autopilot.`,
    ],
  });
}

function buildReadyMessageEn(changeName, ide) {
  return buildReadyMessage(changeName, ide, {
    header: `Autopilot ready to start`,
    ideLabel: `Detected IDE`,
    phases: `Phases: apply → test → verify → review → archive → up-code`,
    cursorLines: [
      `To continue in this session, reply with an explicit affirmative:`,
      `  go · ok · start · yes · dale`,
      ``,
      `The pipeline will not start until you reply.`,
    ],
    genericLines: [
      `Options:`,
      `  A) Run here (Bash permission prompts may appear during the pipeline)`,
      `     → reply "go" / "ok" / "start" to begin in this session.`,
      ``,
      `  B) Run headless (no interruptions, output visible in a new terminal)`,
      `     → close this session and open the IDE with the appropriate auto-permissions flag,`,
      `       then type /refacil:autopilot.`,
    ],
  });
}

function handleAutopilot(sub, argv) {
  if (sub === 'ready-message') {
    const changeName = getFlag(argv, '--change', '');
    const idRaw = getFlag(argv, '--ide', '');
    const lang = getFlag(argv, '--lang', 'es');
    const ide = normalizeIde(idRaw);

    if (!changeName) {
      process.stderr.write('  Error: --change <changeName> is required\n');
      process.exit(1);
    }

    let message;
    if (lang === 'en') {
      message = buildReadyMessageEn(changeName, ide);
    } else {
      message = buildReadyMessageEs(changeName, ide);
    }

    process.stdout.write(message + '\n');
  } else {
    process.stderr.write(
      `  Unknown autopilot subcommand: ${sub || '(none)'}. Usage: autopilot <ready-message>\n`,
    );
    process.exit(1);
  }
}

module.exports = { handleAutopilot };
