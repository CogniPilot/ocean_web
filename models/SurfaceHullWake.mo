model SurfaceHullWake "Shared bow pressure, spray sources, and stern foam outside a vessel plant"
  parameter Real stations[7],halfBeam[7];
  input Real speed[2],strips[12,3],pose[6],drift[2],sternArea,sternDraft,diskInduction,surfaceAccess,omitWake;
  discrete output Real sources[14,6](each start=0,each fixed=true),velocity[2](each start=0,each fixed=true);
  discrete output Real frame[4](each start=0,each fixed=true),foam[44,4](each start=0,each fixed=true);

  function aeratedWake "Transport and spread the surface trail of separated stern flow"
    input Real previous[44,4],position[2],surge,diskInduction,draft,area,sternHalfBeam,surfaceAccess;
    output Real trail[44,4] "Water-frame position, surface coverage and half width";
  protected
    Real velocity,ventilation,wetting,width,coverage,oldWidth;
  algorithm
    velocity:=max(0,surge);
    // Maki et al., Transom-stern flow for high-speed craft (2006).
    // Draft sets the ventilation scale. Bubble yield is a reduced-order closure.
    ventilation:=BowWavePatch.transomVentilation(velocity,draft);
    wetting:=area/(area+.08);
    width:=sternHalfBeam*(.32+.68*ventilation);
    coverage:=surfaceAccess*wetting*(ventilation+.18*(1-ventilation)*diskInduction/(1+diskInduction));
    trail[1,:]:={position[1],position[2],coverage,width};
    for i in 2:44 loop
      oldWidth:=previous[i-1,4];
      // Lateral diffusion broadens the band as bubbles are lost to degassing.
      width:=sqrt(oldWidth^2+2*.24*.1);
      coverage:=previous[i-1,3]*exp(-.1/2.3)*oldWidth/width;
      trail[i,:]:={previous[i-1,1],previous[i-1,2],coverage,width};
    end for;
  end aeratedWake;

equation
  when sample(0,.1) then
    velocity=if omitWake<.5 then speed else zeros(2);
    frame={pose[1],pose[2],cos(pose[6]),sin(pose[6])};
    sources=if omitWake<.5 then BowWavePatch.hullSources(velocity,BowWavePatch.localStrips(strips,frame),
      stations,halfBeam,separatedStern=true,sharedTransomDraft=sternDraft) else zeros(14,6);
    foam=if omitWake<.5 then aeratedWake(pre(foam),pose[1:2]-drift+stations[1]*cos(pose[5])*frame[3:4],
      speed[1],diskInduction,sternDraft,sternArea,halfBeam[1]+halfBeam[2],surfaceAccess) else zeros(44,4);
  end when;
end SurfaceHullWake;
