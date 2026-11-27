// Batch constraints belong to the learner and physics backend. Calibrate with
// real, disposable rollout steps before fixing the population for a run.
export async function calibrateCount({groupSize,maximum,probe,onProbe,stepSeconds,stepsToUpdate=1,targetUpdateMs=60000}){
  let selected=0,bestRate=0,previousRate=0,firstLatency;
  const limit=Math.floor(maximum/groupSize)*groupSize;
  if(limit<groupSize)throw Error('Insufficient capacity for one training group');
  for(let count=groupSize;;count=Math.min(limit,count*2)){
    onProbe(count);
    let elapsed;
    try{
      const sample=await probe(count);
      elapsed=sample.milliseconds/sample.steps;
    }catch(error){
      if(!selected||!/memory|allocat|capacity|resources|reservation/i.test(error.message))throw error;
      break;
    }
    if(!Number.isFinite(elapsed)||elapsed<=0)throw Error('Invalid batch timing');
    firstLatency??=elapsed;
    // Keep up with the physics clock if the device can. When even a single
    // instance falls behind, add lanes only while batch latency stays comparable.
    const latencyBudget=Math.max(Math.min(stepSeconds*1000,targetUpdateMs/stepsToUpdate),firstLatency*1.15);
    const rate=count/elapsed;
    // Prefer the larger population on a throughput plateau while a single
    // step is short enough to give the live view regular pose updates.
    if(!selected||(rate>=bestRate*.90&&elapsed<=latencyBudget))selected=count;
    if(count===limit||elapsed>latencyBudget||(previousRate&&rate<previousRate*.75))break;
    bestRate=Math.max(bestRate,rate);previousRate=rate;
  }
  return selected;
}
