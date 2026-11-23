// Each tab has a random transport ID. Derive the same roster on every peer
// regardless of message arrival order. Only these reviewed names reach the UI.
const names=[
  'Ada','Amir','Avery','Beatrice','Caleb','Cameron','Dalia','Diego',
  'Emery','Fatima','Felix','Harper','Hugo','Imani','Isabel','Jamie',
  'Jules','Kai','Leila','Leo','Linh','Maya','Morgan','Nico',
  'Noor','Oliver','Priya','Quinn','Rafael','Robin','Sofia','Theo'
];

export function isCaptainName(value){
  if(typeof value!=='string'||value.length>40)return false;
  const match=/^Captain ([A-Za-z]+)(?: ([1-9]\d*))?$/.exec(value);
  return !!match&&names.includes(match[1]);
}
