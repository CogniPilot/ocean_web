model Humpback "Ten-metre humpback with a hinged caudal peduncle and oscillating hydrofoils"
  parameter Boolean enableContacts=true "Resolve geometric contacts with the environment" annotation(Evaluate=true);
  // ENU metres, radians, seconds. Positive pitch raises the rostrum.
  parameter Real startState[18]={2,-18,-3,1.7,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
  input Real boatLoad[3] "Hull reaction in forward and port axes, and yaw moment";
  input Real pilot[4] "Manual flag, desired pitch, stroke effort, breach cycle seconds (-1 idle)";
  input Real bankCommand "Manual bank demand, positive starboard-down radians";
  input Real directDrive,actuators[5] "Independent normalized port fin, starboard fin, peduncle, fluke feather and lateral scull";
  input Real behaviorOffset;
  input Real clock, surface, current[2],encounter[6];
  input Real bottomAhead "Seabed elevation under the projected approach";
  input Real burst "Available fraction of maximum-effort muscle boost";
  input Real strokeGain "Set to zero for an unpowered glide";
  output Real x[18](start=startState, each fixed=true)
    "E,N,Z, horizontal and vertical velocity, body pitch/rate, absolute tail pitch/rate, yaw/rate, bank/rate, stroke phase, lateral velocity, fluke feather, port and starboard fin incidence";
  output Real stations[6,3] "Section centre EN and effective displaced near-surface volume";
  output Real blowholeHeight, tailThrust, musclePower, portLift, starboardLift;
  constant Real g=9.81,rho=1025;
  parameter Real mb(unit="kg")=7550,mt(unit="kg")=950,ib(unit="kg.m2")=56500,it(unit="kg.m2")=920;
  parameter Real flukeArea(unit="m2")=3.85,pectoralArea(unit="m2")=1.48;
  parameter Real maxJointTorque(unit="N.m")=270000,burstPower(unit="W")=420000;
  Real rawTorque,shoreTurn,burstTorque,burstPowerLimit;
  constant Real bx=-2.35, tx=1.30, flukeArm=-1.90;
  constant Real station[6]={-2,-.9,.2,1.3,2.4,3.45};
  constant Real radius[6]={.60,.93,1.06,1.00,.76,.45};
  // Relative slice volumes; their centre of buoyancy is near the torso COM.
  constant Real weight[6]={.154,.28,.296,.168,.077,.025};
  function wet "Submerged volume fraction of a locally ellipsoidal section"
    input Real depth,r;
    output Real fraction;
  protected Real h;
  algorithm
    h:=min(1,max(-1,depth/r));
    fraction:=.5+.75*h-.25*h^3;
  end wet;
  function foil "Lift perpendicular to local flow, profile and induced drag opposite velocity"
    input Real u,w,angle,area,water;
    output Real fx,fz;
  protected Real v,alpha,s,c,cl,cd,k;
  algorithm
    v:=sqrt(u*u+w*w+.000001);
    alpha:=angle-atan2(w,u+.000001);
    s:=sin(alpha);c:=cos(alpha);
    cl:=1.28*tanh(4.1*s*c)*c;
    cd:=.021+.075*cl^2+1.1*s^2;
    k:=.5*rho*area*water*v;
    fx:=k*(-cl*w-cd*u);
    fz:=k*(cl*u-cd*w);
  end foil;
  function bottomContact "Unilateral contact of the articulated hull facets with the seabed, rocks and wrecks"
    input Real state[18];
    input Real vertices[size(Wreck.WhaleSurface.vertices,1),3];
    input Integer faces[size(Wreck.WhaleSurface.faces,1),3];
    output Real loads[11] "Body Fx,Fz,pitch and tail Fx,Fz,pitch, total Fy,yaw,roll, normal force, minimum clearance";
  protected
    Real frames[7,3,4],rotation[3,3],jointRotation[3,3],base[3],center[3],half[3],bound[3];
    Real world[48,3],lo[3],hi[3],hit[7],candidate[7],normal[3],arm[3],relative[3],hinge[3];
    Real offset[3],velocity[3],angularRate[3],slip[3],force[3],moment[3];
    Real cy,sy,cp,sp,cr,sr,ct,st,pitchRate,normalRate,load,support,damping;
    Integer joint,first,last,firstVertex,count,localFaces[92,3],vertexIndex,faceIndex;
    Boolean flat,shore,wreck,tailPiece;
  algorithm
    loads:=zeros(11);loads[11]:=1e6;
    cy:=cos(state[10]);sy:=sin(state[10]);
    cp:=cos(state[6]);sp:=sin(state[6]);ct:=cos(state[8]);st:=sin(state[8]);
    cr:=cos(state[12]);sr:=sin(state[12]);
    rotation:=[cy*cp,-cy*sp*sr-sy*cr,-cy*sp*cr+sy*sr;
               sy*cp,-sy*sp*sr+cy*cr,-sy*sp*cr-cy*sr;sp,cp*sr,cp*cr];
    frames:=Wreck.skinFrames(true,{state[8]-state[6],state[16],state[17],state[18]});
    hinge:={bx*cp,0,bx*sp};
    flat:=Shore.aboveFlatBottom(state[1],state[2],state[3],Wreck.WhaleSurface.reach)
      and not Wreck.WreckSolids.nearSite(state[1:3],Wreck.WhaleSurface.reach);
    world:=zeros(48,3);localFaces:=zeros(92,3);
    for piece in 1:Wreck.SwimmerHulls.count[1] loop
      joint:=1+Wreck.SwimmerHulls.joint[piece];
      jointRotation:=rotation*transpose(frames[joint,:,1:3]);
      base:=state[1:3]-jointRotation*frames[joint,:,4];
      firstVertex:=Wreck.WhaleSurface.firstVertex[piece];
      count:=Wreck.WhaleSurface.firstVertex[piece+1]-firstVertex;
      if flat then
        // A flat plane's closest witness is the lowest mesh vertex.
        vertexIndex:=0;
        while vertexIndex<count loop
          loads[11]:=min(loads[11],base[3]+jointRotation[3,:]*vertices[firstVertex+vertexIndex,:]+13.7);
          vertexIndex:=vertexIndex+1;
        end while;
      else
        half:=.5*(Wreck.SwimmerHulls.bounds[piece,4:6]-Wreck.SwimmerHulls.bounds[piece,1:3]);
        center:=base+jointRotation*(Wreck.SwimmerHulls.bounds[piece,1:3]+half);
        bound:=abs(jointRotation)*half;
        lo:=center-bound;hi:=center+bound;
        shore:=not Shore.clearOfShore(center[1],center[2],lo[3],sqrt(bound[1]^2+bound[2]^2));
        wreck:=Wreck.WreckSolids.nearSite(center,sqrt(bound*bound));
        if shore or wreck then
          lo:=fill(1e6,3);hi:=fill(-1e6,3);
          vertexIndex:=1;
          while vertexIndex<=count loop
            world[vertexIndex,:]:=base+jointRotation*vertices[firstVertex+vertexIndex-1,:];
            for j in 1:3 loop
              lo[j]:=min(lo[j],world[vertexIndex,j]);
              hi[j]:=max(hi[j],world[vertexIndex,j]);
            end for;
            vertexIndex:=vertexIndex+1;
          end while;
          first:=Wreck.WhaleSurface.firstFace[piece];last:=Wreck.WhaleSurface.firstFace[piece+1]-1;
          faceIndex:=1;
          while first+faceIndex-1<=last loop
            localFaces[faceIndex,:]:=faces[first+faceIndex-1,:];
            faceIndex:=faceIndex+1;
          end while;
          hit:=zeros(7);
          if shore then
            hit:=Wreck.SharkContact.seabed(world,lo,hi,count,1,last-first+1,localFaces);
            if hi[1]>=7 and lo[1]<=65 and hi[2]>=17 and lo[2]<=63 then
              candidate:=Wreck.SharkContact.boulders(world,lo,hi,Shore.rocks,Shore.planes,1,last-first+1,localFaces);
              if candidate[1]>hit[1] then hit:=candidate;end if;
            end if;
          end if;
          if wreck then
            candidate:=Wreck.SharkContact.wrecks(world,lo,hi,1,last-first+1,localFaces);
            if candidate[1]>hit[1] then hit:=candidate;end if;
          end if;
          if hit[1]>0 then
            normal:={cy*hit[2]+sy*hit[3],-sy*hit[2]+cy*hit[3],hit[4]};
            offset:=hit[5:7]-state[1:3];
            arm:={cy*offset[1]+sy*offset[2],-sy*offset[1]+cy*offset[2],offset[3]};
            tailPiece:=joint==3 or joint==4;
            relative:=if tailPiece then arm-hinge else arm;
            pitchRate:=if tailPiece then state[9] else state[7];
            angularRate:={state[13]*(if tailPiece then ct else cp),-pitchRate,state[13]*(if tailPiece then st else sp)};
            velocity:={state[4],state[15],state[5]}+cross({0,0,state[11]},arm)+cross(angularRate,relative);
            if tailPiece then velocity:=velocity+{-state[7]*bx*sp,0,state[7]*bx*cp};end if;
            damping:=if tailPiece then 16000 else 55000;
            normalRate:=velocity*normal;slip:=velocity-normalRate*normal;
            support:=damping*min(5,28*hit[1]);
            load:=max(0,support-damping*min(1,hit[1]/.015)*normalRate-max(0,support/.55-damping)*max(0,normalRate));
            force:=load*(normal-.48*slip/sqrt(.2^2+slip*slip));
            moment:=cross(arm,force);
            if tailPiece then
              loads[4]:=loads[4]+force[1];loads[5]:=loads[5]+force[3];
              loads[6]:=loads[6]+(relative[1]+tx*ct)*force[3]-(relative[3]+tx*st)*force[1];
            else
              loads[1]:=loads[1]+force[1];loads[2]:=loads[2]+force[3];loads[3]:=loads[3]-moment[2];
            end if;
            loads[7]:=loads[7]+force[2];loads[8]:=loads[8]+moment[3];
            loads[9]:=loads[9]+cp*moment[1]+sp*moment[3];loads[10]:=loads[10]+load;
            loads[11]:=min(loads[11],-hit[1]);
          else
            loads[11]:=min(loads[11],max(0,lo[3]-Shore.seabed(center[1],center[2])));
          end if;
        else
          loads[11]:=min(loads[11],max(0,lo[3]-Shore.seabed(center[1],center[2])));
        end if;
      end if;
    end for;
    annotation(Inline=false);
  end bottomContact;
  Real c,s,ct,st,u,w,v,b,q,a,r,course,turn,roll,omega,stroke,amplitude,cycle,divePhase;
  Real restPhase,rest;
  Real zTarget,pCmd,speedCmd,finCmd,finDiff,torque,tailWater,flukeWater,finWater;
  Real hx,hz,kx,kz,tu,tw,fu,fw,cu,cw,axial,normal;
  Real bodyWet[6],hydro[6],fbx,fbz,ftx,ftz,tb,tt,df,dn,fx,fz,pfx,pfz,sfx,sfz;
  Real tailFlow,portFlow,finArea,cbTorque,bulkDrag,yawForce,q11,q12,q22,dx,dz,jx,jz,det;
  discrete Real ground[11](each start=0,each fixed=true);
  Real featherTarget,portTarget,starboardTarget,scull;
equation
  b=x[6];q=x[7];a=x[8];r=x[9];c=cos(b);s=sin(b);ct=cos(a);st=sin(a);
  cu=current[1]*cos(x[10])+current[2]*sin(x[10]);
  cw=-current[1]*sin(x[10])+current[2]*cos(x[10]);
  u=x[4]-cu; w=x[5]; v=x[15]-cw;
  axial=c*u+s*w;normal=-s*u+c*w;
  hx=bx*c;hz=bx*s;kx=tx*ct;kz=tx*st;
  tu=u-q*hz+r*kz;tw=w+q*hx-r*kx;
  fu=tu-r*flukeArm*st;fw=tw+r*flukeArm*ct;
  tailWater=wet(surface-(x[3]+hz-kz),.47);
  flukeWater=wet(surface-(x[3]+hz+(flukeArm-tx)*st),.22);
  finWater=wet(surface-(x[3]+1.35*s-.46*c),.32);
  blowholeHeight=x[3]+1.65*s+.99*c;
  for i in 1:6 loop
    bodyWet[i]=wet(surface-x[3]-station[i]*s,radius[i]);
    hydro[i]=mb*g*1.004*weight[i]*bodyWet[i];
    stations[i,1]=x[1]+station[i]*c*cos(x[10]);
    stations[i,2]=x[2]+station[i]*c*sin(x[10]);
    stations[i,3]=hydro[i]/(rho*g)*exp(-max(0,surface-x[3]-station[i]*s-radius[i])/1.15);
  end for;
  // Evaluate the unilateral contact loads on a 200 Hz contact clock. Switching
  // the nearest rock face during an adaptive fluid-force substep otherwise
  // makes the integrator chase a discontinuous normal along facet boundaries.
  when sample(0,.005) then
    if enableContacts then
      ground=bottomContact(x,Wreck.WhaleSurface.vertices,Wreck.WhaleSurface.faces);
    else
      ground={0,0,0,0,0,0,0,0,0,0,1e6};
    end if;
  end when;
  // Depth pilot schedules quiet breathing and fluke-up dives; one energetic
  // run every four cycles. Targets drive fin incidence and muscle torque only.
  cycle=if pilot[1]>.5 then (if pilot[4]>=0 then min(120,91+pilot[4]) else 0) elseif encounter[4]>.5 and encounter[6]<1.5 then mod(clock,168) else 0;divePhase=mod(clock+8,42);
  // A quiet bout has a gradual stroke reduction, a shallow breathing depth and a gradual return to patrol.
  restPhase=mod(clock+behaviorOffset,168);
  rest=if pilot[1]>.5 or directDrive>.5 or encounter[6]>1.5 or encounter[4]<.5 then 0
    else max(0,min(1,min((restPhase-24)/5,(68-restPhase)/5)));
  zTarget=if encounter[6]>1.5 then min(surface-.7,max(bottomAhead+3.2,encounter[5]+.55))
    elseif rest>.01 then surface-1.1 else surface+(if cycle>=91 and cycle<108 and encounter[6]<1.5 then -9.0 elseif cycle>=108 and cycle<112 then 3
    elseif divePhase<12 then -.70 elseif divePhase<18 then -.34 else -4.8);
  speedCmd=if cycle>=90 and cycle<115 then 7.3 elseif rest>0 then (1-rest)*(if encounter[1]>.5 then min(4,encounter[3]) else 2)+rest*.65 elseif pilot[1]>.5 then 1.4+3.6*pilot[3]+4.3*burst elseif encounter[1]>.5 then min(4,encounter[3]) else 2.0;
  pCmd=if cycle>=106.8 and cycle<113.0 then min(1.2,(cycle-106.8)*.65)
    elseif pilot[1]<.5 and bottomAhead>surface-8 then
      max(-.15,min(.55,.48*(min(surface-.7,max(zTarget,bottomAhead+3.2))-x[3])-.30*w))
    elseif pilot[1]>.5 and cycle<90 then pilot[2] elseif rest<.01 and encounter[6]<1.5 and divePhase>=18 and divePhase<22.5 and cycle<90 then -.98
    else max(-.48,min(.40,.18*(zTarget-x[3])-.32*w));
  course=if encounter[1]>.5 then encounter[2] else atan2(-18-x[2],-10-x[1])+1.57-atan(.080*(sqrt((x[1]+10)^2+(x[2]+18)^2+.01)-22));
  turn=if cycle>90 and cycle<113 and encounter[1]<.5 then 0 else atan2(sin(course-x[10]),cos(course-x[10]));
  roll=if pilot[1]>.5 and (cycle<90 or abs(bankCommand)>.001) then bankCommand elseif cycle>=110.3 and cycle<114 then 1.10 else max(-.34,min(.34,turn));
  amplitude=strokeGain*(1-.74*rest)*(if speedCmd>4 then max(.38,min(.83+.15*burst,.67+.085*(speedCmd-axial))) else max(.14,min(.62,.36+.22*(speedCmd-axial))));
  omega=if speedCmd>4 then 4.45+2.40*burst else (1-.44*rest)*min(3.4,2.25+.6*max(0,speedCmd-1.8));
  der(x[14])=if directDrive>.5 then 0 else omega;
  stroke=if directDrive>.5 then .85*max(-1,min(1,actuators[3])) else amplitude*sin(x[14]);
  burstTorque=maxJointTorque*(1+1.35*burst);
  burstPowerLimit=burstPower*(1+1.9*burst);
  rawTorque=max(-burstTorque,min(burstTorque,375000*(1+.8*burst)*(stroke-(a-b))+72000*(1+.4*burst)*((if directDrive>.5 then 0 else amplitude*omega*cos(x[14]))-r+q)));
  torque=rawTorque*min(1,burstPowerLimit/max(1,rawTorque*(r-q)));
  musclePower=torque*(r-q);
  tailFlow=atan2(-s*fu+c*fw,max(.20,c*fu+s*fw));
  featherTarget=if directDrive>.5 then 1.15*max(-1,min(1,actuators[4])) else
    max(-1.15,min(1.15,b+tailFlow-(.85-.30*burst)*max(-.42,min(.42,tailFlow))-.75*max(-.45,min(.45,pCmd-b-.18*q))-a));
  der(x[16])=min(13+26*burst,max(-13-26*burst,(featherTarget-x[16])*(35+90*burst)));
  (fx,fz)=foil(fu,fw,a+x[16],flukeArea,flukeWater);
  tailThrust=fx*c+fz*s;
  finArea=if directDrive<.5 and speedCmd>4 and cycle<106.8 and (pilot[1]<.5 or (abs(bankCommand)<.001 and abs(x[12])<.1)) then .162*pectoralArea else pectoralArea;
  portFlow=atan2(normal+1.35*q,max(.3,axial));
  finCmd=max(-.85,min(.85,portFlow+.75*(pCmd-b)-.09*q));
  finDiff=if cycle>90 and cycle<108 and abs(bankCommand)<.001 then 0 else max(-.35,min(.35,.68*(roll-x[12])-.30*x[13]));
  // On an emergency shore turn the inside flipper acts as a drag rudder.
  shoreTurn=if directDrive<.5 and pilot[1]<.5 and bottomAhead>surface-11
    then min(1,max(-1,turn)) else 0;
  portTarget=if directDrive>.5 then 1.20*max(-1,min(1,actuators[1])) else min(1.20,finCmd+finDiff+.95*max(0,shoreTurn));
  starboardTarget=if directDrive>.5 then 1.20*max(-1,min(1,actuators[2])) else min(1.20,finCmd-finDiff+.95*max(0,-shoreTurn));
  der(x[17])=25*(portTarget-x[17]);der(x[18])=25*(starboardTarget-x[18]);
  (pfx,pfz)=foil(u-1.35*q*s,w+1.35*q*c+1.45*x[13],b+x[17],finArea,finWater);
  (sfx,sfz)=foil(u-1.35*q*s,w+1.35*q*c-1.45*x[13],b+x[18],finArea,finWater);
  portLift=pfz;starboardLift=sfz;
  bulkDrag=bodyWet*weight;
  df=-.5*rho*.12*bulkDrag*axial*abs(axial);
  dn=-.5*rho*bulkDrag*normal*(4.2*abs(normal)+3.2*abs(axial));
  fbx=boatLoad[1]+ground[1]+c*df-s*dn+pfx+sfx;fbz=ground[2]+s*df+c*dn+(pfz+sfz)*cos(x[12])+sum(hydro)-mb*g;
  cbTorque=sum({hydro[i]*(station[i]*c-.12*s) for i in 1:6});
  tb=ground[3]+cbTorque+1.35*(c*(pfz+sfz)-s*(pfx+sfx))-torque-bulkDrag*(19000+42000*abs(q))*q;
  ftx=ground[4]+fx-18*tailWater*tu*abs(tu);ftz=ground[5]+fz+mt*g*(1.004*tailWater-1)-350*tailWater*tw*abs(tw);
  tt=ground[6]+torque+flukeArm*(ct*fz-st*fx);
  // Pin reaction from equality of the two rigid bodies' hinge accelerations.
  q11=1/mb+1/mt+hz^2/ib+kz^2/it;q12=-hx*hz/ib-kx*kz/it;
  q22=1/mb+1/mt+hx^2/ib+kx^2/it;det=q11*q22-q12^2;
  dx=ftx/mt-kz*tt/it-r^2*kx-(fbx/mb-hz*tb/ib-q^2*hx);
  dz=ftz/mt+kx*tt/it-r^2*kz-(fbz/mb+hx*tb/ib-q^2*hz);
  jx=(q22*dx-q12*dz)/det;jz=(q11*dz-q12*dx)/det;
  der(x[1])=x[4]*cos(x[10])-x[15]*sin(x[10]);
  der(x[2])=x[4]*sin(x[10])+x[15]*cos(x[10]);
  der(x[3])=w;der(x[4])=(fbx+jx)/mb+x[11]*x[15];der(x[5])=(fbz+jz)/mb;
  der(x[6])=q;der(x[7])=(tb+hx*jz-hz*jx)/ib;
  der(x[8])=r;der(x[9])=(tt-kx*jz+kz*jx)/it;
  // Lateral sculling and banked pectoral lift steer the swimming plane.
  scull=if directDrive>.5 then max(-1,min(1,actuators[5])) else min(1,max(-1,.9*turn-1.7*x[11]));
  yawForce=tailWater*.5*rho*.95*scull*(abs(axial))^2;
  der(x[10])=x[11];der(x[11])=(boatLoad[3]+ground[8]+3.6*yawForce+1.45*(sfx-pfx)-bulkDrag*(13000+32000*abs(x[11]))*x[11])/31000;
  der(x[15])=(boatLoad[2]+ground[7]-yawForce+(pfz+sfz)*sin(x[12])-4800*bulkDrag*v*abs(v))/(mb+mt)-x[11]*x[4];
  der(x[12])=x[13];der(x[13])=(ground[9]+1.45*(pfz-sfz)-bulkDrag*(5900*sin(x[12])+5100*x[13]))/6500;
end Humpback;
