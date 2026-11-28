model CruiserAnchor "Anchor, windlass, and hull fairleads in the Ocean Web harbor"
  extends Marine.Mooring.PartialCruiserAnchor(
    mount=leadPoint, mountVelocity=bowVelocity+cross(angularVelocity,leadPoint-bowMount),
    guidedLength=Modelica.Math.Vectors.length(guide[1,:]-bowMount)+
      Modelica.Math.Vectors.length(guide[2,:]-guide[1,:]));
  parameter Real bowX, sternX, halfBeam, gunwale;
  input Real bowMount[3],bowVelocity[3],boatRotation[3,3],angularVelocity[3];
  output Real guide[2,3] "Rode fairleads in ENU, repeated at a direct lead";
protected
  Real localLead[3],leadPoint[3],bowGuide[3],sternGuide[3];
  discrete Real side(start=1,fixed=true);
  discrete Integer routed(start=0,fixed=true);
equation
  localLead=transpose(boatRotation)*(position-bowMount);
  // Choose a side once the slack first leads aft. Hold it while tension
  // builds, to avoid a discontinuous port/starboard flip under load.
  when sample(0,.05) then
    side=if pre(routed)==0 and abs(localLead[2])>.12 then sign(localLead[2]) else pre(side);
    routed=if paid<.22 or localLead[1]>-.10 or
      (pre(routed)==0 and (localLead[1]>-.33 or abs(localLead[2])>1.20*halfBeam))
      then 0 elseif localLead[1]+bowX<sternX-.04 then 2 else 1;
  end when;
  bowGuide=bowMount+boatRotation*{0,side*(halfBeam+.06),0};
  sternGuide=bowMount+boatRotation*{sternX-.10-bowX,side*(halfBeam+.06),gunwale};
  guide[1,:]=if routed==0 then bowMount else bowGuide;
  guide[2,:]=if routed==2 then sternGuide else guide[1,:];
  leadPoint=guide[2,:];
  bedAtMount=Shore.seabed(bowMount[1],bowMount[2]);
  bedAtAnchor=Shore.seabed(position[1],position[2]);
end CruiserAnchor;
