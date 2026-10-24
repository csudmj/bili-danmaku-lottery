import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
export interface LivePreferences {blockRemoved:boolean;giftSort:boolean}
export function loadLivePreferences(file:string):LivePreferences{
 try{const v=JSON.parse(readFileSync(file,'utf8'));return {blockRemoved:typeof v.blockRemoved==='boolean'?v.blockRemoved:true,giftSort:v.giftSort===true};}
 catch{return {blockRemoved:true,giftSort:false};}
}
export function saveLivePreferences(file:string,value:LivePreferences){
 if(typeof value.blockRemoved!=='boolean'||typeof value.giftSort!=='boolean')throw Error('无效的高级设置');
 mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(value),'utf8');renameSync(file+'.tmp',file);
}
