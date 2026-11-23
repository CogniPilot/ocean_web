model Regatta "Five-minute fleet starts and an equilateral triangular course"
  input Real utc "Unix seconds from the browser clock";
  input Real finishAllowed=1 "Zero while the racer owes a turn penalty";
  input Real raceStart=0 "UTC of a host-scheduled start, zero for the regular UTC cycle";
  input Real east,north;
  parameter Real windBearing=atan2(4,10) "Direction the prevailing wind travels, counterclockwise from east";
  parameter Real gateEast=-10,gateNorth=-6.5,lineLength=40,legLength=200,zone=18
    "Length in metres of each mark's outside scoring gate";
  final parameter Real upE=-cos(windBearing),upN=-sin(windBearing);
  final parameter Real rightE=upN,rightN=-upE "Starboard when facing the wind";
  output Real pinEast,pinNorth,committeeEast,committeeNorth,markEast[2],markNorth[2];
  input Real wakeTile[64,64],backgroundTile[32,32],driftEast,driftNorth,tide,swellHeight;
  input Real hullWaveTile[64,64]=zeros(64,64);
  input Real bowSources[14,6]=zeros(14,6),bowFrame[4]=zeros(4),bowSpeed[2]=zeros(2);
  input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
  parameter Real swellBearing=Wreck.SpectralSea.swellBearing;
  input Real swellK=Wreck.SpectralSea.swellK;
  input Real swellOmega=sqrt(Wreck.g*Wreck.SpectralSea.swellK*
    tanh(Wreck.SpectralSea.swellK*Wreck.SpectralSea.nearshoreDepth));
  parameter Real launchMass=1150,waterplaneArea=7.2,rollInertia=650,pitchInertia=3100;
  final parameter Real stationX[4]={1.65,1.65,-1.65,-1.65},stationY[4]={.65,-.65,.65,-.65};
  final parameter Real draft=launchMass/(1025*waterplaneArea);
  final parameter Real committeeContactVertices[42,3]=Shore.committeeVertices();
  final parameter Integer committeeContactFaces[80,3]=Shore.committeeFaces();
  final parameter Real committeeFittingVertices[3,8,3]=Shore.committeeFittings();
  final parameter Integer fittingContactFaces[12,3]=Shore.boxFaces();
  output Real launchPose[3] "Elevation, roll and bow-up pitch of anchored launch [m,rad,rad]";
  Real heave(start=0,fixed=true),roll(start=0,fixed=true),pitch(start=0,fixed=true);
  Real heaveRate(start=0,fixed=true),rollRate(start=0,fixed=true),pitchRate(start=0,fixed=true);
  Real stationE[4],stationN[4],immersion[4],lift[4],stationRate[4];
  discrete Real water[4](each start=0,each fixed=true),priorWater[4](each start=0,each fixed=true);
  discrete Real stamp(start=0,fixed=true);
  Real fraction;
  output Real markPose[3,3] "Heave, east-axis roll and bow-up pitch for each pyramid";
  Real buoySpeed[3,3](each start=0,each fixed=true),buoyState[3,3](each start=0,each fixed=true);
  final parameter Real bx[3]={0,.34641,-.34641},by[3]={.4,-.2,-.2};
  parameter Real pyramidHeight=1.75,pyramidArea=3*sqrt(3.0)*.85^2/4,pyramidDraft=.10;
  final parameter Real pyramidMass=1025*pyramidArea*pyramidHeight/3*(1-(1-pyramidDraft/pyramidHeight)^3);
  parameter Real ballastDepth(unit="m")=.20 "Assumed vertical separation between buoyancy and ballast centers";
  parameter Real markRollDamping(unit="N.m.s")=50 "Effective rotational drag including entrained water";
  discrete Real buoyWater[3,3](each start=0,each fixed=true),lastBuoyWater[3,3](each start=0,each fixed=true);
  Real buoyEast[3],buoyNorth[3],depthAt[3,3],buoyLift[3,3],buoyV[3,3];
  input Real racerState[11](each start=0) "Enabled, yaw, roll, pitch, elevation, EN velocity, yaw rate, vertical speed and roll/pitch rates";
  input Real hullStations[7],hullWidths[7],hullOffset;
  discrete output Real markWrench[3,12](each start=0,each fixed=true) "Paired contact forces and moments in ENU";
  output Real racerLoad[6] "Total ENU contact load on the racer";
  discrete Real markOffset[3,2](each start=0,each fixed=true),markVelocity[3,2](each start=0,each fixed=true);
  function hullAxes "World directions of forward, port and up"
    input Real yaw,roll,pitch;
    output Real axes[3,3];
  algorithm
    axes[1,:]:={cos(yaw)*cos(pitch),sin(yaw)*cos(pitch),-sin(pitch)};
    axes[2,:]:={cos(yaw)*sin(pitch)*sin(roll)-sin(yaw)*cos(roll),
      sin(yaw)*sin(pitch)*sin(roll)+cos(yaw)*cos(roll),cos(pitch)*sin(roll)};
    axes[3,:]:=cross(axes[1,:],axes[2,:]);
  end hullAxes;
  function pyramidFace "Signed plane clearance, positive outside, and index of the closest escape face"
    input Real p[3];
    output Real gap;
    output Integer face;
  protected
    constant Real slope=.85/(2*1.75),scale=1/sqrt(1+slope^2);
    Real lateral,front,left,right,bottom;
  algorithm
    lateral:=slope*(p[3]-1.65);
    front:=(p[2]+lateral)*scale;
    left:=(.866025403784439*p[1]-.5*p[2]+lateral)*scale;
    right:=(-.866025403784439*p[1]-.5*p[2]+lateral)*scale;
    bottom:=-p[3]-.10;
    gap:=max(max(front,bottom),max(left,right));
    face:=if gap==front then 1 elseif gap==left then 2 elseif gap==right then 3 else 4;
  end pyramidFace;
  function markContact "Racer hull and trampoline against the four faces of a triangular buoy"
    input Real delta[3],state[11],stations[7],widths[7],offset;
    input Real markRoll,markPitch,markVelocity[3],markRates[2];
    output Real load[12];
  protected
    constant Real radius=.85,height=1.75,draft=.10,slope=radius/(2*height),scale=1/sqrt(1+slope^2);
    constant Real faces[4,3]=[0,scale,slope*scale;sqrt(3.0)/2*scale,-.5*scale,slope*scale;
      -sqrt(3.0)/2*scale,-.5*scale,slope*scale;0,0,-1];
    MultiBodyLie.Collision.Material inflatable(k=6500,d=.55,mu=.18,eps=.0003,v_eps=.06);
    MultiBodyLie.Collision.ContactPoint point;
    Real boatAxes[3,3],markAxes[3,3],local[3],arm[3],p[3],bestArm[3],n[3];
    Real boatCenterX,boatCenterY,margin;
    Real gap,best,x,y,z,alpha,width,v[3],w[3],omega[3],f[3],m[3],fb[3],mb[3];
    Integer panel,face,bestFace,side;
  algorithm
    load:=zeros(12);
    if state[1]>.5 and delta*delta<25 then
      boatAxes:=hullAxes(state[2],state[3],state[4]);
      markAxes:=hullAxes(0,markRoll,-markPitch);
      v:={state[6],state[7],state[9]};
      w:=state[10]*boatAxes[1,:]+state[11]*{-sin(state[2]),cos(state[2]),0}+{0,0,state[8]};
      omega:=markRates[1]*markAxes[1,:]-{0,markRates[2],0};
      boatCenterX:=-delta*boatAxes[1,:]; boatCenterY:=-delta*boatAxes[2,:];
      // Bounding radius of the whole tilted buoy for rejecting distant sections.
      margin:=1.86;
      for body in 1:(if offset>0 then 6 else 1) loop
        best:=0;bestArm:=zeros(3);bestFace:=1;
        for j in 0:24 loop
          if body>3 then
            // Sample the two bow bridles and the lower forestay where an inflatable can reach.
            alpha:=j/24;
            if body<6 then
              x:=2.29+alpha*(2.520-2.29);y:=(if body==4 then 1 else -1)*alpha*(offset-.004);
              z:=.65+alpha*(.2261-.65);
            else
              x:=2.29+alpha*(.44-2.29);y:=0;z:=.65+alpha*(5.85-.65);
            end if;
            arm:=x*boatAxes[1,:]+y*boatAxes[2,:]+z*boatAxes[3,:];
            p:=markAxes*(delta+arm);
            (gap,face):=pyramidFace(p);
            gap:=gap-.003;
            if gap<best then best:=gap;bestArm:=arm;bestFace:=face;end if;
          else
            panel:=min(6,1+div(j,4));alpha:=(j-4*(panel-1))/4;
            x:=(1-alpha)*stations[panel]+alpha*stations[panel+1];
            width:=(1-alpha)*widths[panel]+alpha*widths[panel+1];
            if body==3 then x:=-1.4+(1.95/24)*j;end if;
            if abs(x-boatCenterX)<margin and (body==3 or abs((3-2*body)*offset-boatCenterY)<width+margin) then
              for k in 0:(if body==3 then 8 else 5) loop
                if body==3 then
                  y:=offset*(k/4-1);z:=.40;
                else
                  side:=mod(k,3)-1;
                  y:=(3-2*body)*offset+side*width;
                  z:=if k<3 then -.06 else (if offset>0 then .24 else .07);
                end if;
                arm:=x*boatAxes[1,:]+y*boatAxes[2,:]+z*boatAxes[3,:];
                p:=markAxes*(delta+arm);
                (gap,face):=pyramidFace(p);
                if gap<best then best:=gap;bestArm:=arm;bestFace:=face;end if;
              end for;
            end if;
          end if;
        end for;
        if best<0 then
          n:=transpose(markAxes)*faces[bestFace,:];
          point:=MultiBodyLie.Collision.ContactPoint(gap=best,n=n,armA=bestArm,armB=delta+bestArm-best*n);
          (f,m,fb,mb):=MultiBodyLie.Collision.pairWrenches(point,v,w,markVelocity,omega,inflatable);
          load:=load+cat(1,f,m,fb,mb);
        end if;
      end for;
    end if;
  end markContact;
  function markContacts "Sample the three moored marks on the same collision clock"
    input Real east,north,state[11],stations[7],widths[7],offset;
    input Real markE[3],markN[3],pose[3,3],velXY[3,2],rates[3,3];
    output Real wrenches[3,12];
  algorithm
    wrenches:=zeros(3,12);
    for b in 1:3 loop
      if state[1]>.5 and (east-markE[b])^2+(north-markN[b])^2<25 then
        wrenches[b,:]:=markContact({east-markE[b],north-markN[b],state[5]-pose[b,1]},
          state,stations,widths,offset,pose[b,2],pose[b,3],
          {velXY[b,1],velXY[b,2],rates[b,1]},rates[b,2:3]);
      end if;
    end for;
  end markContacts;
  input Real landingReaction[6] "Drone contact wrench on launch, world ENU";
  output Real deckState[12] "Origin ENU, yaw/roll/bow-up pitch, linear and angular velocity ENU";
  function elevationAt "Periodic bilinear elevation on an east-north grid"
    input Real grid[:,:],east,north,period;
    output Real elevation;
  protected
    Integer rows,cols,i,j,ii,jj;
    Real x,y,a,b;
  algorithm
    rows:=size(grid,1); cols:=size(grid,2);
    x:=east*cols/period; y:=north*rows/period;
    i:=1+mod(integer(floor(x)),cols); j:=1+mod(integer(floor(y)),rows);
    ii:=1+mod(i,cols); jj:=1+mod(j,rows);
    a:=x-floor(x); b:=y-floor(y);
    elevation:=(1-b)*((1-a)*grid[j,i]+a*grid[j,ii])+b*((1-a)*grid[jj,i]+a*grid[jj,ii]);
  end elevationAt;
  function localWaveElevation "Sample the incident sea plus the hull wave within a smooth radial window"
    input Real total[:,:],hull[:,:],point[2],drift[2],center[2],period;
    output Real elevation;
  protected
    Real radial,blend;
  algorithm
    radial:=sqrt((point-center)*(point-center))/period;
    blend:=min(1,max(0,(radial-.35)/.14));
    elevation:=elevationAt(total,point[1]-drift[1],point[2]-drift[2],period)
      -blend^2*(3-2*blend)*elevationAt(hull,point[1]-drift[1],point[2]-drift[2],period);
  end localWaveElevation;
  function roundingApproach "Approach/departure targets and current coordinates in the mark gate frame"
    input Real position[2],mark[2],incoming[2],outgoing[2];
    output Real approach[2],departure[2],gatePosition[2];
  protected Real away[2],tangent[2],relative[2];
  algorithm
    away:=2*mark-incoming-outgoing;away:=away/max(.01,sqrt(away*away));
    tangent:={-away[2],away[1]};relative:=position-mark;
    approach:=mark+10*away-9*tangent;departure:=mark+10*away+9*tangent;
    gatePosition:={relative*away,relative*tangent};
  end roundingApproach;
  function passedToPort "Cross the outside angle bisector counterclockwise"
    input Real previous[2],position[2],mark[2],incoming[2],outgoing[2],limit;
    output Boolean crossedGate;
  protected
    Real outside[2],before[2],after[2],oldSide,newSide,portion,distance;
  algorithm
    outside:=2*mark-incoming-outgoing;
    outside:=outside/max(1e-9,sqrt(outside*outside));
    before:=previous-mark;
    after:=position-mark;
    oldSide:=outside[1]*before[2]-outside[2]*before[1];
    newSide:=outside[1]*after[2]-outside[2]*after[1];
    crossedGate:=false;
    if oldSide<=0 and newSide>0 then
      portion:=-oldSide/(newSide-oldSide);
      distance:=outside*((1-portion)*before+portion*after);
      crossedGate:=distance>.70 and distance<=limit;
    end if;
  end passedToPort;
  function nearHullElevation "Sample the bound wake in the same coordinates as the water surface"
    input Real sources[14,6],pose[4],velocity[2],point[2];
    output Real elevation;
  protected
    Real relative[2];
  algorithm
    relative:=point-pose[1:2];
    elevation:=if (abs(pose[3])+abs(pose[4]))>.5 and relative*relative<3.8^2 then
      BowWavePatch.potentialHead(relative*pose[3:4],relative*{-pose[4],pose[3]},velocity,sources) else 0;
  end nearHullElevation;
  output Real countdown,nextStart "Seconds to the next signal, and that signal on the UTC clock";
  output Real pilotTarget[2] "Approach, round to port, and cross the finish";
  discrete output Integer stage(start=0,fixed=true) "0 prestart, 1 start open, 2/3 marks, 4 finish, 5 finished";
  discrete Boolean roundingReady(start=false,fixed=true);
  Real markApproach[2],markDeparture[2],markPosition[2];
  discrete output Real elapsed(start=0,fixed=true);
  discrete output Real lapTime(start=0,fixed=true) "Time from the boat crossing the start until it crosses the finish";
  discrete output Real earlyStart(start=0,fixed=true) "One when the whole hull must return to the prestart side";
  discrete output Real finishUtc(start=0,fixed=true);
  output Real heatStart "Scheduled start of the scored heat";
  discrete Real crossed(start=0,fixed=true);
  Real along,across,frontAlong,sternAlong;
  Real axes[3,3],projectedFore,projectedPort;
  discrete Real lastAcross(start=0,fixed=true),lastFront(start=0,fixed=true),lastStern(start=0,fixed=true),lastUtc(start=0,fixed=true);
  discrete Real heat(start=-1,fixed=true),started(start=0,fixed=true);
  discrete Boolean startReady(start=false,fixed=true);
  discrete Real lastPosition[2](each start=0,each fixed=true);
  Real fleetHeat;
  discrete Real startFraction,finishFraction,startedUtc,finishedUtc,lastSchedule(start=0,fixed=true);
  discrete Boolean startCross,finishCross,scheduleChanged;
