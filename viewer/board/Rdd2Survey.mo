model Rdd2Survey "CogniPilot RDD2 hovering over the wreck survey area"
  model LaunchAircraft "Release a carried airframe into unconstrained rigid-body flight"
    extends Vehicles.Rdd2.Plant;
    input Boolean release;
    input Real releasePosition[3],releaseVelocity[3],releaseQuaternion[4],releaseRate[3];
  equation
    when release then
      reinit(dynamics.p,releasePosition);
      reinit(dynamics.v_b,releaseVelocity);
      reinit(dynamics.q,releaseQuaternion);
      reinit(dynamics.omega,releaseRate);
    end when;
  end LaunchAircraft;
  input Real windENU[3] "Wind velocity at the aircraft [m/s]";
  input Real rotorWakeTraffic[4,12]=zeros(4,12)
    "Source type (0 empty, 1 measured rotors, 2 scripted patrol), ENU position, WXYZ quaternion, four speeds [rad/s]";
  parameter Real propellerRadius=.125 "Effective RDD2 rotor disk radius [m]";
  parameter Real washThrustSensitivity=.035 "Fractional thrust loss per m/s of incident axial wash";
  output Real rotorWakeWind[3] "Added air velocity at the vehicle center [m/s]";
  output Real rotorWakeWrench[6] "Rotor thrust correction, then moment, in ENU [N, N.m]";
  function rotorWake "Momentum-based Gaussian rotor jets sampled at the frame and each receiving rotor"
    input Real position[3],orientation[4],omega[4],wind[3],sources[4,12],hub[4,3];
    input Real thrustCoefficient,hoverOmega,maxOmega,radius,thrustSensitivity;
    output Real centerWind[3],wrench[6];
  protected
    constant Real airDensity=1.225;
    Real receiveRotation[3,3],sourceRotation[3,3],arm[4,3],point[5,3],wakeVelocity[5,3];
    Real up[3],down[3],drift[3],center[3],relative[3],radial[3],force[3];
    Real induced[4],sourcePower[5], axial,radial2,width,peak,onset,loss,maxInduced;
    Boolean receiving;
  algorithm
    centerWind:=zeros(3);
    wrench:=zeros(6);
    receiving:=false;
    for i in 1:4 loop
      relative:=position-sources[i,2:4];
      receiving:=receiving or (sources[i,1]>.5 and relative*relative<144);
    end for;
    if receiving then
      receiveRotation:=transpose(MultiBodyLie.Math.quaternionToT(orientation));
      up:=receiveRotation[:,3];
      point[1,:]:=position;
      for j in 1:4 loop
        arm[j,:]:=receiveRotation*hub[j,:];
        point[j+1,:]:=position+arm[j,:];
      end for;
      wakeVelocity:=zeros(5,3);
      for i in 1:4 loop
        relative:=position-sources[i,2:4];
        if sources[i,1]>.5 and relative*relative<144 then
          for k in 1:4 loop
            // Actuator-disk induced velocity at the source rotor.
            induced[k]:=sqrt(thrustCoefficient/(2*airDensity*Modelica.Constants.pi*radius^2))*
              (if sources[i,1]>1.5 then hoverOmega else min(maxOmega,max(0,sources[i,k+8])));
          end for;
          maxInduced:=max(induced);
          if maxInduced>.01 then
            sourceRotation:=transpose(MultiBodyLie.Math.quaternionToT(sources[i,5:8]));
            down:=-sourceRotation[:,3];
            drift:=wind-(wind*down)*down;
            drift:=drift/max(2*maxInduced,sqrt(drift*drift));
            sourcePower:=zeros(5);
            for k in 1:4 loop
              center:=sources[i,2:4]+sourceRotation*hub[k,:];
              for j in 1:5 loop
                relative:=point[j,:]-center;
                axial:=relative*down;
                if axial>0 and axial<12 then
                  radial:=relative-axial*(down+drift);
                  radial2:=radial*radial;
                  width:=.72*radius+.20*axial;
                  if radial2<20*width^2 then
                    // The integral of rho*V^2 over a circular Gaussian jet is
                    // rho*pi*width^2*peak^2. Rotor momentum adds where jets overlap.
                    peak:=sqrt(2)*induced[k]*radius/width;
                    onset:=min(1,axial/radius);
                    sourcePower[j]:=sourcePower[j]+peak^2*exp(-radial2/width^2)*
                      (onset^2*(3-2*onset))^2*(1-(axial/12)^2)^2;
                  end if;
                end if;
              end for;
            end for;
            for j in 1:5 loop
              wakeVelocity[j,:]:=wakeVelocity[j,:]+sqrt(sourcePower[j])*down;
            end for;
          end if;
        end if;
      end for;
      centerWind:=wakeVelocity[1,:];
      for j in 1:4 loop
        // First-order change in thrust coefficient with axial inflow at fixed RPM.
        loss:=thrustCoefficient*omega[j]^2*min(.75,thrustSensitivity*max(0,-(wakeVelocity[j+1,:]*up)));
        force:=-loss*up;
        wrench[1:3]:=wrench[1:3]+force;
        wrench[4:6]:=wrench[4:6]+cross(arm[j,:],force);
      end for;
    end if;
  end rotorWake;
  parameter Real bedHeight=-13.71, displacedVolume=0 "Flooded vehicle displacement [m3]";
  parameter Real waterDragArea=.075,bodyHeight=.16;
  input Real motorCut,waterLevel,currentENU[3];
  output Real immersed;
  Real waterSlip[3],waterLoad[3];
  input Real droneTraffic[4,14]=zeros(4,14) "Active, ENU position, WXYZ quaternion, ENU linear and angular velocity";
  discrete output Real droneContactWrench[6](each start=0,each fixed=true) "Drone contact force and moment in ENU";
  LaunchAircraft aircraft(initialGroundClearance_m=initialAltitude-.10-bedHeight,groundAltitude=bedHeight,
    release=launchRise>=launchClearance,releasePosition=carrierPosition-{activeOrigin[1],activeOrigin[2],0},
    releaseVelocity=transpose(carrierAttitude)*carrierVelocity,releaseQuaternion=carrierQuaternion,
    releaseRate=transpose(carrierAttitude)*deckState[10:12],
    windWorld=windENU+rotorWakeWind,exposedFraction=1-immersed,
    fluidForceWorld=waterLoad+landingWrench[1:3]+droneContactWrench[1:3]+(1-immersed)*rotorWakeWrench[1:3],
    contactMomentWorld=landingWrench[4:6]+droneContactWrench[4:6]+(1-immersed)*rotorWakeWrench[4:6]);

  input Real deckEnabled,deckState[12];
  parameter Boolean carrierLaunch=false "Initialize on the committee launch";
  parameter Boolean islandLaunch=false "Initialize on the island helipad";
  final parameter Real islandPad[3]={36,34,Shore.sandHeightUpperBound(36,34,1.5)+.05};
  final parameter Real initialAltitude=if islandLaunch then islandPad[3]+.10 else 5;
  parameter Real launchClearance=.90 "Deck-normal distance flown before release";
  output Real onCarrier=if noEvent(launchRise>=0 and launchRise<launchClearance) then 1.0 else 0.0;
  Real launchRise(start=if carrierLaunch then 0 else -1,fixed=true),launchSpeed;
  Real carrierFrame[3,3],carrierAttitude[3,3],carrierArm[3],carrierPosition[3],carrierVelocity[3];
  Real deckQuaternion[4],carrierQuaternion[4],carrierWeight[3],deckLocal[3],deckRelativeVelocity[3];
  final parameter Real padRest[3]=Shore.committeePadCenter+{0,0,.10};
  Real deckTouchTime(start=0,fixed=true),dockedOffset[3](start=padRest,each fixed=true),dockedYaw(start=0,fixed=true);
  Real velocityENU[3];
  Real islandPadWrench[12];
  input Real sailDeckEnabled,sailDeckState[12],isCatamaran;
  input Real vesselDecks[4,14]=zeros(4,14) "Active, surface kind, ENU deck pose and twist";
  input Real autoLand=0,landingCue[6]=zeros(6) "Visual lock, east/north offset, height above pad, east/north pad velocity";
  input Real landingRange[2]=zeros(2) "Valid solid laser return and body height above the return [m]";
  output Integer landingState "0 manual, 1 searching, 2 aligning, 3 descending, 4 landed";
  Boolean landing,locked,aligned,landingHeightReached;
  Real landingDwell(start=0,fixed=true),landingError,descendingSpeed;
  output Real vesselDeckWrenches[4,12] "Contact on aircraft then each vessel, in ENU";
  output Real terrainWrench[6] "Contact on aircraft from island sand and boulders, in ENU";
  Real landingWrench[6],minimumVesselHeight[4],nearbySand;
  output Real sailWrench[12] "Contact on aircraft then sailboat in ENU";
  output Real deckWrench[12] "World force and torque on drone then launch";
  final parameter Real droneContactParts[9,8,3]=Shore.droneParts();
  final parameter Real droneContactRadius=sqrt(max({sum(droneContactParts[part,i,:].^2) for part in 1:9, i in 1:8}));
  final parameter Real droneContactLower[3]={min(droneContactParts[:,:,axis]) for axis in 1:3};
  final parameter Real droneContactUpper[3]={max(droneContactParts[:,:,axis]) for axis in 1:3};
  final parameter Integer droneContactFaces[12,3]=Shore.boxFaces();




  import Geometry = .Collision;

  function droneMeshContacts "Compliant contact forces and moments from nearby RDD2 mesh components"
    input Real traffic[4,14],position[3],quaternion[4],velocity[3],bodyRate[3],parts[9,8,3];
    input Integer faces[12,3];
    output Real wrench[6];
  protected
    Real ownRotation[3,3],peerRotation[3,3],relative[3],partA[9,8,3],partB[9,8,3],boundsA[9,2,3],boundsB[9,2,3];
    Real candidate[4],gap,normal[3],contact[3],force[3],moment[3],reaction[3],reactionMoment[3];
    Integer partI,partJ;
    Boolean ready;
    Geometry.ContactPoint point;
    Geometry.Material material(k=2000,d=.55,mu=.32,eps=.0003,v_eps=.08);
  algorithm
    wrench:=zeros(6);
    ready:=false;
    for peer in 1:4 loop
      relative:=traffic[peer,2:4]-position;
      ready:=ready or (traffic[peer,1]>.5 and relative*relative<.69^2);
    end for;
    if not ready then return; end if;
    ownRotation:=transpose(MultiBodyLie.Math.quaternionToT(quaternion));
    partA:=zeros(9,8,3);
    boundsA:=zeros(9,2,3);
    for i in 1:9 loop
      for j in 1:8 loop
        partA[i,j,:]:=ownRotation*parts[i,j,:];
      end for;
      for k in 1:3 loop
        boundsA[i,1,k]:=min(partA[i,:,k]);
        boundsA[i,2,k]:=max(partA[i,:,k]);
      end for;
    end for;
    for peer in 1:4 loop
      relative:=traffic[peer,2:4]-position;
      if traffic[peer,1]>.5 and relative*relative<.69^2 then
        peerRotation:=transpose(MultiBodyLie.Math.quaternionToT(traffic[peer,5:8]));
        partB:=zeros(9,8,3);
        boundsB:=zeros(9,2,3);
        for i in 1:9 loop
          for j in 1:8 loop
            partB[i,j,:]:=relative+peerRotation*parts[i,j,:];
          end for;
          for k in 1:3 loop
            boundsB[i,1,k]:=min(partB[i,:,k]);
            boundsB[i,2,k]:=max(partB[i,:,k]);
          end for;
        end for;
        gap:=0;
        normal:=zeros(3);
        partI:=1;
        partJ:=1;
        for i in 1:9 loop
          for j in 1:9 loop
          if Geometry.aabbOverlap(boundsA[i,1,:],boundsA[i,2,:],boundsB[j,1,:],boundsB[j,2,:]) then
              candidate:=Geometry.hexahedronGap(partA[i,:,:],partB[j,:,:],faces);
              if candidate[1]<gap then
                gap:=candidate[1];
                normal:=candidate[2:4];
                partI:=i;
                partJ:=j;
              end if;
            end if;
          end for;
        end for;
        if gap<0 then
          // The strongest contact per airframe pair avoids counting overlapping
          // mounting pieces as extra stiffness.
          contact:=.5*(Geometry.meanSupportPoint(partA[partI,:,:],-normal)+Geometry.meanSupportPoint(partB[partJ,:,:],normal));
          gap:=max(-.065,gap);
          point:=Geometry.ContactPoint(gap,normal,contact+.5*gap*normal,contact-relative-.5*gap*normal);
          (force,moment,reaction,reactionMoment):=Geometry.pairWrenches(point,velocity,ownRotation*bodyRate,
            traffic[peer,9:11],traffic[peer,12:14],material);
          wrench:=wrench+cat(1,force,moment);
        end if;
      end if;
    end for;
  end droneMeshContacts;

  function pointBoxGap "Exact signed gap to the faces of a triangulated box"
    input Real p[3],lo[3],hi[3];
    output Real gap[4];
  protected
    Geometry.ContactPoint hit;
  algorithm
    hit:=Geometry.sphereBox(p,zeros(3),0,(lo+hi)/2,zeros(3),identity(3),(hi-lo)/2);
    gap:=cat(1,{hit.gap},hit.n);
  end pointBoxGap;

  function islandContact "Aircraft vertex contacts against the island's sand and boulder mesh"
    input Real p[3],quat[4],v[3],bodyRate[3],parts[9,8,3],radius,lower[3],upper[3];
    output Real wrench[6];
  protected
    Real A[3,3],w[3],r[3],site[3],contact[5],lowest,upperSurface;
    Boolean candidates[46];
  algorithm
    wrench:=zeros(6);
    A:=transpose(MultiBodyLie.Math.quaternionToT(quat));
    lowest:=p[3]+Geometry.boundsProjectionMin(lower,upper,A[3,:]);
    if not Shore.clearOfShore(p[1],p[2],lowest,radius) then
      (candidates,upperSurface):=Shore.rockCandidates(p,radius);
      upperSurface:=max(upperSurface,Shore.sandHeightUpperBound(p[1],p[2],radius));
      w:=A*bodyRate;
      for part in 1:9 loop
        for i in 1:8 loop
          r:=A*parts[part,i,:];
          site:=p+r;
          if site[3]<=upperSurface then
            contact:=Shore.skinContact(site,1,0,v+cross(w,r),23,candidates=candidates);
            wrench:=wrench+cat(1,contact[1:3],cross(r,contact[1:3]));
          end if;
        end for;
      end for;
    end if;
  end islandContact;

  function cruiserDeckGap "Contact with walkable surfaces of the modeled cabin cruiser"
    input Real site[3],center[3];
    output Real gap[4];
  protected
    // Roof, windshield, foredeck, cockpit sole, engine hatch and swim platform.
    // Each panel gives z at x=0, dz/dx, its x limits and half-beam at each end.
    constant Real panels[7,6]=[2.207,0,-1.24,.82,.98,.93;2.51,-.728,1.19,1.83,.85,.65;
      .902,.117,1.18,2.93,1.02,.58;.824,.137,2.93,3.80,.58,.012;
      .535,0,-3.68,1.12,1.045,1.14;.571,0,-2.645,-1.615,.375,.375;
      .185,0,-4.16,-3.65,.93,1.05];
    Real x,w,h,d,slope;
  algorithm
    x:=site[1];gap:={1,0,0,1};
    for panel in 1:7 loop
      if x>=panels[panel,3] and x<=panels[panel,4] then
        w:=panels[panel,5]+(panels[panel,6]-panels[panel,5])*(x-panels[panel,3])/(panels[panel,4]-panels[panel,3]);
        slope:=panels[panel,2];h:=panels[panel,1]+slope*x;
        if abs(site[2])<=w and center[3]>h and site[3]>h-.34 then
          d:=sqrt(1+slope^2);
          if (site[3]-h)/d<gap[1] then
            gap:={(site[3]-h)/d,-slope/d,0,1/d};
          end if;
        end if;
      end if;
    end for;
  end cruiserDeckGap;

  function committeeObstacleContact "Convex contact against the launch fittings and wind flag"
    input Real frame[3,3],airframe[3,3],center[3],v[3],w[3],deck[12],parts[9,8,3],flagYaw;
    output Real result[12];
  protected
    final parameter Integer n=Shore.committeeFittingCount;
    final parameter Real fittings[n,8,3]=Shore.committeeFittings();
    final parameter Integer faces[12,3]=Shore.boxFaces();
    Real obstacle[8,3],vertices[8,3],bounds[2,3],body[3,3],gap[4],best[4],normal[3],contact[3],arm[3];
    Real f[3],m[3],fb[3],mb[3],flagFrame[3,3],origin[3],lower[3],upper[3],penetration;
    Boolean nearby[n+1];
    Geometry.Material hard(k=2400,d=7,mu=.45,eps=.0003,v_eps=.08);
    Geometry.Material fabric(k=260,d=5,mu=.22,eps=.0003,v_eps=.08);
    Geometry.ContactPoint pt;
  algorithm
    result:=zeros(12);
    for obstacleIndex in 1:n loop
      nearby[obstacleIndex]:=Geometry.aabbOverlap(center-fill(.36,3),center+fill(.36,3),
        fittings[obstacleIndex,1,:],fittings[obstacleIndex,8,:]);
    end for;
    // The landing gear uses the roof's analytic box contact below.
    nearby[2]:=false;
    nearby[n+1]:=abs(center[3]-3.60)<.76 and (center[1]-Shore.committeeMastX)^2+center[2]^2<1.35^2;
    if not Modelica.Math.BooleanVectors.anyTrue(nearby) then return; end if;
    body:=frame*airframe;
    flagFrame:=[cos(flagYaw),-sin(flagYaw),0;sin(flagYaw),cos(flagYaw),0;0,0,1];
    for obstacleIndex in 1:n+1 loop
      if nearby[obstacleIndex] then
        if obstacleIndex<=n then
          obstacle:=fittings[obstacleIndex,:,:];
        else
          obstacle:=Shore.boxVertices({.49,0,3.60},{.49,.06,.38});
          for i in 1:8 loop
            obstacle[i,:]:={Shore.committeeMastX,0,0}+flagFrame*obstacle[i,:];
          end for;
        end if;
        for axis in 1:3 loop
          lower[axis]:=min(obstacle[:,axis]);upper[axis]:=max(obstacle[:,axis]);
        end for;
        best:=zeros(4);origin:=zeros(3);
        for part in 1:9 loop
          for i in 1:8 loop
            vertices[i,:]:=center+body*parts[part,i,:];
          end for;
          for axis in 1:3 loop
            bounds[1,axis]:=min(vertices[:,axis]);bounds[2,axis]:=max(vertices[:,axis]);
          end for;
          if Geometry.aabbOverlap(bounds[1,:],bounds[2,:],lower,upper) then
            gap:=Geometry.hexahedronGap(vertices,obstacle,faces);
            if gap[1]<best[1] then
              best:=gap;
              origin:=.5*(Geometry.meanSupportPoint(vertices,-gap[2:4])+Geometry.meanSupportPoint(obstacle,gap[2:4]));
            end if;
          end if;
        end for;
        if best[1]<0 then
          normal:=transpose(frame)*best[2:4];contact:=transpose(frame)*origin;
          arm:=contact-transpose(frame)*center;
          penetration:=max(-.06,best[1]);
          pt:=Geometry.ContactPoint(penetration,normal,arm+.5*penetration*normal,contact-.5*penetration*normal);
          (f,m,fb,mb):=Geometry.pairWrenches(pt,v,w,deck[7:9],deck[10:12],
            if obstacleIndex<=n then hard else fabric);
          result:=result+cat(1,f,m,fb,mb);
        end if;
      end if;
    end for;
  end committeeObstacleContact;

  function landingContact "Vertex-to-face contact from the drone's convex mesh components"
    input Real enabled,deck[12],p[3],quat[4],v[3],bodyRate[3],parts[9,8,3];
    input Real surfaceKind "0 committee launch, 1 trampoline, 2 sloop hatch, 3 cabin cruiser, 4 island pad";
    input Real wind[2]=zeros(2);
    output Real result[12];
  protected
    final parameter Real launch[42,3]=Shore.committeeVertices();
    final parameter Integer launchFaces[80,3]=Shore.committeeFaces();
    Real A[3,3],B[3,3],r[3],delta[3],w[3],f[3],m[3],fb[3],mb[3],y,a,b;
    Real local[3],center[3],gap[4],deckBox[8,3];
    Boolean aboveDeck,nearRoof;
    Geometry.Material rubber(k=650,d=5,mu=.9,eps=.0003,v_eps=.08);
    Geometry.ContactPoint pt;
  algorithm
    result:=zeros(12);delta:=p-deck[1:3];
    if enabled>.5 and delta*delta<(if surfaceKind>2.5 then 24 elseif surfaceKind<.5 then 21 else 17) then
      y:=deck[4];a:=deck[5];b:=-deck[6];
      B[1,:]:={cos(y)*cos(b),sin(y)*cos(b),-sin(b)};
      B[2,:]:={cos(y)*sin(b)*sin(a)-sin(y)*cos(a),sin(y)*sin(b)*sin(a)+cos(y)*cos(a),cos(b)*sin(a)};
      B[3,:]:=cross(B[1,:],B[2,:]);
      center:=B*delta;
      if (surfaceKind<.5 and center[3]<4.35 and center[3]>-.6 and abs(center[2])<1.55) or
         (surfaceKind>=.5 and surfaceKind<2.5 and abs(center[3]-(if surfaceKind<1.5 then .40 else .154))<.39) or
         (surfaceKind>=2.5 and surfaceKind<3.5 and center[3]>.15 and center[3]<2.58 and abs(center[2])<1.45) or
         (surfaceKind>=3.5 and center[3]>-.12 and center[3]<.45 and max(abs(center[1:2]))<1.8) then
        A:=transpose(MultiBodyLie.Math.quaternionToT(quat));
        w:=A*bodyRate;
        nearRoof:=surfaceKind<.5 and abs(center[3]-Shore.committeePadCenter[3]+.04)<.35 and
          abs(center[1])<Shore.committeeRoofHalf[1]+.31 and abs(center[2])<Shore.committeeRoofHalf[2]+.31;
        if surfaceKind<.5 then
          result:=committeeObstacleContact(B,A,center,v,w,deck,parts,atan2(wind[2],wind[1])-y);
        end if;
        // Above the hull crown plus the airframe radius, only fittings can touch.
        if surfaceKind>=.5 or center[3]<=1.409 or nearRoof then
          deckBox:=if nearRoof then Shore.boxVertices(Shore.committeePadCenter-{0,0,.04},cat(1,Shore.committeeRoofHalf,{.04}))
            elseif surfaceKind<1.5 then Shore.boxVertices({-.425,0,.40},{.975,.97,.014})
            else Shore.boxVertices({-.27,0,.154},{.37,.20,.0045});
          aboveDeck:=center[3]>deckBox[8,3];
          for part in 1:9 loop
            for i in 1:8 loop
              r:=A*parts[part,i,:];
              local:=B*(delta+r);
              if surfaceKind<.5 and not nearRoof then
                if local[3]>.784+.12*max(0,local[1]-1) then
                  gap:={1,0,0,1};
                elseif local[1]>=-2.75 and local[1]<=.9 and abs(local[2])<=.80 and local[3]>=.70 then
                  // In the interior of the flat deck, its triangle plane is
                  // the closest hull feature. The edges are farther away.
                  gap:={local[3]-.78,0,0,1};
                else
                  gap:=Shore.committeeGap(local,launch,.004,launchFaces);
                end if;
              elseif surfaceKind>3.5 then
                gap:=if max(abs(local[1:2]))<=1.35 then {local[3],0,0,1} else {1,0,0,1};
              elseif surfaceKind>2.5 then
                gap:=cruiserDeckGap(local,center);
              else
                // Use the upper triangle while descending onto a thin deck.
                // Its underside must not reverse the landing force after overlap.
                gap:=if aboveDeck and local[1]>=deckBox[1,1] and local[1]<=deckBox[8,1] and
                  local[2]>=deckBox[1,2] and local[2]<=deckBox[8,2] then {local[3]-deckBox[8,3],0,0,1}
                  else pointBoxGap(local,deckBox[1,:],deckBox[8,:]);
              end if;
              if gap[1]<.0024 then
                // Four corners of a landing foot share its original support stiffness.
                pt.gap:=gap[1];
                pt.armA:=r;
                pt.n:=transpose(B)*gap[2:4];
                pt.armB:=delta+r-pt.gap*pt.n;
                (f,m,fb,mb):=Geometry.pairWrenches(pt,v,w,deck[7:9],deck[10:12],rubber);
                result:=result+cat(1,f,m,fb,mb);
              end if;
            end for;
          end for;
        end if;
      end if;
    end if;
  end landingContact;

  function vesselContacts "Evaluate contact only for the active nearby vessel decks"
    input Real decks[4,14],p[3],quat[4],v[3],bodyRate[3],parts[9,8,3];
    output Real wrenches[4,12];
  algorithm
    wrenches:=zeros(4,12);
    for i in 1:4 loop
      if decks[i,1]>.5 then
        wrenches[i,:]:=landingContact(decks[i,1],decks[i,3:14],p,quat,v,bodyRate,parts,decks[i,2]);
      end if;
    end for;
  end vesselContacts;

  function predictNavigation
    input Real state[9] "Position, velocity, accelerometer bias, and six covariance terms";
    input Real acceleration, step;
    output Real predicted[9];
  protected
    Real halfStepSquared, accelerationVariance, biasVariance;
  algorithm
    halfStepSquared := .5*step^2;
    accelerationVariance := .25;
    biasVariance := state[9];
    predicted[1] := state[1]+step*state[2]+halfStepSquared*(acceleration-state[3]);
    predicted[2] := state[2]+step*(acceleration-state[3]);
    predicted[3] := state[3];
    predicted[4] := state[4]+2*step*state[5]-2*halfStepSquared*state[6]+step^2*state[7]
      -2*step*halfStepSquared*state[8]+halfStepSquared^2*(biasVariance+accelerationVariance);
    predicted[5] := state[5]+step*state[7]-halfStepSquared*state[8]
      -step*(state[6]+step*state[8]-halfStepSquared*biasVariance)+halfStepSquared*step*accelerationVariance;
    predicted[6] := state[6]+step*state[8]-halfStepSquared*biasVariance;
    predicted[7] := state[7]-2*step*state[8]+step^2*(biasVariance+accelerationVariance);
    predicted[8] := state[8]-step*biasVariance;
    predicted[9] := biasVariance+.0004*step;
  end predictNavigation;

  function updateNavigation
    input Real state[9] "Position, velocity, accelerometer bias, and six covariance terms";
    input Real observation, variance;
    input Boolean positionFix;
    output Real corrected[9];
  protected
    Real covariance[3], innovation, precision;
  algorithm
    covariance := if positionFix then state[4:6] else {state[5],state[7],state[8]};
    innovation := observation-(if positionFix then state[1] else state[2]);
    precision := 1/((if positionFix then covariance[1] else covariance[2])+variance);
    corrected[1:3] := state[1:3]+precision*innovation*covariance;
    corrected[4:9] := state[4:9]-precision*{covariance[1]^2,covariance[1]*covariance[2],
      covariance[1]*covariance[3],covariance[2]^2,covariance[2]*covariance[3],covariance[3]^2};
  end updateNavigation;

  function navigateAxis
    input Real state[9], acceleration, step, gpsPosition, gpsVelocity, positionVariance, velocityVariance;
    input Boolean fixAvailable;
    output Real estimate[9];
  algorithm
    estimate := predictNavigation(state,acceleration,step);
    if fixAvailable then
      estimate := updateNavigation(estimate,gpsPosition,positionVariance,true);
      estimate := updateNavigation(estimate,gpsVelocity,velocityVariance,false);
    end if;
  end navigateAxis;

  function airVelocityFromDrag
    input Real force[3], linearDrag[3], quadraticDrag[3];
    output Real velocity[3];
  protected
    Real lo,hi,speed;
  algorithm
    // F = -v * (linearDrag + quadraticDrag * ||v||) on each body axis.
    lo := 0;
    velocity := -force./linearDrag;
    hi := sqrt(velocity*velocity);
    for i in 1:14 loop
      speed := .5*(lo+hi);
      velocity := -force./(linearDrag+quadraticDrag*speed);
      if velocity*velocity > speed^2 then
        lo := speed;
      else
        hi := speed;
      end if;
    end for;
  end airVelocityFromDrag;

  function updateWind
    input Real state[3] "East and north wind velocity, common marginal variance";
    input Real observation[2];
    input Boolean valid;
    output Real estimate[3];
  protected
    Real variance, gain;
  algorithm
    variance := min(64,state[3]+(if valid then .045 else .2));
    gain := if valid then variance/(variance+.64) else 0;
    estimate := cat(1,state[1:2]+gain*(observation-state[1:2]),{(1-gain)*variance});
  end updateWind;

  function updateEstimator
    input Real previous[37];
    input Real instant, step, position[3], velocity[3], specificForce[3], rotation[3,3];
    input Real rotorForce, mass, linearDrag[3], quadraticDrag[3];
    input Boolean gpsAvailable, windAvailable;
    output Real next[37];
  protected
    Real acceleration[3], measuredPosition[3], measuredVelocity[3], aircraftAirspeed[3];
    Boolean gpsTick;
  algorithm
    // GNSS fixes every fifth 50 Hz prediction. Add bounded deterministic
    // measurement error so that identical inputs reproduce the same flight.
    gpsTick := previous[37]<.5;
    measuredPosition := if gpsTick and gpsAvailable then position+
      {.06*sin(48.7*instant),.06*sin(31.4*instant),.09*sin(41.7*instant)} else previous[28:30];
    measuredVelocity := if gpsTick and gpsAvailable then velocity+
      {.02*sin(37.5*instant),.02*sin(43.1*instant),.03*sin(24.1*instant)} else previous[31:33];
    acceleration := rotation*specificForce-{0,0,9.80665};
    next[1:9] := navigateAxis(previous[1:9],acceleration[1],step,measuredPosition[1],measuredVelocity[1],
      .002,.0002,gpsTick and gpsAvailable);
    next[10:18] := navigateAxis(previous[10:18],acceleration[2],step,measuredPosition[2],measuredVelocity[2],
      .002,.0002,gpsTick and gpsAvailable);
    next[19:27] := navigateAxis(previous[19:27],acceleration[3],step,measuredPosition[3],measuredVelocity[3],
      .005,.0005,gpsTick and gpsAvailable);
    next[28:30] := measuredPosition;
    next[31:33] := measuredVelocity;
    next[34:36] := previous[34:36];
    if gpsTick then
      aircraftAirspeed := rotation*airVelocityFromDrag(mass*specificForce-{0,0,rotorForce},linearDrag,quadraticDrag);
      next[34:36] := updateWind(previous[34:36],{next[2],next[11]}-aircraftAirspeed[1:2],windAvailable);
    end if;
    next[37] := if previous[37]>=4 then 0 else previous[37]+1;
  end updateEstimator;

  output Real dragBody[3]=aircraft.aerodynamicDrag;
  parameter Real origin[2]={-5,0} "Default survey launch coordinates ENU";
  final parameter Real activeOrigin[2]=if islandLaunch then islandPad[1:2] else origin;
  input Real pilot,forward,left,climb,turn,stationEast,stationNorth;
  input Real raceNavigation=0 "Use the faster waypoint profile during race autopilot";
  input Real flightMode(start=0) "Manual modes: 0 position hold, 1 auto level, 2 acro";
  Boolean positionHold,acro;
  parameter Real maxBodyRate=4.2,maxYawRate=2.2 "Manual rate limits [rad/s]";
  final parameter Real maxThrust=4*aircraft.thrustCoefficient_N_s2*aircraft.omegaMax^2;
  final parameter Real hoverFraction=aircraft.vehicleMass_kg*9.80665/maxThrust;
  Real throttle(start=hoverFraction,fixed=true) "Manual collective fraction; R/F adjust and release retains";
  Real gyroQ[4](start={1,0,0,0},each fixed=true),rotation[3,3],bodyRate[3];
  output Real position[3],quaternion[4],rotorSpeed[4];
  output Real rotorAngle[4](each start=0,each fixed=true);
  final parameter Real launchPosition[3]={activeOrigin[1],activeOrigin[2],initialAltitude};
  Real target[3](start=launchPosition,each fixed=true),yawTarget(start=0,fixed=true);
  Real attitude[3];
  input Real gpsDropout(start=0) "Suppress simulated GNSS fixes when greater than .5";
  Real gps[3],gpsVelocity[3];
  final parameter Real navigationStep=.02 "Inertial prediction interval [s]";
  final parameter Real navigationPrior[8]={0,0,.04,0,0,.01,0,.01};
  final parameter Real estimatorStart[37]=cat(1,{launchPosition[1]},navigationPrior,{launchPosition[2]},
    navigationPrior,{launchPosition[3]},navigationPrior,launchPosition,{0,0,0,0,0,64,0});
  discrete Real estimator[37](start=estimatorStart,each fixed=true);
  output Real estimatedPosition[3],estimatedVelocity[3];
  output Real positionCovariance[3],velocityCovariance[3] "Marginal variances in East, North, Up order";
  Real rotorForce;
  // Calibrated nominal RDD2 drag parameters for dry flight.
  parameter Real navigationLinearDrag[3]={.12,.12,.18};
  parameter Real navigationQuadraticDrag[3]=.5*1.225*{.06,.08,.12};
  output Real estimatedWindENU[2],windCovariance,windEstimateValid;
  parameter Real holdIntegralGain=.36 "Position-loop integral gain [1/s3]";
  parameter Real maxIntegralAcceleration=6 "Bound on sustained disturbance rejection [m/s2]";
  parameter Real tiltLimit=.72 "Maximum roll or pitch for station keeping [rad]";
  parameter Real raceSpeed=8 "Maximum commanded horizontal speed [m/s]";
  parameter Real raceBraking=2.5 "Deceleration used to plan the waypoint approach [m/s2]";
  Real raceError[2],raceDistance,raceVelocity[2];
  Real integralAcceleration[3](each start=0,each fixed=true);
  Real forwardAcceleration,leftAcceleration,upAcceleration;
  Real minimumTargetHeight;
  Real desired[3],acceleration[3],rollTarget,pitchTarget,collective,holdCollective,contactUnload,torque[3],motorThrust[4];

