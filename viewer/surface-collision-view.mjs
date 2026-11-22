const colors={
  sand:'rgba(235,206,136,.26)',rocks:'rgba(241,188,110,.68)',marks:'#ffac61',
  decks:'#a4e5ff',feet:'#7ff3e6',probes:'#f8ec9d'
};

// Rdd2Survey.landingContact, in each vehicle's forward/port/up frame.
const launchBoxes=[
  [[-1.98,0,.66],[.98,.86,.12]],
  [[1.54,0,.66],[.55,.67,.12]],
  [[2.42,0,.66],[.34,.32,.12]]
];
const hobieDeck=[[-.425,0,.40],[.975,.97,.014]];
const sloopDeck=[[-.27,0,.154],[.37,.20,.0045]];
const feet=[[.17,-.17,-.085],[.17,.17,-.085],[-.17,-.17,-.085],[-.17,.17,-.085]];

// Vertices at the intersections of Regatta.pyramidFace's four planes.
const tip=[0,0,1.65],radius=.85,halfBase=radius*Math.sqrt(3)/2;
const base=[[0,-radius,-.10],[halfBase,radius/2,-.10],[-halfBase,radius/2,-.10]];
const buoyWire=base.flatMap((corner,i)=>[...corner,...base[(i+1)%3],...corner,...tip]);

// Shore.pontoonSection uses linear interpolation between the measured sections.
const pontoon=[
  [-2.520,.090,.23078,-.01413],[-1.829,.160,.17658,-.19662],[-.876,.185,.13108,-.32376],
  [.018,.185,.09300,-.37000],[.697,.170,.08864,-.36619],[1.531,.125,.12129,-.32188],
  [1.960,.092,.16218,-.25766],[2.222,.060,.19239,-.15398],[2.353,.039,.21071,-.05985],
  [2.425,.027,.22181,.02938],[2.484,.015,.22656,.13093],[2.520,.004,.22648,.21482]
];
const hobieHull={spacing:1.02,stations:[-2.520,-1.9,-.9,.15,1.12,1.95,2.520],widths:[.09,.156,.185,.184,.155,.093,.009]};
const sloopHull={spacing:0,stations:[-1.1,-.82,-.3,.18,.63,.98,1.22],widths:[.22,.29,.335,.32,.235,.12,.01]};

// OceanMotorboat.hullContact's keel and chine samples.
const cruiserProbes=[
  -3.70,0,-.57, -2.70,0,-.70, -1.50,0,-.75, -.20,0,-.79,
  1.05,0,-.76, 2.05,0,-.62, 2.62,0,-.37, 3.25,0,-.13, 3.76,0,.25,
  -3.60,-.81,-.26, -3.60,.81,-.26, -1.55,-.99,-.32, -1.55,.99,-.32,
  .60,-.96,-.33, .60,.96,-.33, 2.45,-.58,-.14, 2.45,.58,-.14
];

function pontoonSection(x){
  const next=pontoon.findIndex(row=>row[0]>=x);
  if(next===0)return pontoon[0].slice(1);
  if(next<0)return pontoon.at(-1).slice(1);
  const a=pontoon[next-1],b=pontoon[next];
  const u=(x-a[0])/(b[0]-a[0]);
  return a.slice(1).map((value,i)=>value+u*(b[i+1]-value));
}

function sailingProbes({cat,stations,widths,spacing}){
  const defaults=cat?hobieHull:sloopHull;
  stations??=defaults.stations;widths??=defaults.widths;spacing??=defaults.spacing;
  const points=[];
  // Shore.islandContact samples each station and each adjacent midpoint.
  for(const offset of spacing>0?[spacing,-spacing]:[0]){
    for(let j=0;j<13;j++){
      const a=Math.floor(j/2),b=Math.ceil(j/2);
      const x=.5*(stations[a]+stations[b]);
      const [beam,deck,keel]=spacing>0?pontoonSection(x):[.5*(widths[a]+widths[b]),0,0];
      for(const side of [-1,0,1]){
        const fraction=side===0?1:.77;
        const z=spacing>0?deck+(keel-deck)*fraction:-.19*(.48+1.55*beam)*fraction;
        points.push(x,offset+side*.69*beam,z);
      }
    }
  }
  return points;
}

function sandWire(height){
  const nx=74,ny=62,points=[];
  for(let iy=0;iy<=ny;iy++)for(let ix=0;ix<=nx;ix++){
    const x=-29+58*ix/nx,y=-23+46*iy/ny;
    points.push([x,y,height(x,y)]);
  }
  const edges=[];
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    const i=y*(nx+1)+x;
    if(x<nx)edges.push(...points[i],...points[i+1]);
    if(y<ny)edges.push(...points[i],...points[i+nx+1]);
    // The solver splits cells along u+v=1 in Shore.islandContact.
    if(x<nx&&y<ny)edges.push(...points[i+1],...points[i+nx+1]);
  }
  return new Float32Array(edges);
}

function rockWires(T,island){
  const instances=[],wires=new Map(),local=new T.Matrix4();
  island.traverse(object=>{
    if(object.geometry?.type!=='IcosahedronGeometry')return;
    if(!wires.has(object.geometry)){
      const wire=new T.WireframeGeometry(object.geometry);
      wires.set(object.geometry,wire.attributes.position.array);
      wire.dispose();
    }
    const lines=wires.get(object.geometry);
    if(!object.isInstancedMesh){instances.push({frame:object,lines});return;}
    for(let i=0;i<object.count;i++){
      object.getMatrixAt(i,local);
      const frame=new T.Object3D();
      frame.matrixAutoUpdate=false;
      frame.matrix.multiplyMatrices(object.matrixWorld,local);
      frame.matrixWorld.copy(frame.matrix);
      instances.push({frame,lines});
    }
  });
  return instances;
}

export function surfaceCollisionShapes(T,island,committeeGroup,markGroups){
  island.updateWorldMatrix(true,true);
  const sand=sandWire(island.userData.chartTerrain.height),rocks=rockWires(T,island);
  const sailProbes=new WeakMap();
  return {draw(painter,boatGroup,hull,motorGroup,droneGroup){
    painter.lines(island,sand,colors.sand);
    for(const {frame,lines} of rocks)painter.lines(frame,lines,colors.rocks);
    for(const mark of markGroups??[]){
      mark.updateWorldMatrix(true,false);
      painter.lines(mark,buoyWire,colors.marks);
    }
    if(committeeGroup){
      committeeGroup.updateWorldMatrix(true,false);
      for(const [center,half] of launchBoxes)painter.box(committeeGroup,center,half,colors.decks);
    }
    if(boatGroup){
      boatGroup.updateWorldMatrix(true,false);
      const cat=hull?.cat??hull?.spacing>0;
      const [center,half]=cat?hobieDeck:sloopDeck;
      painter.box(boatGroup,center,half,colors.decks);
      let probes=sailProbes.get(boatGroup);
      if(!probes||probes.hull!==hull){
        probes={hull,points:sailingProbes({...hull,cat})};
        sailProbes.set(boatGroup,probes);
      }
      painter.points(boatGroup,probes.points,colors.probes);
    }
    if(motorGroup){
      motorGroup.updateWorldMatrix(true,false);
      painter.points(motorGroup,cruiserProbes,colors.probes);
    }
    if(droneGroup){
      droneGroup.updateWorldMatrix(true,false);
      for(const foot of feet)painter.sphere(droneGroup,foot,.015,colors.feet);
    }
  }};
}
