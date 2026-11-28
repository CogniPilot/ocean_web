model TwinSterndrive "Steerable twin propeller disks with a shaft-power limit"
  parameter Real diameter=.40,halfSpacing=.58,transomX=-3.74,shaftZ=-.84;
  parameter Real shaftPower=224000 "Rated shaft power per drive [W]";
  input Real rpm,helm,surge,focus[3],yaw,rotation[3,3],tile[32,32],tide,swell[4];
  output Real steering(start=0,fixed=true),wetFraction,thrust;
  output Real force[3],moment[3],centres[2,3],loads[2,6],diskInduction;
protected
  Real axis[3],worldArm[2,3],forces[2,3],moments[2,3],depth[2],wet[2],diskPosition[2],driveThrust[2];
  Real thrustLimit,diskHeight,driveRate;
equation
  der(steering)=noEvent(max(-.85,min(.85,(-.52*max(-1,min(1,helm))-steering)/.18)));
  axis={cos(steering),sin(steering),0};
  diskHeight=.5*diameter*sqrt(max(.01,1-(rotation[3,:]*axis)^2));
  driveRate=abs(rpm)/2900;
  thrustLimit=min(16200*driveRate^2,.56*shaftPower*driveRate^3/max(4,abs(surge)));
  for i in 1:2 loop
    centres[i,:]={transomX,halfSpacing*(3-2*i),shaftZ}-.37*axis;
    worldArm[i,:]=[cos(yaw),-sin(yaw),0;sin(yaw),cos(yaw),0;0,0,1]*rotation*centres[i,:];
    depth[i]=tide+Wreck.Perception.seaHeight(tile,focus[1]+worldArm[i,1],focus[2]+worldArm[i,2])
      +swell[1]*sin(swell[2]+(focus[1]+worldArm[i,1])*swell[3]+(focus[2]+worldArm[i,2])*swell[4])-focus[3]-worldArm[i,3];
    diskPosition[i]=noEvent(max(-1,min(1,depth[i]/diskHeight)));
    wet[i]=.5+(asin(diskPosition[i])+diskPosition[i]*sqrt(max(0,1-diskPosition[i]^2)))/Modelica.Constants.pi;
    driveThrust[i]=noEvent(if rpm<0 then -.55 else 1)*thrustLimit*wet[i];
    forces[i,:]=axis*driveThrust[i];
    moments[i,:]=cross(centres[i,:],forces[i,:]);
    loads[i,:]=cat(1,centres[i,:],forces[i,:]);
  end for;
  force={sum(forces[:,1]),sum(forces[:,2]),sum(forces[:,3])};
  moment={sum(moments[:,1]),sum(moments[:,2]),sum(moments[:,3])};
  thrust=sum(driveThrust);
  wetFraction=.5*sum(wet);
  diskInduction=sqrt(.25*max(0,surge)^2+max(0,thrust)/(1025*Modelica.Constants.pi*diameter^2))-.5*max(0,surge);
end TwinSterndrive;
