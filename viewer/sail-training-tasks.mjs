// Angles use ENU yaw and the direction the wind comes FROM. Positive signed
// angles put the wind on the port side. Sin/cos retain tack at the ±π seam.
const rad=Math.PI/180;
const helm=['Rudder','Mainsheet winch rate'];
const hobieTrims=['Main traveler','Jib traveler','Jib sheet','Downhaul','Outhaul','Jib halyard','Crew fore/aft','Crew port/starboard'];
const fields=['east','north','heave','heading','pitch','heel','windEast','windNorth','ve','vn','yawRate','payout'];
const crewFields=['ballastX','ballastY','ballastZ'];
const waveFields=['swellAmplitude','swellK','swellBearing','swellPhase'];
const features=['Bias','True wind speed','True wind angle sin','True wind angle cos',
  'Apparent wind speed','Apparent wind angle sin','Apparent wind angle cos',
  'Course error sin','Course error cos','Forward speed','Lateral speed','Heel sin','Yaw rate','Mainsheet payout'];

export function signedWindAngle(model){
  const from=Math.atan2(-model.get('windNorth'),-model.get('windEast'))-model.get('heading');
  return Math.atan2(Math.sin(from),Math.cos(from));
}
function course(model,target){
  return Math.atan2(-model.get('windNorth'),-model.get('windEast'))-target.pointOfSail;
}
async function loadSwellPresets(plant){
  const {loadInstance}=await import('./fmi3/instance.mjs');
  const model=await loadInstance(plant,{});
  try{
    const [amplitudes,numbers,frequencies]=model.getMany(['swellPresetAmplitudes','swellPresetWaveNumbers','swellPresetFrequencies']);
    const bearing=model.get('swellBearing');
    return [0,.45,1.1,1.5].map((launchSeaState,i)=>({bearing,inputs:{launchSeaState,
      swellAmplitude:amplitudes[i],swellK:numbers[i],swellOmega:frequencies[i]}}));
  }finally{model.close();}
}
function sailingTask(id,label,plant,cat){
  return {id,label,plant,dt:.01,ticksPerDecision:80,sailing:true,waveGrid:cat,
    prepareScenarios:cat?()=>loadSwellPresets(plant):undefined,
    summary:cat?"Sail the requested point of sail across wind and swell conditions. Control the rudder, sheets, travelers, sail tension, and crew position.":"Sail the requested point of sail on either tack. Control the rudder, shared sheet winch and boom vang to make progress along the course.",
    actionNames:[...helm,...(cat?hobieTrims:['Boom vang'])],
    featureNames:features,outputs:[...fields,'trim','rudder',...(cat?[...crewFields,...waveFields]:[])],
    rigPose:model=>[...model.get('trim'),model.get('rudder'),...(cat?[...crewFields,...waveFields].map(field=>model.get(field)):[])],
    scenario(draw,presets){
      const side=draw()<.5?-1:1,pointOfSail=side*(45+135*draw())*rad;
      const from=2*Math.PI*draw(),speed=2+9*draw();
      const launchSpeed=.7+1.8*draw(),launchHeading=from-pointOfSail+(draw()-.5)*.65;
      const sea=presets?.[Math.floor(draw()*presets.length)];
      const offset=sea?(draw()-.5)*2*Math.PI/sea.inputs.swellK:0;
      return {pointOfSail,inputs:{...sea?.inputs,
        launchEast:-900+offset*Math.cos(sea?.bearing??0),launchNorth:-200+offset*Math.sin(sea?.bearing??0),
        launchSpeed,launchHeading,launchHeight:cat?.20:.069,
        windEast:-speed*Math.cos(from),windNorth:-speed*Math.sin(from),manualHelm:1,
        deckManual:1,ballastManual:1,manualJibAssist:0}};
    },
    observe(m,target){
      const h=m.get('heading'),ve=m.get('ve'),vn=m.get('vn');
      const e=m.get('windEast'),n=m.get('windNorth'),t=signedWindAngle(m);
      const a=Math.atan2(vn-n,ve-e)-h,error=course(m,target)-h;
      return [1,Math.hypot(e,n)/12,Math.sin(t),Math.cos(t),Math.hypot(e-ve,n-vn)/15,
        Math.sin(a),Math.cos(a),Math.sin(error),Math.cos(error),
        (ve*Math.cos(h)+vn*Math.sin(h))/8,(-ve*Math.sin(h)+vn*Math.cos(h))/4,
        Math.sin(m.get('heel')),m.get('yawRate'),(m.get('payout')-.30)/.30];
    },
    act(m,_target,a){
      m.set('rudderInput',a[0]);m.set('trimInput',a[1]);
      if(cat){
        m.set('mainCarInput',(1+a[2])/2);m.set('jibCarInput',.53+.35*a[3]);
        m.set('jibTrimInput',(1+a[4])/2);m.set('downhaulInput',(1+a[5])/2);
        m.set('outhaulInput',(1+a[6])/2);m.set('jibHalyardInput',(1+a[7])/2);
        m.set('ballastCmdX',.72*a[8]);m.set('ballastCmdY',2.10*a[9]);
      }else m.set('vangInput',(1+a[2])/2);
    },
    reward(m,target){
      const goal=course(m,target),heel=m.get('heel');
      const vmg=m.get('ve')*Math.cos(goal)+m.get('vn')*Math.sin(goal);
      return vmg/4-.55*(1-Math.cos(goal-m.get('heading')))-1.2*(1-Math.cos(heel))-.10*m.get('yawRate')**2;
    },
    pose:m=>['east','north','heave','heading','pitch','heel'].map(k=>m.get(k))
  };
}
const hobie=sailingTask('hobie16','Hobie 16','Hobie16',true);
hobie.pretrained=async()=>{
  const response=await fetch(new URL('./assets/hobie16-policy.json',import.meta.url));
  if(!response.ok)throw Error('Cannot load the Hobie 16 policy');
  return (await response.json()).weights;
};
export const sailTrainingTasks=[hobie,sailingTask('sailboat','Sloop','Sailboat',false)];
