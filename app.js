/* FRAME / 20 — GitHub Pages client. No Google or GitHub credentials are in source. */
'use strict';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1LJXyVJrWrux99oqgN8OwtHlOCYVWINgDdnKnULEk4j8/edit';
const $ = (id) => document.getElementById(id);
const tr = (key,vars) => window.FrameI18n.t(key,vars);
const localizedNum = (n) => window.FrameI18n.number(n);
const localizedDate = (d) => window.FrameI18n.date(d);
const app = { mode: 'disconnected', endpoint: '', code: '', busy: false, batch: [], chosen: false, selected: [], status: null, demoFilms: [], demoRatings: {}, searchResults: [], lastSearch: '' };

function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
function toast(message) { const node = $('toast'); node.textContent = message; show('toast', true); clearTimeout(toast.timer); toast.timer = setTimeout(() => show('toast', false), 4200); }
function message(text, error = false) { const node = $('picker-message'); node.textContent = text; node.classList.toggle('error', error); show('picker-message', Boolean(text)); }
function setBusy(value) { app.busy = value; ['draw-btn', 'connect-btn'].forEach(id => {$(id).disabled = value;}); document.querySelectorAll('.film-pick').forEach(el => el.disabled = value || app.chosen); document.querySelectorAll('.history-cancel-btn, .rating-save-btn, .rating-select').forEach(el => el.disabled = value); if ($('catalog-search-btn')) $('catalog-search-btn').disabled=value; }
function normalize(text) { return String(text ?? '').normalize('NFC').trim().toLocaleLowerCase(); }
function movieKey(movie) { return [movie.title, movie.director, String(movie.year)].map(normalize).join('||'); }
function validRating(value) { return Number.isFinite(Number(value)) && value !== '' && value !== null && value !== undefined && Number(value) >= 1 && Number(value) <= 10; }
function validPriority(value) { return Number.isInteger(Number(value)) && value !== '' && value !== null && value !== undefined && Number(value) >= 1 && Number(value) <= 1000; }
function random20(films) { const pool = films.slice(); const count = Math.min(20, pool.length); for(let i=0;i<count;i++){const j = i + Math.floor(Math.random() * (pool.length - i)); [pool[i],pool[j]] = [pool[j],pool[i]];} return pool.slice(0,count); }

function api(action, fields = {}, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const name = '__frame20_' + Date.now() + '_' + Math.floor(Math.random()*1e8);
    const script = document.createElement('script');
    const params = new URLSearchParams({action, code:app.code, callback:name, nonce:String(Date.now()), ...fields});
    let settled = false;
    const clean = () => { clearTimeout(timer); script.remove(); try {delete window[name];} catch (_) {window[name] = undefined;} };
    const finish = (err, value) => { if(settled) return; settled=true; clean(); err ? reject(err) : resolve(value); };
    const timer = setTimeout(() => finish(new Error(tr('serverTimeout'))), timeout);
    window[name] = (data) => { if(!data || !data.ok) return finish(new Error(data?.error || tr('serverUnknown'))); finish(null,data); };
    script.onerror = () => finish(new Error(tr('serverConnection')));
    script.src = `${app.endpoint}?${params.toString()}`;
    document.head.appendChild(script);
  });
}

function statusDisplay(s) {
  app.status=s;
  $('priority-count').textContent = localizedNum(s.prioritized ?? 0);
  $('remaining-count').textContent = localizedNum(s.remaining ?? 0);
  $('rated-count').textContent = localizedNum(s.rated ?? 0);
  app.selected = Array.isArray(s.selected) ? s.selected : [];
  renderHistory();
}

async function connect(event) {
  event?.preventDefault();
  const endpoint = $('endpoint-input').value.trim().replace(/\?.*$/, '');
  const code = $('passcode-input').value;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(endpoint)) {
    toast(tr('invalidEndpoint')); return;
  }
  if (code.length < 12) { toast(tr('shortCode')); return; }
  app.endpoint=endpoint; app.code=code;
  setBusy(true);
  try {
    const s=await api('status');
    app.mode='live';
    localStorage.setItem('frame20_endpoint',endpoint);
    sessionStorage.setItem('frame20_code',code);
    statusDisplay(s);
    enterPicker(tr('connected'));
    toast(tr('connectedToast'));
  } catch(e) { toast(e.message); } finally { setBusy(false); }
}

