import {videoBvid,type VideoInfo,type VideoDanmu,type VideoProgress} from '../shared/video.ts';
export type VideoRequest=(url:string,signal:AbortSignal)=>Promise<unknown>;
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function dataOf(value:unknown){const response=object(value);if(response.code!==0)throw Error(response.code===-101?'B站登录已失效，请重新登录':'B站拒绝读取，请确认是自己的投稿，或稍后重试');return object(response.data);}
const positive=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
export async function loadVideoInfo(value:unknown,ownerUid:number,request:VideoRequest,signal:AbortSignal):Promise<VideoInfo>{
    const bvid=videoBvid(value),data=dataOf(await request(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,signal));
    if(!positive(ownerUid)||object(data.owner).mid!==ownerUid)throw Error('V2.1.0 仅支持当前登录账号自己投稿的视频');
    if(typeof data.title!=='string'||!Array.isArray(data.pages)||!data.pages.length)throw Error('视频信息不完整，请重试');
    const parts=data.pages.map(value=>{const p=object(value);if(!positive(p.cid)||!positive(p.page)||typeof p.part!=='string')throw Error('视频分P信息异常');return {cid:p.cid as number,page:p.page as number,title:p.part};});
    if(new Set(parts.map(p=>p.cid)).size!==parts.length)throw Error('视频分P信息重复');
    return {bvid,title:data.title,ownerUid,parts};
}
// Contract verified against Bilibili's creator-center frontend (2026-10-22):
// dmSearch -> data.result / data.page; sender -> row.mid / row.uname; content -> row.msg.
// The live creator UI states a 1,000-row ceiling (other code mentions 10,000). Use the conservative limit.
export async function loadVideoDanmu(info:VideoInfo,cids:number[],request:VideoRequest,signal:AbortSignal,onProgress:(p:VideoProgress)=>void=()=>{}):Promise<VideoDanmu[]>{
    if(!cids.length||new Set(cids).size!==cids.length||cids.some(cid=>!info.parts.some(p=>p.cid===cid)))throw Error('请选择有效分P');
    const result:VideoDanmu[]=[],ids=new Set<string>();
    for(let part=0;part<cids.length;part++){
        let expected:number|undefined,received=0;
        for(let page=1;page<=200;page++){
            signal.throwIfAborted();
            const query=new URLSearchParams({oid:String(cids[part]),type:'1',select_type:'0',order:'ctime',sort:'asc',pn:String(page),ps:'50'});
            const data=dataOf(await request(`https://api.bilibili.com/x/v2/dm/search?${query}`,signal));
            const paging=object(data.page),total=paging.total;
            if(!Number.isSafeInteger(total)||(total as number)<0||!Array.isArray(data.result)||paging.num!==page)throw Error('弹幕分页数据不完整，请重新读取');
            if((total as number)>=1000)throw Error('该分P达到平台 1000 条保守读取上限，无法确认完整名单，暂不开放抽奖');
            if(expected!==undefined&&total!==expected)throw Error('读取期间弹幕数量发生变化，请重新读取');
            expected=total as number;
            if(data.result.length>50)throw Error('弹幕分页大小异常');
            for(const value of data.result){
                const row=object(value);
                if(typeof row.id_str!=='string'||!/^\d+$/.test(row.id_str)||!positive(row.mid)||typeof row.uname!=='string'||!row.uname.trim()||row.uname.length>80||typeof row.msg!=='string'||row.msg.length>10000||Number(row.oid)!==cids[part])throw Error('弹幕缺少可靠的昵称、UID 或分P信息，已停止读取');
                const key=`${cids[part]}:${row.id_str}`;
                if(ids.has(key))throw Error('分页中出现重复弹幕，无法确认完整名单，请重新读取');
                ids.add(key);received++;result.push({id:row.id_str,uid:row.mid as number,name:row.uname,content:row.msg,cid:cids[part]});
            }
            onProgress({part:part+1,parts:cids.length,page,received,total:expected});
            if(result.length>100000)throw Error('本次弹幕超过 100000 条，请选择单个分P');
            if(received===expected)break;
            if(received>expected||data.result.length<50||page===200)throw Error('弹幕分页数量不一致，已停止读取');
        }
    }
    return result;
}

