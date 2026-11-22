model FeedingGround "Kinematic bait schools and body-mounted fish finder"
  input Real clock "Shared harbor time in seconds";
  input Real pose[6] "East, north, up, yaw, nose-up pitch, roll";
  input Real whale "One for a humpback, zero for a white shark";
  input Real feedAge "Time since the last feeding command, negative when idle";
  output Real gape,capture;
  output Real school[36,4] "East, north, up and course in radians";
  output Real returns[36,4] "Slant range, bearing, elevation, relative echo strength";
  output Real inMouth[36] "Fish inside the open jaw envelope";
  function swim
    input Real t;
    output Real fish[36,4];
  protected
    Integer flock;
    Real phase,course,along,across;
  algorithm
    for i in 1:36 loop
      flock:=div(i-1,12);
      phase:=.095*t+2.1*flock;
      course:=atan2(3.5*cos(phase),-6*sin(phase));
      along:=1.65*sin(4.3*i)+.18*cos(.8*t+i);
      across:=.95*cos(2.2*i)+.12*sin(.7*t+i);
      fish[i,:]:={4+7*flock+6*cos(phase)+along*cos(course)-across*sin(course),
        -17-3*flock+3.5*sin(phase)+along*sin(course)+across*cos(course),
        -2.4-2.2*flock+.55*cos(.085*t+i*.12)+.55*sin(1.9*i),course};
    end for;
  end swim;
  function scan
    input Real fish[36,4],p[6],isWhale;
    output Real echoes[36,4],inside[36];
  protected
    Real dx,dy,dz,h,f,l,u,r,b,e,reach,width,gape,side,up;
  algorithm
    reach:=if isWhale>.5 then 3.9 else 2.0;
    width:=if isWhale>.5 then 1.03 else .28;
    gape:=if isWhale>.5 then .85 else .21;
    for i in 1:36 loop
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
equation
  // These are instantaneous observations. A single stateless FMU can evaluate
  // different animals at the same harbor time without advancing an event clock.
  gape=noEvent(if feedAge<0 then 0 elseif whale>.5 then max(0,min(1,min(feedAge/.65,(2.6-feedAge)/.8)))
    else max(0,min(1,min(feedAge/.26,(.72-feedAge)/.21))));
  capture=noEvent(if whale>.5 then (if gape>.72 then 1 else 0)
    else (if feedAge>=.45 and feedAge<=.72 then 1 else 0));
  school=swim(clock);
  (returns,inMouth)=scan(school,pose,whale);
end FeedingGround;
