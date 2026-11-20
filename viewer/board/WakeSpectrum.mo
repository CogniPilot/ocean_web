model WakeSpectrum "World-referenced periodic gravity-wave field with a moving displacement source"
  constant Integer n=64;
  constant Real pi=3.141592653589793;
  parameter Real period=64,dt=.1,depth=14,decay=.04;
  input Real east,north,heading,heel,pitch,stations[7],separation,volume[2,6],beamHalf[7];
  input Real currentEast,currentNorth,windEast,windNorth,seaAmplitude;
  Real driftE(start=0,fixed=true),driftN(start=0,fixed=true);
  discrete Real modesR[n,n](each start=0,each fixed=true),modesI[n,n](each start=0,each fixed=true);
  discrete Real displacementR[n,n](each start=0,each fixed=true),displacementI[n,n](each start=0,each fixed=true);
  discrete output Real height[n,n](each start=0,each fixed=true);
  discrete output Real waveLoad[3](each start=0,each fixed=true) "Wave resistance east, north [N] and yaw [Nm]";
  discrete output Real incident[3](each start=0,each fixed=true) "Wind-wave elevation, pitch and roll at hull";
  function transform "Radix-two FFT in both dimensions. The inverse divides by n squared."
    input Real realPart[n,n],imagPart[n,n];
    input Boolean inverse;
    output Real re[n,n],im[n,n];
  protected
    Real a[n],b[n],c,s,r,v,angle;
    Integer rev,bit,span,halfSpan,j,k;
  algorithm
    re:=realPart;im:=imagPart;
    for axis in 1:2 loop
      for line in 1:n loop
        if axis==1 then
          a:=re[line,:];b:=im[line,:];
        else
          a:=re[:,line];b:=im[:,line];
        end if;
        rev:=0;
        for i in 1:n loop
          if i<rev+1 then
            r:=a[i];a[i]:=a[rev+1];a[rev+1]:=r;
            v:=b[i];b[i]:=b[rev+1];b[rev+1]:=v;
          end if;
          bit:=div(n,2);
          while bit>0 and mod(div(rev,max(1,bit)),2)==1 loop
            rev:=rev-bit;bit:=div(bit,2);
          end while;
          rev:=rev+bit;
        end for;
        span:=2;
        while span<=n loop
          halfSpan:=div(span,2);
          for offset in 0:halfSpan-1 loop
            angle:=(if inverse then 2 else -2)*pi*offset/span;
            c:=cos(angle);s:=sin(angle);
            for blockIndex in 0:div(n,span)-1 loop
              j:=blockIndex*span+offset+1;k:=j+halfSpan;
              r:=c*a[k]-s*b[k];v:=s*a[k]+c*b[k];
              a[k]:=a[j]-r;b[k]:=b[j]-v;a[j]:=a[j]+r;b[j]:=b[j]+v;
            end for;
          end for;
          span:=span*2;
        end while;
        if axis==1 then
          re[line,:]:=a;im[line,:]:=b;
        else
          re[:,line]:=a/(if inverse then n*n else 1);
          im[:,line]:=b/(if inverse then n*n else 1);
        end if;
      end for;
    end for;
  end transform;
  function step
    input Real prevR[n,n],prevI[n,n],oldR[n,n],oldI[n,n],vol[2,6],xs[7],beams[7],sep,x,y,bearing,heel,pitch,ue,un,sea,L,h,dt,loss,t;
    input Boolean first;
    output Real wr[n,n],wi[n,n],displacedR[n,n],displacedI[n,n],tile[n,n],probe[3],load[3];
  protected
    Real rowR[n],rowI[n],windR[n],windI[n],sourceR[n],sourceI[n],dx,kx,ky,k,omega,c,s,atten,along,across,ex,ny,a,b,amplitude,phase,slope;
    Integer mx,my,strip;
    Real km,peak,windSpeed,directional,seed,trial;
    Real sr,si,mr,mi,stripR,stripI,momentArm,crossTerm,forceScale;
    Real cx[12,n],sx[12,n],cy[12,n],sy[12,n],ka,kb,length,width,draft,weight;
    Real re[n,n],im[n,n],unused[n,n];
  algorithm
    windSpeed:=sqrt(ue*ue+un*un);peak:=max(.19,1.4/max(2,windSpeed));
    dx:=L/n;probe:=zeros(3);load:=zeros(3);forceScale:=1025*9.80665*dx^2/n^2;
    // Fourier transform of six immersed strips on each hull. Separable phase
    // tables preserve the exact subcell locations and avoid a forward FFT.
    cx:=zeros(12,n);sx:=zeros(12,n);cy:=zeros(12,n);sy:=zeros(12,n);
    for hull in 1:2 loop
      for panel in 1:6 loop
        strip:=(hull-1)*6+panel;
        along:=.5*(xs[panel]+xs[panel+1])*cos(pitch);
        across:=(3-2*hull)*sep*cos(heel);
        ex:=x+along*cos(bearing)-across*sin(bearing);
        ny:=y+along*sin(bearing)+across*cos(bearing);
        for i in 1:n loop
          k:=2*pi*(if i<=div(n,2) then i-1 else i-1-n)/L;
          cx[strip,i]:=cos(k*ex);sx[strip,i]:=sin(k*ex);
          cy[strip,i]:=cos(k*ny);sy[strip,i]:=sin(k*ny);
        end for;
      end for;
    end for;
    re:=zeros(n,n);im:=zeros(n,n);displacedR:=oldR;displacedI:=oldI;
    wr:=prevR;wi:=prevI;
    for j in 1:n loop
      sourceR:=zeros(n);sourceI:=zeros(n);
      rowR:=prevR[j,:];rowI:=prevI[j,:];windR:=zeros(n);windI:=zeros(n);
      for i in 1:n loop
        mx:=if i<=div(n,2) then i-1 else i-1-n;
        my:=if j<=div(n,2) then j-1 else j-1-n;
        kx:=2*pi*mx/L;ky:=2*pi*my/L;k:=sqrt(kx^2+ky^2);
        sr:=0;si:=0;mr:=0;mi:=0;
        ka:=kx*cos(bearing)+ky*sin(bearing);kb:=-kx*sin(bearing)+ky*cos(bearing);
        for hull in 1:2 loop
          for panel in 1:6 loop
            strip:=(hull-1)*6+panel;
            length:=max(.001,xs[panel+1]-xs[panel]);
            width:=max(.001,beams[panel]+beams[panel+1]);
            draft:=vol[hull,panel]/(length*width);
            // Match each strip's volume and rectangular second moments.
            // Submerged sources radiate less energy at short wavelengths.
            weight:=vol[hull,panel]/dx^2*exp(-.5*k*draft-((ka*length)^2+(kb*width)^2)/24);
            stripR:=weight*(cx[strip,i]*cy[strip,j]-sx[strip,i]*sy[strip,j]);
            stripI:=-weight*(sx[strip,i]*cy[strip,j]+cx[strip,i]*sy[strip,j]);
            sr:=sr+stripR;si:=si+stripI;
            along:=.5*(xs[panel]+xs[panel+1])*cos(pitch);
            across:=(3-2*hull)*sep*cos(heel);
            momentArm:=along*kb-across*ka;
            mr:=mr+momentArm*stripR;mi:=mi+momentArm*stripI;
          end for;
        end for;
        // The signed wavevector is ambiguous on a Nyquist row or column.
        // Omit it so a symmetric tow cannot acquire a spurious lateral load.
        if abs(mx)==div(n,2) or abs(my)==div(n,2) then
          sr:=0;si:=0;mr:=0;mi:=0;
        end if;
        sourceR[i]:=sr;sourceI[i]:=si;
        omega:=sqrt(9.80665*k*tanh(k*h));c:=cos(omega*dt);s:=sin(omega*dt);
        atten:=exp(-dt*loss*(1+.08*k^2));
        // Complex travelling waves encode elevation and its quadrature.
        // A real spatial displacement increment excites both travel directions.
        rowR[i]:=atten*(c*prevR[j,i]+s*prevI[j,i])+(if first or k==0 then 0 else sourceR[i]-oldR[j,i]);
        rowI[i]:=atten*(c*prevI[j,i]-s*prevR[j,i])+(if first or k==0 then 0 else sourceI[i]-oldI[j,i]);

        // Integral of -rho*g*displacement*grad(elevation), evaluated by
        // Parseval on the same modes used to reconstruct the displayed wake.
        crossTerm:=forceScale*(rowI[i]*sr-rowR[i]*si);
        load[1]:=load[1]+kx*crossTerm;load[2]:=load[2]+ky*crossTerm;
        load[3]:=load[3]+forceScale*(rowI[i]*mr-rowR[i]*mi);
        // Directional gravity-wave spectrum. Independent reproducible phase and
        // Rayleigh amplitude per travelling mode break up parallel crest lines.
        if k>0 and abs(mx)<div(n,2) and abs(my)<div(n,2) then
          km:=k/peak;
          directional:=max(0,(kx*ue+ky*un)/(k*max(.01,windSpeed)));
          seed:=mod(sin(mx*127.1+my*311.7)*43758.5453,1);
          trial:=mod(sin(mx*269.5+my*183.3)*43758.5453,1);
          amplitude:=(.013*min(16,windSpeed)+sea*.85)*2*pi/(L*peak)
            *exp(-.625/km^2-.035*k^2)/km^2*directional^2*sqrt(-2*log(max(.0001,trial)));
          phase:=2*pi*seed-omega*t;
          windR[i]:=n*n*amplitude*cos(phase);
          windI[i]:=n*n*amplitude*sin(phase);
          phase:=phase+kx*x+ky*y;slope:=-amplitude*sin(phase);
          probe[1]:=probe[1]+amplitude*cos(phase);
          probe[2]:=probe[2]-slope*(kx*cos(bearing)+ky*sin(bearing));
          probe[3]:=probe[3]+slope*(-kx*sin(bearing)+ky*cos(bearing));
        end if;
      end for;
      displacedR[j,:]:=sourceR;displacedI[j,:]:=sourceI;
      wr[j,:]:=rowR;wi[j,:]:=rowI;re[j,:]:=rowR+windR;im[j,:]:=rowI+windI;
    end for;
    (tile,unused):=transform(re,im,true);
  end step;
equation
  der(driftE)=currentEast;der(driftN)=currentNorth;
  when sample(0,dt) then
    (modesR,modesI,displacementR,displacementI,height,incident,waveLoad)=step(pre(modesR),pre(modesI),pre(displacementR),pre(displacementI),volume,stations,beamHalf,separation,east-driftE,north-driftN,heading,heel,pitch,windEast,windNorth,seaAmplitude,period,depth,dt,decay,time,time<dt/2);
  end when;
end WakeSpectrum;