function enterPicker(label) {
  show('connection-panel',false); show('picker-panel',true); show('history-panel',false); show('catalog-panel',false);
  const pill=$('connection-pill'); pill.classList.toggle('connected',app.mode==='live'); pill.classList.toggle('demo',app.mode==='demo');
  $('connection-text').textContent=label;
  $('movie-grid').replaceChildren();
  $('batch-subtitle').textContent=tr('batchReady');
  app.batch=[]; app.chosen=false;
  $('draw-btn').textContent=tr('draw');
  message('');
}

async function startDemo() {
  setBusy(true);
  try {
    const res=await fetch('./films.json', {cache:'no-store'});
    if(!res.ok) throw new Error(tr('demoLoadError'));
    app.demoFilms=await res.json();
    if(!Array.isArray(app.demoFilms)||app.demoFilms.length<20) throw new Error(tr('demoIncomplete'));
    const state=JSON.parse(localStorage.getItem('frame20_demo_state')||'{"selected":[]}');
    app.selected=Array.isArray(state.selected)?state.selected:[];
    try{
      const ratings=JSON.parse(localStorage.getItem('frame20_demo_ratings')||'{}');
      app.demoRatings=ratings&&typeof ratings==='object'&&!Array.isArray(ratings)?ratings:{};
    }catch(_){app.demoRatings={};}
    app.mode='demo';
    refreshDemoStatus(); enterPicker(tr('demoConnected'));
    toast(tr('demoToast'));
  } catch(e){toast(e.message);} finally {setBusy(false);}
}
function refreshDemoStatus() {
  const keys=new Set(app.selected.map(x=>x.key));
  const movies=app.demoFilms;
  const rated=movies.filter(m=>validRating(app.demoRatings[movieKey(m)])).length;
  const prioritized=app.selected.filter(s=>validPriority(s.priority)).length;
  const remaining=movies.filter(m=>!keys.has(movieKey(m)) && !validRating(app.demoRatings[movieKey(m)])).length;
  const selected=app.selected.map(s=>{
    const rating=app.demoRatings[s.key];
    return {...s,isRated:validRating(rating),currentRating:validRating(rating)?Number(rating):null,
      currentPriority:validPriority(s.priority)?Number(s.priority):null};
  });
  statusDisplay({prioritized,remaining,rated,selected});
}
async function draw() {
  if(app.busy)return;
  setBusy(true);message('');$('movie-grid').replaceChildren();
  try {
    const result=app.mode==='live'?await api('draw'):{movies:random20(app.demoFilms.filter(x=>!new Set(app.selected.map(s=>s.key)).has(movieKey(x))&&!validRating(app.demoRatings[movieKey(x)])))};
    app.batch=result.movies||[];app.chosen=false;
    renderMovies(app.batch);
    // Posters are optional, so they load asynchronously after cards appear.
    if (window.FramePosters) void window.FramePosters.lookup(app.batch,app.mode,api);
    const count=app.batch.length;
    $('batch-subtitle').textContent=count ? tr('batchCount',{count:localizedNum(count)}) : tr('allSelected');
    $('draw-btn').textContent=tr('drawAgain');
    if(!count) message(tr('noneEligible'));
  } catch(e){message(e.message,true);}finally{setBusy(false);}
}

function renderMovies(movies) {
  const grid=$('movie-grid');grid.replaceChildren();
  if(!movies.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=tr('emptyMovie');grid.appendChild(empty);return;}
  movies.forEach((movie,i)=>{
    const card=document.createElement('article');card.className='film-card';card.dataset.movieKey=movie.key||movieKey(movie);
    const top=document.createElement('div');top.className='film-top';
    const num=document.createElement('span');num.className='film-number';num.textContent=String(i+1).padStart(2,'0')+' / 20';
    const year=document.createElement('span');year.className='film-year';year.textContent=String(movie.year||'—');top.append(num,year);
    const title=document.createElement('div');title.className='film-title';title.textContent=movie.title;
    const director=document.createElement('div');director.className='film-director';director.textContent=movie.director||'—';
    const details=document.createElement('div');details.className='film-details';details.textContent=[movie.country, movie.runtime ? `${movie.runtime} ${tr('min')}` : ''].filter(Boolean).join(' · ');
    const choose=document.createElement('button');choose.type='button';choose.className='film-pick';choose.textContent=tr('choose');choose.addEventListener('click',()=>pick(movie,card));
    card.append(top,title,director,details);
    if (window.FramePosters) window.FramePosters.prepare(card,movie);
    if(window.FrameRatings) card.append(window.FrameRatings.createControls(movie));
    card.append(choose);
    grid.appendChild(card);
  });
}

