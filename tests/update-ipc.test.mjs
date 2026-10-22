import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {EventEmitter} from 'node:events';

test('update IPC validates senders, restricts links and blocks installation during collection', async()=>{
    const handlers=new Map(),opened=[],main={webContents:{send(){}},isDestroyed:()=>false};
    let collecting=false,confirmations=0,installed=0;
    const updater=new EventEmitter();
    updater.checkForUpdates=async()=>updater.emit('update-available',{version:'1.6.0'});
    updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'1.6.0'});
    updater.quitAndInstall=()=>installed++;
    globalThis.__updateIpc={
        updater,
        app:{isPackaged:true,getPath:()=>'/installed/app.exe',getVersion:()=> '1.5.0',on(){}},
        BrowserWindow:class{},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
        shell:{openExternal:async url=>opened.push(url)},
        dialog:{showMessageBox:async()=>{confirmations++;return {response:1};}},
    };
    const hooks=registerHooks({resolve(name,ctx,next){
        if(name==='electron')return {url:'data:text/javascript,export const {app,BrowserWindow,ipcMain,shell,dialog}=globalThis.__updateIpc',shortCircuit:true};
        if(name==='electron-updater')return {url:'data:text/javascript,export default {autoUpdater:globalThis.__updateIpc.updater}',shortCircuit:true};
        if(name==='node:fs' && ctx.parentURL?.endsWith('/electron/updates.ts'))return {url:'data:text/javascript,export const existsSync=()=>true',shortCircuit:true};
        return next(name,ctx);
    }});
    try{
        const {setupUpdates}=await import('../electron/updates.ts');
        await setupUpdates(()=>main,()=>collecting);
        const call=(name,value,sender=main.webContents)=>handlers.get(name)({sender},value);
        assert.equal((await call('app:info',undefined,{})).ok,false);
        assert.equal((await call('app:link','https://other.invalid')).ok,false);
        await call('app:link','issues');
        assert.deepEqual(opened,['https://github.com/csudmj/bili-danmaku-lottery/issues']);
        assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
        if(process.platform==='win32'){
            await call('update:check');await call('update:download');
            collecting=true;
            assert.equal((await call('update:install')).ok,false);
            assert.equal(confirmations,0);assert.equal(installed,0);
            collecting=false;
            assert.equal((await call('update:install')).ok,true);
            assert.equal(confirmations,1);assert.equal(installed,1);
        }
    }finally{hooks.deregister();}
});
