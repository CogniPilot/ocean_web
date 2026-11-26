within Wreck;
function bedPatchPlane "Same triangular facet as Bathymetry.plane, using the local contact stencil"
  input Real east,north,west,south,patch[4,5];
  output Real h,n[3];
protected
  Integer i,j,k;
  Real x,y;
algorithm
  if east<=BedGrid.low or east>=BedGrid.high or north<=BedGrid.low or north>=BedGrid.high or (east-10)^2+north^2<27^2 then
    h:=BedGrid.datum;n:={0,0,1};return;
  end if;
  i:=if east>=west+BedGrid.spacing then 1 else 0;
  j:=if north>=south+BedGrid.spacing then 1 else 0;
  k:=1+i+2*j;
  x:=east-(west+i*BedGrid.spacing);y:=north-(south+j*BedGrid.spacing);
  n:=if x>=y then {patch[k,2],patch[k,3],1} else {patch[k,4],patch[k,5],1};
  h:=patch[k,1]-x*n[1]-y*n[2];
end bedPatchPlane;
