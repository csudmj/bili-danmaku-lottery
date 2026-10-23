import type {UpdateState} from '../shared/project.ts';
type UpdateEvent={version?:string;percent?:number};
export interface UpdatePort {
 on(event:string,callback:(value:UpdateEvent)=>void):unknown;
 checkForUpdates():Promise<unknown>;
 downloadUpdate():Promise<unknown>;
 quitAndInstall(silent:boolean,restart:boolean):void;
}
export class UpdateController {
 private value:UpdateState;
 private running=false;
 private port:UpdatePort;
 private changed:(state:UpdateState)=>void;
 private checkTimeout:number;
 private downloadTimeout:number;
 constructor(port:UpdatePort,changed:(state:UpdateState)=>void,supported:boolean,checkTimeout=45000,downloadTimeout=30*60*1000){
  this.port=port;this.changed=changed;this.checkTimeout=checkTimeout;this.downloadTimeout=downloadTimeout;
  this.value=supported?{status:'idle'}:{status:'unsupported',message:'免安装版和开发环境不支持自动安装更新，请从下载页获取 Windows 安装包。'};
  port.on('update-available',info=>{if(this.value.status==='checking')this.set({status:'available',version:info.version});});
  port.on('update-not-available',()=>{if(this.value.status==='checking')this.set({status:'current',message:'当前已是最新正式版'});});
  port.on('download-progress',p=>{if(this.value.status==='downloading')this.set({...this.value,percent:Math.max(0,Math.min(100,Number(p.percent)||0))});});
  port.on('update-downloaded',info=>{if(this.value.status!=='unsupported')this.set({status:'downloaded',version:info.version,percent:100});});
  port.on('error',()=>{if(['checking','downloading'].includes(this.value.status))this.fail();});
 }
 get(){return {...this.value};}
 private set(value:UpdateState){this.value=value;this.changed(this.get());}
 private fail(message='更新请求失败：请检查 GitHub 网络连接及 Release 附件（latest.yml 和安装包），然后重试或打开下载页。'){this.set({status:'error',message});}
 private async bounded(task:Promise<unknown>,ms:number){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms);})]);}
  finally{clearTimeout(timer);}
 }
 async check(){
  if(this.running||['unsupported','downloaded'].includes(this.value.status))return this.get();
  this.running=true;this.set({status:'checking',message:'正在连接 GitHub；45 秒未完成会提示重试。'});
  try{await this.bounded(this.port.checkForUpdates(),this.checkTimeout);if(this.value.status==='checking')this.fail('未收到有效更新结果。请重试；若持续失败，请打开下载页手动下载安装。');}
  catch(e){if(this.get().status!=='downloaded')this.fail(e instanceof Error&&e.message==='timeout'?'检查更新超时，请检查 GitHub 连接后重试，或打开下载页手动更新。':undefined);}
  finally{this.running=false;}
  return this.get();
 }
 async download(){
  if(this.running||this.value.status!=='available')throw Error('请先检查并确认有可用新版本');
  this.running=true;this.set({...this.value,status:'downloading',percent:0,message:'正在下载并校验安装包；网络较慢时可从下载页手动下载。'});
  try{await this.bounded(this.port.downloadUpdate(),this.downloadTimeout);if(this.get().status==='downloading')this.fail('下载未完成，请重新检查更新或从下载页获取安装包。');}
  catch(e){if(this.get().status!=='downloaded')this.fail(e instanceof Error&&e.message==='timeout'?'下载超时，请检查网络后重试或手动下载；后台若完成校验，会显示安装按钮。':undefined);}
  finally{this.running=false;}
  return this.get();
 }
 install(){if(this.running||this.value.status!=='downloaded')throw Error('更新尚未下载完成');this.port.quitAndInstall(false,true);}
}
