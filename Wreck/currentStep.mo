within Wreck;
function currentStep "5 Hz current filter from bottom track, IMU, rotor thrust and submerged drag"
  input Real prior[19] "ENU flow, row-major covariance, previous ENU ground velocity and thrust, previous observation valid";
  input Boolean observe,attached;
  input Real angles[3] "Estimated roll, pitch, yaw, radians";
  input Real groundVelocity[3],gyro[3],specificForce[3],thrust[3] "DVL body velocity, gyro, accelerometer, thrust estimate in body FLU";
  input Real mass,displaced,added[3],quadratic[3],linear;
  output Real state[19];
protected
  constant Real dt=.2;
  Real cr,sr,cp,sp,cy,sy,bodyFromEarth[3,3],worldVelocity[3],worldThrust[3],up[3],accDvl[3],accImu[3],acc[3];
  Real c[3],P[3,3],rel[3],target[3],rotDrag[3],H[3],PH[3],innovation,S,noise,turn[3,3],force[3],speedChange;
algorithm
  cr:=cos(angles[1]);sr:=sin(angles[1]);cp:=cos(angles[2]);sp:=sin(angles[2]);cy:=cos(angles[3]);sy:=sin(angles[3]);
  bodyFromEarth:=[cp*cy,cp*sy,-sp;
    sr*sp*cy-cr*sy,sr*sp*sy+cr*cy,sr*cp;
    cr*sp*cy+sr*sy,cr*sp*sy-sr*cy,cr*cp];
  up:=bodyFromEarth[:,3];
  worldVelocity:=transpose(bodyFromEarth)*groundVelocity;
  worldThrust:=transpose(bodyFromEarth)*thrust;
  state:=prior;
  c:=prior[1:3]; P:=zeros(3,3);
  for j in 1:3 loop
    for k in 1:3 loop
      P[j,k]:=prior[3+3*(j-1)+k];
    end for;
    P[j,j]:=min(1,P[j,j]+.00018);
  end for;
  if attached then
    c:=zeros(3);P:=.36*identity(3);
  elseif observe and prior[19]>.5 then
    // A bottom-track finite difference measures acceleration without conflating
    // gravity and tilt. The accelerometer contributes a bounded correction.
    accDvl:=bodyFromEarth*((worldVelocity-prior[13:15])/dt);
    accImu:=specificForce-g*up;
    for j in 1:3 loop
      acc[j]:=accDvl[j]+.20*max(-.15,min(.15,accImu[j]-accDvl[j]));
    end for;
    force:=bodyFromEarth*(.5*(worldThrust+prior[16:18]));
    target:=force+(rho*displaced-mass)*g*up-(fill(mass,3)+added).*acc;
    turn:=[0,-gyro[3],gyro[2];gyro[3],0,-gyro[1];-gyro[2],gyro[1],0];
    // Force uncertainty rises during rapid thrust changes and attitude motion.
    speedChange:=sqrt((worldVelocity-prior[13:15])*(worldVelocity-prior[13:15]));
    noise:=1.1+.4*sqrt(gyro*gyro)+.16*sqrt((worldThrust-prior[16:18])*(worldThrust-prior[16:18]));
    if speedChange<.65 then
      for j in 1:3 loop
        rel:=groundVelocity-bodyFromEarth*c;
        rotDrag:=cross(gyro,added.*rel);
        innovation:=target[j]-(linear+quadratic[j]*abs(rel[j]))*rel[j]-rotDrag[j];
        H:=-(linear+2*quadratic[j]*abs(rel[j]))*bodyFromEarth[j,:]
          -transpose(bodyFromEarth)*(turn[j,:].*added);
        PH:=P*H;
        S:=noise^2+H*PH;
        // Reject sudden contact outliers smoothly without teaching them as flow.
        if abs(innovation)<4*sqrt(S) then
          c:=c+PH*(innovation/S);
          for a in 1:3 loop
            for b in 1:3 loop
              P[a,b]:=P[a,b]-PH[a]*PH[b]/S;
            end for;
          end for;
        end if;
      end for;
    end if;
  end if;
  state[1:3]:=c;
  for j in 1:3 loop
    for k in 1:3 loop
      state[3+3*(j-1)+k]:=P[j,k];
    end for;
  end for;
  state[13:15]:=worldVelocity;state[16:18]:=worldThrust;
  state[19]:=if observe and not attached then 1 else 0;
end currentStep;
