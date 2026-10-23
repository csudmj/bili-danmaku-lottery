import {test,after} from 'node:test';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';
const testBase=path.resolve('.build-cache');mkdirSync(testBase,{recursive:true});
const testFolder=mkdtempSync(path.join(testBase,'luckdraw-main-v2-'));
after(()=>{if(path.dirname(testFolder)===testBase&&path.basename(testFolder).startsWith('luckdraw-main-v2-'))rmSync(testFolder,{recursive:true,force:true});});
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {EventEmitter} from 'node:events';

const handlers = new Map();
const windows = [];
class Window extends EventEmitter {
    constructor() {super(); this.webContents = new EventEmitter(); this.webContents.send = () => {}; this.webContents.setWindowOpenHandler=()=>{}; windows.push(this);}
    setMenuBarVisibility() {} loadFile() {} loadURL() {} showInactive() {} show() {} focus() {}
    minimized = false;
    minimize() {this.minimized = true;} isMinimized() {return this.minimized;} restore() {this.minimized = false;}
    destroyed=false;isDestroyed() {return this.destroyed;} setAlwaysOnTop() {} close() {this.destroyed=true;this.emit('closed');}
}
globalThis.__lotteryTestElectron = {
    app:{getPath:()=>testFolder,getVersion:()=> '1.6.0', whenReady:()=>Promise.resolve(), on:()=>{}, quit:()=>{}}, BrowserWindow:Window,
    ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)}, clipboard:{writeText:()=>{}},
    session:{defaultSession:{fetch:async()=>({json:async()=>({code:0,data:{isLogin:true,mid:123,uname:'离线测试账号'}})}),cookies:{get:async()=>[],remove:async()=>{},flushStore:async()=>{}}}}
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
    if (specifier === './updates.ts' && context.parentURL?.endsWith('/electron/main.ts')) return {url:'data:text/javascript,export async function setupUpdates(){}',shortCircuit:true};
    if (specifier === './diagnostics.ts' && context.parentURL?.endsWith('/electron/main.ts')) return {url:'data:text/javascript,export function setupDiagnostics(){};export function watchWindow(){}',shortCircuit:true};
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

test('new start archives undrawn and empty rounds; pause/resume retains winners, weights and queue order', async () => {
 await call('lottery:start',{...config,mode:'lottery'});add(801);add(802);
 await call('participant:weight',{uid:801,weight:4});
 const before=(await call('history:get')).data.rounds[0];
 await call('lottery:stop',undefined,windows[1]);add(803);
 assert.equal((await state()).total,2);
 assert.equal((await call('lottery:resume',undefined,windows[1])).ok,true);
 assert.equal((await state()).participants.find(p=>p.uid===801).weight,4);
 await call('lottery:draw',1);const winner=(await state()).winners[0].uid;
 await call('lottery:resume');add(winner);add(803);
 assert.equal((await state()).winners[0].uid,winner);assert.equal((await state()).total,3);
 assert.equal((await call('history:get')).data.rounds[0].id,before.id);
 assert.equal((await call('lottery:start',{...config,queueLimit:0})).ok,false);
 assert.equal((await state()).total,3);
 await call('lottery:start',{...config,mode:'queue',queueLimit:4});add(811);add(812);
 await call('queue:move',{uid:812,targetUid:811,placement:'before'});
 await call('lottery:stop');await call('lottery:resume');
 assert.deepEqual((await state()).participants.map(p=>p.uid),[812,811]);
 await call('lottery:start',{...config,mode:'lottery'});add(820);
 const undrawn=(await call('history:get')).data.rounds[0].id;
 await call('lottery:start',{...config,mode:'lottery'});
 let records=(await call('history:get')).data.rounds;
 const archived=records.find(r=>r.id===undrawn);
 assert.ok(archived.endedAt);assert.equal(archived.draws.length,0);assert.equal(archived.people[0].uid,820);
 const empty=records[0].id;
 await call('lottery:start',config);
 records=(await call('history:get')).data.rounds;
 assert.ok(records.find(r=>r.id===empty).endedAt);assert.equal(records.find(r=>r.id===empty).people.length,0);
 await call('lottery:reset');
});

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
    assert.equal((await call('queue:move',{uid:3,targetUid:5,placement:'before'},windows[1])).ok,false);
    assert.equal((await call('queue:move',{uid:3,targetUid:5,placement:'before'})).ok,true);
    assert.deepEqual((await state()).participants.map(p=>p.uid),[3,5]);
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
    assert.equal((await call('weights:reset',undefined,windows[1])).ok,false);
    assert.equal((await call('weights:personal:get',undefined,windows[1])).ok,false);
    assert.equal((await call('weights:reset')).ok,true);
    assert.deepEqual((await state()).participants.map(p=>p.weight),[1,1]);
    await call('participant:remove',1);
    assert.equal((await call('lottery:draw',1)).data[0].uid,2);
    await call('lottery:reset');
    await call('lottery:start',{...config,mode:'lottery'});add(10);add(11);add(12);
    const personal=await call('weights:personal:get');
    const saveResult=await call('weights:personal:save',{entries:[{uid:null,name:'测试观众10',weight:3}],revision:personal.data.revision});assert.equal(saveResult.ok,true,saveResult.message);
    assert.equal((await call('weights:personal:save',{entries:[],revision:personal.data.revision})).ok,false,'stale edits must not overwrite new rules');
    assert.equal((await call('weights:compensation',{enabled:true,increment:0.1},windows[1])).ok,false);
    assert.equal((await call('weights:compensation',{enabled:true,increment:0.1})).ok,true);
    assert.equal((await call('lottery:draw',2)).ok,true);
    const remaining=(await state()).participants[0];assert.equal(remaining.weight,1.1);
    const saved=JSON.parse(readFileSync(path.join(testFolder,'personal-weights.json'),'utf8'));
    assert.equal(saved.find(p=>p.uid===remaining.uid).weight,1.1);
    assert.equal((await state()).connection,'stopped');
    await call('lottery:reset');await call('lottery:start',{...config,mode:'queue'});add(10);add(11);
    await call('queue:gift-sort',true);application.receiveGift(11,2000,'live-event-1');application.receiveGift(11,2000,'live-event-1');
    assert.equal((await state()).participants[0].uid,11);assert.equal((await state()).participants[0].giftAmount,2000);
    await call('lottery:stop');application.receiveGift(11,2000,'live-event-2');assert.equal((await state()).participants[0].giftAmount,2000);
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

