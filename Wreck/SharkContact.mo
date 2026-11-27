within Wreck;
package SharkContact "Contact between the articulated great-white collision mesh and harbor geometry"
  function floorPatch "Deepest point of a convex body over the footprint of one terrain triangle"
    input Real a[3],b[3],c[3],points[48,3];
    input Integer count,first,last,faces[92,3];
    output Real hit[7] "Penetration, outward normal and witness in world metres";
  protected
    Real n[3],edge[3,3],bounds[3],corner[3,3],tri[3,3],poly[6,3],clipped[6,3];
    Real deepest,gap,p[3],q[3],dp,dq;
    Integer lowest,k,next,i,face;
  algorithm
    hit:=zeros(7);poly:=zeros(6,3);clipped:=zeros(6,3);n:=cross(b-a,c-a);n:=n/sqrt(n*n);
    deepest:=0;lowest:=1;
    i:=1;
    while i<=count loop
      gap:=(a-points[i,:])*n;
      if gap>deepest then deepest:=gap;lowest:=i;end if;
      i:=i+1;
    end while;
    if deepest<=0 then return;end if;
    corner[1,:]:=a;corner[2,:]:=b;corner[3,:]:=c;
    for j in 1:3 loop
      q:=corner[mod(j,3)+1,:]-corner[j,:];edge[j,:]:={q[2],-q[1],0};
      bounds[j]:=edge[j,:]*corner[j,:];
    end for;
    if max(edge*points[lowest,:]-bounds)<=0 then
      hit:=cat(1,{deepest},n,points[lowest,:]);return;
    end if;
    // The support vertex projects outside. Clip real facets to all three
    // vertical half-spaces; an edge can hit even when every vertex misses.
    face:=first;
    while face<=last loop
      for j in 1:3 loop tri[j,:]:=points[faces[face,j],:];end for;
      if min(tri[:,3])<max(corner[:,3]) and min(tri[:,1])<=max(corner[:,1]) and max(tri[:,1])>=min(corner[:,1]) and
          min(tri[:,2])<=max(corner[:,2]) and max(tri[:,2])>=min(corner[:,2]) then
        k:=3;poly[1:3,:]:=tri;
        for j in 1:3 loop
          if k>0 then
            next:=0;p:=poly[k,:];dp:=edge[j,:]*p-bounds[j];
            i:=1;
            while i<=k loop
              q:=poly[i,:];dq:=edge[j,:]*q-bounds[j];
              if (dp<0 and dq>0) or (dp>0 and dq<0) then
                next:=next+1;clipped[next,:]:=p+dp/(dp-dq)*(q-p);
              end if;
              if dq<=0 then next:=next+1;clipped[next,:]:=q;end if;
              p:=q;dp:=dq;
              i:=i+1;
            end while;
            k:=next;i:=1;
            while i<=k loop
              poly[i,:]:=clipped[i,:];i:=i+1;
            end while;
          end if;
        end for;
        i:=1;
        while i<=k loop
          gap:=(a-poly[i,:])*n;
          if gap>hit[1] then hit:=cat(1,{gap},n,poly[i,:]);end if;
          i:=i+1;
        end while;
      end if;
      face:=face+1;
    end while;
    annotation(Inline=false);
  end floorPatch;

  function seabed
    input Real points[48,3],lo[3],hi[3];
    input Integer count,first,last,faces[92,3];
    output Real best[7];
  protected
    Real x,y,dx,dy,x0,y0,quad[4,3],hit[7],z,normal[3],center[3];
    Integer imin,imax,jmin,jmax,ix,iy,i;
    Boolean island;
  algorithm
    best:=zeros(7);center:=.5*(lo+hi);
    island:=hi[1]>=7 and lo[1]<=65 and hi[2]>=17 and lo[2]<=63;
    if not island and (hi[1]<BedGrid.low or hi[2]<BedGrid.low or lo[1]>BedGrid.high or lo[2]>BedGrid.high or
        (abs(center[1]-10)+.5*(hi[1]-lo[1]))^2+(abs(center[2])+.5*(hi[2]-lo[2]))^2<27^2) then
      i:=1;
      while i<=count loop
        if BedGrid.datum-points[i,3]>best[1] then best:=cat(1,{BedGrid.datum-points[i,3],0,0,1},points[i,:]);end if;
        i:=i+1;
      end while;
      return;
    end if;
    dx:=if island then 58/74 else BedGrid.spacing;dy:=if island then 46/62 else BedGrid.spacing;
    x0:=if island then 7 else BedGrid.low;y0:=if island then 17 else BedGrid.low;
    imin:=integer(floor((lo[1]-x0)/dx));imax:=integer(floor((hi[1]-x0)/dx));
    jmin:=integer(floor((lo[2]-y0)/dy));jmax:=integer(floor((hi[2]-y0)/dy));
    ix:=imin;
    while ix<=imax loop
      iy:=jmin;
      while iy<=jmax loop
        for k in 1:4 loop
          x:=x0+(ix+(if k==2 or k==3 then 1 else 0))*dx;y:=y0+(iy+(if k>=3 then 1 else 0))*dy;
          if island then z:=Shore.terrain(x-36,y-40);else (z,normal):=Bathymetry.plane(x,y);end if;
          quad[k,:]:={x,y,z};
        end for;
        if max(quad[:,3])>lo[3] then
          for side in 1:2 loop
            if island then
              hit:=if side==1 then floorPatch(quad[1,:],quad[2,:],quad[4,:],points,count,first,last,faces)
                else floorPatch(quad[2,:],quad[3,:],quad[4,:],points,count,first,last,faces);
            else
              hit:=if side==1 then floorPatch(quad[1,:],quad[2,:],quad[3,:],points,count,first,last,faces)
                else floorPatch(quad[1,:],quad[3,:],quad[4,:],points,count,first,last,faces);
            end if;
            if hit[1]>best[1] then best:=hit;end if;
          end for;
        end if;
        iy:=iy+1;
      end while;
      ix:=ix+1;
    end while;
    annotation(Inline=false);
  end seabed;

  function solid "Clip shark facets to a finite convex obstacle, retaining a surface witness"
    input Real points[48,3],lo[3],hi[3],obstacle[:,4];
    input Integer first,last,faces[92,3];
    output Real best[7];
  protected Real tri[3,3],hit[7];
    Integer face;
  algorithm
    best:=zeros(7);
    face:=first;
    while face<=last loop
      for j in 1:3 loop tri[j,:]:=points[faces[face,j],:];end for;
      if min(tri[:,1])<=hi[1] and max(tri[:,1])>=lo[1] and min(tri[:,2])<=hi[2] and max(tri[:,2])>=lo[2]
          and min(tri[:,3])<=hi[3] and max(tri[:,3])>=lo[3] then
        hit:=Shore.rockTriangle(tri,obstacle);
        if hit[1]>best[1] then best:=hit;end if;
      end if;
      face:=face+1;
    end while;
    annotation(Inline=false);
  end solid;

  function boulders
    input Real points[48,3],lo[3],hi[3],rocks[46,13],facets[80,4];
    input Integer first,last,faces[92,3];
    output Real best[7];
  protected Real center[3],radius,delta[3],inv[3,3],gradient[3],planes[80,4],magnitude,hit[7];
  algorithm
    best:=zeros(7);
    for k in 1:46 loop
      center:=rocks[k,1:3];radius:=rocks[k,4];
      for j in 1:3 loop delta[j]:=max(0,max(lo[j]-center[j],center[j]-hi[j]));end for;
      if delta*delta<radius^2 then
        inv:=[rocks[k,5],rocks[k,6],rocks[k,7];rocks[k,8],rocks[k,9],rocks[k,10];rocks[k,11],rocks[k,12],rocks[k,13]];
        for j in 1:80 loop
          gradient:=transpose(inv)*facets[j,1:3];magnitude:=sqrt(gradient*gradient);
          planes[j,:]:=cat(1,gradient/magnitude,{(facets[j,4]+gradient*center)/magnitude});
        end for;
        hit:=solid(points,center-fill(radius,3),center+fill(radius,3),planes,first,last,faces);
        if hit[1]>best[1] then best:=hit;end if;
      end if;
    end for;
    annotation(Inline=false);
  end boulders;

  function wrecks
    input Real points[48,3],lo[3],hi[3];
    input Integer first,last,faces[92,3];
    output Real best[7];
  protected
    Integer lower[3],upper[3],ix,iy,iz;
    Real cell[3],endCell[3],planes[6,4],hit[7];
  algorithm
    best:=zeros(7);
    for site in 1:3 loop
      if min(hi-ScanOccupancy.low[site,:])>=0 and min(ScanOccupancy.high[site,:]-lo)>=0 then
        for k in 1:3 loop
          lower[k]:=max(0,integer(floor((lo[k]-ScanOccupancy.low[site,k])/ScanOccupancy.spacing)));
          upper[k]:=min(ScanOccupancy.dims[site,k]-1,integer(floor((hi[k]-ScanOccupancy.low[site,k])/ScanOccupancy.spacing)));
        end for;
        ix:=lower[1];
        while ix<=upper[1] loop
          iy:=lower[2];
          while iy<=upper[2] loop
            iz:=lower[3];
            while iz<=upper[3] loop
              if ScanOccupancy.occupied(site,ix,iy,iz) then
                cell:=ScanOccupancy.low[site,:]+ScanOccupancy.spacing*{ix,iy,iz};endCell:=cell+fill(ScanOccupancy.spacing,3);
                planes:=[-1,0,0,-cell[1];1,0,0,endCell[1];0,-1,0,-cell[2];0,1,0,endCell[2];0,0,-1,-cell[3];0,0,1,endCell[3]];
                hit:=solid(points,cell,endCell,planes,first,last,faces);
                if hit[1]>best[1] then best:=hit;end if;
              end if;
              iz:=iz+1;
            end while;
            iy:=iy+1;
          end while;
          ix:=ix+1;
        end while;
      end if;
    end for;
    annotation(Inline=false);
  end wrecks;
end SharkContact;
