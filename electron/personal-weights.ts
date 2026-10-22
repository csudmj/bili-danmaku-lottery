import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {validatePersonalWeights,type PersonalWeight} from './lottery.ts';

export function loadPersonalWeights(file:string):PersonalWeight[]{
    if(!existsSync(file))return [];
    return validatePersonalWeights(JSON.parse(readFileSync(file,'utf8')));
}
export function savePersonalWeights(file:string,value:unknown):PersonalWeight[]{
    const entries=validatePersonalWeights(value);
    mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file+'.tmp',JSON.stringify(entries,null,2),'utf8');
    renameSync(file+'.tmp',file);
    return entries;
}
