model BreakwaterEncounter "Cruiser encounter, sampled swimmer dynamics and contact damage"
  constant Integer targetCount=24;
  constant Real step=.025,g=9.80665,rho=1025;
  parameter Real sharkLength=4.8,sharkMass=870*(sharkLength/4.8)^3;
  parameter Real hullVertices[96,3]=Shore.cruiserVertices();
  parameter Integer hullFaces[188,3]=Shore.pontoonFaces();
  parameter Real cabinVertices[38,3]=Shore.cruiserCabinVertices();
  parameter Integer cabinFaces[46,3]=Shore.cruiserCabinFaces();
  parameter Real openingWork=18500 "Effective work to destroy one hull panel, calibrated for the encounter [J]";
  parameter Real firstPass=13 "Time allowed for the initial circling pass [s]";
  constant Real panelX[6]={-2.56,-.25,2.10,-2.56,-.25,2.10};
  constant Real panelY[6]={.94,1.08,.76,-.94,-1.08,-.76};
  constant Real holeZ=-.30,soleZ=-.65;
  constant Real floodedArea[6]={.88,1.08,.76,.88,1.08,.76};
  constant Real cabinCeiling=1.16 "Height at the crown of the forward cabin [m]";
  constant Real floodCapacity[6]={floodedArea[i]*(if mod(i,3)==0 then cabinCeiling-soleZ else 1.23) for i in 1:6};
  input Real activate,tide;
  input Real boat[6] "Position and ZYX roll, pitch and yaw";
  input Real vesselVelocity[3],angularVelocity[3] "ENU velocities at hull frame origin";
  input Real vesselMass;
  input Real panelSurface[6] "Instantaneous exterior water levels at the damage panels";
  input Real targets[targetCount,7] "Stable ID, type (1 surface vessel, 2 swimmer, 3 gull/drone, 4 sub), ENU position, contact radius, mass";
  discrete output Real shark[10](each start=0,each fixed=true)
    "Phase, ENU position, yaw, nose-up pitch, ENU velocity and jaw opening";
  discrete output Real impact[8](each start=0,each fixed=true)
    "Impact sequence, time, force, ENU witness and attached hit lever east/north";
  discrete output Real integrity[6](each start=100,each fixed=true);
  discrete output Real victimHealth[targetCount,2](each start=0,each fixed=true);
  output Real waterVolume[6](each start=0,each fixed=true);
  output Real flooding[6,5] "Water volume, signed flow, hole area, inside local level and outside water head";
  output Real hullHealth,waterMass;
  output Real sinkState "0 afloat, 1 flooding, 2 submerged";
  output Real collisionForce[3],collisionMoment[3] "Balanced impulse transmitted to cruiser [N, N.m], resolved in ENU";
  output Real bodyPoints[6,3] "Centres of the structural panels in hull coordinates";
  output Real waveSurge[2] "Sea height effect at port then starboard";
  output Real rollMoment,pitchMoment "Gravity moments from the water inside the boat";
