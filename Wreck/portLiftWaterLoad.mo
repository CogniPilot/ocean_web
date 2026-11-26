within Wreck;
function portLiftWaterLoad "Distributed drag on the lift hardware, including the empty carriage"
  input Real boxes[PortLift.count,15] "Unarticulated lift geometry";
  input Real level,rate "Fraction of travel and fraction per second";
  input Real origin[3],R[3,3],velocity[3],omega[3] "Body to ENU rotation and ENU twist";
  input Real waterline "Local water elevation at the lift in ENU";
  input Real waterVelocity[3] "Local current plus incident swell orbital velocity in ENU";
  input Real dragCoefficient,forkExposure;
  output Real wrench[6] "Force and moment in ENU about the cruiser origin";
protected
  Real motion[6],box[15],r[3],halfSize[3],axes[3,3],rel[3],speed[3],area[3],f[3],wet,depth,span[3],extent,signZ;
  Integer longest;
algorithm
  wrench:=zeros(6);
  motion:=PortLift.motion(level);
  // The flexible winch line has its own load. The fixed swim platform belongs to the hull.
  for i in 1:14 loop
    box:=PortLift.transformBox(i,boxes[i,:],motion);
    r:=R*box[1:3];
    axes:=R*transpose({box[7:9],box[10:12],box[13:15]});
    halfSize:=box[4:6];
    span:=abs(axes[3,:]).*halfSize;
    extent:=sum(span);
    depth:=waterline-origin[3]-r[3];
    wet:=max(0,min(1,.5+.5*depth/max(1e-6,extent)));
    if wet>0 then
      // Move the centre of pressure down the dominant immersed dimension.
      longest:=if span[1]>span[2] and span[1]>span[3] then 1 elseif span[2]>span[3] then 2 else 3;
      signZ:=if axes[3,longest]>=0 then 1 else -1;
      r:=r-(1-wet)*signZ*halfSize[longest]*axes[:,longest];
      rel:=velocity+cross(omega,r)-waterVelocity;
      rel:=rel+R*PortLift.pointVelocity(i,motion,rate,transpose(R)*r);
      speed:=transpose(axes)*rel;
      area:=4*{halfSize[2]*halfSize[3],halfSize[1]*halfSize[3],halfSize[1]*halfSize[2]};
      f:=axes*(-.5*rho*dragCoefficient*wet*(area.*abs(speed).*speed));
      wrench:=wrench+cat(1,f,cross(r,f));
    end if;
  end for;
end portLiftWaterLoad;
