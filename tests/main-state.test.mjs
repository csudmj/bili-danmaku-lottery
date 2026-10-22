import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {EventEmitter} from 'node:events';

const handlers = new Map();
const windows = [];
class Window extends EventEmitter {
    constructor() {super(); this.webContents = new EventEmitter(); this.webContents.send = () => {}; windows.push(this);}
    setMenuBarVisibility() {} loadFile() {} loadURL() {} showInactive() {} show() {} focus() {}
    minimized = false;
    minimize() {this.minimized = true;} isMinimized() {return this.minimized;} restore() {this.minimized = false;}
    isDestroyed() {return false;} setAlwaysOnTop() {} close() {this.emit('closed');}
}
globalThis.__lotteryTestElectron = {
    app:{whenReady:()=>Promise.resolve(), on:()=>{}, quit:()=>{}}, BrowserWindow:Window,
    ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)}, clipboard:{writeText:()=>{}},
    session:{defaultSession:{fetch:async()=>({json:async()=>({code:0,data:{isLogin:true,mid:123,uname:'离线测试账号'}})}),cookies:{get:async()=>[]}}}
};
let application;
let failNext = false;
let pendingStart;
globalThis.__lotteryTestApi = {
    configureFilter:()=>{}, stopWebSocket:()=>{},
    startWebSocket:async()=>{
        if (failNext) {failNext=false; throw new Error('离线模拟网络失败');}
        if (pendingStart) await pendingStart;
        else application.sendConnectionState('connected');
    }
};
const hook = registerHooks({resolve(specifier,context,next){
    if (specifier === 'electron') return {url:'data:text/javascript,export const {app,BrowserWindow,session,ipcMain,clipboard,dialog,nativeImage}=globalThis.__lotteryTestElectron',shortCircuit:true};
    if (specifier === './api.ts' && context.parentURL?.endsWith('/electron/main.ts')) return {url:'data:text/javascript,export const {startWebSocket,stopWebSocket,configureFilter}=globalThis.__lotteryTestApi',shortCircuit:true};
    return next(specifier,context);
}});
application = await import('../electron/main.ts');
await Promise.resolve();
hook.deregister();
const call = (channel,value,window=windows[0]) => handlers.get(channel)({sender:window.webContents},value);
const state = async () => (await call('lottery:get')).data;
const config = {roomId:'1774682668',keyword:'好运',medalRule:'wear'};
const add = uid => application.sendMsgToRenderer('add_user',{uid,name:`测试观众${uid}`});

test('main and overlay share draw/pause/reset/resume; retry after failed restart works', async () => {
    assert.equal((await call('lottery:start',config)).ok,true);
    assert.equal(windows.length,2);
    add(1);add(2);add(1);
    assert.equal((await state()).total,2);
    assert.equal((await call('lottery:draw',1,windows[1])).ok,true);
    assert.equal((await state()).connection,'stopped');
    add(3);
    assert.equal((await state()).total,2);
    assert.equal((await state()).latestWinners.length,1);
    assert.equal((await call('lottery:restart',undefined,windows[1])).ok,true);
    assert.equal((await state()).connection,'connected');
    assert.equal((await state()).total,0);
    assert.equal((await state()).latestWinners.length,0);
    assert.equal((await state()).keyword,config.keyword);
    assert.equal((await state()).medalRule,config.medalRule);
    add(1);
    assert.equal((await call('lottery:restart',undefined,windows[1])).ok,true);
    assert.equal((await state()).total,0);
    failNext=true;
    assert.equal((await call('lottery:restart',undefined,windows[1])).ok,false);
    assert.equal((await state()).connection,'stopped');
    assert.equal((await call('lottery:restart',undefined,windows[1])).ok,true);
    assert.equal((await state()).connection,'connected');
    assert.equal((await handlers.get('lottery:draw')({sender:{}},1)).ok,false);
    await call('lottery:reset');
    await call('lottery:start',{...config,mode:'queue',queueLimit:2});
    add(5); add(3); add(7);
    assert.deepEqual((await state()).participants.map(p=>p.uid),[5,3]);
    assert.equal((await call('lottery:draw',1)).ok,false);
    assert.equal((await call('participant:remove',5,windows[1])).ok,true);
    add(5);add(7);
    assert.deepEqual((await state()).participants.map(p=>p.uid),[3,7]);
    assert.equal((await call('queue:limit',1)).ok,false);
    assert.equal((await call('queue:limit',3)).ok,true);
    await call('overlay:minimize',undefined,windows[1]);
    assert.equal(windows[1].minimized,true);
    await call('overlay:open');assert.equal(windows[1].minimized,false);
    await call('lottery:restart',undefined,windows[1]);
    assert.equal((await state()).mode,'queue');assert.equal((await state()).queueLimit,3);
    await call('lottery:reset');
    await call('lottery:start',{...config,mode:'lottery'});add(1);add(2);
    assert.equal((await call('participant:weight',{uid:1,weight:8},windows[1])).ok,false);
    assert.equal((await call('participant:weight',{uid:1,weight:8})).ok,true);
    assert.equal((await state()).participants[0].weight,8);
    await call('participant:remove',1);
    assert.equal((await call('lottery:draw',1)).data[0].uid,2);
    await call('lottery:reset');
    let release;
    pendingStart=new Promise(resolve=>{release=resolve;});
    const starting=call('lottery:start',config);
    await Promise.resolve();await Promise.resolve();
    await call('lottery:stop'); release();await starting;
    assert.equal((await state()).connection,'stopped');
    globalThis.__lotteryTestElectron.session.defaultSession.fetch = async () => {throw new Error('network unavailable');};
    assert.equal((await call('login:refresh')).ok, false);
    assert.equal((await state()).loginStatus, 'error');
    globalThis.__lotteryTestElectron.session.defaultSession.fetch = async () => ({json:async()=>({code:-101,data:{isLogin:false}})});
    assert.equal((await call('login:refresh')).ok, true);
    assert.equal((await state()).loginStatus, 'anonymous');
    assert.equal((await state()).user, null);
    assert.equal((await call('lottery:draw',1)).ok, false);
});
