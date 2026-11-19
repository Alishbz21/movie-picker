/* FRAME / 20 — TMDB posters loaded through private Google Apps Script backend.
 * Public files contain neither TMDB API keys nor access tokens.
 */
'use strict';
(function () {
  const CACHE_NAME = 'frame20_tmdb_posters_v2';
  const POSITIVE_TTL = 30*24*3600*1000;
  const NEGATIVE_TTL = 45*60*1000;
  const IMAGE_PATTERN = /^https:\/\/image\.tmdb\.org\/t\/p\/w342\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;
  const caches = readCache();
  let currentLookup = 0;
  let noticeKey = '';
  let noticeVars = {};

  const tr = (key,vars={}) => window.FrameI18n.t(key,vars);
  const normalize = text => String(text ?? '').normalize('NFC').trim().toLocaleLowerCase();
  const filmKey = m => m.key || [m.title,m.director,String(m.year)].map(normalize).join('||');

  function readCache() {
    try {
      const found = JSON.parse(localStorage.getItem(CACHE_NAME) || '{}');
      return found && typeof found === 'object' && !Array.isArray(found) ? found : {};
    } catch (_) { return {}; }
  }
  function saveCache() {
    try {localStorage.setItem(CACHE_NAME,JSON.stringify(caches));} catch (_) {}
  }
  function cached(key) {
    const item = caches[key];
    if (!item || !Number.isFinite(item.at)) return undefined;
    const ttl = item.url === null ? NEGATIVE_TTL : POSITIVE_TTL;
    if (Date.now() - item.at > ttl) return undefined;
    return item.url === null || IMAGE_PATTERN.test(item.url) ? item.url : undefined;
  }
  function store(key,url) {
    if(url !== null && !IMAGE_PATTERN.test(url))return;
    caches[key]={url,at:Date.now()};
  }
  function setNotice(key,vars={}) {
    noticeKey=key;noticeVars=vars;
    const el=document.getElementById('poster-status');
    if(!el)return;
    el.textContent=key?tr(key,vars):'';
    el.classList.toggle('hidden',!key);
  }
  function applyPoster(key,url) {
    if(!IMAGE_PATTERN.test(url || ''))return;
    for(const card of document.querySelectorAll('.film-card')){
      if(card.dataset.movieKey !== key)continue;
      const image=card.querySelector('.film-poster-image');
      if(image && image.getAttribute('src')!==url)image.src=url;
    }
  }
  function prepare(card,movie) {
    const key=filmKey(movie);
    card.dataset.movieKey=key;
    const panel=document.createElement('div');
    panel.className='film-poster';
    const art=document.createElement('div');
    art.className='film-poster-placeholder';
    const symbol=document.createElement('span');
    symbol.className='film-poster-glyph';
    symbol.textContent='✦';
    const caption=document.createElement('span');
    caption.textContent='FRAME / 20';
    caption.className='film-poster-caption';
    art.append(symbol,caption);
    const img=document.createElement('img');
    img.className='film-poster-image hidden';
    img.loading='lazy';
    img.decoding='async';
    img.alt=tr('posterAlt',{title:movie.title});
    img.referrerPolicy='no-referrer';
    img.addEventListener('load',()=>panel.classList.add('has-image') || img.classList.remove('hidden'));
    img.addEventListener('error',()=>{panel.classList.remove('has-image');img.classList.add('hidden');});
    panel.append(art,img);
    card.prepend(panel);
    const previous=cached(key);
    if(previous)img.src=previous;
  }
  async function lookup(movies, mode, api) {
    const generation=++currentLookup;
    setNotice('');
    if(mode!=='live' || !movies?.length)return;
    const missing=movies.filter(m=>cached(filmKey(m))===undefined);
    if(!missing.length)return;
    setNotice('posterLoading');
    let failures=0,hasConfig=true;
    // Five keys per request keeps Apps Script JSONP URLs short.
    const chunks=[];
    for(let i=0;i<missing.length;i+=5)chunks.push(missing.slice(i,i+5));
    for(const group of chunks) {
      if(generation!==currentLookup)break;
      try {
        const response=await api('posters',{keys:JSON.stringify(group.map(filmKey))},45000);
        if(generation!==currentLookup)break;
        if(!response.configured){hasConfig=false;break;}
        for(const movie of group) {
          const key=filmKey(movie);
          if(!Object.prototype.hasOwnProperty.call(response.posters||{},key))continue;
          const url=response.posters[key];
          if(url===null || IMAGE_PATTERN.test(url)){
            store(key,url);
            applyPoster(key,url);
          }
        }
      } catch(error) {
        if(generation!==currentLookup)break;
        failures++;
        const msg=String(error.message||'');
        if(/Unknown action/i.test(msg)){setNotice('posterBackendUpgrade');break;}
        if(/TMDB access rejected/i.test(msg)){setNotice('posterTokenInvalid');break;}
      }
    }
    saveCache();
    if(generation!==currentLookup)return;
    if(noticeKey==='posterBackendUpgrade'||noticeKey==='posterTokenInvalid')return;
    if(!hasConfig){setNotice('posterNotConfigured');return;}
    if(failures){setNotice('posterTemporaryProblem');return;}
    const found=movies.filter(m=>Boolean(cached(filmKey(m)))).length;
    // Report unmatched film count separately; missing poster is not a failed request.
    setNotice(found<movies.length?'posterCoverage':'', {found:window.FrameI18n.number(found),total:window.FrameI18n.number(movies.length)});
  }
  function translate(){
    const el=document.getElementById('poster-status');
    if(el && noticeKey)el.textContent=tr(noticeKey,noticeVars);
    for(const card of document.querySelectorAll('.film-card')){
      const img=card.querySelector('.film-poster-image');
      const title=card.querySelector('.film-title')?.textContent;
      if(img&&title)img.alt=tr('posterAlt',{title});
    }
  }
  window.FramePosters={prepare,lookup,translate};
})();
