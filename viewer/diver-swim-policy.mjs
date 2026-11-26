// FMI I/O for the Rumoca-generated controller. All policy, stroke and reward
// equations are compiled from viewer/board/DiverSwimPolicy.mo.
export const decisionSteps=40;
const directory=new URL('./assets/diver-policy/',import.meta.url);
const binaryUrl=new URL('swim-policy.wasm',directory);
const shipWeights=new URL('swim-weights.json',directory);
let assets,sharedReactor;
const retired=typeof FinalizationRegistry==='function'?new FinalizationRegistry(({m,handle})=>m.release_instance(handle)):null;
export async function loadSwimPolicy(read=fetch,weights){
  assets??=Promise.all([
    read(binaryUrl).then(r=>r.arrayBuffer()).then(b=>WebAssembly.compile(b)),
    read(new URL('swim-policy.json',directory)).then(r=>r.json()),
    read(shipWeights).then(r=>r.json())
  ]).catch(error=>{assets=undefined;throw error;});
  const [module,metadata,checkpoint]=await assets;
  // libc uses these imports for its optional stdio error stream. The reactor
  // opens no files and has no host descriptors. WASI errno BADF = 8.
  const wasi={fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8};
  async function instantiate(){
    const {exports:m}=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi});
    m._initialize();return m;
  }
  const pooled=WebAssembly.Module.exports(module).some(e=>e.name==='select_instance');
  const m=await (pooled?(sharedReactor??=instantiate().catch(e=>{sharedReactor=undefined;throw e;})):instantiate());
  let handle=0,disposed=false;
  function select(){
    if(disposed)throw Error('Diver swim policy is closed');
    if(pooled)m.select_instance(handle);
  }
  function dispose(){
    if(!disposed&&pooled){m.release_instance(handle);retired?.unregister(lifetime);}
    disposed=true;
  }
  const lifetime={};
  const check=s=>{if(s>1)throw Error('DiverSwimPolicy FMI status '+s);};
  const pointer=m.buffer();
  function set(key,value){
    select();
    const [vr,n]=metadata.vars[key];
    if(n===1){check(m.set_real(vr,value));return;}
    if(value.length!==n)throw Error('DiverSwimPolicy '+key+' dimension mismatch');
    new Float64Array(m.memory.buffer,pointer,n).set(value);check(m.set_reals(vr,n));
  }
  function get(key){
    select();
    const [vr,n]=metadata.vars[key];check(m.read_real(vr,n));
    const values=new Float64Array(m.memory.buffer,pointer,n);return n===1?values[0]:Array.from(values);
  }
  // FMI settles a Modelica algebraic model on every public observation. Batch
  // fields from the same state before setting any part of the next state.
  const requests=new Map();
  function getMany(keys){
    select();
    if(!m.read_batch)return keys.map(get);
    let request=requests.get(keys);
    if(!request){
      const variables=keys.map(key=>metadata.vars[key]);
      request={variables,total:variables.reduce((sum,[,n])=>sum+n,0)};
      requests.set(keys,request);
    }
    const refs=new Uint32Array(m.memory.buffer,m.reference_buffer(),keys.length);
    request.variables.forEach(([ref],i)=>{refs[i]=ref;});
    check(m.read_batch(keys.length,request.total));
    const values=new Float64Array(m.memory.buffer,pointer,request.total);
    let i=0;return request.variables.map(([,n])=>{
      const value=n===1?values[i]:Array.from(values.subarray(i,i+n));i+=n;return value;
    });
  }
  const strokeFields=['jointAction','lateralAction','axialAction','verticalAction','nextTrim','glideAssist'];
  const decisionFields=['decision','features'];
  check(m.create_instance(m.token()));
  if(pooled)handle=m.current_instance();
  try{set('weights',(weights??checkpoint.weights).flat());check(m.initialize());}
  catch(error){dispose();throw error;}
  const controller={dispose,
    batchSeed(seed){set('seed',seed);return {seed:get('nextBatchSeed'),trial:get('trainingSeed')};},
    average(rows){
      let total=[0,0,0,0,0];
      for(let i=0;i<rows.length;i++){set('previousTotal',total);set('batchElement',rows[i]);set('sampleCount',i+1);total=get('batchTotal');}
      return get('batchMean');
    },
    trial(seed){set('seed',seed);return {start:get('trialPose'),flow:get('trialCurrent'),depth:get('trialDepth'),seed:get('nextTrialSeed')};},
    explore(seed,sign,sigma){set('seed',seed);set('noiseSign',sign);set('sigma',sigma);return {eps:get('perturbation'),seed:get('nextNoiseSeed')};},
    command(current,drive,turn,pitch=0,roll=0,fast=false,strafe=0,vertical=0,torch=false){set('translationStick',[strafe,vertical]);set('torch',torch?1:0);set('fast',fast?1:0);set('current',current);set('command',[drive,turn]);set('attitudeStick',[pitch,roll]);},
    targets(){return get('targets');},
    restoreTrim(state){set('previousTrim',state.slice(7,9));},
    decide(state,noise=Array(8).fill(0)){
      set('state',state);set('noise',noise);
      const [action,features]=getMany(decisionFields);set('held',action);
      return features;
    },
    stroke(model,state){
      set('state',state);
      const [joints,lateral,axial,vertical,trim,glide]=getMany(strokeFields);
      model.set('jointAction',joints);model.set('lateralAction',lateral);model.set('axialAction',axial);
      if(model.has?.('verticalPilot'))model.set('verticalPilot',vertical);
      if(model.has?.('glideAssist'))model.set('glideAssist',glide);
      set('previousTrim',trim);
    },
    measure(state,time,depth,power,previous,count){set('state',state);set('rolloutTime',time);set('depth',depth);set('power',power);set('previousTotal',previous);set('sampleCount',count);return {total:get('total'),mean:get('mean')};}
  };
  if(pooled)retired?.register(controller,{m,handle},lifetime);
  return controller;
}
