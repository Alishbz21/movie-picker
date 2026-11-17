/* FRAME / 20 — free movie artwork from Wikidata + Wikimedia Commons.
 * No API key, private token, or Apps Script update is required.
 * Only freely hosted Commons images are reused; file attribution links are shown.
 */
'use strict';
(function () {
  const CACHE_NAME = 'frame20_commons_posters_v1';
  const VALID_FOR = 21 * 24 * 3600 * 1000;
  const MAX_CONCURRENCY = 3;
  let drawVersion = 0;
  let noticeKey = '';
  const cache = readCache();

  function text(key, vars) {
    return window.FrameI18n ? window.FrameI18n.t(key, vars) : key;
  }
  function readCache() {
    try {
      const item = JSON.parse(localStorage.getItem(CACHE_NAME) || '{}');
      return item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    } catch (_) { return {}; }
  }
  function storeCache() {
    try { localStorage.setItem(CACHE_NAME, JSON.stringify(cache)); } catch (_) {}
  }
  function keyOf(movie) {
    return movie.key || [movie.title,movie.director,String(movie.year)]
      .map(x => String(x ?? '').normalize('NFC').trim().toLowerCase()).join('||');
  }
  function eligibleImage(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org'
        && u.pathname.startsWith('/wikipedia/commons/');
    } catch (_) { return false; }
  }
  function eligibleSource(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.hostname === 'commons.wikimedia.org'
        && u.pathname.startsWith('/wiki/File:');
    } catch (_) { return false; }
  }
  function getCache(key) {
    const found = cache[key];
    if (!found || typeof found.at !== 'number' || Date.now() - found.at > VALID_FOR) return undefined;
    if (found.data === null) return null;
    return found.data && eligibleImage(found.data.url) && eligibleSource(found.data.file)
      ? found.data : undefined;
  }
  function saveCache(key, data) {
    if (data && (!eligibleImage(data.url) || !eligibleSource(data.file))) return;
    cache[key] = {at:Date.now(),data};
  }
  function setNotice(key) {
    noticeKey = key;
    const node = document.getElementById('poster-status');
    if (!node) return;
    node.textContent = key ? text(key) : '';
    node.classList.toggle('hidden', !key);
  }
  function titleNorm(v) {
    return String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/^the\s+/,'');
  }
  function looksLikeSameFilm(result, movie) {
    const want = titleNorm(movie.title);
    const label = titleNorm(result.label);
    const match = titleNorm(result.match?.text);
    const desc = String(result.description || '');
    return Boolean(want) && (label === want || match === want)
      && /\b(film|movie|motion picture|short film|documentary)\b/i.test(desc);
  }
  function firstClaim(entity, property) {
    return (entity?.claims?.[property] || []).filter(c =>
      c?.mainsnak?.snaktype === 'value' && c?.rank !== 'deprecated'
    ).map(c => c.mainsnak.datavalue?.value).filter(v => v != null);
  }
  function matchesYear(entity, year) {
    const expected = Number(year);
    if (!Number.isInteger(expected)) return false;
    const dates = firstClaim(entity,'P577');
    return dates.some(d => {
      const found = /^\+?(\d{3,4})-/.exec(String(d?.time || ''));
      return found && Math.abs(Number(found[1]) - expected) <= 1;
    });
  }
  function cleanCredit(str) {
    // Metadata from Commons may contain HTML markup; use its text only.
    if (!str) return '';
    const doc = new DOMParser().parseFromString(String(str), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g,' ').trim().slice(0,120);
  }
  function endpoint(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    url.searchParams.set('format','json');
    url.searchParams.set('origin','*');
    return url;
  }
  async function json(base, params) {
    const response = await fetch(endpoint(base,params), {mode:'cors',credentials:'omit',cache:'default'});
    if (!response.ok) throw new Error('Wikimedia HTTP ' + response.status);
    return await response.json();
  }
  const WD = 'https://www.wikidata.org/w/api.php';
  const COMMONS = 'https://commons.wikimedia.org/w/api.php';
  async function candidates(movie) {
    // Exact title + film description avoids matching celebrities or similar names.
    const data = await json(WD,{action:'wbsearchentities',search:movie.title,language:'en',limit:14});
    return (data.search || []).filter(x => looksLikeSameFilm(x,movie))
      .slice(0,6).map(x=>x.id).filter(x=>/^Q\d+$/.test(x));
  }
  async function identifyImageFile(movie) {
    const ids = await candidates(movie);
    if (!ids.length) return null;
    const result = await json(WD,{
      action:'wbgetentities',ids:ids.join('|'),props:'claims',languages:'en'
    });
    for (const id of ids) {
      const entity = result.entities?.[id];
      if (!entity || !matchesYear(entity,movie.year)) continue;
      const image = firstClaim(entity,'P18').find(filename =>
        typeof filename === 'string' && /\.(jpe?g|png|webp)$/i.test(filename)
      );
      if (image) return image;
    }
    return null;
  }
  async function imageMetadata(filename) {
    const fileTitle = 'File:' + filename.replace(/_/g,' ');
    const result = await json(COMMONS,{
      action:'query',titles:fileTitle,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:400
    });
    const page = Object.values(result?.query?.pages || {})[0];
    const entry = page?.imageinfo?.[0];
    if (!entry) return null;
    const imageUrl = entry.thumburl || entry.url;
    const fileUrl = entry.descriptionurl ||
      'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(filename.replace(/ /g,'_'));
    if (!eligibleImage(imageUrl) || !eligibleSource(fileUrl)) return null;
    const metadata = entry.extmetadata || {};
    const author = cleanCredit(metadata.Artist?.value);
    const license = cleanCredit(metadata.LicenseShortName?.value || metadata.UsageTerms?.value);
    const licenseUrl = String(metadata.LicenseUrl?.value || '');
    return {
      url:imageUrl,file:fileUrl,
      author,
      license,
      licenseUrl: /^https:\/\//.test(licenseUrl) ? licenseUrl : ''
    };
  }
  function applyData(key,data) {
    if (!data) return;
    for(const card of [...document.querySelectorAll('.film-card')]) {
      if(card.dataset.posterKey !== key) continue;
      const img = card.querySelector('.film-poster-image');
      const credit = card.querySelector('.film-poster-credit');
      if (img && img.getAttribute('src') !== data.url) img.src = data.url;
      if (credit) {
        credit.href=data.file;
        credit.textContent = text('posterAttribution');
        credit.title = [data.author,data.license].filter(Boolean).join(' · ') || text('posterAttribution');
        credit.classList.remove('hidden');
      }
    }
  }
  function prepare(card,movie) {
    const key = keyOf(movie);
    card.dataset.posterKey = key;
    const poster = document.createElement('div');
    poster.className = 'film-poster';
    const art = document.createElement('div');
    art.className = 'film-poster-art';
    const mark = document.createElement('span');
    mark.className = 'film-poster-sigil';
    mark.textContent = '✦';
    const label = document.createElement('span');
    label.className = 'film-poster-edition';
    label.textContent = 'FRAME / 20';
    art.append(mark,label);
    const image = document.createElement('img');
    image.className = 'film-poster-image hidden';
    image.alt = text('posterImageAlt',{title:movie.title});
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load',()=>{image.classList.remove('hidden');poster.classList.add('has-poster');});
    image.addEventListener('error',()=>{image.classList.add('hidden');poster.classList.remove('has-poster');});
    const credit = document.createElement('a');
    credit.className = 'film-poster-credit hidden';
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    poster.append(art,image,credit);
    card.prepend(poster);
    applyData(key,getCache(key));
  }
  async function lookupOne(movie, version) {
    const key = keyOf(movie);
    if (getCache(key) !== undefined) return;
    const filename = await identifyImageFile(movie);
    if (version !== drawVersion) return;
    const data = filename ? await imageMetadata(filename) : null;
    if (version !== drawVersion) return;
    saveCache(key,data);
    applyData(key,data);
  }
  async function lookup(movies) {
    const version = ++drawVersion;
    setNotice('');
    if (!movies || !movies.length) return;
    const missing = movies.filter(m => getCache(keyOf(m)) === undefined);
    if (!missing.length) return;
    setNotice('posterLoading');
    let index = 0;
    let failures = 0;
    const workers = Array.from({length:Math.min(MAX_CONCURRENCY,missing.length)}, async () => {
      while (index < missing.length && version === drawVersion) {
        const movie = missing[index++];
        try { await lookupOne(movie,version); }
        catch (_) { failures++; }
      }
    });
    await Promise.all(workers);
    if(version !== drawVersion)return;
    storeCache();
    setNotice(failures > 0 ? 'posterNetworkError' : '');
  }
  function translate() {
    const note=document.getElementById('poster-status');
    if(note && noticeKey) note.textContent=text(noticeKey);
    for(const card of document.querySelectorAll('.film-card')){
      const img=card.querySelector('.film-poster-image');
      const title=card.querySelector('.film-title')?.textContent;
      if(img && title) img.alt=text('posterImageAlt',{title});
      const credit=card.querySelector('.film-poster-credit');
      if(credit && !credit.classList.contains('hidden'))credit.textContent=text('posterAttribution');
    }
  }
  window.FramePosters={prepare,lookup,translate};
})();
