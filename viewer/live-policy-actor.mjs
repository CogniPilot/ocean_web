// The same Rumoca FMI actor evaluates a policy row in training and in play.
// A realm shares one stateless reactor. Each synchronous call writes all inputs.
const directory=new URL('./assets/diver-policy/',import.meta.url);
let actorPromise;
async function loadActor(){
  const resources=await Promise.all(['live-actor.json','live-actor.wasm'].map(async name=>{
    const response=await fetch(new URL(name,directory));
    if(!response.ok)throw Error('Cannot load '+name);
    return name.endsWith('.json')?response.json():response.arrayBuffer();
  }));
  const [{vars},binary]=resources;
  const {instance}=await WebAssembly.instantiate(binary,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
  const m=instance.exports;
  const check=status=>{if(status>1)throw Error('LiveActor FMI status '+status);};
  m._initialize();check(m.create_instance(m.token()));check(m.initialize());
  const maximum=vars.features[1];
  function write(key,values){
    const buffer=new Float64Array(m.memory.buffer,m.buffer(),maximum);
    buffer.fill(0);buffer.set(values);check(m.set_reals(vars[key][0],maximum));
  }
  return {decide(weights,features,noise,sigma=0,linear=false){
    if(!features.length||features.length>maximum||!features.every(Number.isFinite))throw Error('Invalid policy observation');
    write('features',features);
    return weights.map((row,i)=>{
      if(row.length!==features.length)throw Error('Policy feature count differs from the checkpoint');
      write('weights',row);check(m.set_real(vars.perturbation[0],noise?sigma*noise[i]:0));
      check(m.read_real(vars[linear?'mean':'action'][0],1));
      const output=new Float64Array(m.memory.buffer,m.buffer(),1)[0];
      if(!Number.isFinite(output))throw Error('Nonfinite policy action');
      return output;
    });
  }};
}
export function openPolicyActor(){
  actorPromise??=loadActor().catch(error=>{actorPromise=null;throw error;});
  return actorPromise;
}

// Render loops and FMI workers keep writing their normal pilot inputs at their
// own cadence. Reapply the held action between the learned decision instants.
export function createPlayablePolicy(task){
  let reactor,loading,failed,previous,nextTime=0,held;
  return (model,scenario,checkpoint)=>{
    if(!checkpoint){previous=null;failed=null;return false;}
    if(checkpoint===failed)return false;
    if(!reactor){
      loading??=openPolicyActor().then(value=>{reactor=value;})
        .catch(error=>{failed=checkpoint;console.warn('Policy controller:',error);}).finally(()=>{loading=null;});
      return false;
    }
    try{
      const now=model.time,period=task.dt*task.ticksPerDecision;
      if(checkpoint!==previous||now>=nextTime-1e-8||now<nextTime-period-1e-8){
        held=reactor.decide(checkpoint.weights,task.observe(model,scenario),undefined,0,task.linear);
        nextTime=now+period;previous=checkpoint;
      }
      task.act(model,scenario,held);
      return true;
    }catch(error){
      failed=checkpoint;console.warn(task.label+' policy stopped:',error);return false;
    }
  };
}
