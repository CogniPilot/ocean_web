// Batch constraints belong to the learner and physics backend. Calibrate with
// real, disposable rollout steps before fixing the population for a run.
function capacityError(error){
  return /memory|allocat|capacity|resources|reservation/i.test(error.message);
}

async function probeRate(count,probe){
  const {milliseconds,steps}=await probe(count);
  const elapsed=milliseconds/steps;
  if(!Number.isFinite(elapsed)||elapsed<=0)throw Error('Invalid batch timing');
  return {elapsed,rate:1000*count/elapsed};
}

async function calibrateThroughput({groupSize,limit,probe,onProbe}){
  const samples=[];
  let best,unavailable=Infinity;
  async function measure(count){
    onProbe(count,best);
    let rate;
    try{({rate}=await probeRate(count,probe));}
    catch(error){
      if(!best||!capacityError(error))throw error;
      unavailable=Math.min(unavailable,count);
      return false;
    }
    const sample={count,rate};samples.push(sample);
    if(!best||rate>best.rate)best=sample;
    return true;
  }
  for(let count=groupSize;;count=Math.min(limit,count*2)){
    if(!await measure(count)||count===limit)break;
  }
  // Fill the two gaps beside the strongest coarse sample, including a gap
  // below a batch that failed to allocate. Then favor more frequent updates
  // on the measured throughput plateau.
  const center=best.count;
  const index=samples.indexOf(best);
  const lower=samples[index-1]?.count??center;
  const upper=samples[index+1]?.count??Math.min(unavailable,limit);
  for(const bound of [lower,upper]){
    const count=Math.floor((bound+center)/(2*groupSize))*groupSize;
    if(count>Math.min(bound,center)&&count<Math.max(bound,center)&&count<unavailable&&
      !samples.some(sample=>sample.count===count))await measure(count);
  }
  return Math.min(...samples.filter(sample=>sample.rate>=best.rate*.95).map(sample=>sample.count));
}

export async function calibrateCount({groupSize,maximum,probe,onProbe,stepSeconds,stepsToUpdate=1,targetUpdateMs=60000,maximizeThroughput=false}){
  let selected=0,bestRate=0,previousRate=0,firstLatency;
  const limit=Math.floor(maximum/groupSize)*groupSize;
  if(limit<groupSize)throw Error('Insufficient capacity for one training group');
  if(maximizeThroughput)return calibrateThroughput({groupSize,limit,probe,onProbe});
  for(let count=groupSize;;count=Math.min(limit,count*2)){
    onProbe(count);
    let elapsed,rate;
    try{({elapsed,rate}=await probeRate(count,probe));}
    catch(error){
      if(!selected||!capacityError(error))throw error;
      break;
    }
    firstLatency??=elapsed;
    // Keep up with the physics clock if the device can. When even a single
    // instance falls behind, add lanes only while batch latency stays comparable.
    const latencyBudget=Math.max(Math.min(stepSeconds*1000,targetUpdateMs/stepsToUpdate),firstLatency*1.15);
    // Prefer the larger population on a throughput plateau while a single
    // step is short enough to give the live view regular pose updates.
    if(!selected||(rate>=bestRate*.90&&elapsed<=latencyBudget))selected=count;
    if(count===limit||elapsed>latencyBudget||(previousRate&&rate<previousRate*.75))break;
    bestRate=Math.max(bestRate,rate);previousRate=rate;
  }
  return selected;
}
