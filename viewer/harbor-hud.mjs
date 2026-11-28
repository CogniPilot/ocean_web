const panelNames={
  subSensors:'Imaging sonar',subOptical:'Optical camera',cruiserSonarPanel:'Imaging sonar and chart',
  cruiserCameras:'Underwater cameras',fishFinder:'Fish finder',racePanel:'Race clock and results',
  fleetRoster:'Players and NPCs',roomChat:'Room chat'
};

const shortcuts={play:"Pause or resume",sound:"Sound effects",hudMusic:"Music",resetSimulation:"Respawn",fleetButton:"Fleet",openChat:"Chat",mainMenu:"Main menu"};

export function harborHud(signal,role){
  const byId=id=>document.getElementById(id);
  const key='ocean-hud-v1-'+(matchMedia('(pointer: coarse)').matches?'touch':'desktop');
  let preferences={};
  try{const stored=JSON.parse(localStorage.getItem(key));if(stored && typeof stored==='object')preferences=stored;}catch{}
  if(typeof preferences.racePanel!=='boolean'){
    try{
      const legacy=localStorage.getItem('ocean.racePanel.open');
      if(legacy==='true'||legacy==='false')preferences.racePanel=legacy==='true';
    }catch{}
  }
  function save(id,value){
    preferences[id]=value;
    try{localStorage.setItem(key,JSON.stringify(preferences));}catch{}
  }
  const enabled=(id,initial=id==='racePanel')=>typeof preferences[id]==='boolean'?preferences[id]:initial;
  const hudMinimize=byId('hudMinimize'),hudReadouts=byId('hudReadouts');
  function header(){
    for(const name of ['telemetry','performance','fpv'])document.body.dataset['hud'+name[0].toUpperCase()+name.slice(1)]=String(enabled(name,name!=='telemetry'));
    const expanded=enabled('headerExpanded',true),label=expanded?'Minimize instruments':'Expand instruments';
    hudReadouts.hidden=!expanded;
    hudMinimize.setAttribute('aria-expanded',String(expanded));
    hudMinimize.setAttribute('aria-label',label);
    hudMinimize.title=label;
  }
  header();
  hudMinimize.addEventListener('click',()=>{save('headerExpanded',hudReadouts.hidden);header();},{signal});
  const compassDefault=role==='boat'||role==='drone';
  const audioShortcuts=new Set(['sound','hudMusic']);
  const pinned=id=>enabled('pin-'+id,audioShortcuts.has(id));
  const music=byId('music'),musicShortcut=byId('hudMusic');
  function syncMusic(){
    musicShortcut.setAttribute('aria-pressed',music.getAttribute('aria-pressed')??'false');
    musicShortcut.title=music.title;
  }
  syncMusic();
  const musicState=new MutationObserver(syncMusic);
  musicState.observe(music,{attributes:true,attributeFilter:['aria-pressed','title']});
  musicShortcut.addEventListener('click',()=>music.click(),{signal});
  signal.addEventListener('abort',()=>musicState.disconnect(),{once:true});
  function placeShortcuts(){
    const actions=byId('hudActions'),bar=byId('hudMore').parentElement;
    for(const id of Object.keys(shortcuts)){
      if(pinned(id)&&audioShortcuts.has(id))byId('hudAudio').appendChild(byId(id));
      else if(pinned(id))bar.insertBefore(byId(id),byId('hudMore'));
      else actions.appendChild(byId(id));
    }
  }
  placeShortcuts();
  const heading=document.querySelector('body > header');
  const size=new ResizeObserver(()=>document.body.style.setProperty('--hud-header-bottom',heading.getBoundingClientRect().bottom+'px'));
  size.observe(heading);
  signal.addEventListener('abort',()=>size.disconnect(),{once:true});
  const panelInputs=new Map();
  function panelFocus(id){
    const input=panelInputs.get(id);
    (input&&selected==='instruments'?input:byId('hudInstruments')).focus({preventScroll:true});
  }
  function setPanelVisible(id,visible){
    const details=byId(id);
    if(id==='racePanel')details.dataset.hudDismissed=String(!visible);
    details.open=visible&&(id!=='racePanel'||enabled('racePanelExpanded',true));
  }
  const panelVisible=id=>id==='racePanel'?enabled(id):byId(id).open;
  for(const [id,label] of Object.entries(panelNames)){
    const details=byId(id);
    setPanelVisible(id,enabled(id));
    let returnFocus=false;
    details.querySelector('summary').addEventListener('click',event=>{
      if(event.defaultPrevented)return;
      if(id==='racePanel'){
        save('racePanelExpanded',!details.open);
        return;
      }
      returnFocus=details.open;
      save(id,!details.open);
    },{signal});
    details.addEventListener('toggle',()=>{
      const input=panelInputs.get(id);
      if(input)input.checked=panelVisible(id);
      if(returnFocus&&!details.open)panelFocus(id);
      returnFocus=false;
    },{signal});
    if(id==='roomChat')continue;
    details.classList.add('hud-instrument-panel');
    const close=document.createElement('button');
    close.type='button';close.className='hud-instrument-close';close.textContent='Close';
    close.setAttribute('aria-label','Close '+label);
    details.querySelector('summary').after(close);
    function dismiss(){
      save(id,false);setPanelVisible(id,false);
      const input=panelInputs.get(id);
      if(input)input.checked=false;
      panelFocus(id);
    }
    close.addEventListener('click',dismiss,{signal});
    details.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing){
        event.preventDefault();dismiss();
      }
    },{signal});
    signal.addEventListener('abort',()=>close.remove(),{once:true});
  }
  function check(label,value,onChange){
    const row=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.checked=value;
    input.addEventListener('change',()=>onChange(input.checked));
    row.append(input,document.createTextNode(label));
    return row;
  }
  function available(details){
    // The exterior view may hide the entire closed panel through CSS. Inspect
    // role selection and connection state rather than its visible rectangle.
    return !details.closest('[hidden]');
  }
  function instruments(){
    const fields=byId('hudWidgets');
    fields.replaceChildren(
      check('Detailed telemetry',enabled('telemetry'),v=>{save('telemetry',v);header();}),
      check('Frame rate and simulation speed',enabled('performance',true),v=>{save('performance',v);header();})
    );
    if(['drone','sub'].includes(byId('controlTarget').value)){
      fields.append(check('First-person attitude and heading',enabled('fpv',true),v=>{save('fpv',v);header();}));
    }
    const pins=byId('hudShortcuts');pins.replaceChildren();
    for(const [id,label] of Object.entries(shortcuts)){
      pins.append(check(label,pinned(id),value=>{save('pin-'+id,value);placeShortcuts();}));
    }
    const panels=byId('hudPanels');panels.replaceChildren();panelInputs.clear();
    for(const [id,label] of Object.entries(panelNames)){
      const details=byId(id);
      if(!available(details))continue;
      const row=check(label,panelVisible(id),v=>{save(id,v);setPanelVisible(id,v);});
      const input=row.querySelector('input');input.setAttribute('aria-controls',id);
      panelInputs.set(id,input);panels.append(row);
    }
    panels.parentElement.hidden=!panels.childElementCount&&byId('mastCapture').hidden;
  }
  const drawer=byId('vehiclePanel'),closeButton=byId('hudDone');
  const pages={
    controls:[byId('collapsePanel'),byId('vehicleControls')],
    instruments:[byId('hudInstruments'),byId('hudCustomize')],
    settings:[byId('settings'),byId('setup')],
    menu:[byId('hudMore'),byId('hudActions')]
  };
  const motion=matchMedia('(prefers-reduced-motion:no-preference)');
  let selected=null,exitAnimation;
  function hideDrawer(){
    drawer.hidden=true;
    for(const [,content] of Object.values(pages))content.hidden=true;
  }
  function openPanel(page,focus=false){
    if(!page&&!selected&&exitAnimation)return;
    const previous=selected;
    selected=page;
    if(exitAnimation){exitAnimation.cancel();exitAnimation=undefined;}
    for(const [key,[button]] of Object.entries(pages)){
      button.setAttribute('aria-expanded',String(key===page));
    }
    if(!page){
      if(previous&&drawer.contains(document.activeElement))pages[previous][0].focus({preventScroll:true});
      drawer.inert=true;
      if(previous&&motion.matches&&drawer.animate&&!drawer.hidden){
        const animation=drawer.animate([
          {opacity:1,transform:'translateY(0)'},
          {opacity:0,transform:'translateY(16px)'}
        ],{duration:120,easing:'ease-in'});
        exitAnimation=animation;
        animation.onfinish=()=>{
          if(exitAnimation===animation){exitAnimation=undefined;hideDrawer();}
        };
      }else hideDrawer();
      return;
    }
    drawer.inert=false;
    drawer.hidden=false;
    for(const [key,[,content]] of Object.entries(pages))content.hidden=key!==page;
    const [button]=pages[page];
    byId('hudMenuTitle').textContent=button.textContent;
    closeButton.setAttribute('aria-label','Close '+button.textContent);
    if(page==='instruments')instruments();
    drawer.scrollTop=0;
    if(focus)closeButton.focus({preventScroll:true});
  }
  function closePanel(){
    if(!selected)return;
    const [button]=pages[selected];
    if(selected==='controls')save('controls',false);
    button.focus({preventScroll:true});
    openPanel(null);
  }
  for(const [page,[button]] of Object.entries(pages)){
    button.addEventListener('click',()=>{
      if(selected===page){closePanel();return;}
      if(page==='controls')save('controls',true);
      openPanel(page,true);
    },{signal});
  }
  closeButton.addEventListener('click',closePanel,{signal});
  drawer.addEventListener('keydown',event=>{
    if(event.key==='Escape')return;
    if(event.target.closest('.hud-drawer-head,#hudActions,#hudCustomize')||
      (event.target.closest('summary')&&['Enter',' '].includes(event.key)))event.stopPropagation();
  },{signal});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!selected||event.defaultPrevented||event.isComposing||
      document.querySelector('dialog[open]')||byId('roomChat').contains(event.target))return;
    event.preventDefault();closePanel();
  },{signal});
  // Dismiss before a menu action opens another dialog or focuses chat.
  byId('hudActions').addEventListener('click',event=>{
    if(event.target.closest('button'))closePanel();
  },{capture:true,signal});
  openPanel(enabled('controls')?'controls':null);
  byId('hudReset').addEventListener('click',()=>{
    try{localStorage.removeItem('ocean.racePanel.open');}catch{}
    for(const field of ['telemetry','performance','fpv','headerExpanded','racePanelExpanded',...Object.keys(panelNames),'compass-'+role,'mastPanel',...Object.keys(shortcuts).map(id=>'pin-'+id)]){
      delete preferences[field];
    }
    for(const id of Object.keys(panelNames))setPanelVisible(id,enabled(id));
    const compass=byId('showCompass');
    if(!compass.hidden && (compass.getAttribute('aria-pressed')==='true')!==compassDefault)compass.click();
    if(!byId('mastPanel').hidden)byId('mastCapture').click();
    placeShortcuts();header();instruments();
    try{localStorage.setItem(key,JSON.stringify(preferences));}catch{}
  },{signal});
  return {enabled,save,openPanel,get activePanel(){return selected;}};
}
