model FishSchool "Finite-size individual schooling fish, one synchronous step from a room checkpoint"
  input Real prior[12,6] "Each individual's ENU position and velocity";
  input Real guide[12,4] "Habitat lane ENU and migration heading, with individual depth preference";
  input Real actors[8,13] "ENU, linear velocity, yaw/pitch/heel, inflated half-axes, alert distance";
  input Real predator[8]=zeros(8) "Fish-eating actor in each corresponding obstacle row";
  input Real wallThreat[12,3]=zeros(12,3) "Predicted boundary normal, weighted by imminence";
  input Real active[12]=ones(12) "Inactive fish neither school nor repel";
  input Real body[12,3]=[zeros(12,2),fill(.09,12)] "Body-axis centre offset, distance from centre to each end sphere, sphere radius (m)";
  input Real dt=.1 "Seconds between input and output";
  output Real nextState[12,6];
  input Real muscle[12,4]=zeros(12,4) "Per fish: external control enable, caudal amplitude [0,1], turn bias and vertical fin effort [-1,1]";
  input Real previousMotion[12,4]=zeros(12,4) "Yaw (rad), yaw rate (rad/s), caudal phase (rad), initialized flag";
  input Real waterVelocity[3]=zeros(3) "Ambient current in ENU (m/s)";
  output Real nextMotion[12,4] "Carry forward with nextState at each school step";
  output Real tailActuation[12,2] "Last applied peak lateral tail excursion (m) and beat frequency (Hz)";
  output Real waterReaction[12,4] "Step-averaged load exerted on water: ENU force (N), yaw moment about fish centre (N.m); excludes solid contacts";
protected
  Real solved[12,16];
