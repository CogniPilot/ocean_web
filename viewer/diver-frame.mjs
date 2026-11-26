// The live diver and training ghosts use the same rig packet.
export function appendDiverRig(frame,model){
  const [dive,gauge,upright,computer]=model.getMany(['dive','gauge','upright','computer']);
  frame.push(...dive,...gauge,upright,...computer,...model.logSample);
  if(model.has('jointAngles'))frame.push(...model.getMany(['jointAngles','jointRates','footContact']).flat());
  if(model.has('lateralAngles'))frame.push(...model.getMany(['lateralAngles','lateralRates']).flat());
  if(model.has('vestGas'))frame.push(...model.getMany(['vestGas','vestLitres']));
  if(model.has('axialAngles')){
    frame.push(...model.getMany(['axialAngles','axialRates']).flat());
    if(model.has('torchDeployment'))frame.push(model.get('torchDeployment'));
  }
  return frame;
}
