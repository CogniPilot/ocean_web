within Wreck;
function skinContact "Contact of a hull-sampling sphere with the baked compound convex swimmer skin"
    input Boolean whale;
    input Real p[3],radius,frames[6,3,4];
    output Real contact[4] "Outward normal in body axes and signed clearance";
  protected
    Real q[3],n[3],plane[4],gap,d;
    Integer joint,part;
  algorithm
    contact:={0,0,0,1e6};
    for k in 1:max(Wreck.SwimmerHulls.count) loop
      if k>Wreck.SwimmerHulls.count[if whale then 1 else 2] then break;end if;
      part:=k+(if whale then 0 else Wreck.SwimmerHulls.count[1]);
      joint:=1+Wreck.SwimmerHulls.joint[part];
      q:=frames[joint,:,1:3]*p+frames[joint,:,4];
      if min(q-Wreck.SwimmerHulls.bounds[part,1:3])>=-radius and
          min(Wreck.SwimmerHulls.bounds[part,4:6]-q)>=-radius then
        gap:=-1e6;n:=zeros(3);
        // Most separated face of the sphere-expanded convex hull. Adjacent
        // support planes conservatively enclose rounded edge/corner contacts.
        for i in 1:26 loop
          plane:=Wreck.SwimmerHulls.planes[(part-1)*26+i,:];
          d:=q*plane[1:3]-plane[4]-radius;
          if d>gap then gap:=d;n:=plane[1:3];end if;
        end for;
        if gap<contact[4] then
          contact[1:3]:=transpose(frames[joint,:,1:3])*n;contact[4]:=gap;
        end if;
      end if;
    end for;
  end skinContact;
