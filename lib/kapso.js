'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');
const readline = require('readline/promises');

const KAPSO_ENV_DIR = path.join(os.homedir(), '.refacil-sdd-ai');
const KAPSO_ENV_FILE = path.join(KAPSO_ENV_DIR, 'kapso.env');
const KAPSO_LOG_FILE = path.join(KAPSO_ENV_DIR, 'autopilot.log');
const KAPSO_API_BASE = 'https://api.kapso.ai/meta/whatsapp/v24.0';

const PHONE_REGEX = /^\+\d{7,15}$/;

// ─── credentials ─────────────────────────────────────────────────────────────

function readCredentials() {
  if (!fs.existsSync(KAPSO_ENV_FILE)) return null;
  const creds = {};
  for (const line of fs.readFileSync(KAPSO_ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([^#][^=]+)=(.+)$/);
    if (m) creds[m[1].trim()] = m[2].trim();
  }
  const { KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID, NOTIFY_PHONE } = creds;
  if (!KAPSO_API_KEY || !KAPSO_PHONE_NUMBER_ID || !NOTIFY_PHONE) return null;
  return { apiKey: KAPSO_API_KEY, phoneNumberId: KAPSO_PHONE_NUMBER_ID, notifyPhone: NOTIFY_PHONE };
}

// ─── http ─────────────────────────────────────────────────────────────────────

function postMessage(creds, bodyText) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: creds.notifyPhone,
      type: 'text',
      text: { body: bodyText },
    });

    const urlPath = `${KAPSO_API_BASE}/${creds.phoneNumberId}/messages`;
    const parsed = new URL(urlPath);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': creds.apiKey,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── validation ────────────────────────────────────────────────────────────────

// Unfilled template token left in the command, e.g. "<changeName>" or "<repoSlug>".
const PLACEHOLDER_REGEX = /<[^>]+>/;

function isBlankOrPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  if (s === '') return true;
  if (PLACEHOLDER_REGEX.test(s)) return true;
  return false;
}

// Returns a list of human-readable problems with the notify payload.
// Empty list ⇒ the payload is complete enough to send.
//
// This is the guard against the autopilot failure mode where the skill fires
// `kapso notify` once with unfilled <placeholders>/empty flags (sending a junk
// WhatsApp message) and again with the real values. We reject the incomplete
// call so it never reaches postMessage().
function validateNotifyOpts(type, opts) {
  const problems = [];
  const required =
    type === 'success'
      ? ['repo', 'change', 'branch', 'tasks']
      : ['repo', 'change', 'branch', 'phase'];

  for (const field of required) {
    if (isBlankOrPlaceholder(opts[field])) {
      problems.push(`--${field} faltante, vacío o sin rellenar`);
    }
  }

  // tasks must look like "done/total" (e.g. "5/5"), not a placeholder or prose.
  if (
    type === 'success' &&
    !isBlankOrPlaceholder(opts.tasks) &&
    !/^\d+\/\d+$/.test(String(opts.tasks).trim())
  ) {
    problems.push(`--tasks con formato inválido (esperado "done/total"): "${opts.tasks}"`);
  }

  return problems;
}

// ─── log ─────────────────────────────────────────────────────────────────────

