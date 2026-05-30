import { installCachedFetch, hasAnyCachedModel } from './model-cache.js';
import {
  loadTextToSpeech,
  loadVoiceStyle,
  writeWavFile,
  AVAILABLE_LANGS,
} from './supertonic-helper.js';
import {
  splitBilingualText,
  MIXED_LANG_GAP_SEC,
  trimTrailingSilence,
  trimLeadingSilence,
  concatWavParts,
} from './mixed-lang.js';

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main';
const ONNX_DIR = `${HF_BASE}/onnx`;
const TOTAL_STEP = 5;

const statusBar = document.getElementById('status-bar');
const sourceMeta = document.getElementById('source-meta');
const sectionsEl = document.getElementById('sections');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const langSelect = document.getElementById('lang-select');
const voiceSelect = document.getElementById('voice-select');
const speedRange = document.getElementById('speed-range');
const speedVal = document.getElementById('speed-val');
const fileSidebar = document.getElementById('file-sidebar');

let sessionData = null;
let textToSpeech = null;
let currentStyle = null;
let currentIndex = 0;
let playing = false;
let paused = false;
let audioCtx = null;
let activeSource = null;
let backendLabel = 'WASM';
let playGeneration = 0;
let pendingPlayIndex = null;
let synthInProgress = false;
/** @type {{ index: number, buffer: AudioBuffer } | null} */
let preparedAudio = null;
let prepareGeneration = 0;
/** Bloquea clics mientras corre prepare + intento de autoplay inicial. */
let startupBusy = false;

// Computed once at module load; CDN script is render-blocking so marked is already available.
const markedAvailable = typeof window !== 'undefined' && typeof window.marked !== 'undefined';
if (markedAvailable) {
  window.marked.use({ gfm: true });
}

function setStatus(msg, isError = false) {
  statusBar.textContent = msg;
  statusBar.className = isError ? 'error' : '';
}

function getSessionId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || params.get('session');
}

/** SDD section titles that sound clearer when spoken with context (Spanish). */
const SPANISH_TITLE_SPOKEN = {
  Alcance: 'El alcance del cambio',
  'Archivos fuera de alcance (doNotTouch)': 'Archivos fuera de alcance',
  Requisitos: 'Requisitos del cambio',
};

function speakableTitle(title) {
  const t = (title || '').trim();
  if (!t) return t;
  const meta = sessionData?.meta || {};
  const isSpanish = meta.lang === 'es' || meta.artifactLanguage === 'spanish';
  if (isSpanish && SPANISH_TITLE_SPOKEN[t]) return SPANISH_TITLE_SPOKEN[t];
  return t;
}

/** Title + body for TTS (title gives context; body lines avoid duplicate #### headings). */
function sectionSpeakText(section) {
  const title = speakableTitle(section.title);
  const body = (section.text || '').trim();
  if (title && body) return `${title}. ${body}`;
  return title || body;
}

async function ensureAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx.state === 'running';
}

function renderSections(sections) {
  sectionsEl.innerHTML = '';

  // T-03: offline fallback if marked.js was not loaded
  if (!markedAvailable) {
    setStatus('marked.js no disponible — mostrando texto plano');
  }

  sections.forEach((sec, i) => {
    const el = document.createElement('article');
    el.className = 'section';
    el.dataset.index = String(i);
    if (sec.title) {
      const h = document.createElement('h2');
      h.textContent = sec.title;
      el.appendChild(h);
    }
    const contentEl = document.createElement('div');
    contentEl.className = 'section-body';
    if (markedAvailable && sec.rawMarkdown) {
      // T-02: render markdown as HTML via marked.parse
      contentEl.innerHTML = window.marked.parse(sec.rawMarkdown);
    } else {
      // CA-06: backward compat fallback to plain text
      contentEl.textContent = sec.text || '';
    }
    el.appendChild(contentEl);
    el.addEventListener('click', () => {
      goToSection(i, true);
    });
    sectionsEl.appendChild(el);
  });
  highlightSection(0);
}

