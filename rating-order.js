/* FRAME / 20 — manual ordering within identical rating groups.
 * Temporary drag/drop and keyboard-friendly movement; commit only via Save Order.
 */
'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const t=(key,vars={})=>window.FrameI18n.t(key,vars);
  const format=n=>window.FrameI18n.number(n);
  const group={rating:10,movies:[],snapshot:'',dirty:false,busy:false,loaded:false};
  let generation=0,dragFrom=-1;
  function showFeedback(key,vars={},bad=false){
    const node=$('rating-rank-feedback');
    if(!node)return;
    node.textContent=key?t(key,vars):'';
    node.classList.toggle('error',!!bad);
  }
  function controls(){
    $('rating-rank-save').disabled=group.busy || !group.dirty || !group.movies.length;
    $('rating-rank-cancel').disabled=group.busy || !group.dirty;
    $('rating-rank-refresh').disabled=group.busy;
    $('rating-rank-group').disabled=group.busy;
    $('rating-rank-count').textContent=group.loaded?
      t('rankCount',{count:format(group.movies.length),rating:format(group.rating)}):'';
  }
  function move(from,to){
    if(group.busy||from===to||from<0||to<0||from>=group.movies.length||to>=group.movies.length)return;
    const item=group.movies.splice(from,1)[0];
    group.movies.splice(to,0,item);
    group.dirty=true;
    render();
  }
  function render(){
    controls();
    const list=$('rating-rank-list');
    list.replaceChildren();
    if(!group.movies.length){
      if(group.loaded)showFeedback('rankEmpty',{rating:format(group.rating)});
      return;
    }
    showFeedback(group.dirty?'rankUnsaved':'rankInstructions');
    for(let i=0;i<group.movies.length;i++){
      const film=group.movies[i];
      const row=document.createElement('div');
      row.className='ranking-row';
      row.dataset.index=String(i);
      row.draggable=!group.busy;
      const grip=document.createElement('span');
      grip.className='ranking-drag-icon';
      grip.textContent='⠿';
      grip.setAttribute('aria-hidden','true');
      const ordinal=document.createElement('span');
      ordinal.className='ranking-position';
      ordinal.textContent=format(i+1);
      const details=document.createElement('div');
      details.className='ranking-film-meta';
      const title=document.createElement('div');
      title.className='ranking-title';
      title.textContent=film.title;
      const sub=document.createElement('div');
      sub.className='ranking-subtitle';
      sub.textContent=[film.director,film.year].filter(Boolean).join(' · ');
      details.append(title,sub);
      const actions=document.createElement('div');
      actions.className='ranking-actions';
      const up=document.createElement('button');
      up.type='button';up.className='ranking-arrow';
      up.textContent='↑';up.disabled=i===0 || group.busy;
      up.setAttribute('aria-label',t('rankMoveUp',{title:film.title}));
      up.addEventListener('click',()=>move(i,i-1));
      const down=document.createElement('button');
      down.type='button';down.className='ranking-arrow';
      down.textContent='↓';down.disabled=i===group.movies.length-1 || group.busy;
      down.setAttribute('aria-label',t('rankMoveDown',{title:film.title}));
      down.addEventListener('click',()=>move(i,i+1));
      const jump=document.createElement('input');
      jump.type='number';jump.className='ranking-jump';
      jump.min='1';jump.max=String(group.movies.length);jump.step='1';jump.value=String(i+1);
      jump.disabled=group.busy;
      jump.setAttribute('aria-label',t('rankMoveTo',{title:film.title}));
      jump.title=t('rankMoveTo',{title:film.title});
      jump.addEventListener('change',()=>{
        const dest=Number(jump.value);
        if(Number.isInteger(dest)&&dest>=1&&dest<=group.movies.length)move(i,dest-1);
        else jump.value=String(i+1);
      });
      actions.append(up,down,jump);
      row.append(grip,ordinal,details,actions);
      row.addEventListener('dragstart',event=>{
        if(group.busy)return event.preventDefault();
        dragFrom=i;row.classList.add('ranking-dragging');
        if(event.dataTransfer){
          event.dataTransfer.effectAllowed='move';
          event.dataTransfer.setData('text/plain',String(i));
        }
      });
      row.addEventListener('dragover',event=>{
        if(group.busy||dragFrom<0)return;
        event.preventDefault();row.classList.add('ranking-drop-target');
      });
      row.addEventListener('dragleave',()=>row.classList.remove('ranking-drop-target'));
      row.addEventListener('drop',event=>{
        event.preventDefault();
        const from=dragFrom;dragFrom=-1;
        move(from,i);
      });
      row.addEventListener('dragend',()=>{
        dragFrom=-1;
        for(const element of list.children)element.classList.remove('ranking-dragging','ranking-drop-target');
      });
      list.append(row);
    }
  }
  function demoGroup(rating){
    const items=app.demoFilms.filter(movie=>Number(app.demoRatings?.[movieKey(movie)])===rating)
      .map(movie=>({...movie,key:movieKey(movie),rating}));
    const saved=readDemoRanks();
    items.sort((a,b)=>(saved[a.key]?.rating===rating?saved[a.key].rank:Infinity)-
      (saved[b.key]?.rating===rating?saved[b.key].rank:Infinity)||
      Number(a.year)-Number(b.year)||a.title.localeCompare(b.title));
    return {rating,movies:items,snapshot:'demo'};
  }
  function readDemoRanks(){
    try{return JSON.parse(localStorage.getItem('frame20_demo_rating_ranks')||'{}')||{};}
    catch(_){return {};}
  }
  async function loadRating(rating,confirmDirty=true){
    const selected=Number(rating);
    if(!Number.isInteger(selected)||selected<1||selected>10)return;
    if(confirmDirty&&group.dirty&&!window.confirm(t('rankDiscardWarning'))){
      $('rating-rank-group').value=String(group.rating);
      return;
    }
    const id=++generation;
    group.rating=selected;group.movies=[];group.dirty=false;group.loaded=false;group.busy=true;
    $('rating-rank-group').value=String(selected);
    $('rating-rank-list').replaceChildren();
    showFeedback('rankLoading');
    controls();
    try{
      const result=app.mode==='live'
        ?await api('rank_group',{rating:String(selected)},45000):demoGroup(selected);
      if(id!==generation)return;
      group.movies=result.movies||[];
      group.snapshot=result.snapshot||'';
      group.loaded=true;
      group.dirty=false;
      render();
    }catch(error){
      if(id!==generation)return;
      const message=/Unknown action/i.test(String(error?.message||error))
        ?t('rankBackendUpgrade'):String(error.message||error);
      $('rating-rank-feedback').textContent=message;
      $('rating-rank-feedback').classList.add('error');
    }finally{
      if(id===generation){group.busy=false;controls();}
    }
  }
  async function save(){
    if(group.busy||!group.dirty||!group.movies.length)return;
    group.busy=true;controls();
    showFeedback('rankSaving');
    try{
      if(app.mode==='live'){
        await api('save_ranks',{rating:String(group.rating),
          rows:JSON.stringify(group.movies.map(movie=>movie.row)),snapshot:group.snapshot},45000);
      }else{
        const saved=readDemoRanks();
        group.movies.forEach((film,i)=>{saved[film.key]={rating:group.rating,rank:i+1};});
        localStorage.setItem('frame20_demo_rating_ranks',JSON.stringify(saved));
      }
      group.dirty=false;
      await window.FrameNavigation.load('ratings',true);
      await loadRating(group.rating,false);
      toast(t('rankSaved'));
    }catch(error){
      const message=/Unknown action/i.test(String(error?.message||error))?
        t('rankBackendUpgrade'):String(error.message||error);
      $('rating-rank-feedback').textContent=message;
      $('rating-rank-feedback').classList.add('error');
    }finally{
      group.busy=false;controls();
    }
  }
  function open(){
    if(app.mode==='disconnected'){toast(t('rankConnectFirst'));return;}
    const panel=$('rating-rank-editor');
    if(!panel.classList.contains('hidden')){panel.classList.add('hidden');return;}
    panel.classList.remove('hidden');
    $('rating-rank-editor').scrollIntoView({behavior:'smooth',block:'start'});
    if(!group.loaded)void loadRating(group.rating,false);
    else render();
  }
  function wire(){
    $('rating-rank-open').addEventListener('click',open);
    $('rating-rank-group').addEventListener('change',event=>loadRating(event.target.value));
    $('rating-rank-save').addEventListener('click',save);
    $('rating-rank-cancel').addEventListener('click',()=>loadRating(group.rating,false));
    $('rating-rank-refresh').addEventListener('click',()=>loadRating(group.rating));
    $('rating-rank-close').addEventListener('click',()=>{
      if(group.dirty&&!window.confirm(t('rankDiscardWarning')))return;
      $('rating-rank-editor').classList.add('hidden');
      group.dirty=false;group.loaded=false;
    });
    document.addEventListener('frame20:datachange',()=>{
      group.loaded=false;
      if(!$('rating-rank-editor').classList.contains('hidden')&&!group.dirty)
        void loadRating(group.rating,false);
    });
    document.addEventListener('frame20:languagechange',()=>{
      if(group.loaded)render();
      else controls();
    });
  }
  document.addEventListener('DOMContentLoaded',wire);
})();
