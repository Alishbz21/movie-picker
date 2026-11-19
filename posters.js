/* FRAME / 20 — TMDB artwork for random draws and saved picks.
 * All TMDB secrets remain exclusively in private Apps Script Script Properties.
 */
'use strict';
(function(){
  const CACHE_KEY='frame20_tmdb_posters_v3';
  const CACHE_POSITIVE_MS=30*24*3600*1000;
  const CACHE_MISS_MS=30*60*1000;
  const POSTER_URL=/^https:\/\/image\.tmdb\.org\/t\/p\/w342\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i;
  const keysInProgress=new Set();
  const scopes={batch:0,history:0};
  const state=loadCache();
  const $=id=>document.getElementById(id);
  const t=(key,values={})=>window.FrameI18n.t(key,values);
  const keyFor=movie=>movie.key||[movie.title,movie.director,String(movie.year)]
    .map(v=>String(v??'').normalize('NFC').trim().toLocaleLowerCase()).join('||');
  const info={batch:{key:'',vars:{}},history:{key:'',vars:{}}};

  function loadCache(){
    try{
      const value=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch(_){return{};}
  }
  function persist(){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(state));}catch(_){}
  }
  function cacheRead(key){
    const record=state[key];
    if(!record||!Number.isFinite(record.at))return undefined;
    if(Date.now()-record.at>(record.url===null?CACHE_MISS_MS:CACHE_POSITIVE_MS))return undefined;
    return record.url===null||POSTER_URL.test(record.url)?record.url:undefined;
  }
  function cacheWrite(key,url){
    if(url!==null&&!POSTER_URL.test(url))return false;
    state[key]={at:Date.now(),url};
    return true;
  }
  function status(scope,key,vars={}){
    info[scope]={key,vars};
    const id=scope==='history'?'history-poster-status':'poster-status';
    const node=$(id);
    if(!node)return;
    node.textContent=key?t(key,vars):'';
    node.classList.toggle('hidden',!key);
  }
  function renderImage(key,url){
    if(!POSTER_URL.test(url||''))return;
    for(const box of document.querySelectorAll('.film-poster[data-film-key]')){
      if(box.dataset.filmKey!==key)continue;
      const image=box.querySelector('.film-poster-image');
      if(image && image.getAttribute('src')!==url)image.src=url;
    }
  }
  function prepare(host,movie,opts={}){
    const key=keyFor(movie);
    const panel=document.createElement('div');
    panel.className='film-poster';
    if(opts.thumbnail)panel.classList.add('film-poster-thumb');
    panel.dataset.filmKey=key;
    const placeholder=document.createElement('div');
    placeholder.className='film-poster-placeholder';
    const glyph=document.createElement('span');
    glyph.className='film-poster-glyph';glyph.textContent='✦';
    const caption=document.createElement('span');
    caption.className='film-poster-caption';caption.textContent='FRAME / 20';
    placeholder.append(glyph,caption);
    const image=document.createElement('img');
    image.className='film-poster-image hidden';
    image.alt=t('posterAlt',{title:movie.title});
    image.loading=opts.thumbnail?'lazy':'eager';
    image.decoding='async';
    image.referrerPolicy='no-referrer';
    image.addEventListener('load',()=>{
      panel.classList.add('has-image');
      image.classList.remove('hidden');
    });
    image.addEventListener('error',()=>{
      panel.classList.remove('has-image');
      image.classList.add('hidden');
      panel.dataset.imageFailed='1';
    });
    panel.append(placeholder,image);
    const fromCache=cacheRead(key);
    if(fromCache)image.src=fromCache;
    if(!opts.thumbnail)host.prepend(panel);
    return panel;
  }
  function uniqueMovies(movies){
    const seen=new Set();
    return (movies||[]).filter(movie=>{
      const key=keyFor(movie);
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  }
  async function lookup(movies,mode,api,scope='batch',force=false){
    if(!Object.prototype.hasOwnProperty.call(scopes,scope))scope='batch';
    const generation=++scopes[scope];
    const unique=uniqueMovies(movies);
    const total=unique.length;
    status(scope,'');
    if(mode!=='live'||!total)return;
    if(force){
      for(const movie of unique)delete state[keyFor(movie)];
      persist();
    }
    const pending=unique.filter(movie=>cacheRead(keyFor(movie))===undefined);
    if(!pending.length){
      const found=unique.filter(movie=>Boolean(cacheRead(keyFor(movie)))).length;
      status(scope,'posterCoverage',{found:window.FrameI18n.number(found),total:window.FrameI18n.number(total)});
      return;
    }
    status(scope,'posterLoading');
    let failures=0;
    for(let i=0;i<pending.length;i+=5){
      if(scopes[scope]!==generation)return;
      const chunk=pending.slice(i,i+5);
      try{
        const response=await api('posters',{keys:JSON.stringify(chunk.map(keyFor))},45000);
        if(scopes[scope]!==generation)return;
        if(response.configured===false){status(scope,'posterNotConfigured');return;}
        if(!response.posters||typeof response.posters!=='object'){
          status(scope,'posterUnexpectedResponse');return;
        }
        for(const movie of chunk){
          const key=keyFor(movie);
          if(!Object.prototype.hasOwnProperty.call(response.posters,key))continue;
          const url=response.posters[key];
          if(cacheWrite(key,url))renderImage(key,url);
        }
        persist();
      }catch(error){
        if(scopes[scope]!==generation)return;
        const msg=String(error?.message||error);
        if(/Unknown action|not found.*posters/i.test(msg)){
          status(scope,'posterBackendUpgrade');return;
        }
        if(/TMDB access rejected|invalid.*token/i.test(msg)){
          status(scope,'posterTokenInvalid');return;
        }
        if(/permission|authorization|scope|DriveApp|UrlFetchApp/i.test(msg)){
          status(scope,'posterPermissionProblem');return;
        }
        if(/Too many|rate limit|HTTP 429/i.test(msg)){
          status(scope,'posterRateLimit');return;
        }
        failures++;
        // Stop on repeated failures, so the site does not silently wait on 4 timeouts.
        if(failures>=2){status(scope,'posterConnectionProblem');return;}
      }
    }
    if(scopes[scope]!==generation)return;
    const found=unique.filter(movie=>Boolean(cacheRead(keyFor(movie)))).length;
    if(failures){
      status(scope,'posterPartialFailure',{found:window.FrameI18n.number(found),
        total:window.FrameI18n.number(total)});
    }else{
      status(scope,'posterCoverage',{found:window.FrameI18n.number(found),
        total:window.FrameI18n.number(total)});
    }
  }
  function translate(){
    for(const scope of Object.keys(info)){
      const data=info[scope];
      if(data.key)status(scope,data.key,data.vars);
    }
    for(const box of document.querySelectorAll('.film-poster[data-film-key]')){
      const img=box.querySelector('img');
      const key=box.dataset.filmKey;
      const card=box.closest('.film-card,.history-entry');
      const title=card?.querySelector('.film-title,.history-title')?.textContent;
      if(img&&title)img.alt=t('posterAlt',{title});
    }
  }
  function retry(movies,mode,api,scope='batch'){
    return lookup(movies,mode,api,scope,true);
  }
  window.FramePosters={prepare,lookup,retry,translate};
})();
