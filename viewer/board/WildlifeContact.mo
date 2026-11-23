function WildlifeContact "Boat contact against moving animal envelopes in ENU"
  input Real animals[2,6] "Legacy whale and shark pose";
  input Real boat[6] "ENU position, roll, nose-down pitch, yaw";
  input Real velocity[3] "East, north, yaw rate";
  input Real mass,hullLength,halfWidth,spacing,draft;
  input Real traffic[10,9]=zeros(10,9) "Kind (1 whale, 2 shark), ENU, yaw, nose-up pitch, east/north velocity, roll";
  input Real articulation[10,4]=zeros(10,4) "Whale peduncle bend, fluke feather and two fin angles";
  output Real wrench[6];
  import MultiBodyLie.Collision;
protected
  Real a[9],dx,dy,dz,c,s,cp,sp,cr,sr,fore,across,ex,ey,ez,along,side,up;
  Real armE,armN,best,nx,ny,nf,ns,nz,ne,nn,mag,speedNormal,lever,force;
  Real shapes[7,16],frame[3,3],shapeAxes[3,3],origin[3],sample[3];
  Collision.ContactPoint point;
  Real rx,ry,rz,cx,cy,cz,lx,ly,lz,px,py,pz,rho,penetration,width;
algorithm
  wrench:=zeros(6);
  for k in 1:10 loop
    a:=traffic[k,:];
    if k<=2 and a[1]<.5 and animals[min(2,k),1]>.5 then
      a:={k,animals[min(2,k),2],animals[min(2,k),3],animals[min(2,k),4],
          animals[min(2,k),5],animals[min(2,k),6],0,0,0};
    end if;
    dx:=boat[1]-a[2];dy:=boat[2]-a[3];dz:=boat[3]-a[4];
    if a[1]>.5 and dx*dx+dy*dy<(hullLength*.5+6.5)^2 and abs(dz)<6+draft then
      c:=cos(a[5]);s:=sin(a[5]);cp:=cos(a[6]);sp:=sin(a[6]);cr:=cos(a[9]);sr:=sin(a[9]);
      frame:=SwimmerCollision.worldFrame(a[5],a[6],a[9]);
      shapes:=if a[1]<1.5 then SwimmerCollision.whale(articulation[k,1],articulation[k,2],articulation[k,3],articulation[k,4]) else zeros(7,16);
      best:=0;nx:=0;ny:=0;armE:=0;armN:=0;
      for h in 1:(if spacing>0 then 2 else 1) loop
        across:=(3-2*h)*spacing;
        for j in 0:10 loop
          fore:=hullLength*(j/10-.5);
          ex:=(fore*cos(boat[5])+across*sin(boat[4])*sin(boat[5]))*cos(boat[6])-across*cos(boat[4])*sin(boat[6]);
          ey:=(fore*cos(boat[5])+across*sin(boat[4])*sin(boat[5]))*sin(boat[6])+across*cos(boat[4])*cos(boat[6]);
          ez:=dz+across*sin(boat[4])*cos(boat[5])-fore*sin(boat[5])-draft*.5;
          along:=(dx+ex)*c+(dy+ey)*s;side:=-(dx+ex)*s+(dy+ey)*c;
          lx:=along*cp+ez*sp;up:=-along*sp+ez*cp;
          ly:=side*cr+up*sr;lz:=-side*sr+up*cr;
          width:=halfWidth*(.45+.55*sin(3.14159265*j/10));
          if a[1]<1.5 then
            for shape in 1:7 loop
              origin:=transpose(frame)*shapes[shape,2:4];
              for kAxis in 1:3 loop
                for jAxis in 1:3 loop
                  shapeAxes[kAxis,jAxis]:=shapes[shape,4+3*(kAxis-1)+jAxis];
                end for;
              end for;
              sample:={ex,ey,ez-dz};
              point:=Collision.shapePair(Collision.ShapeKind.Sphere,boat[1:3],sample,identity(3),
                {max(width,draft*.5),0,0},
                if shapes[shape,1]<3.5 then Collision.ShapeKind.Capsule else Collision.ShapeKind.Box,
                a[2:4],origin,transpose(shapeAxes)*frame,shapes[shape,14:16]);
              mag:=sqrt(point.n[1]^2+point.n[2]^2);
              penetration:=min(1.5,-point.gap)*mag;
              if penetration>best then
                best:=penetration;armE:=point.armA[1];armN:=point.armA[2];
                nx:=point.n[1]/mag;ny:=point.n[2]/mag;
              end if;
            end for;
          else
            for shape in 1:2 loop
              cx:=if shape==1 then 0 else .05;cy:=0;cz:=if shape==1 then -.13 else .51;
              rx:=if shape==1 then 2.4 else .38;ry:=if shape==1 then .43 else .09;
              rz:=if shape==1 then .46 else .34;
            rx:=rx+hullLength*.05;ry:=ry+width;rz:=rz+draft*.5;
            px:=(lx-cx)/rx;py:=(ly-cy)/ry;pz:=(lz-cz)/rz;
            rho:=sqrt(px*px+py*py+pz*pz+1e-10);
            if rho<1 then
              nf:=px/rx;ns:=cr*py/ry-sr*pz/rz;nz:=sr*py/ry+cr*pz/rz;
              along:=cp*nf-sp*nz;ne:=along*c-ns*s;nn:=along*s+ns*c;
              mag:=sqrt(ne^2+nn^2);
              penetration:=min(1.5,(1-rho)*rho/max(.20,mag));
              if penetration>best then
                best:=penetration;armE:=ex;armN:=ey;
                if mag>1e-5 then nx:=ne/mag;ny:=nn/mag;
                else nx:=-cos(boat[6]);ny:=-sin(boat[6]);end if;
              end if;
            end if;
            end for;
          end if;
        end for;
      end for;
      if best>0 then
        speedNormal:=(velocity[1]-velocity[3]*armN-a[7])*nx+(velocity[2]+velocity[3]*armE-a[8])*ny;
        lever:=armE*ny-armN*nx;
        // Dampen both compression and rebound. Rotational compliance reduces
        // the effective mass at the bow or stern of an off-centre strike.
        force:=mass/(1+lever^2/(if spacing>0 then 1.5 elseif hullLength>5.5 then 4.31 else .32))
          *max(0,min(48,64*best-13*speedNormal));
        wrench[1]:=wrench[1]+force*nx;wrench[2]:=wrench[2]+force*ny;
        wrench[6]:=wrench[6]+force*lever;
      end if;
    end if;
  end for;
end WildlifeContact;
