model SailMembrane "Three-dimensional tensioned sailcloth in a boom-fixed frame"
  constant Integer cols=4,rows=6,n=cols*rows;
  parameter Real roach=0;
  parameter Integer battenCount=0;
  parameter Real battenEI(unit="N.m2")=.8 "Effective chordwise fiberglass flexural rigidity";
  parameter Real battenLinearMass(unit="kg/m")=.045;
  // Endpoint heights from the illustrated rig, expressed as fractions of span.
  // The four jib pockets lie nearly level. Upper main pockets fan up to the leech.
  final parameter Real battenLuff[8]=if battenCount==4 then
    {.18,.38,.55,.73,0,0,0,0} else {.075,.185,.285,.395,.49,.575,.705,.80};
  final parameter Real battenLeech[8]=if battenCount==4 then
    {.18,.38,.55,.73,0,0,0,0} else {.095,.205,.31,.42,.53,.605,.76,.90};
  final parameter Real battenWeight[rows,cols]={sum(max(0,1-abs((r-1)-(rows-1)*
    (battenLuff[b]+(battenLeech[b]-battenLuff[b])*(c-1)/(cols-1))))
    for b in 1:battenCount) for c in 1:cols,r in 1:rows};
  parameter Real span=2.6,foot=1.12,rake=0,stepSize=.01,arealMass=.17;
  parameter Real mastSupport=.68 "Fractional luff height at the stay tang";
  // Static overhanging beam under a unit tip load, normalized at the head.
  final parameter Real modeShape[rows]={bendShape((r-1)/(rows-1),mastSupport) for r in 1:rows};
  function bendShape
    input Real z,s;
    output Real phi;
  algorithm
    phi:=if z<=s then (z^3/s-s*z)/(2*(1-s)) else
      (s*(z-s)+(1.5*(z-s)^2)-.5*(z-s)^3/(1-s))/(1-s);
  end bendShape;
  input Real mastOffset[3] "Masthead displacement resolved in sail coordinates";
  input Real boomElevation;
  parameter Boolean hasShrouds=false;
  input Real shroudFoot[2,3],shroudHead[3] "Two finite sidestays in the rotating sail frame";
  input Real air[3], water[3], omega[3], gravity[3], waterPlane[4] "Signed immersion = plane[4]+plane[1:3]*p";
  // Rows run from the tack toward the head. The luff is attached to the stay.
  // The clew at the other end of the foot is attached to the boom.
  final parameter Real mesh[n,3]={
    {-rake*div(i-1,cols)/(rows-1)-(foot*(1-.985*div(i-1,cols)/(rows-1))+roach*4*div(i-1,cols)/(rows-1)*(1-div(i-1,cols)/(rows-1)))*mod(i-1,cols)/(cols-1),
     -.025*sin(3.14159*mod(i-1,cols)/(cols-1))*(1-div(i-1,cols)/(rows-1)),
     span*div(i-1,cols)/(rows-1)} for i in 1:n};
  discrete output Real vertex[n,3](start=mesh,each fixed=true);
  discrete Real velocity[n,3](each start=0,each fixed=true);
  discrete output Real fluidForce[3],fluidMoment[3],wetArea,leechSpeed,clewForce[3],mastLoad[3];
  function advanceCloth
    input Real rest[n,3], old[n,3], oldV[n,3],air[3],water[3],omega[3],gravity[3],plane[4],dt,mu,t,elevation,battenRows[rows,cols],EI,lineMass;
    input Boolean contact;
    input Real footStay[2,3],headStay[3],tipOffset[3],shape[rows];
    output Real p[n,3],v[n,3],force[3],moment[3],wetArea,leechSpeed,clewForce[3],mastLoad[3];
  protected
    Real mass[n],nodal[n,3],normal[3],a[3],b[3],c[3],center[3],dv[3],q[3],load[3],relative[3];
    Real implicitFactor,gust,d[3],low,mid,high,wet,area,u,vn,dist,reference,extension,wa,wb,correction,restArea;
    Real spacing,stiffness,wCenter;
    Real wire[3],offset[3],denom,along,edge,penetration,loadY,totalInv,direction;
    Integer left,j,k,c1,c2,c3;
  algorithm
    p:=old;v:=oldV;mass:=fill(.0001,n);nodal:=zeros(n,3);force:=zeros(3);moment:=zeros(3);wetArea:=0;
    for row in 0:rows-2 loop
      for col in 1:cols-1 loop
        left:=row*cols+col;
        for tri in 1:2 loop
          c1:=left;c2:=if tri==1 then left+1 else left+cols+1;
          c3:=if tri==1 then left+cols+1 else left+cols;
          a:=old[c1,:];b:=old[c2,:];c:=old[c3,:];
          normal:=cross(b-a,c-a);area:=.5*sqrt(normal*normal);normal:=normal/max(1e-9,2*area);
          center:=(a+b+c)/3;dv:=(oldV[c1,:]+oldV[c2,:]+oldV[c3,:])/3+cross(omega,center);
          d:={plane[4]+plane[1:3]*a,plane[4]+plane[1:3]*b,plane[4]+plane[1:3]*c};
          low:=min(d);high:=max(d);mid:=sum(d)-low-high;
          wet:=if high<=0 then 0 elseif low>=0 then 1 elseif mid<=0 then high/(high-low)*high/(high-mid)
            else 1-low/(low-high)*low/(low-mid);
          wetArea:=wetArea+wet*area;load:=zeros(3);
          for fluid in 1:2 loop
            relative:=(if fluid==1 then air else water)-dv;
            if fluid==1 then
              // Synthetic crosswind gusts vary across the rig and scale with apparent wind.
              gust:=.09*sin(2.1*t+.8*center[3])+.055*sin(4.7*t-1.6*center[3])+.035*sin(7.2*t+2.9*center[3]);
              relative:=relative+gust*{-air[2],air[1],0};
            end if;
            u:=sqrt(relative*relative);vn:=relative*normal;
            // A thin plate at incidence carries normal pressure and skin friction.
            // Backward-Euler normal drag for the local entrained mass. The
            // fluid impulse cannot reverse the relative velocity in one sample.
            implicitFactor:=if fluid==1 then 1 else 1/(1+dt*.7*1025*u*wet/(mu+wet*1025*.04));
            load:=load+implicitFactor*.5*(if fluid==1 then 1.225*(1-wet) else 1025*wet)*area*
              (1.4*u*vn*normal+.008*u*(relative-vn*normal));
          end for;
          force:=force+load;moment:=moment+cross(center,load);
          q:=cross(rest[c2,:]-rest[c1,:],rest[c3,:]-rest[c1,:]);restArea:=.5*sqrt(q*q);
          for corner in 1:3 loop
            j:=if corner==1 then c1 elseif corner==2 then c2 else c3;
            mass[j]:=mass[j]+restArea*(mu+wet*1025*.04)/3;
            nodal[j,:]:=nodal[j,:]+load/3;
          end for;
        end for;
      end for;
    end for;
    for r in 1:rows loop
      for col in 1:cols-1 loop
        if battenRows[r,col]+battenRows[r,col+1]>0 then
          j:=(r-1)*cols+col;
          q:=rest[j+1,:]-rest[j,:];
          spacing:=sqrt(q*q);
          mass[j]:=mass[j]+.5*spacing*lineMass*(battenRows[r,col]+battenRows[r,col+1])/2;
          mass[j+1]:=mass[j+1]+.5*spacing*lineMass*(battenRows[r,col]+battenRows[r,col+1])/2;
        end if;
      end for;
    end for;
    for i in 1:n loop
      if mod(i-1,cols)<>0 and i<>cols then
        p[i,:]:=old[i,:]+dt*((1-.7*dt)*oldV[i,:]+dt*(gravity+nodal[i,:]/mass[i]));
      end if;
    end for;
    mastLoad:=zeros(3);
    for r in 1:rows loop
      j:=(r-1)*cols+1;
      p[j,:]:=rest[j,:]+shape[r]*tipOffset;
      mastLoad:=mastLoad+shape[r]*(nodal[j,:]+mass[j]*gravity);
    end for;
    p[cols,:]:={rest[cols,1]*cos(elevation),0,-rest[cols,1]*sin(elevation)};
    clewForce:=nodal[cols,:]+mass[cols]*gravity;
    // Position-based cloth: tension-only warp, weft and bias links. A small
    // sewing allowance permits wrinkling and collapse when pressure falls.
    for pass in 1:6 loop
      for index in 1:n loop
        j:=if mod(pass,2)==0 then n+1-index else index;
        for link in 1:4 loop
          k:=if link==1 then j+1 elseif link==2 then j+cols elseif link==3 then j+cols+1 else j+cols-1;
          if k<=n and (link==2 or (link==4 and mod(j-1,cols)>0) or (link<>4 and mod(j,cols)<>0)) then
            q:=p[k,:]-p[j,:];dist:=sqrt(q*q);dv:=rest[k,:]-rest[j,:];
            reference:=sqrt(dv*dv)*(if link<3 then 1.012 else 1.025);
            extension:=max(0,dist-reference);
            wa:=if mod(j-1,cols)==0 or j==cols then 0 else 1/mass[j];
            wb:=if mod(k-1,cols)==0 or k==cols then 0 else 1/mass[k];
            correction:=extension/(max(1e-8,dist)*(wa+wb+.00005/dt^2));
            if mod(j-1,cols)==0 then
              mastLoad:=mastLoad+shape[div(j-1,cols)+1]*correction*q/dt^2;
            end if;
            if mod(k-1,cols)==0 then
              mastLoad:=mastLoad-shape[div(k-1,cols)+1]*correction*q/dt^2;
            end if;
            if j==cols then
              clewForce:=clewForce+correction*q/dt^2;
            elseif k==cols then
              clewForce:=clewForce-correction*q/dt^2;
            end if;
            p[j,:]:=p[j,:]+wa*correction*q;p[k,:]:=p[k,:]-wb*correction*q;
          end if;
        end for;
      end for;
    end for;
    // Implicit discrete beam bending energy EI/2 * integral(curvature^2 ds).
    for r in 1:rows loop
      for col in 2:cols-1 loop
        if battenRows[r,col]>0 then
          j:=(r-1)*cols+col;
          d:=rest[j+1,:]-rest[j-1,:];
          spacing:=max(.001,.5*sqrt(d*d));
          stiffness:=EI*battenRows[r,col]/spacing^3;
          wa:=if col==2 then 0 else 1/mass[j-1];
          wb:=if j+1==cols then 0 else 1/mass[j+1];
          wCenter:=1/mass[j];
          q:=(p[j-1,:]-2*p[j,:]+p[j+1,:])/(1/(stiffness*dt^2)+wa+4*wCenter+wb);
          if col==2 then
            mastLoad:=mastLoad-shape[r]*q/dt^2;
          end if;
          p[j-1,:]:=p[j-1,:]-wa*q;
          p[j,:]:=p[j,:]+2*wCenter*q;
          p[j+1,:]:=p[j+1,:]-wb*q;
          if j+1==cols then
            clewForce:=clewForce-q/dt^2;
          end if;
        end if;
      end for;
    end for;
    // Intersect the projected shroud with all three edges of every cloth
    // triangle in the sail XZ plane. Signed separation varies linearly over
    // the intersection interval, so its extrema occur on those edges.
    if contact then
      for pass in 1:3 loop
        for side in 1:2 loop
          wire:=headStay-footStay[side,:];
          direction:=if side==1 then 1 else -1;
          for j in 1:n loop
            for link in 1:3 loop
              k:=if link==1 then j+1 elseif link==2 then j+cols else j+cols+1;
              if k<=n and (link==2 or mod(j,cols)<>0) then
                d:=p[k,:]-p[j,:];offset:=footStay[side,:]-p[j,:];
                denom:=d[1]*wire[3]-d[3]*wire[1];
                if abs(denom)>1e-9 then
                  edge:=(offset[1]*wire[3]-offset[3]*wire[1])/denom;
                  along:=(offset[1]*d[3]-offset[3]*d[1])/denom;
                  if edge>=0 and edge<=1 and along>=0 and along<=1 then
                    penetration:=direction*(p[j,2]+edge*d[2]-footStay[side,2]-along*wire[2])+.009;
                    if penetration>0 then
                      wa:=if mod(j-1,cols)==0 or j==cols then 0 else 1/mass[j];
                      wb:=if mod(k-1,cols)==0 or k==cols then 0 else 1/mass[k];
                      totalInv:=wa*(1-edge)^2+wb*edge^2;
                      if totalInv>1e-8 then
                        loadY:=-direction*penetration/totalInv;
                        p[j,2]:=p[j,2]+wa*(1-edge)*loadY;
                        p[k,2]:=p[k,2]+wb*edge*loadY;
                        if j==cols or k==cols then
                          clewForce[2]:=clewForce[2]+(if j==cols then 1-edge else edge)*loadY/dt^2;
                        end if;
                      end if;
                    end if;
                  end if;
                end if;
              end if;
            end for;
          end for;
        end for;
      end for;
    end if;
    v:=(p-old)/dt;
    leechSpeed:=sqrt(v[3*cols,:]*v[3*cols,:]);
  end advanceCloth;
equation
  when sample(0,stepSize) then
    (vertex,velocity,fluidForce,fluidMoment,wetArea,leechSpeed,clewForce,mastLoad)=advanceCloth(mesh,pre(vertex),pre(velocity),air,water,omega,gravity,waterPlane,stepSize,arealMass,time,boomElevation,battenWeight,battenEI,battenLinearMass,hasShrouds,shroudFoot,shroudHead,mastOffset,modeShape);
  end when;
end SailMembrane;
