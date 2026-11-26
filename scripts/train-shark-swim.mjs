// Serve the repository over localhost, then call trainShark() from a browser module.
// For CUDA training, point tools/serve-training.mjs at the matching HarborTraffic runner
// and FMU, then pass {cudaRounds:4}. Validation always runs in the browser runtime.
// Rollouts use the playable shark's FMU. The shared Rumoca optimizer accepts cpu or gpu.
import {trainingPhysics} from '../viewer/training-physics.mjs';
import {openTrainingUpdate} from '../viewer/diver-training-update.mjs';

function random(seed){
  return ()=>{
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    return (seed+.5)/4294967296;
  };
}

function scenario(draw){
  const signed=()=>2*draw()-1;
  return {
    initialState:[0,-28,6,0,2,-25,2,6,0,-900,-200,-7,Math.PI*signed(),0,0,0,0],
    initialFish:[1+2*draw(),0,.15*signed(),0,Math.PI*signed(),0,0,0,0,.12*signed()],
    sharkPilot:[1,.50*signed(),draw(),-1],sharkTurn:.85*signed(),sharkBank:.75*signed(),
    currentVelocity:[.35*signed(),.35*signed()],sharkDirect:2
  };
}

export async function trainShark({rounds=24,pairs=4,backend='gpu',cudaRounds=0,onProgress=console.log}={}){
  if(!Number.isInteger(rounds)||rounds<1||!Number.isInteger(pairs)||pairs<2||pairs%2)throw Error('Use a positive round count and an even pair count.');
  if(!Number.isInteger(cudaRounds)||cudaRounds<0||cudaRounds>rounds)throw Error('CUDA rounds must fit the run.');
  const browserPlant=await trainingPhysics('cpu','HarborTraffic');
  let devicePlant;
  const optimizer=await openTrainingUpdate(backend);
  const draw=random(44327);
  const normal=()=>Math.sqrt(-2*Math.log(draw()))*Math.cos(2*Math.PI*draw());
  const zero=()=>Array.from({length:10},()=>[0]);
  let state={weights:zero(),m:zero(),v:zero(),step:0};
  const rewardKey='whiteShark.trackingReward';
  async function swim(plant,inputs){
    const sharks=await plant.reset(inputs,[rewardKey]);
    const rewards=sharks.map(()=>Array(6).fill(0));
    for(let segment=0;segment<6;segment++){
      for(let tick=1;tick<=48;tick++){
        const sample=tick%8===0;
        await plant.advance(sharks,.01,sample?[rewardKey]:[]);
        if(sample)sharks.forEach((shark,i)=>{rewards[i][segment]+=shark.get(rewardKey)/6;});
      }
    }
    if(!rewards.every(row=>row.every(Number.isFinite)))throw Error('Nonfinite shark rollout');
    return rewards;
  }
  async function evaluate(seed,count,weights){
    const draw=random(seed);
    const inputs=Array.from({length:count},()=>({...scenario(draw),sharkPolicyWeights:weights}));
    const rewards=await swim(browserPlant,inputs);
    return rewards.flat().reduce((a,b)=>a+b,0)/(count*6);
  }
  try{
    let weights=state.weights.flat(),bestRound=0;
    const baseline=await evaluate(9973,8,weights);
    let best=baseline;
    for(let round=1;round<=rounds;round++){
      const lanes=[],noises=[],sigma=.15;
      for(let p=0;p<pairs;p++){
        const inputs=scenario(draw),noise=weights.map(normal);
        for(const sign of [1,-1]){
          const eps=noise.map(value=>value*sign);
          const trial=state.weights.map(([value],i)=>value+sigma*eps[i]);
          lanes.push({...inputs,sharkPolicyWeights:trial});
          noises.push(eps);
        }
      }
      if(round>rounds-cudaRounds)devicePlant??=await trainingPhysics('cuda','HarborTraffic');
      const rewards=await swim(devicePlant??browserPlant,lanes);
      const episodes=rewards.map((row,i)=>row.map((reward,t)=>({features:[Number(t===0)],eps:noises[i],reward})));
      state=await optimizer.update(episodes,state,{sigma,learningRate:.045});
      if(round%4===0||round===rounds){
        const score=await evaluate(9973,8,state.weights.flat());
        if(score>best){weights=state.weights.flat();best=score;bestRound=round;}
        onProgress({round,validation:score,bestRound});
      }
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const test={baseline:await evaluate(85391,24,zero().flat()),trained:await evaluate(85391,24,weights)};
    return {weights,rounds,pairs,bestRound,validation:{baseline,trained:best},test,
      testScenarios:24,secondsPerEpisode:2.88,cudaRounds,cudaSteps:devicePlant?.dispatches??0,optimizer:optimizer.adapter};
  }finally{optimizer.close();browserPlant.close();devicePlant?.close();}
}
