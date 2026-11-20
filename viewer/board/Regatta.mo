model Regatta "Fleet starts on five-minute UTC boundaries and sails two marks and a finish"
  input Real utc "Unix seconds from the browser clock";
  input Real east,north;
  parameter Real gateEast=-10,pinNorth=-13,committeeNorth=0;
  parameter Real markEast[2]={-32,-15},markNorth[2]={-18,9},zone=2.5;
  output Real countdown;
  discrete output Integer stage(start=0,fixed=true) "0 prestart, 1 start open, 2/3 marks, 4 finish, 5 finished";
  discrete output Real elapsed(start=0,fixed=true);
  discrete Real lastEast(start=-8,fixed=true),lastNorth(start=-7,fixed=true),heat(start=-1,fixed=true),started(start=0,fixed=true);
  discrete Real boundary, crossingNorth;
  discrete Boolean crossing;
equation
  countdown=300-mod(utc,300);
  when sample(0,.05) then
    boundary=floor(utc/300)*300;
    crossingNorth=pre(lastNorth)+(north-pre(lastNorth))*(gateEast-pre(lastEast))/(if abs(east-pre(lastEast))>1e-8 then east-pre(lastEast) else 1);
    crossing=pre(lastEast)>=gateEast and east<gateEast and crossingNorth>pinNorth and crossingNorth<committeeNorth;
    heat=boundary;
    stage=if boundary>pre(heat) and pre(heat)>=0 and (pre(stage)<=1 or pre(stage)==5) then (if crossing then 2 else 1)
          elseif pre(stage)==1 and crossing then 2
          elseif pre(stage)==2 and (east-markEast[1])^2+(north-markNorth[1])^2<zone^2 then 3
          elseif pre(stage)==3 and (east-markEast[2])^2+(north-markNorth[2])^2<zone^2 then 4
          elseif pre(stage)==4 and crossing then 5 else pre(stage);
    started=if stage<=2 and pre(stage)<=1 and boundary>pre(heat) then boundary else pre(started);
    elapsed=if stage>=2 and pre(stage)<>5 then utc-started elseif stage==5 then pre(elapsed) else 0;
    lastEast=east;
    lastNorth=north;
  end when;
end Regatta;
