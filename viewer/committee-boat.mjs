// Render the Montauk's molded hull and deck fittings in the committee boat frame.
export function drawMontauk(T,boat,pad,{mesh,rod,mat,white,navy,metal}){
  const rubber=mat(0x172025,.76),gelcoat=mat(0xf0ede3,.31),liner=mat(0xdedbd0,.83);
  const red=mat(0x9b292a,.48),cushion=mat(0xe6e1cf,.84),seam=mat(0xa9a18e,.85);
  const stainless=mat(0xb7c3c7,.23);stainless.metalness=.68;
  const canvas=mat(0x10232a,.95),dash=mat(0x232d31,.78);
  const box=(x,y,z,dx,dy,dz,material=gelcoat)=>mesh(boat,new T.BoxGeometry(dx,dy,dz),material,x,y,z);
  function tube(points,radius,material=stainless,closed=false){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal');
    return mesh(boat,new T.TubeGeometry(curve,Math.max(10,points.length*4),radius,8,closed),material,0,0,0);
  }
  function rounded(x,y,z,length,width,depth,radius,material,bevel=.012){
    const a=length/2-bevel,b=width/2-bevel,r=radius-bevel;
    const shape=new T.Shape();
    shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r);
    shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);
    shape.lineTo(-a+r,b);shape.quadraticCurveTo(-a,b,-a,b-r);
    shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b);
    const geometry=new T.ExtrudeGeometry(shape,{depth:depth-2*bevel,bevelSegments:2,
      bevelSize:bevel,bevelThickness:bevel,curveSegments:4});
    geometry.translate(0,0,bevel-depth/2);
    return mesh(boat,geometry,material,x,y,z);
  }
  function patch(rows,material){
    const points=rows.flatMap(row=>row.flat()),indices=[],cols=rows[0].length;
    for(let i=1;i<rows.length;i++)for(let j=1;j<cols;j++){
      const a=(i-1)*cols+j-1,b=a+cols;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return mesh(boat,geometry,material,0,0,0);
  }
  const stations=[[-2.91,.90,.78],[-2.59,1.10,.775],[-1.45,1.185,.775],[-.65,1.215,.78],
    [.43,1.215,.80],[1,1.18,.82],[1.65,1.035,.86],[2.10,.84,.91],[2.52,.57,.958],[2.83,.23,1.002],[2.98,.03,1.018]];
  const hullMaterial=gelcoat.clone(),deckMaterial=liner.clone(),capMaterial=white.clone();
  for(const material of [hullMaterial,deckMaterial,capMaterial,red])material.side=T.DoubleSide;
  // The strake and chine have separate normals so they still read under flat daylight.
  const section=(x,w,top)=>{
    const rake=.62*(Math.max(0,x-1.65)/1.33)**2;
    return [[x,w,top],[x-.06*rake,.976*w,top-.106],[x-.09*rake,.955*w,top-.123],
      [x-.42*rake,.90*w,top-.50],[x-.46*rake,.91*w,top-.523],[x-.66*rake,.59*w,top-.91+.16*rake],
      [x-rake,0,top-1.08+.48*Math.max(0,x-1.55)/1.43]];
  };
  for(const side of [-1,1]){
    const sections=stations.map(args=>section(...args).map(([x,y,z])=>[x,side*y,z]));
    for(let band=1;band<sections[0].length;band++){
      const material=band===2?red:hullMaterial;
      const rows=sections.map(row=>side<0?row.slice(band-1,band+1).reverse():row.slice(band-1,band+1));
      patch(rows,material);
    }
    const gunwale=stations.map(([x,w,z])=>[x,side*w,z]);
    tube(gunwale,.024,rubber);
    tube(gunwale.map(([x,y,z])=>[x,1.004*y,z+.003]),.009,navy);
    patch(stations.map(([x,w,z])=>{
      const floor=.47+.32*Math.max(0,x-1.50)/1.48;
      return [[x,side*(w-.001),z],[x,side*Math.max(0,w-.09),z-.012],
        [x,side*Math.max(0,w-.125),z-.053],[x,side*Math.max(0,w-.18),floor+.032],
        [x,side*Math.max(0,w-.21),floor]];
    }),capMaterial);
  }
  patch(stations.map(([x,w])=>{
    const floor=.47+.32*Math.max(0,x-1.50)/1.48,edge=Math.max(0,w-.21);
    return [[x,-edge,floor],[x,0,floor],[x,edge,floor]];
  }),deckMaterial);
  for(const station of [stations[0],stations.at(-1)])
    patch(section(...station).map(([x,y,z])=>[[x,-y,z],[x,y,z]]),hullMaterial);
  const [tailX,tailWidth,tailZ]=stations[0];
  tube([[tailX,-tailWidth,tailZ],[tailX,-.46,tailZ],[tailX,.46,tailZ],[tailX,tailWidth,tailZ]],.024,rubber);
  for(const side of [-1,1]){
    const rail=[[.83,side*1.08,1.17],[1.52,side*.98,1.20],[2.19,side*.70,1.28],[2.76,side*.27,1.25],[2.96,0,1.20]];
    tube(rail,.015);
    for(const [x,y,z] of rail.slice(0,4)){
      const base=.805+.12*Math.max(0,x-1);
      rod(boat,[x,y,base],[x,y,z],.012,stainless);
      rod(boat,[x,y,base-.005],[x,y,base+.004],.034,stainless);
    }
    const sternRail=[[-2.80,side*.82,.86],[-2.72,side*.86,1.07],[-2.21,side*1.00,1.07],[-2.15,side*1.02,.83]];
    tube(sternRail,.014);
    for(const [x,y,z] of [[1.36,side*1.01,.854],[-2.54,side*.94,.79]]){
      box(x,y,z,.14,.044,.018,stainless);
      rod(boat,[x-.068,y,z+.026],[x+.068,y,z+.026],.010,stainless);
      for(const dx of [-.041,.041])rod(boat,[x+dx,y,z],[x+dx,y,z+.026],.011,stainless);
    }
    const cockpitDrain=mesh(boat,new T.TorusGeometry(.029,.005,5,12),stainless,-2.87,side*.48,.506);
    cockpitDrain.rotation.y=Math.PI/2;
  }
  rod(boat,[2.88,0,1.02],[3.06,0,1.06],.029,metal);
  rod(boat,[3.037,-.038,1.055],[3.037,.038,1.055],.048,rubber);

  const [padX,padY,padZ,padLength,padWidth]=pad??[];
  if(pad&&padZ<1.5){
    rounded(padX,padY,padZ-.039,padLength+.025,padWidth+.025,.078,.067,gelcoat,.011);
    rounded(padX,padY,(padZ+.54)/2,padLength,padWidth,padZ-.54,.067,gelcoat);
  }else{
    const bowSeat=[[[1.43,-.86],[1.43,-.58]],[[1.91,-.73],[1.89,-.45]],
    [[2.30,-.53],[2.18,-.25]],[[2.58,-.28],[2.34,0]],[[2.67,0],[2.34,0]],
    [[2.58,.28],[2.34,0]],[[2.30,.53],[2.18,.25]],[[1.91,.73],[1.89,.45]],[[1.43,.86],[1.43,.58]]];
    patch(bowSeat.map(row=>row.map(([x,y])=>[x,y,.731])),gelcoat);
    patch(bowSeat.map(([,[x,y]])=>[[x,y,.535],[x,y,.731]]),gelcoat);
    patch(bowSeat.map(row=>row.map(([x,y],i)=>[x+.011*(i?1:-1),y*(i?1.019:.983),.768])),cushion);
  }
  rounded(.63,0,.75,.50,.60,.56,.085,gelcoat);
  rounded(.68,0,1.041,.42,.62,.092,.094,cushion);
  rounded(.432,0,1.165,.103,.615,.192,.035,cushion);
  rounded(0,0,.985,.93,.746,1.025,.086,gelcoat);
  rounded(-.025,0,1.50,.899,.73,.092,.078,gelcoat);
  box(-.479,0,1.187,.014,.52,.365,white);
  box(-.489,.19,1.214,.010,.055,.018,stainless);
  for(const z of [1.06,1.32])box(-.489,-.232,z,.021,.043,.025,stainless);
  const glass=new T.MeshPhysicalMaterial({color:0x597980,roughness:.14,metalness:.16,
    opacity:.54,transparent:true,depthWrite:false,side:T.DoubleSide});
  patch([[[.42,-.39,1.590],[.42,.39,1.590]],[[.347,-.365,1.96],[.347,.365,1.96]]],glass);
  tube([[.42,-.39,1.59],[.347,-.365,1.96],[.347,.365,1.96],[.42,.39,1.59]],.012);
  const helm=box(-.389,0,1.52,.045,.625,.20,dash);helm.rotation.y=-.28;
  for(const y of [-.16,.02]){
    rod(boat,[-.407,y,1.56],[-.431,y,1.56],.054,stainless);
    rod(boat,[-.432,y,1.56],[-.435,y,1.56],.044,navy);
    rod(boat,[-.437,y-.021,1.548],[-.437,y+.015,1.574],.002,white);
  }
  box(-.417,.185,1.586,.016,.139,.06,navy);
  box(-.428,.185,1.586,.008,.12,.044,mat(0x667c79,.35));
  const wheel=mesh(boat,new T.TorusGeometry(.122,.013,8,24),rubber,-.508,-.115,1.39);
  wheel.rotation.y=Math.PI/2;
  for(let i=0;i<3;i++){
    const angle=2*Math.PI*i/3;
    rod(boat,[-.508,-.115,1.39],[-.508,-.115+.115*Math.cos(angle),1.39+.115*Math.sin(angle)],.007,stainless);
  }
  rod(boat,[-.51,-.115,1.39],[-.45,-.115,1.39],.029,stainless);
  rod(boat,[-.40,.26,1.43],[-.48,.26,1.52],.012,stainless);
  rod(boat,[-.48,.24,1.52],[-.48,.28,1.52],.019,rubber);

  for(const y of [-.53,.53]){
    tube([[.59,y,.47],[.59,y,.99],[.53,y,1.50],[.46,y,1.96],[.57,y,2.30]],.026);
    tube([[-.67,y,.47],[-.69,y,1.02],[-.77,y,1.62],[-.75,y,2.31]],.026);
    rod(boat,[-.75,y,1.96],[.55,y,1.96],.016,stainless);
    rod(boat,[-.75,y,1.93],[-.48,y,2.29],.015,stainless);
  }
  rounded(0,0,2.328,1.85,1.45,.064,.145,canvas,.012);
  rounded(0,0,2.296,1.84,1.44,.026,.19,stainless,.010);
  for(const x of [-.67,.68])rod(boat,[x,-.60,2.28],[x,.60,2.28],.018,stainless);
  for(const y of [-.46,-.23,0,.23,.46])rod(boat,[-.90,y,2.228],[-.832,y,2.341],.018,stainless);
  for(const y of [-.28,.28])rounded(-.43,y,2.272,.225,.075,.015,.022,white,.004);

  rounded(-1.22,0,.697,.59,1.05,.454,.065,gelcoat);
  rounded(-1.22,0,.957,.64,1.09,.111,.102,cushion);
  rounded(-.920,0,.683,.021,.67,.274,.044,white,.006);
  box(-.905,.215,.732,.019,.052,.016,stainless);
  for(const y of [-.47,.47])tube([[-1.02,y,.58],[-1.45,y,.70],[-1.53,y,.97],[-1.55,y,1.24]],.016);
  const back=rounded(-1.55,0,1.203,.095,1.09,.239,.042,cushion);
  back.rotation.y=-.08;
  rod(boat,[-1.47,0,1.008],[-.954,0,1.008],.0028,seam);
  for(const height of [1.16,1.23])rod(boat,[-1.501,-.461,height],[-1.501,.461,height],.0028,seam);
  for(const y of [-.59,.59]){
    rounded(-2.55,y,.63,.54,.49,.316,.08,gelcoat);
    rounded(-2.51,y,.808,.49,.47,.074,.075,cushion);
    for(const side of [-1,1])rod(boat,[-2.76,y+side*.135,.81],[-2.78,y+side*.135,.934],.012,stainless);
    rounded(-2.79,y,.972,.078,.445,.168,.036,cushion);
  }
  rounded(-2.60,0,.519,.59,.66,.098,.074,gelcoat);
  tube([[-2.75,-.42,.61],[-2.74,-.39,1.21],[-2.85,-.28,1.36],
    [-2.85,.28,1.36],[-2.74,.39,1.21],[-2.75,.42,.61]],.021,white);
}
