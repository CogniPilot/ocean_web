model Hobie16 "Automated full-size Hobie 16 with a 60 kg two-axis ballast carriage"
  parameter Real jibHeadRise(unit="m")=4.56 "Estimated cloth rise below the exposed upper forestay";
  extends Sailboat(catamaran=true,mass=205,ballastMass=60,
    halfSpacing=1.02,stationX={-2.520,-1.9,-.9,.15,1.12,1.95,2.520},
    beamHalf={.09,.156,.185,.184,.155,.093,.009},deckZ=.23,centerMassX=-.28,
    spans={7.36,jibHeadRise},feet={2.78,1.98},forestaySlope=1.82/5.1,
    yawInertia=315,rollInertia=520,pitchInertia=625,
    foilX={.15,-2.42,.15,-2.42},foilY={1.02,1.02,-1.02,-1.02},
    foilArea={.62,.11,.62,.11},aspect={.65,3.4,.65,3.4});
end Hobie16;
