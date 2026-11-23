model Sailboat "Autonomous fin-keel sloop on a three-leg closed course"
  function rigCapsules "Mast, sagging stays and three strips per rudder blade"
    input Real mast[8,3],stays[3,3,3],helm;
    output Real shapes[19,7] "Capsule endpoints and radius in hull axes";
  protected
    Real cs,sn,upper,lower;
    Integer row;
  algorithm
    for i in 1:7 loop
      shapes[i,:]:=cat(1,mast[i,:],mast[i+1,:],{.065});
    end for;
    for i in 1:3 loop
      for j in 1:2 loop
        shapes[7+2*(i-1)+j,:]:=cat(1,stays[i,j,:],stays[i,j+1,:],{if i<3 then .006 else .004});
      end for;
    end for;
    cs:=cos(helm);sn:=sin(helm);
    for side in 1:2 loop
      for i in 1:3 loop
        row:=13+3*(side-1)+i;
        upper:=-.071-.066*i;lower:=-.163-.017*i;
        shapes[row,:]:={-2.545+cs*upper,(3-2*side)*1.02-sn*upper,.195,
          -2.545+cs*lower,(3-2*side)*1.02-sn*lower,-.53+.033*(i-1),.039};
      end for;
    end for;
  end rigCapsules;

  function rigTerrainContact "Terrain reaction of the standing rig and rudders"
    input Real pos[3],heading,rotation[3,3],velocity[3],spin[3],shapes[19,7];
    output Real wrench[6];
  protected
    Real cs,sn,arm[3],p[3],delta[3],contact[5],force[3],lever[3],peak;
    Integer intervals;
  algorithm
    wrench:=zeros(6);
    if Shore.aboveFlatBottom(pos[1],pos[2],pos[3],8.7) then return;end if;
    cs:=cos(heading);sn:=sin(heading);
    for i in 1:19 loop
      delta:=shapes[i,4:6]-shapes[i,1:3];
      intervals:=if i<=7 then 5 elseif i<=13 then 9 else 3;
      peak:=0;force:=zeros(3);lever:=zeros(3);
      for j in 0:9 loop
        if j>intervals then break;end if;
        arm:=rotation*(shapes[i,1:3]+j/intervals*delta);
        p:=pos+{cs*arm[1]-sn*arm[2],sn*arm[1]+cs*arm[2],arm[3]};
        if not Shore.aboveFlatBottom(p[1],p[2],p[3],shapes[i,7]) then
          contact:=Shore.skinContact(p,cs,sn,velocity+cross(spin,arm),if i<=13 then 16 else 85,shapes[i,7]);
          if contact[4]>peak then
            peak:=contact[4];force:=contact[1:3];lever:=arm;
          end if;
        end if;
      end for;
      wrench:=wrench+cat(1,force,cross(lever,force));
    end for;
  end rigTerrainContact;

  function mastDeflection "Displacement of a luff station from the unloaded mast centreline"
    input Real fraction,support,tip,slope,tangLean[2],lowerBow;
    output Real displacement[3];
  protected
    Real z,lowerShape;
  algorithm
    z:=(fraction-support)/(1-support);
    // Parabolic curvature between the tack and tang under the eccentric
    // compression load. Continue its slope into the unsupported top.
    lowerShape:=if fraction<=support then 4*(fraction/support)*(1-fraction/support)
      else -4*(1-support)/support*z*(1-z)^2;
    displacement:={tangLean[1],tangLean[2],0}*fraction/support+
      (tip*SailMembrane.bendShape(fraction,support)+lowerBow*lowerShape)*{1,0,slope};
  end mastDeflection;
  function wetTriangle "Fraction below a planar water surface, linear depth across a triangle"
    input Real depths[3] "Positive below water [m]";
    output Real fraction;
  protected
    Real low,mid,high;
  algorithm
    low:=min(depths); high:=max(depths); mid:=sum(depths)-low-high;
    if high<=0 then fraction:=0;
    elseif low>=0 then fraction:=1;
    elseif mid<=0 then fraction:=high/(high-low)*high/(high-mid);
    else fraction:=1-low/(low-high)*low/(low-mid);
    end if;
  end wetTriangle;

  function waterStrip "Water pressure normal to a flexible sail panel in heading-aligned axes"
    input Real corners[4,3], normal[3], waterVelocity[3], panelVelocity[3];
    input Real height,slopeX,slopeY,area;
    output Real wet;
    output Real force[3];
  protected
    Real depth[4],speed;
  algorithm
    for j in 1:4 loop
      depth[j]:=height+slopeX*corners[j,1]+slopeY*corners[j,2]-corners[j,3];
    end for;
    wet:=(wetTriangle(depth[{1,2,3}])+wetTriangle(depth[{1,3,4}]))/2;
    speed:=(waterVelocity-panelVelocity)*normal;
    force:=0.5*1025*1.2*wet*area*speed*abs(speed)*normal;
  end waterStrip;
  function shadowWind "Wind sampled over three span stations on one sail"
    input Real east,north,tackHeight,projectedSpan,windEast,windNorth,traffic[:,9];
    output Real localWind[2];
  protected
    constant Real spanStation[3]={.16,.43,.73},spanWeight[3]={.45,.35,.20};
    Real dx,dy,dist2,u,v,speed,along,across,height,area,centerHeight;
    Real lateralWidth,verticalWidth,angle,dragArea,sideForceRatio,amplitude,overlap,cutoff;
    Real fraction,total,loss[2];
  algorithm
    total:=0;
    loss:=zeros(2);
    for p in 1:size(traffic,1) loop
      if traffic[p,1]>.5 and traffic[p,9]<1.5 then
        dx:=east-traffic[p,2]; dy:=north-traffic[p,3]; dist2:=dx*dx+dy*dy;
        height:=if traffic[p,9]>.5 then 7.36 else 2.6;
        area:=if traffic[p,9]>.5 then 20 else 2.3;
        if dist2<(8*height)^2 then
          u:=windEast-traffic[p,5]; v:=windNorth-traffic[p,6];
          speed:=sqrt(u*u+v*v);
          if speed>.1 then
            along:=(dx*u+dy*v)/speed;
            if along>0 then
              angle:=atan2(u*sin(traffic[p,4])-v*cos(traffic[p,4]),
                -u*cos(traffic[p,4])-v*sin(traffic[p,4]));
              // Estimate source drag and side force from its apparent wind angle.
              dragArea:=area*(.04+.19*sin(angle)^2+.34*max(0,-cos(angle))^2);
              sideForceRatio:=.45*sin(2*angle);
              across:=(dy*u-dx*v)/speed-sideForceRatio*.18*along;
              lateralWidth:=.13*height+.105*along;
              verticalWidth:=.25*height+.055*along;
              // Gaussian momentum deficit: D = rho*U^2*pi*sy*sz*(2a-a^2).
              amplitude:=1-sqrt(max(.12,1-dragArea/(2*Modelica.Constants.pi*lateralWidth*verticalWidth)));
              centerHeight:=traffic[p,8]+.47*height;
              overlap:=0;
              for k in 1:3 loop
                overlap:=overlap+spanWeight[k]*exp(-.5*((tackHeight+projectedSpan*spanStation[k]-centerHeight)/verticalWidth)^2);
              end for;
              cutoff:=max(0,1-dist2/(8*height)^2)^2*(1-exp(-(along/(.12*height))^2));
              fraction:=amplitude*overlap*cutoff*exp(-.5*(across/lateralWidth)^2);
              loss:=loss+fraction*({u,v}-sideForceRatio*{-v,u});
              total:=total+fraction;
            end if;
          end if;
        end if;
      end if;
    end for;
    localWind:={windEast,windNorth}-loss/max(1,total/.65);
  end shadowWind;
  function contactSection "Circle centre and radius in the hull's waterline plane"
    input Real kind;
    input Integer hull,station;
    output Real centerRadius[3];
  protected
    constant Real sloop[7,2]=[-.93,.18;-.68,.26;-.31,.335;.12,.321;.52,.258;.83,.19;1.10,.11];
    constant Real committee[7,2]=[-2.28,.72;-1.79,.90;-1.03,1.04;0,1.02;.88,.96;1.73,.73;2.57,.39];
  algorithm
    centerRadius:=if kind>2.5 then {committee[station,1],0,committee[station,2]}
      elseif kind>.5 then {.95*(station-3),(3-2*hull)*1.02,.49}
      else {sloop[station,1],0,sloop[station,2]};
  end contactSection;

  function frameToWorld
    input Real yaw,heel,pitch;
    output Real R[3,3];
  protected
    import MultiBodyLie.Frames.axisRotationT;
  algorithm
    R:=transpose(axisRotationT(1,heel)*axisRotationT(2,pitch)*axisRotationT(3,yaw));
  end frameToWorld;

  function againstHull "Contact witnesses on a triangulated hull"
    input Real meshPose[7],meshTilt[2],meshKind,otherPose[7],otherTilt[2],otherKind,scale;
    output Real force[2],momentMesh,momentOther,peak;
  protected
    final parameter Real pontoon[96,3]=Shore.pontoonVertices(),cruiser[96,3]=Shore.cruiserVertices();
    final parameter Integer faces[188,3]=Shore.pontoonFaces();
    Real a[3,3],b[3,3],shift[3],test[3],sample[3],point[3],rel[3],intersect[4],n[3],drag[2];
    Real candidateForce[2],candidateA,candidateB;
    Real disk[3],depth,strongest,horizontal,rate,f,armA[3],armB[3],leverA[2],leverB[2],radius;
  algorithm
    force:=zeros(2);momentMesh:=0;momentOther:=0;peak:=0;
    a:=frameToWorld(meshPose[3],meshTilt[1],meshTilt[2]);
    b:=frameToWorld(otherPose[3],otherTilt[1],otherTilt[2]);
    shift:={otherPose[1]-meshPose[1],otherPose[2]-meshPose[2],otherPose[7]-meshPose[7]};
    for h in 1:(if meshKind<1.5 then 2 else 1) loop
      strongest:=0;candidateForce:=zeros(2);candidateA:=0;candidateB:=0;
      for k in 1:(if otherKind>.5 and otherKind<1.5 then 2 else 1) loop
        for i in 1:(if otherKind>.5 and otherKind<2.5 then 96 else 7) loop
          if otherKind>.5 and otherKind<1.5 then
            sample:=pontoon[i,:]+{0,(3-2*k)*1.02,0};
            radius:=.026;
          elseif otherKind>=1.5 and otherKind<2.5 then
            sample:=cruiser[i,:];
            radius:=.026;
          else
            disk:=contactSection(otherKind,1,i);
            sample:={disk[1],disk[2],-.07};
            radius:=disk[3];
          end if;
          point:=b*sample;
          rel:=shift+point;
          test:=transpose(a)*rel;
          intersect:=if meshKind<1.5 then Shore.pontoonGap(test-{0,(3-2*h)*1.02,0},pontoon,radius,faces)
            else Shore.cruiserGap(test,cruiser,radius,faces);
          depth:=radius-intersect[1];
          if depth>0 then
            n:=a*intersect[2:4];
            horizontal:=sqrt(n[1]^2+n[2]^2);
            depth:=depth*horizontal;
            if horizontal>1e-5 then
              drag:={n[1],n[2]}/horizontal;
              armB:=point;armA:=rel-intersect[1]*n;
              leverA:={-armA[2],armA[1]};leverB:={-armB[2],armB[1]};
              rate:=drag*({otherPose[4]-meshPose[4],otherPose[5]-meshPose[5]}+otherPose[6]*leverB-meshPose[6]*leverA);
              f:=scale*max(0,22000*min(.24,depth)-680*min(1,depth/.012)*rate);
              if f>strongest then
                strongest:=f;
                candidateForce:=-f*drag;candidateA:=-f*(drag*leverA);candidateB:=f*(drag*leverB);
              end if;
            end if;
          end if;
        end for;
      end for;
      force:=force+candidateForce;momentMesh:=momentMesh+candidateA;momentOther:=momentOther+candidateB;
      peak:=max(peak,strongest);
    end for;
  end againstHull;

  function contactHeightRange "Conservative vertical bounds of the contact geometry in world axes"
    input Real kind,tilt[2];
    output Real bounds[2];
  protected
    Real extents[4],vertical,side;
  algorithm
    // The longitudinal/lateral bounds cover the whole hull, including both
    // pontoons on the Hobie. Committee and sloop witnesses include their radius.
    extents:=if kind>2.5 then {3.62,1.05,-1.12,.98}
      elseif kind>1.5 then {3.83,1.40,-.83,1.35}
      elseif kind>.5 then {2.55,1.25,-.41,.27}
      else {1.46,.34,-.41,.27};
    vertical:=cos(tilt[1])*cos(tilt[2]);
    side:=extents[1]*abs(sin(tilt[2]))+extents[2]*abs(sin(tilt[1])*cos(tilt[2]));
    bounds:={min(extents[3]*vertical,extents[4]*vertical)-side,
      max(extents[3]*vertical,extents[4]*vertical)+side};
  end contactHeightRange;

  function contactWrench "Horizontal compliant vessel contact at sampled hull surfaces"
    input Real pose[7],traffic[:,9],kind;
    input Real tilt[2]=zeros(2),trafficTilt[size(traffic,1),2]=zeros(size(traffic,1),2);
    output Real wrench[3],contact[size(traffic,1)];
  protected
    Real otherPose[7],fa[2],fb[2],ma,mb,qa,qb,pa,pb;
    Real sliceA[3],sliceB[3],x,y,u,v,dx,dy,d,r,rate,f,armX,armY,otherX,otherY,mass,otherMass,scale;
    Real localHeight[2],peerHeight[2];
  algorithm
    wrench:=zeros(3);contact:=zeros(size(traffic,1));
    mass:=if kind>1.5 then 3250 elseif kind>.5 then 206 else 64;
    localHeight:=contactHeightRange(kind,tilt)+fill(pose[7],2);
    for p in 1:size(traffic,1) loop
      if traffic[p,1]>.5 and (pose[1]-traffic[p,2])^2+(pose[2]-traffic[p,3])^2<100 then
        peerHeight:=contactHeightRange(traffic[p,9],trafficTilt[p,:])+fill(traffic[p,8],2);
        if min(localHeight[2],peerHeight[2])>=max(localHeight[1],peerHeight[1]) then
          otherMass:=if traffic[p,9]>2.5 then 1e8 elseif traffic[p,9]>1.5 then 3250 elseif traffic[p,9]>.5 then 206 else 64;
          scale:=max(1,mass*otherMass/((mass+otherMass)*103));
          otherPose:=traffic[p,2:8];
          if kind>.5 and kind<2.5 then
            (fa,ma,qa,pa):=againstHull(pose,tilt,kind,otherPose,trafficTilt[p,:],traffic[p,9],scale);
            if traffic[p,9]>.5 and traffic[p,9]<2.5 then
              (fb,mb,qb,pb):=againstHull(otherPose,trafficTilt[p,:],traffic[p,9],pose,tilt,kind,scale);
              wrench:=wrench+.5*cat(1,fa-fb,{ma+qb});
              contact[p]:=max(pa,pb);
            else
              wrench:=wrench+cat(1,fa,{ma});
              contact[p]:=pa;
            end if;
          elseif traffic[p,9]>.5 and traffic[p,9]<2.5 then
            (fb,mb,qb,pb):=againstHull(otherPose,trafficTilt[p,:],traffic[p,9],pose,tilt,kind,scale);
            wrench:=wrench+cat(1,-fb,{qb});
            contact[p]:=pb;
          else
            for i in 1:1 loop
              for j in 1:1 loop
                for k in 1:7 loop
                  sliceA:=contactSection(kind,i,k);
                  armX:=sliceA[1]*cos(pose[3])-sliceA[2]*sin(pose[3]);
                  armY:=sliceA[1]*sin(pose[3])+sliceA[2]*cos(pose[3]);
                  for l in 1:7 loop
                    sliceB:=contactSection(traffic[p,9],j,l);
                    otherX:=sliceB[1]*cos(traffic[p,4])-sliceB[2]*sin(traffic[p,4]);
                    otherY:=sliceB[1]*sin(traffic[p,4])+sliceB[2]*cos(traffic[p,4]);
                    dx:=pose[1]+armX-traffic[p,2]-otherX;dy:=pose[2]+armY-traffic[p,3]-otherY;
                    d:=sqrt(dx*dx+dy*dy);r:=sliceA[3]+sliceB[3];
                    if d<r and d>.0001 then
                      x:=dx/d;y:=dy/d;
                      u:=pose[4]-pose[6]*armY-traffic[p,5]+traffic[p,7]*otherY;
                      v:=pose[5]+pose[6]*armX-traffic[p,6]-traffic[p,7]*otherX;
                      rate:=u*x+v*y;f:=scale*max(0,850*(r-d)-55*rate);
                      wrench:=wrench+f*{x,y,armX*y-armY*x};
                      contact[p]:=max(contact[p],f);
                    end if;
                  end for;
                end for;
              end for;
            end for;
          end if;
        end if;
      end if;
    end for;
  end contactWrench;
  function forestayAdjusterPin "Quasistatic pin position of the second forestay adjuster"
    input Real tack[3],head[3],cordAnchor[3],plateLength,wireLength,EA,wireLoad[3];
    output Real pin[3];
  protected
    constant Real cordRest(unit="m")=.24;
    constant Real cordStiffness(unit="N/m")=85;
    Real axis[3],lead[3],fold[3],plate[3],turn[3],cord[3],wire[3],transverse[3],chord,cordLength;
    Real span,lo,hi,s,c,cordTorque,axial,tension,straightLength;
  algorithm
    axis:=head-tack;
    span:=sqrt(axis*axis);
    axis:=axis/span;
    lead:=cordAnchor-tack;
    fold:=lead-axis*(lead*axis);
    fold:=fold/max(1e-8,sqrt(fold*fold));
    // The cord pulls the hinged plate toward the bow. At each trial angle
    // the wire's axial force balances the cord and half the midpoint load.
    // The implied cable stretch and sag give the supported chord length.
    lo:=0;hi:=1;
    for iteration in 1:14 loop
      s:=(lo+hi)/2;c:=sqrt(1-s*s);
      plate:=c*axis+s*fold;
      turn:=-s*axis+c*fold;
      cord:=lead-plateLength*plate;
      cordLength:=sqrt(cord*cord);
      cordTorque:=cordStiffness*max(0,1-cordRest/cordLength)*(lead*turn);
      wire:=span*axis-plateLength*plate;
      chord:=sqrt(wire*wire);
      wire:=wire/chord;
      transverse:=wireLoad-wire*(wireLoad*wire);
      axial:=max(1e-6,(cordTorque+.5*(transverse*turn))*chord/(span*s));
      tension:=sqrt(axial^2+.25*(transverse*transverse));
      straightLength:=wireLength*(1+tension/EA)*axial/tension;
      if chord>straightLength then hi:=s;else lo:=s;end if;
    end for;
    s:=(lo+hi)/2;
    pin:=tack+plateLength*(sqrt(1-s*s)*axis+s*fold);
  end forestayAdjusterPin;

  function standingRig "One moving midpoint per elastic cable, mast step fixed"
    input Real anchors[3,3],tang[3],previous[2],rate[2],sailMomentBody[3],jibLoad[3],clothReaction[2,3],gravityBody[3];
    input Real dt,EA,preload,entrainedMass,previousSag[4,3],previousSagRate[4,3],apparentAir[3],halyard;
    input Real rigGravityMoment[3],cordAnchor[3];
    input Boolean catamaran;
    output Real lean[2],velocity[2],path[4,3,3],tension[4],lateralK[4],midSag[4,3],sagRate[4,3];
  protected
    constant Real adjusterLength(unit="m")=.20;
    Real direction[3],head[3],force[3],q[3],weight[3],crossAir[3],base[3],drive[2],dragK,rest,L,L0,P,lo,hi,sag,halfSpan,Tline,wireMass;
  algorithm
    // Boom/mast share the overturning moment. The headsail load below is
    // already carried by the forestay and is omitted from this applied moment.
    drive:={sailMomentBody[2]+rigGravityMoment[2],-sailMomentBody[1]-rigGravityMoment[1]}/(tang[3]-.41);
    head:=tang+{previous[1],previous[2],0};
    for i in 1:4 loop
      base:=anchors[min(i,3),:];
      direction:=head-base;L:=sqrt(direction*direction);direction:=direction/L;
      q:=tang-base;L0:=sqrt(q*q);
      P:=if i<=2 then preload else preload*(2*.96/1.82)*L0/sqrt(.96^2+1.02^2+5.51^2);
      // The hoisted jib contains its own luff wire. The longer forestay
      // supports the mast independently when the adjustable halyard is eased.
      rest:=if i==4 then L0+.055 else L0/(1+P/EA)+
        (if i==3 then .123*(.55-halyard)+.058*max(0,.55-halyard) else 0);
      weight:=.045*L0*.5*gravityBody;
      force:=weight+(if i<=2 then clothReaction[min(i,2),:] elseif i==3 then jibLoad else zeros(3));
      // Resolve wind load and inertia perpendicular to the local wire chord.
      // Once unloaded the wire can move freely until its available length is used.
      crossAir:=apparentAir-direction*(apparentAir*direction);
      wireMass:=if i<>3 then .5*.045*L0 else 0;
      force:=force+(if i<>3 then .25*1.225*1.15*.006*L0*sqrt(crossAir*crossAir)*crossAir else zeros(3));
      if catamaran and i==4 then
        rest:=rest-adjusterLength;
        base:=forestayAdjusterPin(base,head,cordAnchor,adjusterLength,rest,EA,force);
        direction:=head-base;L:=sqrt(direction*direction);direction:=direction/L;
      end if;
      dragK:=((if i<>3 then 1.85 else 8)+(wireMass+entrainedMass)/dt)/dt;
      force:=force+dragK*previousSag[i,:]+wireMass/dt*previousSagRate[i,:];
      force:=force-direction*(force*direction);
      P:=sqrt(force*force);
      // Midpoint transverse force balance. Either half may carry tension
      // only. Cable length and geometric stiffness grow as it deflects.
      lo:=0;hi:=.5*sqrt(max(0,rest^2-L^2))+.02+L*(P/EA)^(1/3);
      for iteration in 1:16 loop
        sag:=(lo+hi)/2;halfSpan:=sqrt(.25*L^2+sag^2);
        Tline:=EA*max(0,2*halfSpan/rest-1);
        if (2*Tline+dragK*halfSpan)*sag<P*halfSpan then lo:=sag;else hi:=sag;end if;
      end for;
      sag:=(lo+hi)/2;halfSpan:=sqrt(.25*L^2+sag^2);
      path[i,1,:]:=base;path[i,3,:]:=head;
      midSag[i,:]:=sag*force/max(1e-10,P);
      sagRate[i,:]:=(midSag[i,:]-previousSag[i,:])/dt;
      path[i,2,:]:=(head+base)/2+midSag[i,:];
      tension[i]:=EA*max(0,2*halfSpan/rest-1);
      q:=(path[i,2,:]-head)*tension[i]/halfSpan;
      drive:=drive+q[1:2];
      lateralK[i]:=2*tension[i]/halfSpan+2*EA/rest*sag^2/halfSpan^2;
    end for;
    // First fore-aft and athwartship hounds sway mode. Backward damping
    // accounts for rig losses without a high-frequency cable time step.
    // The spherical mast step allows fore-aft rake until the stays take
    // the load. Keep the elastic support of the transverse mast mode.
    velocity:=((14+entrainedMass)*rate+dt*(drive-{0,850*previous[2]}))/(14+entrainedMass+dt*350);
    lean:=previous+dt*velocity;
  end standingRig;
  input Real traffic[4,9] "Active, east, north, yaw, east/north velocity, yaw rate, height, hull type (0 sloop, 1 Hobie, 2 cruiser)";
  input Real trafficTilt[4,2]=zeros(4,2),sceneTilt[6,2]=zeros(6,2);
  final parameter Real pontoonContactVertices[96,3]=Shore.pontoonVertices();
  final parameter Integer pontoonContactFaces[188,3]=Shore.pontoonFaces();
  input Real sceneTraffic[6,9]=zeros(6,9) "Five shared NPCs and the anchored launch";
  discrete output Real sceneForce[3](each start=0,each fixed=true),sceneContact[6](each start=0,each fixed=true);
  discrete output Real peerForce[3](each start=0,each fixed=true) "World east/north force and yaw moment";
  discrete output Real peerContact[4](each start=0,each fixed=true) "Maximum normal contact force against each peer [N]";
  input Real wakeEast,wakeNorth,wakeYaw "Free-surface pressure reaction from the local wave FMU";
  input Real useSectionWater,sectionWater[2,6],previousWater[2,6],waterStamp;
  parameter Boolean useRefinedSectionWater=false "Supply water at the native hull integration stations";
  input Real refinedSectionWater[2,hydroPanelCount](each start=0);
  input Real previousRefinedSectionWater[2,hydroPanelCount](each start=0);
  output Real hydroSectionWater[2,hydroPanelCount] "Interpolated sample elevation before analytic swell [m]";
  output Real hydroSectionVolume[2,hydroPanelCount] "Displaced volume of each native hull panel [m3]";
  Real waterFraction;
  input Real windEast, windNorth, currentEast, currentNorth, waveHeight, waveRoll, wavePitch;
  input Real orbitalEast,orbitalNorth,orbitalUp "Wave particle velocity at the boat [m/s]";
  input Real tacticalCourse[3]=zeros(3) "Override the autopilot with an enabled heading and sail power setting";
  input Real raceGoal[3](each start=0) "Enable, east, north; the standalone pilot defaults to its local course";
  input Real manualHelm,rudderInput,trimInput;
  input Real vangInput "Tackle adjustment, 0 eased to 1 tight";
  input Real droneLoad[6] "Drone contact force and moment about hull origin, ENU";
  output Real landingDeck[12] "Hull ENU pose and twist, with bow-up pitch";
  Real boomElevation(start=.04,fixed=true),boomLiftRate(start=0,fixed=true);
  Real vangLength,vangTension,vangArm,clewTorque;
  parameter Real vangAttachment=.42,vangDrop=.115;
  input Real downhaulInput "Catamaran luff adjustment, 0 eased to 1 hauled";
  parameter Real downhaulTravel(unit="m")=if catamaran then .14 else .10 "Available shortening at the tack";
  parameter Real luffRigidity(unit="N")=45000, downhaulStiffness(unit="N/m")=40000;
  input Real outhaulInput(start=.65) "Main clew adjustment, zero eased and one tight";
  input Real manualJibAssist(start=1) "Back the jib briefly during a hand-steered tack";
  output Real mainClewOffset(start=0,fixed=true) "Aft travel of the main clew from neutral [m]";
  final parameter Real outhaulTravel=.18;
  Real clewArm;
  Real downhaulShortening(start=0,fixed=true),tackDrop,downhaulTension;
  Real payout(start=.12,fixed=true),drumAngle,lineSpeed,boomLimit;
  parameter Real drumRadius=.043, sheetArm=.44;
  parameter Boolean catamaran=false;
  parameter Real launchSpeed=.45,launchHeight=.2,launchPitch=0,launchVertical=0,launchPitchRate=0;
  parameter Real launchSeaState=0 "Sea preset used to place the hull on the initial incident swell";
  final parameter Real launchSwellK=Wreck.SpectralSea.swellWaveNumber(launchSeaState);
  final parameter Real launchSwellA=Wreck.SpectralSea.swellHeight(launchSeaState);
  final parameter Real launchSwellPhase=launchSwellK*(launchEast*cos(swellBearing)+launchNorth*sin(swellBearing));
  final parameter Real launchSwellOmega=sqrt(Wreck.g*launchSwellK*tanh(launchSwellK*Wreck.SpectralSea.nearshoreDepth));
  final parameter Real launchSwellSlope=launchSwellA*launchSwellK*cos(launchSwellPhase);
  input Real swellAmplitude,reachTrial,deckManual,mainCarInput,jibCarInput,jibTrimInput;
  Real mainCar(start=0,fixed=true),jibCar(start=0,fixed=true),jibSheet(start=.35,fixed=true);
  parameter Integer sailOf[3]={1,2,2};
  parameter Real attachRadius[2]={if catamaran then 1.84 else .44,feet[2]};
  Real fairlead[3,3],attachment[2,3],tipLocal[2,3],tipVel[2,3],leadVel[3,3];
  Real sheetForce[3,3],lineDirection[3,3],ropeTorque[3,3],lineSpan[3],lineRate[3],lineTension[3],lineTarget[3];
  parameter Real travelerRiser(unit="m")=.05 "Traveler pin height above the rail datum";
  final parameter Real mainBailDrop=if catamaran then .085 else 0 "Mainsheet attachment below the boom track [m]";
  final parameter Real initialBailReach=attachRadius[1]*cos(.04)+mainBailDrop*sin(.04);
  final parameter Real mainInitialSpan=sqrt((attachRadius[1]-initialBailReach*cos(.17))^2+
    (initialBailReach*sin(.17))^2+(.50-travelerRiser+attachRadius[1]*sin(.04)-mainBailDrop*cos(.04))^2);
  Real linePaid[3](start={if catamaran then mainInitialSpan else .32,.32,.32},each fixed=true),trimRate[2](each start=0,each fixed=true),hingeLoad[2],sheetYaw[3],sheetLift;
  parameter Real mastEI(unit="N.m2")=11000 "Effective fore-aft rigidity of the aluminium spar and flexible composite tip";
  parameter Real mainMastRake(unit="rad")=if catamaran then .112 else 0 "Aft rake of the unloaded mast";
  parameter Real easedSailFootAngle(unit="rad")=.003 "Unstrained fore-aft cut of the main foot";
  final parameter Real mainMastSlope=tan(mainMastRake);
  final parameter Real mastStep[3]={.44,0,.443};
  final parameter Real travelerPinX=-1.40;
  final parameter Real travelerDeckZ=.47;
  parameter Real mastModalMass(unit="kg")=6, mastDampingRatio=.22;
  final parameter Real stayFraction=if catamaran then (5.85-footZ[1])/spans[1] else .68;
  final parameter Real mastStiffness=3*mastEI/(spans[1]^3*(1-stayFraction)^2);
  final parameter Real mastHeadSlope=(1.5-.5*stayFraction)/((1-stayFraction)*spans[1]);
  final parameter Real mastGeometricFactor=(.2*stayFraction^3/(1-stayFraction)^2
    +stayFraction^2/(1-stayFraction)+2*stayFraction+1.2*(1-stayFraction))/spans[1];
  parameter Real luffTrackOffset(unit="m")=.060 "Eccentricity of the luff tension at the aft mast track";
  Real mastTip(start=0,fixed=true),mastTipRate(start=0,fixed=true);
  Real mastAxialLoad,mastLoadedStiffness,gooseneckOffset[3];
  final parameter Real lowerMastSpan=spans[1]*stayFraction;
  final parameter Real lowerMastBucklingLoad=Modelica.Constants.pi^2*mastEI/lowerMastSpan^2;
  Real lowerMastBow;
  output Real mastBend "Largest fore-aft distance from the tack-to-head chord [m]";
  output Real mastStations[8,3] "Mast step, six luff stations and masthead in hull axes";
  output Real rigCollision[19,7] "Modelica collision capsules for mast, stays and rudder blades";
  discrete Real rigShoreWrench[6](each start=0,each fixed=true);
  output Real mainGooseneck[3] "Actual main boom hinge in hull axes";
  output Real mainBlockPins[2,3] "Lower and upper mainsheet tackle pins in hull axes";
  output Real boomDeckClearance(unit="m") "Vertical clearance under the aft end of the boom relative to the aft crossbar";
  final parameter Real boomTailOverhang=.13,boomSectionBottom=.064;
  parameter Real mainsheetEA(unit="N")=30000 "Assumed working axial rigidity of one sheet part";
  parameter Real sheetTail(unit="m")=2 "Loaded line between tackle and cam cleat";
  final parameter Integer purchase=6;
  parameter Real sheetHaulForce(unit="N")=if catamaran then 560 else 330 "Peak sustained force at the working tail";
  parameter Real sheetHoldingForce(unit="N")=if catamaran then 620 else 500 "Assumed slip load at the working tail";
  Real haulFraction,brakeSlip;
  Real mainSheetStiffness(unit="N/m") "Effective stiffness across both blocks";
  parameter Real blockStack(unit="m")=if catamaran then .295 else .20 "Estimated closed pin-to-pin stack including both fittings";
  output Real mainBlockClearance "Free distance between the mainsheet block cheeks [m]";
  // The hoisted sail supports the boom when the sheet is slack. The sewn
  // leech length establishes the unstrained foot angle independently of the block stack.
  final parameter Real footCut=if catamaran then easedSailFootAngle else 0;
  parameter Real leechEA(unit="N")=26000 "Estimated effective rigidity of the sewn leech and its bias cloth";
  final parameter Real leechRest=sqrt((spans[1]-feet[1]*sin(footCut))^2
    +(feet[1]*cos(footCut)-spans[1]*mainMastSlope)^2)+.012;
  Real leechDelta[3],leechDirection[3],leechLength,leechLoad,leechLift;
  Real blockContact,mainTension,jibTension;
  Real jibTrimTarget,jibReach,jibDepower,apparentWindAngle;
  parameter Real mastRotationStop(unit="rad")=1.02 "Estimated travel to the stops at the mast step";
  output Real mastRotation(start=.17,fixed=true,unit="rad") "Rotation of the spar on its ball joint";
  Real mastRotationRate(start=0,fixed=true),mastTrackOffset[3],boomCompression,mastTwist;
  final parameter Real gooseneckEccentricity(unit="m")=.042;
  final parameter Real bailFromGooseneck=attachRadius[1]-(if catamaran then gooseneckEccentricity else 0)
    "Bail reach measured from the track rather than the mast axis";
  parameter Real standingRigMass(unit="kg")=16 "Estimated weight of the mast, boom and sail rig";
  Real rigGravityMoment[3];
  output Real exposedSheetSag[3] "Free-span deflection with excess line retained on deck";
  parameter Real stayEA(unit="N")=520000,shroudPreload(unit="N")=220;
  final parameter Real sideStayX=-.30;
  final parameter Real stayAnchors[3,3]=[sideStayX,1.02,.34;sideStayX,-1.02,.34;footX[2],0,footZ[2]];
  final parameter Real forestayCordAnchor[3]={2.345,0,.65} "Forward eye on the bridle shackle";
  final parameter Real tang[3]={mastStep[1]-(5.85-mastStep[3])*mainMastSlope,0,5.85};
  Real jibStation[6];
  input Real jibHalyardInput=.55 "Halyard adjustment from eased zero to hauled one";
  Real halyardSetting(start=.55,fixed=true);
  output Real stayPath[3,3,3],stayTension[3],stayStiffness[3];
  output Real forestayPath[3,3],forestayTension,jibHalyardTension,mastRake;
  discrete Real standingPaths[4,3,3],standingTension[4],standingStiffness[4];
  discrete Real midSag[4,3](each start=0,each fixed=true),midSagRate[4,3](each start=0,each fixed=true);
  discrete Real tangLean[2](each start=0,each fixed=true),tangRate[2](each start=0,each fixed=true);
  Real contactBody[2,3],mainMomentBody[3],jibWireLoad[3];
  output Real sailTail[2,6,3] "Paired face telltales on main and jib";
  output Real sailLuff[2] "Airflow-weighted luffing intensity on main and jib";
  output Real shroudTail[2,3] "Direction of each sidestay streamer in hull coordinates, port first";
  function streamerDirection
    input Real relativeVelocity[3],gravityDown[3],density;
    output Real direction[3];
  protected
    Real resultant[3];
  algorithm
    // Drag and weight per unit projected area for a light polyester ribbon.
    resultant:=.5*density*sqrt(relativeVelocity*relativeVelocity)*relativeVelocity+.05*9.80665*(1-density/1380)*gravityDown;
    direction:=resultant/max(1e-8,sqrt(resultant*resultant));
  end streamerDirection;
  Real tailArm[2,3],tailFluid[2,3];
  Real tailImmersion[2] "Wet fraction across the ribbon near the waterline";
  Real mainCarTarget,jibCarTarget,windSide,mainCarError,mainCarEasing,mainCarRate,mainCarResponse;
  Real trueWindAngle,windForCrew,buildingWind,depower,reachFraction,reachTrim,poweredReach,autoPayout,upwindGustEase;
  input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
  parameter Real swellBearing=Wreck.SpectralSea.swellBearing;
  input Real swellK=Wreck.SpectralSea.swellK;
  input Real swellOmega=sqrt(Wreck.g*Wreck.SpectralSea.swellK*
    tanh(Wreck.SpectralSea.swellK*Wreck.SpectralSea.nearshoreDepth));
  final parameter Real swellPresetAmplitudes[4]={Wreck.SpectralSea.swellHeight(0),Wreck.SpectralSea.swellHeight(.45),
    Wreck.SpectralSea.swellHeight(1.10),Wreck.SpectralSea.swellHeight(Wreck.SpectralSea.longSwellPreset)};
  final parameter Real swellPresetWaveNumbers[4]={Wreck.SpectralSea.swellK,Wreck.SpectralSea.swellK,
    Wreck.SpectralSea.swellK,Wreck.SpectralSea.swellWaveNumber(Wreck.SpectralSea.longSwellPreset)};
  final parameter Real swellPresetFrequencies[4]={sqrt(Wreck.g*swellPresetWaveNumbers[i]*tanh(swellPresetWaveNumbers[i]*Wreck.SpectralSea.nearshoreDepth)) for i in 1:4};
  output Real swellForce[2] "Incident swell pressure force in level forward/port axes [N]";
  Real hullSwellForce[2,2];
  Real swellPhase,swellLocal[2],waterDamping,waterVertical;
  final parameter Real waterplaneArea=sum((stationX[2:7]-stationX[1:6]).*(beamHalf[2:7]+beamHalf[1:6]))*(if catamaran then 2 else 1);
  parameter Real heaveDampingRatio=.38 "Estimated fraction of critical damping at design waterline";
  parameter Real podRadius=if catamaran then .17 else .075, podMass=if catamaran then 1.3 else .35;
  parameter Real podZ=if catamaran then 8.44 else 3.02;
  Real podCenter[3],podSurface[3],podNormal[3],podCap,podWetVolume,podBuoyancy,podRoll,podPitch,totalMass;
  output Real sectionVolume[2,6];
  Real wettedSkin[2],skinArea,hullRe,frictionCoefficient,skinDrag;
  parameter Real waterViscosity=1.05e-6 "Kinematic viscosity [m2/s]";
  parameter Real formFactor=.12 "Assumed viscous form factor, requires tow calibration";
  parameter Real foilTop[4]=if catamaran then {.10,.15,.10,.15} else {-.11,-.035,0,0};
  parameter Real foilBottom[4]=if catamaran then {-.34,-.57,-.34,-.57} else {-.75,-.405,-.1,-.1};
  Real foilEnd[4,2,3],foilDepth[4,2],foilArm[4,3],foilVelocity[4,3],foilBody[4,3];
  Real bodyLoad[4,3],foilLoad[4,3],foilTorque[4,3],foilCL[4],foilOrbital[4,3],foilPhase[4];
  Real impact[2,3],foredeckDepth[2],impactTorque[2];
  output Real deckImmersion,contactLoad;
  output Real bowClearance(unit="m") "Minimum foredeck height above incident water";
  output Real bowClearanceReserve(unit="m") "Dry foredeck margin sought by automatic trim";
  parameter Real spans[2]={2.6,2.12},feet[2]={1.28,.60};
  parameter Real footZ[2]=if catamaran then {.97,.87} else {.19,.19};
  parameter Real yawInertia=19,rollInertia=28,pitchInertia=12, halfSpacing=0;
  parameter Real ballastMass=0;
  parameter Real ballastTrapezeReach(unit="m")=2.10 "Maximum crew offset from the Hobie centreline";
  parameter Real rightingReach(unit="m")=.95 "Crew mass centre below the hull plane while leaning on the righting line";
  final parameter Real ballastNeutralZ(unit="m")=.52 "Normal crew height relative to the hull frame";
  input Real ballastManual,ballastCmdX,ballastCmdY;
  final parameter Real ballastReducedMass=ballastMass*(1-ballastMass/(mass+podMass))
    "Parallel-axis coefficient for shifting crew relative to the combined centre of mass [kg]";
  Real ballastRollInertia,ballastPitchInertia,ballastYawInertia,ballastHeightInertia,targetZ;
  Real crewSide(start=0,fixed=true),crewHeel(start=0,fixed=true),crewPitch(start=0,fixed=true),crewCross;
  Real trapezeDemand,crewPace,trimPitch,trimPitchRate,trimSlope;
  Real bowShortage,forwardSpeed,surfDemand,forwardBallastLimit;
  Real ballastX(start=0,fixed=true),ballastY(start=0,fixed=true),targetX,targetY;
  output Real ballastZ(unit="m",start=ballastNeutralZ,fixed=true) "Crew mass centre relative to the hull frame";
  discrete output Integer rightingSide(start=0,fixed=true) "Lower hull for righting, +1 port and -1 starboard";
  Real rightingLean;
  Real hullLift[2],hullPitch[2],hullRoll[2],massRoll,massPitch;
  parameter Real mass=64, noGo=if catamaran then 1.04 else .83;
  parameter Real launchEast=-8,launchNorth=-7,launchHeading=-2.1;
  parameter Real launchHeel(unit="rad")=0;
  Real east(start=launchEast,fixed=true), north(start=launchNorth,fixed=true), heading(start=launchHeading,fixed=true);
  output Real shoreWrench[6];
  Real surge(start=launchSpeed,fixed=true), sway(start=0,fixed=true), yawRate(start=0,fixed=true);
  // Effective inertia of the water entrained by the submerged part of each sail.
  // Chord and span mean-square arms use a triangular planform approximation.
  Real rigWaterMass[2],hingeWaterInertia[2],rigWaterInertia,levelYawMoment;
  Real heel(start=launchHeel+atan(launchSwellSlope*sin(swellBearing-launchHeading)),fixed=true);
  Real pitch(start=launchPitch-atan(launchSwellSlope*cos(swellBearing-launchHeading)),fixed=true);
  Real heave(start=launchHeight+launchSwellA*sin(launchSwellPhase),fixed=true);
  Real vertical(start=launchVertical+launchSwellA*cos(launchSwellPhase)*
    (launchSwellK*launchSpeed*cos(swellBearing-launchHeading)-launchSwellOmega),fixed=true);
  Real sheet,rudder(start=0,fixed=true);
  discrete Integer leg(start=1,fixed=true), tack(start=1,fixed=true);
  Real goalE,goalN,dx,dy,desired,upwind,relative,crossTrack,course,error,sheetTarget;
  output Real signedLogSpeed(start=launchSpeed,fixed=true) "Filtered through-water speed along the keel, positive ahead [m/s]";
  discrete output Integer tackRecovery(start=0,fixed=true) "0 tracking, 1 waiting for sternway, 2 backing, 3 sailing off";
  discrete Real stallDuration(start=0,fixed=true), phaseSince(start=0,fixed=true);
  discrete Integer recoveryTurn(start=1,fixed=true);
  discrete output Integer jibAssistSide(start=0,fixed=true) "Working side held during a manual tack, zero when idle";
  discrete Real jibAssistUntil(start=0,fixed=true);
  discrete Boolean reverseHelm(start=false,fixed=true);
  discrete Real fleetCourse(start=launchHeading,fixed=true);
  Real tackBand,raceCourse,raceError,windOffBow,jibWorkingSide,helmTarget;
  parameter Real forestaySlope=(1.16-.12)/(2.78-.09) "Aft rake per metre of rise";
  final parameter Real jibLuffSlope=if catamaran then (2.26-tang[1])/(tang[3]-.75) else forestaySlope;
  parameter Real footX[2]=if catamaran then {mastStep[1]-(footZ[1]-mastStep[3])*mainMastSlope,2.26-(footZ[2]-.75)*jibLuffSlope}
    else {.12,1.16-(footZ[2]-.09)*jibLuffSlope};
  parameter Real axisX[2]={-sin(mainMastRake),-jibLuffSlope/sqrt(1+jibLuffSlope^2)},
    axisZ[2]={cos(mainMastRake),1/sqrt(1+jibLuffSlope^2)};
  output Real sheetRotation[2,3,3] "Sail frame to hull frame";
  SailMembrane cloth[2](each attachedAirflow=catamaran,telltaleCount={if catamaran then 3 else 2,2},
    battenEI={{3.2,19.2},{1.6,3.0}},telltaleRows={if catamaran then {3,5,9} else {2,3,5},{2,4,5}},cutAngle={footCut,0},footInTrack={catamaran,false},each mastSupport=stayFraction,hasShrouds={true,false},battenCount={if catamaran then 8 else 0,if catamaran then 4 else 0},span=spans,foot=feet,rake={spans[1]*mainMastSlope,spans[2]*jibLuffSlope});
  Real rotation[3,3],rig[2,3,3],trim[2](each start=.17,each fixed=true) "Boom sweep and jib angle";
  Real waterRelative[3],spin[3],origin[2,3];
  Real pitchRate(start=launchPitchRate,fixed=true),rigMoment[2,3],rigForce[2,3],surfaceNormal[3];
  output Real sailVertex[2,24,3],wettedArea[2],leechSpeed[2],sailMoment[3];
  Real ve,vn,awx,awy,beta,fx,fy;
  output Real sailWind[2] "Mainsail local wind, east/north [m/s]";
  output Real rigWind[2,2] "Main and jib local wind, east/north [m/s]";
  Real foilAlpha[4],foilLift[4],foilDrag[4],foilSide[4],foilAxial[4],inflow[4],forward[4],angle[4],wetFoil[4];
  parameter Real foilX[4]={0.06,-0.93,0,0},foilY[4]={0,0,0,0},foilArea[4]={0.115,0.044,0,0},aspect[4]={3.5,2.6,1,1};
  output Real sailForward[2], sailPort[2], buoyancy;
  parameter Real fixInterval=0.2, gpsVariance=0.16;
  Real vane(start=0,fixed=true), vaneRate(start=0,fixed=true), cupSpeed(start=8,fixed=true);
  Real gyro,magnetic,accelX,accelY,measuredWindE,measuredWindN;
  discrete Real fixE(start=-8,fixed=true),fixN(start=-7,fixed=true);
  discrete Real navE(start=-8,fixed=true),navN(start=-7,fixed=true),speedE(start=0,fixed=true),speedN(start=0,fixed=true);
  discrete Real courseEstimate(start=-2.1,fixed=true),headingVar(start=0.04,fixed=true);
  discrete Real p11(start=.25,fixed=true),p12(start=0,fixed=true),p22(start=.25,fixed=true);
  discrete Real a11,a12,a22,kp,kv,predE,predN,headingPred,kh;
  Real rollRate(start=0,fixed=true);
  // Keep the six longitudinal wake-source bands. The Hobie integrates
  // each band at two longitudinal stations before combining their volumes.
  parameter Real stationX[7]={-1.1,-.82,-.3,.18,.63,.98,1.22};
  parameter Real beamHalf[7]={.22,.29,.335,.32,.235,.12,.01};
  parameter Real beamFraction[4]={0,.46,.86,1},deckZ=.077;
  parameter Real centerMassX=-.14846 "Longitudinal mass centre for level design trim [m]";
  Real pitchBuoyancy,weightArm;
  final parameter Integer hydroSubdivisions=if catamaran then 2 else 1;
  final parameter Integer hydroPanelCount=6*hydroSubdivisions;
  function splitStations
    input Real base[7];
    input Integer subdivisions;
    output Real refined[6*subdivisions+1];
  algorithm
    for band in 1:6 loop
      for point in 1:subdivisions loop
        refined[(band-1)*subdivisions+point]:=base[band]+(base[band+1]-base[band])*(point-1)/subdivisions;
      end for;
    end for;
    refined[6*subdivisions+1]:=base[7];
  end splitStations;
  function samplePanelWater
    input Real samples[6],bounds[7],x;
    output Real elevation;
  protected
    Real left,right,fraction;
  algorithm
    elevation:=samples[1];
    for i in 1:5 loop
      left:=.5*(bounds[i]+bounds[i+1]);
      right:=.5*(bounds[i+1]+bounds[i+2]);
      fraction:=max(0,min(1,(x-left)/(right-left)));
      elevation:=elevation+fraction*(samples[i+1]-samples[i]);
    end for;
  end samplePanelWater;
  function hullStations "Rigid section dimensions shared by every integration stage"
    input Real xs[:],widths[size(xs,1)],deck,depthScale;
    output Real stations[size(xs,1)-1,6] "Midpoint, half-beam, four keel-to-deck heights";
  protected
    Real x,w,scale,profile[3];
  algorithm
    for i in 1:size(xs,1)-1 loop
      x:=(xs[i]+xs[i+1])/2;
      w:=(widths[i]+widths[i+1])/2;
      if depthScale>1 then
        profile:=Shore.pontoonSection(x);
        stations[i,:]:={x,profile[1],profile[2]+(profile[3]-profile[2]),
          profile[2]+(profile[3]-profile[2])*.90,profile[2]+(profile[3]-profile[2])*.56,profile[2]};
      else
        scale:=(.48+1.55*w)*depthScale;
        stations[i,:]:={x,w,-.19*scale,-.16*scale,-.05*scale,deck};
      end if;
    end for;
  end hullStations;
  final parameter Real stationGeometry[6,6]=hullStations(stationX,beamHalf,deckZ,if catamaran then 2.65 else 1);
  final parameter Real hydroStationBounds[hydroPanelCount+1]=splitStations(stationX,hydroSubdivisions);
  final parameter Real hydroStationGeometry[hydroPanelCount,6]=hullStations(hydroStationBounds,
    splitStations(beamHalf,hydroSubdivisions),deckZ,if catamaran then 2.65 else 1);
  function hullHydrostatics
    input Real xs[:],stations[size(xs,1)-1,6],fractions[4],rot[3,3],surface[3],waterLevel,yOffset,depthScale;
    input Real sections[size(xs,1)-1],useSections;
    input Real amp,kDir[2],phase,waveNumber,frequency,translation[3],spinRate[3];
    output Real lift,pitchTorque,rollTorque,dynamicForce[3],dynamicPitch,maxForedeckDepth,volume[size(xs,1)-1],skin,swellForce[2];
  protected
    Real stationDeck,stationLevel,stationDepth,stationPhase,center[3],x,y,w,bottom,localZ,area,wetDepth,lever[3];
    Real sectionZ[4],localLift,crestPhase,crestSin,deckWet,wetFraction,normalV,waterV[3],velocity[3],panelForce[3];
    Real deckPressure,entryPressure,edgeDepth[2,4],depthA,depthB,wetLength,stripWidth,skinLength,sideSign;
    Real verticalProjection,normalY,waveY,waveZ,depthScaleInv,rotY[3],rotZ[3],waveSpeed;
    Boolean hasSwell;
  algorithm
    skin:=0;lift:=0; pitchTorque:=0;rollTorque:=0;dynamicForce:=zeros(3);dynamicPitch:=0;maxForedeckDepth:=-1e6;volume:=zeros(size(xs,1)-1);swellForce:=zeros(2);
    rotY:=rot[:,2];rotZ:=rot[:,3];
    normalY:=surface*rotY;verticalProjection:=surface*rotZ;
    depthScaleInv:=1/max(1e-9,abs(verticalProjection));
    waveY:=kDir*rotY[1:2];waveZ:=kDir*rotZ[1:2];
    hasSwell:=amp<>0;
    waveSpeed:=amp*frequency;
    for station in 1:size(xs,1)-1 loop
      x:=stations[station,1];w:=stations[station,2];
      sectionZ:=stations[station,3:6];stationDeck:=sectionZ[4];
      center:=x*rot[:,1]+yOffset*rotY;
      stationLevel:=waterLevel+(if useSections>.5 then sections[station]-surface[1:2]*center[1:2] else 0);
      stationDepth:=stationLevel+surface*center;
      stationPhase:=phase+kDir*center[1:2];
      // Adjacent sides of the transverse strips share their edges.
      for side in 1:2 loop
        sideSign:=if side==1 then 1 else -1;
        for edge in 1:4 loop
          y:=sideSign*w*fractions[edge];localZ:=sectionZ[edge];
          edgeDepth[side,edge]:=stationDepth+normalY*y+verticalProjection*localZ
            +(if hasSwell then amp*sin(stationPhase+waveY*y+waveZ*localZ) else 0);
        end for;
      end for;
      for strip in 1:3 loop
        bottom:=(sectionZ[strip]+sectionZ[strip+1])/2;
        localZ:=if verticalProjection<=0 then bottom else stationDeck;
        stripWidth:=w*(fractions[strip+1]-fractions[strip]);
        area:=(xs[station+1]-xs[station])*stripWidth;
        // Rigid rotation preserves the cross-sectional edge length.
        skinLength:=(xs[station+1]-xs[station])*sqrt(stripWidth^2+(sectionZ[strip+1]-sectionZ[strip])^2);
        for side in 1:2 loop
          y:=(if side==1 then 1 else -1)*w*(fractions[strip+1]+fractions[strip])/2;
          depthA:=edgeDepth[side,strip];depthB:=edgeDepth[side,strip+1];
          wetLength:=if min(depthA,depthB)>=0 then 1 elseif max(depthA,depthB)<=0 then 0 else max(depthA,depthB)/abs(depthA-depthB);
          skin:=skin+wetLength*skinLength;
          crestPhase:=stationPhase+waveY*y+waveZ*localZ;
          crestSin:=if hasSwell then sin(crestPhase) else 0;
          wetDepth:=min(stationDeck-bottom,max(0,(stationDepth+normalY*y+verticalProjection*localZ+amp*crestSin)*depthScaleInv));
          lever:=center+y*rotY+(localZ+(if verticalProjection<=0 then .5*wetDepth else -.5*wetDepth))*rotZ;
          volume[station]:=volume[station]+area*wetDepth;
          localLift:=1025*9.80665*area*wetDepth;
          if depthScale>1 then
            deckWet:=stationDepth+normalY*y+verticalProjection*stationDeck+(if hasSwell then
              amp*(if verticalProjection>0 then crestSin else sin(stationPhase+waveY*y+waveZ*stationDeck)) else 0);
            if x>1 then maxForedeckDepth:=max(maxForedeckDepth,deckWet);end if;
            if wetDepth>0 or deckWet>0 then
              wetFraction:=min(1,wetDepth/.065);
              // One-sided pressure on wetted underside and overtopped deck.
              // Relative velocity includes angular motion at this section and deep-water orbital flow.
              waterV:=if hasSwell then waveSpeed*{kDir[1]/waveNumber*crestSin,kDir[2]/waveNumber*crestSin,-cos(crestPhase)} else zeros(3);
              velocity:=translation+cross(spinRate,lever)-waterV;
              normalV:=velocity*rotZ;
              deckPressure:=-.5*1025*1.1*max(0,normalV)^2*min(1,max(0,deckWet)/.09);
              entryPressure:=.5*1025*.65*max(0,-normalV)^2*wetFraction;
              panelForce:=(entryPressure+deckPressure)*area*rotZ;
              // Form drag when the bow shoulders and foredeck bury.
              if x>1 then
                panelForce[1]:=panelForce[1]-.5*1025*.28*area*min(1,max(0,deckWet)/.15)*velocity[1]*abs(velocity[1]);
              end if;
              dynamicForce:=dynamicForce+panelForce;
              dynamicPitch:=dynamicPitch+(lever[3]-.52)*panelForce[1]-lever[1]*panelForce[3];
            end if;
          end if;
          lift:=lift+localLift;rollTorque:=rollTorque+lever[2]*localLift; pitchTorque:=pitchTorque-lever[1]*localLift;
        end for;
      end for;
      // Froude-Krylov surge from the near-surface horizontal pressure gradient.
      // Each shallow wetted section integrates -grad(rho*g*wave elevation).
      if hasSwell and volume[station]>0 then
        swellForce:=swellForce-Wreck.rho*Wreck.g*volume[station]*amp*cos(stationPhase)*kDir;
      end if;
    end for;
  end hullHydrostatics;

