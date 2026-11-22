model Humpback "Ten-metre humpback with a hinged caudal peduncle and oscillating hydrofoils"
  // ENU metres, radians, seconds. Positive pitch raises the rostrum.
  parameter Real startState[18]={2,-18,-3,1.7,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
  input Real boatLoad[3] "Hull reaction in forward and port axes, and yaw moment";
  input Real pilot[4] "Manual flag, desired pitch, stroke effort, breach cycle seconds (-1 idle)";
  input Real bankCommand "Manual bank demand, positive starboard-down radians";
  input Real directDrive,actuators[5] "Independent normalized port fin, starboard fin, peduncle, fluke feather and lateral scull";
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
  function bottomContact "Unilateral skin contact against sand triangles, flat bottom and shoreline rocks"
    input Real state[18];
    output Real loads[11] "Body Fx,Fz,pitch and tail Fx,Fz,pitch, total Fy,yaw,roll, normal force, minimum clearance";
  protected
    constant Real along[7]={-2,.5,4.35,-.55,-.55,-3.72,-3.72};
    constant Real side[7]={0,0,0,3.42,-3.42,2.16,-2.16};
    constant Real below[7]={-.84,-1.23,-.30,-1.90,-1.90,-.22,-.22};
    Real cy,sy,cr,sr,cp,sp,ct,st,lever,zOffset,yOffset,cosPitch,sinPitch,rate;
    Real arm[3],velocity[3],pos[3],force[3],rel[3],contact[5];
  algorithm
    loads:=zeros(11); loads[11]:=1e6;
    cr:=cos(state[12]);sr:=sin(state[12]);
    cp:=cos(state[6]);sp:=sin(state[6]);ct:=cos(state[8]);st:=sin(state[8]);
    // The furthest fluke probe stays within 6.7 m of the body origin.
    if Shore.aboveFlatBottom(state[1],state[2],state[3],6.7) then
      for i in 1:7 loop
        zOffset:=side[i]*sr+below[i]*cr;
        loads[11]:=min(loads[11],state[3]+(if i<=5 then along[i]*sp+zOffset*cp
          else (along[i]*st+zOffset*ct)+bx*sp)+13.7);
      end for;
      return;
    end if;
    cy:=cos(state[10]);sy:=sin(state[10]);
    for i in 1:7 loop
      // Rotate the skin offsets in roll and pitch. Fluke points translate with the torso hinge.
      yOffset:=side[i]*cr-below[i]*sr; zOffset:=side[i]*sr+below[i]*cr;
      lever:=along[i];cosPitch:=if i<=5 then cp else ct;sinPitch:=if i<=5 then sp else st;
      rate:=if i<=5 then state[7] else state[9];
      rel:={lever*cosPitch-zOffset*sinPitch,yOffset,lever*sinPitch+zOffset*cosPitch};
      arm:=rel+(if i<=5 then zeros(3) else {bx*cp,0,bx*sp});
      velocity:={state[4]-state[11]*arm[2]-rate*rel[3]-state[13]*yOffset*sinPitch,
        state[15]+state[11]*arm[1]-state[13]*zOffset,
        state[5]+rate*rel[1]+state[13]*yOffset*cosPitch};
      if i>5 then velocity:=velocity+{-state[7]*bx*sp,0,state[7]*bx*cp}; end if;
      pos:={state[1]+cy*arm[1]-sy*arm[2],state[2]+sy*arm[1]+cy*arm[2],state[3]+arm[3]};
      contact:=Shore.skinContact(pos,cy,sy,velocity,if i<=5 then 55000 else 16000);
      loads[11]:=min(loads[11],contact[5]);
      if contact[4]>0 then
        force:=contact[1:3];
        if i<=5 then
          loads[1]:=loads[1]+force[1];loads[2]:=loads[2]+force[3];
          loads[3]:=loads[3]+rel[1]*force[3]-rel[3]*force[1];
        else
          loads[4]:=loads[4]+force[1];loads[5]:=loads[5]+force[3];
          loads[6]:=loads[6]+(rel[1]+tx*ct)*force[3]-(rel[3]+tx*st)*force[1];
        end if;
        loads[7]:=loads[7]+force[2];loads[8]:=loads[8]+arm[1]*force[2]-arm[2]*force[1];
        loads[9]:=loads[9]+yOffset*(cosPitch*force[3]-sinPitch*force[1])-zOffset*force[2];
        loads[10]:=loads[10]+contact[4];
      end if;
    end for;
  end bottomContact;
  Real c,s,ct,st,u,w,v,b,q,a,r,course,turn,roll,omega,stroke,amplitude,cycle,divePhase;
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
    ground=bottomContact(x);
  end when;
  // Depth pilot schedules quiet breathing and fluke-up dives; one energetic
  // run every four cycles. Targets drive fin incidence and muscle torque only.
  cycle=if pilot[1]>.5 then (if pilot[4]>=0 then min(120,91+pilot[4]) else 0) elseif encounter[4]>.5 then mod(clock,168) else 0;divePhase=mod(clock+8,42);
  zTarget=surface+(if cycle>=91 and cycle<108 then -9.0 elseif cycle>=108 and cycle<112 then 3
    elseif divePhase<12 then -.70 elseif divePhase<18 then -.34 else -4.8);
  speedCmd=if cycle>=90 and cycle<115 then 7.3 elseif pilot[1]>.5 then 1.4+3.6*pilot[3]+4.3*burst elseif encounter[1]>.5 then min(4,encounter[3]) else 2.0;
  pCmd=if cycle>=106.8 and cycle<113.0 then min(1.2,(cycle-106.8)*.65)
    elseif pilot[1]<.5 and bottomAhead>surface-8 then
      max(-.15,min(.55,.48*(min(surface-.7,max(zTarget,bottomAhead+3.2))-x[3])-.30*w))
    elseif pilot[1]>.5 and cycle<90 then pilot[2] elseif divePhase>=18 and divePhase<22.5 and cycle<90 then -.98
    else max(-.48,min(.40,.18*(zTarget-x[3])-.32*w));
  course=if encounter[1]>.5 then encounter[2] else atan2(-18-x[2],-10-x[1])+1.57-atan(.080*(sqrt((x[1]+10)^2+(x[2]+18)^2+.01)-22));
  turn=if cycle>90 and cycle<113 and encounter[1]<.5 then 0 else atan2(sin(course-x[10]),cos(course-x[10]));
  roll=if pilot[1]>.5 and (cycle<90 or abs(bankCommand)>.001) then bankCommand elseif cycle>=110.3 and cycle<114 then 1.10 else max(-.34,min(.34,turn));
  amplitude=strokeGain*(if speedCmd>4 then max(.38,min(.83+.15*burst,.67+.085*(speedCmd-axial))) else max(.14,min(.62,.36+.22*(speedCmd-axial))));
  omega=if speedCmd>4 then 4.45+2.40*burst else min(3.4,2.25+.6*max(0,speedCmd-1.8));
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
