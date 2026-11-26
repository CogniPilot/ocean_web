within Wreck;
model PiccardPower "Six-cell pack supplying a regulated 16 V thruster and equipment bus"
  parameter Real capacityAh(min=.001)=10 "Usable pack capacity in ampere-hours";
  parameter Real initialSoc(min=0,max=1)=1;
  parameter Real resistance(unit="Ohm",min=0)=.045 "Assumed combined pack and wiring resistance";
  parameter Real converterEfficiency(min=.1,max=1)=.94;
  parameter Real hotelPower(unit="W",min=0)=18 "Assumed electronics and survey lighting load";
  parameter Real unloadedFraction(min=0,max=1)=.1 "Assumed fraction of bollard current for a rotor spinning in air";
  input Real motorThrust[6](each unit="N") "Signed thrust equivalent at the current rotor speed in fully submerged water";
  input Real immersion[6] "Fraction of each propeller disk submerged";
  input Real pumpPower(unit="W")=0;
  input Real busConnected=1 "Zero when the propulsion and hotel power bus is isolated";
  output Real motorCurrent[6](each unit="A") "Individual currents on the 16 V side of the converter";
  output Real stateOfCharge, remainingAh, packVoltage(unit="V"), packCurrent(unit="A"), busPower(unit="W");
  output Boolean powered;
protected
  Real discharged(unit="C",start=0,fixed=true);
  Real openVoltage(unit="V"), requestedPower(unit="W"), terminalPower(unit="W");

  function bollardCurrent "16 V Blue Robotics T200 bench proxy, sampled in the vehicle's +/-14 N command range"
    input Real thrust(unit="N");
    output Real amps(unit="A");
  protected
    // Measured curve at 2 N intervals, from zero to 14 N; idle electronics are in hotelPower.
    constant Real forward[8]={0,.162,.424,.800,1.198,1.729,2.346,3.059};
    constant Real reverse[8]={0,.200,.542,1.086,1.686,2.398,3.466,4.350};
    Real station,fraction;
    Integer lower;
  algorithm
    station:=min(7,abs(thrust)/2);
    lower:=min(7,integer(floor(station))+1);
    fraction:=station-(lower-1);
    amps:=if thrust>=0 then (1-fraction)*forward[lower]+fraction*forward[lower+1]
      else (1-fraction)*reverse[lower]+fraction*reverse[lower+1];
  end bollardCurrent;
equation
  remainingAh=max(0,capacityAh*initialSoc-discharged/3600);
  stateOfCharge=remainingAh/capacityAh;
  powered=remainingAh>0 and busConnected>.5;
  // Assumed resting LiPo cell voltages at 0%, 10%, 70%, and 100% charge.
  openVoltage=6*(if stateOfCharge<.1 then 3.2+3.5*stateOfCharge
    elseif stateOfCharge<.7 then 3.55+.25*(stateOfCharge-.1)
    else 3.7+(4.2-3.7)*(stateOfCharge-.7)/.3);
  for i in 1:6 loop
    motorCurrent[i]=if powered then bollardCurrent(motorThrust[i])*
      (unloadedFraction+(1-unloadedFraction)*min(1,max(0,immersion[i]))) else 0;
  end for;
  requestedPower=if powered then 16*sum(motorCurrent)+hotelPower+max(0,pumpPower) else 0;
  terminalPower=requestedPower/converterEfficiency;
  // Stable smaller root of P=I*(V_oc-I*R), including the ideal R=0 case.
  packCurrent=2*terminalPower/(openVoltage+sqrt(max(0,openVoltage^2-4*resistance*terminalPower)));
  packVoltage=openVoltage-resistance*packCurrent;
  busPower=requestedPower;
  der(discharged)=packCurrent;
end PiccardPower;
