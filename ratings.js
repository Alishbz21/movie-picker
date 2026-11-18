/* FRAME / 20 | Rate movies from random picks, history or the full catalog. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const t = (key,vars={}) => window.FrameI18n.t(key,vars);
  const keyOf = movie => movie.key || movieKey(movie);
  let controlId = 0;

  function demoRating(key) {
    const raw = app.demoRatings?.[key];
    return validRating(raw) ? Number(raw) : null;
  }
  function currentRating(movie) {
    if (app.mode === 'demo') return demoRating(keyOf(movie));
    const raw = movie.currentRating ?? movie.rating;
    return validRating(raw) ? Number(raw) : null;
  }
  function currentPriority(movie) {
    const raw = movie.currentPriority === undefined ? movie.priority : movie.currentPriority;
    return validPriority(raw) ? Number(raw) : null;
  }
  function createControls(movie) {
    const box = document.createElement('div');
    box.className = 'rating-controls';
    const label = document.createElement('label');
    label.className = 'rating-label';
    const id = 'movie-rating-' + (++controlId);
    label.htmlFor = id;
    label.textContent = t('ratingLabel');
    const selector = document.createElement('select');
    selector.id = id;
    selector.className = 'rating-select';
    selector.setAttribute('aria-label',t('ratingAria',{title:movie.title}));
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('ratingUnrated');
    selector.append(empty);
    for(let i=1;i<=10;i++){
      const option=document.createElement('option');
      option.value=String(i);
      option.textContent=window.FrameI18n.number(i)+' / '+window.FrameI18n.number(10);
      selector.append(option);
    }
    const now = currentRating(movie);
    selector.value = now === null ? '' : String(now);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'rating-save-btn';
    save.textContent = t('ratingSave');
    save.addEventListener('click',()=>saveRating(movie,selector.value));
    selector.disabled = app.busy;
    save.disabled = app.busy;
    box.append(label,selector,save);
    return box;
  }
  function saveDemoState() {
    localStorage.setItem('frame20_demo_ratings', JSON.stringify(app.demoRatings || {}));
    localStorage.setItem('frame20_demo_state', JSON.stringify({
      version:1,selected:app.selected,updatedAt:new Date().toISOString()
    }));
  }
  function applyDemoRating(movie, value) {
    const key = keyOf(movie);
    app.demoRatings ||= {};
    if (value === '') delete app.demoRatings[key];
    else app.demoRatings[key]=Number(value);

    const saved=app.selected.find(x => (x.key || movieKey(x))===key);
    if (value !== '' && saved && currentPriority(saved) !== null) {
      const p=currentPriority(saved);
      saved.priority=null; saved.currentPriority=null;
      for(const x of app.selected) {
        if (x === saved) continue;
        const priority=currentPriority(x);
        if (priority !== null && priority>p) {
          x.priority=priority-1;
          x.currentPriority=priority-1;
        }
      }
    }
    saveDemoState();
    refreshDemoStatus();
  }
  function updateAfterRating(movie, rating) {
    const key=keyOf(movie);
    const match = app.searchResults?.find(x=>keyOf(x)===key);
    if(match){
      match.rating=rating;
      if(rating!==null)match.priority=null;
    }
    if(rating !== null){
      app.batch = app.batch.filter(x=>keyOf(x)!==key);
      for(const card of document.querySelectorAll('.film-card')){
        if(card.dataset.movieKey===key)card.remove();
      }
      if(app.batch.length && !app.chosen){
        $('batch-subtitle').textContent=t('batchCount',{count:window.FrameI18n.number(app.batch.length)});
      }
    } else {
      // A previously rated film might still be visible in the search results.
      const selectedRating = document.querySelector('.film-card[data-movie-key="'+CSS.escape(key)+'"] .rating-select');
      if(selectedRating)selectedRating.value='';
    }
    renderCatalogResults();
  }
  async function saveRating(movie, choice) {
    if(app.busy || app.mode==='disconnected')return;
    const value=String(choice);
    if(value!=='' && !/^(?:[1-9]|10)$/.test(value)){
      toast(t('ratingInvalid'));return;
    }
    const previous=currentRating(movie);
    if(value==='' && previous===null){
      toast(t('ratingNothingToClear'));return;
    }
    const p=currentPriority(movie);
    if(value!=='' && p!==null &&
       !window.confirm(t('ratingPriorityWarning',{title:movie.title,priority:window.FrameI18n.number(p)})))return;
    setBusy(true);
    try{
      if(app.mode==='live'){
        const response=await api('rate',{key:keyOf(movie),rating:value},45000);
        statusDisplay(response);
      }else{
        applyDemoRating(movie,value);
      }
      const newValue=value===''?null:Number(value);
      updateAfterRating(movie,newValue);
      toast(newValue===null ? t('ratingCleared',{title:movie.title}) :
        t('ratingSaved',{title:movie.title,rating:window.FrameI18n.number(newValue)}));
    }catch(err){
      const msg=/Unknown action/i.test(String(err.message)) ? t('ratingBackendUpdate') : err.message;
      toast(msg);message(msg,true);
    }finally{
      setBusy(false);
    }
  }

  function renderCatalogResults() {
    const list=$('catalog-results');
    if(!list)return;
    list.replaceChildren();
    const movies=app.searchResults || [];
    if(!movies.length) {
      if(app.lastSearch){
        const empty=document.createElement('div');
        empty.className='empty catalog-empty';
        empty.textContent=t('catalogEmpty');
        list.append(empty);
      }
      return;
    }
    for(const movie of movies){
      const row=document.createElement('article');
      row.className='catalog-entry';
      const info=document.createElement('div');
      info.className='catalog-info';
      const title=document.createElement('div');
      title.className='catalog-title';
      title.textContent=movie.title;
      const desc=document.createElement('div');
      desc.className='catalog-meta';
      desc.textContent=[movie.director,movie.year,movie.country].filter(Boolean).join(' · ');
      info.append(title,desc);
      const priority=currentPriority(movie);
      if(priority!==null){
        const badge=document.createElement('div');
        badge.className='catalog-priority';
        badge.textContent=t('catalogPriority',{priority:window.FrameI18n.number(priority)});
        info.append(badge);
      }
      const rating=createControls(movie);
      row.append(info,rating);
      list.append(row);
    }
  }
  async function search(event) {
    event.preventDefault();
    if(app.busy)return;
    const q=$('catalog-query').value.trim();
    if(q.length<2 || q.length>120){
      $('catalog-results-count').textContent=t('catalogNeedQuery');return;
    }
    setBusy(true);
    $('catalog-results-count').textContent=t('catalogSearching');
    try {
      let movies,totalMatches;
      if(app.mode==='live'){
        const response=await api('search',{q},45000);
        movies=response.movies;
        totalMatches=response.totalMatches;
      }else{
        const terms=q.toLocaleLowerCase().split(/\s+/);
        const all=app.demoFilms.filter(m=>terms.every(term=>
          [m.title,m.director,m.year,m.country].join(' ').toLocaleLowerCase().includes(term)));
        totalMatches=all.length;
        movies=all.slice(0,40).map(m=>({...m,
          key:keyOf(m),rating:demoRating(keyOf(m)),
          priority:app.selected.find(s=>s.key===keyOf(m))?.priority ?? null
        }));
      }
      app.searchResults=Array.isArray(movies)?movies:[];
      app.lastSearch=q;
      $('catalog-results-count').textContent=t('catalogFound',{
        count:window.FrameI18n.number(app.searchResults.length),
        total:window.FrameI18n.number(totalMatches)
      });
      renderCatalogResults();
    }catch(err){
      const msg=/Unknown action/i.test(String(err.message))?t('ratingBackendUpdate'):err.message;
      $('catalog-results-count').textContent=msg;
      toast(msg);
    }finally{setBusy(false)}
  }
  function openCatalog() {
    const panel=$('catalog-panel');
    const willOpen=panel.classList.contains('hidden');
    show('catalog-panel',willOpen);
    if(willOpen) {
      panel.scrollIntoView({behavior:'smooth',block:'start'});
      $('catalog-query').focus({preventScroll:true});
    }
  }
  function closeCatalog(){show('catalog-panel',false);}
  function translate() {
    if(app.mode!=='disconnected')renderCatalogResults();
  }
  function wire(){
    $('catalog-btn').addEventListener('click',openCatalog);
    $('catalog-close-btn').addEventListener('click',closeCatalog);
    $('catalog-search-form').addEventListener('submit',search);
  }
  window.FrameRatings={createControls,renderCatalogResults,translate};
  document.addEventListener('DOMContentLoaded',wire);
})();
