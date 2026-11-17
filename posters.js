/* FRAME / 20 | On-demand movie posters. Never expose a TMDB API token in public JavaScript. */
'use strict';

(function () {
  const STORAGE = 'frame20_poster_cache_v1';
  const TTL = 30 * 24 * 60 * 60 * 1000;
  const SAFE = /^https:\/\/image\.tmdb\.org\/t\/p\/w500\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;
  let generation = 0;
  const store = loadCache();
  let noticeKey = '';

  function t(key, values) {
    return window.FrameI18n ? window.FrameI18n.t(key, values) : key;
  }
  function loadCache() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(store)); }
    catch (_) { /* Optional browser cache. Live picks and sheet data are unaffected. */ }
  }
  function movieKey(movie) {
    return movie.key || [movie.title, movie.director, String(movie.year)]
      .map(x => String(x ?? '').normalize('NFC').trim().toLocaleLowerCase()).join('||');
  }
  function getCached(key) {
    const item = store[key];
    if (!item || !Number.isFinite(item.time) || Date.now() - item.time > TTL) return undefined;
    return item.url === null || SAFE.test(item.url) ? item.url : undefined;
  }
  function saveCached(key, url) {
    if (url !== null && !SAFE.test(url)) return;
    store[key] = {url, time:Date.now()};
  }
  function setNotice(key) {
    noticeKey = key;
    const note = document.getElementById('poster-status');
    if (!note) return;
    note.textContent = key ? t(key) : '';
    note.classList.toggle('hidden', !key);
  }

  function prepare(card, movie) {
    const key = movieKey(movie);
    card.dataset.posterKey = key;
    const panel = document.createElement('div');
    panel.className = 'film-poster';
    const art = document.createElement('div');
    art.className = 'film-poster-art';
    const sigil = document.createElement('div');
    sigil.className = 'film-poster-sigil';
    sigil.textContent = '✦';
    const edition = document.createElement('span');
    edition.className = 'film-poster-edition';
    edition.textContent = 'FRAME / 20';
    art.append(sigil,edition);
    const image = document.createElement('img');
    image.className = 'film-poster-image hidden';
    image.alt = t('posterImageAlt', {title:movie.title});
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => {
      image.classList.remove('hidden');
      panel.classList.add('has-poster');
    });
    image.addEventListener('error', () => {
      image.classList.add('hidden');
      panel.classList.remove('has-poster');
    });
    panel.append(art,image);
    card.prepend(panel);
    const cached = getCached(key);
    if (cached) image.src = cached;
  }

  function cardsForKey(key) {
    return [...document.querySelectorAll('.film-card')].filter(card => card.dataset.posterKey === key);
  }
  function applyImage(key, url) {
    if (!url || !SAFE.test(url)) return;
    for (const card of cardsForKey(key)) {
      const img = card.querySelector('.film-poster-image');
      if (img && img.src !== url) img.src = url;
    }
  }
  async function lookup(movies, mode, api) {
    const round = ++generation;
    setNotice('');
    if (mode !== 'live' || !movies.length) return;
    const missing = movies.filter(movie => getCached(movieKey(movie)) === undefined);
    if (!missing.length) return;
    setNotice('posterLoading');
    try {
      const keys = missing.map(movieKey);
      const response = await api('posters', {keys: JSON.stringify(keys)}, 70000);
      if (round !== generation) return;
      if (!response.configured) {
        setNotice('posterMissingToken');
        return;
      }
      const posters = response.posters || {};
      for (const movie of missing) {
        const key = movieKey(movie);
        // Don't cache an absent result if the request failed or was partial.
        if (!Object.prototype.hasOwnProperty.call(posters, key)) continue;
        const url = posters[key];
        saveCached(key, url);
        applyImage(key, url);
      }
      persist();
      setNotice('');
    } catch (error) {
      if (round !== generation) return;
      const raw = String(error.message || '');
      setNotice(/Unknown action|posters request/i.test(raw) ? 'posterBackendUpdate' : 'posterNetworkError');
    }
  }
  function translate() {
    const note = document.getElementById('poster-status');
    if (note && noticeKey) note.textContent = t(noticeKey);
    for (const card of document.querySelectorAll('.film-card')) {
      const img = card.querySelector('.film-poster-image');
      const title = card.querySelector('.film-title')?.textContent;
      if (img && title) img.alt = t('posterImageAlt', {title});
    }
  }

  window.FramePosters = {prepare,lookup,translate};
})();
