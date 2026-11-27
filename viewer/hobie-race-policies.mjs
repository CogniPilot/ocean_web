// Each racer owns its plan, wind history and random stream. Only the host runs these controllers.
import {loadInstance} from './fmi3/instance.mjs';
import {openPolicyActor} from './live-policy-actor.mjs';
import {sailTrainingTasks} from './sail-training-tasks.mjs';
import {validateWeights} from './live-training-tasks.mjs';

export const hobieControllers=Object.freeze({vmg:'VMG autopilot',rl:'RL policy',nmpc:'Scenario NMPC',mppi:'Path integral (MPPI)'});
const task=sailTrainingTasks[0];
const channels=['rudderInput','trimInput','mainCarInput','jibCarInput','jibTrimInput','downhaulInput','outhaulInput','jibHalyardInput','ballastCmdX','ballastCmdY'];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function normalGenerator(seed){
  const uniform=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)+.5)/4294967296;
  return ()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
}

// Conditional ensemble of persistent direction shifts and log-speed gusts. The
// correlation times and stationary spreads are engineering priors for this boat.
function forecasts(direction,speed,meanDirection,meanLogSpeed,noise){
  const paths=[],rhoD=Math.exp(-1/24),rhoS=Math.exp(-1/12);
  for(let i=0;i<4;i++){
    let d=wrap(direction-meanDirection),s=Math.log(Math.max(.1,speed))-meanLogSpeed;
    const path=[];
    for(let t=0;t<15;t++){
      d=rhoD*d+.20*Math.sqrt(1-rhoD*rhoD)*noise();
      s=rhoS*s+.16*Math.sqrt(1-rhoS*rhoS)*noise();
      path.push(meanDirection+d,Math.exp(meanLogSpeed+s));
    }
    paths.push(path);
  }
  return paths;
}
export async function raceController(mode,weights){
  if(mode==='vmg')return {step(){},close(){}};
  const rl=mode==='rl';
  if(!Object.hasOwn(hobieControllers,mode))throw Error('Unknown Hobie race controller');
  const actor=rl?await openPolicyActor():null;
  const predictor=rl?null:await loadInstance('HobieCoursePrediction',{});
  if(rl)weights=validateWeights(task,weights??await task.pretrained());
  const weatherNoise=normalGenerator(90119),controlNoise=normalGenerator(215609);
  let previousTime=-Infinity,meanDirection,meanLogSpeed,previousPlan;
  function step(model){
    const time=model.time,elapsed=time-previousTime;
    if(elapsed+1e-9<(rl?task.dt*task.ticksPerDecision:1))return;
    previousTime=time;
    const [eastWind,northWind,reference]=model.getMany(['windEast','windNorth','course']);
    const direction=Math.atan2(-northWind,-eastWind),speed=Math.hypot(eastWind,northWind);
    if(rl){
      const commands=[],boat={get:name=>model.get('boat.'+name),set:(name,value)=>{commands[channels.indexOf(name)]=value;}};
      const goal={pointOfSail:wrap(direction-reference)};
      task.act(boat,goal,actor.decide(weights,task.observe(boat,goal)));
      model.set('actuators',commands);return;
    }
    const [goal,pose,currentEast,currentNorth]=model.getMany(['goal','pose','boat.currentEast','boat.currentNorth']);
    const blend=1-Math.exp(-elapsed/40);
    meanDirection=meanDirection===undefined?direction:meanDirection+blend*wrap(direction-meanDirection);
    const logSpeed=Math.log(Math.max(.1,speed));
    meanLogSpeed=meanLogSpeed===undefined?logSpeed:meanLogSpeed+blend*(logSpeed-meanLogSpeed);
    const wind=forecasts(direction,speed,meanDirection,meanLogSpeed,weatherNoise);
    predictor.set('state',[goal[0]-pose[0],goal[1]-pose[1],pose[3],pose[7],pose[4]]);
    predictor.set('current',[currentEast,currentNorth]);
    function cost(plan){
      predictor.set('bearings',plan);
      let sum=0,worst=-Infinity;
      for(const sample of wind){
        predictor.set('forecast',sample);
        const loss=predictor.get('cost');sum+=loss;worst=Math.max(worst,loss);
      }
      return .8*sum/wind.length+.2*worst;
    }
    // Compare distinct tack families before local refinement so a mean command
    // never averages opposing tacks into the wind.
    const shifted=previousPlan?.map((v,i,a)=>v+.2*wrap(a[Math.min(i+1,2)]-v));
    const initial=[reference,direction-1.035,direction+1.035].map(h=>[h,h,h]);
    if(shifted)initial.push(shifted);
    let plan=initial[0],best=Infinity;
    for(const guess of initial){const value=cost(guess);if(value<best){best=value;plan=guess;}}
    if(mode==='nmpc'){
      // Direct shooting, two coordinate-search refinements on three control knots.
      for(const radius of [.38,.16])for(let i=0;i<plan.length;i++){
        const center=plan;
        for(const sign of [-1,1]){
          const trial=center.slice();trial[i]+=sign*radius;
          const value=cost(trial);if(value<best){best=value;plan=trial;}
        }
      }
    }else{
      // Importance-sampled Gaussian controls in the local unwrapped heading
      // chart. The likelihood correction uses the nominal offset to the VMG plan.
      const samples=[],sigma=.36,temperature=1.4;
      const nominal=plan.map(h=>wrap(h-reference));
      for(let k=0;k<32;k++){
        const noise=plan.map(()=>sigma*controlNoise());
        const trial=plan.map((h,i)=>h+noise[i]);
        const correction=temperature*noise.reduce((v,e,i)=>v+nominal[i]*e/(sigma*sigma),0);
        samples.push({noise,loss:cost(trial)+correction});
      }
      const min=Math.min(...samples.map(s=>s.loss)),delta=[0,0,0];let total=0;
      for(const {noise,loss} of samples){const w=Math.exp((min-loss)/temperature);total+=w;noise.forEach((v,i)=>delta[i]+=w*v);}
      plan=plan.map((h,i)=>h+delta[i]/total);
    }
    if(!plan.every(Number.isFinite))throw Error('Nonfinite predictive heading');
    previousPlan=plan;model.set('predictedHeading',wrap(plan[0]));
  }
  return {step,close:()=>predictor?.close()};
}
