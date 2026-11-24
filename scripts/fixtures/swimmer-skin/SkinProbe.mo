model SkinProbe
 input Real p[3],joints[4],radius=0,whale=1;
 output Real hit[4];
equation
 hit=SwimmerCollision.skinContact(whale>.5,p,radius,SwimmerCollision.skinFrames(whale>.5,joints));
end SkinProbe;
