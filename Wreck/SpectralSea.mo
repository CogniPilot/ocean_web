within Wreck;
package SpectralSea "Directional, finite-depth Fourier sea on a periodic patch"
  constant Integer N=32;
  constant Real length=64 "Periodic tile size [m]";

  function inverseLine "Unnormalised inverse radix-two transform of Fourier series coefficients"
    input Real re[N],im[N];
    output Real x[N],y[N];
  protected
    Integer j,bit,span,half,base,left,right;
    Real c,s,r,i;
  algorithm
    j:=0;
    for n in 0:N-1 loop
      x[j+1]:=re[n+1]; y[j+1]:=im[n+1];
      bit:=div(N,2);
      while bit>0 and mod(div(j,max(1,bit)),2)==1 loop
        j:=j-bit; bit:=div(bit,2);
      end while;
      j:=j+bit;
    end for;
    span:=2;
    while span<=N loop
      half:=div(span,2);
      for offset in 0:half-1 loop
        c:=cos(2*pi*offset/span); s:=sin(2*pi*offset/span);
        for blockIndex in 0:div(N,span)-1 loop
          base:=blockIndex*span;
          left:=base+offset+1; right:=left+half;
          r:=c*x[right]-s*y[right]; i:=s*x[right]+c*y[right];
          x[right]:=x[left]-r; y[right]:=y[left]-i;
          x[left]:=x[left]+r; y[left]:=y[left]+i;
        end for;
      end for;
      span:=2*span;
    end while;
  end inverseLine;

  function sampleField "One spectrum and inverse transform for all receiver positions"
    input Real t,wind,bearing,fetch,waterDepth,tide,pos[:,3];
    output Real height[N,N] "Surface relative to tide, rows north, columns east";
    output Real probe[size(pos,1),5] "Surface elevation, local wave velocity ENU, dynamic pressure head";
  protected
    Real re[N,N],im[N,N],line[N],unused[N],tmpR[N],tmpI[N];
    Real dk=2*pi/length;
    Real kx,ky,k,omega,f,groupSpeed,sigma,peak,hs,energy,amp,phase,atProbe;
    Real windE=cos(bearing),windN=sin(bearing),alongWind;
    Real total=0,scale,directional,level[size(pos,1)],phaseSeed,amplitudeSeed;
    Integer mx,my,opx,opy;
  algorithm
    re:=zeros(N,N); im:=zeros(N,N); probe:=zeros(size(pos,1),5);
    level:={max(0,min(waterDepth,waterDepth+pos[r,3]-tide)) for r in 1:size(pos,1)};
    peak:=1/max(1.2,7.54*max(0.1,wind)/g*tanh(0.077*(g*fetch/max(0.1,wind)^2)^0.25));
    hs:=0.283*wind^2/g*tanh(0.0125*(g*fetch/max(0.1,wind)^2)^0.42);
    for ix in 1:N loop
      mx:=if ix-1<N/2 then ix-1 else ix-1-N;
      for iy in 1:N loop
        my:=if iy-1<N/2 then iy-1 else iy-1-N;
        kx:=dk*mx; ky:=dk*my; alongWind:=kx*windE+ky*windN;
        // Upwind modes carry zero energy in this directional spectrum.
        if alongWind>0 and abs(mx)<N/2 and abs(my)<N/2 then
          k:=sqrt(kx*kx+ky*ky);
          omega:=sqrt(g*k*tanh(k*waterDepth)); f:=omega/(2*pi);
          groupSpeed:=g*(tanh(k*waterDepth)+k*waterDepth/cosh(k*waterDepth)^2)/(2*omega);
          directional:=(alongWind/k)^4;
          sigma:=if f<peak then 0.07 else 0.09;
          energy:=f^(-5)*exp(-1.25*(peak/f)^4)*3.3^exp(-0.5*((f-peak)/(peak*sigma))^2)
            *directional*groupSpeed/(2*pi*k)*dk^2;
          phaseSeed:=mod(sin(ix*127.1+iy*311.7)*43758.5453,1);
          amplitudeSeed:=max(1e-6,mod(sin(ix*269.5+iy*183.3)*19341.235,1));
          amp:=sqrt(max(0,-2*energy*log(amplitudeSeed)));
          total:=total+0.5*amp^2;
          phase:=2*pi*phaseSeed-omega*t;
          opx:=mod(-mx,N)+1; opy:=mod(-my,N)+1;
          re[iy,ix]:=re[iy,ix]+0.5*amp*cos(phase);
          im[iy,ix]:=im[iy,ix]+0.5*amp*sin(phase);
          re[opy,opx]:=re[opy,opx]+0.5*amp*cos(phase);
          im[opy,opx]:=im[opy,opx]-0.5*amp*sin(phase);
          for r in 1:size(pos,1) loop
            atProbe:=kx*pos[r,1]+ky*pos[r,2]+phase;
            probe[r,1]:=probe[r,1]+amp*cos(atProbe);
            probe[r,2]:=probe[r,2]+amp*omega*(kx/k)*cosh(k*level[r])/sinh(k*waterDepth)*cos(atProbe);
            probe[r,3]:=probe[r,3]+amp*omega*(ky/k)*cosh(k*level[r])/sinh(k*waterDepth)*cos(atProbe);
            probe[r,4]:=probe[r,4]+amp*omega*sinh(k*level[r])/sinh(k*waterDepth)*sin(atProbe);
            probe[r,5]:=probe[r,5]+amp*cosh(k*level[r])/cosh(k*waterDepth)*cos(atProbe);
          end for;
        end if;
      end for;
    end for;
    scale:=hs/(4*sqrt(max(1e-18,total)));
    probe:=probe*scale;
    // A persistent swell crosses the local wind sea, including in a calm.
    kx:=dk; ky:=-dk; k:=sqrt(2)*dk; omega:=sqrt(g*k*tanh(k*waterDepth));
    phase:=0.7-omega*t; amp:=0.32;
    re:=re*scale; im:=im*scale;
    re[N,2]:=re[N,2]+0.5*amp*cos(phase); im[N,2]:=im[N,2]+0.5*amp*sin(phase);
    re[2,N]:=re[2,N]+0.5*amp*cos(phase); im[2,N]:=im[2,N]-0.5*amp*sin(phase);
    for r in 1:size(pos,1) loop
      atProbe:=kx*pos[r,1]+ky*pos[r,2]+phase;
      probe[r,:]:=probe[r,:]+amp*{cos(atProbe),omega*kx/k*cosh(k*level[r])/sinh(k*waterDepth)*cos(atProbe),
        omega*ky/k*cosh(k*level[r])/sinh(k*waterDepth)*cos(atProbe),
        omega*sinh(k*level[r])/sinh(k*waterDepth)*sin(atProbe),cosh(k*level[r])/cosh(k*waterDepth)*cos(atProbe)};
    end for;
    for row in 1:N loop
      (tmpR,tmpI):=inverseLine(re[row,:],im[row,:]);
      re[row,:]:=tmpR; im[row,:]:=tmpI;
    end for;
    for col in 1:N loop
      (line,unused):=inverseLine(re[:,col],im[:,col]);
      height[:,col]:=line;
    end for;
  end sampleField;

  function field "Single receiver interface"
    input Real t,wind,bearing,fetch,waterDepth,tide,pos[3];
    output Real height[N,N],probe[5];
  protected
    Real receiver[1,5];
  algorithm
    (height,receiver):=sampleField(t,wind,bearing,fetch,waterDepth,tide,{pos});
    probe:=receiver[1,:];
  end field;
end SpectralSea;
