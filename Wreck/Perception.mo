within Wreck;
package Perception "Acoustic/optical acquisition and pressure- and gravity-aided keyframe SLAM"
  constant Integer rays=1017, width=36, height=24, keys=48, stride=180;
  constant Real cameraFx=18/tan(40*pi/180),cameraFy=12/tan(32*pi/180);
  constant Real dvlMount[3]={0,0,-.075} "Assumed transducer face below the body origin, FLU";
  constant Real cameraMount[3]={.31,0,.045};
  function directions = Marine.Wreck.Perception.directions;

  function slabInterval = Marine.Wreck.Perception.slabInterval;

  function intersectsBounds = Marine.Wreck.Perception.intersectsBounds;

  function plateRange = Marine.Wreck.Perception.plateRange;

  function renderDepth "First returns along the four DVL, 149 sonar and 864 pinhole-camera rays"
    input Real pos[3],T[3,3],d[rays,3];
    input Boolean camera=true,sonar=true;
    output Real depth[rays];
  protected Real eye[3],limit,hit;
  algorithm
    eye:=pos+transpose(T)*cameraMount;
    depth:=zeros(rays);
    for i in 1:(if camera then rays elseif sonar then 153 else 4) loop
      if i<=4 or i>153 then
      limit:=if i<=4 then 50/cos(pi/8) elseif i<=153 then 18 else 8;
      hit:=WreckSolids.beamRange(if i<=4 then pos+transpose(T)*dvlMount else eye,transpose(T)*d[i,:],limit+1);
      depth[i]:=if hit<=limit then hit else 0;
      end if;
    end for;
  end renderDepth;

  function noise = Marine.Wreck.Perception.noise;

  function instruments = Marine.Wreck.Perception.instruments;

  function features = Marine.Wreck.Perception.features;

  function registration = Marine.Wreck.Perception.registration;
  function estimate = Marine.Wreck.Perception.estimate;

  function seaHeight = Marine.Wreck.Perception.seaHeight;

  function boatEnvironment = Marine.Wreck.Perception.boatEnvironment;

  function launchGyroBias "Zero-rate calibration in the stationary fixture before deployment"
    input Real d[rays,3];
    output Real bias;
  protected
    Real measurement[195],image[864];
  algorithm
    bias:=0;
    for i in 1:32 loop
      (measurement,image):=instruments(-.2*i,zeros(3),identity(3),zeros(3),zeros(3),
        {0,0,g},0,zeros(rays),d,false);
      bias:=bias+measurement[161]/32;
    end for;
  end launchGyroBias;

  function sampleFrame
    input Real t,truth[18],d[rays,3],overrideDepth[rays],useRaster,oldImage[864],previous[21],history[keys,stride];
    input Boolean camera=true,mapping=true,sonar=true;
    input Real carrierFix[5]=zeros(5) "Optional independently reported carrier saddle position and yaw";
    output Real sensor[91],elev[100],image[864],state[21],graph[keys,stride],ft[24,5],ping[65,32];
  protected Real T[3,3],depth[rays],raw[195],prior[21];
  algorithm
    T:=MultiBodyLie.Math.quaternionToT(truth[4:7]);
    if useRaster>.5 then depth:=overrideDepth;else depth:=renderDepth(truth[1:3],T,d,camera,sonar);end if;
    (raw,image):=instruments(t,truth[1:3],T,truth[8:10],truth[16:18],truth[13:15],truth[12],depth,d,camera,dvlMount,cameraMount);
    if sonar and useRaster<.5 then
      (ping,raw[5:53]):=ImagingSonar.ping(t,truth[1:3],T);
    else ping:=zeros(65,32);end if;
    prior:=previous;
    if t==0 then prior[4]:=atan2(T[1,2],T[1,1]);end if;
    if carrierFix[1]>.5 then prior[1:4]:=carrierFix[2:5];end if;
    elev:=raw[54:153];(state,graph,sensor,ft):=estimate(t,raw,d,image,oldImage,prior,history,camera,mapping,truth[1:3],.29,dvlMount,cameraMount,ImagingSonar.mount);
    if t==0 then state[21]:=launchGyroBias(d);end if;
    if carrierFix[1]>.5 then
      state[1:4]:=carrierFix[2:5];
      sensor[60:62]:={carrierFix[2],carrierFix[3],carrierFix[5]};
    end if;
  end sampleFrame;
end Perception;
