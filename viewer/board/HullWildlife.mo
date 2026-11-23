model HullWildlife "Standalone boat adapter for the world component's contact law"
  input Real traffic[10,9],pose[6],velocity[3],hullClass;
  input Real articulation[10,4]=zeros(10,4);
  output Real wrench[6];
equation
  wrench=WildlifeContact(zeros(2,6),pose,velocity,if hullClass>2.5 then 3250 elseif hullClass<1.5 then 265 else 64,
    if hullClass>2.5 then 7.6 elseif hullClass<1.5 then 5.04 else 2.32,if hullClass>2.5 then 1.22 elseif hullClass<1.5 then .18 else .33,
    if hullClass<1.5 then 1.02 else 0,if hullClass>2.5 then .58 elseif hullClass<1.5 then .25 else .28,traffic,articulation);
end HullWildlife;
