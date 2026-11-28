model OceanWhaler "Driveable center-console outboard with the committee launch hull"
  extends OceanMission(race(racerState={1,yaw,roll,-pitch,z,der(east),der(north),yawRate,vertical,rollRate,-pitchRate},
    hullStations={-2.91,-2.59,-.65,0,1,2.10,2.98},hullWidths={.90,1.10,1.215,1.20,1.18,.84,.03}));
  // 2025 190 Montauk specification. Drag, added mass and propulsive efficiency are estimates.
  parameter Real mass=1256,waterplaneArea=7.6,shaftPower=112000;
  parameter Real initialEast=3,initialNorth=-15,initialHeading=1.5;
  final parameter Real draft=mass/(1025*waterplaneArea);
  final parameter Real stationX[4]={1.65,1.65,-1.65,-1.65},stationY[4]={.65,-.65,.65,-.65};
  final parameter Real hull[42,3]=Shore.committeeVertices();
  final parameter Integer hullFaces[80,3]=Shore.committeeFaces();

  input Real throttleLever(start=0),helmLever(start=0);
  output Real boatPose[6],engine[4] "ENU pose and rpm, through-water speed, thrust and outboard angle";
  output Real contactHull[42,3]=hull;
  output Integer contactFaces[80,3]=hullFaces;
  Real east(start=initialEast,fixed=true),north(start=initialNorth,fixed=true),z(start=.20,fixed=true);
  Real yaw(start=initialHeading,fixed=true),roll(start=0,fixed=true),pitch(start=0,fixed=true);
  Real surge(start=0,fixed=true),sway(start=0,fixed=true),vertical(start=0,fixed=true);
  Real yawRate(start=0,fixed=true),rollRate(start=0,fixed=true),pitchRate(start=0,fixed=true);
  Real rpm(start=0,fixed=true),steering(start=0,fixed=true);
  Real forward[2],port[2],slip[2],planing,thrust,throttle,stationHeight[4],stationRate[4],lift[4];
  Real rotation[3,3],wrench[6];
  discrete Real sea[4](each start=0,each fixed=true),previousSea[4](each start=0,each fixed=true);

  function groundLoad
    input Real pose[3],rotation[3,3],velocity[3],spin[3],vertices[42,3];
    output Real load[6];
  protected
    Real r[3],contact[5];
    Boolean candidates[46];
    Real upper,lowest;
  algorithm
    load:=zeros(6);
    lowest:=pose[3]-3*abs(rotation[3,1])-1.22*abs(rotation[3,2])-.3;
    if Shore.clearOfShore(pose[1],pose[2],lowest,3.3) then return;end if;
    (candidates,upper):=Shore.rockCandidates(pose,3.3);
    upper:=max(upper,Shore.sandHeightUpperBound(pose[1],pose[2],3.3));
    for i in 1:42 loop
      r:=rotation*vertices[i,:];
      if pose[3]+r[3]<=upper then
        contact:=Shore.skinContact(pose+r,1,0,velocity+cross(spin,r),280,candidates=candidates);
        load:=load+cat(1,contact[1:3],cross(r,contact[1:3]));
      end if;
    end for;
  end groundLoad;

equation
  focus={east,north,z};
  committeeLoad=zeros(6);
  forward={cos(yaw),sin(yaw)};
  port={-sin(yaw),cos(yaw)};
  der(east)=surge*forward[1]+sway*port[1];
  der(north)=surge*forward[2]+sway*port[2];
  der(z)=vertical;
  der(roll)=rollRate;
  der(pitch)=pitchRate;
  der(yaw)=yawRate;
  rotation=transpose(RegattaBase.hullAxes(yaw,roll,pitch));
  slip={surge-forward*boatWater.meanFlow[1:2],sway-port*boatWater.meanFlow[1:2]};
  throttle=max(-1,min(1,throttleLever));
  der(rpm)=3*((if abs(throttle)>.008 then 720+5280*abs(throttle) else 0)-rpm);
  der(steering)=7*(.55*max(-1,min(1,helmLever))-steering);
  thrust=(if throttle>=0 then 1 else -.52)*max(0,(rpm-720)/5280)^2*
    min(4700,.56*shaftPower/max(4,abs(slip[1])));
  planing=min(.22,max(0,slip[1]-4)*.022);
  wrench=noEvent(groundLoad(focus,rotation,{der(east),der(north),vertical},
    {rollRate*forward[1]+pitchRate*port[1],rollRate*forward[2]+pitchRate*port[2],yawRate},hull));
  for i in 1:4 loop
    stationHeight[i]=z+stationY[i]*sin(roll)-stationX[i]*sin(pitch);
    stationRate[i]=vertical+stationY[i]*cos(roll)*rollRate-stationX[i]*cos(pitch)*pitchRate;
    lift[i]=noEvent(max(0,1025*9.80665*waterplaneArea/4*
      min(.70,draft+planing+(1-waterFraction)*previousSea[i]+waterFraction*sea[i]-stationHeight[i])
      +1300*((sea[i]-previousSea[i])/.1-stationRate[i])));
  end for;
  1450*der(surge)=thrust*cos(steering)-(.65+abs(slip[1]))*(75+16*exp(-((abs(slip[1])-4)/2)^2))*slip[1]
    +1450*sway*yawRate+forward*wrench[1:2];
  1750*der(sway)=-thrust*sin(steering)-(420+590*abs(slip[2])+175*abs(slip[1]))*slip[2]
    -1750*surge*yawRate+port*wrench[1:2];
  1750*der(vertical)=sum(lift)-mass*9.80665+wrench[3];
  670*der(rollRate)=stationY*lift-700*rollRate-500*surge*yawRate+forward*wrench[4:5];
  3100*der(pitchRate)=-stationX*lift-1900*pitchRate+.34*thrust+port*wrench[4:5];
  2350*der(yawRate)=3.15*thrust*sin(steering)-(880+300*abs(slip[1])+430*abs(yawRate))*yawRate+wrench[6];

  when sample(0,.1) then
    for i in 1:4 loop
      sea[i]=boatWater.tide+Wreck.Perception.seaHeight(boatWater.tile,east+stationX[i]*forward[1]+stationY[i]*port[1],
        north+stationX[i]*forward[2]+stationY[i]*port[2])+swell[1]*sin(swell[2]+
        (east+stationX[i]*forward[1]+stationY[i]*port[1])*swell[3]+(north+stationX[i]*forward[2]+stationY[i]*port[2])*swell[4]);
    end for;
    previousSea=if initial() then sea else pre(sea);
  end when;

  boatPose={east,north,z,roll,pitch,yaw};
  engine={rpm,sqrt(slip*slip),thrust,steering};
end OceanWhaler;
