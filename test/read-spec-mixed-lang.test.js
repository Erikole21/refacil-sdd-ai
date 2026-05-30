'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('read-spec mixed-lang', () => {
  test('es primary splits English paths and commands', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'Comando CLI refacil-sdd-ai read-spec --file path con lib/bus/broker.js';
    const segs = splitBilingualText(input, 'es');
    assert.ok(segs.length >= 2);
    const langs = segs.map((s) => s.lang);
    assert.ok(langs.includes('es'));
    assert.ok(langs.includes('en'));
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /refacil-sdd-ai/i);
    assert.match(enText, /--file/);
    assert.match(enText, /lib\/bus\/broker\.js/);
  });

  test('en primary returns single segment', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const segs = splitBilingualText('Add refacil-validator to .claude/agents/', 'en');
    assert.equal(segs.length, 1);
    assert.equal(segs[0].lang, 'en');
  });

  test('marks standalone .md filenames as English', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const segs = splitBilingualText('Ver proposal.md y spec.md en el repo.', 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /proposal\.md/);
    assert.match(enText, /spec\.md/);
  });

  test('keeps full refacil-sdd-ai command as one English span', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const segs = splitBilingualText(
      'Ejecuta refacil-sdd-ai read-spec --file refacil-sdd/specs/x/spec.md',
      'es',
    );
    const en = segs.filter((s) => s.lang === 'en');
    assert.ok(en.length >= 1);
    assert.match(en.map((s) => s.text).join(' '), /refacil-sdd-ai read-spec/);
    assert.match(en.map((s) => s.text).join(' '), /spec\.md/);
  });

  test('consolidates to at most MAX_TTS_SEGMENTS with dense mixed text', async () => {
    const { splitBilingualText, MAX_TTS_SEGMENTS } = await import(
      '../lib/spec-reader/ui/mixed-lang.js'
    );
    // Dense text: 20 technical English terms interleaved with Spanish prose.
    const terms = [
      'refacil-sdd-ai', '--verbose', 'lib/spec-reader/ui/app.js', '--file',
      'proposal.md', '/refacil:apply', 'feat-read-spec', '--json',
      'supertonic-helper.js', '--output', 'mixed-lang.js', '--quiet',
      'broker.js', '--port', 'kapso.env', '--format',
      'read-spec.test.js', '--lang', 'refacil-sdd/specs/x/spec.md', '--help',
    ];
    const phrases = [
      'El módulo', 'gestiona los', 'con la opción', 'del directorio',
      'a través de', 'usando el comando', 'se encuentra en', 'el archivo',
      'para configurar', 'en el proyecto', 'mediante el flag', 'en la carpeta',
      'permite ejecutar', 'con soporte para', 'al usar', 'del sistema',
      'que gestiona', 'junto con', 'para el manejo de', 'en producción',
    ];
    const parts = [];
    for (let i = 0; i < terms.length; i++) {
      parts.push(phrases[i % phrases.length]);
      parts.push(terms[i]);
    }
    const segs = splitBilingualText(parts.join(' '), 'es');
    assert.ok(
      segs.length <= MAX_TTS_SEGMENTS,
      `Expected ≤${MAX_TTS_SEGMENTS} segments, got ${segs.length}`,
    );
  });

  test('keeps Spanish around English token', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const segs = splitBilingualText('El paquete refacil-sdd-ai es local.', 'es');
    assert.ok(segs.length >= 2);
    assert.ok(segs.some((s) => s.lang === 'en' && /refacil-sdd-ai/.test(s.text)));
    const esJoined = segs.filter((s) => s.lang === 'es').map((s) => s.text).join(' ');
    assert.match(esJoined, /El paquete/);
    assert.match(esJoined, /es local/);
  });

  test('short Spanish punctuation is absorbed into the adjacent segment', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    // "," between two English flags should not generate its own TTS segment.
    const input = 'Usa los flags --verbose, --quiet, y --output para controlar el nivel de log.';
    const segs = splitBilingualText(input, 'es');
    // A naive split would generate ~9 segments; short-segment absorption should reduce that.
    assert.ok(segs.length <= 6, `Too many segments (${segs.length}); punctuation not absorbed`);
  });

  test('consolidateSegments prefers same-lang merges before cross-lang', async () => {
    const { consolidateSegments } = await import('../lib/spec-reader/ui/mixed-lang.js');
    // Two adjacent ES segments with one EN segment nearby.
    // Reducing from 4 to 3 should merge the same-lang ES pair, preserving EN.
    const segs = [
      { lang: 'es', text: 'El módulo gestiona' },
      { lang: 'en', text: '--verbose' },
      { lang: 'es', text: 'los archivos de configuración' },
      { lang: 'es', text: 'del sistema operativo' },
    ];
    const result = consolidateSegments(segs, 3);
    assert.equal(result.length, 3);
    assert.ok(result.some((s) => s.lang === 'en'), 'English segment must survive same-lang merge');
  });

  test('consolidateSegments keeps Spanish lang for unavoidable cross-lang merges', async () => {
    const { consolidateSegments } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const segs = [
      { lang: 'es', text: 'Configura el sistema con' },
      { lang: 'en', text: '--verbose' },
      { lang: 'es', text: 'para ver los detalles del proceso' },
    ];
    const result = consolidateSegments(segs, 2);
    assert.ok(result.length <= 2);
    result.forEach((s) =>
      assert.equal(s.lang, 'es', `Expected lang=es after cross-lang merge, got ${s.lang}`),
    );
    const allText = result.map((s) => s.text).join(' ');
    assert.match(allText, /Configura/);
    assert.match(allText, /detalles/);
    assert.match(allText, /--verbose/);
  });

  test('detects lexicon terms: endpoint and payload', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'El endpoint recibe el payload de la solicitud.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /endpoint/);
    assert.match(enText, /payload/);
  });

  test('detects snake_case identifiers', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'El campo last_failed_tool_call junto con session_id se almacenan en Redis.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /last_failed_tool_call/);
    assert.match(enText, /session_id/);
  });

  test('detects auth terms: token and jwt', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'El token de autenticación debe ser un jwt válido.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /token/);
    assert.match(enText, /jwt/);
  });

  test('detects infra terms: webhook, queue, broker, middleware, callback, session', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input =
      'El webhook llega al broker, pasa por el middleware, se encola en la queue, el callback actualiza la session.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /webhook/);
    assert.match(enText, /broker/);
    assert.match(enText, /middleware/);
    assert.match(enText, /queue/);
    assert.match(enText, /callback/);
    assert.match(enText, /session/);
  });

  test('detects plural forms: endpoints, webhooks, callbacks', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'Los endpoints exponen webhooks que disparan callbacks al sistema.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /endpoints/);
    assert.match(enText, /webhooks/);
    assert.match(enText, /callbacks/);
  });

  test('Spanish words similar to English terms are not captured', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'El estado del modelo en la cola de mensajes.';
    const segs = splitBilingualText(input, 'es');
    const enSegs = segs.filter((s) => s.lang === 'en');
    assert.equal(enSegs.length, 0, 'No English segments expected for pure Spanish text');
  });

  test('single-segment word does not trigger snake_case pattern', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'la función foo no tiene underscore';
    const segs = splitBilingualText(input, 'es');
    const enSegs = segs.filter((s) => s.lang === 'en');
    assert.equal(enSegs.length, 0, 'foo without underscore must not create an English segment');
  });

  // CA-05: DevOps / VCS terms
  test('detects devops terms: deploy, build, merge, commit, rollback, migration, snapshot', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const terms = ['deploy', 'build', 'merge', 'commit', 'rollback', 'migration', 'snapshot'];
    for (const term of terms) {
      const input = `El proceso de ${term} falló en producción.`;
      const segs = splitBilingualText(input, 'es');
      const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
      assert.match(enText, new RegExp(term), `Expected "${term}" in an lang=en segment`);
    }
  });

  // CA-07: en primary returns single lang=en segment regardless of content
  test('en primary returns single lang=en segment even with Spanish-looking words', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'El estado del modelo es válido en el sistema de sesión.';
    const segs = splitBilingualText(input, 'en');
    assert.equal(segs.length, 1, 'English primary must always return exactly 1 segment');
    assert.equal(segs[0].lang, 'en');
    assert.equal(segs[0].text, input.trim());
  });

  // CA-09 (extended): plural forms sessions and tokens appear in lang=en
  test('detects plural forms: sessions and tokens', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'Las sessions activas tienen tokens de acceso válidos.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(enText, /sessions/, 'sessions must appear in lang=en segment');
    assert.match(enText, /tokens/, 'tokens must appear in lang=en segment');
  });

  // CA-10: 16+ English tech lexicon terms produce ≤ MAX_TTS_SEGMENTS
  test('16+ English tech lexicon terms return at most MAX_TTS_SEGMENTS segments', async () => {
    const { splitBilingualText, MAX_TTS_SEGMENTS } = await import(
      '../lib/spec-reader/ui/mixed-lang.js'
    );
    // 16 lexicon-matched terms interleaved with Spanish prose
    const pairs = [
      ['endpoint', 'El primer'],
      ['payload', 'retorna el'],
      ['token', 'valida el'],
      ['broker', 'enruta el'],
      ['queue', 'encola en la'],
      ['webhook', 'notifica al'],
      ['session', 'gestiona la'],
      ['middleware', 'procesa el'],
      ['callback', 'llama al'],
      ['schema', 'valida el'],
      ['deploy', 'ejecuta el'],
      ['migration', 'aplica la'],
      ['rollback', 'revierte con'],
      ['snapshot', 'guarda el'],
      ['jwt', 'firma el'],
      ['commit', 'registra el'],
    ];
    const parts = pairs.map(([term, prefix]) => `${prefix} ${term}`);
    const input = parts.join(' y ');
    const segs = splitBilingualText(input, 'es');
    assert.ok(
      segs.length <= MAX_TTS_SEGMENTS,
      `Expected ≤${MAX_TTS_SEGMENTS} segments for 16 lexicon terms, got ${segs.length}`,
    );
  });

  // CR-01 (extended): sesión and acción stay in lang=es
  test('sesion and accion remain in lang=es — not captured by lexicon', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'La sesión inicia la acción del sistema.';
    const segs = splitBilingualText(input, 'es');
    const enSegs = segs.filter((s) => s.lang === 'en');
    assert.equal(enSegs.length, 0, 'sesión and acción must NOT produce lang=en segments');
  });

  // CR-02: bare lexicon words (session, token) are detected by lexicon branch, not snake_case
  test('bare session and token are detected by lexicon (not snake_case)', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    // These have no underscores, so must be matched by the lexicon alternation, not snake_case
    const sessionSegs = splitBilingualText('La session expiró.', 'es');
    const sessionEn = sessionSegs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(sessionEn, /session/, 'bare "session" must appear in lang=en segment');

    const tokenSegs = splitBilingualText('El token fue revocado.', 'es');
    const tokenEn = tokenSegs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.match(tokenEn, /token/, 'bare "token" must appear in lang=en segment');
  });

  // CR-03: empty and null text do not throw
  test('empty or null text returns empty-safe result without throwing', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');

    const emptyResult = splitBilingualText('', 'es');
    assert.ok(Array.isArray(emptyResult), 'empty string must return an array');
    if (emptyResult.length > 0) {
      assert.equal(emptyResult[0].lang, 'es');
    }

    const nullResult = splitBilingualText(null, 'es');
    assert.ok(Array.isArray(nullResult), 'null text must return an array');
    if (nullResult.length > 0) {
      assert.equal(nullResult[0].lang, 'es');
    }
  });

  // CR-04: invalid snake_case-like tokens _foo and foo_ are NOT matched
  test('partial underscore tokens _foo and foo_ are not matched by snake_case pattern', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');

    const leadingSegs = splitBilingualText('el valor _foo es inválido', 'es');
    const leadingEn = leadingSegs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.ok(
      !/_foo/.test(leadingEn),
      '"_foo" must NOT be captured by snake_case pattern',
    );

    const trailingSegs = splitBilingualText('el valor foo_ es inválido', 'es');
    const trailingEn = trailingSegs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    assert.ok(
      !/foo_/.test(trailingEn),
      '"foo_" must NOT be captured by snake_case pattern',
    );
  });

  // Finding 2 fix: store is detected as English but acciones (unaccented Spanish plural) stays Spanish
  test('store is detected as English but acciones stays in lang=es', async () => {
    const { splitBilingualText } = await import('../lib/spec-reader/ui/mixed-lang.js');
    const input = 'Las acciones del sistema están en el store.';
    const segs = splitBilingualText(input, 'es');
    const enText = segs.filter((s) => s.lang === 'en').map((s) => s.text).join(' ');
    const esText = segs.filter((s) => s.lang === 'es').map((s) => s.text).join(' ');
    assert.match(enText, /store/, '"store" must appear in lang=en segment');
    assert.ok(!/acciones/.test(enText), '"acciones" must NOT appear in lang=en segment');
    assert.match(esText, /acciones/, '"acciones" must appear in lang=es segment');
  });
});
