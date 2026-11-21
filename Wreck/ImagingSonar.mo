within Wreck;
package ImagingSonar "Forward imaging sonar, bearing and two-way travel-time bins"
  constant Integer bearings=65,bins=128,verticalSamples=15;
  constant Real halfFan=65*pi/180,rangeMax=18, depression=6*pi/180;
  constant Real mount[3]={.60,0,.02};

  function ping
    input Real t,pos[3],T[3,3];
    output Real intensity[bearings,32] "Four unsigned 8-bit range cells per word, near cell first";
    output Real profile[49] "Dominant echo slant range per navigation bearing; zero is no detection";
  protected
    Real o[3],dir[3],az,el,cs,sn,r,ranges[verticalSamples],power[bins],strongest,word,value;
    Real grazing,scatter,weight,bin,fraction,spacing,amplitude,speckle,localSeed,slant[bearings];
    Integer k,peak,first,last;
  algorithm
    intensity:=zeros(bearings,32);
    o:=pos+transpose(T)*mount;
    for b in 1:bearings loop
      az:=(2*(b-1)/(bearings-1)-1)*halfFan;
      cs:=cos(az);sn:=sin(az);
      for j in 1:verticalSamples loop
        el:=-depression+(2*(j-1)/(verticalSamples-1)-1)*10*pi/180;
        dir:=transpose(T)*{cos(el)*cs,cos(el)*sn,sin(el)};
        ranges[j]:=WreckSolids.beamRange(o,dir,rangeMax+.5);
      end for;
      power:=zeros(bins);
      for j in 1:verticalSamples loop
        r:=ranges[j];
        if r>=.1 and r<rangeMax then
          spacing:=min(abs(r-ranges[max(1,j-1)]),abs(r-ranges[min(verticalSamples,j+1)]));
          grazing:=1/sqrt(1+(spacing/max(.01,r*.025))^2);
          el:=-depression+(2*(j-1)/(verticalSamples-1)-1)*10*pi/180;
          dir:=transpose(T)*{cos(el)*cs,cos(el)*sn,sin(el)};
          scatter:=if o[3]+r*dir[3]< -13.68 then .38 else 1.;
          weight:=1-.55*((2*j-verticalSamples-1)/(verticalSamples-1))^2;
          amplitude:=scatter*weight*(.12+.88*grazing)*exp(-.045*r);
          bin:=r*bins/rangeMax+.5;
          k:=min(bins-1,max(1,integer(floor(bin))));fraction:=min(1,max(0,bin-k));
          power[k]:=power[k]+amplitude*(1-fraction);
          power[k+1]:=power[k+1]+amplitude*fraction;
          if j>1 and ranges[max(1,j-1)]<rangeMax and abs(r-ranges[max(1,j-1)])<min(1.8,.14*r) then
            // Spread a continuous patch across slant range. A depth jump
            // ends the patch, leaving the acoustic shadow behind its edge.
            first:=max(1,integer(ceil(min(r,ranges[max(1,j-1)])*bins/rangeMax+.5)));
            last:=min(bins,integer(floor(max(r,ranges[max(1,j-1)])*bins/rangeMax+.5)));
            for cell in first:last loop power[cell]:=power[cell]+amplitude/max(1,last-first+1);end for;
          end if;
        end if;
      end for;
      peak:=0;strongest:=.095;word:=0;
      for cell in 1:bins loop
        localSeed:=cell*13.73+b*78.31;
        speckle:=.45+1.1*mod(43758.55*sin(localSeed),1)+.20*Perception.noise(t,b*bins+cell);
        value:=power[cell]*speckle;
        if value>strongest then strongest:=value;peak:=cell;end if;
        value:=min(255,integer(floor(252*(1-exp(-1.65*value))+2*(1+Perception.noise(t,cell+3*b)))));
        word:=word+value*256^mod(cell-1,4);
        if mod(cell,4)==0 then intensity[b,div(cell,4)]:=word;word:=0;end if;
      end for;
      slant[b]:=if peak==0 then 0 else (peak-.5)*rangeMax/bins;
    end for;
    profile:={slant[1+integer(floor((i-1)*(bearings-1)/48+.5))] for i in 1:49};
  end ping;
end ImagingSonar;
