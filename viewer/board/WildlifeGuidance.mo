function WildlifeGuidance "Patrol interruptions, target choice and closest approach in ENU"
  input Boolean whale;
  input Real clock,pose[4],speed;
  input Real craft[32,8] "Stable identifier, type (boat=1, sub=2, drone=3, wildlife=4), ENZ, EN velocity, host flag";
  input Real memory[3] "Target identifier, encounter episode, passing side";
  input Real prey[4]=zeros(4) "Live prey during a foraging bout";
  input Real selfId=0 "Ignore this actor in both target selection and avoidance";
  output Real result[9] "Investigating, course, speed, breach clearance, target depth, submarine, then memory";
protected
  // The -10 m contour of Shore.terrain plus clearance for body length and fins.
  constant Real eastRadius=39,northRadius=29;
  Real ahead,reach,margin,low[3],high[3];
  Integer target;
  Real east,north,radius,norm,ne,nn,radial,tangent,limit,lookahead;
  Real best,score,dx,dy,d,clearance,notice,episode,side,heading,pace,cruise,ux,uy,ex,ey,along,across;
  Real vx,vy,lead,px,py,safety,sx,sy,strength,escape,clear,turnSide;
algorithm
  clearance:=if whale then 15 else 9;notice:=if whale then 85 else 65;
  episode:=floor(clock/68);target:=0;best:=-1e9;heading:=pose[4];pace:=1.7;
  for i in 1:32 loop
    if craft[i,1]<>selfId and craft[i,2]>=1 and craft[i,2]<=4 and mod(clock,68)<51 then
      dx:=pose[1]-craft[i,3];dy:=pose[2]-craft[i,4];d:=sqrt(dx^2+dy^2+(pose[3]-craft[i,5])^2);
      if d<notice and (craft[i,2]<3 or craft[i,5]<16) then
        score:=-d;
        if memory[2]==episode and memory[1]==craft[i,1] then score:=score+2;end if;
        if score>best then best:=score;target:=i;end if;
      end if;
    end if;
  end for;
  result:={0,heading,pace,1,0,0,0,episode,0};
  if target>0 then
    dx:=pose[1]-craft[target,3];dy:=pose[2]-craft[target,4];d:=sqrt(dx^2+dy^2);
    cruise:=sqrt(craft[target,6]^2+craft[target,7]^2);
    if cruise>.6 and craft[target,2]==1 then
      ux:=craft[target,6]/cruise;uy:=craft[target,7]/cruise;
      side:=if memory[1]==craft[target,1] and abs(memory[3])>.5 then memory[3] elseif ux*dy-uy*dx>=0 then 1 else -1;
      result[9]:=side;
      ex:=-dx-side*uy*(clearance+(if whale then 8 else 5));ey:=-dy+side*ux*(clearance+(if whale then 8 else 5));
      along:=max(.45,cruise+.12*(ex*ux+ey*uy));across:=.18*(-ex*uy+ey*ux);
      heading:=atan2(along*uy+across*ux,along*ux-across*uy);
      pace:=min(4.4,max(1.3,cruise+.14*(ex*ux+ey*uy)));
    else
      heading:=atan2(-dy,-dx)+1.5707963-atan(.14*(d-clearance-(if whale then 8 else 5)));
    end if;
    result[1]:=1;result[5]:=craft[target,5];result[6]:=if craft[target,2]==2 then 1 else 0;
    result[7]:=craft[target,1];
  end if;
  if prey[1]>.5 then
    heading:=atan2(prey[3]-pose[2],prey[2]-pose[1]);
    pace:=if whale then 2.7 else 2.9;
    result[1]:=1;result[5]:=prey[4];result[6]:=2;
  end if;
  safety:=0;sx:=0;sy:=0;clear:=1;
  for i in 1:32 loop
    if craft[i,1]<>selfId and craft[i,2]>0 and (craft[i,2]<>3 or craft[i,5]<=2) then
      dx:=pose[1]-craft[i,3];dy:=pose[2]-craft[i,4];
      vx:=speed*cos(pose[4])-craft[i,6];vy:=speed*sin(pose[4])-craft[i,7];
      lead:=max(0,min(if whale then 10 else 5,-(dx*vx+dy*vy)/(.01+vx^2+vy^2)));
      px:=dx+lead*vx;py:=dy+lead*vy;d:=sqrt(px^2+py^2);
      if d<35 and craft[i,5]>-5 then clear:=0;end if;
      if abs(pose[3]-craft[i,5])<=6 and d<clearance+5 then
        strength:=min(1,(clearance+5-d)/5);turnSide:=if dx*vy-dy*vx>=0 then 1 else -1;
        sx:=sx+strength*(px-.35*turnSide*vy);sy:=sy+strength*(py+.35*turnSide*vx);safety:=max(safety,strength);
      end if;
    end if;
  end for;
  if safety>0 then
    result[6]:=0;
    escape:=atan2(sy,sx);heading:=heading+safety*atan2(sin(escape-heading),cos(escape-heading));result[1]:=1;
  end if;
  if whale then
    east:=pose[1]-36;north:=pose[2]-40;
    radius:=sqrt((east/eastRadius)^2+(north/northRadius)^2);
    lookahead:=12+4*min(7,abs(speed));
    // Distance to the safe contour along its local outward normal.
    norm:=max(1e-6,sqrt((east/eastRadius^2)^2+(north/northRadius^2)^2));
    if radius<1+lookahead/northRadius then
      clear:=0;
      ne:=east/(eastRadius^2*norm);nn:=north/(northRadius^2*norm);
      if result[1]<.5 then
        heading:=atan2(-18-pose[2],-10-pose[1])+1.57-atan(.080*(sqrt((pose[1]+10)^2+(pose[2]+18)^2+.01)-22));
      end if;
      limit:=min(.96,max(-1,(1-radius)*radius/(norm*lookahead)));
      radial:=ne*cos(heading)+nn*sin(heading);
      if radial<limit then
        // Preserve the direction of travel around the contour on successive fixes.
        tangent:=-nn*cos(pose[4])+ne*sin(pose[4]);
        side:=if abs(tangent)>.12 then sign(tangent)
          elseif -nn*cos(heading)+ne*sin(heading)<-.12 then -1 else 1;
        heading:=atan2(nn,ne)+side*acos(limit);
        result[1]:=1;result[6]:=0;pace:=min(pace,2.4);
      end if;
    end if;
  end if;
  // Steer away before a submerged animal's swept path enters the wreck envelope.
  // Above the deck the same horizontal track is safe.
  for site in 1:2 loop
    low:=Wreck.ScanOccupancy.low[site,:];high:=Wreck.ScanOccupancy.high[site,:];
    reach:=if whale then 6.7 else 2.6;
    if pose[3]-(if whale then 2.5 else 1.1)<high[3] and pose[3]+reach>low[3] then
      ahead:=min(28,reach+max(1,speed)*(if whale then 6 else 4));
      margin:=if whale then 3.6 else 1.4;
      for j in 0:8 loop
        px:=pose[1]+ahead*j/8*cos(pose[4]);py:=pose[2]+ahead*j/8*sin(pose[4]);
        if px>=low[1]-margin and px<=high[1]+margin and py>=low[2]-margin and py<=high[2]+margin then
          // Keep passing on the animal's present side of the wreck's long axis.
          side:=if pose[2]>=.5*(low[2]+high[2]) then 1 else -1;
          heading:=atan2(side,.35*cos(pose[4]));pace:=min(pace,1.4);clear:=0;result[1]:=1;result[6]:=0;
          break;
        end if;
      end for;
    end if;
  end for;
  result[2]:=heading;result[3]:=pace;result[4]:=clear;
end WildlifeGuidance;
