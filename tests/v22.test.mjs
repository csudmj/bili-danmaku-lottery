import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadVideoComments,loadCommentThread,signCommentQuery} from '../electron/comment-source.ts';
import {VideoLottery} from '../electron/video-lottery.ts';
import {parseTimeRange,matchesTime,commentRoot} from '../shared/video.ts';
import {EventEmitter} from 'node:events';
import {UpdateController} from '../electron/update-controller.ts';
const info={bvid:'BV1Na4Q64Eos',title:'视频',aid:99,ownerUid:1,parts:[{cid:2,page:1,title:'P1'}]};
const signal=()=>new AbortController().signal;
const row=(id,uid=id,root=0,ctime=100)=>({rpid_str:String(id),mid:uid,oid:99,root_str:String(root),member:{mid:String(uid),uname:'观众'+uid},content:{message:'参与'},ctime,rcount:0});
const nav={code:0,data:{wbi_img:{img_url:'https://i.test/'+'a'.repeat(32)+'.png',sub_url:'https://i.test/'+'b'.repeat(32)+'.png'}}};
const main=(rows,end=true,next='next')=>({code:0,data:{replies:rows,cursor:{is_end:end,pagination_reply:{next_offset:next}},control:{web_selection:false}}});
test('time range bounds are inclusive, blank endpoints and invalid timestamps are explicit',()=>{
 assert.deepEqual(parseTimeRange(),{start:null,end:null});
 assert.equal(matchesTime(100,{start:100,end:100},200),true);
 assert.equal(matchesTime(201,{start:null,end:null},200),false);
 assert.equal(matchesTime(99,{start:100,end:null},200),false);
 assert.throws(()=>matchesTime(undefined,{start:null,end:null},200));
 for(const value of [{start:5,end:4},{start:NaN},{end:'100'}])assert.throws(()=>parseTimeRange(value));
 assert.equal(commentRoot('https://www.bilibili.com/video/BV1Na4Q64Eos/#reply90071992547409999'),'90071992547409999');
 assert.equal(commentRoot('https://www.bilibili.com/video/BV1Na4Q64Eos/?root_id=55'),'55');
 assert.throws(()=>commentRoot('https://evil.test/?root_id=55'));
 assert.equal(signCommentQuery({oid:'99'},'a'.repeat(32),'b'.repeat(32),1),signCommentQuery({oid:'99'},'a'.repeat(32),'b'.repeat(32),1));
});
test('comments paginate, deduplicate pinned roots and optionally collect every nested reply',async()=>{
 let rootCalls=0,childCalls=0;
 const request=async url=>{
  if(url.includes('/nav'))return nav;
  if(url.includes('/reply/reply')){childCalls++;return {code:0,data:{page:{num:1,count:1},replies:[row(11,4,1)]}};}
  rootCalls++;if(rootCalls===1){const r=main([{...row(1),rcount:1}],false);r.data.top_replies=[row(1)];return r;}
  assert.ok(new URL(url).searchParams.get('pagination_str').includes('next'));return main([row(2)]);
 };
 let rows=await loadVideoComments(info,false,request,signal());assert.deepEqual(rows.map(r=>r.id),['1','2']);assert.equal(childCalls,0);
 rootCalls=0;rows=await loadVideoComments(info,true,request,signal());assert.deepEqual(rows.map(r=>r.id),['1','11','2']);assert.equal(childCalls,1);
});
test('specified thread includes replies only and rejects foreign parents and page drift',async()=>{
 const request=async url=>{const p=Number(new URL(url).searchParams.get('pn'));return {code:0,data:{root:row(1),page:{num:p,count:2},replies:[row(10+p,5+p,1)]}};};
 assert.deepEqual((await loadCommentThread(info,'1',request,signal())).map(r=>r.id),['11','12']);
 await assert.rejects(loadCommentThread(info,'3',request,signal()),/主评论/);
 await assert.rejects(loadCommentThread(info,'1',async url=>{const r=await request(url);if(new URL(url).searchParams.get('pn')==='2')r.data.page.count=3;return r;},signal()),/变化/);
});
test('comment errors, incomplete cursor and unreliable identity never become a usable pool',async()=>{
 for(const payload of [{code:-352},main([{...row(1),mid:0}]),main([],false),{code:0,data:{replies:[],cursor:{}}}]){
  await assert.rejects(loadVideoComments(info,false,async url=>url.includes('/nav')?nav:payload,signal()));
 }
});
test('public comments use real UID weights, refresh at draw preserves removals/manual weights, and explicit end freezes list',async()=>{
 let rows=[row(1,10),row(2,11),row(3,12)],calls=0;
 const request=async url=>{
  if(url.includes('/view?'))return {code:0,data:{title:info.title,aid:99,owner:{mid:999},pages:[{cid:2,page:1,part:'P1'}]}};
  if(url.includes('/nav'))return nav;
  calls++;return main(rows);
 };
 const v=new VideoLottery(request,()=>{});await v.prepare({video:info.bvid,source:'comments'},1);
 await v.collect({keyword:'',cids:[2],range:{start:100,end:null}},1,()=>[{uid:10,name:'',weight:4}]);
 assert.equal(v.snapshot().participants.length,3);assert.equal(v.snapshot().participants[0].weight,4);
 v.pool.setWeight(10,7);v.pool.remove(11);v.pool.draw(1,max=>max-1,()=>{});
 const winner=v.snapshot().winners[0].uid;
 rows.push(row(4,13));await v.refreshForDraw(1,()=>[]);
 assert.ok(!v.snapshot().participants.some(p=>p.uid===11||p.uid===winner));
 assert.ok(v.snapshot().participants.some(p=>p.uid===13));
 if(winner!==10)assert.equal(v.snapshot().participants.find(p=>p.uid===10).weight,7);
 v.reset();await v.prepare({video:info.bvid,source:'comments'},1);await v.collect({keyword:'',cids:[2],range:{start:null,end:100}},1,()=>[]);
 const before=calls;await v.refreshForDraw(1,()=>[]);assert.equal(calls,before);
});
test('draw refresh failure keeps the existing pool and cancel never commits a late response',async()=>{
 let failing=false,resolve,wait=false;
 const request=async url=>{
  if(url.includes('/view?'))return {code:0,data:{title:'x',owner:{mid:1},pages:[{cid:2,page:1,part:'P1'}]}};
  if(failing)throw Error('network');
  if(wait)await new Promise(r=>resolve=r);
  return {code:0,data:{page:{num:1,total:1},result:[{id_str:'1',mid:1,uname:'观众',msg:'hi',oid:2,ctime:100}]}};
 };
 const v=new VideoLottery(request,()=>{});await v.prepare(info.bvid,1);await v.collect({keyword:'',cids:[2]},1,()=>[]);
 failing=true;await assert.rejects(v.refreshForDraw(1,()=>[]));assert.equal(v.snapshot().participants.length,1);assert.equal(v.snapshot().drawNumber,0);
 failing=false;wait=true;const job=v.refreshForDraw(1,()=>[]);v.reset();resolve();await assert.rejects(job);assert.equal(v.snapshot().total,0);
});
test('updater timeout and silent completion restore retry; old versions can accept 2.2.0 directly',async()=>{
 const port=new EventEmitter();port.checkForUpdates=()=>new Promise(()=>{});port.downloadUpdate=async()=>{};port.quitAndInstall=()=>{};
 const c=new UpdateController(port,()=>{},true,10,10);
 await c.check();assert.equal(c.get().status,'error');assert.match(c.get().message,/超时/);
 port.checkForUpdates=async()=>{};await c.check();assert.equal(c.get().status,'error');
 port.checkForUpdates=async()=>port.emit('update-available',{version:'2.2.0'});
 await c.check();assert.equal(c.get().version,'2.2.0');
 await c.download();assert.equal(c.get().status,'error');
 await c.check();port.downloadUpdate=async()=>port.emit('update-downloaded',{version:'2.2.0'});
 await c.download();assert.equal(c.get().status,'downloaded');c.install();
});
