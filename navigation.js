/* FRAME / 20 — Home + random picker + complete watchlist and ratings. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const t = (key,vars={}) => window.FrameI18n.t(key,vars);
  const num = value => window.FrameI18n.number(value);
  const keyOf = movie => movie.key || movieKey(movie);
  const PAGE_SIZE=30;
  const views=['home','picker','watchlist','ratings'];
  const library={
    watchlist:{movies:[],offset:0,total:0,hasMore:false,query:'',epoch:0,loading:false,loaded:false},
    ratings:{movies:[],offset:0,total:0,hasMore:false,query:'',epoch:0,loading:false,loaded:false}
  };
  let current='home';
  let filterTimer;

  function isReady(){return app.mode==='live'||app.mode==='demo';}
  function go(view) {
    if(!views.includes(view))view='home';
    current=view;
    for(const panel of ['home','picker','watchlist','ratings']){
      const id=panel==='home'?'home-panel':panel+'-panel';
      $(id)?.classList.toggle('hidden',panel!==view);
    }
    const connect=$('connection-panel');
    if(connect)connect.classList.toggle('hidden',isReady());
    for(const button of document.querySelectorAll('.site-nav-btn')){
      const active=button.dataset.view===view;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if(isReady() && (view==='watchlist'||view==='ratings')){
      const data=library[view];
      if(!data.loaded && !data.loading)void load(view,true);
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function demoRows(type,query) {
    const terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let list=app.demoFilms.map(film=>{
      const key=keyOf(film);
      const selection=app.selected.find(s=>(s.key||movieKey(s))===key);
      const rating=app.demoRatings?.[key];
      return {...film,key,
        priority:selection && validPriority(selection.priority)?Number(selection.priority):null,
        rating:validRating(rating)?Number(rating):null};
    }).filter(movie=>type==='watchlist'?
      validPriority(movie.priority):validRating(movie.rating));
    if(terms.length)list=list.filter(movie=>{
      const corpus=[movie.title,movie.director,movie.year,movie.country].join(' ').toLocaleLowerCase();
      return terms.every(term=>corpus.includes(term));
    });
    list.sort((a,b)=>type==='watchlist'
      ? a.priority-b.priority||a.title.localeCompare(b.title)
      : b.rating-a.rating||a.title.localeCompare(b.title));
    return list;
  }
  function feedback(view,key,vars={}) {
    const el=$(view+'-feedback');
    if(el)el.textContent=key?t(key,vars):'';
  }
  function render(view){
    const state=library[view];
    const list=$(view+'-list');
    list.replaceChildren();
    $(view+'-count').textContent=t('libraryCount',{count:num(state.movies.length),total:num(state.total)});
    $(view+'-more').classList.toggle('hidden',!state.hasMore);
    if(!state.movies.length){
      if(state.loaded)feedback(view,view==='watchlist'?'watchlistEmpty':'ratingsEmpty');
      return;
    }
    feedback(view,'');
    for(const movie of state.movies){
      const row=document.createElement('article');
      row.className='library-entry';
      const posterSlot=document.createElement('div');
      posterSlot.className='library-cover';
      if(window.FramePosters){
        posterSlot.append(window.FramePosters.prepare(posterSlot,movie,{thumbnail:true,scope:view}));
      }
      const index=document.createElement('div');
      index.className='library-rank';
      if(view==='watchlist'){
        index.textContent='#'+num(movie.priority);
      }else{
        index.textContent='★ '+num(movie.rating);
      }
      const details=document.createElement('div');
      details.className='library-details';
      const name=document.createElement('h3');
      name.className='library-title';
      name.textContent=movie.title;
      const sub=document.createElement('div');
      sub.className='library-meta';
      sub.textContent=[movie.director,movie.year,movie.country, movie.runtime?t('runtimeMinutes',{minutes:num(movie.runtime)}):'']
        .filter(Boolean).join(' · ');
      details.append(name,sub);
      const controls=document.createElement('div');
      controls.className='library-actions';
      if(view==='watchlist'){
        if(window.FrameRatings)controls.append(window.FrameRatings.createControls(movie));
        const choice=app.selected.find(s=>(s.key||movieKey(s))===keyOf(movie));
        if(choice){
          const cancel=document.createElement('button');
          cancel.type='button';
          cancel.className='button button-outline button-small library-undo';
          cancel.textContent=t('cancelPick');
          cancel.addEventListener('click',()=>cancelSelection(choice));
          controls.append(cancel);
        }
      }else{
        if(window.FrameRatings)controls.append(window.FrameRatings.createControls(movie));
      }
      row.append(posterSlot,index,details,controls);
      list.append(row);
    }
    if(window.FramePosters && app.mode==='live'){
      // Visible results only. Cached image URLs and poster image bytes are reused.
      void window.FramePosters.lookup(state.movies,app.mode,api,view);
    }
  }

  async function load(view,reset=false) {
    if(!isReady())return go('home');
    const state=library[view];
    if(state.loading && !reset)return;
    const epoch=++state.epoch;
    state.loading=true;
    if(reset){
      state.movies=[];state.offset=0;state.hasMore=false;
      state.loaded=false;
      $(view+'-list').replaceChildren();
    }
    $(view+'-more').disabled=true;
    feedback(view,'libraryLoading');
    try{
      let movies,total,hasMore;
      if(app.mode==='live'){
        const response=await api('library',{
          view,offset:String(state.offset),limit:String(PAGE_SIZE),q:state.query
        },45000);
        movies=response.movies||[];
        total=Number(response.total||0);
        hasMore=Boolean(response.hasMore);
      }else{
        const all=demoRows(view,state.query);
        movies=all.slice(state.offset,state.offset+PAGE_SIZE);
        total=all.length;hasMore=state.offset+movies.length<total;
      }
      if(epoch!==state.epoch)return;
      state.movies.push(...movies);
      state.offset=state.movies.length;
      state.total=total;state.hasMore=hasMore;state.loaded=true;
      render(view);
    }catch(error){
      if(epoch!==state.epoch)return;
      const detail=/Unknown action/i.test(String(error?.message||error))
        ?t('libraryBackendUpgrade'):String(error?.message||error);
      feedback(view,'');
      $(view+'-feedback').textContent=detail;
      if(reset)state.loaded=false;
    }finally{
      if(epoch===state.epoch){
        state.loading=false;
        $(view+'-more').disabled=false;
      }
    }
  }

  function refreshActive(){
    for(const name of ['watchlist','ratings']){
      library[name].loaded=false;
    }
    if(current==='watchlist'||current==='ratings')void load(current,true);
  }
  function translate(){
    for(const name of ['watchlist','ratings']){
      const state=library[name];
      if(state.loaded)render(name);
    }
  }
  function wire(){
    for(const button of document.querySelectorAll('[data-view]')){
      button.addEventListener('click',event=>{
        if(button.closest('.site-nav,.home-tiles')){
          event.preventDefault();
          go(button.dataset.view);
        }
      });
    }
    const brand=document.querySelector('.topbar .brand');
    if(brand)brand.addEventListener('click',event=>{event.preventDefault();go('home');});
    for(const name of ['watchlist','ratings']){
      $(name+'-refresh').addEventListener('click',()=>load(name,true));
      $(name+'-more').addEventListener('click',()=>load(name,false));
      $(name+'-query').addEventListener('input',event=>{
        const q=event.target.value.trim();
        clearTimeout(filterTimer);
        filterTimer=setTimeout(()=>{
          library[name].query=q;
          if(current===name)void load(name,true);
          else library[name].loaded=false;
        },300);
      });
    }
    document.addEventListener('frame20:datachange',refreshActive);
    document.addEventListener('frame20:languagechange',translate);
    go('home');
  }
  window.FrameNavigation={go,load,refreshActive,get current(){return current;}};
  document.addEventListener('DOMContentLoaded',wire);
})();
