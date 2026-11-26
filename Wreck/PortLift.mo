within Wreck;
package PortLift "Aft-port davit, cockpit cradle and swim platform in cruiser forward, port, up metres"
  constant Real mountX=-2.78,railY=1.18,lower=-.34,travel=1.61,reach=1.05,tipZ=2.12;
  constant Real bridleHeight=.15,cradle[3]={mountX,railY-reach,.64+piccardKeel},cycleSeconds=8;
  constant Integer kinematics=3, movingCount=3, count=24;
  // Fixed rectangular members: mast, mounting flange, hull-side backing,
  // padded crossbearers and their four cockpit feet, stern platform and ladder.
  constant Real fittings[17,6]=[
    -2.78,1.18,1.325,.09,.09,1.05;
    -2.78,1.18,.817,.23,.195,.034;
    -2.78,1.271,.68,.19,.032,.26;
    -3.045,.0175,.611,.065,.905,.032;
    -2.565,.0175,.611,.065,.905,.032;
    -3.045,.13,.6335,.060,.325,.013;
    -2.565,.13,.6335,.060,.325,.013;
    -3.045,-.408,.565,.09,.065,.06;
    -3.045,.443,.565,.09,.065,.06;
    -2.565,-.408,.565,.09,.065,.06;
    -2.565,.443,.565,.09,.065,.06;
    -3.905,0,.136,.51,2.02,.10;
    -3.97,-.84,.21,.37,.04,.04;
    -3.97,-.38,.21,.37,.04,.04;
    -4.18,-.61,.10,.034,.46,.034;
    -4.18,-.61,-.09,.034,.46,.034;
    -4.18,-.61,-.25,.034,.46,.034];

  function phase
    input Real level,lo,hi;
    output Real q[2] "Smoothstep and derivative per unit of normalized stroke";
  protected
    Real t;
  algorithm
    t:=max(0,min(1,(level-lo)/(hi-lo)));
    q:={t*t*(3-2*t),6*t*(1-t)/(hi-lo)};
  end phase;

  function motion "Slew angle and nominal hook elevation followed by their derivatives"
    input Real level;
    output Real m[6];
  protected
    Real raise[2],slew[2],settle[2],slack[2],z,dz;
  algorithm
    raise:=phase(level,0,.38);slew:=phase(level,.38,.74);settle:=phase(level,.74,1);
    slack:=phase(level,.92,1);
    z:=lower+travel*raise[1]+(cradle[3]-1.27)*settle[1]+bridleHeight;
    dz:=travel*raise[2]+(cradle[3]-1.27)*settle[2];
    m:={Modelica.Constants.pi*slew[1],z,tipZ-z+.04*slack[1],Modelica.Constants.pi*slew[2],dz,-dz+.04*slack[2]};
  end motion;

  function hoist "Body-frame tip xyz, paid length, and derivatives per unit of stroke"
    input Real level;
    output Real k[8];
  protected
    Real m[6];
  algorithm
    m:=motion(level);
    k:={mountX-reach*sin(m[1]),railY+reach*cos(m[1]),tipZ,m[3],
      -reach*cos(m[1])*m[4],-reach*sin(m[1])*m[4],0,m[6]};
  end hoist;

  function member "Box around a structural member lying in the y-z plane"
    input Real x,y,z,dy,dz,width,thickness;
    output Real row[15];
  protected
    Real length,c,s;
  algorithm
    length:=sqrt(dy*dy+dz*dz);c:=dy/length;s:=dz/length;
    row:={x,y+.5*dy,z+.5*dz,.5*width,.5*length,.5*thickness,1,0,0,0,c,s,0,-s,c};
  end member;

  function referenceBox "Centre, half extents and body-frame principal axes before slew"
    input Integer index;
    output Real row[15];
  protected
    Real v[6],signY,e[3],n[3],b[3];
  algorithm
    if index==1 then row:=member(mountX,railY,1.84,reach,.28,.073,.09);
    elseif index==2 then row:=member(mountX,railY,1.48,.64,.53,.055,.06);
    elseif index==3 then row:={mountX,railY+reach,tipZ,.059,.064,.064,1,0,0,0,1,0,0,0,1};
    elseif index<=20 then
      v:=fittings[index-3,:];
      row:={v[1],v[2],v[3],.5*v[4],.5*v[5],.5*v[6],1,0,0,0,1,0,0,0,1};
    elseif index<=22 then
      signY:=if index==21 then -1 else 1;
      e:={.48,-signY*.15,-.22};e:=e/sqrt(e*e);
      n:={signY*.15,.48,0};n:=n/sqrt(n*n);b:=cross(e,n);
      row:=cat(1,{-3.86,signY*.775,.01,.5*sqrt(.48^2+.15^2+.22^2),.022,.022},e,n,b);
    else
      row:={-4.17,if index==23 then -.84 else -.38,-.02,.020,.020,.231,1,0,0,0,1,0,0,0,1};
    end if;
  end referenceBox;

  function pointVelocity "Member velocity at a point in the cruiser body frame"
    input Integer feature;
    input Real m[6],rate,point[3];
    output Real v[3];
  algorithm
    v:=if feature<=movingCount then rate*m[4]*{railY-point[2],point[1]-mountX,0} else zeros(3);
  end pointVelocity;

  function transformBox
    input Integer index;
    input Real ref[15],m[6];
    output Real row[15];
  protected
    Real c,s,dx,dy;
  algorithm
    row:=ref;
    if index<=movingCount then
      c:=cos(m[1]);s:=sin(m[1]);dx:=ref[1]-mountX;dy:=ref[2]-railY;
      row[1]:=mountX+c*dx-s*dy;row[2]:=railY+s*dx+c*dy;
      for j in 0:2 loop
        row[7+3*j]:=c*ref[7+3*j]-s*ref[8+3*j];
        row[8+3*j]:=s*ref[7+3*j]+c*ref[8+3*j];
      end for;
    end if;
  end transformBox;
  function boxAt
    input Integer index;
    input Real level;
    output Real row[15];
  algorithm
    row:=transformBox(index,referenceBox(index),motion(level));
  end boxAt;
  function restGeometry
    output Real boxes[count,15];
  algorithm
    for i in 1:count loop boxes[i,:]:=referenceBox(i);end for;
  end restGeometry;
end PortLift;
