import {app, BrowserWindow, ipcMain, shell, dialog} from 'electron';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {PROJECT, PROJECT_LINKS} from '../shared/project.ts';
import {UpdateController} from './update-controller.ts';

export async function setupUpdates(main: () => BrowserWindow | null, isCollecting: () => boolean) {
    // Load the CommonJS updater as an external runtime dependency, after Electron is ready.
    const {default: updaterModule} = await import('electron-updater');
    const {autoUpdater} = updaterModule;
    autoUpdater.autoDownload=false;
    autoUpdater.autoInstallOnAppQuit=false;
    autoUpdater.allowPrerelease=false;
    autoUpdater.allowDowngrade=false;
    const supported=app.isPackaged && process.platform==='win32' && existsSync(path.join(path.dirname(app.getPath('exe')),`Uninstall ${PROJECT.name}.exe`));
    const controller=new UpdateController(autoUpdater, state => {
        const window=main();if(window && !window.isDestroyed()) window.webContents.send('update-state',state);
    },supported);
    const handle=(name:string, action:(value:unknown)=>unknown) => ipcMain.handle(name,async(event,value)=>{
        try {
            if(event.sender!==main()?.webContents) throw new Error('此操作仅可在主界面进行');
            return {ok:true,data:await action(value)};
        } catch(error) {return {ok:false,message:error instanceof Error?error.message:'操作失败'};}
    });
    handle('app:info',()=>({...PROJECT,version:app.getVersion(),update:controller.get()}));
    handle('app:link',value=>{
        if(typeof value!=='string' || !Object.prototype.hasOwnProperty.call(PROJECT_LINKS,value)) throw new Error('无效链接');
        return shell.openExternal(PROJECT_LINKS[value as keyof typeof PROJECT_LINKS]);
    });
    handle('update:check',()=>controller.check());
    handle('update:download',()=>controller.download());
    handle('update:install',async()=>{
        if(isCollecting()) throw new Error('请先停止弹幕收集，再安装更新');
        if(controller.get().status!=='downloaded') throw new Error('更新尚未下载完成');
        const window=main();if(!window)return;
        const response=await dialog.showMessageBox(window,{type:'question',title:'安装更新',message:'现在安装更新并重启抽奖姬？',detail:'本轮名单、中奖记录和权重不会保留，请先复制需要的结果。登录及自选背景保留。',buttons:['取消','安装并重启'],defaultId:0,cancelId:0});
        if(response.response===1){if(isCollecting())throw new Error('请先停止弹幕收集');controller.install();}
    });
    if(supported){
        const initial=setTimeout(()=>{void controller.check();},8000);
        const interval=setInterval(()=>{void controller.check();},4*60*60*1000);
        initial.unref();interval.unref();
        app.on('before-quit',()=>{clearTimeout(initial);clearInterval(interval);});
    }
}
