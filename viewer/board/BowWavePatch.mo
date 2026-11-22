model BowWavePatch "Near-hull Bernoulli elevation from a slender-body source distribution"
  constant Integer n=32;
  constant Integer fineColumns=27,fineRows=37;
  constant Real pi=Modelica.Constants.pi;
  parameter Real length=8;
  parameter Real refineBows(min=0,max=1)=0 "Set to one to sample the finer bow rectangle";
  final parameter Real fineOrigin[2]={1.2,-1.8} "Forward and port coordinates of the first fine node [m]";
  final parameter Real fineSpacing=.10 "Distance between fine nodes on both axes [m]";
  input Real relativeSpeed[2] "Water-relative hull velocity in the forward/port axes [m/s]";
  input Real sources[14,6] "Modelica line sources used by the vehicle hydrodynamics";
  output Real height[n,n] "Short-range linear Bernoulli head in the local axes";
  output Real fineHeight[fineRows,fineColumns] "Nested bow elevations, port rows and forward columns [m]";

  function lineFlow
    input Real x,y,low,high,core2,velocity[2];
    output Real alongVelocity;
  protected
    Real l,h,r2,a,b;
  algorithm
    l:=x-high;
    h:=x-low;
    r2:=y*y+core2;
    a:=1/sqrt(l*l+r2);
    b:=1/sqrt(h*h+r2);
    alongVelocity:=(velocity[1]*(a-b)+velocity[2]*y*(h*b-l*a)/r2)/(high-low);
  end lineFlow;

  function potentialHead
    input Real x,y,velocity[2],sources[14,6];
    output Real elevation;
  protected
    Real dy,core2,taper;
  algorithm
    elevation:=0;
    taper:=min(1,max(0,(sqrt(x*x+y*y)-2.9)/.9));
    if taper>=1 then return; end if;
    for i in 1:14 loop
      if sources[i,3]<>0 then
        dy:=y-sources[i,2];
        core2:=sources[i,4];
        // Integrate between the sampled section centres. The mirrored
        // source supplies the rigid-lid near field. Remove the broad
        // component where the spectral solver resolves the disturbance.
        elevation:=elevation+sources[i,3]*(
          lineFlow(x,dy,sources[i,1],sources[i,5],core2,velocity)-
          lineFlow(x,dy,sources[i,1],sources[i,5],core2+sources[i,6],velocity))/(2*pi*9.80665);
      end if;
    end for;
    elevation:=elevation*(1-taper^2*(3-2*taper));
  end potentialHead;

  function hullSources
    input Real velocity[2],strips[12,3],stations[7],beam[7];
    input Boolean separatedStern=false "Model a ventilating transom in ahead flow";
    output Real sources[14,6];
  protected
    Real area[8],draft,width,side,x,xLow,xHigh,core2,sternDraft,ventilation,recovery;
    Integer index,back,front,low,high;
  algorithm
    sources:=zeros(14,6);
    for hull in 1:2 loop
      area[1]:=0;area[8]:=0;
      for i in 1:6 loop
        index:=6*(hull-1)+i;
        area[i+1]:=strips[index,3]/(stations[i+1]-stations[i]);
      end for;
      sternDraft:=max(.045,.5*area[2]/max(.12,beam[1]+beam[2]));
      ventilation:=if separatedStern then min(1,max(0,velocity[1]/sqrt(9.80665*sternDraft)-2)) else 0;
      // At high draft Froude number the water separates at the transom.
      // Recover the same flux over the distance it travels while falling one
      // draft, with the two aft kernels widening into the separated wake.
      recovery:=ventilation^2*(3-2*ventilation)*velocity[1]*sqrt(2*sternDraft/9.80665);
      for i in 1:7 loop
        back:=6*(hull-1)+max(1,i-1);
        front:=6*(hull-1)+min(6,i);
        low:=min(6,i);high:=max(2,i);
        width:=beam[i];
        draft:=max(.045,.5*(area[i]+area[i+1])/max(.12,beam[low]+beam[high]));
        side:=.5*(strips[back,2]+strips[front,2]);
        x:=stations[i]+.5*(strips[back,1]-.5*(stations[max(1,i-1)]+stations[max(1,i-1)+1])
                            +strips[front,1]-.5*(stations[min(6,i)]+stations[min(6,i)+1]));
        xLow:=if i==1 then x-recovery else min(x-.05,strips[back,1]);
        xHigh:=if i==7 then x else max(x+.05,strips[front,1]);
        core2:=draft^2+max(.075,.75*width)^2+(if i<=2 then sternDraft*recovery else 0);
        sources[7*(hull-1)+i,:]:={xLow,side,velocity[1]*(area[i]-area[i+1]),core2,xHigh,.49};
      end for;
    end for;
  end hullSources;

  function sampleGrid
    input Real velocity[2],sources[14,6],length;
    output Real eta[n,n];
  protected
    Real dx,side;
  algorithm
    eta:=zeros(n,n);
    dx:=length/n;
    for j in 1:n loop
      side:=(if j<=n/2 then j-1 else j-1-n)*dx;
      eta[j,:]:={potentialHead((if i<=n/2 then i-1 else i-1-n)*dx,side,velocity,sources) for i in 1:n};
    end for;
  end sampleGrid;

  function sampleFineGrid
    input Real velocity[2],sources[14,6],origin[2],spacing,enabled;
    output Real eta[fineRows,fineColumns];
  protected
    Real side;
  algorithm
    eta:=zeros(fineRows,fineColumns);
    if enabled>.5 then
      for j in 1:fineRows loop
        side:=origin[2]+(j-1)*spacing;
        eta[j,:]:={potentialHead(origin[1]+(i-1)*spacing,side,velocity,sources) for i in 1:fineColumns};
      end for;
    end if;
  end sampleFineGrid;

  function localStrips
    input Real worldStrips[12,3],pose[4] "East, north, cosine and sine of heading";
    output Real local[12,3];
  algorithm
    for i in 1:12 loop
      local[i,1]:=pose[3]*(worldStrips[i,1]-pose[1])+pose[4]*(worldStrips[i,2]-pose[2]);
      local[i,2]:=pose[3]*(worldStrips[i,2]-pose[2])-pose[4]*(worldStrips[i,1]-pose[1]);
      local[i,3]:=worldStrips[i,3];
    end for;
  end localStrips;
equation
  height=sampleGrid(relativeSpeed,sources,length);
  fineHeight=sampleFineGrid(relativeSpeed,sources,fineOrigin,fineSpacing,refineBows);
end BowWavePatch;
