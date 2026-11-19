/* FRAME / 20 — persistent browser cache for TMDB poster images.
 * Caches image bytes, not merely image URLs. No Google Sheets or API responses
 * and no private credentials are ever saved by this worker.
 */
'use strict';

const POSTER_CACHE_NAME = 'frame20-poster-images-v1';
const POSTER_CACHE_PREFIX = 'frame20-poster-images-';
const MAX_POSTER_IMAGES = 320;
const POSTER_PATH = /^\/t\/p\/w(?:342|500)\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i;
const downloads = new Map();

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const existing = await caches.keys();
      await Promise.all(existing
        .filter(name => name.startsWith(POSTER_CACHE_PREFIX) && name !== POSTER_CACHE_NAME)
        .map(name => caches.delete(name)));
    } catch (_) {
      // Browsers can disable persistent storage. The site still works online.
    }
    await self.clients.claim();
  })());
});

async function trimPosterCache(cache) {
  const requests = await cache.keys();
  const excess = requests.length - MAX_POSTER_IMAGES;
  if (excess > 0) {
    await Promise.all(requests.slice(0, excess).map(request => cache.delete(request)));
  }
}

async function posterFromCache(request) {
  let cache = null;
  try {
    cache = await caches.open(POSTER_CACHE_NAME);
    const stored = await cache.match(request);
    if (stored) return stored;
  } catch (_) {
    // If Cache Storage is unavailable, fall back to a normal network request.
  }

  // Multiple cards can request the same poster during a draw/history refresh.
  // Share one download rather than hitting TMDB for every card.
  let downloading = downloads.get(request.url);
  if (!downloading) {
    downloading = (async () => {
      const response = await fetch(request);
      // Cross-origin <img> requests may yield opaque responses (status 0).
      // CacheStorage.put() supports opaque responses, unlike cache.add().
      if (cache && (response.ok || response.type === 'opaque')) {
        try {
          await cache.put(request, response.clone());
          await trimPosterCache(cache);
        } catch (_) {
          // Quota and storage errors must never block a poster from loading.
        }
      }
      return response;
    })();
    downloads.set(request.url, downloading);
    downloading.then(
      () => downloads.delete(request.url),
      () => downloads.delete(request.url)
    );
  }
  return (await downloading).clone();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.destination !== 'image') return;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.origin !== 'https://image.tmdb.org' || !POSTER_PATH.test(url.pathname)) return;

  event.respondWith(posterFromCache(request).catch(() => Response.error()));
});
