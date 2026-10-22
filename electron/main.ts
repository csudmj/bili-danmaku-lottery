import {app, BrowserWindow, session, ipcMain, clipboard, dialog, nativeImage} from 'electron';
import {readFile, writeFile, mkdir, rm, stat} from 'node:fs/promises';
import type {Cookie, IpcMainInvokeEvent} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {LotteryPool} from './lottery.ts';
import type {LotterySnapshot, ConnectionState, Participant, ActivityMode} from './lottery.ts';
import {startWebSocket, stopWebSocket, configureFilter} from './api.ts';
import {setupUpdates} from './updates.ts';
import {setupDiagnostics, watchWindow} from './diagnostics.ts';
import type {MedalRule} from './eligibility.ts';
import {loadPersonalWeights,savePersonalWeights} from './personal-weights.ts';
import type {PersonalWeight} from './lottery.ts';
import {VideoLottery} from './video-lottery.ts';
import {HistoryStore} from './history.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;
let pageWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let cookies: Cookie[] = [];
let buvid3 = '';
let uid = 0;
let user: LotterySnapshot['user'] = null;
let loginStatus: LotterySnapshot['loginStatus'] = 'checking';
let connection: ConnectionState = 'stopped';
let roomId = '';
let keyword = '';
let medalRule: MedalRule = 'off';
let ready = false;
let autoOpened = false;
let overlayPinned = true;
let startRequest = 0;
let resettingLogin=false;
let loginCheck: Promise<boolean> | null = null;
let loginWindowUid:number|null=null;
let loginWindowSawAnonymous=false;
const pool = new LotteryPool();
let personalWeights:PersonalWeight[]=[];
let personalWeightsLoadError=false;
let personalRevision=0;
const personalWeightsPath=()=>path.join(app.getPath('userData'),'personal-weights.json');
let history:HistoryStore|undefined;
const video=new VideoLottery(async(url,signal)=>{
    const response=await session.defaultSession.fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),headers:{Referer:'https://member.bilibili.com/'}});
    if(!response.ok)throw Error(`B站读取失败（HTTP ${response.status}），请稍后重试`);
    return response.json();
},()=>{if(video.status==='ready')history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());mainWindow?.webContents.send('video-state',video.snapshot());});
function persistPersonal(entries:PersonalWeight[]){
    if(personalWeightsLoadError)throw Error('专属名单读取失败，请先修复或保存名单后再抽奖');
    personalWeights=savePersonalWeights(personalWeightsPath(),entries);personalRevision++;
    pool.setPersonalWeights(personalWeights);video.pool.setPersonalWeights(personalWeights);
    mainWindow?.webContents.send('personal-weights-changed');
}

function snapshot(): LotterySnapshot {
    return {...pool.snapshot(), roomId, keyword, medalRule, connection, user, ready, loginStatus,
        overlayOpen: Boolean(overlayWindow && !overlayWindow.isDestroyed()), overlayPinned};
}
function broadcast() {
    history?.capture('live',roomId,keyword,pool.snapshot());
    const data = snapshot();
    for (const window of [mainWindow, overlayWindow]) {
        if (window && !window.isDestroyed()) window.webContents.send('lottery-state', data);
    }
}
function notice(message: string) {
    for (const window of [mainWindow, overlayWindow]) {
        if (window && !window.isDestroyed()) window.webContents.send('app-notice', message);
    }
}
function loadLocal(window: BrowserWindow, overlay = false) {
    if (VITE_DEV_SERVER_URL) return window.loadURL(`${VITE_DEV_SERVER_URL}${overlay ? '#overlay' : ''}`);
    return window.loadFile(path.join(RENDERER_DIST, 'index.html'), overlay ? {hash: 'overlay'} : {});
}
function createWindow() {
    mainWindow = new BrowserWindow({
        title: `抽奖姬 V${app.getVersion()}`, width: 1320, height: 900,
        minWidth: 800, minHeight: 560, backgroundColor: '#101526',
        icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
        webPreferences: {preload: path.join(__dirname, 'preload.mjs'), backgroundThrottling: false},
    });
    watchWindow(mainWindow);
    mainWindow.on('page-title-updated', event => event.preventDefault());
    mainWindow.setMenuBarVisibility(false);
    mainWindow.on('closed', () => {mainWindow = null; app.quit();});
    mainWindow.webContents.on('did-finish-load', () => {
        broadcast(); void refreshLogin().catch(() => notice('暂时无法检查登录状态，请稍后刷新'));
    });
    void loadLocal(mainWindow);
}
function openOverlay() {
    if (!ready || !user) throw new Error('请先登录并成功开始收集弹幕');
    if (overlayWindow && !overlayWindow.isDestroyed()) {if (overlayWindow.isMinimized()) overlayWindow.restore(); overlayWindow.show(); overlayWindow.focus(); return;}
    overlayPinned = true;
    const window = new BrowserWindow({
        title: '抽奖姬 · 直播小窗', width: 360, height: 660, minWidth: 280, minHeight: 440,
        maxWidth: 560, frame: false, show: false, alwaysOnTop: true, backgroundColor: '#101526',
        icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
        webPreferences: {preload: path.join(__dirname, 'preload.mjs'), backgroundThrottling: false},
    });
    overlayWindow = window; window.setMenuBarVisibility(false);
    window.once('ready-to-show', () => {window.showInactive(); broadcast();});
    window.webContents.on('did-finish-load', broadcast);
    window.on('closed', () => {if (overlayWindow === window) overlayWindow = null; broadcast();});
    void loadLocal(window, true); broadcast();
}

