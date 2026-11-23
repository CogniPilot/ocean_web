import {observeBoat,sailingRigFields} from './board/boat.mjs';
import {sailPanelFields} from './board/sail-battens.mjs';

const controls=['ballastX','ballastY','ballastZ','mainCar','jibCar','exposedSheetSag','shroudTail','sailTail','stayPath'];

export function readRacerFrame(model){
  const read=names=>model.getMany(names.map(name=>'boat.'+name));
  const boat={getMany:read,get:name=>model.get('boat.'+name)};
  const [pose,status]=model.getMany(['pose','raceStatus']);
  const rig=read(sailingRigFields),cloth=read(sailPanelFields.map(fields=>fields[3]));
  return [...pose,...status,...observeBoat(boat),...rig.flatMap(values=>Array.from(values)),...cloth.flatMap(values=>Array.from(values)),...read(controls).flatMap(value=>typeof value==="number"?[value]:Array.from(value))].map(value=>Math.round(value*1e5)/1e5);
}

export const racerFrameSize=523;

export function drawRacerFrame(boat,before,after,blend,time,interpolated=new Float64Array(racerFrameSize),forestay,lead=0,mastRotation){
  for(let i=0;i<interpolated.length;i++)interpolated[i]=before[i]+blend*(after[i]-before[i]);
  const part=(from,to)=>interpolated.subarray(from,to);
  const state=part(14,221);
  const heading=after[16]-before[16];
  state[0]+=lead*after[5];
  state[1]+=lead*after[6];
  state[2]=before[16]+blend*Math.atan2(Math.sin(heading),Math.cos(heading))+lead*after[7];
  const geometry={forestay,mastRotation,rig:[part(221,245),part(245,248),part(248,254)],cloth:[part(254,374),part(374,446)]};
  boat.update(state,part(446,449),part(449,451),part(451,454),part(454,460),part(460,496),part(496,523),time,geometry);
  return state;
}
