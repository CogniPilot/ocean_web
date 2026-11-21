model OceanSailing "Single local sailboat with shared wind, water and race physics"
  extends OceanRace;
equation
  sailLandingWrench=zeros(6);
  committeeLandingWrench=zeros(6);
  windProbe={boat.east,boat.north};
end OceanSailing;