function highlightSection(index) {
  currentIndex = index;
  document.querySelectorAll('.section').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.index) === index);
  });
  const active = document.querySelector(`.section[data-index="${index}"]`);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  prevBtn.disabled = index <= 0;
  nextBtn.disabled = !sessionData || index >= sessionData.sections.length - 1;
}

/**
 * Render the file sidebar for folder-mode sessions.
 * @param {Array<{ name: string, relPath: string, sections: object[] }>} files
 * @param {string} activeFileName
 */
function renderFileSidebar(files, activeFileName) {
  fileSidebar.innerHTML = '';
  fileSidebar.classList.remove('hidden');
  files.forEach((file) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-file-btn';
    btn.textContent = file.name;
    btn.dataset.filename = file.name;
    if (file.name === activeFileName) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      switchToFile(file.name);
    });
    fileSidebar.appendChild(btn);
  });
}

/**
 * Highlight the active file button in the sidebar.
 * @param {string} fileName
 */
function highlightSidebarFile(fileName) {
  fileSidebar.querySelectorAll('.sidebar-file-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filename === fileName);
  });
}

/**
 * Switch the main panel to display sections for the given file name.
 * Mirrors the startup flow: prepare section 0 (with progress) then play from buffer.
 * @param {string} fileName
 */
async function switchToFile(fileName) {
  if (!sessionData || sessionData.mode !== 'folder') return;
  const fileEntry = (sessionData.files || []).find((f) => f.name === fileName);
  if (!fileEntry) return;

  // Stop any in-flight synthesis and playback
  playGeneration += 1;
  invalidatePreparedAudio();
  stopAudio();
  const switchGen = playGeneration;

  // Update session data and UI immediately (sync, no blocking)
  sessionData.sections = fileEntry.sections;
  sessionData.selectedFile = fileName;
  renderSections(fileEntry.sections);
  highlightSidebarFile(fileName);
  sourceMeta.textContent = fileEntry.relPath || fileName;
  nextBtn.disabled = fileEntry.sections.length <= 1;

  if (!textToSpeech || !currentStyle) return;

  try {
    // Prepare section 0 (shows "Preparando…" progress, synthesis runs once)
    const prepared = await prepareSection(0);
    if (playGeneration !== switchGen) return; // user switched to another file while preparing

    if (!prepared) {
      setStatus('Listo. Pulsa Play para iniciar.');
      return;
    }

    // Play from the already-prepared buffer (fast, no re-synthesis)
    await playSection(0);
  } finally {
    // Ensure the Play button is always re-enabled after a file switch
    playBtn.disabled = false;
  }
}

function fillLangSelect(selected) {
  const LABEL = { es: 'Español', en: 'English' };
  langSelect.innerHTML = '';
  for (const code of ['es', 'en']) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = LABEL[code];
    if (code === selected) opt.selected = true;
    langSelect.appendChild(opt);
  }
  langSelect.disabled = true;
}

async function loadVoice(voiceId) {
  const url = `${HF_BASE}/voice_styles/${voiceId}.json`;
  currentStyle = await loadVoiceStyle([url], false);
}

