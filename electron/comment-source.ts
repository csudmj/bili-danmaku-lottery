import {createHash} from 'node:crypto';
import type {VideoRequest} from './video-source.ts';
import type {VideoDanmu,VideoInfo,VideoProgress} from '../shared/video.ts';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
const positive=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const mix=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signCommentQuery(params:Record<string,string>,img:string,sub:string,now=Math.floor(Date.now()/1000)) {
 const key=(img+sub);if(key.length!==64)throw Error('评论签名参数异常，请稍后重试');
 const salt=mix.map(i=>key[i]).join('').slice(0,32);
 const values={...params,wts:String(now)};
 const query=Object.keys(values).sort().map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(values[k as keyof typeof values].replace(/[!'()*]/g,''))}`).join('&');
 return `${query}&w_rid=${createHash('md5').update(query+salt).digest('hex')}`;
}
function dataOf(value:unknown){const v=obj(value);if(v.code!==0)throw Error(v.code===12002?'该视频评论区已关闭':v.code===-101?'B站登录已失效，请重新登录':`评论读取失败（${Number(v.code)||'未知错误'}），请检查登录、网络或稍后重试`);return obj(v.data);}
function parse(value:unknown,aid:number):VideoDanmu {
 const r=obj(value),member=obj(r.member),content=obj(r.content),id=r.rpid_str??String(r.rpid),uid=Number(r.mid);
 if(typeof id!=='string'||!/^\d+$/.test(id)||!positive(uid)||Number(member.mid)!==uid||typeof member.uname!=='string'||!member.uname.trim()||typeof content.message!=='string'||!positive(r.ctime)||Number(r.oid)!==aid)throw Error('评论缺少可靠的 UID、昵称、发布时间或视频标识，已停止读取');
 return {id,uid,name:member.uname,content:content.message,cid:aid,ctime:Number(r.ctime)};
}
export async function loadVideoComments(info:VideoInfo,includeReplies:boolean,request:VideoRequest,signal:AbortSignal,onProgress:(p:VideoProgress)=>void=()=>{}):Promise<VideoDanmu[]> {
 if(!positive(info.aid))throw Error('视频缺少评论区标识，请重新读取视频');
 const aid=info.aid!,nav=obj(await request('https://api.bilibili.com/x/web-interface/nav',signal)),wbi=obj(obj(nav.data).wbi_img);
 const extract=(v:unknown)=>{if(typeof v!=='string')throw Error('无法取得评论签名参数，请检查登录');return new URL(v).pathname.split('/').pop()!.split('.')[0];};
 const img=extract(wbi.img_url),sub=extract(wbi.sub_url),rows:VideoDanmu[]=[],seen=new Set<string>(),cursors=new Set<string>();let offset='';
 const add=(raw:unknown)=>{const row=parse(raw,aid);if(seen.has(row.id))return false;seen.add(row.id);rows.push(row);if(rows.length>100000)throw Error('评论超过单轮 100000 条上限，本次不生成名单');return true;};
 for(let page=1;page<=5000;page++){
  signal.throwIfAborted();const query=signCommentQuery({oid:String(aid),type:'1',mode:'2',plat:'1',pagination_str:JSON.stringify({offset})},img,sub);
  const data=dataOf(await request(`https://api.bilibili.com/x/v2/reply/wbi/main?${query}`,signal)),cursor=obj(data.cursor),control=obj(data.control);
  if(typeof cursor.is_end!=='boolean'||(data.replies!==null&&!Array.isArray(data.replies)))throw Error('评论分页不完整，请重新读取');
  if(control.web_selection===true||obj(data.folder).has_folded===true)throw Error('该评论区包含筛选或折叠内容，无法确认完整范围，暂不生成名单');
  const roots=[...(Array.isArray(data.replies)?data.replies:[])];
  if(page===1){const top=obj(data.top);for(const v of [obj(data.upper).top,top.upper,top.admin,...(Array.isArray(data.top_replies)?data.top_replies:[])])if(v)roots.push(v);}
  let fresh=0;
  for(const raw of roots){if(!add(raw))continue;fresh++;const root=obj(raw);const count=Number(root.rcount??root.count??0);
   if(!Number.isSafeInteger(count)||count<0)throw Error('楼中楼数量异常');
   if(includeReplies&&count){
    let received=0,expected:number|undefined;const childIds=new Set<string>();
    for(let n=1;n<=5000;n++){
     signal.throwIfAborted();const child=dataOf(await request(`https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${aid}&root=${parse(raw,aid).id}&pn=${n}&ps=20`,signal)),paging=obj(child.page);
     if(paging.num!==n||!Number.isSafeInteger(paging.count)||(paging.count as number)<0||(child.replies!==null&&!Array.isArray(child.replies)))throw Error('楼中楼分页不完整');
     if(expected!==undefined&&expected!==paging.count)throw Error('读取期间楼中楼数量变化，请重试');expected=paging.count as number;
     const replies=Array.isArray(child.replies)?child.replies:[];
     for(const reply of replies){const r=obj(reply);if(String(r.root_str??r.root)!==parse(raw,aid).id)throw Error('楼中楼所属评论不一致');const id=parse(reply,aid).id;if(childIds.has(id))throw Error('楼中楼分页重复，请重试');childIds.add(id);received++;add(reply);}
     onProgress({part:1,parts:1,page,received:rows.length,total:rows.length});
     if(received===expected)break;
     if(!replies.length||received>expected||n===5000)throw Error('楼中楼未完整读取，本次不生成名单');
    }
   }
  }
  onProgress({part:1,parts:1,page,received:rows.length,total:Number(cursor.all_count)||rows.length});
  if(cursor.is_end){if(!rows.length&&Number(cursor.all_count)>0)throw Error('评论区数量与返回列表不一致，请重试');return rows;}
  const next=obj(cursor.pagination_reply).next_offset;
  if(!fresh||typeof next!=='string'||!next||cursors.has(next)||page===5000)throw Error('评论游标未前进或达到读取上限，本次不生成名单');
  cursors.add(next);offset=next;
 }
 throw Error('评论未完整读取');
}

export async function loadCommentThread(info:VideoInfo,root:string,request:VideoRequest,signal:AbortSignal,onProgress:(p:VideoProgress)=>void=()=>{}):Promise<VideoDanmu[]> {
 if(!positive(info.aid)||!/^[1-9]\d{0,24}$/.test(root))throw Error('视频或主评论标识无效');
 const aid=info.aid!,rows:VideoDanmu[]=[],ids=new Set<string>();let expected:number|undefined;
 for(let page=1;page<=5000;page++){
  signal.throwIfAborted();const data=dataOf(await request(`https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${aid}&root=${root}&pn=${page}&ps=20`,signal)),paging=obj(data.page);
  // Validate the selected parent belongs to this video's comment area.
  if(parse(data.root,aid).id!==root)throw Error('指定主评论不属于该视频，或已删除 / 不可访问');
  if(paging.num!==page||!Number.isSafeInteger(paging.count)||(paging.count as number)<0||(data.replies!==null&&!Array.isArray(data.replies)))throw Error('楼中楼分页数据不完整');
  if(expected!==undefined&&paging.count!==expected)throw Error('读取期间回复数量发生变化，请重试');expected=paging.count as number;
  if(expected>100000)throw Error('楼中楼超过单轮 100000 条上限');
  const replies=Array.isArray(data.replies)?data.replies:[];
  for(const raw of replies){const r=obj(raw),row=parse(raw,aid);if(String(r.root_str??r.root)!==root||ids.has(row.id))throw Error('回复所属评论不一致或分页重复');ids.add(row.id);rows.push(row);}
  onProgress({part:1,parts:1,page,received:rows.length,total:expected});
  if(rows.length===expected)return rows;
  if(!replies.length||rows.length>expected)throw Error('回复列表未完整读取');
 }
 throw Error('回复分页达到上限，本次不生成名单');
}
