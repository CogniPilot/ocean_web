import {forEachGridEdge} from './physics-geometry.mjs';

const colors={
  sand:'rgba(235,206,136,.26)',rocks:'rgba(241,188,110,.68)',marks:'#ffac61',
  decks:'#a4e5ff',feet:'#7ff3e6',probes:'#f8ec9d'
};

// Rdd2Survey.landingContact, in each vehicle's forward/port/up frame.
const hobieDeck=[[-.425,0,.40],[.975,.97,.014]];
const sloopDeck=[[-.27,0,.154],[.37,.20,.0045]];

// Vertices at the intersections of Regatta.pyramidFace's four planes.
const tip=[0,0,1.65],radius=1.34,halfBase=radius*Math.sqrt(3)/2;
const base=[[0,-radius,-.10],[halfBase,radius/2,-.10],[-halfBase,radius/2,-.10]];
const buoyWire=base.flatMap((corner,i)=>[...corner,...base[(i+1)%3],...corner,...tip]);

const sloopHull={stations:[-1.1,-.82,-.3,.18,.63,.98,1.22],widths:[.22,.29,.335,.32,.235,.12,.01]};

// OceanMotorboat.hullContact's keel and chine samples.
const cruiserProbes=[
  -3.70,0,-.57, -2.70,0,-.70, -1.50,0,-.75, -.20,0,-.79,
  1.05,0,-.76, 2.05,0,-.62, 2.62,0,-.37, 3.25,0,-.13, 3.76,0,.25,
  -3.60,-.81,-.26, -3.60,.81,-.26, -1.55,-.99,-.32, -1.55,.99,-.32,
  .60,-.96,-.33, .60,.96,-.33, 2.45,-.58,-.14, 2.45,.58,-.14
];

function sloopProbes({stations,widths}){
  stations??=sloopHull.stations;widths??=sloopHull.widths;
  const points=[];
  // Shore.islandContact samples each station and each adjacent midpoint.
  for(let j=0;j<13;j++){
    const a=Math.floor(j/2),b=Math.ceil(j/2);
    const x=.5*(stations[a]+stations[b]),beam=.5*(widths[a]+widths[b]);
    for(const side of [-1,0,1]){
      const fraction=side===0?1:.77;
      points.push(x,side*.69*beam,-.19*(.48+1.55*beam)*fraction);
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
  forEachGridEdge(nx+1,ny+1,(i,j)=>edges.push(...points[i],...points[j]));
  return new Float32Array(edges);
}

function rockWires(T,island){
  const instances=[],wires=new Map(),local=new T.Matrix4();
  island.traverse(object=>{
    if(!object.userData.shoreRock)return;
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
  const sailProbes=new WeakMap(),prepared=new WeakSet();
  return {draw(painter,boatGroup,hull,motorGroup,droneGroup,cruiserMesh,committeeMesh,droneMesh){
    if(!prepared.has(painter)){
      painter.staticLines(island,sand,colors.sand);
      for(const {frame,lines} of rocks)painter.staticLines(frame,lines,colors.rocks);
      prepared.add(painter);
    }
    for(const mark of markGroups??[]){
      mark.updateWorldMatrix(true,false);
      painter.lines(mark,buoyWire,colors.marks);
    }
    if(committeeGroup&&committeeMesh){
      committeeGroup.updateWorldMatrix(true,false);
      painter.lines(committeeGroup,committeeMesh,colors.decks);
    }
    if(boatGroup){
      boatGroup.updateWorldMatrix(true,false);
      const cat=hull?.cat??hull?.spacing>0;
      const [center,half]=cat?hobieDeck:sloopDeck;
      painter.box(boatGroup,center,half,colors.decks);
      if(!cat){
        let probes=sailProbes.get(boatGroup);
        if(!probes||probes.hull!==hull){
          probes={hull,points:sloopProbes({...hull})};
          sailProbes.set(boatGroup,probes);
        }
        painter.points(boatGroup,probes.points,colors.probes);
      }
    }
    if(motorGroup&&!cruiserMesh){
      motorGroup.updateWorldMatrix(true,false);
      painter.points(motorGroup,cruiserProbes,colors.probes);
    }
    if(droneGroup&&droneMesh){
      droneGroup.updateWorldMatrix(true,false);
      painter.lines(droneGroup,droneMesh,colors.feet);
    }
  }};
}
