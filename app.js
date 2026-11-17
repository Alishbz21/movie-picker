/* FRAME / 20 — GitHub Pages client. No Google or GitHub credentials are in source. */
'use strict';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1LJXyVJrWrux99oqgN8OwtHlOCYVWINgDdnKnULEk4j8/edit';
const $ = (id) => document.getElementById(id);
const app = { mode: 'disconnected', endpoint: '', code: '', busy: false, batch: [], chosen: false, selected: [], status: null, demoFilms: [] };

function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
function toast(message) { const node = $('toast'); node.textContent = message; show('toast', true); clearTimeout(toast.timer); toast.timer = setTimeout(() => show('toast', false), 4200); }
function message(text, error = false) { const node = $('picker-message'); node.textContent = text; node.classList.toggle('error', error); show('picker-message', Boolean(text)); }
function setBusy(value) { app.busy = value; ['draw-btn', 'connect-btn'].forEach(id => {$(id).disabled = value;}); document.querySelectorAll('.film-pick').forEach(el => el.disabled = value || app.chosen); }
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
    const timer = setTimeout(() => finish(new Error('پاسخی از سرور دریافت نشد. آدرس Web App و دسترسی به آن را بررسی کن.')), timeout);
    window[name] = (data) => { if(!data || !data.ok) return finish(new Error(data?.error || 'خطای نامشخص سرور')); finish(null,data); };
    script.onerror = () => finish(new Error('اتصال به Apps Script برقرار نشد. URL یا تنظیمات انتشار را بررسی کن.'));
    script.src = `${app.endpoint}?${params.toString()}`;
    document.head.appendChild(script);
  });
}

function statusDisplay(s) {
  app.status=s;
  $('priority-count').textContent = new Intl.NumberFormat('fa-IR').format(s.prioritized ?? 0);
  $('remaining-count').textContent = new Intl.NumberFormat('fa-IR').format(s.remaining ?? 0);
  $('rated-count').textContent = new Intl.NumberFormat('fa-IR').format(s.rated ?? 0);
  app.selected = Array.isArray(s.selected) ? s.selected : [];
  renderHistory();
}

async function connect(event) {
  event?.preventDefault();
  const endpoint = $('endpoint-input').value.trim().replace(/\?.*$/, '');
  const code = $('passcode-input').value;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(endpoint)) {
    toast('لطفاً آدرس /exec مربوط به Apps Script را وارد کن.'); return;
  }
  if (code.length < 12) { toast('کد دسترسی باید حداقل ۱۲ کاراکتر باشد.'); return; }
  app.endpoint=endpoint; app.code=code;
  setBusy(true);
  try {
    const s=await api('status');
    app.mode='live';
    localStorage.setItem('frame20_endpoint',endpoint);
    sessionStorage.setItem('frame20_code',code);
    statusDisplay(s);
    enterPicker('متصل به Google Sheets');
    toast('اتصال برقرار شد؛ فیلم‌ها و اولویت‌ها زنده هستند.');
  } catch(e) { toast(e.message); } finally { setBusy(false); }
}

function enterPicker(label) {
  show('connection-panel',false); show('picker-panel',true); show('history-panel',false);
  const pill=$('connection-pill'); pill.classList.toggle('connected',app.mode==='live'); pill.classList.toggle('demo',app.mode==='demo');
  $('connection-text').textContent=label;
  $('movie-grid').replaceChildren();
  $('batch-subtitle').textContent='برای دیدن ۲۰ گزینهٔ تصادفی، دکمهٔ نمایش فیلم‌ها را بزن.';
  app.batch=[]; app.chosen=false;
  $('draw-btn').textContent='🎲 نمایش ۲۰ فیلم';
  message('');
}

async function startDemo() {
  setBusy(true);
  try {
    const res=await fetch('./films.json', {cache:'no-store'});
    if(!res.ok) throw new Error('دادهٔ نمونه بارگذاری نشد. سایت را از یک وب‌سرور باز کن.');
    app.demoFilms=await res.json();
    if(!Array.isArray(app.demoFilms)||app.demoFilms.length<20) throw new Error('فایل دادهٔ نمایشی ناقص است.');
    const state=JSON.parse(localStorage.getItem('frame20_demo_state')||'{"selected":[]}');
    app.selected=Array.isArray(state.selected)?state.selected:[];
    app.mode='demo';
    refreshDemoStatus(); enterPicker('حالت نمایشی (بدون اتصال)');
    toast('حالت نمایشی فعال شد؛ تغییرات وارد Google Sheets نمی‌شوند.');
  } catch(e){toast(e.message);} finally {setBusy(false);}
}
function refreshDemoStatus() {
  const keys=new Set(app.selected.map(x=>x.key));
  statusDisplay({prioritized:app.selected.length,remaining:app.demoFilms.filter(x=>!keys.has(movieKey(x))).length,rated:0,selected:app.selected});
}
async function draw() {
  if(app.busy)return;
  setBusy(true);message('');$('movie-grid').replaceChildren();
  try {
    const result=app.mode==='live'?await api('draw'):{movies:random20(app.demoFilms.filter(x=>!new Set(app.selected.map(s=>s.key)).has(movieKey(x))))};
    app.batch=result.movies||[];app.chosen=false;
    renderMovies(app.batch);
    const count=app.batch.length;
    $('batch-subtitle').textContent=count ? `از میان ${new Intl.NumberFormat('fa-IR').format(count)} فیلم یکی را انتخاب کن. با انتخاب، فیلم به انتهای اولویت‌های فعلی اضافه می‌شود.` : 'همهٔ فیلم‌های واجد شرایط انتخاب شده‌اند!';
    $('draw-btn').textContent='🎲 ۲۰ فیلم تصادفی دیگر';
    if(!count) message('فیلم بدون امتیاز و بدون اولویت دیگری باقی نمانده است.');
  } catch(e){message(e.message,true);}finally{setBusy(false);}
}

