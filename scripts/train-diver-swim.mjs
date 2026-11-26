// Train or evaluate the browser's joint-space swimmer on the shipped FMU.
// node scripts/train-diver-swim.mjs train build/diver-policy.json
// node scripts/train-diver-swim.mjs evaluate [build/diver-policy.json]
import {copyFile,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
const loadInstance=isMainThread?undefined:(await import(workerData.loader)).loadInstance;
import {loadSwimPolicy,decisionSteps} from '../viewer/diver-swim-policy.mjs';

const initial=Array.from({length:8},()=>Array(15).fill(0));
// Signed drive, yaw, trim, scull amplitude, pitch rate, roll rate,
// port speed and vertical trim responses seed the eight latent actions.
initial[0][1]=1;initial[0][8]=-.30;initial[1][2]=1;initial[1][11]=-.15;
initial[3][0]=.75;initial[4][3]=1.10;initial[5][4]=1.10;initial[6][5]=1;initial[7][6]=.3;
// [signed speed command, signed turn command, double-rate setting].
const commands=[[1,0,0],[-1,0,0],[1,0,1],[-1,0,1],[.55,0,0],[-.55,0,0],
  [.70,1,0],[.70,-1,0],[-.7,1,0],[-.7,-1,0],[.55,.65,1],[-.55,-.65,1],[0,1,1],[0,-1,0],[0,0,0],[0,0,1],
  [.55,0,0,.45,-.45,.55,.5,0],[-.55,.35,0,-.45,.45,-.55,-.5,1],
  [0,0,0,0,0,1,0,0],[0,0,1,0,0,-1,0,0],[.65,-.5,1,.35,0,.45,.4,1],
  [-.65,.5,1,-.25,.3,-.45,-.4,0],[.75,0,0,0,0,0,0,1],[0,0,0,0,0,0,-1,1]];
async function episode({seed,command,weights,sign=0,sigma=0,blocks=12,manual=false}){
  const read=async url=>new Response(await readFile(url)),controller=await loadSwimPolicy(read,weights);
  const [drive,turn,fast,pitch=0,roll=0,strafe=0,vertical=0,torch=0]=command,trial=controller.trial(seed);
  const {start,flow,depth}=trial;let noiseSeed=trial.seed;
  const model=await loadInstance('ScubaDiver',{initialState:start,bedHeight:-90,currentVelocity:flow,
    sprint:fast,lateralPilot:strafe,verticalPilot:vertical,torchEquipped:torch,neutralTrim:manual?0:1,policyMode:manual?0:1,pilot:[1,turn,pitch,drive,roll],meshCollision:1},read);
  controller.command(flow,drive,turn,pitch,roll,fast,strafe,vertical,!!torch);
  const history=[],blockMeans=[];
  for(let j=0;j<blocks;j++){
    let state=model.get('state');
    const draw=controller.explore(noiseSeed,sign,sigma);noiseSeed=draw.seed;
    const features=controller.decide(state,draw.eps);
    let total=[0,0,0,0,0],mean;
    for(let k=0;k<decisionSteps;k++){
      if(!manual)controller.stroke(model,state);
      model.advance(.01);state=model.get('state');
      ({total,mean}=controller.measure(state,model.time,depth,model.get('mechanicalPower'),total,k+1));
    }
    if(!mean.every(Number.isFinite))throw Error('Nonfinite FMU rollout');
    history.push({features,eps:draw.eps,reward:mean[0]});
    if(j>=blocks/2)blockMeans.push(mean);
  }
  return {history,blockMeans};
}

if(!isMainThread){
  parentPort.on('message',async job=>{try{parentPort.postMessage(await episode(job));}catch(e){parentPort.postMessage({error:e.stack});}});
}else{
  const [mode='evaluate',file]=process.argv.slice(2);
  // Every episode uses one immutable plant, even while a viewer build is published.
  const source=process.env.DIVER_RL_RUNTIME?resolve(process.env.DIVER_RL_RUNTIME):fileURLToPath(new URL('../viewer/fmi3/',import.meta.url));
  const frozen=await mkdtemp(join(tmpdir(),'diver-rollouts-'));
  const plantFiles=['instance.mjs','ScubaDiver.json','ScubaDiver.mjs','ScubaDiver.wasm'];
  const workers=[];
  try{
    const version=await readFile(join(source,'ScubaDiver.json'),'utf8');
    await Promise.all(plantFiles.map(name=>copyFile(join(source,name),join(frozen,name))));
    if(await readFile(join(frozen,'ScubaDiver.json'),'utf8')!==version||await readFile(join(source,'ScubaDiver.json'),'utf8')!==version)throw Error('The plant changed while copying its files. Retry the command.');
    const count=Number(process.env.DIVER_RL_WORKERS??8);
    if(!Number.isInteger(count)||count<1)throw Error('DIVER_RL_WORKERS must be a positive integer');
    const loader=pathToFileURL(join(frozen,'instance.mjs')).href;
    for(let i=0;i<count;i++)workers.push(new Worker(new URL(import.meta.url),{workerData:{loader}}));
    const experiment=await loadSwimPolicy(async url=>new Response(await readFile(url)));
    const jobs=async batch=>{
      let head=0;const out=new Array(batch.length);
      await Promise.all(workers.map(async worker=>{
        while(head<batch.length){
          const i=head++;
          out[i]=await new Promise((accept,reject)=>{worker.once('message',m=>m.error?reject(Error(m.error)):accept(m));worker.postMessage(batch[i]);});
        }
      }));return out;
    };
    async function evaluate(weights,seed,manual=false){
      const rows=await jobs(commands.flatMap((command,j)=>[0,1].map(k=>({seed:seed+53*j+k*1201,command,weights,manual,blocks:14}))));
      const average=experiment.average(rows.flatMap(r=>r.blockMeans));
      return Object.fromEntries(['score','speedError','turnError','attitude','power'].map((name,i)=>[name,average[i]]));
    }
    let scorer;
    try{
      if(mode==='train'){
        if(!file)throw Error('Supply a checkpoint output path');
        scorer=spawn('build/diver-policy-vjp/diver-policy-vjp',[],{stdio:['pipe','pipe','inherit']});
        const lines=createInterface({input:scorer.stdout})[Symbol.asyncIterator]();
        scorer.on('error',e=>{console.error(e.message);process.exit(1);});
        const scoreGradient=async input=>{scorer.stdin.write(JSON.stringify(input)+'\n');const line=await lines.next();if(line.done)throw Error('VJP process closed');const r=JSON.parse(line.value);if(r.error)throw Error(r.error);return r;};
        let schedule=58429;const sigma=.22;let weights=structuredClone(initial),mom=initial.map(r=>r.map(()=>0)),variance=structuredClone(mom);
        let best=await evaluate(weights,10100);
        console.log('Initial validation',best);
        const rounds=Number(process.env.DIVER_RL_ROUNDS??18);
        const fmuSHA256=createHash('sha256').update(await readFile(join(frozen,'ScubaDiver.wasm'))).digest('hex');
        const save=async round=>{const {rename}=await import('node:fs/promises');await writeFile(file+'.next',JSON.stringify({weights,round,fmuSHA256,validation:best},null,2)+'\n');await rename(file+'.next',file);};
        await save(0);
        for(let round=1;round<=rounds;round++){
          const trials=[];
          for(let pair=0;pair<commands.length;pair++){
            const command=commands[pair%commands.length],next=experiment.batchSeed(schedule),seed=next.trial;schedule=next.seed;
            for(const sign of [-1,1])trials.push({weights,seed,command,sign,sigma,blocks:10});
          }
          const episodes=(await jobs(trials)).map(result=>result.history);
          const {advantages}=await scoreGradient({op:'returns',gamma:.94,rewards:episodes.map(rows=>rows.map(row=>row.reward))});
          const samples=episodes.flat();
          // Each Gaussian logit is linear in all fifteen observations. Split
          // its additive score into the five-feature blocks compiled by Rumoca.
          // Every block uses the same sampled action, reward and Adam step.
          const updated=[];
          for(let first=0;first<weights[0].length;first+=5){
            const block=matrix=>matrix.map(row=>row.slice(first,first+5));
            updated.push(await scoreGradient({op:'update',features:block(samples.map(s=>s.features)),advantages:advantages.flat(),
              perturbations:samples.map(s=>s.eps),sigma,weights:block(weights),m:block(mom),v:block(variance),step:round-1,
              lr:.019,beta1:.90,beta2:.99,epsilon:1e-7}));
          }
          const join=name=>weights.map((_,i)=>updated.flatMap(result=>result[name][i]));
          weights=join('weights');mom=join('m');variance=join('v');
          if(round%3===0||round===rounds){
            const val=await evaluate(weights,10100);if(val.score>best.score){best=val;await save(round);}
            console.log('Validation',round,JSON.stringify(val));
          }
        }
      }else if(mode==='evaluate'){
        const challenger=file?JSON.parse(await readFile(file)).weights:undefined;
        for(const [label,weights,manual] of [['initial',initial,false],['manual',initial,true],['learned',challenger,false]]){
          console.log(label,JSON.stringify(await evaluate(weights,746593,manual)));
        }
      }else throw Error('Expected train or evaluate');
    }finally{scorer?.stdin.end();}
  }finally{await Promise.all(workers.map(worker=>worker.terminate()));await rm(frozen,{recursive:true,force:true});}
}
