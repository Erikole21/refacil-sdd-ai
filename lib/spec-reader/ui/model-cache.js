/**
 * IndexedDB cache for HuggingFace Supertonic model assets (first download only).
 */

const DB_NAME = 'refacil-read-spec-tts-v1';
const STORE = 'assets';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

/**
 * @param {string} url
 * @returns {Promise<ArrayBuffer | null>}
 */
async function getCached(url) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} url
 * @param {ArrayBuffer} data
 */
async function putCached(url, data) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {
    // ignore cache write failures
  }
}

/**
 * Wrap global fetch to cache Supertone/supertonic-3 assets in IndexedDB.
 * @param {(loaded: number, total: number, label: string) => void} [onProgress]
 */
export function installCachedFetch(onProgress) {
  const nativeFetch = window.fetch.bind(window);
  const hfPrefix = 'huggingface.co/Supertone/supertonic-3';

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes(hfPrefix)) {
      return nativeFetch(input, init);
    }

    if (!navigator.onLine) {
      const cached = await getCached(url);
      if (cached) {
        return new Response(cached, { status: 200, headers: { 'content-type': guessContentType(url) } });
      }
      throw new Error('Internet required for first model download. Connect and reload.');
    }

    const cached = await getCached(url);
    if (cached) {
      if (onProgress) onProgress(1, 1, url.split('/').pop());
      return new Response(cached, { status: 200, headers: { 'content-type': guessContentType(url) } });
    }

    const res = await nativeFetch(input, init);
    if (!res.ok) return res;
    const buf = await res.arrayBuffer();
    await putCached(url, buf);
    if (onProgress) onProgress(1, 1, url.split('/').pop());
    return new Response(buf, { status: 200, headers: { 'content-type': guessContentType(url) } });
  };
}

/**
 * @param {string} url
 * @returns {string}
 */
function guessContentType(url) {
  if (url.endsWith('.json')) return 'application/json';
  if (url.endsWith('.onnx')) return 'application/octet-stream';
  return 'application/octet-stream';
}

export async function hasAnyCachedModel() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}