protected
  discrete Real memory[8](each start=0,each fixed=true)
    "Start time, retreat deadline, panel, contact deadline, east/north/up impulse, bite deadline";
  Real R[3,3],openingDepth[6],deckOvertop[6],cabinOvertop[6],interiorHead[6],head[6],jetFlow[6],opening[6],floodMassArm[3],gravityArm[3,3];
  Real dz,offset[3],portRange,starboardRange,oscillation,cockpitHead;
  function hullRotation
    input Real roll,pitch,yaw;
    output Real R[3,3];
  algorithm
    R:=[cos(yaw),-sin(yaw),0;sin(yaw),cos(yaw),0;0,0,1]*
      [cos(pitch),sin(pitch)*sin(roll),sin(pitch)*cos(roll);0,cos(roll),-sin(roll);-sin(pitch),cos(pitch)*sin(roll),cos(pitch)*cos(roll)];
  end hullRotation;

  function sharkContact "Closest gap and witness between the shark envelope and cruiser triangles"
    input Real position[3],yaw,pitch,gape,length,boat[6],frame[3,3];
    input Real hull[96,3],cabin[38,3];
    input Integer hullFaces[188,3],cabinFaces[46,3];
    output Real contact[8] "Gap, normal, witness in boat coordinates, hull (1) or cabin (0)";
  protected
    // Overlapping volumes fitted to the 4.8 m model, from snout to tail,
    // with separate jaw and fin envelopes.
    constant Real body[17,4]=[
      2.13,0,.036,.29; 1.81,0,-.055,.45; 1.53,0,-.40,.36;
      1.21,0,-.17,.55; .54,0,-.15,.53; -.15,0,-.15,.50;
      -.77,0,-.15,.40; -1.30,0,-.13,.29; -1.70,0,-.14,.23;
      -2.07,0,-.15,.22; -2.20,0,.40,.25; -2.18,0,-.61,.25;
      -.13,0,.59,.27; .20,.66,-.39,.28; .20,-.66,-.39,.28;
      -.12,1.01,-.52,.19; -.12,-1.01,-.52,.19];
    Real local[3],centre[3],orientation[3,3],sphere[3],radius,scale,gap;
    Real skin[4],wall[4],nearest[4],kind;
  algorithm
    contact:={1e3,0,0,0,0,0,0,0};
    scale:=length/4.8;
    local:=transpose(frame)*(position-boat[1:3]);
    if abs(local[1])>4+2.6*scale or abs(local[2])>1.4+2.6*scale
      or local[3]>2.2+2.6*scale or local[3]<-.8-2.6*scale then return;end if;
    orientation:=transpose(frame)*hullRotation(0,-pitch,yaw);
    for i in 1:size(body,1) loop
      sphere:={body[i,1],body[i,2],body[i,3]-(if i==3 then .14*gape else 0)};
      centre:=local+orientation*(scale*sphere);
      radius:=scale*body[i,4];
      skin:=Shore.cruiserGap(centre,hull,radius+.12,hullFaces);
      wall:={1e3,0,0,0};
      if centre[1]>=-1.85-radius and centre[1]<=2.04+radius and abs(centre[2])<=1.06+radius
        and centre[3]>=.77-radius and centre[3]<=2.18+radius then
        wall:=Shore.hullMeshGap(centre,cabin,cabinFaces,true);
      end if;
      nearest:=if skin[1]<=wall[1] then skin else wall;
      kind:=if skin[1]<=wall[1] then 1 else 0;
      gap:=nearest[1]-radius;
      if gap<contact[1] then
        contact:=cat(1,{gap},nearest[2:4],centre-nearest[1]*nearest[2:4],{kind});
      end if;
    end for;
  end sharkContact;

  function advance
    input Real t,activate,tide,boat[6],vBoat[3],spin[3],boatMass,sinkState,length,mass,firstPass,breakWork;
    input Real observed[targetCount,7],old[10],before[8],oldImpact[8],oldIntegrity[6],oldHealth[targetCount,2];
    input Real hull[96,3],cabin[38,3];
    input Integer hullFaces[188,3],cabinFaces[46,3];
    output Real next[10],state[8],hit[8],panel[6],health[targetCount,2];
  protected
    Real frame[3,3],ahead[3],side[3],to[3],target[3],delta[3],velocity[3],jaw[3],normalSpeed,normal[3],lever[3];
    Real start[3],finish[3],position[3],contact[8],overlap[8];
    Real depthGoal,heading,error,pitch,speed,r,mu,energy,impulse,elapsed,best,slip,fraction;
    Integer desired,part,victim,candidate;
    Boolean strike;
  algorithm
    next:=old;state:=before;hit:=oldImpact;panel:=oldIntegrity;
    to:=zeros(3);r:=0;mu:=0;energy:=0;impulse:=0;
    health:=zeros(targetCount,2);
    for i in 1:targetCount loop
      health[i,1]:=observed[i,1];
      health[i,2]:=if observed[i,1]<=0 then 0 elseif observed[i,1]==oldHealth[i,1] then oldHealth[i,2] else 100;
    end for;
    if old[1]==0 and activate>.5 then
      next[1]:=1;state[1]:=t;state[3]:=1;
      next[2:4]:=boat[1:3]+{15*cos(boat[6]),15*sin(boat[6]),tide-1.2-boat[3]};
      next[5]:=boat[6]+Modelica.Constants.pi/2;
    end if;
    if next[1]==0 then return;end if;
    start:=next[2:4];
    if sinkState>1.5 then next[1]:=4;end if;
    elapsed:=t-state[1];
    if next[1]==1 and elapsed>=firstPass then next[1]:=2;end if;
    frame:=hullRotation(boat[4],boat[5],boat[6]);
    desired:=integer(max(1,min(6,state[3])));
    if next[1]==3 and t>=state[2] then
      to:=transpose(frame)*(next[2:4]-boat[1:3]);
      if (abs(to[1]-panelX[desired])<1.8 and to[2]*sign(panelY[desired])>8)
        or t>=state[2]+6 then next[1]:=2;end if;
    end if;
    victim:=0;best:=1e12;
    target:=boat[1:3];
    if next[1]==1 then
      // Tangential pass at modest speed. The hull sees the travelling pressure field below.
      to:=next[2:4]-boat[1:3];r:=max(.1,sqrt(to[1]^2+to[2]^2));
      ahead:={to[1]/r,to[2]/r,0};side:={-ahead[2],ahead[1],0};
      target:=next[2:4]+7*side+(9.0-r)*ahead;
    elseif next[1]==2 then
      target:=boat[1:3]+frame*{panelX[desired],.94*panelY[desired],-.28}+.35*vBoat;
    elseif next[1]==3 then
      // Reposition offshore of the next intact section before turning in.
      target:=boat[1:3]+frame*{panelX[desired],11*sign(panelY[desired]),0};
    else
      for i in 1:targetCount loop
        if health[i,1]>0 and health[i,2]>0 and observed[i,5]<=tide+.75 then
          to:=observed[i,3:5]-next[2:4];r:=to*to;
          if r<best then victim:=i;best:=r;end if;
        end if;
      end for;
      target:=if victim>0 then observed[victim,3:5] else next[2:4]+{8*cos(next[5]),8*sin(next[5]),0};
    end if;
    delta:=target-next[2:4];
    heading:=atan2(delta[2],delta[1]);
    error:=atan2(sin(heading-next[5]),cos(heading-next[5]));
    r:=sqrt(delta[1]^2+delta[2]^2);
    depthGoal:=if next[1]==1 then tide-1.28 elseif next[1]==3 then tide-1.5
      elseif next[1]==4 then min(tide+.12,target[3]) else min(tide-.32,target[3]-.22);
    pitch:=min(.32,max(-.32,atan2(depthGoal-next[4],max(2,r))));
    next[5]:=next[5]+step*min(.70,max(-.70,1.8*error));
    next[6]:=next[6]+step*2.0*(pitch-next[6]);
    ahead:={cos(next[6])*cos(next[5]),cos(next[6])*sin(next[5]),sin(next[6])};
    slip:=if victim>0 and r<6 then max(.12,max(0,cos(error))^2)
      else max(.30,cos(error)^2);
    speed:=slip*(if next[1]==1 then 4.65 elseif next[1]==3 then 5.0 else 8.6);
    velocity:=next[7:9]+step*1.12*(speed*ahead-next[7:9]);
    velocity[3]:=velocity[3]+step*(1.05*(depthGoal-next[4])-1.35*velocity[3]);
    next[7:9]:=velocity;
    next[10]:=0;
    jaw:=next[2:4]+.43*length*ahead;
    if next[1]==2 and r<7 then next[10]:=1;end if;
    finish:=start+step*velocity;
    finish[3]:=max(-11.8,min(tide+.15,finish[3]));
    // Sample the approach before publishing a pose. Even at full speed the
    // substep is much shorter than the smallest part of the shark envelope.
    position:=finish;
    contact:={1e3,0,0,0,0,0,0,0};
    to:=start-boat[1:3];
    if to*to<(5.4+.55*length+step*sqrt((velocity-vBoat)*(velocity-vBoat)))^2 then
      for j in 1:4 loop
        fraction:=j/4;
        position:=start+fraction*(finish-start);
        contact:=sharkContact(position,next[5],next[6],next[10],length,boat,frame,hull,cabin,hullFaces,cabinFaces);
        if contact[1]<.012 then break;end if;
      end for;
    end if;
    if contact[1]<.012 then
      normal:=frame*contact[2:4];
      lever:=frame*contact[5:7];
      normalSpeed:=(vBoat+cross(spin,lever)-velocity)*normal;
      mu:=mass*boatMass/(mass+boatMass);
      energy:=.5*mu*normalSpeed^2;
      impulse:=1.09*mu*max(0,normalSpeed);
      // Keep the whole envelope out of the hull, even while retreating or
      // when the damage cooldown suppresses a new structural hit.
      position:=position+(.014-contact[1])*normal;
      for pass in 1:3 loop
        overlap:=sharkContact(position,next[5],next[6],next[10],length,boat,frame,hull,cabin,hullFaces,cabinFaces);
        if overlap[1]>=.012 then break;end if;
        position:=position+(.014-overlap[1])*(frame*overlap[2:4]);
      end for;
      strike:=normalSpeed>.40 and t>=state[4];
      next[7:9]:=velocity+(if strike then impulse/mass else max(0,normalSpeed))*normal;
      if strike then
        state[5:7]:=-impulse*normal;
        state[4]:=t+.125;
        hit:={oldImpact[1]+1,t,impulse/.125,boat[1]+lever[1],boat[2]+lever[2],boat[3]+lever[3],lever[1],lever[2]};
      end if;
      if next[1]==2 and strike then
        part:=(if contact[5]<-1.40 then 1 elseif contact[5]<.95 then 2 else 3)+(if contact[6]>=0 then 0 else 3);
        if contact[8]>.5 and oldIntegrity[part]>0 then
          panel:={if i==part then max(0,oldIntegrity[i]-min(72,100*energy/breakWork+(if next[10]>.5 then 10 else 0))) else oldIntegrity[i] for i in 1:6};
        end if;
        // Cycle around the remaining sections even if this run glanced off
        // a different part of the hull on its way to the intended section.
        for i in 1:6 loop
          candidate:=1+mod(desired-1+i,6);
          if panel[candidate]>0 then state[3]:=candidate;break;end if;
        end for;
        state[2]:=t+4.4;
        next[1]:=3;
      end if;
    elseif next[1]==2 and r<1 then
      state[2]:=t+2.8;
      state[3]:=if desired==6 then 1 else desired+1;
      next[1]:=3;
    end if;
    if victim>0 then
      to:=observed[victim,3:5]-jaw;r:=sqrt(to*to);
      if r<observed[victim,6]+2 and to*ahead>-.35 then next[10]:=1;end if;
      if r<=observed[victim,6]+.80 and next[10]>.5 and t>=state[8] then
        mu:=mass*max(1,observed[victim,7])/(mass+max(1,observed[victim,7]));
        energy:=.5*mu*(velocity*velocity);
        for i in 1:targetCount loop
          if i==victim then
            health[i,2]:=max(0,health[i,2]-(if observed[i,2]==1 then min(68,16+energy/620) else 36));
          end if;
        end for;
        state[8]:=t+1.15;
        if observed[victim,2]==1 then
          hit:={oldImpact[1]+1,t,mu*speed/.125,jaw[1],jaw[2],jaw[3],0,0};
          next[7:9]:=.68*next[7:9];
        end if;
      end if;
    end if;
    next[2:4]:=position;
  end advance;
