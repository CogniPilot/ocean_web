within Wreck;
function swimmerContact "Reaction between a rounded swimmer probe and nearby scan surfaces"
  import MultiBodyLie.Collision;
  input Real p[3],cy,sy,v[3],radius,damping;
  output Real contact[5] "Forward, port, up, compressive load and signed gap";
protected
  Real n[3],speed,load,origin[3],centre[3];
  Integer low[3],high[3],ix,iy,iz;
  Collision.ContactPoint hit;
algorithm
  contact:={0,0,0,0,1e6};
  n:=zeros(3);
  for site in 1:2 loop
    origin:=ScanOccupancy.low[site,:];
    if min(p-origin)>=-radius and min(ScanOccupancy.high[site,:]-p)>=-radius then
      for j in 1:3 loop
        low[j]:=max(0,integer(floor((p[j]-radius-origin[j])/ScanOccupancy.spacing)));
        high[j]:=min(ScanOccupancy.dims[site,j]-1,integer(floor((p[j]+radius-origin[j])/ScanOccupancy.spacing)));
      end for;
      // The largest wildlife probe has radius 0.78 m (at most eight cells per axis).
      for dx in 0:7 loop
      ix:=low[1]+dx;
      if ix>high[1] then break;end if;
        for dy in 0:7 loop
        iy:=low[2]+dy;
        if iy>high[2] then break;end if;
          for dz in 0:7 loop
          iz:=low[3]+dz;
          if iz>high[3] then break;end if;
            if ScanOccupancy.occupied(site,ix,iy,iz) then
              centre:=origin+ScanOccupancy.spacing*({ix,iy,iz}+fill(.5,3));
              hit:=Collision.sphereBox(p,zeros(3),radius,centre,zeros(3),identity(3),fill(.5*ScanOccupancy.spacing,3));
              if hit.gap<contact[5] then
                contact[5]:=hit.gap;
                n:={cy*hit.n[1]+sy*hit.n[2],-sy*hit.n[1]+cy*hit.n[2],hit.n[3]};
              end if;
            end if;
          end for;
        end for;
      end for;
    end if;
  end for;
  if contact[5]<0 then
    speed:=v*n;
    load:=damping*max(0,min(5,-28*contact[5])-speed*min(1,-contact[5]/.02));
    contact[1:3]:=load*n;contact[4]:=load;
  end if;
end swimmerContact;