async function refreshLogin(): Promise<boolean> {
    if(resettingLogin)return false;
    if (loginCheck) return loginCheck;
    loginCheck = (async () => {
        const response = await session.defaultSession.fetch('https://api.bilibili.com/x/web-interface/nav', {signal: AbortSignal.timeout(15000)});
        const result = await response.json();
        if (result.code !== 0 || !result.data?.isLogin || !result.data?.mid) {
            if (uid > 0) {stopCollection(); notice('登录已失效，请在网页中重新登录');}
            if(pageWindow)loginWindowSawAnonymous=true;
            cookies = []; uid = 0; history?.finish('video');video.accountChanged(0); buvid3 = ''; user = null; loginStatus = 'anonymous'; broadcast(); return false;
        }
        cookies = await session.defaultSession.cookies.get({url: 'https://api.bilibili.com'});
        if(uid&&uid!==Number(result.data.mid)){history?.finish('video');stopCollection();}
        uid = Number(result.data.mid);
        video.accountChanged(uid);
        buvid3 = cookies.find(cookie => cookie.name === 'buvid3')?.value ?? '';
        user = {name: result.data.uname, avatar: result.data.face}; loginStatus = 'authenticated'; broadcast();
        if (pageWindow && !pageWindow.isDestroyed() && loginWindowUid!==null &&
            (loginWindowUid===0 || loginWindowUid!==uid || loginWindowSawAnonymous)) {
            const window=pageWindow;loginWindowUid=null;window.close();
        }
        return true;
    })();
    try {return await loginCheck;} catch (error) {loginStatus = 'error'; broadcast(); throw error;} finally {loginCheck = null;}
}
async function openRoomPage(room: unknown) {
    if (typeof room !== 'string' || !/^\d*$/.test(room)) throw new Error('请填写正确的直播间号');
    if(resettingLogin)throw Error('正在切换账号，请稍候');
    resettingLogin=true;
    try {
        await loginCheck?.catch(()=>false);
        stopCollection();history?.finish('video');video.accountChanged(0);
        cookies=[];uid=0;buvid3='';user=null;loginStatus='anonymous';broadcast();
        const stored=await session.defaultSession.cookies.get({});
        for(const cookie of stored){
            const domain=(cookie.domain??'').replace(/^\./,'');
            if(domain==='bilibili.com'||domain.endsWith('.bilibili.com'))
                await session.defaultSession.cookies.remove(`${cookie.secure?'https':'http'}://${domain}${cookie.path||'/'}`,cookie.name);
        }
        await session.defaultSession.cookies.flushStore();
    } catch {loginStatus='error';broadcast();throw Error('清除旧账号登录状态失败，请关闭登录页后重试');}
    finally {resettingLogin=false;}
    if (!pageWindow || pageWindow.isDestroyed()) {
        const window = new BrowserWindow({
            title: 'B站网页登录 / 直播间', width: 1200, height: 850,
            icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
            webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true},
        });
        pageWindow = window; window.setMenuBarVisibility(false);
        window.webContents.setWindowOpenHandler(({url}) => {
            try {
                const target = new URL(url);
                if (target.protocol === 'https:' && (target.hostname === 'bilibili.com' || target.hostname.endsWith('.bilibili.com'))) void window.loadURL(url).catch(() => {});
            } catch { /* Ignore malformed external links. */ }
            return {action: 'deny'};
        });
        const timer = setInterval(() => {void refreshLogin().catch(() => {});}, 3000);
        window.on('closed', () => {
            clearInterval(timer); if (pageWindow === window) pageWindow = null; loginWindowUid=null;loginWindowSawAnonymous=false;
            void refreshLogin().catch(() => {});
        });
    }
    pageWindow.show(); pageWindow.focus();
    // Cookies were cleared before opening; close only once the new sign-in succeeds.
    loginWindowUid=0;loginWindowSawAnonymous=false;
    await pageWindow.loadURL('https://passport.bilibili.com/login');
    await refreshLogin();
}
function stopCollection() {
    startRequest++; stopWebSocket(); connection = 'stopped'; broadcast();
}
function trusted(event: IpcMainInvokeEvent, overlay = true) {
    if (event.sender === mainWindow?.webContents || (overlay && event.sender === overlayWindow?.webContents)) return;
    throw new Error('请求来自未知窗口');
}
function handle(channel: string, action: (event: IpcMainInvokeEvent, value: unknown) => unknown, overlay = true) {
    ipcMain.handle(channel, async (event, value) => {
        try {trusted(event, overlay); return {ok: true, data: await action(event, value)};}
        catch (error) {return {ok: false, message: error instanceof Error ? error.message : '操作失败，请重试'};}
    });
}
handle('lottery:get', () => snapshot());
handle('login:open', (_event, room) => openRoomPage(room), false);
handle('login:refresh', () => refreshLogin(), false);
handle('history:get',()=>history?.list()??{rounds:[],error:''},false);
handle('video:get',()=>video.snapshot(),false);
handle('video:prepare',async(_event,value)=>{if(!await refreshLogin())throw Error('请先登录投稿账号');return video.prepare(value,uid);},false);
handle('video:collect',async(_event,value)=>{if(!await refreshLogin())throw Error('请先登录投稿账号');await video.collect(value,uid,()=>personalWeights);},false);
handle('video:reset',()=>{history?.finish('video');video.reset();},false);
handle('video:draw',(_event,value)=>{video.ensureReady(uid);video.pool.setPersonalWeights(personalWeights);const selected=video.pool.draw(value as number,undefined,persistPersonal);history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());history?.flush();mainWindow?.webContents.send('video-state',video.snapshot());return selected;},false);
handle('video:remove',(_event,value)=>{video.ensureReady(uid);video.pool.remove(value as number);history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());mainWindow?.webContents.send('video-state',video.snapshot());},false);
handle('video:weight',(_event,value)=>{video.ensureReady(uid);const v=value as {uid:number;weight:number};video.pool.setWeight(v?.uid,v?.weight);history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());mainWindow?.webContents.send('video-state',video.snapshot());},false);
handle('video:weights:rules',(_event,value)=>{const v=value as {rules:import('./lottery.ts').WeightRules};video.pool.setPersonalWeights(personalWeights);video.pool.setWeightRules(v?.rules,true);history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());mainWindow?.webContents.send('video-state',video.snapshot());},false);
handle('video:weights:reset',()=>{video.pool.resetWeights();history?.capture('video',video.info?.bvid??'',video.keyword,video.pool.snapshot());mainWindow?.webContents.send('video-state',video.snapshot());},false);
handle('video:copy',()=>clipboard.writeText(video.pool.snapshot().winners.map(p=>`${p.name}(${p.uid})`).join('\n')),false);
const backgroundPath = () => path.join(app.getPath('userData'), 'custom-background.png');
async function getBackground() {
    try {return `data:image/png;base64,${(await readFile(backgroundPath())).toString('base64')}`;}
    catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error;}
}
async function publishBackground() {
    const data = await getBackground();
    for (const window of [mainWindow, overlayWindow]) if (window && !window.isDestroyed()) window.webContents.send('background-changed', data);
    return data;
}
handle('background:get', () => getBackground());
handle('background:select', async event => {
    const parent = event.sender === overlayWindow?.webContents ? overlayWindow! : mainWindow!;
    const selection = await dialog.showOpenDialog(parent, {title:'选择背景照片', properties:['openFile'], filters:[{name:'照片',extensions:['jpg','jpeg','png','webp']} ]});
    if (selection.canceled || !selection.filePaths[0]) return;
    const selected = selection.filePaths[0];
    if ((await stat(selected)).size > 30 * 1024 * 1024) throw new Error('请选择小于 30 MB 的照片');
    let picture = nativeImage.createFromPath(selected);
    if (picture.isEmpty()) throw new Error('无法读取这张照片，请选择 JPG、PNG 或 WebP 图片');
    const {width,height} = picture.getSize();
    if (Math.max(width,height) > 2560) picture = picture.resize(width >= height ? {width:2560} : {height:2560});
    await mkdir(app.getPath('userData'),{recursive:true});
    await writeFile(backgroundPath(),picture.toPNG());
    await publishBackground();
});
handle('background:reset', async () => {await rm(backgroundPath(),{force:true}); await publishBackground();});
async function startRound(value: unknown, newRound = false) {
    const config = value as {roomId?: string; keyword?: string; medalRule?: MedalRule; mode?: ActivityMode; queueLimit?: number};
    if (!config || typeof config.roomId !== 'string' || !/^\d+$/.test(config.roomId) || typeof config.keyword !== 'string' || !config.keyword.trim() || !['off', 'wear'].includes(config.medalRule ?? '')) throw new Error('请填写直播间、互动词和参与条件');
    if (connection === 'connecting' || (!newRound && connection !== 'stopped')) throw new Error('正在收集或连接中');
    const mode = config.mode ?? pool.snapshot().mode;
    const queueLimit = config.queueLimit ?? pool.snapshot().queueLimit;
    if (!newRound && pool.snapshot().total > 0 && (roomId !== config.roomId || keyword !== config.keyword || medalRule !== config.medalRule)) throw new Error('请先重置本轮，再修改参与条件');
    if (!['lottery','queue'].includes(mode) || !Number.isInteger(queueLimit) || queueLimit < 1 || queueLimit > 10000) throw new Error('请选择有效模式和 1–10000 的排队上限');
    if (!newRound) pool.configure(mode, queueLimit);
    else stopCollection();
    const request = ++startRequest; connection = 'connecting'; broadcast();
    try {
        if (!await refreshLogin()) throw new Error('请先在网页中登录 B 站账号');
        if (request !== startRequest) return;
        if (newRound) {
            history?.finish('live'); pool.reset(); pool.configure(mode, queueLimit); ready = false; autoOpened = false;
            mainWindow?.webContents.send('messages-reset');
        }
        roomId = config.roomId; keyword = config.keyword; medalRule = config.medalRule!;
        configureFilter(keyword, medalRule); broadcast(); await startWebSocket(roomId);
    } catch (error) {
        if (request !== startRequest) return;
        stopCollection(); throw error;
    }
}
handle('lottery:start', (_event, value) => startRound(value, true), false);
handle('lottery:restart', async () => {
    if (!user || !keyword) throw new Error('请先在主界面设置并开始本轮抽奖');
    const {mode, queueLimit} = pool.snapshot();
    await startRound({roomId, keyword, medalRule, mode, queueLimit}, true);
});
handle('lottery:resume', async () => {
    if (!ready || !keyword) throw new Error('请先开始一轮收集');
    const {mode, queueLimit} = pool.snapshot();
    await startRound({roomId, keyword, medalRule, mode, queueLimit});
});
handle('lottery:stop', () => {stopCollection(); history?.flush();});
handle('lottery:draw', (_event, value) => {
    const count = value as number;
    if (pool.snapshot().mode !== 'lottery') throw new Error('排队模式不能抽奖');
    if (!user || !ready) throw new Error('请先登录并设置本轮抽奖');
    if (!Number.isInteger(count) || count < 1 || count > pool.snapshot().participants.length) throw new Error('当前参与人数不足');
    stopCollection();pool.setPersonalWeights(personalWeights); const selected = pool.draw(count, undefined, persistPersonal); broadcast();history?.flush(); return selected;
});
handle('lottery:reset', () => {
    stopCollection(); history?.finish('live');pool.reset(); ready = false; autoOpened = false; broadcast();
    mainWindow?.webContents.send('messages-reset');
}, false);
handle('lottery:copy', () => {
    clipboard.writeText(pool.snapshot().winners.map(person => `${person.name}(${person.uid})`).join('\n'));
}, false);
handle('overlay:open', () => openOverlay(), false);
handle('participant:remove', (_event, value) => {
    if (!Number.isSafeInteger(value)) throw new Error('无效的参与者');
    pool.remove(value as number); broadcast();
});
handle('participant:weight', (_event, value) => {
    const input = value as {uid?: number; weight?: number};
    if (!input || !Number.isSafeInteger(input.uid)) throw new Error('无效的参与者');
    pool.setWeight(input.uid!, input.weight!); broadcast();
}, false);
handle('queue:limit', (_event, value) => {
    if (pool.snapshot().mode !== 'queue') throw new Error('请先启动排队模式');
    pool.configure('queue', value as number); broadcast();
}, false);
handle('weights:rules', (_event,value)=>{
    const input=value as {rules:import('./lottery.ts').WeightRules;applyExisting:boolean};
    if(!input || typeof input.applyExisting!=='boolean')throw new Error('无效的权重设置');
    pool.setWeightRules(input.rules,input.applyExisting);broadcast();
},false);
handle('weights:compensation',(_event,value)=>{pool.setCompensation(value as {enabled:boolean;increment:number});broadcast();},false);
handle('queue:gift-sort',(_event,value)=>{pool.setGiftSort(value as boolean);broadcast();},false);
handle('weights:reset',()=>{pool.resetWeights();broadcast();},false);
handle('weights:personal:get',()=>({entries:personalWeights,loadError:personalWeightsLoadError,revision:personalRevision}),false);
handle('weights:personal:save',(_event,value)=>{
    const input=value as {entries:PersonalWeight[];revision:number};
    if(!input || input.revision!==personalRevision)throw new Error('专属名单已更新，请关闭权重窗口重新打开后再修改');
    personalWeights=savePersonalWeights(personalWeightsPath(),input.entries);personalRevision++;
    mainWindow?.webContents.send('personal-weights-changed');
    pool.setPersonalWeights(personalWeights);video.pool.setPersonalWeights(personalWeights);personalWeightsLoadError=false;return personalWeights;
},false);
handle('queue:move',(_event,value)=>{
    const input=value as {uid:number;targetUid:number;placement:'before'|'after'};
    if(!input||!Number.isSafeInteger(input.uid)||!Number.isSafeInteger(input.targetUid))throw new Error('无效的队列成员');
    pool.move(input.uid,input.targetUid,input.placement);broadcast();
},false);
handle('overlay:minimize', event => {if (event.sender === overlayWindow?.webContents) overlayWindow.minimize();});
handle('overlay:pin', event => {
    if (event.sender !== overlayWindow?.webContents) throw new Error('仅小窗可切换置顶');
    overlayPinned = !overlayPinned; overlayWindow?.setAlwaysOnTop(overlayPinned); broadcast();
});
handle('overlay:close', event => {if (event.sender === overlayWindow?.webContents) overlayWindow?.close();});

