within Wreck;
package ImagingSonar "Imaging sonar using this harbor geometry"
  constant Integer bearings=Marine.Wreck.ImagingSonar.bearings;
  constant Integer bins=Marine.Wreck.ImagingSonar.bins;
  constant Integer verticalSamples=Marine.Wreck.ImagingSonar.verticalSamples;
  constant Real halfFan=Marine.Wreck.ImagingSonar.halfFan;
  constant Real rangeMax=Marine.Wreck.ImagingSonar.rangeMax;
  constant Real depression=Marine.Wreck.ImagingSonar.depression;
  constant Real mount[3]={.30,0,.01};
  function rayDirection = Marine.Wreck.ImagingSonar.rayDirection;
  function formEcho = Marine.Wreck.ImagingSonar.formEcho;
  function ping "Sample the wreck scene and form the acoustic image"
    input Real t,pos[3],T[3,3];
    output Real intensity[bearings,32] "Four unsigned 8-bit range cells per word, near cell first";
    output Real profile[49] "Dominant echo slant range per navigation bearing; zero is no detection";
  protected
    Real origin[3],samples[bearings,verticalSamples];
  algorithm
    origin:=pos+transpose(T)*mount;
    for b in 1:bearings loop
      for j in 1:verticalSamples loop
        samples[b,j]:=WreckSolids.beamRange(origin,transpose(T)*rayDirection(b,j),rangeMax+.5);
      end for;
    end for;
    (intensity,profile):=formEcho(t,pos,T,samples,mount);
  end ping;
end ImagingSonar;
