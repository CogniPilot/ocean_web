model FeedingGround "Kinematic bait schools and body-mounted fish finder"
  input Real clock "Shared harbor time in seconds";
  input Real pose[6] "East, north, up, yaw, nose-up pitch, roll";
  input Real whale "One for a humpback, zero for a white shark";
  input Real feedAge "Time since the last feeding command, negative when idle";
  constant Integer fishCount=72;
  input Real restock[fishCount]=zeros(fishCount) "Time when each eaten fish returns";
  input Real useSchool=0 "Use the host's individual fish checkpoint";
  input Real swimmers[fishCount,4]=zeros(fishCount,4);
  output Real migration[fishCount,4] "Unperturbed migration path used by the schooling model";
  output Real prey[5] "Target available, ENZ of live fish and mouth opening request";
  output Real gape,capture;
  output Real school[fishCount,4] "East, north, up and course in radians";
  output Real returns[fishCount,4] "Slant range, bearing, elevation, relative echo strength";
  output Real inMouth[fishCount] "Fish inside the open jaw envelope";
  function swim
    input Real t;
    input Integer count;
    output Real fish[count,4];
  protected
    Integer flock,site;
    Real phase,course,along,across,centerEast,centerNorth;
  algorithm
    for i in 1:count loop
      flock:=div(i-1,12);
      site:=mod(flock,3);
      centerEast:=if flock<3 then 4+7*site else 2+11*site;
      centerNorth:=if flock<3 then -17-3*site else 3+9*site;
      phase:=.095*t+2.1*flock;
      course:=atan2(3.5*cos(phase),-6*sin(phase));
      along:=1.65*sin(4.3*i)+.18*cos(.8*t+i);
      across:=.95*cos(2.2*i)+.12*sin(.7*t+i);
      fish[i,:]:={centerEast+6*cos(phase)+along*cos(course)-across*sin(course),
        centerNorth+3.5*sin(phase)+along*sin(course)+across*cos(course),
        -2.4-2.2*site+.55*cos(.085*t+i*.12)+.55*sin(1.9*i),course};
    end for;
  end swim;
  function scan
    input Real fish[:,4],p[6],isWhale;
    output Real echoes[size(fish,1),4],inside[size(fish,1)];
  protected
    Real dx,dy,dz,h,f,l,u,r,b,e,reach,width,gape,side,up;
  algorithm
    reach:=if isWhale>.5 then 3.9 else 2.0;
    width:=if isWhale>.5 then 1.03 else .28;
    gape:=if isWhale>.5 then .85 else .21;
    for i in 1:size(fish,1) loop
      dx:=fish[i,1]-p[1];dy:=fish[i,2]-p[2];dz:=fish[i,3]-p[3];
      h:=dx*cos(p[4])+dy*sin(p[4]);
      side:=-dx*sin(p[4])+dy*cos(p[4]);
      up:=-h*sin(p[5])+dz*cos(p[5]);
      f:=h*cos(p[5])+dz*sin(p[5])-reach;
      l:=side*cos(p[6])+up*sin(p[6]);
      u:=up*cos(p[6])-side*sin(p[6]);
      inside[i]:=if abs(f)<(if isWhale>.5 then .94 else .32) and
        (l/width)^2+((u+.66*gape)/gape)^2<1 then 1 else 0;
      r:=sqrt(f*f+l*l+u*u);b:=atan2(l,f);e:=atan2(u,sqrt(f*f+l*l));
      echoes[i,:]:={r,b,e,if f>0 and r>=.2 and r<=15 and abs(b)<.7854 and abs(e)<.3491 then
        (.65+.35*abs(sin(fish[i,4]-p[4]-b)))/(1+.014*r*r) else 0};
    end for;
  end scan;
  function choosePrey
    input Real fish[:,4],echoes[:,4],inside[:],restock[:],clock,isWhale;
    output Real target[5];
  protected
    Real score,best,reach;
  algorithm
    target:=zeros(5);best:=35;
    for i in 1:size(fish,1) loop
      if restock[i]<=clock then
        // Prefer the school ahead of the mouth and a fish near swimming depth.
        score:=echoes[i,1]*(1+.5*abs(echoes[i,2])+.6*abs(echoes[i,3]));
        if score<best then
          best:=score;target[1]:=1;target[2:4]:=fish[i,1:3];
        end if;
        reach:=if isWhale>.5 then 4 else 2.4;
        if inside[i]>.5 or (echoes[i,1]<reach and abs(echoes[i,2])<.5 and abs(echoes[i,3])<.45) then
          target[5]:=1;
        end if;
      end if;
    end for;
  end choosePrey;
equation
  prey=choosePrey(school,returns,inMouth,restock,clock,whale);
  // These are instantaneous observations. A single stateless FMU can evaluate
  // different animals at the same harbor time without advancing an event clock.
  gape=noEvent(if feedAge<0 then 0 elseif whale>.5 then max(0,min(1,min(feedAge/.65,(2.6-feedAge)/.8)))
    else max(0,min(1,min(feedAge/.26,(.72-feedAge)/.21))));
  capture=noEvent(if whale>.5 then (if gape>.72 then 1 else 0)
    else (if feedAge>=.45 and feedAge<=.72 then 1 else 0));
  migration=swim(clock,fishCount);
  school=if noEvent(useSchool>.5) then swimmers else migration;
  (returns,inMouth)=scan(school,pose,whale);
end FeedingGround;
