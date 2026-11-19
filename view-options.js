/* FRAME / 20 — display layouts and sizes, independently saved per section.
 * Presentation-only: does not alter film priority, ratings, API calls or sorting.
 */
'use strict';
(function(){
  const STORAGE='frame20_view_preferences_v1';
  const SECTIONS=['picker','watchlist','ratings'];
  const LAYOUTS=['grid','list','compact'];
  const SIZES=['small','medium','large'];
  const DEFAULTS={
    picker:{layout:'grid',size:'medium'},
    watchlist:{layout:'list',size:'medium'},
    ratings:{layout:'list',size:'medium'}
  };
  const t=(key)=>window.FrameI18n.t(key);
  function read(){
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch(_){}
    return Object.fromEntries(SECTIONS.map(name=>{
      const p=saved[name]||{};
      return [name,{
        layout:LAYOUTS.includes(p.layout)?p.layout:DEFAULTS[name].layout,
        size:SIZES.includes(p.size)?p.size:DEFAULTS[name].size
      }];
    }));
  }
  const prefs=read();
  function persist(){
    try{localStorage.setItem(STORAGE,JSON.stringify(prefs));}catch(_){}
  }
  function apply(name){
    const panel=document.getElementById(name+'-panel');
    if(!panel)return;
    panel.dataset.layout=prefs[name].layout;
    panel.dataset.size=prefs[name].size;
    panel.querySelectorAll('.view-option-btn').forEach(button=>{
      const active=prefs[name][button.dataset.setting]===button.dataset.value;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function makeGroup(name,setting,values,labelKey){
    const group=document.createElement('div');
    group.className='view-option-group';
    group.setAttribute('role','group');
    group.setAttribute('aria-label',t(labelKey));
    group.dataset.labelKey=labelKey;
    const label=document.createElement('span');
    label.className='view-option-label';
    label.textContent=t(labelKey);
    label.dataset.i18n=labelKey;
    group.append(label);
    const buttons=document.createElement('div');
    buttons.className='view-option-buttons';
    values.forEach(value=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='view-option-btn';
      button.dataset.setting=setting;
      button.dataset.value=value;
      button.dataset.i18n=(setting==='layout'?'viewLayout':'viewSize')+value[0].toUpperCase()+value.slice(1);
      button.textContent=t(button.dataset.i18n);
      button.title=t(button.dataset.i18n);
      button.addEventListener('click',()=>{
        if(prefs[name][setting]===value)return;
        prefs[name][setting]=value;
        persist();
        apply(name);
      });
      buttons.append(button);
    });
    group.append(buttons);
    return group;
  }
  function wire(){
    for(const name of SECTIONS){
      const panel=document.getElementById(name+'-panel');
      const anchor=panel?.querySelector('.section-heading');
      if(!panel||!anchor)continue;
      const options=document.createElement('div');
      options.className='view-options';
      options.setAttribute('aria-label',t('viewOptions'));
      const title=document.createElement('div');
      title.className='view-options-title';
      title.dataset.i18n='viewOptions';
      title.textContent=t('viewOptions');
      options.append(title);
      options.append(makeGroup(name,'layout',LAYOUTS,'viewLayoutLabel'));
      options.append(makeGroup(name,'size',SIZES,'viewSizeLabel'));
      anchor.insertAdjacentElement('afterend',options);
      apply(name);
    }
    document.addEventListener('frame20:languagechange',()=>{
      document.querySelectorAll('.view-option-group[data-label-key]').forEach(group=>{
        group.setAttribute('aria-label',t(group.dataset.labelKey));
      });
      for(const name of SECTIONS)apply(name);
    });
  }
  window.FrameViewOptions={get(name){return {...prefs[name]};}};
  document.addEventListener('DOMContentLoaded',wire);
})();