export const getCookies = () => cookies;
export const getBuvid3 = () => buvid3;
export const getUid = () => uid;
export function sendMsgToRenderer(channel: string, msg: Participant & {content?: string}) {
    if (channel === 'add_user') {
        if (connection === 'connected' && user && pool.add(msg)) broadcast();
    } else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, msg);
}
export function receiveGift(uid:number,amount:number,eventId:string){if(connection==='connected'&&user&&pool.addGift(uid,amount,eventId))broadcast();}
export function sendConnectionState(state: ConnectionState, message?: string) {
    connection = state;
    if (state === 'connected') {
        ready = true;
        history?.capture('live',roomId,keyword,pool.snapshot(),true);
        if (!autoOpened && user) {autoOpened = true; openOverlay();}
    }
    broadcast(); if (message) notice(message);
}
app.whenReady().then(() => {
    history=new HistoryStore(path.join(app.getPath('userData'),'history.json'));
    setupDiagnostics(() => mainWindow, stopCollection);
    try{personalWeights=loadPersonalWeights(personalWeightsPath());pool.setPersonalWeights(personalWeights);}catch{personalWeightsLoadError=true;}
    createWindow();
    void setupUpdates(() => mainWindow, () => connection !== 'stopped'||video.status==='loading').catch(() => notice('更新组件初始化失败，请使用启动检查或重新安装'));
    const timer = setInterval(() => {void refreshLogin().catch(() => {});}, 60000);
    timer.unref();
    app.on('before-quit', () => {clearInterval(timer);history?.finish('live');history?.finish('video');});
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {startRequest++; stopWebSocket();});

