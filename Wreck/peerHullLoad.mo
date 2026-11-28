within Wreck;
function peerHullLoad "Free Piccard to cruiser contact, world-frame wrench about the local origin"
  input Real localState[14],peers[9,14] "Active, ENU origin, body-to-world quaternion wxyz, ENU linear and angular velocity";
  input Boolean localIsSub;
  input Real localLift[2]=zeros(2),peerLiftStates[9,2]=zeros(9,2) "Stroke fraction and rate (1/s) of each cruiser lift";
  output Real load[6];
protected
  constant Real vertices[96,3]=Shore.cruiserVertices();
  constant Integer faces[188,3]=Shore.pontoonFaces();
  // Guard centres and radii on the pressure barrel, six thruster shrouds, and skids.
  // Two barrel clamp witnesses also cover the highest points of the housing.
  constant Real guards[26,4]=[-.20,0,.05,.088;-.08,0,.05,.088;.04,0,.05,.088;.16,0,.05,.088;.25,0,.05,.08;
    -.215,.16,0,.07;-.215,-.16,0,.07;.0325,.16,0,.07;.0325,-.16,0,.07;.18,.16,0,.07;.18,-.16,0,.07;
    -.215,.0975,-.056,.037;-.215,-.0975,-.056,.037;.23,.0975,-.056,.037;.23,-.0975,-.056,.037;
    -.15,0,.05,.0915;.13,0,.05,.0915;
    -.044,-.028,.144,.006;-.044,0,.144,.006;-.044,.028,.144,.006;0,-.028,.144,.006;0,0,.144,.006;0,.028,.144,.006;
    .044,-.028,.144,.006;.044,0,.144,.006;.044,.028,.144,.006];
  .Collision.Material material(k=12000,d=1.2,mu=.22,eps=.0003,v_eps=.08);
  .Collision.ContactPoint point,probe;
  Real sub[14],boat[14],offset[3],boatT[3,3],subT[3,3],centre[3],arm[3],hit[4],n[3],armA[3],armB[3],gap,best;
  Real lift[2],motion[6],contactVelocity[3],box[15],relative[3],basis[3,3],boxCentre[3],liftVelocity[3];
  Real f[3],m[3],reaction[3],moment[3];
algorithm
  load:=zeros(6);
  for peer in 1:9 loop
    if localState[1]>.5 and peers[peer,1]>.5 then
      sub:=if localIsSub then localState else peers[peer,:];
      boat:=if localIsSub then peers[peer,:] else localState;
      offset:=sub[2:4]-boat[2:4];
      if offset*offset<36 then
        boatT:=MultiBodyLie.Math.quaternionToT(boat[5:8]);
        subT:=MultiBodyLie.Math.quaternionToT(sub[5:8]);
        centre:=boatT*offset;
        best:=0;n:={0,0,1};armA:=zeros(3);armB:=zeros(3);contactVelocity:=zeros(3);
        if abs(centre[1])<4.6 and abs(centre[2])<2.2 and centre[3]>-1.6 and centre[3]<2.2 then
          for i in 1:size(guards,1) loop
            arm:=transpose(subT)*guards[i,1:3];
            hit:=Shore.hullMeshGap(centre+boatT*arm,vertices,faces);
            gap:=hit[1]-guards[i,4];
            if gap<best then
              best:=gap;n:=transpose(boatT)*hit[2:4];
              armA:=arm-guards[i,4]*n;armB:=offset+arm-hit[1]*n;
            end if;
          end for;
        end if;
        if centre[1]>-4.8 and centre[1]<0 and centre[2]>-1.6 and centre[2]<4.2 and centre[3]>-2 and centre[3]<3 then
          lift:=if localIsSub then peerLiftStates[peer,:] else localLift;
          motion:=PortLift.motion(lift[1]);
          for feature in 1:PortLift.count loop
            box:=PortLift.transformBox(feature,PortLift.referenceBox(feature),motion);
            relative:=centre-box[1:3];
            // A 0.4 m sphere encloses the Piccard guards in any attitude.
            if relative*relative<(.4+sqrt(box[4:6]*box[4:6]))^2 then
              boxCentre:=transpose(boatT)*box[1:3];
              basis:=[box[7],box[8],box[9];box[10],box[11],box[12];box[13],box[14],box[15]]*boatT;
              for i in 1:size(guards,1) loop
                arm:=transpose(subT)*guards[i,1:3];
                probe:=.Collision.sphereBox(sub[2:4],arm,guards[i,4],boat[2:4],boxCentre,basis,box[4:6]);
                if probe.gap<best then
                  best:=probe.gap;n:=probe.n;armA:=probe.armA;armB:=probe.armB;
                  contactVelocity:=PortLift.pointVelocity(feature,motion,lift[2],boatT*armB);
                end if;
              end for;
            end if;
          end for;
        end if;
        if best<0 then
          point:=.Collision.ContactPoint(gap=best,n=n,armA=armA,armB=armB);
          liftVelocity:=boat[9:11]+transpose(boatT)*contactVelocity;
          (f,m,reaction,moment):=.Collision.pairWrenches(point,sub[9:11],sub[12:14],liftVelocity,boat[12:14],material);
          load:=load+(if localIsSub then cat(1,f,m) else cat(1,reaction,moment));
        end if;
      end if;
    end if;
  end for;
end peerHullLoad;
