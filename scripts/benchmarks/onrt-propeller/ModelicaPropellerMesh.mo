model ModelicaPropellerMesh "Generate the workshop propeller wall in a graded open-water domain"
  parameter String surfacePath="port.stl" "Closed CAD-derived ASCII STL in metres";
  parameter String meshDirectory="constant/polyMesh";
  final parameter Integer cellCount(fixed=false);
protected
  impure function create
    input String surfacePath,meshDirectory;
    output Integer count;
  protected
    Real triangles[:,3,3],volume[:];
    Meshing.PolyMesh mesh;
  algorithm
    triangles:=Meshing.readAsciiSTL(surfacePath);
    mesh:=Meshing.generate({-0.055,-0.085,-0.085},{0.055,0.085,0.085},
      {28,34,34},2,triangles,0.6,captureThinSolids=true);
    mesh.points:=Meshing.stretchFarField(mesh,{-0.024,-0.058,-0.058},{0.024,0.058,0.058},
      {-0.3198,-0.2132,-0.2132},{0.6396,0.2132,0.2132});
    volume:=Meshing.cellVolumes(mesh,true);
    assert(min(volume)>0 and Meshing.bodyComponentCount(mesh)==1,"Invalid propeller mesh");
    Meshing.writePolyMesh(meshDirectory,mesh);
    count:=mesh.nCells;
  end create;
initial algorithm
  cellCount:=create(surfacePath,meshDirectory);
end ModelicaPropellerMesh;
