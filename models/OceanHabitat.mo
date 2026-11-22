model OceanHabitat "Shared sea and weather for a wildlife player"
  extends OceanMission;
  input Real animalPosition[3](start={-5,0,0}) "ENU position of the local swimmer";
equation
  focus=animalPosition;
  committeeLoad=zeros(6);
end OceanHabitat;