equation
  committeeEast=gateEast+rightE*lineLength/2;
  committeeNorth=gateNorth+rightN*lineLength/2;
  launchPose={heave,roll,pitch};
  deckState={committeeEast,committeeNorth,heave,windBearing+3.141592653589793,roll,pitch,0,0,heaveRate,cos(windBearing+3.141592653589793)*cos(pitch)*rollRate+sin(windBearing+3.141592653589793)*pitchRate,sin(windBearing+3.141592653589793)*cos(pitch)*rollRate-cos(windBearing+3.141592653589793)*pitchRate,0+sin(pitch)*rollRate};
  buoyEast={pinEast,markEast[1],markEast[2]};buoyNorth={pinNorth,markNorth[1],markNorth[2]};
  markPose=buoyState;
  racerLoad={sum(markWrench[:,k]) for k in 1:6};
  // Contact shares the existing 20 Hz race clock and is held through the
  // integrator stages, including both sides of each action/reaction pair.
  when sample(0,.05) then
    markWrench=markContacts(east,north,racerState,hullStations,hullWidths,hullOffset,
      {gateEast-rightE*lineLength/2,gateEast+legLength*upE,gateEast+legLength*(upE/2-sqrt(3.0)*rightE/2)}+pre(markOffset[:,1]),
      {gateNorth-rightN*lineLength/2,gateNorth+legLength*upN,gateNorth+legLength*(upN/2-sqrt(3.0)*rightN/2)}+pre(markOffset[:,2]),
      buoyState,pre(markVelocity),buoySpeed);
    markVelocity=pre(markVelocity)+(.05/(1.5*pyramidMass))*(markWrench[:,7:8]-140*pre(markOffset)-95*pre(markVelocity));
    markOffset=pre(markOffset)+.05*markVelocity;

  end when;
  for b in 1:3 loop
    der(buoyState[b,:])=buoySpeed[b,:];
    for j in 1:3 loop
      depthAt[b,j]=max(0,min(pyramidHeight,pyramidDraft+(1-fraction)*lastBuoyWater[b,j]+fraction*buoyWater[b,j]
        -buoyState[b,1]-by[j]*sin(buoyState[b,2])-bx[j]*sin(buoyState[b,3])));
      buoyV[b,j]=buoySpeed[b,1]+by[j]*cos(buoyState[b,2])*buoySpeed[b,2]+bx[j]*cos(buoyState[b,3])*buoySpeed[b,3];
      buoyLift[b,j]=if depthAt[b,j]>0 then max(0,1025*9.80665*pyramidArea*pyramidHeight/9*
        (1-(1-depthAt[b,j]/pyramidHeight)^3)+120*((buoyWater[b,j]-lastBuoyWater[b,j])/.1-buoyV[b,j])) else 0;
    end for;
    pyramidMass*der(buoySpeed[b,1])=sum(buoyLift[b,:])-pyramidMass*9.80665+markWrench[b,9];
    (.40*pyramidMass)*der(buoySpeed[b,2])=cos(buoyState[b,3])*markWrench[b,10]+sin(buoyState[b,3])*markWrench[b,12]+cos(buoyState[b,2])*(by*buoyLift[b,:])-pyramidMass*9.80665*ballastDepth*sin(buoyState[b,2])-markRollDamping*buoySpeed[b,2];
    (.40*pyramidMass)*der(buoySpeed[b,3])=-markWrench[b,11]+cos(buoyState[b,3])*(bx*buoyLift[b,:])-pyramidMass*9.80665*ballastDepth*sin(buoyState[b,3])-markRollDamping*buoySpeed[b,3];
  end for;
  der(heave)=heaveRate; der(roll)=rollRate; der(pitch)=pitchRate;
  fraction=min(1,max(0,(time-stamp)/.1));
  for k in 1:4 loop
    stationE[k]=committeeEast+upE*stationX[k]-upN*stationY[k];
    stationN[k]=committeeNorth+upN*stationX[k]+upE*stationY[k];
    immersion[k]=draft+priorWater[k]*(1-fraction)+water[k]*fraction-heave
      -stationX[k]*sin(pitch)-stationY[k]*sin(roll)*cos(pitch);
    stationRate[k]=heaveRate+stationX[k]*cos(pitch)*pitchRate+stationY[k]*
      (cos(roll)*cos(pitch)*rollRate-sin(roll)*sin(pitch)*pitchRate);
    lift[k]=if immersion[k]>0 then max(0,1025*9.80665*waterplaneArea/4*min(.78,immersion[k])
      +1400*((water[k]-priorWater[k])/.1-stationRate[k])) else 0;
  end for;
  launchMass*der(heaveRate)=landingReaction[3]+sum(lift)-launchMass*9.80665;
  rollInertia*der(rollRate)=cos(windBearing+3.141592653589793)*landingReaction[4]+sin(windBearing+3.141592653589793)*landingReaction[5]+cos(roll)*cos(pitch)*(stationY*lift);
  pitchInertia*der(pitchRate)=sin(windBearing+3.141592653589793)*landingReaction[4]-cos(windBearing+3.141592653589793)*landingReaction[5]+cos(pitch)*(stationX*lift)-sin(roll)*sin(pitch)*(stationY*lift);
  when sample(0,.1) then
    for k in 1:4 loop
      water[k]=tide+elevationAt(backgroundTile,stationE[k],stationN[k],64)
        +localWaveElevation(wakeTile,hullWaveTile,{stationE[k],stationN[k]},{driftEast,driftNorth},{east,north},64)
        +nearHullElevation(bowSources,bowFrame,bowSpeed,{stationE[k],stationN[k]})
        +swellHeight*sin(swellK*(stationE[k]*cos(swellBearing)+stationN[k]*sin(swellBearing))-swellOmega*(time+seaClockOffset));
    end for;
    for b in 1:3 loop
      for j in 1:3 loop
        buoyWater[b,j]=tide+elevationAt(backgroundTile,buoyEast[b]+bx[j],buoyNorth[b]+by[j],64)
          +localWaveElevation(wakeTile,hullWaveTile,{buoyEast[b]+bx[j],buoyNorth[b]+by[j]},{driftEast,driftNorth},{east,north},64)
          +nearHullElevation(bowSources,bowFrame,bowSpeed,{buoyEast[b]+bx[j],buoyNorth[b]+by[j]})
          +swellHeight*sin(swellK*((buoyEast[b]+bx[j])*cos(swellBearing)+(buoyNorth[b]+by[j])*sin(swellBearing))-swellOmega*(time+seaClockOffset));
      end for;
    end for;
    lastBuoyWater=if initial() then buoyWater else pre(buoyWater);
    priorWater=if initial() then water else pre(water);
    stamp=time;
  end when;
  pinEast=markOffset[1,1]+gateEast-rightE*lineLength/2;
  pinNorth=markOffset[1,2]+gateNorth-rightN*lineLength/2;
  markEast=markOffset[2:3,1]+{gateEast+legLength*upE,gateEast+legLength*(upE/2-sqrt(3.0)*rightE/2)};
  markNorth=markOffset[2:3,2]+{gateNorth+legLength*upN,gateNorth+legLength*(upN/2-sqrt(3.0)*rightN/2)};
  along=(east-gateEast)*upE+(north-gateNorth)*upN;
  across=(east-gateEast)*rightE+(north-gateNorth)*rightN;
  axes=hullAxes(racerState[2],racerState[3],racerState[4]);
  projectedFore=axes[1,1]*upE+axes[1,2]*upN;
  projectedPort=axes[2,1]*upE+axes[2,2]*upN;
  frontAlong=along+(if racerState[1]>.5 then
    max({hullStations[i]*projectedFore+(hullOffset+hullWidths[i])*abs(projectedPort) for i in 1:7}) else 0);
  sternAlong=along+(if racerState[1]>.5 then
    min({hullStations[i]*projectedFore-(hullOffset+hullWidths[i])*abs(projectedPort) for i in 1:7}) else 0);
  (markApproach,markDeparture,markPosition)=roundingApproach({east,north},
    if stage==2 then {markEast[1],markNorth[1]} else {markEast[2],markNorth[2]},
    if stage==2 then {gateEast,gateNorth} else {markEast[1],markNorth[1]},
    if stage==2 then {markEast[2],markNorth[2]} else {gateEast,gateNorth});
  pilotTarget=if stage==2 or stage==3 then (if roundingReady then markDeparture else markApproach)
    else {gateEast,gateNorth}+{upE,upN}*(if stage==1 and earlyStart<.5 then 14
      elseif stage==4 and along<0 and abs(across)>lineLength*.4 then 15 else -14);
  fleetHeat=raceStart+floor((utc-raceStart)/300)*300;
  nextStart=if utc<raceStart then raceStart else fleetHeat+300;
  countdown=nextStart-utc;
  heatStart=if stage>=2 then started else max(raceStart,fleetHeat);
  when sample(0,.05) then
    lastSchedule=raceStart;
    scheduleChanged=abs(raceStart-pre(lastSchedule))>.5;
    startFraction=-pre(lastFront)/max(1e-8,frontAlong-pre(lastFront));
    finishFraction=pre(lastStern)/max(1e-8,pre(lastStern)-sternAlong);
    startedUtc=pre(lastUtc)+min(1,max(0,startFraction))*(utc-pre(lastUtc));
    finishedUtc=pre(lastUtc)+min(1,max(0,finishFraction))*(utc-pre(lastUtc));
    startCross=not initial() and pre(startReady) and pre(lastFront)<=0 and frontAlong>0
      and abs(pre(lastAcross)+startFraction*(across-pre(lastAcross)))<lineLength/2
      and startedUtc>=max(fleetHeat,raceStart);
    finishCross=not initial() and pre(lastStern)>=0 and sternAlong<0
      and abs(pre(lastAcross)+finishFraction*(across-pre(lastAcross)))<lineLength/2;
    heat=fleetHeat;
    stage=if scheduleChanged then (if utc<raceStart then 0 else 1)
          elseif utc<raceStart then 0
          elseif fleetHeat>pre(heat) and pre(heat)>=0 and (pre(stage)<=1 or pre(stage)==5) then (if startCross then 2 else 1)
          elseif pre(stage)==1 and startCross then 2
          elseif pre(stage)==2 and passedToPort(pre(lastPosition),{east,north},{markEast[1],markNorth[1]},
            {gateEast,gateNorth},{markEast[2],markNorth[2]},zone) then 3
          elseif pre(stage)==3 and passedToPort(pre(lastPosition),{east,north},{markEast[2],markNorth[2]},
            {markEast[1],markNorth[1]},{gateEast,gateNorth},zone) then 4
          elseif pre(stage)==5 and finishAllowed<.5 then 4
          elseif pre(stage)==4 and finishCross and finishAllowed>.5 then 5 else pre(stage);
    startReady=frontAlong<=0;
    earlyStart=if stage<2 and not startReady then 1 else 0;
    // Keep the departure target through the crossing. A miss outside the
    // scored segment sends the pilot back to the approach side for another try.
    roundingReady=if stage<>pre(stage) or (stage<>2 and stage<>3) then false
      elseif markPosition[2]<-2 and markPosition[1]>3 and markPosition[1]<zone-2 then true
      elseif markPosition[2]>1 and (markPosition[1]<.70 or markPosition[1]>zone) then false
      else pre(roundingReady);
    started=if stage==2 and pre(stage)<>2 then max(fleetHeat,raceStart) else pre(started);
    finishUtc=if stage<>5 then 0 elseif pre(stage)<>5 then finishedUtc else pre(finishUtc);
    elapsed=if stage==5 then finishUtc-started elseif stage>=2 then utc-started else 0;
    crossed=if scheduleChanged then 0 elseif stage==2 and pre(stage)<>2 then startedUtc else pre(crossed);
    lapTime=if stage==5 then finishUtc-crossed elseif stage>=2 then utc-crossed else 0;
    lastAcross=across;
    lastFront=frontAlong;
    lastStern=sternAlong;
    lastUtc=utc;
    lastPosition={east,north};
  end when;
end Regatta;