async function initTts(onProgress) {
  installCachedFetch((cur, total, name) => {
    if (onProgress) onProgress(`Downloading model: ${name} (${cur}/${total})`);
  });

  if (!navigator.onLine && !(await hasAnyCachedModel())) {
    throw new Error(
      'Internet connection required for the first Supertonic model download. Connect and reload.',
    );
  }

  if (typeof WebAssembly === 'undefined') {
    throw new Error('This browser does not support WebAssembly required for on-device TTS.');
  }

  let executionProvider = 'wasm';
  try {
    const result = await loadTextToSpeech(
      ONNX_DIR,
      { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' },
      (name, cur, total) => onProgress(`Loading ONNX (${cur}/${total}): ${name}`),
    );
    textToSpeech = result.textToSpeech;
    executionProvider = 'webgpu';
    backendLabel = 'WebGPU';
  } catch (_) {
    const result = await loadTextToSpeech(
      ONNX_DIR,
      { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
      (name, cur, total) => onProgress(`Loading ONNX (${cur}/${total}): ${name}`),
    );
    textToSpeech = result.textToSpeech;
    backendLabel = 'WASM';
  }

  const badge = document.createElement('span');
  badge.id = 'backend-badge';
  badge.textContent = backendLabel;
  statusBar.appendChild(badge);
}

function stopAudio({ keepPaused = false } = {}) {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch (_) {
      // already stopped
    }
    activeSource = null;
  }
  playing = false;
  if (!keepPaused) {
    paused = false;
    playBtn.textContent = 'Play';
  }
}

async function synthesizeTextToBuffer(text, onProgress) {
  const primaryLang = langSelect.value;
  const speed = parseFloat(speedRange.value);
  const segments = splitBilingualText(text, primaryLang).filter((s) => s.text.trim());
  const sampleRate = textToSpeech.sampleRate;
  const multiLang = segments.length > 1;

  /** @type {Float32Array[]} */
  const wavParts = [];
  const gapLen = Math.floor(MIXED_LANG_GAP_SEC * sampleRate);
  const gap = gapLen > 0 ? new Float32Array(gapLen) : null;
  let segNum = 0;

  for (let i = 0; i < segments.length; i++) {
    const { text: segText, lang } = segments[i];
    segNum += 1;
    const isLast = i === segments.length - 1;
    const silenceAfter = multiLang ? 0 : 0.3;
    const { wav, duration } = await textToSpeech.call(
      segText,
      lang,
      currentStyle,
      TOTAL_STEP,
      speed,
      silenceAfter,
      multiLang
        ? (step, total) => {
            if (typeof onProgress === 'function') {
              onProgress(step, total, { index: segNum, total: segments.length });
            }
          }
        : onProgress,
    );
    const rawLen = Math.floor(sampleRate * duration[0]);
    let chunk = trimTrailingSilence(wav.slice(0, rawLen), sampleRate);
    chunk = trimLeadingSilence(chunk); // threshold uses default 0.006 — never pass sampleRate here
    if (chunk.length === 0) continue;
    if (wavParts.length > 0 && gap) {
      wavParts.push(gap);
    }
    wavParts.push(Float32Array.from(chunk));
    if (!multiLang && isLast && silenceAfter > 0) {
      const tailPad = Math.floor(silenceAfter * sampleRate);
      wavParts.push(new Float32Array(tailPad));
    }
  }

  if (wavParts.length === 0) return null;

  const wavOut = concatWavParts(wavParts);
  const wavBuffer = writeWavFile(wavOut, textToSpeech.sampleRate);
  if (!audioCtx) audioCtx = new AudioContext();
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const arrayBuf = await blob.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuf);
}

async function synthesizeSection(index, onProgress) {
  const section = sessionData.sections[index];
  const text = sectionSpeakText(section);
  if (!text) return null;
  return synthesizeTextToBuffer(text, onProgress);
}

async function prepareSection(index, { updateStatus = true } = {}) {
  if (!textToSpeech || !currentStyle || !sessionData) return false;
  const gen = ++prepareGeneration;
  synthInProgress = true;
  if (updateStatus) {
    setStatus(`Preparando sección ${index + 1} de ${sessionData.sections.length}…`);
  }
  try {
    const buffer = await synthesizeSection(index, (step, total, segInfo) => {
      if (!updateStatus) return;
      if (segInfo) {
        setStatus(
          `Preparando audio (${segInfo.index}/${segInfo.total} trozos, paso ${step}/${total})…`,
        );
      } else {
        setStatus(`Preparando audio (${step}/${total})…`);
      }
    });
    if (gen !== prepareGeneration) return false;
    if (!buffer) {
      preparedAudio = null;
      if (index + 1 < sessionData.sections.length) {
        return prepareSection(index + 1, { updateStatus });
      }
      return false;
    }
    preparedAudio = { index, buffer };
    return true;
  } catch (err) {
    if (gen === prepareGeneration) {
      preparedAudio = null;
      if (updateStatus) setStatus(`Error TTS: ${err.message}`, true);
    }
    return false;
  } finally {
    if (gen === prepareGeneration) synthInProgress = false;
  }
}

function invalidatePreparedAudio() {
  prepareGeneration += 1;
  preparedAudio = null;
}

