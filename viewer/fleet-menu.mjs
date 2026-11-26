import {harborMap} from './harbor-map.mjs';
import {chartNavigation} from './harbor-map-input.mjs';
import {fixedSpawnPoints} from './spawn-sites.mjs';
import {observeDirectory,publicRoom} from './fleet-directory.mjs';
import {reserveFleetSeat} from './fleet-seat.mjs';
import {validRoomName} from './vendor/names.js';

export async function chooseVehicle(url,endpoint){
  const $=id=>document.getElementById(id);
  const dialog=$('vehiclePicker'),form=dialog.querySelector('form'),vehicles=$('vehicleType');
  const world=$('worldType'),oceanVehicles=[...vehicles.options],tumblehome=new Option('ONR Tumblehome','onrt');
  const choices=$('vehicleChoices'),vehicleList=choices.querySelector('div');
  function showVehicleChoices(){
    vehicleList.replaceChildren(...Array.from(vehicles.options,option=>{
      const label=document.createElement('label'),radio=document.createElement('input');
      radio.type='radio';radio.name='landingVehicle';radio.value=option.value;
      radio.checked=option.selected;
      label.append(radio,option.label);
      return label;
    }));
  }
  showVehicleChoices();
  choices.onchange=event=>{
    vehicles.value=event.target.value;
    vehicles.dispatchEvent(new Event('change'));
  };
  const spawn=$('entrySpawn'),mapButton=$('entryMapOpen'),mapDialog=$('entryMap');
  const canvas=$('entryMapCanvas'),mapChoice=$('entryMapChoice');
  const mapLifetime=new AbortController();
  let map,observer,mapped=[];
  function listSpawns(){
    const points=fixedSpawnPoints(vehicles.value),previous=spawn.value;
    mapped=world.value==='ocean'?points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)):[];
    const options=points.map(p=>new Option(p.label,p.id));
    if(multi&&vehicles.value==='sub')options.push(new Option('Choose a cruiser hoist in this fleet…','choose-hoist'));
    if(multi&&vehicles.value==='diver')options.push(new Option('Dive alongside a cruiser in this fleet…','choose-hoist'));
    spawn.replaceChildren(...options);
    if(options.some(o=>o.value===previous))spawn.value=previous;
    mapChoice.replaceChildren(...mapped.map(p=>new Option(p.label,p.id)));
  }
  function drawMap(){
    if(map&&mapDialog.open)map.draw(null,null,mapped,mapChoice.value);
  }
  mapButton.onclick=()=>{
    if(!mapped.length)return;
    mapChoice.value=mapped.some(p=>p.id===spawn.value)?spawn.value:mapped[0].id;
    mapDialog.showModal();
    if(!map){
      map=harborMap(canvas,null,null,null,undefined,mapLifetime.signal);
      chartNavigation(canvas,map,id=>{mapChoice.value=id;drawMap();},mapLifetime.signal);
      observer=new ResizeObserver(drawMap);observer.observe(canvas);
    }
    map.fit();drawMap();
  };
  mapChoice.onchange=drawMap;
  $('entryMapFit').onclick=()=>map.fit();
  $('entryMapIn').onclick=()=>map.zoom(1.5);
  $('entryMapOut').onclick=()=>map.zoom(1/1.5);
  $('entryMapBack').onclick=()=>mapDialog.close();
  $('entryMapUse').onclick=()=>{
    if(mapped.some(p=>p.id===mapChoice.value))spawn.value=mapChoice.value;
    mapDialog.close();
  };
  mapDialog.onclose=()=>mapButton.focus({preventScroll:true});
  const browser=$('fleetBrowser'),list=$('publicFleets'),launch=$('launchFleet'),status=$('fleetLaunchStatus');
  const invited=url.searchParams.get('join')==='1',room=url.searchParams.get('room')?.trim()||publicRoom;
  const number=Number(url.searchParams.get('fleet'))||1;
  const validInvite=validRoomName(url.searchParams.get('room')?.trim()??'')&&Number.isSafeInteger(number)&&number>0&&number<=1000000;
  let multi,discovery,rows=[],busy=false,inviteFull=false,oceanVehicle=vehicles.value;
  let finish;
  const chosen=new Promise(resolve=>{finish=resolve;});
  const invitedFleet=$('inviteChoice');
  if(invited&&validInvite){
    invitedFleet.hidden=false;
    invitedFleet.querySelector('span').textContent='Invited fleet · '+room+' · '+number;
    invitedFleet.querySelector('input').checked=true;
  }
  const choice=()=>browser.querySelector('input:checked')?.value??'any';
  function selection(){
    const invite=choice()==='invite';
    const fleet=invite?number:Number(choice())||rows.find(row=>row.count<10)?.fleet||nextFleet();
    return {room:invite?room:publicRoom,fleet,exact:choice()!=='any'};
  }
  function nextFleet(){
    const existing=new Set(rows.map(row=>row.fleet));let n=1;while(existing.has(n))n++;return n;
  }
  function update(){
    const target=selection();
    const count=target.room===publicRoom?rows.find(row=>row.fleet===target.fleet)?.count:undefined;
    const full=count>=10||(choice()==='invite'&&inviteFull);
    launch.disabled=busy||(multi&&full);
    if(multi){
      launch.textContent=full?'Fleet full':choice()==='invite'?'Join this fleet':'Join fleet';
      if(count!==undefined)launch.textContent+=' · '+count+'/10';
    }else launch.textContent=world.value==='basin'?'Open model basin':'Start simulation';
    const chooseSpawn=world.value==='ocean'&&mapped.length>0;
    $('entrySpawnFields').hidden=!chooseSpawn;
    spawn.disabled=mapButton.disabled=busy||!chooseSpawn;
    vehicles.disabled=choices.disabled=busy;
    world.disabled=browser.disabled=$('pickSolo').disabled=busy;
    $('pickFleet').disabled=busy||world.value==='basin';
  }
  function display(fleets){
    const fleetsNow=fleets.filter(row=>Number.isSafeInteger(row.fleet)&&row.fleet>0&&Number.isInteger(row.count)&&row.count>0&&row.count<=10);
    if(fleetsNow.length!==rows.length||fleetsNow.some((r,i)=>r.fleet!==rows[i].fleet||r.count!==rows[i].count)){
      const previous=choice(),focused=list.contains(document.activeElement);
      rows=fleetsNow;
      const entries=rows.map(({fleet,count})=>{
        const row=document.createElement('tr'),label=document.createElement('label'),radio=document.createElement('input');
        radio.type='radio';radio.name='fleetChoice';radio.value=String(fleet);
        radio.disabled=count===10;radio.checked=previous===radio.value;
        label.append(radio,'Regatta '+fleet);row.insertCell().append(label);
        row.insertCell().textContent=count+'/10';row.insertCell().textContent=count===10?'Full':'Open';
        return row;
      });
      list.replaceChildren(...entries);
      if(!browser.querySelector('input:checked'))browser.querySelector('[value="any"]').checked=true;
      if(focused)browser.querySelector('input:checked:not(:disabled)')?.focus();
    }
    $('fleetDirectoryStatus').textContent=rows.length?'Public fleets online · '+rows.length:'No public fleets listed yet';
    update();
  }
  function startDirectory(){
    discovery=new AbortController();
    const {signal}=discovery;
    if(!endpoint){observeDirectory({signal,onList:display});return;}
    async function poll(){
      try{
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
          body:'{"action":"list"}',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
        if(!response.ok)throw Error();
        const data=await response.json();
        if(!signal.aborted)display(data.fleets);
      }catch{if(!signal.aborted)$('fleetDirectoryStatus').textContent='Fleet directory unavailable';}
      if(!signal.aborted)timer=setTimeout(poll,10000);
    }
    let timer;signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});void poll();
  }
  function mode(requested){
    discovery?.abort();multi=requested&&world.value==='ocean';listSpawns();
    world.querySelector('[value="basin"]').disabled=multi;
    $('pickSolo').setAttribute('aria-pressed',String(!multi));$('pickFleet').setAttribute('aria-pressed',String(multi));
    browser.hidden=!multi;
    status.textContent=multi&&invited&&!validInvite?'Invalid room name in invite. Choose a public fleet.':'';
    if(multi){display(rows);startDirectory();}else update();
  }
  $('pickSolo').onclick=()=>mode(false);$('pickFleet').onclick=()=>mode(true);
  world.onchange=()=>{
    if(world.value==='basin'){
      oceanVehicle=vehicles.value;vehicles.replaceChildren(tumblehome);
    }else{
      vehicles.replaceChildren(...oceanVehicles);vehicles.value=oceanVehicle;
    }
    showVehicleChoices();$('basinInfo').hidden=world.value!=='basin';mode(multi);
  };
  vehicles.onchange=()=>{
    for(const radio of vehicleList.querySelectorAll('input'))radio.checked=radio.value===vehicles.value;
    listSpawns();update();
  };
  list.onclick=event=>{
    const radio=event.target.closest('tr')?.querySelector('input');
    if(radio&&!radio.disabled&&!browser.disabled&&!event.target.closest('label'))radio.click();
  };
  browser.onchange=()=>{status.textContent='';update();};
  form.onsubmit=async event=>{
    event.preventDefault();
    if(busy||launch.disabled)return;
    const vehicle=vehicles.value;
    if(!multi){dialog.close();finish({world:world.value,vehicle,spawnPoint:spawn.value});return;}
    if(!globalThis.crypto?.subtle||typeof RTCPeerConnection!=='function'){
      status.textContent='Open Ocean Web over HTTPS in a WebRTC-capable browser.';return;
    }
    const target=selection(),spawnPoint=spawn.value;
    busy=true;update();status.textContent='Joining fleet…';
    try{
      const seat=endpoint?await reserveFleetSeat(endpoint,target.room,target.fleet,target.exact):null;
      dialog.close();finish({vehicle,spawnPoint,...target,fleet:seat?.fleet??target.fleet,seat});
    }catch(error){
      if(error.message==='Fleet full'&&choice()==='invite')inviteFull=true;
      status.textContent=error.message==='Fleet full'?'That fleet is full. Choose the first available public fleet.':'Could not reserve a seat. Try again.';
    }finally{busy=false;update();}
  };
  dialog.oncancel=e=>e.preventDefault();
  mode(invited||url.searchParams.get('menu')==='fleet');
  dialog.showModal();
  const result=await chosen;
  observer?.disconnect();mapLifetime.abort();
  discovery?.abort();
  return result;
}