function renderMovies(movies) {
  const grid=$('movie-grid');grid.replaceChildren();
  if(!movies.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='فیلمی برای پیشنهاد باقی نمانده است.';grid.appendChild(empty);return;}
  movies.forEach((movie,i)=>{
    const card=document.createElement('article');card.className='film-card';
    const top=document.createElement('div');top.className='film-top';
    const num=document.createElement('span');num.className='film-number';num.textContent=String(i+1).padStart(2,'0')+' / 20';
    const year=document.createElement('span');year.className='film-year';year.textContent=String(movie.year||'—');top.append(num,year);
    const title=document.createElement('div');title.className='film-title';title.textContent=movie.title;
    const director=document.createElement('div');director.className='film-director';director.textContent=movie.director||'—';
    const details=document.createElement('div');details.className='film-details';details.textContent=[movie.country, movie.runtime ? `${movie.runtime} min` : ''].filter(Boolean).join(' · ');
    const choose=document.createElement('button');choose.type='button';choose.className='film-pick';choose.textContent='انتخاب این فیلم ←';choose.addEventListener('click',()=>pick(movie,card));
    card.append(top,title,director,details,choose);grid.appendChild(card);
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
      if(result.githubMirror==='failed') mirrorWarning=' (ذخیرهٔ GitHub موفق نشد؛ نسخهٔ Drive محفوظ است)';
      try {const s=await api('status');statusDisplay(s);} catch (_) {
        // The pick has already been committed; do not invite a second pick.
        app.selected.push(result.movie);
        if (app.status) statusDisplay({...app.status, selected:app.selected, prioritized:(app.status.prioritized||0)+1, remaining:Math.max(0,(app.status.remaining||1)-1)});
        mirrorWarning += ' (به‌روزرسانی آمار با بارگذاری دوباره انجام می‌شود)';
      }
    }else{
      const used=new Set(app.selected.map(x=>x.priority));priority=1;while(used.has(priority))priority++;
      app.selected.push({key:movieKey(movie),title:movie.title,director:movie.director,year:movie.year,priority,selectedAt:new Date().toISOString()});
      localStorage.setItem('frame20_demo_state',JSON.stringify({version:1,selected:app.selected,updatedAt:new Date().toISOString()}));
      refreshDemoStatus();
    }
    app.chosen=true;card.classList.add('chosen');
    card.querySelector('.film-pick').textContent=`✓ اولویت ${new Intl.NumberFormat('fa-IR').format(priority)} ثبت شد`;
    message(`«${movie.title}» با اولویت ${new Intl.NumberFormat('fa-IR').format(priority)} ثبت شد. برای دور بعد، دکمهٔ نمایش ۲۰ فیلم را بزن.${mirrorWarning}`);
    toast('انتخاب ثبت شد؛ از دور بعد ادامه بده.');
    $('draw-btn').textContent='🎲 دور بعد: ۲۰ فیلم تازه';
  }catch(e){message(e.message,true);}finally{setBusy(false);}
}

function renderHistory() {
  const el=$('history-list');el.replaceChildren();
  const selected=[...app.selected].sort((a,b)=>new Date(b.selectedAt||0)-new Date(a.selectedAt||0));
  if(!selected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='هنوز فیلمی انتخاب نشده است.';el.appendChild(empty);return;}
  for(const s of selected){
    const row=document.createElement('div');row.className='history-entry';
    const number=document.createElement('span');number.className='history-priority';
    number.textContent=s.isRated?'✓':s.currentPriority===null?'—':'#'+(s.currentPriority??s.priority);
    const title=document.createElement('span');title.className='history-title';title.textContent=`${s.title} (${s.year}) — ${s.director}`;
    const date=document.createElement('span');date.className='history-date';date.textContent=s.selectedAt?new Date(s.selectedAt).toLocaleString('fa-IR'):'—';
    row.append(number,title,date);el.appendChild(row);
  }
}
function exportJson(){
  const state={version:1,selected:app.selected,exportedAt:new Date().toISOString(),note: app.mode==='demo'?'Demo only':'Snapshot; authoritative state is stored alongside the Google Sheet in Drive.'};
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='movie_picker_state.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function disconnect(){app.mode='disconnected';app.code='';app.chosen=false;sessionStorage.removeItem('frame20_code');show('connection-panel',true);show('picker-panel',false);show('history-panel',false);$('connection-pill').classList.remove('connected','demo');$('connection-text').textContent='متصل نشده';$('passcode-input').value='';}
function wire(){
  $('endpoint-input').value=localStorage.getItem('frame20_endpoint')||'';
  $('connect-form').addEventListener('submit',connect);
  $('settings-btn').addEventListener('click',()=>{disconnect();window.scrollTo({top:0,behavior:'smooth'});});
  $('demo-btn').addEventListener('click',startDemo);
  $('draw-btn').addEventListener('click',draw);
  $('history-btn').addEventListener('click',()=>{renderHistory();show('history-panel',true);$('history-panel').scrollIntoView({behavior:'smooth',block:'start'});});
  $('close-history-btn').addEventListener('click',()=>show('history-panel',false));
  $('export-btn').addEventListener('click',exportJson);
  const oldCode=sessionStorage.getItem('frame20_code');
  if(oldCode&&$('endpoint-input').value){$('passcode-input').value=oldCode;connect();}
}
document.addEventListener('DOMContentLoaded',wire);