async function pick(movie,card) {
  if(app.busy||app.chosen)return;
  setBusy(true);
  try{
    let priority, mirrorWarning='';
    if(app.mode==='live'){
      const result=await api('pick',{key:movie.key},45000);
      priority=result.priority;
      if(result.githubMirror==='failed') mirrorWarning=tr('githubMirrorFailed');
      try {const s=await api('status');statusDisplay(s);} catch (_) {
        // The pick has already been committed; do not invite a second pick.
        app.selected.push(result.movie);
        if (app.status) statusDisplay({...app.status, selected:app.selected, prioritized:(app.status.prioritized||0)+1, remaining:Math.max(0,(app.status.remaining||1)-1)});
        mirrorWarning += tr('statusRefreshFailed');
      }
    }else{
      const used=new Set(app.selected.map(x=>x.priority));priority=1;while(used.has(priority))priority++;
      app.selected.push({key:movieKey(movie),title:movie.title,director:movie.director,year:movie.year,priority,selectedAt:new Date().toISOString()});
      localStorage.setItem('frame20_demo_state',JSON.stringify({version:1,selected:app.selected,updatedAt:new Date().toISOString()}));
      refreshDemoStatus();
    }
    app.chosen=true;card.classList.add('chosen');
    card.querySelector('.film-pick').textContent=tr('chosenPriority',{priority:localizedNum(priority)});
    message(tr('pickSuccess',{title:movie.title,priority:localizedNum(priority),warning:mirrorWarning}));
    toast(tr('pickToast'));
    $('draw-btn').textContent=tr('drawNext');
  }catch(e){message(e.message,true);}finally{setBusy(false);}
}

async function cancelSelection(selection) {
  if (app.busy || app.mode === 'disconnected') return;
  const key = selection.key || movieKey(selection);
  const currentPriority = selection.currentPriority === undefined ? selection.priority : selection.currentPriority;
  const priorityLabel = currentPriority !== null && currentPriority !== undefined ? localizedNum(currentPriority) : '—';
  const prompt = tr('cancelConfirm', {
    title: selection.title,
    priority: priorityLabel,
    note: selection.isRated ? tr('cancelRatedNote') : tr('cancelUnratedNote')
  });
  if (!window.confirm(prompt)) return;

  setBusy(true);
  try {
    let githubMirror = 'not_configured';
    if (app.mode === 'live') {
      const response = await api('cancel', {key}, 45000);
      githubMirror = response.githubMirror;
      statusDisplay(response);
    } else {
      const index = app.selected.findIndex(item => (item.key || movieKey(item)) === key);
      if (index < 0) throw new Error(tr('cancelMissing'));
      const old=app.selected[index].currentPriority ?? app.selected[index].priority;
      const removedPriority = validPriority(old)?Number(old):null;
      app.selected.splice(index, 1);
      if (removedPriority !== null) {
        for (const item of app.selected) {
          if (validPriority(item.priority) && Number(item.priority) > removedPriority) {item.priority = Number(item.priority) - 1;item.currentPriority=item.priority;}
        }
      }
      localStorage.setItem('frame20_demo_state',
        JSON.stringify({version:1, selected:app.selected, updatedAt:new Date().toISOString()}));
      refreshDemoStatus();
    }

    // The previous batch may contain the cancelled film; require a new draw.
    app.batch = [];
    app.chosen = false;
    $('movie-grid').replaceChildren();
    $('batch-subtitle').textContent = tr('batchReady');
    $('draw-btn').textContent = tr('draw');
    const warning = githubMirror === 'failed' ? tr('githubMirrorFailed') : '';
    message(tr('cancelSuccess', {title:selection.title,warning}));
    toast(tr('cancelToast'));
  } catch (err) {
    const issue = /Unknown action/i.test(String(err.message))
      ? tr('cancelBackendUpgrade') : err.message;
    message(issue, true);
    toast(issue);
  } finally {
    setBusy(false);
  }
}

