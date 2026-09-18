/**
 * Service worker: app-shell precache + runtime caching for scripture and recitation audio.
 *
 * Scope is deliberately narrow:
 *  - The Next.js app shell (the route chrome) is precached on install so the app opens
 *    with zero network once it has been visited online.
 *  - Scripture API responses (api.alquran.cloud, plus api.quran.com, which the lessons
 *    use to locate a quoted phrase in the Mus'haf before playing it) and recitation audio
 *    (cdn.islamic.network, audio.qurancdn.com, verses.quran.com) are cached on demand,
 *    network-first with a cache fallback, so a verse read once is still readable offline —
 *    but a network response always wins when it is available, since the text service is
 *    the source of truth.
 *  - Everything else (Gemini API calls, BYOK providers, tafsir CDNs) is left to the
 *    network: the invariant "never substitute a verse" extends to "never serve a stale
 *    AI response either".
 *
 * "Download this surah" in the app calls `cacheSurahAudio`/`cacheSurahText` via
 * postMessage rather than this file reaching into IndexedDB directly, so the cache
 * boundary stays simple: the service worker owns the Cache Storage API, the app owns
 * IndexedDB.
 */

const SHELL_CACHE = 'nurulquran-shell-v1';
const SCRIPTURE_CACHE = 'nurulquran-scripture-v1';
const AUDIO_CACHE = 'nurulquran-audio-v1';
const CURRENT_CACHES = [SHELL_CACHE, SCRIPTURE_CACHE, AUDIO_CACHE];

const SHELL_URLS = ['/', '/dashboard', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

const SCRIPTURE_HOSTS = ['api.alquran.cloud', 'api.quran.com'];
const AUDIO_HOSTS = ['cdn.islamic.network', 'audio.qurancdn.com', 'verses.quran.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined) // A shell URL failing to precache must not block install.
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isScriptureRequest(url) {
  return SCRIPTURE_HOSTS.includes(url.hostname);
}

function isAudioRequest(url) {
  return AUDIO_HOSTS.includes(url.hostname);
}

/** Network-first: a live response is cached and returned; only a network failure falls back. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

/** Cache-first for immutable audio clips: once downloaded, a clip never changes. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isScriptureRequest(url)) {
    event.respondWith(networkFirst(request, SCRIPTURE_CACHE));
    return;
  }
  if (isAudioRequest(url)) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }
  if (url.origin === self.location.origin && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});

/**
 * On-demand caching driven by the app: `{ type: 'cache-urls', cacheName, urls }` warms
 * a set of audio URLs ahead of time ("Download this surah"), and `{ type: 'evict',
 * cacheName, urls }` removes them ("Remove download"). Progress is reported back per URL
 * so the UI can show a real download bar instead of a spinner with no feedback.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'cache-urls' && Array.isArray(data.urls)) {
    const cacheName = data.cacheName === 'scripture' ? SCRIPTURE_CACHE : AUDIO_CACHE;
    const requestId = data.requestId;
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        let done = 0;
        for (const url of data.urls) {
          try {
            const existing = await cache.match(url);
            if (!existing) {
              const response = await fetch(url);
              if (response && response.ok) await cache.put(url, response);
            }
          } catch {
            // One failed clip must not abort the whole download; the app can retry.
          }
          done += 1;
          for (const client of await self.clients.matchAll()) {
            client.postMessage({ type: 'download-progress', requestId, done, total: data.urls.length });
          }
        }
        for (const client of await self.clients.matchAll()) {
          client.postMessage({ type: 'download-complete', requestId });
        }
      })()
    );
  }

  if (data.type === 'evict' && Array.isArray(data.urls)) {
    const cacheName = data.cacheName === 'scripture' ? SCRIPTURE_CACHE : AUDIO_CACHE;
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        await Promise.all(data.urls.map((url) => cache.delete(url)));
      })()
    );
  }
});
