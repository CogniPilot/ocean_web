package MantaContact "Capsule envelopes in metres for the 5.5 m manta and nearby craft"
  function basis
    input Real yaw, pitch, roll "Radians, pitch nose up and roll port up";
    output Real R[3,3] "Body FLU to ENU";
  protected
    Real cy,sy,cp,sp,cr,sr;
  algorithm
    cy:=cos(yaw);sy:=sin(yaw);cp:=cos(pitch);sp:=sin(pitch);cr:=cos(roll);sr:=sin(roll);
    R:=[cy*cp,-sy*cr-cy*sp*sr, sy*sr-cy*sp*cr;
        sy*cp, cy*cr-sy*sp*sr,-cy*sr-sy*sp*cr;
        sp,cp*sr,cp*cr];
  end basis;

  function strokeAngle
    input Real phase,amplitude;
    output Real angle;
  algorithm
    // The depressed tip excursion is shallower than the upstroke in the rig.
    angle:=amplitude*sin(phase)*(if sin(phase)<0 then .45 else 1.25);
  end strokeAngle;

  function wingPoint
    input Real p[3],angle;
    output Real q[3];
  protected
    Real distance;
  algorithm
    distance:=max(0,abs(p[2])-.48);
    q:={p[1],p[2]+sign(p[2])*(distance*(cos(angle)-1)-p[3]*sin(angle)),p[3]*cos(angle)+distance*sin(angle)};
  end wingPoint;

  function shapes
    input Real angle,starboardAngle=angle;
    output Real rows[10,7] "FLU capsule endpoints A, B and radius";
  protected
    constant Real rest[10,7]=[-1.20,0,.06,1.20,0,.06,.38;
      -4.26,0,.04,-1.28,0,.01,.10;
      1.14,.42,-.10,1.80,.61,-.17,.11;
      1.14,-.42,-.10,1.80,-.61,-.17,.11;
      -.92,.67,-.08,1.17,.67,-.08,.34;
      -.92,-.67,-.08,1.17,-.67,-.08,.34;
      .68,1.06,.04,-.62,2.58,.00,.17;
      .68,-1.06,.04,-.62,-2.58,.00,.17;
      -.62,.95,-.11,-.62,2.58,.00,.17;
      -.62,-.95,-.11,-.62,-2.58,.00,.17];
  algorithm
    rows:=rest;
    for j in 5:10 loop
      rows[j,1:3]:=wingPoint(rest[j,1:3],if mod(j,2)==1 then angle else starboardAngle);
      rows[j,4:6]:=wingPoint(rest[j,4:6],if mod(j,2)==1 then angle else starboardAngle);
    end for;
  end shapes;

  function closest
    input Real p[3],q[3],a[3],b[3];
    output Real uv[2];
  protected
    Real x[3],y[3],v[3],xx,yy,xy,xv,yv,det,u,t;
  algorithm
    x:=q-p;y:=b-a;v:=p-a;xx:=max(1e-10,x*x);yy:=max(1e-10,y*y);
    xy:=x*y;xv:=x*v;yv:=y*v;det:=xx*yy-xy*xy;
    u:=if det>1e-9 then max(0,min(1,(xy*yv-yy*xv)/det)) else 0;
    t:=max(0,min(1,(xy*u+yv)/yy));
    uv:={max(0,min(1,(xy*t-xv)/xx)),t};
  end closest;

  function pair
    input Real animal[9],wingAngle,vessel[6],vesselVelocity[3];
    input Real length,halfWidth,spacing,draft;
    input Real animalVertical=0,animalRates[3]=zeros(3),wingRate=0;
    input Real vesselVertical=0,vesselRollRate=0,vesselPitchRate=0;
    input Real starboardAngle=wingAngle,starboardRate=wingRate;
    output Real wrench[12] "Force and moment on vessel, then on animal; all in ENU";
    output Real hinge[2] "Generalized contact torque on port and starboard fins";
  protected
    Real center[3],offset[3],ra[3,3],rb[3,3],rt[3,3],caps[10,7];
    Real aa[3],bb[3],a[3],b[3],ca[3],cb[3],d[3],n[3],normal[3],uv[2],body[3];
    Real halfHeight,z0,zScale,combined,boundsRadius,run,gap,best,leverA[3],leverB[3],point[3];
    Real side,arm[3],v[3],vt[3],force[3],omegaA[3],omegaB[3],wingV[3],vn,fn,r,depth;
  algorithm
    wrench:=zeros(12);hinge:=zeros(2);center:=animal[2:4];offset:=center-vessel[1:3];
    if offset*offset>(5.5+length/2+halfWidth+abs(draft))^2 then return;end if;
    ra:=basis(animal[5],animal[6],animal[9]);rb:=basis(vessel[6],-vessel[5],vessel[4]);rt:=transpose(rb);
    caps:=shapes(wingAngle,starboardAngle);halfHeight:=max(.04,if draft<0 then -draft else draft/2);
    z0:=if draft<0 then 0 else -halfHeight;run:=max(.001,length/2-halfWidth);
    omegaA:={0,0,animalRates[3]}+{sin(animal[5]),-cos(animal[5]),0}*animalRates[2]+ra[:,1]*animalRates[1];
    omegaB:={0,0,vesselVelocity[3]}+{-sin(vessel[6]),cos(vessel[6]),0}*vesselPitchRate+rb[:,1]*vesselRollRate;
    best:=0;
    for j in 1:10 loop
      aa:=rt*(offset+ra*caps[j,1:3]);bb:=rt*(offset+ra*caps[j,4:6]);
      r:=caps[j,7];combined:=r+halfWidth;zScale:=combined/(r+halfHeight);
      aa[3]:=aa[3]*zScale;bb[3]:=bb[3]*zScale;
      // Retain borderline candidates across floating-point interpolation.
      boundsRadius:=combined+1e-12*(1+run+abs(spacing)+abs(z0*zScale)+abs(aa[3])+abs(bb[3]));
      for k in 1:(if spacing>0 then 2 else 1) loop
        a:={-run,if k==1 then spacing else -spacing,z0*zScale};b:={run,a[2],a[3]};
        // Axis projections in the same scaled frame as the distance query.
        // Only disjoint intervals can bypass the exact capsule witnesses.
        if min(aa[3],bb[3])<=a[3]+boundsRadius and max(aa[3],bb[3])>=a[3]-boundsRadius and
           min(aa[2],bb[2])<=a[2]+boundsRadius and max(aa[2],bb[2])>=a[2]-boundsRadius and
           min(aa[1],bb[1])<=run+boundsRadius and max(aa[1],bb[1])>=-run-boundsRadius then
          uv:=closest(aa,bb,a,b);ca:=aa+uv[1]*(bb-aa);cb:=a+uv[2]*(b-a);
          d:=cb-ca;gap:=sqrt(d*d)-combined;
          if gap<best then
            n:={d[1],d[2],d[3]*zScale};
            if n*n<1e-9 then n:={0,0,1};end if;
            normal:=rb*n/sqrt(n*n);body:=caps[j,1:3]+uv[1]*(caps[j,4:6]-caps[j,1:3]);
            // Use the same ENU witness on both bodies. The torques sum to zero
            // about any fixed world origin, including for a tilted vessel.
            point:=center+ra*body+normal*r;leverA:=point-center;leverB:=point-vessel[1:3];
            side:=if mod(j,2)==1 then 1 else -1;
            arm:=body-{0,side*.48,0};
            wingV:=if j>=5 then cross({side*(if side==1 then wingRate else starboardRate),0,0},arm) else zeros(3);
            v:={vesselVelocity[1]-animal[7],vesselVelocity[2]-animal[8],vesselVertical-animalVertical}
                  +cross(omegaB,leverB)-cross(omegaA,leverA)-ra*wingV;
            vn:=v*normal;vt:=v-vn*normal;
            fn:=max(0,-2200*gap-270*vn*min(1,-gap/.025));force:=fn*(normal-.12*vt/sqrt(vt*vt+.04));
            wrench:=cat(1,force,cross(leverB,force),-force,-cross(leverA,force));best:=gap;
            hinge:=zeros(2);
            if j>=5 then
              arm:=transpose(ra)*leverA-{0,side*.48,0};
              hinge[if side==1 then 1 else 2]:=cross(arm,-transpose(ra)*force)*{side,0,0};
            end if;
          end if;
        end if;
      end for;
    end for;
  end pair;
end MantaContact;
