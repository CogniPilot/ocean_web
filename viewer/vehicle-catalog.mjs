// IDs are shared by spawn selection, multiplayer, and saved settings.
// A peerHullClass of zero means there is no supported multiplayer contact shape.
const definitions=[
  {id:'hobie',label:'Hobie 16',role:'boat',runtime:'sailing',category:'sailboat',asset:'hobie-hulls',
    capabilities:{npc:'vessel',npcRace:true,peerPose:'rigged',peerHullClass:1,landingDeck:true,wake:'twin'}},
  {id:'diver',label:'Scuba diver',runtime:'habitat',category:'animal',
    capabilities:{npc:'animal',peerPose:'hosted',alongsideDive:true}},
  {id:'motorboat',label:'Sea Ray Sundancer 320',runtime:'motorboat',category:'powerboat',
    capabilities:{npc:'vessel',peerPose:'rigid',peerHullClass:3,landingDeck:true,sternLift:true,
      engine:true,fuel:true,anchor:true,bilge:true,wake:'planing'}},
  {id:'whaler',label:'Boston Whaler 190',runtime:'whaler',category:'powerboat',asset:'boston-whaler-190',
    capabilities:{peerPose:'rigid',engine:true,fuel:true,anchor:true,bilge:true,wake:'planing'}},
  {id:'sloop',label:'Pilothouse sloop',role:'boat',runtime:'sloop',category:'sailboat',asset:'sloop-hull',
    capabilities:{npc:'vessel',peerPose:'rigged',peerHullClass:2,landingDeck:true,wake:'single'}},
  {id:'drone',label:'RDD2 drone',runtime:'flight',category:'aircraft',
    capabilities:{npc:'vessel',peerPose:'rigid',groundStation:true}},
  {id:'sub',label:'Piccard Sub',runtime:'submarine',category:'submarine',asset:'survey-pressure-housing',
    capabilities:{npc:'vessel',peerPose:'rigid',liftRider:true}},
  {id:'whale',label:'Humpback whale',runtime:'habitat',category:'animal',
    capabilities:{npc:'animal',peerPose:'hosted'}},
  {id:'shark',label:'Great white shark',runtime:'habitat',category:'animal',
    capabilities:{npc:'animal',peerPose:'hosted'}},
  {id:'manta',label:'Manta ray',runtime:'habitat',category:'animal',
    capabilities:{npc:'animal',peerPose:'hosted'}},
  {id:'gull',label:'Herring gull',runtime:'habitat',category:'animal',
    capabilities:{npc:'gull',peerPose:'hosted'}},
  {id:'onrt',label:'ONR Tumblehome',runtime:'onrt',world:'basin',category:'ship',capabilities:{}},
];

export const vehicleCatalog=Object.freeze(Object.assign(Object.create(null),
  Object.fromEntries(definitions.map(({id,capabilities,...definition})=>[id,Object.freeze({
    id,role:id,world:'ocean',...definition,
    capabilities:Object.freeze({peerHullClass:0,...capabilities}),
  })])),
));

export const oceanVehicles=Object.freeze(Object.values(vehicleCatalog).filter(vehicle=>vehicle.world==='ocean'));

export function vehicleForRole(role,isHobie=true){
  return vehicleCatalog[role==='boat'?(isHobie?'hobie':'sloop'):role];
}