function appendLog(msg) {
  try {
    fs.mkdirSync(KAPSO_ENV_DIR, { recursive: true });
    fs.appendFileSync(KAPSO_LOG_FILE, `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch (_) {}
}

// ─── public commands ──────────────────────────────────────────────────────────

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\n  Kapso setup — WhatsApp notification credentials\n');

    let apiKey = '';
    while (!apiKey.trim()) {
      apiKey = await rl.question('  KAPSO_API_KEY: ');
      if (!apiKey.trim()) console.log('  KAPSO_API_KEY cannot be empty. Try again.');
    }

    let phoneNumberId = '';
    while (!phoneNumberId.trim()) {
      phoneNumberId = await rl.question('  KAPSO_PHONE_NUMBER_ID: ');
      if (!phoneNumberId.trim()) console.log('  KAPSO_PHONE_NUMBER_ID cannot be empty. Try again.');
    }

    let notifyPhone = '';
    while (true) {
      notifyPhone = await rl.question(
        "  NOTIFY_PHONE (E.164 format, e.g. +5731XXXXXXXX, or 'cancelar' to abort): ",
      );
      if (notifyPhone.trim().toLowerCase() === 'cancelar') {
        console.log('\n  Setup cancelled.\n');
        rl.close();
        return;
      }
      if (PHONE_REGEX.test(notifyPhone.trim())) break;
      console.log('  Invalid format. Must start with + followed by 7-15 digits (E.164). Try again.');
    }

    fs.mkdirSync(KAPSO_ENV_DIR, { recursive: true });

    const content =
      [`KAPSO_API_KEY=${apiKey.trim()}`, `KAPSO_PHONE_NUMBER_ID=${phoneNumberId.trim()}`, `NOTIFY_PHONE=${notifyPhone.trim()}`].join('\n') +
      '\n';

    fs.writeFileSync(KAPSO_ENV_FILE, content, { encoding: 'utf8' });

    try {
      fs.chmodSync(KAPSO_ENV_FILE, 0o600);
    } catch (_) {}

    console.log('\n  ✅ Kapso configurado en ~/.refacil-sdd-ai/kapso.env\n');
  } finally {
    rl.close();
  }
}

// kapso preflight
// Returns credential status and a 24h window notice (sync, always exits 0).
// sync — no network I/O
function preflight() {
  const creds = readCredentials();
  if (!creds) {
    return { kapsoEnabled: false };
  }
  const preflightMessage =
    'WhatsApp solo entrega mensajes de texto libre dentro de las **24 horas** de tu último mensaje **entrante** al número de notificación. ' +
    'Si han pasado más de 24 horas desde que enviaste un mensaje a ese número, envía cualquier mensaje (p.ej. `ok`) antes de una ejecución larga. ' +
    'Sin eso, el pipeline igual corre pero la alerta final de WhatsApp puede no llegar.';
  return { kapsoEnabled: true, notifyPhone: creds.notifyPhone, preflightMessage };
}

// kapso notify success --repo <slug> --change <name> --branch <branch>
//   --tasks <done>/<total> --duration <min>
//   [--pr <url>] [--improvements <n>] [--apply <n>] [--test <n>] [--review <n>]
//   [--warnings "<w1>|<w2>"]
//
// kapso notify failure --repo <slug> --change <name> --branch <branch>
//   --phase <phase> --last-commit "<commit>" --error "<summary>"
async function notify(type, opts) {
  if (type !== 'success' && type !== 'failure') {
    console.error(`  Unknown notify type: "${type}". Use "success" or "failure".`);
    process.exit(1);
  }

  // Reject incomplete/placeholder payloads BEFORE doing anything else so a junk
  // notification is never sent. Throwing surfaces a clear, actionable error to
  // the caller (autopilot) without ever hitting the WhatsApp API.
  const problems = validateNotifyOpts(type, opts);
  if (problems.length > 0) {
    appendLog(`kapso notify ${type} REJECTED (datos inválidos): ${problems.join('; ')}`);
    throw new Error(
      `kapso notify ${type}: datos inválidos o incompletos — ${problems.join('; ')}. ` +
        'No se envió la notificación. Reintenta con todos los flags requeridos rellenados con valores reales.',
    );
  }

  const creds = readCredentials();
  if (!creds) {
    appendLog('kapso notify skipped: no credentials');
    return;
  }

  let message;

  if (type === 'success') {
    const {
      repo = '',
      change = '',
      branch = '',
      tasks = '0/0',
      duration = '0',
      pr = null,
      apply = 0,
      test = 0,
      review = 0,
      warnings = '',
    } = opts;

    const totalImprovements = Number(apply) + Number(test) + Number(review);
    const warningList = warnings ? warnings.split('|').map((w) => w.trim()).filter(Boolean) : [];

    let msg = [
      '✅ SDD Autopilot completado',
      '',
      `Repo: ${repo}`,
      `Change: ${change}`,
      `Branch: ${branch}`,
      `Tareas: ${tasks}`,
      'Tests: pass',
      'Review: ✓',
      `Mejoras aplicadas: ${totalImprovements} (apply: ${apply}, test: ${test}, review: ${review})`,
      `Duración: ${duration} min`,
    ].join('\n');

    if (warningList.length > 0) {
      msg += `\n\n⚠️ Warnings (${warningList.length}):\n` + warningList.slice(0, 3).join('\n');
    }

    msg += `\n\nPR: ${pr || 'sin PR (solo push)'}`;
    message = msg;
  } else if (type === 'failure') {
    const {
      repo = '',
      change = '',
      branch = '',
      phase = '',
      lastCommit = '',
      error = '',
    } = opts;

    message = [
      '❌ SDD Autopilot falló',
      '',
      `Repo: ${repo}`,
      `Change: ${change}`,
      `Fase fallida: ${phase}`,
      `Branch: ${branch}`,
      `Último commit: ${lastCommit}`,
      '',
      'Detalle:',
      error,
      '',
      'El árbol de trabajo quedó en su estado actual para revisión.',
    ].join('\n');
  }

  try {
    const result = await postMessage(creds, message);
    if (result.status >= 200 && result.status < 300) {
      appendLog(`kapso notify ${type} sent OK`);
      console.log(`  ✅ Kapso: ${type} notification sent`);
    } else {
      appendLog(`kapso notify ${type} FAILED (HTTP ${result.status}): ${result.body}`);
      console.warn(`  ⚠️  Kapso API error (HTTP ${result.status}): ${result.body}`);
    }
  } catch (err) {
    appendLog(`kapso notify ${type} NETWORK ERROR: ${err.message}`);
    console.warn(`  ⚠️  Kapso network error: ${err.message}`);
  }
}

module.exports = {
  setup,
  preflight,
  notify,
  readCredentials,
  validateNotifyOpts,
  isBlankOrPlaceholder,
  PHONE_REGEX,
};
