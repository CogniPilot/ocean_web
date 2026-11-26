within Wreck;
function bedContact "Piccard viewport and support points against the triangulated bed"
  input Real pos[3],T[3,3],velocity[3],omega[3];
  output Real force[3],moment[3];
protected
  MultiBodyLie.Collision.ContactPoint contact;
  MultiBodyLie.Collision.Material material(k=5200,d=.8,mu=.22,eps=.0003,v_eps=.12);
  Real parts[PiccardSolids.count,7],patch[4,5];
  Integer i0,j0,ix,jy,cell,axis;
  Real west,south,a,b,c,d,x,y,nx,ny,clearance,flatElevation;
  Boolean nearBed,flatBed;
  Real arm[3],center[3],bodyNormal[3],support[3],radial[3],normal[3],w[3],f[3],row[7],radialLength,radius,weight,total,gap,h;
algorithm
  force:=zeros(3);moment:=zeros(3);total:=0;
  if pos[3]>BedGrid.datum+.8 then return;end if;
  // The enclosing sphere touches at most two cells per axis. Test its
  // signed distance to both planes of each touched cell before visiting
  // any hardware. Extrapolating each plane only makes rejection conservative.
  assert(2*PiccardSolids.reach<BedGrid.spacing,"Piccard no longer fits the two-cell contact stencil");
  i0:=integer(floor((pos[1]-PiccardSolids.reach-BedGrid.low)/BedGrid.spacing));
  j0:=integer(floor((pos[2]-PiccardSolids.reach-BedGrid.low)/BedGrid.spacing));
  west:=BedGrid.low+i0*BedGrid.spacing;south:=BedGrid.low+j0*BedGrid.spacing;
  nearBed:=false;flatBed:=true;flatElevation:=BedGrid.datum;patch:=zeros(4,5);
  for j in 0:1 loop
    for i in 0:1 loop
      ix:=i0+i;jy:=j0+j;cell:=1+i+2*j;
      if pos[1]+PiccardSolids.reach>=west+i*BedGrid.spacing and pos[2]+PiccardSolids.reach>=south+j*BedGrid.spacing then
        if ix>=0 and ix<BedGrid.cells and jy>=0 and jy<BedGrid.cells then
          (a,c):=BedGrid.adjacent(ix,jy);(b,d):=BedGrid.adjacent(ix+1,jy);
        else
          a:=BedGrid.datum;b:=a;c:=a;d:=a;
        end if;
        patch[cell,:]:={a,(a-b)/BedGrid.spacing,(b-d)/BedGrid.spacing,(c-d)/BedGrid.spacing,(a-c)/BedGrid.spacing};
        if cell==1 then flatElevation:=a;end if;
        flatBed:=flatBed and a==flatElevation and a==b and a==c and a==d;
        x:=pos[1]-(west+i*BedGrid.spacing);y:=pos[2]-(south+j*BedGrid.spacing);
        for face in 1:2 loop
          nx:=patch[cell,2*face];ny:=patch[cell,2*face+1];
          clearance:=pos[3]-(a-x*nx-y*ny);
          if clearance<=(PiccardSolids.reach+.003001)*sqrt(1+nx*nx+ny*ny) then nearBed:=true;end if;
        end for;
      else
        patch[cell,:]:={BedGrid.datum,0,0,0,0};
      end if;
    end for;
  end for;
  if not nearBed then return;end if;
  parts:=PiccardSolids.primitives;
  w:=transpose(T)*omega;
  for i in 0:PiccardSolids.count loop
    if i==0 then
      arm:=transpose(T)*PiccardSolids.dome[1:3]; center:=pos+arm;
      if flatBed then normal:={0,0,1};
      else (h,normal):=bedPatchPlane(center[1],center[2],west,south,patch);normal:=normal/sqrt(normal*normal);end if;
      arm:=arm-PiccardSolids.dome[4]*normal;
    else
      row:=parts[i,:];
      center:=pos+transpose(T)*row[1:3];
      if flatBed then normal:={0,0,1};
      else (h,normal):=bedPatchPlane(center[1],center[2],west,south,patch);end if;
      bodyNormal:=T*normal;
      axis:=integer(row[7]);
      support:=zeros(3);
      if axis==0 then
        // Centre the contact on a face when a normal component vanishes.
        for j in 1:3 loop
          support[j]:=if abs(bodyNormal[j])>1e-7 then -sign(bodyNormal[j])*row[3+j] else 0;
        end for;
      else
        // Support of a finite cylinder: select its cap along the axis and
        // its circular rim in the perpendicular plane.
        radial:=bodyNormal;radial[axis]:=0;
        radialLength:=sqrt(radial*radial);
        radius:=if axis==1 then row[5] else row[4];
        support:=if radialLength>1e-7 then (-radius/radialLength)*radial else zeros(3);
        support[axis]:=if abs(bodyNormal[axis])>1e-7 then -sign(bodyNormal[axis])*row[3+axis] else 0;
      end if;
      arm:=transpose(T)*(row[1:3]+support);
    end if;
    if flatBed then h:=flatElevation;normal:={0,0,1};
    else (h,normal):=bedPatchPlane(pos[1]+arm[1],pos[2]+arm[2],west,south,patch);normal:=normal/sqrt(normal*normal);end if;
    gap:=(pos[3]+arm[3]-h)*normal[3];
    if gap<.003 then
      contact:=MultiBodyLie.Collision.ContactPoint(gap=gap,n=normal,armA=arm,armB=zeros(3));
      f:=MultiBodyLie.Collision.contactForce(contact,velocity+cross(w,arm),material);
      weight:=.003-gap;total:=total+weight;
      force:=force+weight*f;moment:=moment+weight*cross(arm,f);
    end if;
  end for;
  if total>0 then force:=force/total;moment:=moment/total;end if;
end bedContact;