function startBufferPlayback(index, audioBuffer, generation) {
  if (generation !== playGeneration) return false;
  if (activeSource) {
    try {
      activeSource.stop();
    } catch (_) {
      // already stopped
    }
    activeSource = null;
  }
  playing = true;
  paused = false;
  activeSource = audioCtx.createBufferSource();
  activeSource.buffer = audioBuffer;
  activeSource.connect(audioCtx.destination);
  activeSource.onended = () => {
    activeSource = null;
    if (!playing || generation !== playGeneration) return;
    if (index < sessionData.sections.length - 1) {
      playSection(index + 1);
    } else if (sessionData.mode === 'folder') {
      // Auto-advance to the next file in the sidebar
      const files = sessionData.files || [];
      const curFileIdx = files.findIndex((f) => f.name === sessionData.selectedFile);
      const nextFile = files[curFileIdx + 1];
      if (nextFile) {
        switchToFile(nextFile.name);
      } else {
        playing = false;
        playBtn.textContent = 'Play';
        setStatus('Lectura terminada.');
      }
    } else {
      playing = false;
      playBtn.textContent = 'Play';
      setStatus('Lectura terminada.');
    }
  };
  playBtn.textContent = 'Pause';
  setStatus(`Reproduciendo sección ${index + 1} de ${sessionData.sections.length}…`);
  activeSource.start();
  return true;
}

/** Reproduce el buffer ya preparado tras un clic (evita re-sintetizar y solapes). */
async function playPreparedBuffer(index) {
  if (!preparedAudio || preparedAudio.index !== index) {
    return playSection(index);
  }
  const { buffer } = preparedAudio;
  preparedAudio = null;
  pendingPlayIndex = null;
  const generation = ++playGeneration;
  highlightSection(index);
  stopAudio();
  playing = true;
  paused = false;
  const canPlay = await ensureAudioContext();
  if (!canPlay || generation !== playGeneration) {
    preparedAudio = { index, buffer };
    pendingPlayIndex = index;
    playing = false;
    playBtn.textContent = 'Play';
    setStatus('Pulsa Play para iniciar (el navegador requiere un clic).');
    return false;
  }
  return startBufferPlayback(index, buffer, generation);
}

async function playSection(index) {
  if (!textToSpeech || !currentStyle || !sessionData) return false;
  const section = sessionData.sections[index];
  const text = sectionSpeakText(section);
  if (!text) {
    if (index < sessionData.sections.length - 1) {
      return playSection(index + 1);
    }
    return false;
  }

  const generation = ++playGeneration;
  pendingPlayIndex = null;
  highlightSection(index);
  stopAudio();
  playing = true;
  paused = false;

  let audioBuffer = null;
  if (preparedAudio && preparedAudio.index === index) {
    audioBuffer = preparedAudio.buffer;
    preparedAudio = null;
  } else {
    synthInProgress = true;
    setStatus(`Preparando sección ${index + 1} de ${sessionData.sections.length}…`);
    try {
      audioBuffer = await synthesizeSection(index, (step, total) => {
        setStatus(`Preparando audio (${step}/${total})…`);
      });
    } catch (err) {
      synthInProgress = false;
      playing = false;
      playBtn.textContent = 'Play';
      setStatus(`Error TTS: ${err.message}`, true);
      return false;
    }
    synthInProgress = false;
  }

  if (!playing || generation !== playGeneration) return false;
  if (!audioBuffer) {
    if (index < sessionData.sections.length - 1) {
      return playSection(index + 1);
    }
    return false;
  }

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
    // Give the browser one tick to process the resume before checking state.
    // If Chrome allows autoplay it transitions synchronously; if blocked it stays suspended.
    await new Promise((r) => setTimeout(r, 50));
  }

  if (audioCtx.state !== 'running') {
    preparedAudio = { index, buffer: audioBuffer };
    pendingPlayIndex = index;
    playing = false;
    playBtn.textContent = 'Play';
    setStatus('Listo. Pulsa Play para iniciar.');
    return false;
  }

  return startBufferPlayback(index, audioBuffer, generation);
}

function goToSection(index, startPlay) {
  if (!sessionData) return;
  const i = Math.max(0, Math.min(index, sessionData.sections.length - 1));
  playGeneration += 1;
  invalidatePreparedAudio();
  stopAudio();
  highlightSection(i);
  if (startPlay) {
    playing = true;
    playSection(i);
  }
}

