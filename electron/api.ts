import {parseGift} from './gifts.ts';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import {Buffer} from 'buffer';
import DanmuExtractor from './DanmuExtractor';
import {getBuvid3, getCookies, getUid, sendMsgToRenderer, sendConnectionState, receiveGift} from "./main.ts";
import fetchCookie from 'fetch-cookie';
import Cookie = Electron.Cookie;
import {parseMedal, parseGuard, isEligible, type FanMedal, type MedalRule, type GuardLevel} from './eligibility.ts';
import {signRequest} from "./signTool.ts";

export const fetchWithCookies = fetchCookie(fetch);

// 初始化弹幕提取器
const danmuExtractor = new DanmuExtractor();

interface RoomInitResponse {
    data: {
        room_id: number;
        uid: number;
    };
}

interface DanmuInfoResponse {
    data: {
        host_list: { host: string; wss_port: number }[];
        token: string;
    };
}

// 获取真实房间号
export async function getRoomId(shortId: string): Promise<number> {
    const response = await fetch(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${shortId}`, {signal: AbortSignal.timeout(15000)});
    const data = await response.json() as RoomInitResponse;
    if (!data.data?.room_id || !data.data?.uid) throw new Error('无法解析直播间');
    currentAnchorUid = Number(data.data.uid) || 0;
    return data.data.room_id;
}

// 获取消息流服务器和密钥
export async function getDanmuInfo(roomId: number): Promise<DanmuInfoResponse['data']> {
    const params = {
        id: roomId,
        web_location: 444.8,
        type: 0,
    }
    const args = await signRequest(params);
    // console.log("签名请求参数", args.split("&").join("\n  "), "\n ")
    // 这里请求的时候需要带上全部的 cookie，否则拿到的 key 无法登录使用（！小坑）
    const response = await fetchWithCookies(`https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${args}`, {
        signal: AbortSignal.timeout(15000),
        headers: {
            'Cookie': getCookies().map((cookie: Cookie) => `${cookie.name}=${cookie.value}`).join('; ')
        }
    });
    const data = await response.json() as DanmuInfoResponse;
    // console.log("获取消息流服务器和密钥", data.data);
    if (!data.data?.token || !data.data?.host_list?.length) throw new Error('无法获取弹幕服务器');
    return data.data;
}

// 生成鉴权包
function generateCertificate(roomId: number, token: string, _uid: number, buvid: string): Buffer {
    // console.log("生成鉴权包", roomId, token, uid, buvid);
    const headerLength = 16;
    const protocol = 1;
    const type = 7;
    const sequence = 2;
    const body = JSON.stringify({
        uid: _uid,
        roomid: roomId,
        protover: 2, // 这里协议版本一定要是 2，否则无法解析数据！哭，3 还不行
        buvid: buvid,
        platform: 'web',
        type: 2,
        key: token,
    });

    // console.log("生成鉴权包", body);

    const bodyBuffer = Buffer.from(body);
    const headerBuffer = Buffer.alloc(headerLength);
    headerBuffer.writeUInt32BE(headerLength + bodyBuffer.length, 0);
    headerBuffer.writeUInt16BE(headerLength, 4);
    headerBuffer.writeUInt16BE(protocol, 6);
    headerBuffer.writeUInt32BE(type, 8);
    headerBuffer.writeUInt32BE(sequence, 12);

    return Buffer.concat([headerBuffer, bodyBuffer]);
}

// 生成心跳包
function generateHeartbeat(): Buffer {
    const headerLength = 16;
    const protocol = 1;
    const type = 2;
    const sequence = 2;
    // 好小众的内容格式（
    const body = '[Object object]';

    const bodyBuffer = Buffer.from(body);
    const headerBuffer = Buffer.alloc(headerLength);
    headerBuffer.writeUInt32BE(headerLength + bodyBuffer.length, 0);
    headerBuffer.writeUInt16BE(headerLength, 4);
    headerBuffer.writeUInt16BE(protocol, 6);
    headerBuffer.writeUInt32BE(type, 8);
    headerBuffer.writeUInt32BE(sequence, 12);

    return Buffer.concat([headerBuffer, bodyBuffer]);
}

// 发送认证包
function sendCertificate(ws: WebSocket, roomId: number, token: string, uid: number, buvid: string) {
    const certificate = generateCertificate(roomId, token, uid, buvid);
    // 打印一下 HEX，友好排版

    ws.send(certificate);
}

// 处理 WebSocket 消息
function handleWebSocketMessages(_ws: WebSocket, data: WebSocket.Data) {
    if (data instanceof Buffer) {
        // 核心处理咯
        danmuExtractor.getDmMsg(data);
    }
}

danmuExtractor.on('MsgData', (content) => {
    if (!activeSocket || !authenticated) return;
    const gift=parseGift(content);
    if(gift)receiveGift(gift.uid,gift.amount,gift.eventId);
    if (typeof content.cmd === 'string' && content.cmd.split(':')[0] === 'DANMU_MSG') { // 这里只要弹幕吧，因为目前的需求只是抽奖
        // console.log(content.info);
        if (!Array.isArray(content.info) || !Array.isArray(content.info[2]) || typeof content.info[1] !== 'string') return;
        const userUID = Number(content.info[2][0]);
        const userName = content.info[2][1];
        const message = content.info[1];
        const medal = parseMedal(content.info);
        const guardLevel = parseGuard(content.info,currentAnchorUid);
        console.log(`${userName}(uid: ${userUID}) 的弹幕: ${message}`);
        sendMsgToRenderer('danmu_msg', {
            name: userName,
            uid: userUID,
            content: message,
            medal,
            guardLevel,
        })
        // Anonymous/invalid UIDs must never become lottery participants.
        if (Number.isSafeInteger(userUID) && userUID > 0) {
            checkForKeywords(message, userName, userUID, medal, guardLevel);
        }
    }
});

let keyword = '';
let medalRule: MedalRule = 'off';
let currentAnchorUid = 0;
export function configureFilter(word: string, rule: MedalRule) {
    keyword = word;
    medalRule = rule;
}
function checkForKeywords(content: string, userName: string, uid: number, medal: FanMedal | null, guardLevel: GuardLevel | null) {
    if (isEligible(content, keyword, medal, medalRule, currentAnchorUid)) {
        sendMsgToRenderer('add_user', {name: userName, uid, medal, guardLevel, hasRoomMedal: currentAnchorUid>0 && medal?.anchorUid===currentAnchorUid});
    }
}

let activeSocket: WebSocket | null = null;
let generation = 0;
let authenticated = false;
export function stopWebSocket() {
    generation++;
    authenticated = false;
    const old = activeSocket;
    activeSocket = null;
    if (old) old.terminate();
}

// Cancellation also covers requests still resolving the room/server.
export async function startWebSocket(shortId: string) {
    stopWebSocket();
    const current = generation;
    const roomId = await getRoomId(shortId);
    if (current !== generation) return;
    const danmuInfo = await getDanmuInfo(roomId);
    if (current !== generation) return;
    const server = danmuInfo.host_list[0];
    const ws = new WebSocket(`wss://${server.host}:${server.wss_port}/sub`, {
        handshakeTimeout: 15000,
        headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36'},
    });
    activeSocket = ws;
    const fail = (message: string) => {
        if (activeSocket !== ws) return;
        stopWebSocket();
        sendConnectionState('stopped', message);
    };
    const authTimeout = setTimeout(() => fail('弹幕服务器认证超时，请重新登录后重试'), 15000);
    const onAuth = (data: {code?: number}) => {
        if (activeSocket !== ws) return;
        clearTimeout(authTimeout);
        if (data.code !== 0) { fail('弹幕服务器认证失败，请重新登录'); return; }
        authenticated = true;
        sendConnectionState('connected');
        ws.send(generateHeartbeat());
    };
    danmuExtractor.on('AuthData', onAuth);
    ws.on('open', () => {
        if (activeSocket === ws) sendCertificate(ws, roomId, danmuInfo.token, getUid(), getBuvid3());
    });
    ws.on('message', data => {
        if (activeSocket === ws) handleWebSocketMessages(ws, data);
    });
    ws.on('error', () => fail('弹幕连接失败，请检查网络后重新获取'));
    const heartbeat = setInterval(() => {
        if (activeSocket === ws && ws.readyState === WebSocket.OPEN) ws.send(generateHeartbeat());
    }, 10000);
    ws.on('close', () => {
        clearInterval(heartbeat);
        clearTimeout(authTimeout);
        danmuExtractor.removeListener('AuthData', onAuth);
        if (activeSocket === ws) {
            activeSocket = null;
            authenticated = false;
            sendConnectionState('stopped', '弹幕连接已断开，请重新获取');
        }
    });
}
