model AirflowProbe "On-demand samples of the same air wakes used by the vehicle plants"
  final parameter Integer count=35;
  input Real mode "0 sail shadow, 1 rotor wash";
  input Real points[count,3],ambient[3];
  input Real sailTraffic[10,9],rotorTraffic[4,12];
  input Real rotorHubs[4,3],rotorParameters[4] "Thrust coefficient, hover speed, maximum speed and disk radius";
  output Real velocity[count,3];
  function sampleField
    input Real mode,points[:,3],ambient[3],sailTraffic[10,9],rotorTraffic[4,12],rotorHubs[4,3],rotorParameters[4];
    output Real velocity[size(points,1),3];
  protected
    Real wash[3],unusedWrench[6];
  algorithm
    for i in 1:size(points,1) loop
      if mode>.5 then
        (wash,unusedWrench):=Rdd2Survey.rotorWake(points[i,:],{1,0,0,0},zeros(4),ambient,
          rotorTraffic,rotorHubs,rotorParameters[1],rotorParameters[2],rotorParameters[3],rotorParameters[4],0);
        velocity[i,:]:=ambient+wash;
      else
        velocity[i,:]:=cat(1,Sailboat.shadowWind(points[i,1],points[i,2],points[i,3],0,ambient[1],ambient[2],sailTraffic),{ambient[3]});
      end if;
    end for;
  end sampleField;
equation
  velocity=sampleField(mode,points,ambient,sailTraffic,rotorTraffic,rotorHubs,rotorParameters);
end AirflowProbe;
