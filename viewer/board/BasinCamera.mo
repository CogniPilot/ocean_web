model BasinCamera "Kinematic camera with a spherical contact envelope in the IIHR hall (Y up)"
  constant Integer count=1024;
  parameter Real solids[count,9]=zeros(count,9) "Box center and half extents or capsule endpoints, shape, frame, radius";
  parameter Real radius=.15;
  input Real previous[3],desired[3];
  input Real carrier[3] "Bridge x, trolley z and plunger displacement";
  input Real boat[4] "Model x, y, z and heading";
  output Real position[3];

  function clearPoint
    input Real q[3],objects[:,9],carrier[3],boat[4],radius;
    output Real p[3];
  protected
    Real local[3],origin[3],delta[3],extent[3],axis[3],correction[3],dist,t,c,s;
    Integer frame,insideAxis;
  algorithm
    p:=q;c:=cos(boat[4]);s:=sin(boat[4]);
    for i in 1:size(objects,1) loop
      if objects[i,7]<0.5 then break;end if;
      frame:=integer(objects[i,8]);local:=p;
      if frame==1 or frame==2 then local[1]:=p[1]-carrier[1];end if;
      if frame==2 then local[3]:=p[3]-carrier[2];end if;
      if frame==3 then local[2]:=p[2]-carrier[3];end if;
      if frame==4 then
        delta:=p-boat[1:3];local:={c*delta[1]-s*delta[3],delta[2],s*delta[1]+c*delta[3]};
      end if;
      origin:=objects[i,1:3];delta:=local-origin;correction:=zeros(3);
      if objects[i,7]<1.5 then
        extent:=objects[i,4:6];
        if abs(delta[1])<extent[1]+radius and abs(delta[2])<extent[2]+radius and abs(delta[3])<extent[3]+radius then
          for j in 1:3 loop axis[j]:=delta[j]-max(-extent[j],min(delta[j],extent[j]));end for;
          dist:=sqrt(axis*axis);
          if dist>1e-9 then
            correction:=max(0,radius-dist)/dist*axis;
          else
            insideAxis:=1;
            for j in 2:3 loop
              if extent[j]-abs(delta[j])<extent[insideAxis]-abs(delta[insideAxis]) then insideAxis:=j;end if;
            end for;
            correction[insideAxis]:=(if delta[insideAxis]<0 then -1 else 1)*(radius+extent[insideAxis]-abs(delta[insideAxis]));
          end if;
        end if;
      else
        axis:=objects[i,4:6]-origin;t:=min(1,max(0,(delta*axis)/max(1e-12,axis*axis)));
        delta:=delta-t*axis;dist:=sqrt(delta*delta);
        if dist<radius+objects[i,9] then
          correction:=if dist>1e-9 then (radius+objects[i,9]-dist)/dist*delta else {0,radius+objects[i,9],0};
        end if;
      end if;
      if frame==4 then
        p[1]:=p[1]+c*correction[1]+s*correction[3];p[2]:=p[2]+correction[2];p[3]:=p[3]-s*correction[1]+c*correction[3];
      else p:=p+correction;end if;
    end for;
    p[1]:=max(-9.45+radius,min(38.45-radius,p[1]));
    p[2]:=max(.12+radius,min(8.92-radius,p[2]));
    p[3]:=max(-12.99+radius,min(12.99-radius,p[3]));
  end clearPoint;
  function moveSphere
    input Real startPos[3],goal[3],objects[:,9],carrier[3],boat[4],radius;
    output Real p[3];
  protected
    Real step[3],distance;
    Integer n;
  algorithm
    step:=goal-startPos;distance:=sqrt(step*step);
    // Resolve before crossing half a radius, including thin rails on long mouse drags.
    n:=min(32,max(1,integer(ceil(distance/(.45*radius)))));
    step:=step/max(n,distance/(.45*radius));p:=startPos;
    for i in 1:n loop
      p:=clearPoint(p+step,objects,carrier,boat,radius);
    end for;
  end moveSphere;
equation
  position=moveSphere(previous,desired,solids,carrier,boat,radius);
end BasinCamera;
