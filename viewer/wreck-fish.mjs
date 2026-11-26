import {wreckSites} from './red-sea-sites.mjs';

// Offsets are in the same local ENU frame as each registered hull. Side lanes
// leave room for a whole shoal to turn. Deck lanes clear the highest scanned
// triangle in the corresponding bow or stern patch, including mast fittings.
const lanes={
  yatush:[[6.4,-10,3.2],[-5,-6.1,1.5],[4.4,-6.1,2.7],[3.4,6.1,1.5],[-5,0,3.7]],
  satil:[[-26,-9.2,5.1],[-22.5,-7.4,2.4],[0,-7.4,3.5],[15,-7.4,1.8],[-12,7.4,2.0],
    [12,7.4,2.1],[-17,0,6.1],[16,0,6.1]]
};

export function wreckShoalLanes(){
  return wreckSites.flatMap(site=>lanes[site.id].map(([x,y,z],i)=>({
    east:site.east+x,north:site.north+y,rise:z-site.burial,species:i%2
  })));
}
