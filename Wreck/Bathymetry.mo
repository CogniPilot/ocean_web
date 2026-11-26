within Wreck;
package Bathymetry "Triangulated harbor bed shared with the rendered terrain"
  function plane "Height and unnormalised upward normal at an ENU position"
    input Real east,north;
    output Real z,n[3];
  protected
    Integer i,j;
    Real x,y,a,b,c,d;
  algorithm
    z:=BedGrid.datum;n:={0,0,1};
    if east<=BedGrid.low or east>=BedGrid.high or north<=BedGrid.low or north>=BedGrid.high or (east-10)^2+north^2<27^2 then return;end if;
    i:=integer(floor((east-BedGrid.low)/BedGrid.spacing));
    j:=integer(floor((north-BedGrid.low)/BedGrid.spacing));
    x:=east-(BedGrid.low+i*BedGrid.spacing);y:=north-(BedGrid.low+j*BedGrid.spacing);
    (a,c):=BedGrid.adjacent(i,j);(b,d):=BedGrid.adjacent(i+1,j);
    n:=if x>=y then {(a-b)/BedGrid.spacing,(b-d)/BedGrid.spacing,1}
      else {(c-d)/BedGrid.spacing,(a-c)/BedGrid.spacing,1};
    z:=a-x*n[1]-y*n[2];
  end plane;

  function intersectFacet
    input Real o[3],d[3],x,y,a,gx,gy,first,last;
    input Boolean southeast;
    output Real hit;
  protected Real den,t,u,v;
  algorithm
    hit:=1e20;
    den:=d[3]-gx*d[1]-gy*d[2];
    if abs(den)>1e-12 then
      t:=(a+gx*(o[1]-x)+gy*(o[2]-y)-o[3])/den;
      u:=o[1]+t*d[1]-x;v:=o[2]+t*d[2]-y;
      if t>=first-1e-8 and t<=last+1e-8 and (if southeast then u>=v-1e-8 else v>=u-1e-8) then hit:=t;end if;
    end if;
  end intersectFacet;

  function traceGrid
    input Real o[3],d[3],first,last,limit;
    output Real distance;
  protected
    Real t,tx,ty,x,y,a,b,c,h,endCell;
    Integer i,j,sx,sy;
    Boolean active;
  algorithm
    distance:=limit;t:=first;
    sx:=if d[1]>=0 then 1 else -1;sy:=if d[2]>=0 then 1 else -1;
    i:=max(0,min(BedGrid.cells-1,integer(floor((o[1]+d[1]*(first+1e-9)-BedGrid.low)/BedGrid.spacing))));
    j:=max(0,min(BedGrid.cells-1,integer(floor((o[2]+d[2]*(first+1e-9)-BedGrid.low)/BedGrid.spacing))));
    active:=true;
    for step in 1:2*BedGrid.cells+2 loop
      if active then
      x:=BedGrid.low+i*BedGrid.spacing;y:=BedGrid.low+j*BedGrid.spacing;
      tx:=if abs(d[1])>1e-12 then (x+(if sx>0 then BedGrid.spacing else 0)-o[1])/d[1] else 1e20;
      ty:=if abs(d[2])>1e-12 then (y+(if sy>0 then BedGrid.spacing else 0)-o[2])/d[2] else 1e20;
      (a,c):=BedGrid.adjacent(i,j);(b,h):=BedGrid.adjacent(i+1,j);
      endCell:=min(last,min(tx,ty));
      distance:=min(distance,intersectFacet(o,d,x,y,a,(b-a)/BedGrid.spacing,(h-b)/BedGrid.spacing,t,endCell,true));
      distance:=min(distance,intersectFacet(o,d,x,y,a,(h-c)/BedGrid.spacing,(c-a)/BedGrid.spacing,t,endCell,false));

      t:=min(tx,ty);
      if tx<=ty then i:=i+sx;end if;
      if ty<=tx then j:=j+sy;end if;
      active:=distance>endCell+1e-8 and t<last-1e-8 and i>=0 and i<BedGrid.cells and j>=0 and j<BedGrid.cells;
      end if;
    end for;
  end traceGrid;

  function range
    input Real o[3],d[3],limit;
    output Real distance;
  protected Real flat,x,y,entry,leave;
  algorithm
    distance:=limit;
    if abs(d[3])>1e-12 then
      flat:=(BedGrid.datum-o[3])/d[3];
      x:=o[1]+flat*d[1];y:=o[2]+flat*d[2];
      if flat>=.08 and flat<distance and (x<=BedGrid.low or x>=BedGrid.high or y<=BedGrid.low or y>=BedGrid.high) then distance:=flat;end if;
      if flat>=.08 and flat<distance and (x-10)^2+y^2<27^2 then distance:=flat;end if;
    end if;
    (entry,leave):=Perception.slabInterval(o,d,{BedGrid.low,BedGrid.low,-49.0},{BedGrid.high,BedGrid.high,BedGrid.datum},1e-12);
    if max(.08,entry)<=min(leave,distance) then distance:=traceGrid(o,d,max(.08,entry),min(leave,distance),distance);end if;
  end range;
end Bathymetry;
