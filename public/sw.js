/**
 * Service worker: app-shell precache + runtime caching for scripture and recitation audio.
 *
 * Scope is deliberately narrow:
 *  - The Next.js app shell (the route chrome) is precached on install, and every navigation now
 *    falls back to a cached document (the requested URL, then `/dashboard`, then `/`) or to a
 *    self-contained offline notice. Precaching alone was not enough: only five exact paths were
 *    consulted, so offline navigation to any other route fell through to the browser's error page.
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

/**
 * Whether a response should be stored.
 *
 * `Response.ok` is **false** for an opaque response, whose status is 0. A recitation clip loaded
 * by an `<audio src>` element is a `no-cors` request, so it always comes back opaque — which meant
 * the runtime never cached any audio at all, and only the explicit "Download this surah"
 * postMessage (which fetches with CORS) ever populated the audio cache. Both a real success and an
 * opaque cross-origin response are therefore stored; a genuine failure rejects the fetch rather
 * than resolving with status 0.
 */
function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

/** Stores a response, tolerating the quota and opaque-response rejections `put` can raise. */
async function putIfCacheable(cache, request, response) {
  if (!isCacheable(response)) return;
  try {
    await cache.put(request, response.clone());
  } catch (error) {
    // A full quota or a response the Cache API refuses must not break the request it was
    // fetched for; the learner still gets their verse or clip this time round.
    console.warn('A response could not be cached:', error);
  }
}

/** Network-first: a live response is cached and returned; only a network failure falls back. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    await putIfCacheable(cache, request, response);
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
  await putIfCacheable(cache, request, response);
  return response;
}

/**
 * Offline document served when a navigation cannot reach the network and no page is cached.
 *
 * Deliberately self-contained (inline styles, no fonts, no scripts, and explicitly no Quranic
 * text): it must render from cache storage alone, and it must never be mistaken for scripture.
 */
const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NurulQuran — offline</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8faf9;color:#0f172a}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e2e8f0}}
main{max-width:32rem;padding:2rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .5rem}
p{margin:0 0 1.25rem;line-height:1.6;opacity:.85}
a{display:inline-block;padding:.6rem 1.1rem;border-radius:.75rem;background:#059669;color:#fff;
font-weight:600;text-decoration:none}
</style></head>
<body><main>
<h1>You are offline</h1>
<p>This page has not been saved to this device yet. A surah you have already opened, or the
dashboard, will open without a connection.</p>
<a href="/dashboard">Go to the dashboard</a>
</main></body></html>`;

/**
 * Navigation handler with an offline fallback.
 *
 * Previously only five exact shell URLs were ever consulted, so every other route fell straight
 * through to the network and an offline tap on the reader showed the browser's own error page.
 * A navigation now always gets something renderable: the cached document for that URL, or the
 * dashboard, or a self-contained offline notice.
 */
async function navigationFallback(request) {
  try {
    return await networkFirst(request, SHELL_CACHE);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match(request)) || (await cache.match('/dashboard')) || (await cache.match('/'));
    if (cached) return cached;

    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigations first: they are same-origin documents, and every one of them needs an offline
  // answer, not just the five paths in SHELL_URLS.
  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

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
