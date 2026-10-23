export interface VideoPart {cid:number;page:number;title:string}
export interface VideoInfo {bvid:string;title:string;ownerUid:number;aid?:number;parts:VideoPart[]}
export interface VideoDanmu {id:string;uid:number;name:string;content:string;cid:number;ctime?:number}
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

export type VideoSource = 'danmu' | 'comments';
export interface TimeRange {start:number|null;end:number|null}
export function parseTimeRange(value:unknown):TimeRange {
 const v=value as {start?:unknown;end?:unknown}|undefined;
 const parse=(x:unknown)=>{if(x===undefined||x===null||x==='')return null;if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0)throw Error('时间范围无效，请重新选择日期时间');return x;};
 const start=parse(v?.start),end=parse(v?.end);
 if(start!==null&&end!==null&&start>end)throw Error('起始时间不能晚于结束时间');
 return {start,end};
}
export function matchesTime(ctime:number|undefined,range:TimeRange,cutoff:number):boolean {
 if(!Number.isSafeInteger(ctime)||ctime! <= 0)throw Error('平台未提供可靠的发送时间，本次不能生成名单');
 return ctime! >= (range.start??0) && ctime! <= (range.end??cutoff);
}

export function commentRoot(value:unknown):string {
 if(typeof value!=='string')throw Error('请填写主评论 ID 或评论链接');
 const text=value.trim();if(/^[1-9]\d{0,24}$/.test(text))return text;
 try{const url=new URL(text);if(url.protocol==='https:'&&['www.bilibili.com','bilibili.com'].includes(url.hostname)){
  const id=url.searchParams.get('root_id')||url.searchParams.get('comment_root_id')||url.searchParams.get('rpid')||url.hash.match(/^#reply(\d+)$/)?.[1];
  if(id&&/^[1-9]\d{0,24}$/.test(id))return id;
 }}catch{/* Invalid URLs are rejected below. */}
 throw Error('链接中没有主评论 ID；请填写主评论的数字 ID 或包含 root_id / #reply 的链接');
}
