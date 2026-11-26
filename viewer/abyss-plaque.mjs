// A cast bronze plate on a low stone footing at the eastern lip of the abyss.
export function abyssPlaque(T, parent, bed, stoneMaps) {
  const basin=bed.abyss;
  const east=basin.east+basin.eastRadius+1.9, north=basin.north+.95;
  const group=new T.Group();
  group.name='Cousteau plaque at the abyss overlook';
  group.position.set(east,north,bed.height(east,north)+.15);
  const forward=new T.Vector2(-1,-.34).normalize(), tilt=.43;
  const right=new T.Vector3(forward.y,-forward.x,0);
  const along=new T.Vector3(forward.x*Math.cos(tilt),forward.y*Math.cos(tilt),Math.sin(tilt));
  group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,along,right.clone().cross(along)));
  group.visible=false;
  parent.add(group);

  const loader=new T.TextureLoader(), maps=[];
  function makePlate() {
    const width=.92, height=width*9/16, hw=width/2, hh=height/2, corner=.026;
    const face=new T.Shape();
    face.moveTo(-hw+corner,-hh);face.lineTo(hw-corner,-hh);face.quadraticCurveTo(hw,-hh,hw,-hh+corner);
    face.lineTo(hw,hh-corner);face.quadraticCurveTo(hw,hh,hw-corner,hh);
    face.lineTo(-hw+corner,hh);face.quadraticCurveTo(-hw,hh,-hw,hh-corner);
    face.lineTo(-hw,-hh+corner);face.quadraticCurveTo(-hw,-hh,-hw+corner,-hh);
    const geometry=new T.ExtrudeGeometry(face,{depth:.012,bevelEnabled:true,bevelThickness:.0025,bevelSize:.0025,bevelSegments:1,curveSegments:4});
    const uv=geometry.attributes.uv, pos=geometry.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,T.MathUtils.clamp(pos.getX(i)/width+.5,0,1),T.MathUtils.clamp(pos.getY(i)/height+.5,0,1));
    for(const name of ['albedo','surface']){
      const url=new URL('./assets/subsea/cousteau-plaque-'+name+'.webp',import.meta.url);
      url.search=new URL(import.meta.url).search;
      const texture=loader.load(url.href);
      if(name==='albedo')texture.colorSpace=T.SRGBColorSpace;
      texture.anisotropy=4;
      maps.push(texture);
    }
    const bronze=new T.MeshStandardMaterial({map:maps[0],bumpMap:maps[1],bumpScale:.0018,
      roughnessMap:maps[1],roughness:1,metalnessMap:maps[1],metalness:.78});
    const plate=new T.Mesh(geometry,bronze);
    plate.name='“The sea, once it casts its spell, holds one in its net of wonder forever.” - Jacques Yves Cousteau';
    group.add(plate);

    // A weathered stone projects just beyond the metal and beds into the sand.
    const rim=[[-.43,-.29],[.31,-.30],[.50,-.21],[.51,.16],[.39,.29],[-.31,.30],[-.50,.22],[-.51,-.16]];
    const positions=[],coords=[];
    function triangle(a,b,c){for(const v of [a,b,c]){positions.push(...v);coords.push(v[0]+.6,v[1]+v[2]*.5+.4);}}
    const top=rim.map(([x,y])=>[x,y,-.005]);
    const foot=rim.map(([x,y])=>[x*1.05,y*1.08,-.24-y*.45]);
    for(let i=0;i<rim.length;i++){
      const k=(i+1)%rim.length;
      triangle([0,0,-.005],top[i],top[k]);triangle(top[k],top[i],foot[i]);triangle(top[k],foot[i],foot[k]);
    }
    const rock=new T.BufferGeometry();
    rock.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    rock.setAttribute('uv',new T.Float32BufferAttribute(coords,2));rock.computeVertexNormals();
    group.add(new T.Mesh(rock,new T.MeshStandardMaterial({map:stoneMaps[0],roughnessMap:stoneMaps[1],
      roughness:1,color:0xa59f91})));
  }
  return {
    update(eye){group.visible=eye.z< -4&&group.position.distanceToSquared(eye)<24*24;if(group.visible&&!group.children.length)makePlate();},
    dispose(){group.removeFromParent();for(const part of group.children){part.geometry.dispose();part.material.dispose();}for(const map of maps)map.dispose();}
  };
}
