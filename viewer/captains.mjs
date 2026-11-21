// Each tab has a random transport ID. Derive the same roster on every peer
// regardless of message arrival order. Only these reviewed names reach the UI.
const names=[
  'Ada','Amir','Avery','Beatrice','Caleb','Cameron','Dalia','Diego',
  'Emery','Fatima','Felix','Harper','Hugo','Imani','Isabel','Jamie',
  'Jules','Kai','Leila','Leo','Linh','Maya','Morgan','Nico',
  'Noor','Oliver','Priya','Quinn','Rafael','Robin','Sofia','Theo'
];

export function captainRoster(peerIds){
  const roster=new Map(),used=new Set();
  for(const id of [...new Set(peerIds)].sort()){
    let hash=2166136261;
    for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
    const first=(hash>>>0)%names.length;
    let offset=0,slot=first;
    while(used.has(slot)){
      offset++;
      const group=Math.floor(offset/names.length);
      slot=group*names.length+(first+offset)%names.length;
    }
    used.add(slot);
    const group=Math.floor(slot/names.length);
    roster.set(id,'Captain '+names[slot%names.length]+(group?' '+(group+1):''));
  }
  return roster;
}