function renderHistory() {
  const el = $('history-list');
  el.replaceChildren();
  const selected = [...app.selected]
    .sort((a,b) => new Date(b.selectedAt||0) - new Date(a.selectedAt||0));
  if (!selected.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = tr('historyEmpty');
    el.appendChild(empty);
    return;
  }
  for (const selection of selected) {
    const row = document.createElement('div');
    row.className = 'history-entry';
    const number = document.createElement('span');
    number.className = 'history-priority';
    number.textContent = selection.isRated ? '✓' :
      selection.currentPriority === null ? '—' :
      '#' + localizedNum(selection.currentPriority ?? selection.priority);

    const details = document.createElement('div');
    details.className = 'history-meta';
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = `${selection.title} (${selection.year}) — ${selection.director}`;
    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = selection.selectedAt ? localizedDate(selection.selectedAt) : '—';
    details.append(title,date);
    if(window.FrameRatings) details.append(window.FrameRatings.createControls(selection));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'history-cancel-btn';
    cancel.textContent = tr('cancelPick');
    cancel.setAttribute('aria-label',tr('cancelPickAria',{title:selection.title}));
    cancel.disabled = app.busy;
    cancel.addEventListener('click', () => cancelSelection(selection));

    row.append(number,details,cancel);
    el.appendChild(row);
  }
}
function exportJson(){
  const state={version:1,selected:app.selected,exportedAt:new Date().toISOString(),note: app.mode==='demo'?'Demo only':'Snapshot; authoritative state is stored alongside the Google Sheet in Drive.'};
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='movie_picker_state.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function disconnect(){app.mode='disconnected';app.code='';app.chosen=false;sessionStorage.removeItem('frame20_code');show('connection-panel',true);show('picker-panel',false);show('history-panel',false);show('catalog-panel',false);$('connection-pill').classList.remove('connected','demo');$('connection-text').textContent=tr('disconnected');$('passcode-input').value='';}
function wire(){
  $('endpoint-input').value=localStorage.getItem('frame20_endpoint')||'';
  $('connect-form').addEventListener('submit',connect);
  $('settings-btn').addEventListener('click', () => $('settings-dialog').showModal());
  const closeSettings = () => $('settings-dialog').close();
  $('settings-close-btn').addEventListener('click',closeSettings);
  $('settings-close-x').addEventListener('click',closeSettings);
  $('settings-dialog').addEventListener('click',event => {
    if(event.target === $('settings-dialog'))closeSettings();
  });
  $('language-select').addEventListener('change',event => window.FrameI18n.setLanguage(event.target.value));
  $('connection-settings-btn').addEventListener('click',()=>{
    closeSettings();disconnect();window.scrollTo({top:0,behavior:'smooth'});
  });
  document.addEventListener('frame20:languagechange', updateLanguage);
  $('demo-btn').addEventListener('click',startDemo);
  $('draw-btn').addEventListener('click',draw);
  $('history-btn').addEventListener('click',()=>{renderHistory();show('history-panel',true);$('history-panel').scrollIntoView({behavior:'smooth',block:'start'});});
  $('close-history-btn').addEventListener('click',()=>show('history-panel',false));
  $('export-btn').addEventListener('click',exportJson);
  const oldCode=sessionStorage.getItem('frame20_code');
  if(oldCode&&$('endpoint-input').value){$('passcode-input').value=oldCode;connect();}
}
function updateLanguage() {
  window.FramePosters?.translate();
  if (app.mode === 'live') $('connection-text').textContent=tr('connected');
  else if (app.mode === 'demo') $('connection-text').textContent=tr('demoConnected');
  else $('connection-text').textContent=tr('disconnected');
  if (app.status) statusDisplay(app.status);
  if (app.mode !== 'disconnected') {
    const count = app.batch.length;
    $('batch-subtitle').textContent = count ? tr('batchCount',{count:localizedNum(count)}) : tr('batchReady');
    $('draw-btn').textContent = app.chosen ? tr('drawNext') : count ? tr('drawAgain') : tr('draw');
    if (count) {
      const selectedCardIndex = [...$('movie-grid').children].findIndex(card=>card.classList.contains('chosen'));
      renderMovies(app.batch);
      if(selectedCardIndex >= 0) {
        const card = $('movie-grid').children[selectedCardIndex];
        card.classList.add('chosen');
        const selected = app.batch[selectedCardIndex];
        const chosenRecord = app.selected.find(s => (s.key || movieKey(s)) === (selected.key || movieKey(selected)));
        card.querySelector('.film-pick').textContent = tr('chosenPriority',{priority:localizedNum(chosenRecord?.currentPriority ?? chosenRecord?.priority ?? '')});
        card.querySelector('.film-pick').disabled = true;
      }
    }
    renderHistory();
    window.FrameRatings?.translate();
  }
}
document.addEventListener('DOMContentLoaded',wire);
