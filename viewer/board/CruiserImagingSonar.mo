model CruiserImagingSonar "Forward volumetric sonar mounted under the cruiser bow"
  input Real pose[6] "ENU origin and ZYX roll, pitch, yaw [m, rad]";
  input Real fish[36,4] "Enabled and ENU position of each tracked fish";
  input Real animals[10,4] "Enabled and ENU center of each whale or shark";
  input Real waterLevel "Local water surface [m]";
  input Real rangeLimit=100 "Maximum slant range [m]";
  input Real halfBearing=.7853981633974483 "Half of the horizontal aperture [rad]";
  constant Integer bearings=21,elevations=11,beamCount=bearings*elevations;
  output Real returns[beamCount+46,4] "Measured slant range, port bearing, up elevation, class (1 floor, 2 structure, 3 baitfish, 4 large animal)";
  function rockRange "Clip a sonar ray to broad-phase spheres and the actual convex boulder faces"
    input Real o[3],d[3],limit,rocks[46,13],planes[80,4];
    output Real range;
  protected Real offset[3],along,inv[3,3],v[3],p[3],near,far,facing,dist;
  algorithm
    range:=limit;
    for k in 1:46 loop
      offset:=o-rocks[k,1:3];along:=max(0,min(range,-offset*d));
      if (offset+along*d)*(offset+along*d)<rocks[k,4]^2 then
        inv:=[rocks[k,5],rocks[k,6],rocks[k,7];rocks[k,8],rocks[k,9],rocks[k,10];rocks[k,11],rocks[k,12],rocks[k,13]];
        p:=inv*offset;v:=inv*d;near:=0;far:=range;
        for j in 1:80 loop
          facing:=planes[j,1:3]*v;dist:=planes[j,4]-planes[j,1:3]*p;
          near:=if facing< -1e-8 then max(near,dist/facing) else near;
          far:=if facing>1e-8 then min(far,dist/facing) elseif abs(facing)<=1e-8 and dist<0 then -1 else far;
          if far<near then break;end if;
        end for;
        if far>=near then range:=near;end if;
      end if;
    end for;
  end rockRange;
  function firstEcho
    input Real o[3],d[3],limit;
    output Real range,kind;
  protected
    Real bed,near,far,mid,height,previous,s,cap,rock,entry,exitDistance,spacing;
  algorithm
    range:=Wreck.WreckSolids.beamRange(o,d,limit);
    kind:=if range<limit then 2 else 0;
    if d[3]<-1e-8 then
      bed:=(-13.7-o[3])/d[3];
      if bed>=0 and bed<=range+.0001 then range:=min(range,bed);kind:=1;end if;
    end if;
    (entry,exitDistance):=Wreck.Perception.slabInterval(o,d,{7,17,-13.71},{65,63,6},1e-15);
    if exitDistance>=max(.08,entry) and entry<=range then
      // Bracket an intersection on the island's triangular sand mesh and refine its slant range.
      previous:=max(0,entry);cap:=min(exitDistance,range);
      spacing:=(cap-previous)/72;s:=previous+spacing;
      for step in 1:72 loop
        if previous>=cap then break;end if;
        height:=o[3]+s*d[3]-Shore.seabed(o[1]+s*d[1],o[2]+s*d[2]);
        if height<=0 then
          near:=previous;far:=s;
          for i in 1:9 loop
            mid:=(near+far)/2;
            if o[3]+mid*d[3]>Shore.seabed(o[1]+mid*d[1],o[2]+mid*d[2]) then near:=mid;else far:=mid;end if;
          end for;
          range:=far;kind:=1;break;
        end if;
        previous:=s;s:=min(cap,s+spacing);
      end for;
      rock:=rockRange(o,d,range,Shore.rocks,Shore.planes);
      if rock<range then range:=rock;kind:=2;end if;
    end if;
  end firstEcho;
  function scan
    input Real p[6],targets[46,4],level,limit,aperture;
    output Real rows[277,4];
  protected
    Real roll,pitch,yaw,rot[3,3],origin[3],d[3],v[3],delta[3],r,b,e,hit,kind,cap,grazing;
    Integer index;
  algorithm
    hit:=0;kind:=0;rows:=zeros(277,4);roll:=p[4];pitch:=p[5];yaw:=p[6];
    rot:=[cos(yaw)*cos(pitch),cos(yaw)*sin(pitch)*sin(roll)-sin(yaw)*cos(roll),cos(yaw)*sin(pitch)*cos(roll)+sin(yaw)*sin(roll);
      sin(yaw)*cos(pitch),sin(yaw)*sin(pitch)*sin(roll)+cos(yaw)*cos(roll),sin(yaw)*sin(pitch)*cos(roll)-cos(yaw)*sin(roll);
      -sin(pitch),cos(pitch)*sin(roll),cos(pitch)*cos(roll)];
    origin:=p[1:3]+rot*{1.0,0,-.81};
    if origin[3]>=level then return;end if;
    grazing:=asin(min(.86,14/limit));
    for j in 1:11 loop
      // Reserve shallow beams for the distant bottom on the longer scales.
      e:=if limit<=36 then (-60+6*(j-1))*.0174532925199433
        elseif j==11 then 0 else -grazing-(1.047197551196598-grazing)*((10-j)/9)^2;
      for i in 1:21 loop
        b:=aperture*(i-11)/10;
        d:=rot*{cos(e)*cos(b),cos(e)*sin(b),sin(e)};
        cap:=if d[3]>1e-6 then min(limit,(level-origin[3])/d[3]) else limit;
        (hit,kind):=firstEcho(origin,d,cap);
        index:=(j-1)*21+i;
        if kind>0 and hit>.15 and hit<cap then rows[index,:]:={hit,b,e,kind};end if;
      end for;
    end for;
    for i in 1:46 loop
      if targets[i,1]>.5 and targets[i,4]<level then
        delta:=targets[i,2:4]-origin;v:=transpose(rot)*delta;r:=sqrt(v*v);
        b:=atan2(v[2],v[1]);e:=atan2(v[3],sqrt(v[1]^2+v[2]^2));
        if r>.15 and r<limit and abs(b)<=aperture and e>=-1.047198 and e<=0 then
          (hit,kind):=firstEcho(origin,delta/r,r);
          if hit>=r-.015 then rows[231+i,:]:={r,b,e,if i<=36 then 3 else 4};end if;
        end if;
      end if;
    end for;
  end scan;
equation
  returns=scan(pose,cat(1,fish,animals),waterLevel,max(1,rangeLimit),halfBearing);
end CruiserImagingSonar;