equation
  nearbySand=if noEvent(max(abs(position[1:2]-islandPad[1:2]))<1.35) then islandPad[3] else Shore.seabed(position[1],position[2]);
  launchSpeed=if deckEnabled>.5 and motorCut<=.5 then max(0,min(1,climb)) else 0;
  der(launchRise)=if onCarrier>.5 then launchSpeed else 0;
  when launchRise>=launchClearance then
    reinit(gyroQ,carrierQuaternion);
    reinit(target,carrierPosition);
    reinit(yawTarget,deckState[4]+dockedYaw);
    reinit(integralAcceleration,zeros(3));
  end when;
  deckQuaternion=LieGroups.SO3.EulerB321.to_Quat({deckState[4],-deckState[6],deckState[5]});
  carrierQuaternion=LieGroups.SO3.Quat.product(deckQuaternion,LieGroups.SO3.EulerB321.to_Quat({dockedYaw,0,0}));
  carrierFrame=LieGroups.SO3.Quat.to_DCM(deckQuaternion);
  carrierAttitude=LieGroups.SO3.Quat.to_DCM(carrierQuaternion);
  carrierArm=carrierFrame*(dockedOffset+{0,0,launchRise});
  carrierPosition=deckState[1:3]+carrierArm;
  carrierVelocity=deckState[7:9]+cross(deckState[10:12],carrierArm)+launchSpeed*carrierFrame[:,3];
  carrierWeight={0,0,-aircraft.vehicleMass_kg*9.80665};
  velocityENU=if onCarrier>.5 then carrierVelocity else aircraft.truth.velocityWorldEnu_m_s;
  deckLocal=transpose(carrierFrame)*(aircraft.truth.positionWorldEnu_m+{activeOrigin[1],activeOrigin[2],0}-deckState[1:3]);
  deckRelativeVelocity=velocityENU-deckState[7:9]-cross(deckState[10:12],carrierFrame*deckLocal);
  der(dockedOffset)=zeros(3);
  der(dockedYaw)=0;
  der(deckTouchTime)=if noEvent(onCarrier<.5 and deckEnabled>.5 and abs(deckLocal[1]-padRest[1])<.36 and
      abs(deckLocal[2])<.32 and abs(deckLocal[3]-padRest[3])<.12 and deckWrench[1:3]*carrierFrame[:,3]>3 and
      deckRelativeVelocity*deckRelativeVelocity<.22^2 and (autoLand>.5 or motorCut>.5)) then 1 else -6*deckTouchTime;
  when deckTouchTime>=.24 then
    reinit(launchRise,0);
    reinit(dockedOffset,{deckLocal[1],deckLocal[2],padRest[3]});
    reinit(dockedYaw,aircraft.truth.eulerRpy_rad[3]-deckState[4]);
  end when;
  islandPadWrench=landingContact(if onCarrier>.5 then 0 else 1,cat(1,islandPad,zeros(9)),position,quaternion,
    velocityENU,aircraft.truth.angularVelocityBodyFlu_rad_s,droneContactParts,4);
  terrainWrench=if noEvent(onCarrier<.5 and abs(position[1]-36)<29.35 and abs(position[2]-40)<23.35 and position[3]<nearbySand+3.8)
    then islandContact(position,quaternion,aircraft.truth.velocityWorldEnu_m_s,aircraft.truth.angularVelocityBodyFlu_rad_s,
      droneContactParts,droneContactRadius,droneContactLower,droneContactUpper)
    else zeros(6);
  vesselDeckWrenches=vesselContacts(vesselDecks,position,quaternion,aircraft.truth.velocityWorldEnu_m_s,aircraft.truth.angularVelocityBodyFlu_rad_s,droneContactParts);
  for i in 1:4 loop
    minimumVesselHeight[i]=if vesselDecks[i,1]>.5 and (position[1]-vesselDecks[i,3])^2+(position[2]-vesselDecks[i,4])^2<
      (if vesselDecks[i,2]>2.5 then 21 else 9) then vesselDecks[i,5]-.15 else -20;
  end for;
  for axis in 1:6 loop
    landingWrench[axis]=deckWrench[axis]+sailWrench[axis]+terrainWrench[axis]+islandPadWrench[axis]+sum(vesselDeckWrenches[:,axis]);
  end for;
  deckWrench=if onCarrier>.5 then cat(1,zeros(6),(if launchRise<=0 then cat(1,carrierWeight,cross(carrierArm,carrierWeight)) else zeros(6)))
    else landingContact(deckEnabled,deckState,position,quaternion,velocityENU,aircraft.truth.angularVelocityBodyFlu_rad_s,droneContactParts,0,windENU[1:2]);
  sailWrench=landingContact(sailDeckEnabled,sailDeckState,position,quaternion,aircraft.truth.velocityWorldEnu_m_s,aircraft.truth.angularVelocityBodyFlu_rad_s,droneContactParts,if isCatamaran>.5 then 1 else 2);
  when sample(0,.01) then
    droneContactWrench=droneMeshContacts(droneTraffic,position,quaternion,aircraft.truth.velocityWorldEnu_m_s,
      aircraft.truth.angularVelocityBodyFlu_rad_s,droneContactParts,droneContactFaces);
  end when;
  position=if onCarrier>.5 then carrierPosition else aircraft.truth.positionWorldEnu_m+{activeOrigin[1],activeOrigin[2],0};
  quaternion=if onCarrier>.5 then carrierQuaternion else aircraft.truth.quaternionWorldBody;
  immersed=min(1,max(0,.5+(waterLevel-position[3])/bodyHeight));
  waterSlip=currentENU-velocityENU;
  waterLoad=immersed*1025*({0,0,9.80665*displacedVolume}+.5*waterDragArea*sqrt(waterSlip*waterSlip+1e-12)*waterSlip);
  rotorSpeed=aircraft.motorOmega_rad_s;
  (rotorWakeWind,rotorWakeWrench)=rotorWake(position,quaternion,rotorSpeed,windENU,rotorWakeTraffic,
    aircraft.rotorGeometry.positionBodyFlu_m,aircraft.thrustCoefficient_N_s2,aircraft.hoverRotorSpeed_rad_s,
    aircraft.omegaMax,propellerRadius,washThrustSensitivity);
  der(rotorAngle)={1,-1,1,-1}.*rotorSpeed;
  when sample(0,.02) then
    estimator=if onCarrier>.5 then
      cat(1,{position[1],velocityENU[1]},navigationPrior[2:8],{position[2],velocityENU[2]},navigationPrior[2:8],
        {position[3],velocityENU[3]},navigationPrior[2:8],position,velocityENU,{0,0,64,0})
    else updateEstimator(pre(estimator),time,if time<navigationStep/2 then 0 else navigationStep,
      position,velocityENU,aircraft.imu.specificForceBodyFlu_m_s2,rotation,rotorForce,
      aircraft.vehicleMass_kg,navigationLinearDrag,navigationQuadraticDrag,gpsDropout<=.5,
      motorCut<=.5 and immersed<.01 and position[3]>bedHeight+.25 and bodyRate*bodyRate<4
      and landingWrench*landingWrench<.01 and rotorForce>.25*aircraft.vehicleMass_kg*9.80665);
  end when;
  gps=estimator[28:30];
  gpsVelocity=estimator[31:33];
  estimatedPosition={estimator[1],estimator[10],estimator[19]};
  estimatedVelocity={estimator[2],estimator[11],estimator[20]};
  positionCovariance={estimator[4],estimator[13],estimator[22]};
  velocityCovariance={estimator[7],estimator[16],estimator[25]};
  // Body-rate gyro integration starts from the calibrated level launch pose.
  bodyRate=aircraft.imu.angularVelocityBodyFlu_rad_s;
  der(gyroQ)=LieGroups.SO3.Quat.kinematics(gyroQ,bodyRate);
  rotation=if onCarrier>.5 then carrierAttitude else LieGroups.SO3.Quat.to_DCM(gyroQ);
  rotorForce=aircraft.thrustCoefficient_N_s2*(rotorSpeed*rotorSpeed);
  estimatedWindENU=estimator[34:35];
  windCovariance=estimator[36];
  windEstimateValid=if windCovariance<1 then 1 else 0;
  attitude={atan2(rotation[3,2],rotation[3,3]),atan2(-rotation[3,1],sqrt(rotation[1,1]^2+rotation[2,1]^2)),atan2(rotation[2,1],rotation[1,1])};
  landing=autoLand>.5 and onCarrier<.5 and motorCut<=.5;
  locked=landingCue[1]>.5 and landingCue[4]>0;
  landingError=sqrt(landingCue[2]^2+landingCue[3]^2);
  aligned=locked and landingError<max(.09,min(.28,.12*landingCue[4]));
  descendingSpeed=if not aligned then 0 else min(.55,max(.085,.40*landingCue[4]));
  landingHeightReached=landingRange[1]>.5 and landingRange[2]>.07 and landingRange[2]<.145 and
    locked and landingError<.14 and abs(velocityENU[3])<.30;
  der(landingDwell)=if landing and (landingDwell>.30 or landingHeightReached) then max(0,2*(1-landingDwell)) else -4*landingDwell;
  landingState=if not landing then 0 elseif landingDwell>.30 then 4 elseif not locked then 1 elseif aligned then 3 else 2;
  positionHold=landing or pilot<=.5 or flightMode<.5;
  acro=not landing and pilot>.5 and flightMode>1.5;
  der(yawTarget)=if not positionHold then 12*atan2(sin(attitude[3]-yawTarget),cos(attitude[3]-yawTarget)) elseif pilot>.5 then turn else 0;
  der(throttle)=if positionHold then 8*(max(0,min(1,collective/maxThrust))-throttle)
    elseif (throttle>=1 and climb>0) or (throttle<=0 and climb<0) then 0 else .45*climb;
  raceError={stationEast,stationNorth}-target[1:2];
  raceDistance=sqrt(raceError*raceError);
  // Use a radial speed limit. The braking curve becomes proportional near the waypoint.
  raceVelocity=noEvent(min(raceSpeed/max(.001,raceDistance),
    2*raceBraking/(raceBraking+sqrt(raceBraking^2+2*raceBraking*raceDistance))))*raceError;
  desired=if landing then (if locked then {landingCue[5]+max(-.85,min(.85,.7*landingCue[2])),
    landingCue[6]+max(-.85,min(.85,.7*landingCue[3])),-descendingSpeed} else zeros(3))
    elseif pilot>.5 then {2*(forward*cos(yawTarget)-left*sin(yawTarget)),2*(forward*sin(yawTarget)+left*cos(yawTarget)),climb}
    elseif raceNavigation>.5 then cat(1,raceVelocity,{max(-1,min(1,5-target[3]))})
    else {max(-2,min(2,stationEast-target[1])),max(-2,min(2,stationNorth-target[2])),max(-1,min(1,5-target[3]))};
  der(target[1:2])=if landing then estimatedVelocity[1:2]+5*(estimatedPosition[1:2]+
    (if locked then landingCue[2:3] else zeros(2))-target[1:2])
    elseif positionHold then desired[1:2] else estimatedVelocity[1:2]+10*(estimatedPosition[1:2]-target[1:2]);
  minimumTargetHeight=max(max(minimumVesselHeight),if deckEnabled>.5 and (position[1]-deckState[1])^2+(position[2]-deckState[2])^2<16 then deckState[3]+.35 elseif sailDeckEnabled>.5 and (position[1]-sailDeckState[1])^2+(position[2]-sailDeckState[2])^2<9 then sailDeckState[3]-.15 elseif nearbySand>-.3 then nearbySand-.12 elseif max(minimumVesselHeight)>-20 then -20 else 1);
  der(target[3])=if landing then (if aligned then max(desired[3],4*(estimatedPosition[3]-landingCue[4]-.07-target[3]))
    else 5*(estimatedPosition[3]-target[3]))
    elseif not positionHold then estimatedVelocity[3]+10*(estimatedPosition[3]-target[3])
    else max(desired[3],-4*max(0,target[3]-minimumTargetHeight));
  for i in 1:3 loop
    der(integralAcceleration[i])=if landingDwell>.30 or not positionHold or motorCut>.5 or immersed>.5 then -integralAcceleration[i]
      elseif (integralAcceleration[i]>=maxIntegralAcceleration and target[i]>estimatedPosition[i]) or
             (integralAcceleration[i]<=-maxIntegralAcceleration and target[i]<estimatedPosition[i]) then 0
      else holdIntegralGain*(target[i]-estimatedPosition[i]);
  end for;
  acceleration=1.4*(target-estimatedPosition)+2.4*(desired-estimatedVelocity)+integralAcceleration;
  forwardAcceleration=cos(attitude[3])*acceleration[1]+sin(attitude[3])*acceleration[2];
  leftAcceleration=-sin(attitude[3])*acceleration[1]+cos(attitude[3])*acceleration[2];
  upAcceleration=max(1,9.80665+acceleration[3]);
  pitchTarget=if not positionHold then tiltLimit*max(-1,min(1,forward)) else max(-tiltLimit,min(tiltLimit,atan2(forwardAcceleration,upAcceleration)));
  rollTarget=if not positionHold then -tiltLimit*max(-1,min(1,left)) else max(-tiltLimit,min(tiltLimit,atan2(-leftAcceleration,sqrt(forwardAcceleration^2+upAcceleration^2))));
  holdCollective=aircraft.vehicleMass_kg*(9.80665+acceleration[3])/max(.5,cos(attitude[1])*cos(attitude[2]));
  // Blend thrust out as the landing gear takes load. A hard force threshold
  // would switch thrust at every crossing during compliant deck contact.
  contactUnload=if landing and aligned then noEvent(max(0,min(1,(.22-landingCue[4])/.04))*
    max(0,min(1,(deckWrench[3]+islandPadWrench[3])/.8))) else 0;
  collective=if positionHold then (1-contactUnload)*holdCollective+contactUnload*.84*aircraft.vehicleMass_kg*9.80665
    else maxThrust*max(0,min(1,throttle));
  torque={if acro then -.23*maxBodyRate*max(-1,min(1,left)) else .86*atan2(sin(rollTarget-attitude[1]),cos(rollTarget-attitude[1])),
    if acro then .23*maxBodyRate*max(-1,min(1,forward)) else .86*(pitchTarget-attitude[2]),
    if positionHold then .42*atan2(sin(yawTarget-attitude[3]),cos(yawTarget-attitude[3])) else .18*maxYawRate*turn}
    -{.23*bodyRate[1],.23*bodyRate[2],.18*bodyRate[3]};
  for k in 1:4 loop
    // The RDD2 effectiveness matrix has orthogonal rows. Use its actual motor order.
    motorThrust[k]=collective/4+sum(aircraft.rotorEffectiveness[j+1,k]*torque[j]/
      (aircraft.rotorEffectiveness[j+1,:]*aircraft.rotorEffectiveness[j+1,:]) for j in 1:3);
    aircraft.commands.motor[k]=if motorCut>.5 or immersed>.5 or (landing and landingDwell>.30) or (onCarrier>.5 and launchSpeed<=0) then 0
      elseif onCarrier>.5 then aircraft.hoverRotorSpeed_rad_s/aircraft.omegaMax
      else sqrt(max(0,min(aircraft.omegaMax^2,motorThrust[k]/aircraft.thrustCoefficient_N_s2)))/aircraft.omegaMax;
  end for;
end Rdd2Survey;
