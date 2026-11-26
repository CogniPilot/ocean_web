within Wreck;
package SurveyRoute "Local ENU inspection circuits around the two surveyed wrecks"
  constant Integer stations=8;
  // Clockwise from the south approach. The stern pass overlooks the open cabin.
  constant Real yatush[stations,3]=[-24,21.4,-10.1; -30,21.4,-10.1;
    -34.5,24,-9.5; -34.5,29,-9.5; -26,31,-9.3; -17,31,-9.3;
    -13.5,27,-9.2; -14,21,-9.6];
  // From the southern flank, round the bow, pass the bridge and circle the aft well.
  constant Real satil[stations,3]=[56,-57,-8.5; 74,-57,-8.4;
    81,-53,-8; 81,-46,-7.4; 72,-43,-7.8; 42,-43,-7.8;
    30.5,-46,-8.2; 31,-56,-8.5];

  function nearestSite
    input Real east,north;
    output Integer site;
  algorithm
    site:=if (east+24)^2+(north-26)^2 <= (east-56)^2+(north+50)^2 then 1 else 2;
  end nearestSite;

  function station
    input Integer site,index;
    output Real point[3];
  algorithm
    if site==2 then
      point:=satil[index,:];
    else
      point:=yatush[index,:];
    end if;
  end station;

  function nearestStation
    input Integer site;
    input Real east,north;
    output Integer index;
  protected
    Real best,d,p[3];
  algorithm
    index:=1;
    best:=Modelica.Constants.inf;
    for i in 1:stations loop
      p:=station(site,i);
      d:=(p[1]-east)^2+(p[2]-north)^2;
      if d<best then
        best:=d;
        index:=i;
      end if;
    end for;
  end nearestStation;
  function advance
    input Integer lastSite,lastStart,lastWaypoint;
    input Boolean lastDone,wasActive,active;
    input Real lastEntryEast,lastEntryNorth,east,north,estimatedEast,estimatedNorth,depth;
    output Integer site,start,waypoint;
    output Boolean done;
    output Real entryEast,entryNorth;
  algorithm
    site:=lastSite;
    start:=lastStart;
    waypoint:=lastWaypoint;
    done:=lastDone;
    entryEast:=lastEntryEast;
    entryNorth:=lastEntryNorth;
    if active and not wasActive then
      site:=nearestSite(east,north);
      if site<>lastSite or lastDone then
        start:=nearestStation(site,east,north);
        waypoint:=1;
        done:=false;
        entryEast:=east;
        entryNorth:=north;
      end if;
    elseif active and not done and Wreck.stationReached(
        station(site,1+mod(start+waypoint-2,stations)),estimatedEast,estimatedNorth,depth) then
      if waypoint<stations+1 then
        waypoint:=waypoint+1;
      else
        done:=true;
      end if;
    end if;
  end advance;
end SurveyRoute;