test('video IPC keeps a separate pool, clears winner rules and preserves history after reset',async()=>{
 globalThis.__lotteryTestElectron.session.defaultSession.fetch=async url=>({ok:true,json:async()=>String(url).includes('/nav')?{code:0,data:{isLogin:true,mid:123,uname:'测试账号'}}:String(url).includes('/view?')?{code:0,data:{title:'自己的投稿',owner:{mid:123},pages:[{cid:2,page:1,part:'P1'}]}}:{code:0,data:{page:{num:1,total:2},result:[{id_str:'1',mid:701,uname:'视频观众',msg:'好运',oid:2,ctime:1700000000},{id_str:'2',mid:702,uname:'另一观众',msg:'其他',oid:2,ctime:1700000000}]}}});
 assert.equal((await call('video:prepare','BV1Na4Q64Eos')).ok,true);
 const rules=await call('weights:personal:get');
 assert.equal((await call('weights:personal:save',{revision:rules.data.revision,entries:[{uid:701,name:'视频观众',weight:3}]})).ok,true);
 assert.equal((await call('video:collect',{keyword:'好运',cids:[2]})).ok,true);
 assert.equal((await call('video:get')).data.participants[0].weight,3);
 assert.equal((await state()).total,0);
 assert.equal((await call('video:draw',1,windows[1])).ok,false);
 assert.equal((await call('video:draw',1)).data[0].uid,701);
 assert.equal((await call('weights:personal:get')).data.entries.length,0);
 await call('video:reset');
 const rounds=(await call('history:get')).data.rounds;
 assert.equal(rounds[0].source,'video');assert.equal(rounds[0].draws[0].winners[0].uid,701);
 assert.equal((await call('video:get')).data.total,0);
});

test('switching clears only Bilibili cookies and closes after fresh sign-in',async()=>{
 let account=0;const removed=[];
 globalThis.__lotteryTestElectron.session.defaultSession.cookies={get:async()=>[{domain:'.bilibili.com',path:'/',secure:true,name:'SESSDATA'},{domain:'passport.bilibili.com',path:'/',secure:true,name:'login'},{domain:'.example.com',path:'/',secure:true,name:'other'}],remove:async(url,name)=>{removed.push([url,name]);account=0;},flushStore:async()=>{}};
 globalThis.__lotteryTestElectron.session.defaultSession.fetch=async()=>({json:async()=>account?{code:0,data:{isLogin:true,mid:account,uname:'登录测试'}}:{code:-101,data:{isLogin:false}}});
 await call('login:refresh');assert.equal((await call('login:open','')).ok,true);const login=windows.at(-1);assert.equal(login.destroyed,false);
 account=123;await call('login:refresh');assert.equal(login.destroyed,true);assert.equal((await state()).loginStatus,'authenticated');
 assert.equal((await call('login:open','')).ok,true);const switching=windows.at(-1);assert.equal(switching.destroyed,false);assert.equal(account,0);assert.equal((await state()).user,null);assert.ok(removed.length>=4);assert.ok(removed.every(([url])=>new URL(url).hostname.endsWith('bilibili.com')));
 account=456;await call('login:refresh');assert.equal(switching.destroyed,true);assert.equal((await state()).user.name,'登录测试');
});
