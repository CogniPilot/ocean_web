model CruiserAnchor "Anchor in the Ocean Web harbor"
  extends Marine.Mooring.PartialCruiserAnchor;
equation
  bedAtMount=Shore.seabed(mount[1],mount[2]);
  bedAtAnchor=Shore.seabed(position[1],position[2]);
end CruiserAnchor;
