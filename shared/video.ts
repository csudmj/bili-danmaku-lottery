export interface VideoPart {cid:number;page:number;title:string}
export interface VideoInfo {bvid:string;title:string;ownerUid:number;parts:VideoPart[]}
export interface VideoDanmu {id:string;uid:number;name:string;content:string;cid:number}
export type VideoProgress = {part:number;parts:number;page:number;received:number;total:number};
export function videoBvid(value:unknown):string {
    if(typeof value!=='string')throw Error('请输入 BV 号或 B 站视频链接');
    const text=value.trim();
    if(/^BV[0-9A-Za-z]{10}$/.test(text))return text;
    try {const url=new URL(text);if(url.protocol==='https:'&&['www.bilibili.com','bilibili.com'].includes(url.hostname)){
        const match=url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/);if(match)return match[1];
    }}catch{/* Validate below. */}
    throw Error('请使用完整 BV 号或 https://www.bilibili.com/video/BV… 链接');
}
