within Wreck;
function swimmerContact "Wreck reaction on a rounded swimmer probe in level heading axes"
  import MultiBodyLie.Collision;
  input Real p[3],cy,sy,v[3],radius,damping;
  output Real contact[5] "Forward, port, up, compressive load and signed gap";
protected
  Integer ids[WreckSolids.maxCandidates];
  Real box[18],axes[3,3],n[3],speed,load;
  Collision.ContactPoint hit;
algorithm
  contact:={0,0,0,0,1e6};
  if min(p-WreckSolids.wreckLow)<0 or min(WreckSolids.wreckHigh-p)<0 then return;end if;
  // The broad phase includes all boxes within 0.8 m of each probe centre.
  ids:=WreckSolids.contactCandidates(p);
  n:=zeros(3);
  for i in 1:WreckSolids.maxCandidates loop
    if ids[i]>1 then
      box:=WreckSolids.getBox(ids[i]);
      for j in 1:3 loop axes[j,:]:=box[4+3*j:6+3*j];end for;
      hit:=Collision.sphereBox(p,zeros(3),radius,box[1:3],zeros(3),axes,box[4:6]);
      if hit.gap<contact[5] then
        contact[5]:=hit.gap;
        n:={cy*hit.n[1]+sy*hit.n[2],-sy*hit.n[1]+cy*hit.n[2],hit.n[3]};
      end if;
    end if;
  end for;
  if contact[5]<0 then
    speed:=v*n;
    load:=damping*max(0,min(5,-28*contact[5])-speed*min(1,-contact[5]/.02));
    contact[1:3]:=load*n;contact[4]:=load;
  end if;
end swimmerContact;
