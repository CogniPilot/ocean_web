package DiverTree "Free torso and bilateral limbs of the fitted diver"
  // Fitted thigh bone centres and segment lengths in the dressed mesh, metres.
  constant Real hipSocket[3]={-.208800,.114305,.036000};
  constant Real thighLength=.428800,shankLength=.458788;
  function bladeAxes "Heel-to-tip, blade span and panel normal in the trim frame"
    input Real sole[3,3],side,cant;
    output Real axes[3,3];
  protected
    Real mount[3,3];
    // In the fitted mesh the tips sit 93.65 mm below the heel and 12 mm outboard.
    constant Real reach=.591,drop=.09365,outboard=.012;
  algorithm
    mount:=sole*MultiBodyLie.Math.axisRotation({-1,0,0},cant);
    axes[:,1]:=mount*{-reach,side*outboard,drop}/sqrt(reach^2+drop^2+outboard^2);
    axes[:,2]:=mount[:,2];
    axes[:,3]:=mount*{drop,0,reach}/sqrt(reach^2+drop^2);
  end bladeAxes;
  function forwardDynamics "World loads projected through a eighteen-joint floating tree"
    input Real origin[3],rotation[3,3],rig[3,3] "Root position, root-to-world and trim-to-root rotations";
    input Real velocity[3],omega[3] "World translational and root-frame angular velocity";
    input Real q[14],qd[14],shaftEffort[14] "Each side: hip sweep, hip flexion, knee, ankle flexion, fin cant, shoulder, elbow";
    input Real axialQ[4],axialSpeed[4],axialShaft[4] "Hip axial rotation and forearm pronation on each side";
    input Real rootMoment[3],rootForce[3] "Fin, ground support and active paddle wrench in root coordinates";
    input Real current[3],level,vestVolume,neutralVolume,standing;
    input Real hit[4],arm[3],hitVelocity[3],hitLink;
    input Real selfHit[9],witness[9],clockTime;
    output Real result[392] "Base and joint accelerations; site fluid loads, link weights, axial accelerations and contact reaction magnitude";
  protected
    constant Integer parent[19]={0,1,2,3,4,5,6,1,8,9,1,11,12,13,14,15,1,17,18};
    // Preserve external link IDs in contacts, inertia metadata and diagnostics.
    constant Integer physical[15]={1,2,4,5,6,7,8,10,11,13,14,15,16,17,19};
    constant Integer jointIndex[14]={1,2,4,5,6,7,8,10,11,13,14,15,16,17};
    constant Integer axialIndex[4]={3,9,12,18};
    constant Integer siteBody[14]={1,1,1,1,3,4,6,7,8,10,11,13,14,15};
    constant Integer kind[14]={1,2,3,9,6,7,8,4,5,6,7,8,4,5};
    constant Real mass[15]={55.6,0,7.5,3.5,0,1.55,2,1.65,0,7.5,3.5,0,1.55,2,1.65};
    // Principal inertias about individual link centres, kg m2. Virtual frames
    // carry only their following physical link's inertia through the joint.
    constant Real principal[15,3]=[1.6,3.9,4.2; 0,0,0; .027,.129,.129; .009,.070,.070; 0,0,0;
      .009,.049,.052; .004,.015,.015; .004,.017,.017; 0,0,0; .027,.129,.129; .009,.070,.070;
      0,0,0; .009,.049,.052; .004,.015,.015; .004,.017,.017];
    constant Real armature[18]={.35,.65,.12,.30,.11,.09,.15,.08,.025,.35,.65,.12,.30,.11,.09,.15,.08,.025};
    Real qTree[18],vTree[18],tauTree[18],offset[18,3],mount[18,3,3],axis[18,3],worldAxis[19,3],moi[19,6,6];
    Real p[19,3],R[19,3,3],v[19,3],w[19,3],com[19,3],inertia[3,3];
    Real dw[19,3],df[19,3],comWorld[3],siteLocal[14,3],part[15],siteR[3,3],armWorld[3],centre[3];
    Real load[24],matrix[24,24],bias[24],acc[24],speed[24],outboard[3,3];
    Real normalJac[24],unitAccel[24],gap,normalSpeed,inverseMass,reaction,planeOffset;
    Real r[3],deltaV[3],upForce[3],force[3],vol[14],wet[19],wetMass[19],added,signSide;
    Integer a,b,j;
  algorithm
    qTree:=zeros(18);vTree:=zeros(18);tauTree:=zeros(18);
    result:=zeros(392);R:=zeros(19,3,3);p:=zeros(19,3);v:=zeros(19,3);w:=zeros(19,3);
    siteLocal:=zeros(14,3);worldAxis:=zeros(19,3);vol:=zeros(14);moi:=zeros(19,6,6);
    offset:=zeros(18,3);axis:=zeros(18,3);com:=zeros(19,3);dw:=zeros(19,3);df:=zeros(19,3);
    for i in 1:18 loop mount[i,:,:]:=identity(3);end for;
    for i in 1:14 loop
      j:=jointIndex[i];qTree[j]:=q[i];vTree[j]:=qd[i];tauTree[j]:=shaftEffort[i];
    end for;
    for i in 1:4 loop
      j:=axialIndex[i];qTree[j]:=axialQ[i];vTree[j]:=axialSpeed[i];tauTree[j]:=axialShaft[i];
    end for;
    for side in 1:2 loop
      j:=9*(side-1);signSide:=if side==1 then 1 else -1;
      mount[j+1,:,:]:=rig;mount[j+7,:,:]:=rig;
      // The sole is perpendicular to the shin at anatomical neutral.
      mount[j+6,:,:]:=MultiBodyLie.Math.axisRotation({0,1,0},-1.5707963267948966);
      offset[j+1,:]:=rig*{hipSocket[1],signSide*hipSocket[2],hipSocket[3]};
      axis[j+1,:]:={0,0,-1};axis[j+2,:]:={0,1,0};axis[j+3,:]:={-1,0,0};
      axis[j+4,:]:={0,1,0};axis[j+5,:]:={0,1,0};axis[j+6,:]:={-1,0,0};
      axis[j+7,:]:={0,0,-signSide};axis[j+8,:]:={0,signSide,0};axis[j+9,:]:={-signSide,0,0};
      offset[j+4,:]:={-thighLength,0,0};offset[j+5,:]:={-shankLength,0,0};
      offset[j+7,:]:=rig*{.25,signSide*.24,-.045};offset[j+8,:]:={-.25,0,0};
      com[j+4,:]:={-.195,0,0};com[j+5,:]:={-.205,0,0};com[j+7,:]:={-.115,0,0};
      com[j+8,:]:={-.115,0,0};com[j+10,:]:={-.125,0,0};
    end for;
    vol[1]:=mass[1]/1025-neutralVolume-.0056-.0135;vol[2]:=.0056;vol[3]:=.0135;vol[4]:=vestVolume;
    siteLocal[1,:]:=rig*{.135,0,0};siteLocal[2,:]:=rig*{.55,0,.03};
    siteLocal[3,:]:=rig*{.05,0,.24};siteLocal[4,:]:=rig*{.055,0,.13};
    com[1,:]:=1025/mass[1]*(vol[1]*siteLocal[1,:]+vol[2]*siteLocal[2,:]+vol[3]*siteLocal[3,:]
      +neutralVolume*siteLocal[4,:])-rig*{0,0,.003};
    for i in 5:14 loop
      b:=physical[siteBody[i]];vol[i]:=mass[siteBody[i]]/1025;siteLocal[i,:]:=com[b,:];
    end for;

    p[1,:]:=origin;R[1,:,:]:=rotation;v[1,:]:=velocity;w[1,:]:=rotation*omega;
    for i in 2:19 loop
      a:=parent[i];j:=i-1;
      outboard:=R[a,:,:]*mount[j,:,:];worldAxis[i,:]:=outboard*axis[j,:];
      r:=R[a,:,:]*offset[j,:];p[i,:]:=p[a,:]+r;v[i,:]:=v[a,:]+cross(w[a,:],r);
      R[i,:,:]:=outboard*MultiBodyLie.Math.axisRotation(axis[j,:],qTree[j]);
      w[i,:]:=w[a,:]+worldAxis[i,:]*vTree[j];
    end for;
    wet:=zeros(19);wetMass:=zeros(19);
    for i in 1:14 loop
      b:=physical[siteBody[i]];
      armWorld:=R[b,:,:]*siteLocal[i,:];centre:=p[b,:]+armWorld;
      siteR:=if b==1 then rotation*rig else R[b,:,:];
      part:=DiverHydrodynamics.linkWrench(kind[i],centre,siteR,v[b,:]+cross(w[b,:],armWorld),w[b,:],current,level,vol[i]);
      // The torso inspection frame already includes the trim rotation.
      j:=145+13*(i-1);
      result[j+1:j+3]:=if b==1 then transpose(rig)*siteLocal[i,:] else siteLocal[i,:];
      result[j+4:j+6]:=result[j+1:j+3]+part[10:12];
      result[j+7]:=part[9];
      result[j+8:j+10]:=part[1:3]-{0,0,part[9]};
      result[j+11:j+13]:=part[13:15];
      result[20+i]:=part[8];result[130+siteBody[i]]:=result[130+siteBody[i]]+part[7];
      df[b,:]:=df[b,:]+part[1:3];
      dw[b,:]:=dw[b,:]+part[4:6]+cross(armWorld,part[1:3]);
      if i<>4 then
        wet[b]:=wet[b]+vol[i]*part[8];wetMass[b]:=wetMass[b]+vol[i];
      end if;
    end for;
    for i in 1:15 loop
      b:=physical[i];
      result[6*i+35:6*i+37]:=df[b,:];result[6*i+38:6*i+40]:=dw[b,:];
      armWorld:=R[b,:,:]*com[b,:];
      upForce:={0,0,-9.80665*mass[i]};
      j:=327+4*(i-1);
      result[j+1:j+3]:=if i==1 then transpose(rig)*com[b,:] else com[b,:];
      result[j+4]:=upForce[3];
      df[b,:]:=df[b,:]+upForce;dw[b,:]:=dw[b,:]+cross(armWorld,upForce);
      // Lump translational entrained water near each immersed segment centre.
      added:=(17/88)*mass[i]*wet[b]/max(1e-8,wetMass[b]);
      inertia:=diagonal(principal[i,:]);
      if i==1 then inertia:=rig*inertia*transpose(rig);end if;
      moi[b,:,:]:=MultiBodyLie.Math.spatialInertia(mass[i]+added,com[b,:],inertia);
    end for;
    if hit[4]>0 and witness[1]<.5 then
      b:=physical[max(1,min(15,integer(hitLink)))];
      centre:=origin+arm;r:=centre-p[b,:];
      deltaV:=velocity+hitVelocity;
      force:=max(0,3600*hit[4]-650*(hit[1:3]*deltaV))*hit[1:3];
      df[b,:]:=df[b,:]+force;dw[b,:]:=dw[b,:]+cross(r,force);
    end if;
    if selfHit[6]>0 then
      a:=physical[max(1,min(15,integer(selfHit[1])))];b:=physical[max(1,min(15,integer(selfHit[2])))];
      centre:=origin+selfHit[7:9];
      deltaV:=v[a,:]+cross(w[a,:],centre-p[a,:])-v[b,:]-cross(w[b,:],centre-p[b,:]);
      force:=max(0,3600*selfHit[6]-65*(selfHit[3:5]*deltaV))*selfHit[3:5];
      df[a,:]:=df[a,:]+force;df[b,:]:=df[b,:]-force;
      dw[a,:]:=dw[a,:]+cross(centre-p[a,:],force);dw[b,:]:=dw[b,:]-cross(centre-p[b,:],force);
    end if;
    load:=cat(1,rootMoment,rootForce,tauTree);
    for i in 19:-1:2 loop
      a:=parent[i];load[i+5]:=load[i+5]+worldAxis[i,:]*dw[i,:];
      dw[a,:]:=dw[a,:]+dw[i,:]+cross(p[i,:]-p[a,:],df[i,:]);df[a,:]:=df[a,:]+df[i,:];
    end for;
    load[1:3]:=load[1:3]+transpose(rotation)*dw[1,:];load[4:6]:=load[4:6]+transpose(rotation)*df[1,:];
    result[35:37]:=rotation*load[4:6];result[38:40]:=load[1:3];
    speed:=cat(1,omega,transpose(rotation)*velocity,vTree);
    (matrix,bias,acc):=MultiBodyLie.Math.floatingTreeDynamics(parent,offset,mount,axis,qTree,speed,moi,armature,zeros(3),load);
    if hit[4]>0 and witness[1]>.5 then
      // The swept mesh nominates a point before impact. Re-evaluate it on
      // the actual link each 5 ms, including motion of the opposing surface.
      b:=physical[max(1,min(15,integer(hitLink)))];
      r:=R[b,:,:]*witness[2:4];centre:=p[b,:]+r;
      deltaV:=v[b,:]+cross(w[b,:],r)-witness[6:8];
      normalSpeed:=hit[1:3]*deltaV;
      planeOffset:=witness[5]+max(0,clockTime-witness[9])*(hit[1:3]*witness[6:8]);
      gap:=hit[1:3]*centre-planeOffset;
      if gap<0 or gap+.005*normalSpeed<0 then
        normalJac:=zeros(24);
        normalJac[1:3]:=transpose(rotation)*cross(centre-origin,hit[1:3]);
        normalJac[4:6]:=transpose(rotation)*hit[1:3];
        j:=b;
        for ancestor in 1:18 loop
          if j>1 then
            normalJac[j+5]:=worldAxis[j,:]*cross(centre-p[j,:],hit[1:3]);
            j:=parent[j];
          end if;
        end for;
        unitAccel:=MultiBodyLie.Math.solveSPD(matrix,normalJac);
        inverseMass:=normalJac*unitAccel;
        // Backward-Euler normal compliance at the held acceleration step.
        // J M^-1 J' gives a grazing flipper its own effective contact mass.
        reaction:=max(0,(-3600*gap-(650+.005*3600)*normalSpeed)/
          (1+.005*(650+.005*3600)*inverseMass));
        acc:=acc+reaction*unitAccel;
        result[35:37]:=result[35:37]+reaction*hit[1:3];
        result[38:40]:=result[38:40]+reaction*normalJac[1:3];
        result[392]:=reaction;
      end if;
    end if;
    result[1:3]:=acc[1:3];result[4:6]:=rotation*(acc[4:6]+cross(omega,speed[4:6]));
    for i in 1:14 loop result[6+i]:=acc[6+jointIndex[i]];end for;
    for i in 1:4 loop result[387+i]:=acc[6+axialIndex[i]];end for;
  end forwardDynamics;
end DiverTree;
