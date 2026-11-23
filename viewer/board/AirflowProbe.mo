model AirflowProbe "On-demand samples of the same air wakes used by the vehicle plants"
  final parameter Integer count=343;
  input Real mode "0 sail shadow, 1 rotor wash";
  input Real points[count,3],ambient[3];
  input Real sailTraffic[10,9],rotorTraffic[4,12];
  input Real localRotor[12] "Additional diagnostic source at the inspected aircraft";
  input Real rotorHubs[4,3],rotorParameters[4] "Thrust coefficient, hover speed, maximum speed and disk radius";
  output Real velocity[count,3];
  output Real localRotorThrust "Total rotor thrust estimated from the local rotor speeds [N]";
  function sampleField
    input Real mode,points[:,3],ambient[3],sailTraffic[10,9],rotorTraffic[4,12],rotorHubs[4,3],rotorParameters[4],localRotor[12];
    output Real velocity[size(points,1),3];
  protected
    Real wash[3],localWash[3],unusedWrench[6],localTraffic[4,12];
  algorithm
    velocity:=zeros(size(points,1),3);
    localTraffic:=zeros(4,12);
    localTraffic[1,:]:=localRotor;
    for i in 1:(if mode>.5 then size(points,1) else min(175,size(points,1))) loop
      if mode>.5 then
        (wash,unusedWrench):=Rdd2Survey.rotorWake(points[i,:],{1,0,0,0},zeros(4),ambient,
          rotorTraffic,rotorHubs,rotorParameters[1],rotorParameters[2],rotorParameters[3],rotorParameters[4],0);
        if localRotor[1]>.5 then
          (localWash,unusedWrench):=Rdd2Survey.rotorWake(points[i,:],{1,0,0,0},zeros(4),ambient,
            localTraffic,rotorHubs,rotorParameters[1],rotorParameters[2],rotorParameters[3],rotorParameters[4],0);
          wash:=wash+localWash;
        end if;
        velocity[i,:]:=ambient+wash;
      else
        velocity[i,:]:=cat(1,Sailboat.shadowWind(points[i,1],points[i,2],points[i,3],0,ambient[1],ambient[2],sailTraffic),{ambient[3]});
      end if;
    end for;
  end sampleField;
equation
  velocity=sampleField(mode,points,ambient,sailTraffic,rotorTraffic,rotorHubs,rotorParameters,localRotor);
  localRotorThrust=localRotor[1]*rotorParameters[1]*
    sum(min(rotorParameters[3],max(0,localRotor[i]))^2 for i in 9:12);
end AirflowProbe;