public
  function swim "Neutral-buoyancy fish driven by caudal and paired-fin forces"
    input Real position[3],velocity[3],desired[3],fallbackYaw,length,motor[4],pilot[4],current[3],alarm,hs,startPhase;
    output Real state[16] "Position/velocity, beat state, water reaction";
  protected
    constant Real rho=1025,pi=3.141592653589793;
    Real p[3],v[3],relative[3],yaw,yawRate,phase,mass,inertia,omega,substep;
    Real co,si,u,w,heave,goal,headingError,throttle,rudder,elevator,initialYawRate;
    Real tailSpeed,tailPressure,finPressure,axialDrag,lateralDrag,verticalDrag;
    Real axial,tailSide,bodySide,vertical,moment,turnRate,sideResistance,verticalResistance,yawResistance;
  algorithm
    p:=position;v:=velocity;relative:=v-current;
    yaw:=if motor[4]>.5 then motor[1] elseif relative[1]^2+relative[2]^2>1e-6 then atan2(relative[2],relative[1]) else fallbackYaw;
    yawRate:=if motor[4]>.5 then motor[2] else 0;
    initialYawRate:=yawRate;
    phase:=if motor[4]>.5 then motor[3] else startPhase;
    mass:=rho*.014*length^3;
    inertia:=.11*mass*length^2;
    // Fast-start caudal excursion reaches 0.20 body lengths. The maximum
    // flapping frequency decreases with body length. Muscle amplitude drives
    // water momentum at twice the beat frequency on both halves of a stroke.
    omega:=2*pi*max(3,min(8,1.65/length));
    axialDrag:=.5*rho*.007*length^2;
    lateralDrag:=.5*rho*.18*length^2;
    verticalDrag:=.5*rho*.09*length^2;
    substep:=hs/6;throttle:=0;
    for sampleIndex in 1:6 loop
      co:=cos(yaw);si:=sin(yaw);relative:=v-current;
      u:=co*relative[1]+si*relative[2];w:=-si*relative[1]+co*relative[2];heave:=relative[3];
      if pilot[1]>.5 then
        throttle:=max(0,min(1,pilot[2]));rudder:=max(-1,min(1,pilot[3]));
        elevator:=max(-1,min(1,pilot[4]));
      else
        goal:=sqrt((desired[1]-current[1])^2+(desired[2]-current[2])^2);
        headingError:=if goal<.01 then 0 else atan2((desired[2]-current[2])*co-(desired[1]-current[1])*si,
          (desired[1]-current[1])*co+(desired[2]-current[2])*si);
        // The guide requests a speed and course. The controller supplies muscle
        // activation and fin bias. External policies bypass this controller.
        throttle:=max(0,min(1,(goal+.70*(goal-u))/(.20*length*omega*sqrt(.040*.75/(2*.007)))));
        turnRate:=max(-2.15-2.1*alarm,min(2.15+2.1*alarm,3.8*headingError));
        rudder:=max(-1,min(1,.36*(turnRate-yawRate)+.28*turnRate));
        elevator:=max(-1,min(1,2.6*(desired[3]-v[3])));
      end if;
      // Midpoint sampling integrates individual beats, including at the 8.3 Hz
      // school checkpoint cadence. Tail recoil acts behind the mass centre.
      tailSpeed:=.20*length*omega*throttle*cos(phase+.5*omega*substep);
      tailPressure:=.5*rho*.040*length^2*tailSpeed^2;
      finPressure:=.5*rho*.040*length^2*(u^2+.5*tailSpeed^2);
      axial:=.75*tailPressure*(1-.22*rudder^2)-axialDrag*u*abs(u);
      tailSide:=-.76*rudder*finPressure-.006*tailPressure*sign(tailSpeed);
      sideResistance:=lateralDrag*(abs(w)+.70*abs(u));
      bodySide:=-sideResistance*w/(1+substep*sideResistance/mass);
      verticalResistance:=verticalDrag*(abs(heave)+.3*abs(u));
      vertical:=elevator*(finPressure+.5*rho*.018*length^2*(elevator*.8)^2)-verticalResistance*heave/(1+substep*verticalResistance/mass);
      moment:=-.40*length*tailSide-.045*length*bodySide;
      yawResistance:=.5*rho*.010*length^4*(abs(u)+.30*length*abs(yawRate));
      yawRate:=(yawRate+substep*moment/inertia)/(1+substep*yawResistance/inertia);
      yaw:=yaw+substep*yawRate;
      v:=v+substep/mass*{axial*co-(bodySide+tailSide)*si,axial*si+(bodySide+tailSide)*co,vertical};
      p:=p+substep*v;
      phase:=phase+substep*omega;
    end for;
    state[1:3]:=p;
    state[4:6]:=v;
    state[7:10]:={atan2(sin(yaw),cos(yaw)),yawRate,mod(phase,2*pi),1};
    state[11:13]:=mass*(velocity-v)/hs;
    state[14]:=inertia*(initialYawRate-yawRate)/hs;
    state[15:16]:={.20*length*throttle,omega/(2*pi)};
  end swim;
  function advanceSchool
    input Real old[12,6],target[12,4],obstacles[8,13],predators[8],walls[12,3],live[12],shape[12,3],motion[12,4],policy[12,4],current[3],step;
    output Real next[12,16];
  protected
    Real d[3],p[3],v[3],sep[3],align[3],coh[3],threat[3],desired[3],n[3];
    Real y,pit,roll,rot[8,3,3],axes[3],q[3],ds[3],grad[3],rate[3],world[3],q0[3];
    Real forward[12,3],halfSpan[12],radius[12],centre[12,3],delta[3],rel[3],closest[3];
    Real contactRadius,best,extent,along,offset,clearance,bestTau,deepest,axisScale;
    Real gap,weight,neighbors,near,alarm,r,speed,norm,limit,approach,hs,tau,a,b,c,disc,normalSpeed;
    Real escape[3],danger,bearing,side;
  algorithm
    hs:=max(.001,min(.16,step));
    for i in 1:12 loop
      y:=if old[i,4]==0 and old[i,5]==0 then 0 else atan2(old[i,5],old[i,4]);
      if motion[i,4]>.5 then y:=motion[i,1];end if;
      forward[i,:]:={cos(y),sin(y),0};
      halfSpan[i]:=max(0,shape[i,2]);radius[i]:=max(0,shape[i,3]);
      centre[i,:]:=shape[i,1]*forward[i,:];
    end for;
    rot:=zeros(8,3,3);
    for j in 1:8 loop
      y:=obstacles[j,7];pit:=obstacles[j,8];roll:=obstacles[j,9];
      rot[j,:,:]:=[cos(y)*cos(pit),cos(y)*sin(pit)*sin(roll)-sin(y)*cos(roll),cos(y)*sin(pit)*cos(roll)+sin(y)*sin(roll);
                   sin(y)*cos(pit),sin(y)*sin(pit)*sin(roll)+cos(y)*cos(roll),sin(y)*sin(pit)*cos(roll)-cos(y)*sin(roll);
                   -sin(pit),cos(pit)*sin(roll),cos(pit)*cos(roll)];
    end for;
    next[:,1:6]:=old;next[:,7:10]:=motion;next[:,11:16]:=zeros(12,6);
    for i in 1:12 loop
      if live[i]>.5 then
        p:=old[i,1:3];v:=old[i,4:6];sep:=zeros(3);align:=zeros(3);coh:=zeros(3);
        neighbors:=0;near:=0;threat:=walls[i,:];alarm:=min(1,sqrt(threat*threat));escape:=zeros(3);danger:=0;
        for j in 1:12 loop
          if j<>i and live[j]>.5 then
            d:=old[j,1:3]-p;r:=sqrt(d*d);
            if r<.40 then
              gap:=r;
              if r<.000001 then d:={if j>i then 1 else -1,0,0};r:=1;end if;
              sep:=sep-d*((.40-gap)/r);
              near:=max(near,min(1,(.40-gap)/.14));
            end if;
            if r<2.20 then
              weight:=min(1,(2.20-r)/.55);
              align:=align+weight*old[j,4:6];coh:=coh+weight*d;neighbors:=neighbors+weight;
            end if;
          end if;
        end for;
        for j in 1:8 loop
          if obstacles[j,10]>0 then
            axes:=obstacles[j,10:12];
            // Anticipate a moving body. Its physical intersection is resolved below.
            d:=p-obstacles[j,1:3]+.42*(v-obstacles[j,4:6]);
            q:=transpose(rot[j,:,:])*d;
            grad:={q[k]/axes[k]^2 for k in 1:3};
            norm:=sqrt(grad*grad);
            r:=sqrt(sum((q[k]/axes[k])^2 for k in 1:3));
            gap:=(r-1)*sqrt(d*d)/max(.0001,r);
            if predators[j]>.5 then
              // Break across an approaching predator's course. A fish directly
              // ahead uses a stable side until its sideways motion establishes one.
              bearing:=q[1]/max(.001,sqrt(q*q));
              approach:=max(0,min(1,(obstacles[j,4:6]-v)*d/max(.001,sqrt(d*d))));
              weight:=max(0,min(1,1-gap/(obstacles[j,13]*(1.05+.50*max(0,bearing)*approach))));
              side:=if abs(q[2])>.12 then (if q[2]>0 then 1 else -1) else
                (if v*rot[j,:,2]>=0 then 1 else -1);
              escape:=escape+weight^2*(d/max(.05,sqrt(d*d))+
                side*rot[j,:,2]*max(0,bearing)*(.45+.55*approach));
              danger:=max(danger,weight);
            end if;
            weight:=max(0,min(1,1-gap/max(.1,obstacles[j,13])));
            if weight>0 then
              if norm<.00001 then grad:={0,1,0};norm:=1;end if;
              threat:=threat+(rot[j,:,:]*grad)*(weight^2/norm);
              alarm:=max(alarm,weight);
            end if;
          end if;
        end for;
        d:=target[i,1:3]-p;norm:=sqrt(d*d);
        desired:={.53*cos(target[i,4]),.53*sin(target[i,4]),0}+d*(.38/max(1,norm/2));
        desired:=desired+3.8*sep;
        if neighbors>.001 then
          desired:=desired+(1-near)*(.65*(align/neighbors-v)+.31*coh/neighbors);
        end if;
        desired:=desired+2.65*threat+4.2*escape;limit:=1.12+1.27*alarm+1.0*danger;
        speed:=sqrt(desired*desired);desired:=desired*min(1,limit/max(.0001,speed));
        next[i,:]:=swim(p,v,desired,target[i,4],max(.14,2*(halfSpan[i]+radius[i])),
          motion[i,:],policy[i,:],current,max(danger,alarm),hs,mod(i*2.39996323,6.28318531));
      end if;
    end for;
    // An equal-mass non-penetration correction gives the separation rule a
    // finite lower bound even when two neighbors start a step on top of one another.
    for pass in 1:2 loop
      for i in 1:11 loop
        for j in i+1:12 loop
          if live[i]>.5 and live[j]>.5 then
            delta:=next[j,1:3]-next[i,1:3]+centre[j,:]-centre[i,:];
            contactRadius:=radius[i]+radius[j];
            extent:=halfSpan[i]+halfSpan[j]+contactRadius;
            if delta*delta<extent^2 then
              // Narrow phase uses the actual three spheres, including the gaps
              // between their curved sides; most pairs stop at the sphere bound.
              best:=contactRadius^2;closest:=zeros(3);
              for si in -1:1 loop
                if si==0 or halfSpan[i]>0 then
                  for sj in -1:1 loop
                    if sj==0 or halfSpan[j]>0 then
                      d:=delta+sj*halfSpan[j]*forward[j,:]-si*halfSpan[i]*forward[i,:];
                      if d*d<best then best:=d*d;closest:=d;end if;
                    end if;
                  end for;
                end if;
              end for;
              if best<contactRadius^2 then
                n:=if best>1e-12 then closest/sqrt(best) else {-forward[i,2],forward[i,1],0};
                // If collinear bodies interlock, separate across the body axes.
                if halfSpan[i]+halfSpan[j]>0 and
                    abs(forward[i,:]*forward[j,:])>.995 and abs(n*forward[i,:])>.98 and
                    abs(delta*forward[i,:])<halfSpan[i]+halfSpan[j] then
                  n:={-forward[i,2],forward[i,1],0};
                  if delta*n<0 then n:=-n;end if;
                end if;
                clearance:=0;
                for si in -1:1 loop
                  if si==0 or halfSpan[i]>0 then
                    for sj in -1:1 loop
                      if sj==0 or halfSpan[j]>0 then
                        d:=delta+sj*halfSpan[j]*forward[j,:]-si*halfSpan[i]*forward[i,:];
                        along:=d*n;disc:=contactRadius^2-max(0,d*d-along^2);
                        if disc>0 and d*d<contactRadius^2 then
                          clearance:=max(clearance,sqrt(disc)-along);
                        end if;
                      end if;
                    end for;
                  end if;
                end for;
                next[j,1:3]:=next[j,1:3]+(clearance+.001)*.5*n;
                next[i,1:3]:=next[i,1:3]-(clearance+.001)*.5*n;
                normalSpeed:=min(0,(next[j,4:6]-next[i,4:6])*n);
                next[j,4:6]:=next[j,4:6]-.5*normalSpeed*n;
                next[i,4:6]:=next[i,4:6]+.5*normalSpeed*n;
              end if;
            end if;
          end if;
        end for;
      end for;
    end for;
    for i in 1:12 loop
      if live[i]>.5 then
        for j in 1:8 loop
          if obstacles[j,10]>0 then
            p:=old[i,1:3];rate:=obstacles[j,4:6];
            d:=p+centre[i,:]-obstacles[j,1:3];delta:=next[i,1:3]-p-hs*rate;
            tau:=max(0,min(1,-(d*delta)/max(1e-16,delta*delta)));
            rel:=d+tau*delta;axisScale:=max(obstacles[j,10:12]);
            if rel*rel<=(axisScale+halfSpan[i]+radius[i])^2 then
              // An enclosing ellipsoid for ellipsoid + sphere. The longest
              // axis grows by exactly radius; simply adding it to all three
              // axes underestimates the true offset on oblique approaches.
              axes:={sqrt((1+radius[i]/axisScale)*obstacles[j,9+k]^2+
                            radius[i]*(radius[i]+axisScale)) for k in 1:3};
              ds:=transpose(rot[j,:,:])*delta;
              rel:={ds[k]/axes[k] for k in 1:3}; a:=rel*rel;
              bestTau:=2;deepest:=1;offset:=0;
              for si in -1:1 loop
                if si==0 or halfSpan[i]>0 then
                  q:=transpose(rot[j,:,:])*(d+si*halfSpan[i]*forward[i,:]);
                  q0:={q[k]/axes[k] for k in 1:3};
                  b:=q0*rel;c:=q0*q0-1;disc:=b*b-a*c;tau:=2;
                  if c<0 then tau:=0;
                  elseif a>1e-12 and b<0 and disc>=0 then tau:=c/(-b+sqrt(disc));
                  end if;
                  if tau>=0 and tau<=1 and (tau<bestTau or (tau==bestTau and c<deepest)) then
                    bestTau:=tau;deepest:=c;offset:=si*halfSpan[i];
                  end if;
                end if;
              end for;
              if bestTau<=1 then
                q:=transpose(rot[j,:,:])*(d+offset*forward[i,:])+bestTau*ds;
                r:=sqrt(sum((q[k]/axes[k])^2 for k in 1:3));
                q:=if r>.00001 then q/r else {0,axes[2],0};
                grad:={q[k]/axes[k]^2 for k in 1:3};n:=rot[j,:,:]*grad;n:=n/max(.00001,sqrt(n*n));
                world:=obstacles[j,1:3]+hs*rate+rot[j,:,:]*q-centre[i,:]-offset*forward[i,:];
                along:=forward[i,:]*n;
                clearance:=offset*along+halfSpan[i]*abs(along);
                v:=next[i,4:6]-rate;normalSpeed:=min(0,v*n);
                next[i,4:6]:=next[i,4:6]-normalSpeed*n;
                next[i,1:3]:=world+(clearance+.002)*n+(1-bestTau)*hs*(v-normalSpeed*n);
              end if;
            end if;
          end if;
        end for;
      end if;
    end for;
  end advanceSchool;
equation
  solved=advanceSchool(prior,guide,actors,predator,wallThreat,active,body,previousMotion,muscle,waterVelocity,dt);
  nextState=solved[:,1:6];
  nextMotion=solved[:,7:10];
  waterReaction=solved[:,11:14];
  tailActuation=solved[:,15:16];
  annotation(Documentation(info="<html><p>Schooling uses short-range repulsion and longer-range orientation and attraction as in Couzin et al. (2002), doi:10.1006/jtbi.2002.3065. The default controller maps the school demand to caudal muscle activation, tail steering bias and signed pectoral effort. The muscle input overrides it separately for each member. The reduced-order swimmer integrates forces in water of density 1025 kg/m3: stroke thrust varies with squared instantaneous tail velocity, asymmetric caudal loading acts aft of the mass centre, and paired fins generate vertical force. Quadratic resistance acts on water-relative body velocities. The animal is neutrally buoyant; roll, pitch and shed vortices are unresolved. The inertia, areas, force coefficients, distances and reaction times are simulation assumptions, not measured species-specific muscle properties. Supply each new prior and previousMotion from the corresponding previous outputs. The waterReaction output accounts for fluid impulse; solid-contact impulses are separate.</p></html>"));
end FishSchool;
