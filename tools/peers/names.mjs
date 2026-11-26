import {RegExpMatcher,englishDataset,englishRecommendedTransformers} from 'obscenity';

const dataset=englishDataset.build();
const matcher=new RegExpMatcher({...dataset,...englishRecommendedTransformers,
  whitelistedTerms:[...dataset.whitelistedTerms,'cockpit','cockpits','coxswain','coxswains']});

export function validRoomName(value){
  if(typeof value!=='string'||!value.trim()||value.length>64||/[\p{Cc}\p{Cf}]/u.test(value))return false;
  const normalized=value.normalize('NFKC');
  return !matcher.hasMatch(normalized)&&!matcher.hasMatch(normalized.replace(/[._-]/g,''));
}
