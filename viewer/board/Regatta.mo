model Regatta "Five-minute fleet starts and an equilateral triangular course"
  input Real utc "Unix seconds from the browser clock";
  input Real east,north;
  parameter Real windBearing=atan2(4,10) "Direction the prevailing wind travels, counterclockwise from east";
  parameter Real gateEast=-10,gateNorth=-6.5,lineLength=40,legLength=200,zone=2.5;
  final parameter Real upE=-cos(windBearing),upN=-sin(windBearing);
  final parameter Real rightE=upN,rightN=-upE "Starboard when facing the wind";
  output Real pinEast,pinNorth,committeeEast,committeeNorth,markEast[2],markNorth[2];
  input Real wakeTile[64,64],backgroundTile[32,32],driftEast,driftNorth,tide,swellHeight;
  input Real seaClockOffset=0 "Seconds added to local time for incident sea phase";
  parameter Real swellK=.34,swellBearing=1.04159;
  parameter Real launchMass=1150,waterplaneArea=7.2,rollInertia=650,pitchInertia=3100;
  final parameter Real stationX[4]={1.65,1.65,-1.65,-1.65},stationY[4]={.65,-.65,.65,-.65};
  final parameter Real draft=launchMass/(1025*waterplaneArea);
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
  output Real countdown;
  discrete output Integer stage(start=0,fixed=true) "0 prestart, 1 start open, 2/3 marks, 4 finish, 5 finished";
  discrete output Real elapsed(start=0,fixed=true);
  discrete output Real lapTime(start=0,fixed=true) "Time from the boat crossing the start until it crosses the finish";
  discrete Real crossed(start=0,fixed=true);
  Real along,across;
  discrete Real lastAlong(start=0,fixed=true),lastAcross(start=0,fixed=true),heat(start=-1,fixed=true),started(start=0,fixed=true);
  discrete Real boundary,crossingAt;
  discrete Boolean onLine,startCross,finishCross;
equation
  committeeEast=gateEast+rightE*lineLength/2;
  committeeNorth=gateNorth+rightN*lineLength/2;
  launchPose={heave,roll,pitch};
  deckState={committeeEast,committeeNorth,heave,windBearing+3.141592653589793,roll,pitch,0,0,heaveRate,cos(windBearing+3.141592653589793)*cos(pitch)*rollRate+sin(windBearing+3.141592653589793)*pitchRate,sin(windBearing+3.141592653589793)*cos(pitch)*rollRate-cos(windBearing+3.141592653589793)*pitchRate,0+sin(pitch)*rollRate};
  buoyEast={pinEast,markEast[1],markEast[2]};buoyNorth={pinNorth,markNorth[1],markNorth[2]};
  markPose=buoyState;
  for b in 1:3 loop
    der(buoyState[b,:])=buoySpeed[b,:];
    for j in 1:3 loop
      depthAt[b,j]=max(0,min(pyramidHeight,pyramidDraft+(1-fraction)*lastBuoyWater[b,j]+fraction*buoyWater[b,j]
        -buoyState[b,1]-by[j]*sin(buoyState[b,2])-bx[j]*sin(buoyState[b,3])));
      buoyV[b,j]=buoySpeed[b,1]+by[j]*cos(buoyState[b,2])*buoySpeed[b,2]+bx[j]*cos(buoyState[b,3])*buoySpeed[b,3];
      buoyLift[b,j]=if depthAt[b,j]>0 then max(0,1025*9.80665*pyramidArea*pyramidHeight/9*
        (1-(1-depthAt[b,j]/pyramidHeight)^3)+120*((buoyWater[b,j]-lastBuoyWater[b,j])/.1-buoyV[b,j])) else 0;
    end for;
    pyramidMass*der(buoySpeed[b,1])=sum(buoyLift[b,:])-pyramidMass*9.80665;
    (.40*pyramidMass)*der(buoySpeed[b,2])=cos(buoyState[b,2])*(by*buoyLift[b,:])-pyramidMass*9.80665*ballastDepth*sin(buoyState[b,2])-markRollDamping*buoySpeed[b,2];
    (.40*pyramidMass)*der(buoySpeed[b,3])=cos(buoyState[b,3])*(bx*buoyLift[b,:])-pyramidMass*9.80665*ballastDepth*sin(buoyState[b,3])-markRollDamping*buoySpeed[b,3];
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
        +elevationAt(wakeTile,stationE[k]-driftEast,stationN[k]-driftNorth,64)
        +swellHeight*sin(swellK*(stationE[k]*cos(swellBearing)+stationN[k]*sin(swellBearing))-sqrt(9.80665*swellK)*(time+seaClockOffset));
    end for;
    for b in 1:3 loop
      for j in 1:3 loop
        buoyWater[b,j]=tide+elevationAt(backgroundTile,buoyEast[b]+bx[j],buoyNorth[b]+by[j],64)
          +elevationAt(wakeTile,buoyEast[b]+bx[j]-driftEast,buoyNorth[b]+by[j]-driftNorth,64)
          +swellHeight*sin(swellK*((buoyEast[b]+bx[j])*cos(swellBearing)+(buoyNorth[b]+by[j])*sin(swellBearing))-sqrt(9.80665*swellK)*(time+seaClockOffset));
      end for;
    end for;
    lastBuoyWater=if initial() then buoyWater else pre(buoyWater);
    priorWater=if initial() then water else pre(water);
    stamp=time;
  end when;
  pinEast=gateEast-rightE*lineLength/2;
  pinNorth=gateNorth-rightN*lineLength/2;
  markEast={gateEast+legLength*upE,gateEast+legLength*(upE/2-sqrt(3.0)*rightE/2)};
  markNorth={gateNorth+legLength*upN,gateNorth+legLength*(upN/2-sqrt(3.0)*rightN/2)};
  along=(east-gateEast)*upE+(north-gateNorth)*upN;
  across=(east-gateEast)*rightE+(north-gateNorth)*rightN;
  countdown=300-mod(utc,300);
  when sample(0,.05) then
    boundary=floor(utc/300)*300;
    crossingAt=pre(lastAcross)+(across-pre(lastAcross))*(-pre(lastAlong))/(if abs(along-pre(lastAlong))>1e-8 then along-pre(lastAlong) else 1);
    onLine=abs(crossingAt)<lineLength/2;
    startCross=onLine and pre(lastAlong)<=0 and along>0;
    finishCross=onLine and pre(lastAlong)>=0 and along<0;
    heat=boundary;
    stage=if boundary>pre(heat) and pre(heat)>=0 and (pre(stage)<=1 or pre(stage)==5) then (if startCross then 2 else 1)
          elseif pre(stage)==1 and startCross then 2
          elseif pre(stage)==2 and (east-markEast[1])^2+(north-markNorth[1])^2<zone^2 then 3
          elseif pre(stage)==3 and (east-markEast[2])^2+(north-markNorth[2])^2<zone^2 then 4
          elseif pre(stage)==4 and finishCross then 5 else pre(stage);
    started=if boundary>pre(heat) and (pre(stage)<=1 or pre(stage)==5) then boundary else pre(started);
    elapsed=if stage>=2 and pre(stage)<>5 then utc-started elseif stage==5 then pre(elapsed) else 0;
    crossed=if stage==2 and pre(stage)<>2 then utc else pre(crossed);
    lapTime=if stage>=2 and pre(stage)<>5 then utc-crossed elseif stage==5 then pre(lapTime) else 0;
    lastAlong=along;
    lastAcross=across;
  end when;
end Regatta;
