model Regatta "Five-minute fleet starts and an equilateral triangular course"
  input Real utc "Unix seconds from the browser clock";
  input Real east,north;
  parameter Real windBearing=atan2(4,10) "Direction the prevailing wind travels, counterclockwise from east";
  parameter Real gateEast=-10,gateNorth=-6.5,lineLength=40,legLength=200,zone=2.5;
  final parameter Real upE=-cos(windBearing),upN=-sin(windBearing);
  final parameter Real rightE=upN,rightN=-upE "Starboard when facing the wind";
  output Real pinEast,pinNorth,committeeEast,committeeNorth,markEast[2],markNorth[2];
  output Real countdown;
  discrete output Integer stage(start=0,fixed=true) "0 prestart, 1 start open, 2/3 marks, 4 finish, 5 finished";
  discrete output Real elapsed(start=0,fixed=true);
  Real along,across;
  discrete Real lastAlong(start=0,fixed=true),lastAcross(start=0,fixed=true),heat(start=-1,fixed=true),started(start=0,fixed=true);
  discrete Real boundary,crossingAt;
  discrete Boolean onLine,startCross,finishCross;
equation
  committeeEast=gateEast+rightE*lineLength/2;
  committeeNorth=gateNorth+rightN*lineLength/2;
  pinEast=gateEast-rightE*lineLength/2;
  pinNorth=gateNorth-rightN*lineLength/2;
  markEast={gateEast+legLength*upE,gateEast+legLength*(upE/2-sqrt(3.0)*rightE/2)};
  markNorth={gateNorth+legLength*upN,gateNorth+legLength*(upN/2-sqrt(3.0)*rightN/2)};
  along=(east-gateEast)*upE+(north-gateNorth)*upN;
  across=(east-gateEast)*rightE+(north-gateNorth)*rightN;
  countdown=300-mod(utc,300);
  when sample(0,.05) then
    boundary=floor(utc/300)*300;
    crossingAt=pre(lastAcross)+(across-pre(lastAcross))*(-pre(lastAlong))/(if abs(along-pre(lastAlong))>1e-8 then along-pre(lastAlong) else 1);
    onLine=abs(crossingAt)<lineLength/2;
    startCross=onLine and pre(lastAlong)<=0 and along>0;
    finishCross=onLine and pre(lastAlong)>=0 and along<0;
    heat=boundary;
    stage=if boundary>pre(heat) and pre(heat)>=0 and (pre(stage)<=1 or pre(stage)==5) then (if startCross then 2 else 1)
          elseif pre(stage)==1 and startCross then 2
          elseif pre(stage)==2 and (east-markEast[1])^2+(north-markNorth[1])^2<zone^2 then 3
          elseif pre(stage)==3 and (east-markEast[2])^2+(north-markNorth[2])^2<zone^2 then 4
          elseif pre(stage)==4 and finishCross then 5 else pre(stage);
    started=if boundary>pre(heat) and (pre(stage)<=1 or pre(stage)==5) then boundary else pre(started);
    elapsed=if stage>=2 and pre(stage)<>5 then utc-started elseif stage==5 then pre(elapsed) else 0;
    lastAlong=along;
    lastAcross=across;
  end when;
end Regatta;
