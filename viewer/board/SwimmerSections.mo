function SwimmerSections "Displaced near-surface volume and waterline contact of the torso, fins and tail"
  input Boolean whale;
  input Real pose[6] "East, north, height, yaw, pitch, roll";
  input Real water[3] "Incident surface elevation and east/north slopes at body origin";
  input Real tail,port,starboard,bodyVolumes[6];
  output Real stations[12,5];
protected
  constant Real bodyX[6]={-2,-.9,.2,1.3,2.4,3.45},r[6]={.60,.93,1.06,1,.76,.45};
  constant Real shark[10,6]=[.92,0,-.11,.17,.19,.043;.43,0,-.13,.29,.27,.096;-.10,0,-.12,.28,.25,.085;-.59,0,-.10,.17,.15,.029;-1.01,0,-.11,.07,.10,.006;.03,0,.30,.21,.105,.009;-1.39,0,.16,.25,.09,.004;-.75,0,.04,.06,.075,.001;.19,.45,-.28,.06,.13,.006;.19,-.45,-.28,.06,.13,.006];
  Real point[6],side,z,fore,e,n,depth,wet,signSide;
algorithm
  stations:=zeros(12,5);
  for i in 1:12 loop
    if whale or i<=10 then
      if whale then
        signSide:=if mod(i,2)==0 then -1 else 1;
        if i<=6 then point:={bodyX[i],0,.05,r[i],r[i],0};
        elseif i==7 then point:={-2.5,0,.98,.27,.24,.048};
        elseif i<=9 then point:={.25,signSide*2.07,-.88-.32*sin(if i==9 then port else starboard),.59,.31,.13};
        elseif i<=11 then point:={-2.35-3.12*cos(tail),signSide*1.03,-3.12*sin(tail)+.11,.20,.40,.17};
        else point:={-2.35-1.5*cos(tail),0,-1.5*sin(tail),.31,.35,.47};end if;
      else
        for k in 1:6 loop point[k]:=shark[i,k]*(if k==6 then 1.5^3 else 1.5);end for;
        if i==7 then point[2]:=point[2]-.91*sin(tail);point[1]:=point[1]+.91*(1-cos(tail));end if;
      end if;
      side:=point[2]*cos(pose[6])-point[3]*sin(pose[6]);z:=point[2]*sin(pose[6])+point[3]*cos(pose[6]);
      fore:=point[1]*cos(pose[5])-z*sin(pose[5]);
      e:=fore*cos(pose[4])-side*sin(pose[4]);n:=fore*sin(pose[4])+side*cos(pose[4]);
      depth:=water[1]+water[2]*e+water[3]*n-(pose[3]+point[1]*sin(pose[5])+z*cos(pose[5]));
      wet:=if whale and i<=6 then bodyVolumes[i] else point[6]*Humpback.wet(depth,point[4])*exp(-max(0,depth-point[4])/point[5]);
      stations[i,:]:={pose[1]+e,pose[2]+n,wet,point[5],max(0,1-abs(depth)/(point[4]+.28*point[5]))};
    end if;
  end for;
end SwimmerSections;
