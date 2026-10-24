import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';

export function validOverlaySize(value:unknown):{width:number;height:number}{
 const v=value as {width?:number;height?:number}|null;
 return {width:typeof v?.width==='number'&&Number.isFinite(v.width)?Math.max(280,Math.min(560,Math.round(v.width))):470,
  height:typeof v?.height==='number'&&Number.isFinite(v.height)?Math.max(440,Math.min(10000,Math.round(v.height))):870};
}
export function loadOverlaySize(file:string){
 try{return validOverlaySize(JSON.parse(readFileSync(file,'utf8')));}catch{return validOverlaySize(null);}
}
export function saveOverlaySize(file:string,value:unknown){
 const size=validOverlaySize(value);
 mkdirSync(path.dirname(file),{recursive:true});
 writeFileSync(file+'.tmp',JSON.stringify(size),'utf8');renameSync(file+'.tmp',file);
}
