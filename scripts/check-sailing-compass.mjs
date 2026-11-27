import assert from 'node:assert/strict';
import {drawSailingDial} from '../viewer/compass.mjs';

function render(data){
  const canvas={height:192},text=[],rotations=[];
  const ctx=new Proxy({
    fillText:value=>text.push(value),
    rotate:angle=>rotations.push(angle)
  },{get:(obj,key)=>obj[key]??(()=>{})});
  canvas.getContext=()=>ctx;
  canvas.setAttribute=(_key,value)=>{canvas.label=value;};
  drawSailingDial(canvas,{noGo:Math.PI/4,...data});
  return {text,rotations,label:canvas.label};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-10);
const heading=Math.PI/2; // North; the boat is slipping west at 1 m/s.
for(const tack of [-1,1]){
  const trueWind=[-4*tack,0],velocity=[-1,3];
  const apparentWind=trueWind.map((v,i)=>v-velocity[i]);
  const vane=Math.atan2(-apparentWind[1],-apparentWind[0])-heading;
  const data={heading,boatSpeed:Math.hypot(...velocity),trueWind,cupSpeed:Math.hypot(...apparentWind),vane,
    target:{angle:0,bearing:'090°T',range:254,label:'Mark 1'}};
  const measured=render({...data,pointer:'apparent',detailed:true}),environment=render({...data,pointer:'true',detailed:true});
  const angle=tack>0?45:59,side=tack>0?'starboard':'port';
  assert.match(measured.label,/Heading 000° true. Speed over ground 6.1 kn/);
  assert(measured.label.includes('True wind 7.8 kn from 90 degrees '+side));
  assert(measured.label.includes('Apparent wind '+(tack>0?'8.2':'11.3')+' kn from '+angle+' degrees '+side));
  assert(measured.label.includes('Heading clear of the no-go sector.'));
  assert(measured.text.includes(angle+'° '+(tack>0?'S':'P')));
  assert(measured.text.includes('Mark 1  090°T  254 m'));
  assert.deepEqual(measured.text,environment.text);
  assert.equal(measured.label,environment.label);
  const simple=render({...data,pointer:'apparent'});
  assert(simple.text.includes('Boat speed  6.1 kn'));
  assert(simple.text.includes('Apparent wind')&&!simple.text.includes('True wind'));
  assert(simple.text.includes('Mark 1  254 m')&&!simple.text.includes('000°T'));
  assert.equal(simple.label,measured.label);
  near(measured.rotations[0],environment.rotations[0]); // no-go sector remains on true wind
  near(measured.rotations[1],Math.atan2(Math.sin(-vane),Math.cos(-vane))-Math.PI/2);
  near(environment.rotations[1],tack*Math.PI/2-Math.PI/2);
}

for(const [trueWind,cupSpeed,vane,direction] of [
  [[4,0],2,Math.PI,'astern'],[[-4,0],6,0,'the bow'],[[0,0],0,0,null]
]){
  const {label,text}=render({heading:0,boatSpeed:2,trueWind,cupSpeed,vane,pointer:'apparent',detailed:true});
  if(direction){
    assert(label.includes('True wind 7.8 kn from '+direction));
    assert(label.includes('Apparent wind '+(2===cupSpeed?'3.9':'11.7')+' kn from '+direction));
    assert(label.includes('Heading '+(vane===0?'inside':'clear of')+' the no-go sector.'));
  }else{
    assert(!label.includes(' from '));assert.equal(text.filter(t=>t==='Calm').length,2);
  }
}
console.log('Both wind readouts, bow-relative angles, pointer selection and the true-wind no-go sector passed.');