equation
  // Trampoline rail limits in hull coordinates, centred at the carriage mid-travel.
  waterFraction=min(1,max(0,(time-waterStamp)/.1));
  totalMass=mass+podMass;
  podCenter=rotation*(if catamaran then mastStations[8,:] else {footX[1]+mastTip,0,podZ});
  podSurface=surfaceNormal+cat(1,swellAmplitude*cos(swellPhase+swellLocal*podCenter[1:2])*swellLocal,{0});
  podNormal=podSurface/sqrt(podSurface*podSurface);
  podCap=max(0,min(2*podRadius,podRadius+(waveHeight-heave+surfaceNormal*podCenter+
    swellAmplitude*sin(swellPhase+swellLocal*podCenter[1:2]))/sqrt(podSurface*podSurface)));
  podWetVolume=3.14159265358979*podCap^2*(podRadius-podCap/3);
  podBuoyancy=1025*9.80665*podWetVolume;
  podRoll=(podCenter[2]+podNormal[2]*.75*(2*podRadius-podCap)^2/(3*podRadius-podCap))*podBuoyancy-podCenter[2]*podMass*9.80665;
  podPitch=-(podCenter[1]+podNormal[1]*.75*(2*podRadius-podCap)^2/(3*podRadius-podCap))*podBuoyancy+podCenter[1]*podMass*9.80665;
  swellPhase=swellK*(east*cos(swellBearing)+north*sin(swellBearing))-swellOmega*(time+seaClockOffset);
  swellLocal=swellK*{cos(swellBearing-heading),sin(swellBearing-heading)};
  bowClearance=if catamaran then -max(foredeckDepth) else 0;
  deckImmersion=max(0,-bowClearance);contactLoad=sum(hullLift);
  // The crew anticipates the new windward side and trims to sustained heel.
  // Filtering attitude keeps a passing wave from sending them across the deck.
  der(crewSide)=if catamaran then (tanh(3*sin(beta))-crewSide)/.65 else 0;
  der(crewHeel)=if catamaran then ((if rightingSide==0 then heel else 0)-crewHeel)/2.4 else 0;
  // Trim relative to the water face. When following a swell downhill the
  // matching bow-down angle is already balanced. Only the excess needs crew.
  trimSlope=tan(wavePitch)-swellAmplitude*swellLocal[1]*cos(swellPhase);
  trimPitch=atan(trimSlope);
  trimPitchRate=swellAmplitude*(swellLocal[1]*sin(swellPhase)*
    (swellK*(ve*cos(swellBearing)+vn*sin(swellBearing))-swellOmega)
    -swellLocal[2]*cos(swellPhase)*yawRate)/(1+trimSlope^2);
  der(crewPitch)=if catamaran then (pitch-trimPitch-crewPitch)/.85 else 0;
  crewCross=if trueWindAngle<1.60 then max(0,min(1,4*(abs(crewSide)-.4)))*max(0,min(1,(.20-ballastY*crewSide)/.25)) else 0;
  // Anticipate sustained sailing load from wind and filtered heel. Outboard
  // movement uses a windward trapeze stance, while deck trim stays gradual.
  trapezeDemand=min(1,max(0,max((windForCrew-8)/6,(abs(crewHeel)-.12)/.24)));
  crewPace=max(crewCross,trapezeDemand);
  // Keep reserve above the water before the forward deck immerses. A crew
  // already aft can respond sooner as a following sea steepens the run.
  forwardSpeed=max(0,-waterRelative[1]);
  bowClearanceReserve=if catamaran then .06+min(.12,.016*forwardSpeed) else 0;
  bowShortage=max(0,bowClearanceReserve-bowClearance);
  surfDemand=min(1,max(0,(forwardSpeed-2)/3))*
    min(1,max(0,(-swellAmplitude*swellLocal[1]*cos(swellPhase)-.03)/.10));
  forwardBallastLimit=.72-.60*surfDemand;
  // Stand on the immersed hull and lean below the deck from the upper hull's
  // righting line. Stop leaning as the rig rises, before climbing aboard.
  when sample(0,.1) then
    rightingSide=if not catamaran or ballastManual>.5 or ballastMass<=0 then 0
      elseif pre(rightingSide)<>0 then
        (if cos(heel)>.90 or cos(heel)<-.84 then 0 else pre(rightingSide))
      elseif (cos(heel)<.28 or (cos(heel)<.42 and (podCap>.03 or sum(wettedArea)>.35)))
        and cos(heel)>-.71 and abs(pitch)<.85
        and buoyancy+podBuoyancy>.1*totalMass*9.80665 then (if sin(heel)>0 then -1 else 1)
      else 0;
  end when;
  rightingLean=if rightingSide==0 then 0 else min(1,max(0,(.90-cos(heel))/.62));
  // Keep the crew's gravity lever on the restoring side of the lower hull as
  // it rises. Move the crew inboard before releasing the righting stance.
  targetZ=if rightingSide==0 then ballastNeutralZ else max(-rightingReach,min(
    ballastNeutralZ-rightingLean*(ballastNeutralZ+rightingReach),
    -abs(targetY)*max(0,cos(heel))/max(.35,abs(sin(heel)))-.20));
  targetX=if not catamaran then 0 elseif rightingSide<>0 then centerMassX
    elseif ballastManual>.5 then max(-.72,min(.72,ballastCmdX)) else
    max(-.72,min(forwardBallastLimit,-3.6*crewPitch-.70*(pitchRate-trimPitchRate)-7*bowShortage));
  targetY=if not catamaran then 0 elseif rightingSide<>0 then halfSpacing*rightingSide*min(1,2*rightingLean)
    elseif ballastManual>.5 then max(-ballastTrapezeReach,min(ballastTrapezeReach,ballastCmdY)) else
    max(-ballastTrapezeReach,min(ballastTrapezeReach,
      (.56*buildingWind+(ballastTrapezeReach-.56)*trapezeDemand)*crewSide+1.15*crewHeel));
  der(ballastX)=if rightingSide<>0 or ballastManual>.5 then max(-.35,min(.35,(targetX-ballastX)/.65))
    else max(-.28-.24*min(1,bowShortage/.10),min(.28,(targetX-ballastX)/1.0));
  der(ballastY)=if rightingSide<>0 then max(-1.2,min(1.2,(targetY-ballastY)/.36))
    elseif ballastManual>.5 then max(-.48,min(.48,(targetY-ballastY)/.55))
    else max(-.14-.54*crewPace,min(.14+.54*crewPace,(targetY-ballastY)/(2.4-1.85*crewPace)));
  der(ballastZ)=if catamaran then max(-1.6,min(1.6,(targetZ-ballastZ)/.40)) else 0;
  // The nominal inertias already include seated crew at ballastNeutralZ.
  ballastHeightInertia=ballastReducedMass*(ballastZ^2-ballastNeutralZ^2);
  ballastRollInertia=ballastReducedMass*ballastY^2+ballastHeightInertia;
  ballastPitchInertia=ballastReducedMass*ballastX^2+ballastHeightInertia;
  ballastYawInertia=ballastReducedMass*(ballastX^2+ballastY^2);
  massRoll=-9.80665*ballastMass*(rotation[2,1]*ballastX+rotation[2,2]*ballastY+rotation[2,3]*ballastZ);
  massPitch=9.80665*ballastMass*(rotation[1,1]*ballastX+rotation[1,2]*ballastY+rotation[1,3]*ballastZ);
  goalE=if raceGoal[1]>.5 then raceGoal[2] elseif leg==1 then -32 else if leg==2 then -15 else -8;
  goalN=if raceGoal[1]>.5 then raceGoal[3] elseif leg==1 then -18 else if leg==2 then 9 else -7;
  dx=goalE-navE; dy=goalN-navN;
  // Simulated instruments. Only this measurement layer reads true vehicle motion.
  // Bidirectional water-speed log at the centre of the boat, with sensor lag.
  der(signedLogSpeed)=(surge+.012*sin(7*time)-signedLogSpeed)/.42;
  gyro=yawRate+0.002+0.0025*sin(23.1*time);
  magnetic=heading+.015*sin(5.7*time);
  accelX=(fx+sum(foilAxial)+skinDrag)/mass+.025*sin(18*time);
  accelY=(fy+sum(foilSide)-80*sway*abs(sway)-40*sway)/mass+.028*cos(17*time);
  der(vane)=vaneRate;
  der(vaneRate)=64*sin(beta-vane)-12*vaneRate;
  der(cupSpeed)=(sqrt(awx^2+awy^2)-cupSpeed)/0.32;
  measuredWindE=speedE-cupSpeed*cos(courseEstimate+vane);
  measuredWindN=speedN-cupSpeed*sin(courseEstimate+vane);
  when sample(0,fixInterval) then
    fixE=east+.32*sin(time*4.9)+.18*sin(time*8.21);
    fixN=north+.34*cos(time*4.3)+.15*sin(time*9.41);
    headingPred=pre(courseEstimate)+fixInterval*gyro;
    kh=(pre(headingVar)+.00016)/(pre(headingVar)+.00016+.0008);
    courseEstimate=headingPred+kh*atan2(sin(magnetic-headingPred),cos(magnetic-headingPred));
    headingVar=(1-kh)*(pre(headingVar)+.00016);
    a11=pre(p11)+2*fixInterval*pre(p12)+fixInterval^2*pre(p22)+0.0001;
    a12=pre(p12)+fixInterval*pre(p22);
    a22=pre(p22)+0.012;
    kp=a11/(a11+gpsVariance); kv=a12/(a11+gpsVariance);
    predE=pre(navE)+fixInterval*pre(speedE)+0.5*fixInterval^2*(accelX*cos(courseEstimate)-accelY*sin(courseEstimate));
    predN=pre(navN)+fixInterval*pre(speedN)+0.5*fixInterval^2*(accelX*sin(courseEstimate)+accelY*cos(courseEstimate));
    navE=predE+kp*(fixE-predE); navN=predN+kp*(fixN-predN);
    speedE=pre(speedE)+fixInterval*(accelX*cos(courseEstimate)-accelY*sin(courseEstimate))+kv*(fixE-predE);
    speedN=pre(speedN)+fixInterval*(accelX*sin(courseEstimate)+accelY*cos(courseEstimate))+kv*(fixN-predN);
    p11=(1-kp)*a11; p12=(1-kp)*a12; p22=a22-kv*a12;
  end when;
  desired=atan2(dy,dx);
  upwind=atan2(-measuredWindN,-measuredWindE);
  relative=atan2(sin(desired-upwind),cos(desired-upwind));
  crossTrack=-sin(upwind)*(navE-goalE)+cos(upwind)*(navN-goalN);
  when dx*dx+dy*dy<6.25 then
    leg=if pre(leg)==3 then 1 else pre(leg)+1;
  end when;
  // A catamaran needs room to reaccelerate before another tack. Narrow the
  // corridor approaching a mark so the final layline still reaches the gate.
  tackBand=if catamaran then min(30,max(10,.35*sqrt(dx^2+dy^2))) else 4;
  when crossTrack>tackBand then
    tack=-1;
  elsewhen crossTrack < -tackBand then
    tack=1;
  end when;
  when sample(0,.2) then
    fleetCourse=if catamaran and manualHelm<.5 and raceGoal[1]>.5 and tacticalCourse[1]<.5 then
      SailingTactics.chooseCourse({navE,navN},courseEstimate,signedLogSpeed,{goalE,goalN},upwind,
        sqrt(measuredWindE^2+measuredWindN^2),noGo,pre(fleetCourse),cat(1,traffic,sceneTraffic))
      else pre(fleetCourse);
  end when;
  raceCourse=if reachTrial>.5 then -2.1 elseif tacticalCourse[1]>.5 then tacticalCourse[2]
    elseif catamaran and raceGoal[1]>.5 and manualHelm<.5 then fleetCourse
    elseif abs(relative)<noGo then upwind+tack*noGo else desired;
  raceError=atan2(sin(raceCourse-courseEstimate),cos(raceCourse-courseEstimate));
  windOffBow=atan2(sin(courseEstimate-upwind),cos(courseEstimate-upwind));
  when sample(0,.1) then
    stallDuration=if pre(tackRecovery)==0 and catamaran and manualHelm<.5 and reachTrial<.5 and cupSpeed>2 and abs(windOffBow)<.59
      and signedLogSpeed<.50 and abs(raceError)>.24 and abs(gyro)<.25 then pre(stallDuration)+.1 else 0;
    tackRecovery=if manualHelm>.5 or not catamaran then 0
      elseif pre(tackRecovery)==0 then (if stallDuration>=1.1 then 1 else 0)
      elseif pre(tackRecovery)==1 then (if signedLogSpeed<-.22 then 2
        elseif time-pre(phaseSince)>14 or (abs(windOffBow)>.77 and signedLogSpeed>.25) then 3 else 1)
      elseif pre(tackRecovery)==2 then (if pre(recoveryTurn)*windOffBow>.90 or signedLogSpeed>.09 or time-pre(phaseSince)>18 then 3 else 2)
      else (if signedLogSpeed>1.10 or time-pre(phaseSince)>12 then 0 else 3);
    phaseSince=if tackRecovery<>pre(tackRecovery) then time else pre(phaseSince);
    recoveryTurn=if tackRecovery==1 and pre(tackRecovery)==0 then (if raceError>=0 then 1 else -1) else pre(recoveryTurn);
    reverseHelm=if manualHelm>.5 or tackRecovery==0 or signedLogSpeed>.09 then false
      elseif tackRecovery==2 or (tackRecovery==3 and signedLogSpeed<-.22) then true else pre(reverseHelm);
  end when;
  when sample(0,.1) then
    // Hold the old working sheet through the head-to-wind crossing. The
    // helm stays under manual control and the other sheet stays free.
    jibAssistSide=if not catamaran or manualHelm<=.5 or manualJibAssist<=.5 then 0
      elseif pre(jibAssistSide)<>0 then
        (if time>=pre(jibAssistUntil) or pre(jibAssistSide)*vane>.42 or
          pre(jibAssistSide)*vane<-.8 then 0 else pre(jibAssistSide))
      elseif time>=pre(jibAssistUntil) and abs(vane)<.52 and
        abs(vane)>.085 and vane*gyro>.028 and cupSpeed>2 and abs(rudderInput)>.18 and signedLogSpeed>.30 then
        (if windSide>0 then 1 else -1)
      else 0;
    jibAssistUntil=if pre(jibAssistSide)==0 and jibAssistSide<>0 then time+4.5
      elseif pre(jibAssistSide)<>0 and jibAssistSide==0 then time+.9 else pre(jibAssistUntil);
  end when;
  course=if tackRecovery==3 then upwind+recoveryTurn*(noGo+.22) else raceCourse;
  error=atan2(sin(course-courseEstimate),cos(course-courseEstimate));
  ve=cos(heading)*surge-sin(heading)*sway+currentEast;
  vn=sin(heading)*surge+cos(heading)*sway+currentNorth;
  landingDeck={east,north,heave,heading,heel,-pitch,ve,vn,vertical,cos(heading)*spin[1]-sin(heading)*spin[2],sin(heading)*spin[1]+cos(heading)*spin[2],spin[3]};
  der(east)=ve; der(north)=vn;
  sailWind=rigWind[1,:];
  awx=(sailWind[1]-ve)*cos(heading)+(sailWind[2]-vn)*sin(heading);
  awy=-(sailWind[1]-ve)*sin(heading)+(sailWind[2]-vn)*cos(heading);
  beta=atan2(-awy,-awx);
  apparentWindAngle=abs(atan2(sin(vane),cos(vane)));
  sheetTarget=(if sin(vane)>=0 then 1 else -1)*min(1.40,max(0,apparentWindAngle-.32));
  boomLimit=2*asin(min(0.99,max(0,payout/(2*sheetArm))));
  lineSpeed=if rightingSide<>0 then max(0,min(.65,(.59-payout)/.22))
    elseif manualHelm>.5 then .24*trimInput else max(-.40,min(.40,(autoPayout+(if tacticalCourse[1]>.5 then .51*(1-tacticalCourse[3]) else 0)-payout)/.22));
  der(payout)=if (payout<=.012 and lineSpeed<0) or (payout>=.59 and lineSpeed>0) then 0 else lineSpeed;
  drumAngle=payout/drumRadius;
  windSide=if sin(vane)>=0 then -1 else 1;
  // Hobie University and Gavin Colby's upwind traveler guidance. Use true
  // point of sail to open the travelers downwind and apparent wind for tack.
  trueWindAngle=abs(atan2(sailWind[1]*sin(heading)-sailWind[2]*cos(heading),
    -sailWind[1]*cos(heading)-sailWind[2]*sin(heading)));
  windForCrew=sqrt(sailWind*sailWind)-max(0,.04*(ballastMass-60));
  buildingWind=min(1,max(0,(windForCrew-3.5)/6.5));
  depower=min(1,max(0,max((windForCrew-10.5)/5,(abs(sin(heel))-.24)/.24)));
  reachFraction=min(1,max(0,(trueWindAngle-1.22)/.96));
  reachTrim=reachFraction^2*(3-2*reachFraction);
  // A moving catamaran pulls the apparent wind forward on a reach.
  // Keep the sheets engaged there, then ease for a deep downwind course.
  poweredReach=if catamaran and sqrt(sailWind*sailWind)>6 then
    sin(Modelica.Constants.pi*min(1,max(0,(trueWindAngle-1.22)/1.48)))^2 else 0;
  mainCarTarget=if deckManual>.5 then mainCarInput else
    windSide*((1-reachTrim)*.23*depower+(.9-.42*poweredReach)*reachTrim);
  jibCarTarget=if deckManual>.5 then jibCarInput else
    (1-reachTrim)*(.18+.16*buildingWind+.19*depower)+.88*reachTrim;
  upwindGustEase=.095*min(1,max(0,(abs(sin(heel))-.31)/.42))^2;
  autoPayout=if tackRecovery==1 or tackRecovery==2 then .29 elseif catamaran and deckManual<=.5 then
    (1-reachTrim)*(.030+.047*(1-buildingWind)+upwindGustEase)
      +reachTrim*((1-poweredReach)*2*sheetArm*sin(abs(sheetTarget)/2)+.14*poweredReach)
    else 2*sheetArm*sin(abs(sheetTarget)/2);
  mainCarError=min(.9,max(-.9,mainCarTarget))-mainCar;
  // The loaded traveler runs out when the line is released. Hauling
  // against the sail load and automatic trimming retain their old pace.
  mainCarEasing=if noEvent(deckManual>.5 and mainCarError*windSide>0) then 1 else 0;
  mainCarRate=.40+1.25*mainCarEasing;
  mainCarResponse=.38-.28*mainCarEasing;
  der(mainCar)=if catamaran then max(-mainCarRate,min(mainCarRate,mainCarError/mainCarResponse)) else 0;
  der(jibCar)=if catamaran then max(-.40,min(.40,(min(.88,max(.18,jibCarTarget))-jibCar)/.38)) else 0;
  // Headsail trim follows the apparent wind. Easing the main alone keeps the
  // working jib sheet engaged, with some extra release for a deliberate dump.
  jibReach=min(1,max(0,(apparentWindAngle-.75)/1.75));
  jibDepower=max(0,min(1,(payout-.16)/.43));
  jibTrimTarget=if rightingSide<>0 then 1
    elseif jibAssistSide<>0 or ((tackRecovery==1 or tackRecovery==2) and deckManual<.5) then .07
    elseif deckManual>.5 then jibTrimInput
    else min(1,.050+.47*jibReach+.14*jibDepower^2);
  der(jibSheet)=if catamaran then max(-.7,min(.7,(jibTrimTarget-jibSheet)/.5)) else 0;
  sheet=trim[1];
  fairlead[1,:]=if catamaran then {travelerPinX-footX[1],mainCar,travelerDeckZ+travelerRiser-footZ[1]}
    else {-attachRadius[1],0,-.105};
  fairlead[2,:]={if catamaran then .55-footX[2] else -feet[2],if catamaran then jibCar else 0,
    if catamaran then .43-footZ[2] else -.105};
  fairlead[3,:]={fairlead[2,1],-fairlead[2,2],fairlead[2,3]};
  leadVel[1,:]={0,der(mainCar),0};
  leadVel[2,:]={0,der(jibCar),0};
  leadVel[3,:]=-leadVel[2,:];
  lineTarget[1]=if rightingSide<>0 then max(linePaid[1],lineSpan[1]+.15)
    elseif catamaran then blockStack-.010+attachRadius[1]*max(0,payout-.012)/sheetArm else sqrt(fairlead[1,3]^2+(attachRadius[1]*payout/sheetArm)^2);
  // Hold the jib's working sheet through the eye to push the bow onto the new tack.
  jibWorkingSide=if jibAssistSide<>0 then jibAssistSide
    elseif (tackRecovery==1 or tackRecovery==2) and deckManual<.5 then -recoveryTurn else windSide;
  for j in 2:3 loop
    lineTarget[j]=if rightingSide<>0 then max(linePaid[j],lineSpan[j]+.15)
      elseif catamaran then (if (j==2 and jibWorkingSide<0) or (j==3 and jibWorkingSide>0) then lineSpan[j]+.035
      else .47+2.1*jibSheet) else sqrt(fairlead[2,3]^2+(.88*feet[2]*payout/sheetArm)^2);
  end for;
  mainSheetStiffness=purchase^2*mainsheetEA/(sheetTail+purchase*linePaid[1]);
  // Limit negative drum work under load. A backdriven brake pays out
  // excess extension while the elastic line continues to report its load.
  haulFraction=max(0,1-mainSheetStiffness*max(0,lineSpan[1]-linePaid[1])/(purchase*sheetHaulForce));
  brakeSlip=max(0,lineSpan[1]-linePaid[1]-purchase*sheetHoldingForce/mainSheetStiffness)/.035;
  for j in 1:3 loop
    der(linePaid[j])=if catamaran and j==1 then max(brakeSlip,min(1.8,max(0,(lineTarget[j]-linePaid[j])/.22)))+
      haulFraction*max(-1.8,min(0,(lineTarget[j]-linePaid[j])/.22)) else max(-1.8,min(1.8,(lineTarget[j]-linePaid[j])/.22));
    lineSpan[j]=sqrt((fairlead[j,:]-attachment[sailOf[j],:])*(fairlead[j,:]-attachment[sailOf[j],:]));
    // The sheets lead through deck blocks to the winch. A slack bight
    // rests on deck once its free span reaches the trampoline or sloop deck.
    exposedSheetSag[j]=min(max(0,footZ[sailOf[j]]+min(fairlead[j,3],attachment[sailOf[j],3])
      -(if catamaran then .414 else .083)),.5*sqrt(max(0,linePaid[j]^2-lineSpan[j]^2)));
    lineDirection[j,:]=(fairlead[j,:]-attachment[sailOf[j],:])/max(.001,lineSpan[j]);
    lineRate[j]=lineDirection[j,:]*(leadVel[j,:]-tipVel[sailOf[j],:]);
    lineTension[j]=if (j==3 and not catamaran) or lineSpan[j]<=linePaid[j] then 0 else
      max(0,(if catamaran and j==1 then mainSheetStiffness elseif catamaran then 1750 else 720)*(lineSpan[j]-linePaid[j])+
        (if catamaran and j==1 then 240 elseif catamaran then 40 else 12)*(lineRate[j]-der(linePaid[j])));
    sheetForce[j,:]=(lineTension[j]-(if j==1 then blockContact else 0))*lineDirection[j,:];
    ropeTorque[j,:]=cross(attachment[sailOf[j],:],sheetForce[j,:]);
    sheetYaw[j]=ropeTorque[j,:]*{axisX[sailOf[j]],0,axisZ[sailOf[j]]};
  end for;
  mainBlockClearance=max(0,lineSpan[1]-blockStack);
  blockContact=if catamaran and lineSpan[1]<blockStack then max(0,240000*(blockStack-lineSpan[1])-240*lineRate[1]) else 0;
  // The gooseneck slides along the rear mast track, with a separate yaw
  // hinge for the boom. Compression at that offset can over-rotate the spar.
  mastTrackOffset=if catamaran then -gooseneckEccentricity*{
    axisX[1]^2+(1-axisX[1]^2)*cos(mastRotation),axisZ[1]*sin(mastRotation),
    axisX[1]*axisZ[1]*(1-cos(mastRotation))} else zeros(3);
  gooseneckOffset={mainMastSlope*tackDrop,0,-tackDrop}+mastTrackOffset;
  boomCompression=max(0,sheetForce[1,:]*sheetRotation[1,:,1]);
  mastTwist=trim[1]-mastRotation;
  der(mastRotation)=if catamaran then mastRotationRate else 0;
  der(mastRotationRate)=if catamaran then
    ((4+.002*downhaulTension-gooseneckEccentricity*boomCompression)*sin(mastTwist)
      -.028*awy*sqrt(awx^2+awy^2)-3.4*mastRotationRate
      -220*(max(0,mastRotation-mastRotationStop)+min(0,mastRotation+mastRotationStop)))/.19
    else 0;
  mainGooseneck={footX[1],0,footZ[1]}+gooseneckOffset;
  mainBlockPins[1,:]={footX[1],0,footZ[1]}+fairlead[1,:];
  mainBlockPins[2,:]={footX[1],0,footZ[1]}+attachment[1,:];
  boomDeckClearance=mainGooseneck[3]-travelerDeckZ+sheetRotation[1,3,:]*
    {-(feet[1]+boomTailOverhang)*cos(boomElevation)-boomSectionBottom*sin(boomElevation),0,
      (feet[1]+boomTailOverhang)*sin(boomElevation)-boomSectionBottom*cos(boomElevation)};
  // The endpoint displacement used by the leech is the same one used to
  // anchor the cloth. The raked axis carries the axial part of the load.
  leechDelta=mastStations[7,:]+mastTrackOffset-mainGooseneck-sheetRotation[1,:,:]*
    {-clewArm*cos(boomElevation),0,clewArm*sin(boomElevation)};
  leechLength=sqrt(leechDelta*leechDelta);
  leechDirection=leechDelta/leechLength;
  leechLoad=if catamaran then leechEA*max(0,leechLength/leechRest-1) else 0;
  leechLift=leechLoad*leechDirection*(sheetRotation[1,:,:]*
    {clewArm*sin(boomElevation),0,clewArm*cos(boomElevation)});
  der(mastTip)=mastTipRate;
  mastAxialLoad=downhaulTension+leechLoad*(leechDirection*{axisX[1],0,axisZ[1]});
  // First-order beam-column compliance under leech and luff compression.
  // This approximation keeps the one-mode elastic model below buckling.
  mastLoadedStiffness=mastStiffness/(1+max(0,mastAxialLoad)*mastGeometricFactor/mastStiffness);
  // The loaded sail track is aft of the spar. Its eccentric compression
  // bows the spar between the fixed gooseneck region and the stay tang.
  lowerMastBow=if catamaran then max(0,mastAxialLoad)*luffTrackOffset*lowerMastSpan^2/(8*mastEI)*
    (1+min(1.15,max(0,mastAxialLoad)/lowerMastBucklingLoad)) else 0;
  mastBend=max({abs(mastStations[row,1]-mastStations[2,1]-
    (mastStations[7,1]-mastStations[2,1])*(mastStations[row,3]-mastStations[2,3])/
    (mastStations[7,3]-mastStations[2,3])) for row in 3:6});
  (mastModalMass+.25*rigWaterMass[1])*der(mastTipRate)=(if catamaran then
      (sheetRotation[1,1,:]+mainMastSlope*sheetRotation[1,3,:])*cloth[1].mastLoad
      -leechLoad*(leechDirection[1]+mainMastSlope*leechDirection[3])
      -downhaulTension*luffTrackOffset*mastHeadSlope else 0)
    -mastLoadedStiffness*mastTip-2*mastDampingRatio*sqrt(mastModalMass*mastLoadedStiffness)*mastTipRate;
  mainMomentBody=sheetRotation[1,:,:]*cloth[1].fluidMoment;
  jibWireLoad=.5*sheetRotation[2,:,:]*cloth[2].fluidForce;
  for wire in 1:2 loop
    contactBody[wire,:]=sheetRotation[1,:,:]*{0,cloth[1].wireReaction[wire],0};
  end for;
  der(halyardSetting)=if catamaran then (max(0,min(1,jibHalyardInput))-halyardSetting)/.32 else 0;
  stayPath=standingPaths[1:3,:,:];
  stayTension=standingTension[1:3];
  stayStiffness=standingStiffness[1:3];
  forestayPath=standingPaths[4,:,:];
  forestayTension=standingTension[4];
  jibHalyardTension=standingTension[3];
  mastRake=atan2(mastStep[1]-standingPaths[3,3,1],standingPaths[3,3,3]-mastStep[3]);
  // The rig's weight acts aft of the ball joint. Its moment tends to
  // rake the mast back when the jib luff wire is let out.
  rigGravityMoment=if catamaran then cross(.54*(tang+{tangLean[1],tangLean[2],0}-mastStep)
    +sheetRotation[1,:,:]*{-.19,0,0},standingRigMass*(transpose(rotation)*{0,0,-9.80665})) else zeros(3);
  when sample(0,.01) then
    (tangLean,tangRate,standingPaths,standingTension,standingStiffness,midSag,midSagRate)=standingRig(stayAnchors,tang,
      pre(tangLean),pre(tangRate),if catamaran then pre(mainMomentBody) else zeros(3),
      if catamaran then pre(jibWireLoad) else zeros(3),pre(contactBody),transpose(rotation)*{0,0,-9.80665},.01,stayEA,shroudPreload,.5*sum(pre(rigWaterMass)),pre(midSag),pre(midSagRate),
      transpose(rotation)*{awx,awy,-vertical},halyardSetting,pre(rigGravityMoment),forestayCordAnchor,catamaran);
  end when;
  mastStations[1,:]=mastStep;
  jibStation=cloth[2].rowLuff*spans[2]/(tang[3]-stayAnchors[3,3]);
  for row in 1:5 loop
    mastStations[row+1,:]={footX[1]-spans[1]*mainMastSlope*(row-1)/5,0,footZ[1]+spans[1]*(row-1)/5}
      +mastDeflection((row-1)/5,stayFraction,mastTip,mainMastSlope,tangLean,lowerMastBow);
  end for;
  // Lower-mast curvature vanishes at the head. The leech load uses this
  // endpoint to calculate the bow, so evaluate the endpoint independently.
  mastStations[7,:]={footX[1]-spans[1]*mainMastSlope,0,footZ[1]+spans[1]}
    +mastDeflection(1,stayFraction,mastTip,mainMastSlope,tangLean,0);
  for row in 1:6 loop
    cloth[2].luffShift[row,:]=if catamaran then transpose(sheetRotation[2,:,:])*(
      (if jibStation[row]<=.5 then (1-2*jibStation[row])*stayPath[3,1,:]+2*jibStation[row]*stayPath[3,2,:]
       else (2-2*jibStation[row])*stayPath[3,2,:]+(2*jibStation[row]-1)*stayPath[3,3,:])
        -((1-jibStation[row])*stayAnchors[3,:]+jibStation[row]*tang)) else zeros(3);
  end for;
  for row in 1:cloth[1].rows loop
    cloth[1].luffShift[row,:]=if catamaran then transpose(sheetRotation[1,:,:])*(
      mastDeflection(cloth[1].rowLuff[row],stayFraction,mastTip,mainMastSlope,tangLean,lowerMastBow)
      +gooseneckOffset*(1-cloth[1].rowLuff[row])+mastTrackOffset*cloth[1].rowLuff[row]) else zeros(3);
  end for;
  mastStations[8,:]=mastStations[7,:]+(podZ-footZ[1]-spans[1])*
    ({-mainMastSlope,0,1}+{tangLean[1],tangLean[2],0}/(tang[3]-footZ[1])+mastTip*mastHeadSlope*{1,0,mainMastSlope});
  cloth[1].mastOffset=zeros(3);
  cloth[2].mastOffset=zeros(3);
  mainTension=lineTension[1];jibTension=sum(lineTension[2:3]);
  sheetLift=cross(attachment[1,:]-gooseneckOffset,sheetForce[1,:])*sheetRotation[1,:,2];
  vangLength=sqrt(vangAttachment^2+vangDrop^2+2*vangAttachment*vangDrop*sin(boomElevation));
  vangArm=vangAttachment*vangDrop*cos(boomElevation)/vangLength;
  vangTension=if catamaran then 0 else max(0,3200*(vangLength-(.49-.065*max(0,min(1,vangInput)))));
  // The tackle and reinforced luff are elastic elements in series. The head
  // is fixed while the tack slide travels down the mast under the downhaul.
  der(downhaulShortening)=if catamaran then (downhaulTravel*max(0,min(1,downhaulInput))-downhaulShortening)/.25 else 0;
  tackDrop=downhaulShortening/(1+luffRigidity/(spans[1]*downhaulStiffness));
  downhaulTension=luffRigidity*tackDrop/spans[1];
  der(mainClewOffset)=if catamaran then (outhaulTravel*(max(0,min(1,outhaulInput))-.65)-mainClewOffset)/.22 else 0;
  clewArm=feet[1]+mainClewOffset;
  clewTorque=clewArm*(sin(boomElevation)*cloth[1].clewForce[1]+cos(boomElevation)*cloth[1].clewForce[3]);
  der(boomElevation)=boomLiftRate;
  der(boomLiftRate)=(clewTorque+leechLift-vangTension*vangArm+sheetLift-(if catamaran then 26 else .95)*cos(boomElevation)-(if catamaran then 90 else 3)*boomLiftRate
    +900*max(0,(if catamaran then -.25 else -.035)-boomElevation)-900*max(0,boomElevation-.65))/((if catamaran then 11 else .28)+hingeWaterInertia[1]);
  cloth[1].leechTension=leechLoad;
  cloth[2].leechTension=0;
  cloth[1].boomElevation=boomElevation;
  cloth[2].boomElevation=0;
  cloth[1].clewOffset=mainClewOffset;
  cloth[2].clewOffset=0;
  // Centre the blades while flow dies. A measured sternway threshold
  // reverses the helm; the separate ahead threshold avoids switching at zero.
  helmTarget=if manualHelm>.5 then .54*rudderInput elseif tackRecovery==1 then 0
    elseif tackRecovery==2 then -.55*recoveryTurn
    else (if reverseHelm then -1 else 1)*max(-.56,min(.56,1.35*error-.45*gyro));
  der(rudder)=(helmTarget-rudder)/.2;

  // Body to level, heading-aligned frame (forward, port, up). Wave slopes
  // and orbital velocity are supplied by the same sea as the hull buoyancy.
  rotation=[cos(pitch), sin(pitch)*sin(heel), sin(pitch)*cos(heel);
            0, cos(heel), -sin(heel);
            -sin(pitch), cos(pitch)*sin(heel), cos(pitch)*cos(heel)];
  spin={rollRate*cos(pitch),pitchRate,yawRate-rollRate*sin(pitch)};
  waterRelative={orbitalEast*cos(heading)+orbitalNorth*sin(heading)-surge,
       -orbitalEast*sin(heading)+orbitalNorth*cos(heading)-sway,orbitalUp-vertical};
  surfaceNormal={-tan(wavePitch),tan(waveRoll),-1};
  for side in 1:2 loop
    tailArm[side,:]=rotation*(.44*stayPath[side,1,:]+.56*stayPath[side,2,:]);
    tailImmersion[side]=noEvent(max(0,min(1,.5+(waveHeight-heave+surfaceNormal*tailArm[side,:]+
      swellAmplitude*sin(swellPhase+swellLocal*tailArm[side,1:2]))/.03)));
    tailFluid[side,:]=transpose(rotation)*((1-tailImmersion[side])*{awx,awy,-vertical}+tailImmersion[side]*waterRelative-cross(spin,tailArm[side,:]));
    shroudTail[side,:]=if catamaran then streamerDirection(tailFluid[side,:],-rotation[3,:],
      1.225+(1025-1.225)*tailImmersion[side]) else zeros(3);
  end for;
  hingeLoad[1]=cross(cloth[1].vertex[4,:],cloth[1].clewForce)*{axisX[1],0,axisZ[1]};
  hingeLoad[2]=cross(cloth[2].vertex[4,:],cloth[2].clewForce)*{axisX[2],0,axisZ[2]};
  sailVertex[1,:,:]=cloth[1].legacyVertex;
  sailVertex[2,:,:]=cloth[2].legacyVertex;
  for m in 1:2 loop
    tipLocal[m,:]=if m==1 then {-bailFromGooseneck*cos(boomElevation)-mainBailDrop*sin(boomElevation),0,
      bailFromGooseneck*sin(boomElevation)-mainBailDrop*cos(boomElevation)}
      else {-attachRadius[m],0,0};
    attachment[m,:]=sheetRotation[m,:,:]*tipLocal[m,:]+(if m==1 then gooseneckOffset else zeros(3));
    tipVel[m,:]=cross(trimRate[m]*{axisX[m],0,axisZ[m]},sheetRotation[m,:,:]*tipLocal[m,:])+
      (if m==1 then sheetRotation[m,:,:]*cross({0,boomLiftRate,0},tipLocal[m,:])+
        der(tackDrop)*{mainMastSlope,0,-1}+mastRotationRate*cross({axisX[1],0,axisZ[1]},mastTrackOffset)
        else zeros(3));
    rigWaterMass[m]=1025*.04*wettedArea[m];
    hingeWaterInertia[m]=rigWaterMass[m]*feet[m]^2/6;
    der(trim[m])=trimRate[m];
    der(trimRate[m])=(hingeLoad[m]+(if m==1 then sheetYaw[1] else sheetYaw[2]+sheetYaw[3])
      -(if catamaran then 22 else 1.1)*trimRate[m]
      -(if catamaran then 1500 else 130)*(max(0,trim[m]-1.68)+min(0,trim[m]+1.68)))/
      ((if catamaran then (if m==1 then 12 else 4) else (if m==1 then .42 else .22))+hingeWaterInertia[m]);
    // Rodrigues rotation about the luff through the tack.
    sheetRotation[m,:,:]=[
      cos(trim[m])+axisX[m]^2*(1-cos(trim[m])), -axisZ[m]*sin(trim[m]), axisX[m]*axisZ[m]*(1-cos(trim[m]));
      axisZ[m]*sin(trim[m]), cos(trim[m]), -axisX[m]*sin(trim[m]);
      axisX[m]*axisZ[m]*(1-cos(trim[m])), axisX[m]*sin(trim[m]), cos(trim[m])+axisZ[m]^2*(1-cos(trim[m]))];
    rig[m,:,:]=rotation*sheetRotation[m,:,:];
    origin[m,:]=rotation*{footX[m],0,footZ[m]};
    for side in 1:2 loop
      cloth[m].shroudFoot[side,:]=transpose(sheetRotation[m,:,:])*{
        (if catamaran then sideStayX else -.05)-footX[m],
        (3-2*side)*(if catamaran then 1.02 else .31),
        (if catamaran then .34 else .09)-footZ[m]};
    end for;
    cloth[m].wireK=if catamaran then stayStiffness[1:2] else {1e8,1e8};
    for side in 1:2 loop
      cloth[m].shroudMid[side,:]=if catamaran then transpose(sheetRotation[m,:,:])*
        (stayPath[side,2,:]-{footX[m],0,footZ[m]}) else (cloth[m].shroudHead+cloth[m].shroudFoot[side,:])/2;
    end for;
    cloth[m].shroudHead=if catamaran then transpose(sheetRotation[m,:,:])*(stayPath[1,3,:]-{footX[m],0,footZ[m]}) else transpose(sheetRotation[m,:,:])*{
      (if catamaran then .44 else .12)-footX[m],0,
      (if catamaran then 5.85 else 2.78)-footZ[m]};
    rigWind[m,:]=shadowWind(east+cos(heading)*(origin[m,1]-.25*feet[m])-sin(heading)*origin[m,2],
      north+sin(heading)*(origin[m,1]-.25*feet[m])+cos(heading)*origin[m,2],
      heave+origin[m,3],rotation[3,3]*spans[m],windEast,windNorth,cat(1,traffic,sceneTraffic));
    cloth[m].air=transpose(rig[m,:,:])*({(rigWind[m,1]-ve)*cos(heading)+(rigWind[m,2]-vn)*sin(heading),
      -(rigWind[m,1]-ve)*sin(heading)+(rigWind[m,2]-vn)*cos(heading),-vertical}-cross(spin,origin[m,:]));
    cloth[m].water=transpose(rig[m,:,:])*(waterRelative-cross(spin,origin[m,:]));
    cloth[m].omega=transpose(rig[m,:,:])*spin+der(trim[m])*{axisX[m],0,axisZ[m]};
    cloth[m].gravity=transpose(rig[m,:,:])*{0,0,-9.80665};
    cloth[m].waterPlane=cat(1,transpose(rig[m,:,:])*surfaceNormal,{waveHeight-heave+surfaceNormal*origin[m,:]+swellAmplitude*sin(swellPhase+swellLocal*origin[m,1:2])});
    wettedArea[m]=cloth[m].wetArea;
    leechSpeed[m]=cloth[m].leechSpeed;
    sailTail[m,:,:]=cloth[m].faceTail;
    sailLuff[m]=cloth[m].luffLevel;
    rigForce[m,:]=rig[m,:,:]*cloth[m].fluidForce;
    rigMoment[m,:]=rig[m,:,:]*cloth[m].fluidMoment+cross(origin[m,:],rigForce[m,:]);
    sailForward[m]=rigForce[m,1];sailPort[m]=rigForce[m,2];
  end for;
  rigWaterInertia=sum(rigWaterMass[m]*(footZ[m]^2+2*footZ[m]*spans[m]/3+spans[m]^2/6) for m in 1:2);
  sailMoment=rigMoment[1,:]+rigMoment[2,:];
  fx=sum(sailForward)+sum(impact[:,1]);
  fy=sum(sailPort)+sum(impact[:,2]);
  for k in 1:4 loop
    for tip in 1:2 loop
      foilEnd[k,tip,:]=rotation*{foilX[k],foilY[k],if tip==1 then foilTop[k] else foilBottom[k]};
      foilDepth[k,tip]=waveHeight-heave+surfaceNormal*foilEnd[k,tip,:]+swellAmplitude*sin(swellPhase+swellLocal*foilEnd[k,tip,1:2]);
    end for;
    wetFoil[k]=if min(foilDepth[k,:])>=0 then 1 elseif max(foilDepth[k,:])<=0 then 0 else max(foilDepth[k,:])/max(1e-9,abs(foilDepth[k,1]-foilDepth[k,2]));
    foilArm[k,:]=if foilDepth[k,1]>foilDepth[k,2] then foilEnd[k,1,:]+.5*wetFoil[k]*(foilEnd[k,2,:]-foilEnd[k,1,:]) else foilEnd[k,2,:]+.5*wetFoil[k]*(foilEnd[k,1,:]-foilEnd[k,2,:]);
    foilPhase[k]=swellPhase+swellLocal*foilArm[k,1:2];
    foilOrbital[k,:]=swellAmplitude*swellOmega*exp(-swellK*max(0,.5*sum(foilDepth[k,:])))*{swellLocal[1]/swellK*sin(foilPhase[k]),swellLocal[2]/swellK*sin(foilPhase[k]),-cos(foilPhase[k])};
    foilVelocity[k,:]=-waterRelative+cross(spin,foilArm[k,:])-foilOrbital[k,:];
    foilBody[k,:]=transpose(rotation)*foilVelocity[k,:];
    forward[k]=foilBody[k,1];inflow[k]=foilBody[k,2];
    angle[k]=if forward[k]^2+inflow[k]^2>1e-12 then atan2(inflow[k],forward[k]) else 0;
    foilAlpha[k]=angle[k]+(if k==2 or k==4 then rudder else 0);
    foilCL[k]=(2*3.14159/(1+2/(.8*aspect[k])))*.5*sin(2*foilAlpha[k]);
    foilLift[k]=.5*1025*foilArea[k]*wetFoil[k]*(forward[k]^2+inflow[k]^2)*foilCL[k];
    // On the catamaran, 1 and 3 represent the hulls' lateral planes. Their
    // zero-incidence profile resistance is already included in skinDrag.
    foilDrag[k]=.5*1025*foilArea[k]*wetFoil[k]*(forward[k]^2+inflow[k]^2)*
      ((if not catamaran then .018 elseif k==2 or k==4 then .007 else 0)+foilCL[k]^2/(3.14159*.8*aspect[k])+1.3*sin(foilAlpha[k])^4);
    bodyLoad[k,:]={foilLift[k]*sin(angle[k])-foilDrag[k]*cos(angle[k]),-foilLift[k]*cos(angle[k])-foilDrag[k]*sin(angle[k]),0};
    foilLoad[k,:]=rotation*bodyLoad[k,:];
    foilSide[k]=foilLoad[k,2];foilAxial[k]=foilLoad[k,1];
    foilTorque[k,:]=cross(foilArm[k,:],foilLoad[k,:]);
  end for;
  skinArea=wettedSkin[1]+(if catamaran then wettedSkin[2] else 0);
  hullRe=abs(waterRelative[1])*(stationX[7]-stationX[1])/waterViscosity;
  frictionCoefficient=if hullRe<5e5 then 1.328/sqrt(max(1,hullRe)) else .075/(log10(hullRe)-2)^2;
  skinDrag=.5*1025*skinArea*(1+formFactor)*frictionCoefficient*waterRelative[1]*abs(waterRelative[1]);
  rigCollision=if catamaran then rigCapsules(mastStations,cat(1,stayPath[1:2,:,:],{forestayPath}),rudder) else zeros(19,7);
  shoreWrench=Shore.contact({east,north,heave},heading,rotation,{surge,sway,vertical},spin,stationX,beamHalf,halfSpacing)+rigShoreWrench;
  when sample(0,.02) then
    rigShoreWrench=if catamaran then rigTerrainContact({east,north,heave},heading,rotation,
      {surge,sway,vertical},spin,rigCollision) else zeros(6);
    (sceneForce,sceneContact)=contactWrench({east,north,heading,ve,vn,yawRate,heave},sceneTraffic,if catamaran then 1 else 0,{heel,pitch},sceneTilt);
    (peerForce,peerContact)=contactWrench({east,north,heading,ve,vn,yawRate,heave},traffic,if catamaran then 1 else 0,{heel,pitch},trafficTilt);
  end when;
  swellForce=hullSwellForce[1,:]+(if catamaran then hullSwellForce[2,:] else zeros(2));
  der(surge)=((wakeEast+droneLoad[1]+peerForce[1]+sceneForce[1])*cos(heading)+(wakeNorth+droneLoad[2]+peerForce[2]+sceneForce[2])*sin(heading)+fx+shoreWrench[1]+sum(foilAxial)+skinDrag+swellForce[1])/totalMass+yawRate*sway;
  der(sway)=(-(wakeEast+droneLoad[1]+peerForce[1]+sceneForce[1])*sin(heading)+(wakeNorth+droneLoad[2]+peerForce[2]+sceneForce[2])*cos(heading)+fy+shoreWrench[2]+sum(foilSide)+swellForce[2]-80*sway*abs(sway)-40*sway)/totalMass-yawRate*surge;
  levelYawMoment=droneLoad[6]+shoreWrench[6]+wakeYaw+peerForce[3]+sceneForce[3]+sailMoment[3]+sum(foilTorque[:,3]);
  der(yawRate)=(levelYawMoment-(if catamaran then 190 else 30)*yawRate)/(yawInertia+ballastYawInertia+rigWaterInertia*(sin(pitch)^2+cos(pitch)^2*sin(heel)^2)+sum(hingeWaterInertia));
  der(heading)=yawRate;
  der(heel)=rollRate;
  // The roll axis pitches with the hull. Its moment is conjugate to the
  // roll-rate term in spin, including when the bows pass vertical.
  der(rollRate)=(cos(pitch)*(droneLoad[4]*cos(heading)+droneLoad[5]*sin(heading)+shoreWrench[4]+sum(foilTorque[:,1])+podRoll+sailMoment[1]+(if catamaran then sum(hullRoll)+massRoll else -400*sin(heel-waveRoll)))-sin(pitch)*levelYawMoment-(if catamaran then 280 else 65)*rollRate)/(rollInertia+ballastRollInertia+rigWaterInertia+podMass*podZ^2);
  der(pitch)=pitchRate;
  weightArm=rotation[1,1]*centerMassX;
  der(pitchRate)=(-droneLoad[4]*sin(heading)+droneLoad[5]*cos(heading)+shoreWrench[5]+sum(foilTorque[:,2])+podPitch+sailMoment[2]+sum(impactTorque)+pitchBuoyancy+mass*9.80665*weightArm+massPitch-(if catamaran then 420 else 72)*pitchRate)/(pitchInertia+ballastPitchInertia+rigWaterInertia+podMass*(podZ^2+footX[1]^2));
  der(heave)=vertical;
  for hull in 1:2 loop
    for panel in 1:hydroPanelCount loop
      hydroSectionWater[hull,panel]=if useRefinedSectionWater then
        previousRefinedSectionWater[hull,panel]*(1-waterFraction)+refinedSectionWater[hull,panel]*waterFraction
      elseif catamaran then
        (if useSectionWater>.5 then samplePanelWater(
          previousWater[hull,:]*(1-waterFraction)+sectionWater[hull,:]*waterFraction,stationX,hydroStationGeometry[panel,1])
        else waveHeight)
      else previousWater[hull,min(6,panel)]*(1-waterFraction)+sectionWater[hull,min(6,panel)]*waterFraction;
    end for;
    for band in 1:6 loop
      sectionVolume[hull,band]=if hull==1 or catamaran then
        hydroSectionVolume[hull,(band-1)*hydroSubdivisions+1]
          +(if catamaran then hydroSectionVolume[hull,band*hydroSubdivisions] else 0) else 0;
    end for;
    (hullLift[hull],hullPitch[hull],hullRoll[hull],impact[hull,:],impactTorque[hull],foredeckDepth[hull],
     hydroSectionVolume[hull,:],wettedSkin[hull],hullSwellForce[hull,:])=hullHydrostatics(
      hydroStationBounds,hydroStationGeometry,beamFraction,rotation,surfaceNormal,
      (if useSectionWater>.5 then 0 else waveHeight)-heave,(if hull==1 then 1 else -1)*halfSpacing,
      if catamaran then 2.65 else 1,hydroSectionWater[hull,:],useSectionWater,
      swellAmplitude,swellLocal,swellPhase,swellK,swellOmega,{surge,sway,vertical},spin);
  end for;
  buoyancy=hullLift[1]+(if catamaran then hullLift[2] else 0);
  pitchBuoyancy=hullPitch[1]+(if catamaran then hullPitch[2] else 0);
  waterDamping=if catamaran then 2*heaveDampingRatio*sqrt(1025*9.80665*waterplaneArea/totalMass)*min(1,buoyancy/(mass*9.80665)) else 5.8;
  waterVertical=orbitalUp-swellAmplitude*swellOmega*cos(swellPhase)
     +(if useSectionWater>.5 then sum(sectionWater-previousWater)/1.2 else 0);
  der(vertical)=(droneLoad[3]+shoreWrench[3]+podBuoyancy+buoyancy+sum(foilLoad[:,3])+sum(impact[:,3])+sum(rigForce[:,3]))/totalMass-9.80665-waterDamping*(vertical-waterVertical);
  annotation(experiment(StopTime=300,Interval=0.05));
end Sailboat;
