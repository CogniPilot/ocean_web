model WhaleSpray "Exhaled mist, impact sheets and entrained air at the water surface"
  input Real breathAge,impactAge,impactSpeed,wind[2],swimVelocity[2];
  output Real plume[168,5],bubbles[160,5] "ENU offset, diameter and opacity";
  output Real curtain[97,4] "Ballistic sheet rim in local horizontal axes, with residual coverage";
  output Real droplets[520,6] "Origin XY, horizontal velocity, vertical launch speed and release delay";
  function mist
    input Integer count;
    input Real age,wind[2],velocity[2];
    output Real cloud[count,5];
  protected Real emission,t,phase,a,b,c,eddy,r,h,side,spread,fade;
  algorithm
    for i in 1:count loop
      a:=(i-.5)/count;b:=mod(i*.7548777,1);c:=mod(i*.5698403,1);
      emission:=a*.74;t:=max(0,age-emission);phase:=6.2831853*c;
      h:=(2.5+.72*b)*(1-exp(-2.6*t))+.20*t;
      eddy:=sin(phase+2.7*h);r:=(.025+.12*h+.15*t)*sqrt(b);side:=if mod(i,2)==0 then 1 else -1;
      spread:=.06+.22*h+.17*t;
      fade:=max(0,1-t/(1.55+.85*b));
      cloud[i,:]:={-velocity[1]*t+wind[1]*(t-(1-exp(-1.1*t))/1.1)*.31+r*cos(phase)+.12*t*eddy,
        -velocity[2]*t+wind[2]*(t-(1-exp(-1.1*t))/1.1)*.31+r*sin(phase)+side*(.025+.045*h),
        h,spread*(.85+.65*b),if age>=emission then (.29+.13*b)*fade^1.25 else 0};
    end for;
  end mist;
  function sheet
    input Real age,speed;
    output Real edge[97,4];
  protected Real a,lobe,t,radial,rise,x,y;
  algorithm
    for i in 1:97 loop
      a:=6.283185307*(i-1)/96;
      lobe:=.60+.14*sin(3*a+.6)+.12*cos(5*a)+.09*sin(8*a-.4);
      t:=age-(.05+.10*(1+cos(a)));
      radial:=speed*(.30+.44*lobe);rise:=speed*(.62+.96*lobe);
      x:=cos(a);y:=sin(a);
      edge[i,:]:={x*(2.3+radial*max(0,t)),y*(.72+radial*max(0,t)),
        max(0,t*(rise-4.905*t)),if t>0 then max(0,1-t/(.34+.15*speed))*min(1,12*t) else 0};
    end for;
  end sheet;
  function sprayLaunch
    input Real speed;
    output Real launch[520,6];
  protected Real a,b,c,lobe,radial;
  algorithm
    for i in 1:520 loop
      a:=6.2831853*mod(i*.618034,1);b:=mod(i*.754878,1);c:=mod(i*.5698403,1);
      lobe:=.60+.14*sin(3*a+.6)+.12*cos(5*a)+.09*sin(8*a-.4);
      radial:=speed*(.30+.44*lobe)*(.68+.78*b);
      launch[i,:]:={2.3*cos(a),.72*sin(a),radial*cos(a),radial*sin(a),speed*(.62+.96*lobe)*(.72+.64*c),.05+.10*(1+cos(a))+.12*b};
    end for;
  end sprayLaunch;
  function air
    input Real age,speed;
    output Real cloud[160,5];
  protected Real t,a,b,c,f,r,d;
  algorithm
    for i in 1:160 loop
      a:=6.2831853*mod(i*.618034,1);b:=mod(i*.754878,1);c:=mod(i*.5698403,1);
      t:=max(0,age-.22*b);f:=min(1,t/(3+5*c));r:=(1.2+.35*speed+1.5*f)*sqrt(b);
      d:=(.18+.48*speed*c)*(1-exp(-3.2*t))*(1-f)^1.6;
      cloud[i,:]:={1.22*r*cos(a),.79*r*sin(a),-.14-d,.38+.70*c+.85*f,.30*min(1,t/.22)*(1-f)};
    end for;
  end air;
equation
  plume=mist(168,breathAge,wind,swimVelocity);
  curtain=sheet(impactAge,min(7,impactSpeed));
  droplets=sprayLaunch(min(7,impactSpeed));
  bubbles=air(impactAge,min(7,impactSpeed));
end WhaleSpray;
