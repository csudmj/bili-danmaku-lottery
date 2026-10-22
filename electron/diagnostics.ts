import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import {appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let getMain:()=>BrowserWindow|null=()=>null;
let stop=()=>{};
let handling=false;
const logPath=()=>path.join(app.getPath('userData'),'diagnostics','events.log');
function record(event:string){
    try{mkdirSync(path.dirname(logPath()),{recursive:true});if(existsSync(logPath()) && readFileSync(logPath()).length>128*1024)writeFileSync(logPath(),'');appendFileSync(logPath(),`${new Date().toISOString()} ${event}\n`);}catch{/* Diagnostics must not cause another failure. */}
}
function problem(event:string, fatal=false){
    if(handling)return;handling=true;record(event);
    try{stop();dialog.showErrorBox('抽奖姬遇到问题',`${fatal?'程序运行异常，将退出以避免状态不一致。':'界面未能正常运行，弹幕收集已暂停。'}\n\n请检查：\n1. 使用完整安装包重新安装，或完整解压 ZIP，不能只复制 EXE。\n2. 在程序目录双击“启动检查.cmd”，检查文件缺失或损坏。\n3. 检查系统是否拦截或隔离了程序文件，不要关闭安全防护。\n4. 重启后仍有问题，可在“关于 / 更新”导出诊断信息并提交 Issue。\n\n诊断编号：${event}\n本轮结果尚未保存时，请避免反复重置。`);}finally{handling=false;if(fatal)app.quit();}
}
export function watchWindow(window:BrowserWindow){
    window.webContents.on('render-process-gone',(_event,details)=>problem(`RENDERER_${details.reason}`));
    window.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame && code!==-3)problem(`UI_LOAD_${code}`);});
}
export function setupDiagnostics(main:()=>BrowserWindow|null, stopCollection:()=>void){
    getMain=main;stop=stopCollection;
    process.on('uncaughtException',()=>problem('MAIN_UNCAUGHT_EXCEPTION',true));
    process.on('unhandledRejection',()=>problem('MAIN_UNHANDLED_REJECTION',true));
    record('APP_START');
    ipcMain.handle('app:diagnostics',async event=>{
        try{
            if(event.sender!==getMain()?.webContents)throw new Error('请从主界面导出诊断信息');
            const parent=getMain();if(!parent)return {ok:false,message:'窗口未就绪'};
            const result=await dialog.showSaveDialog(parent,{title:'导出诊断信息（不含登录资料与弹幕）',defaultPath:'抽奖姬-诊断信息.txt',filters:[{name:'文本文件',extensions:['txt']}]});
            if(result.canceled || !result.filePath)return {ok:true};
            const events=existsSync(logPath())?readFileSync(logPath(),'utf8').slice(-16000):'No recorded events';
            writeFileSync(result.filePath,`抽奖姬诊断信息\n版本：${app.getVersion()}\n系统：${process.platform} ${os.release()} ${process.arch}\nElectron：${process.versions.electron}\n运行包：${app.isPackaged?'正式包':'开发模式'}\n\n${events}\n不包含 Cookie、密码、登录昵称或弹幕名单。\n`,'utf8');
            return {ok:true};
        }catch(error){return {ok:false,message:error instanceof Error?error.message:'导出失败'};}
    });
}
