within Wreck;
function structureContact "Piccard pressure vessel, viewport, open frame and six motor ducts against the wreck and seabed"
  input Real pos[3], T[3,3], velocity[3], omega[3];
  output Real force[3], moment[3] "World frame";
protected
  MultiBodyLie.Collision.ContactPoint point;
  MultiBodyLie.Collision.Material material(k=5200,d=0.8,mu=0.22,eps=0.0003,v_eps=0.12);
  Integer candidates[WreckSolids.maxCandidates];
  Real box[18],row[15],axes[3,3],plateAxes[3,3],partAxes[3,3],plate[3],hit[7];
  Real f[3],w[3],plateForce[3],plateMoment[3],weight,total,gap;
  constant Real envelopeCenter[3]={.0525,0,.04825},envelopeHalf[3]={.656,.427,.235};
  Real delta[3],arm[3],n[3];
algorithm
  force:=zeros(3);moment:=zeros(3);
  if (min(pos-WreckSolids.wreckLow)>=0 and min(WreckSolids.wreckHigh-pos)>=0) or
     (min(pos-WreckSolids.bedLow)>=0 and min(WreckSolids.bedHigh-pos)>=0) then
    w:=transpose(T)*omega;candidates:=WreckSolids.contactCandidates(pos);
    for j in 1:WreckSolids.maxCandidates loop
      if candidates[j]>0 then
        box:=WreckSolids.getBox(candidates[j]);
        if min(box[16:18]+fill(WreckSolids.guardExtent,3)-abs(pos-box[1:3]))>=0 then
          plate:=T*(box[1:3]-pos);
          for k in 1:3 loop
            axes[k,:]:=box[4+3*k:6+3*k];
            plateAxes[k,:]:=T*axes[k,:];
          end for;
          delta:=plateAxes*(envelopeCenter-plate);
          if min(box[4:6]+abs(plateAxes)*envelopeHalf-abs(delta))>=-.003 then
            point:=MultiBodyLie.Collision.sphereBox(pos,transpose(T)*PiccardSolids.dome[1:3],
              PiccardSolids.dome[4],box[1:3],zeros(3),axes,box[4:6]);
            weight:=max(0,.003-point.gap);
            f:=MultiBodyLie.Collision.contactForce(point,velocity+cross(w,point.armA),material);
            plateForce:=weight*f;plateMoment:=weight*cross(point.armA,f);total:=weight;
            for i in 1:PiccardSolids.count loop
              row:=PiccardSolids.getBox(i);
              // Bound the individual piece before the exact 15-axis test.
              delta:=plateAxes*(row[1:3]-plate);
              gap:=max(abs(delta)-box[4:6]);
              if gap<=sqrt(row[4:6]*row[4:6])+.003 then
                for k in 1:3 loop
                  partAxes[k,:]:=row[4+3*k:6+3*k];
                end for;
                hit:=piccardBoxContact(row[1:3],row[4:6],partAxes,plate,box[4:6],plateAxes);
                if hit[1]<.003 then
                  arm:=transpose(T)*hit[5:7];n:=transpose(T)*hit[2:4];
                  point:=MultiBodyLie.Collision.ContactPoint(gap=hit[1],n=n,armA=arm,armB=pos+arm-hit[1]*n-box[1:3]);
                  f:=MultiBodyLie.Collision.contactForce(point,velocity+cross(w,arm),material);
                  weight:=.003-hit[1];total:=total+weight;
                  plateForce:=plateForce+weight*f;plateMoment:=plateMoment+weight*cross(arm,f);
                end if;
              end if;
            end for;
            // A shared surface has one contact stiffness regardless of how
            // finely its supporting cylinder or duct was decomposed.
            if total>0 then
              force:=force+plateForce/total;moment:=moment+plateMoment/total;
            end if;
          end if;
        end if;
      end if;
    end for;
  end if;
end structureContact;
