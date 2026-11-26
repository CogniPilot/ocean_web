within Wreck;
package WreckSolids "Harbor sensor and wildlife geometry sampled from Yatush, Satil and the abyss cave"
  function nearSite
    input Real p[3],margin;
    output Boolean near;
  algorithm
    near:=false;
    for site in 1:3 loop
      if min(p-ScanOccupancy.low[site,:])>=-margin and min(ScanOccupancy.high[site,:]-p)>=-margin then near:=true;end if;
    end for;
  end nearSite;

  function siteRange "Traverse the occupied scan grid in increasing ray distance"
    input Real o[3],d[3],limit;
    input Integer site,nx,ny,nz;
    input Real lower[3],upper[3];
    output Real distance;
  protected
    Integer ix,iy,iz,sx,sy,sz;
    Real entry,leave,t,tx,ty,tz,nextT;
    Boolean active;
  algorithm
    distance:=limit;
    (entry,leave):=Perception.slabInterval(o,d,lower,upper,1e-12);
    t:=max(.08,entry);
    if t<=min(leave,limit) then
      ix:=max(0,min(nx-1,integer(floor((o[1]+(t+1e-8)*d[1]-lower[1])/ScanOccupancy.spacing))));
      sx:=if d[1]>=0 then 1 else -1;
      iy:=max(0,min(ny-1,integer(floor((o[2]+(t+1e-8)*d[2]-lower[2])/ScanOccupancy.spacing))));
      sy:=if d[2]>=0 then 1 else -1;
      iz:=max(0,min(nz-1,integer(floor((o[3]+(t+1e-8)*d[3]-lower[3])/ScanOccupancy.spacing))));
      sz:=if d[3]>=0 then 1 else -1;
      active:=true;
      // Each axis-aligned grid plane can be crossed at most once.
      for crossing in 1:271 loop
        if active then
          if ScanOccupancy.occupied(site,ix,iy,iz) then
            distance:=t;active:=false;
          else
            tx:=if abs(d[1])>1e-12 then
              (lower[1]+(ix+(if sx>0 then 1 else 0))*ScanOccupancy.spacing-o[1])/d[1] else 1e30;
            ty:=if abs(d[2])>1e-12 then
              (lower[2]+(iy+(if sy>0 then 1 else 0))*ScanOccupancy.spacing-o[2])/d[2] else 1e30;
            tz:=if abs(d[3])>1e-12 then
              (lower[3]+(iz+(if sz>0 then 1 else 0))*ScanOccupancy.spacing-o[3])/d[3] else 1e30;
            nextT:=min(tx,min(ty,tz));
            if tx<=nextT+1e-10 then ix:=ix+sx;end if;
            if ty<=nextT+1e-10 then iy:=iy+sy;end if;
            if tz<=nextT+1e-10 then iz:=iz+sz;end if;
            t:=nextT;
            active:=t<min(limit,leave) and ix>=0 and ix<nx and iy>=0 and iy<ny and iz>=0 and iz<nz;
          end if;
        end if;
      end for;
    end if;
    annotation(Inline=false);
  end siteRange;

  function structureRange
    input Real o[3],d[3],limit;
    output Real distance;
  algorithm
    distance:=siteRange(o,d,limit,1,ScanOccupancy.dims[1,1],ScanOccupancy.dims[1,2],ScanOccupancy.dims[1,3],ScanOccupancy.low[1,:],ScanOccupancy.high[1,:]);
    distance:=siteRange(o,d,distance,2,ScanOccupancy.dims[2,1],ScanOccupancy.dims[2,2],ScanOccupancy.dims[2,3],ScanOccupancy.low[2,:],ScanOccupancy.high[2,:]);
    if min(o[3],o[3]+distance*d[3])<ScanOccupancy.high[3,3] then
      distance:=siteRange(o,d,distance,3,ScanOccupancy.dims[3,1],ScanOccupancy.dims[3,2],ScanOccupancy.dims[3,3],ScanOccupancy.low[3,:],ScanOccupancy.high[3,:]);
    end if;
  end structureRange;

  function beamRange
    input Real o[3],d[3],limit;
    output Real distance;
  algorithm
    distance:=Bathymetry.range(o,d,structureRange(o,d,limit));
  end beamRange;
end WreckSolids;
