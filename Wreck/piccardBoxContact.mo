within Wreck;
function piccardBoxContact "One Piccard box against one wreck plate, all coordinates in the vehicle frame"
  input Real center[3],half[3],axes[3,3],plate[3],extent[3],plateAxes[3,3];
  output Real hit[7] "Signed gap, normal pointing into the sub, and body-frame witness";
protected
  Real delta[3],axis[3],normal[3],length,signedDistance,gap,p[3],onPlate[3],projection;
algorithm
  delta:=center-plate;
  hit:={-1e5,0,0,0,0,0,0};
  for k in 1:15 loop
    if k<=3 then
      axis:=plateAxes[k,:];
    elseif k<=6 then
      axis:=axes[k-3,:];
    else
      axis:=cross(axes[1+div(k-7,3),:],plateAxes[1+mod(k-7,3),:]);
    end if;
    length:=sqrt(axis*axis);
    if length>1e-8 then
      normal:=axis/length;
      signedDistance:=normal*delta;
      gap:=abs(signedDistance)-abs(axes*normal)*half-abs(plateAxes*normal)*extent;
      if gap>hit[1] then
        hit[1]:=gap;
        hit[2:4]:=if signedDistance>=0 then normal else -normal;
        if gap>.003 then return; end if;
      end if;
    end if;
  end for;
  // On a supporting face, use the closest location to the obstacle. This
  // keeps the lever arm on the struck part when a narrow rail hits a wall.
  onPlate:=plate;
  for i in 1:3 loop
    onPlate:=onPlate+plateAxes[i,:]*min(extent[i],max(-extent[i],plateAxes[i,:]*delta));
  end for;
  normal:=hit[2:4];
  p:=center;
  for i in 1:3 loop
    projection:=axes[i,:]*normal;
    if abs(projection)>1e-7 then
      p:=p-sign(projection)*half[i]*axes[i,:];
    else
      p:=p+min(half[i],max(-half[i],axes[i,:]*(onPlate-center)))*axes[i,:];
    end if;
  end for;
  hit[5:7]:=p;
end piccardBoxContact;
