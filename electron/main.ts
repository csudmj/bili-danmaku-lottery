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
let roomId = '1774682668';
let keyword = '';
let medalRule: MedalRule = 'off';
let ready = false;
let autoOpened = false;
let overlayPinned = true;
let startRequest = 0;
let loginCheck: Promise<boolean> | null = null;
let pendingRoom = '';
const pool = new LotteryPool();

function snapshot(): LotterySnapshot {
    return {...pool.snapshot(), roomId, keyword, medalRule, connection, user, ready, loginStatus,
        overlayOpen: Boolean(overlayWindow && !overlayWindow.isDestroyed()), overlayPinned};
}
function broadcast() {
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
        title: '抽奖姬', width: 1320, height: 900,
        minWidth: 1040, minHeight: 760, backgroundColor: '#101526',
        icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
        webPreferences: {preload: path.join(__dirname, 'preload.mjs'), backgroundThrottling: false},
    });
    watchWindow(mainWindow);
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
    if (loginCheck) return loginCheck;
    loginCheck = (async () => {
        const response = await session.defaultSession.fetch('https://api.bilibili.com/x/web-interface/nav', {signal: AbortSignal.timeout(15000)});
        const result = await response.json();
        if (result.code !== 0 || !result.data?.isLogin || !result.data?.mid) {
            if (uid > 0) {stopCollection(); notice('登录已失效，请在网页中重新登录');}
            cookies = []; uid = 0; buvid3 = ''; user = null; loginStatus = 'anonymous'; broadcast(); return false;
        }
        cookies = await session.defaultSession.cookies.get({url: 'https://api.bilibili.com'});
        uid = Number(result.data.mid);
        buvid3 = cookies.find(cookie => cookie.name === 'buvid3')?.value ?? '';
        user = {name: result.data.uname, avatar: result.data.face}; loginStatus = 'authenticated'; broadcast();
        if (pendingRoom && pageWindow && !pageWindow.isDestroyed()) {
            const target = pendingRoom; pendingRoom = '';
            await pageWindow.loadURL(`https://live.bilibili.com/${target}`);
        }
        return true;
    })();
    try {return await loginCheck;} catch (error) {loginStatus = 'error'; broadcast(); throw error;} finally {loginCheck = null;}
}
async function openRoomPage(room: unknown) {
    if (typeof room !== 'string' || !/^\d+$/.test(room)) throw new Error('请先填写正确的直播间号');
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
            clearInterval(timer); if (pageWindow === window) pageWindow = null; pendingRoom = '';
            void refreshLogin().catch(() => {});
        });
    }
    pageWindow.show(); pageWindow.focus(); pendingRoom = '';
    await pageWindow.loadURL(`https://live.bilibili.com/${room}`);
    if (!await refreshLogin()) {
        pendingRoom = room;
        if (pageWindow && !pageWindow.isDestroyed()) await pageWindow.loadURL('https://passport.bilibili.com/login');
    }
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
async function startRound(value: unknown) {
    const config = value as {roomId?: string; keyword?: string; medalRule?: MedalRule; mode?: ActivityMode; queueLimit?: number};
    if (!config || typeof config.roomId !== 'string' || !/^\d+$/.test(config.roomId) || typeof config.keyword !== 'string' || !config.keyword.trim() || !['off', 'wear'].includes(config.medalRule ?? '')) throw new Error('请填写直播间、互动词和参与条件');
    if (connection !== 'stopped') throw new Error('正在收集或连接中');
    const mode = config.mode ?? pool.snapshot().mode;
    const queueLimit = config.queueLimit ?? pool.snapshot().queueLimit;
    if (pool.snapshot().total > 0 && (roomId !== config.roomId || keyword !== config.keyword || medalRule !== config.medalRule)) throw new Error('请先重置本轮，再修改参与条件');
    pool.configure(mode, queueLimit);
    const request = ++startRequest; connection = 'connecting'; broadcast();
    try {
        if (!await refreshLogin()) throw new Error('请先在网页中登录 B 站账号');
        if (request !== startRequest) return;
        roomId = config.roomId; keyword = config.keyword; medalRule = config.medalRule!;
        configureFilter(keyword, medalRule); broadcast(); await startWebSocket(roomId);
    } catch (error) {
        if (request !== startRequest) return;
        stopCollection(); throw error;
    }
}
handle('lottery:start', (_event, value) => startRound(value), false);
handle('lottery:restart', async () => {
    if (!user || !keyword) throw new Error('请先在主界面设置并开始本轮抽奖');
    const {mode, queueLimit} = pool.snapshot();
    const config = {roomId, keyword, medalRule, mode, queueLimit};
    stopCollection(); pool.reset(); ready = false; autoOpened = false;
    broadcast(); mainWindow?.webContents.send('messages-reset');
    await startRound(config);
});
handle('lottery:stop', () => stopCollection(), false);
handle('lottery:draw', (_event, value) => {
    const count = value as number;
    if (pool.snapshot().mode !== 'lottery') throw new Error('排队模式不能抽奖');
    if (!user || !ready) throw new Error('请先登录并设置本轮抽奖');
    if (!Number.isInteger(count) || count < 1 || count > pool.snapshot().participants.length) throw new Error('当前参与人数不足');
    stopCollection(); const selected = pool.draw(count); broadcast(); return selected;
});
handle('lottery:reset', () => {
    stopCollection(); pool.reset(); ready = false; autoOpened = false; broadcast();
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
export function sendConnectionState(state: ConnectionState, message?: string) {
    connection = state;
    if (state === 'connected') {
        ready = true;
        if (!autoOpened && user) {autoOpened = true; openOverlay();}
    }
    broadcast(); if (message) notice(message);
}
app.whenReady().then(() => {
    setupDiagnostics(() => mainWindow, stopCollection);
    createWindow();
    void setupUpdates(() => mainWindow, () => connection !== 'stopped').catch(() => notice('更新组件初始化失败，请使用启动检查或重新安装'));
    const timer = setInterval(() => {void refreshLogin().catch(() => {});}, 60000);
    timer.unref();
    app.on('before-quit', () => clearInterval(timer));
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {startRequest++; stopWebSocket();});
