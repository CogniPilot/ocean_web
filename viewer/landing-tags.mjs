// tag36h11 artwork from AprilRobotics/apriltag-imgs. Each tag's full
// ten-cell square includes the required one-cell white quiet zone.
const layouts={committee:[0,1,4,5,6],island:[2,3,7,8,9]};

export function padLayout(site,width,length){
  const wide=width>=length;
  const longEdge=Math.max(width,length),shortEdge=Math.min(width,length);
  const edge=Math.min(.02,.02*shortEdge),gap=Math.min(.012,.015*shortEdge);
  // The centered marker stays visible as the field of view shrinks at touchdown.
  const center=Math.min(.146,.10*shortEdge);
  const acquisition=Math.min(shortEdge-2*edge,(longEdge-center-2*(edge+gap))/2);
  const spread=center/2+gap+acquisition/2;
  const corner=(shortEdge-acquisition)/2-edge;
  const offset=.94*corner;

  // Offset the acquisition markers toward opposite corners so the intermediate
  // markers can stay close to center without using either one's quiet zone.
  const band=corner+offset-gap;
  const near=Math.max(center,Math.min(.47,.19*shortEdge,band));
  const nearAlong=band>=center ? center/2+gap+near/2 : 0;
  const nearAcross=band>=center ? Math.max(0,acquisition/2-offset+gap+near/2) : .32*shortEdge;
  const positions=[[-spread,offset,acquisition],[spread,-offset,acquisition],[0,0,center],
    [-nearAlong,-nearAcross,near],[nearAlong,nearAcross,near]];

  return layouts[site].map((id,i)=>{
    const [along,across,size]=positions[i];
    return {id,x:wide?along:across,y:wide?across:along,size};
  });
}

export function padMaterial(T,site,width,length){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=Math.round(512*length/width);
  const context=canvas.getContext('2d');
  context.fillStyle='#202c32';context.fillRect(0,0,canvas.width,canvas.height);
  context.imageSmoothingEnabled=false;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  for(const tag of padLayout(site,width,length)){
    const asset=new URL('./assets/landing-tags/'+tag.id+'.png',import.meta.url);
    asset.search=new URL(import.meta.url).search;
    const image=new Image();
    image.onload=()=>{
      const scale=canvas.width/width,size=tag.size*scale;
      context.drawImage(image,canvas.width/2+tag.x*scale-size/2,canvas.height/2-tag.y*scale-size/2,size,size);
      texture.needsUpdate=true;
    };
    image.src=asset.href;
  }
  return new T.MeshStandardMaterial({
    map:texture,roughness:.91,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:0
  });
}

export async function createLandingTagDetector(width,height){
  const {default:createModule}=await import('./vendor/apriltag-wasm.mjs');
  const binary=new URL('./vendor/apriltag-wasm.wasm',import.meta.url);
  binary.search=new URL(import.meta.url).search;
  const wasm=await createModule({locateFile:()=>binary.href});
  const wrap=(name,count)=>wasm.cwrap('atagjs_'+name,'number',Array(count).fill('number'));
  const init=wrap('init',0),buffer=wrap('set_img_buffer',3),detect=wrap('detect',0);
  const options=wrap('set_detector_options',7),destroy=wrap('destroy',0);
  init();options(1,0,1,1,0,0,0);
  const image=buffer(width,height,width),decoder=new TextDecoder();
  return {
    detect(pixels){
      const heap=wasm.HEAPU8;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const rgba=4*((height-1-y)*width+x);
        heap[image+y*width+x]=.213*pixels[rgba]+.715*pixels[rgba+1]+.072*pixels[rgba+2];
      }
      const pointer=detect(),length=wasm.getValue(pointer,'i32');
      const bytes=wasm.getValue(pointer+4,'i32');
      return length?JSON.parse(decoder.decode(wasm.HEAPU8.subarray(bytes,bytes+length))):[];
    },
    dispose(){destroy();}
  };
}