equation
  R=hullRotation(boat[4],boat[5],boat[6]);
  when sample(0,step) then
    (shark,memory,impact,integrity,victimHealth)=advance(time,activate,tide,boat,vesselVelocity,angularVelocity,vesselMass,
      (if boat[3]<tide-1.10 and waterMass>2100 then 2 else 0),sharkLength,sharkMass,firstPass,openingWork,targets,pre(shark),pre(memory),pre(impact),pre(integrity),pre(victimHealth),
      hullVertices,cabinVertices,hullFaces,cabinFaces);
  end when;
  // The cockpit is open across the centreline. Water spilling over the low
  // gunwale reaches both sides through the open floor and damaged partitions.
  cockpitHead=max(0,.5*(panelSurface[2]+panelSurface[5])-boat[3]-
    R[3,:]*{-1.35,0,.47}+.90*abs(R[3,2])-.055);
  for i in 1:6 loop
    bodyPoints[i,:]={panelX[i],panelY[i],holeZ};
    openingDepth[i]=panelSurface[i]-boat[3]-R[3,:]*bodyPoints[i,:];
    opening[i]=if integrity[i]>=91 then 0 elseif integrity[i]<=0 then .88 else
      .012+.28*((91-integrity[i])/91)^2;
    interiorHead[i]=max(0,soleZ+waterVolume[i]/floodedArea[i]-holeZ);
    head[i]=max(0,openingDepth[i])-interiorHead[i];
    // A flooded opening equalizes both hydrostatic heads. Deck downflooding
    // becomes possible once the damaged panel's upper edge is under water.
    // At large list the open cockpit can downflood over the deck edge.
    // It provides a second path into the damaged hull, including unbreached bays.
    deckOvertop[i]=if noEvent(hullHealth<70 or sinkState>1.5) then
      max(.55*cockpitHead,panelSurface[i]-boat[3]-R[3,:]*{-1.35,panelY[i],.47}-.055) else 0;
    // Once the companionway submerges, water reaches both forward bays as
    // the remaining air vents. Their water mass then includes the cabin.
    cabinOvertop[i]=if mod(i,3)==0 and noEvent(sinkState>1.5) then
      max(0,panelSurface[i]-boat[3]-R[3,:]*{1.24,0,.92}) else 0;
    jetFlow[i]=(opening[i]+(if noEvent(openingDepth[i]>1.20 and integrity[i]<98) then .12 else 0))*
      (if noEvent(head[i]>=0) then .62*sqrt(2*g*head[i])*max(0,min(1,(floodCapacity[i]-waterVolume[i])/.025))
       else -.62*sqrt(-2*g*head[i])*max(0,min(1,waterVolume[i]/.025)))+
       (.48*deckOvertop[i]*sqrt(2*g*deckOvertop[i])+.075*sqrt(2*g*cabinOvertop[i]))*
       max(0,min(1,(floodCapacity[i]-waterVolume[i])/.025));
    der(waterVolume[i])=jetFlow[i];
    flooding[i,:]={waterVolume[i],jetFlow[i],opening[i],soleZ+waterVolume[i]/floodedArea[i],openingDepth[i]};
  end for;
  hullHealth=sum(integrity)/6;
  waterMass=rho*sum(waterVolume);
  sinkState=noEvent(if boat[3]<tide-1.10 and waterMass>2100 then 2 elseif sum(opening)>0 then 1 else 0);
  collisionForce=if noEvent(shark[1]>0 and time<memory[4]) then memory[5:7]/.125 else zeros(3);
  collisionMoment=cross({impact[7],impact[8],impact[6]-boat[3]},collisionForce);
  // Rotate the floodwater's centre of mass into level heading axes before
  // applying its weight. The restoring moment changes sign after rollover.
  gravityArm=hullRotation(boat[4],boat[5],0);
  floodMassArm=gravityArm*{sum({waterVolume[i]*panelX[i] for i in 1:6}),
    sum({waterVolume[i]*.57*panelY[i] for i in 1:6}),
    sum({waterVolume[i]*(soleZ+.5*waterVolume[i]/floodedArea[i]) for i in 1:6})};
  rollMoment=-rho*g*floodMassArm[2];
  pitchMoment=rho*g*floodMassArm[1];
  // Reduced-order pressure head from the displaced swimmer. The wave signal
  // follows its position and speed, with opposite phases across the beam.
  offset=transpose(R)*(shark[2:4]-boat[1:3]);
  portRange=sqrt(offset[1]^2+(offset[2]-.55)^2);
  starboardRange=sqrt(offset[1]^2+(offset[2]+.55)^2);
  dz=max(.2,tide-shark[4]);
  oscillation=min(.25,.013*(shark[7:9]*shark[7:9]))*exp(-.34*dz);
  waveSurge=if shark[1]>.5 and shark[1]<1.5 then oscillation*{exp(-portRange/12)*sin(.93*portRange),
    exp(-starboardRange/12)*sin(.93*starboardRange)} else {0,0};
end BreakwaterEncounter;