playBtn.addEventListener('click', async () => {
  if (!textToSpeech || startupBusy) return;
  if (synthInProgress && !preparedAudio) {
    setStatus('Preparando audio… un momento y vuelve a pulsar Play.');
    return;
  }
  if (playing && activeSource) {
    paused = true;
    stopAudio({ keepPaused: true });
    playBtn.textContent = 'Resume';
    return;
  }
  // Cancela autoplay u otro playSection en vuelo.
  playGeneration += 1;
  stopAudio();

  const idx = pendingPlayIndex !== null ? pendingPlayIndex : currentIndex;
  paused = false;
  if (preparedAudio?.index === idx) {
    await playPreparedBuffer(idx);
    return;
  }
  await playSection(idx);
});

prevBtn.addEventListener('click', () => goToSection(currentIndex - 1, playing));
nextBtn.addEventListener('click', () => goToSection(currentIndex + 1, playing));

speedRange.addEventListener('input', () => {
  speedVal.textContent = speedRange.value;
});

voiceSelect.addEventListener('change', async () => {
  invalidatePreparedAudio();
  try {
    setStatus('Loading voice style…');
    await loadVoice(voiceSelect.value);
    setStatus('Voz actualizada. Preparando sección…');
    await prepareSection(currentIndex);
    setStatus('Listo. Pulsa Play.');
  } catch (err) {
    setStatus(`Voice load failed: ${err.message}`, true);
  }
});

langSelect.addEventListener('change', () => {
  invalidatePreparedAudio();
});

speedRange.addEventListener('change', () => {
  speedVal.textContent = speedRange.value;
  invalidatePreparedAudio();
});

async function main() {
  const sessionId = getSessionId();
  if (!sessionId) {
    setStatus('Missing session id in URL (?id=…)', true);
    return;
  }

  try {
    const res = await fetch(`/api/read-spec/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(err.error || `Session not found (${res.status})`, true);
      return;
    }
    sessionData = await res.json();

    // Normalize mode: sessions without 'mode' field are treated as "file" (backward compat)
    if (!sessionData.mode) sessionData.mode = 'file';

    if (sessionData.mode === 'folder') {
      // Folder mode: show sidebar and load sections for selected file
      const files = sessionData.files || [];
      const selectedFileName = sessionData.selectedFile || (files[0] && files[0].name) || '';
      const selectedFile = files.find((f) => f.name === selectedFileName) || files[0];
      if (selectedFile) {
        sessionData.sections = selectedFile.sections;
        sourceMeta.textContent = selectedFile.relPath || selectedFileName;
      } else {
        sourceMeta.textContent = sessionData.sourcePath || 'spec';
      }
      renderSections(sessionData.sections || []);
      renderFileSidebar(files, selectedFileName);
    } else {
      // File mode: no sidebar
      sourceMeta.textContent = sessionData.sourcePath || 'spec';
      renderSections(sessionData.sections || []);
    }

    const meta = sessionData.meta || {};
    fillLangSelect(meta.lang || 'es');
    voiceSelect.value = meta.voice || 'M3';
    speedRange.value = String(meta.speed ?? 1);
    speedVal.textContent = speedRange.value;

    setStatus('Loading TTS model (first visit may take several minutes)…');
    await initTts((msg) => setStatus(msg));
    await loadVoice(voiceSelect.value);

    playBtn.textContent = 'Play';
    nextBtn.disabled = sessionData.sections.length <= 1;

    startupBusy = true;
    try {
      const prepared = await prepareSection(0);
      if (!prepared) {
        setStatus('Listo. Pulsa Play para iniciar la lectura.');
        return;
      }

      setStatus('Iniciando lectura automática…');
      const started = await playSection(0);
      if (!started) {
        setStatus('Listo. Pulsa Play (el audio ya está preparado; el navegador exige un clic).');
      }
    } finally {
      startupBusy = false;
      playBtn.disabled = false;
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
    startupBusy = false;
    playBtn.disabled = false;
  }
}

main();
